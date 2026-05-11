/* ============================================================
   utils.js — Shared Helpers
   ============================================================ */

const Utils = (() => {

  /* ── DATE HELPERS ── */
  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    return Math.ceil((d - now) / 864e5);
  }

  function warrantyClass(dateStr) {
    const days = daysUntil(dateStr);
    if (days === null) return 'muted';
    if (days < 0)   return 'danger';
    if (days <= 30) return 'danger';
    if (days <= 90) return 'warning';
    return 'success';
  }

  function warrantyBadge(dateStr) {
    const days = daysUntil(dateStr);
    const cls  = warrantyClass(dateStr);
    if (days === null) return '<span class="badge badge-muted">—</span>';
    const label = days < 0 ? 'Expired' : days <= 90 ? `${days}d left` : fmtDate(dateStr);
    const map = { danger:'badge-danger', warning:'badge-warning', success:'badge-success', muted:'badge-muted' };
    return `<span class="badge ${map[cls]}">${label}</span>`;
  }

  function timeAgo(dateStr) {
    const d    = new Date(dateStr);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60)   return 'Just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff/3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff/86400)}d ago`;
    return fmtDate(dateStr);
  }

  /* ── STATUS BADGE ── */
  function statusBadge(status) {
    const map = {
      'In Use':    'badge-success',
      'Available': 'badge-info',
      'Repair':    'badge-warning',
      'Retired':   'badge-muted',
      'Active':    'badge-success',
      'Inactive':  'badge-muted',
    };
    return `<span class="badge ${map[status]||'badge-muted'}">${status||'—'}</span>`;
  }

  /* ── CATEGORY BADGE ── */
  function categoryBadge(cat) {
    const icons = { Laptop:'💻', Desktop:'🖥️', Server:'🗄️', 'Network Device':'🌐', Accessory:'🔌', Other:'📦' };
    return `<span class="badge badge-primary">${icons[cat]||'📦'} ${cat}</span>`;
  }

  /* ── ESCAPE HTML ── */
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  /* ── TOAST ── */
  function toast(msg, type='info') {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => {
      t.classList.add('removing');
      setTimeout(() => t.remove(), 350);
    }, 3500);
  }

  /* ── MODAL HELPERS ── */
  function openModal({ title, body, footer, size }) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title || '';
    document.getElementById('modal-body').innerHTML    = body  || '';
    document.getElementById('modal-footer').innerHTML  = footer || '';
    if (size === 'sm') modal.classList.add('sm'); else modal.classList.remove('sm');
    overlay.classList.add('open');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.getElementById('modal-body').innerHTML   = '';
    document.getElementById('modal-footer').innerHTML = '';
  }

  /* ── CONFIRM DIALOG ── */
  function confirm(msg, onYes) {
    openModal({
      title: 'Confirm Action',
      size:  'sm',
      body:  `<p style="color:var(--text-secondary);font-size:14px;line-height:1.6">${esc(msg)}</p>`,
      footer:`<button class="btn btn-secondary" id="conf-cancel">Cancel</button>
              <button class="btn btn-danger"    id="conf-ok">Confirm</button>`
    });
    setTimeout(() => {
      document.getElementById('conf-cancel').onclick = closeModal;
      document.getElementById('conf-ok').onclick = () => { closeModal(); onYes(); };
    }, 50);
  }

  /* ── CSV EXPORT ── */
  function exportCSV(rows, filename, columns) {
    const header = columns.map(c => `"${c.label}"`).join(',');
    const lines  = rows.map(r =>
      columns.map(c => {
        const v = c.render ? c.render(r) : (r[c.key] ?? '');
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csv  = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} rows to ${filename}`, 'success');
  }

  /* ── SEARCH FILTER ── */
  function filterRows(rows, query, fields) {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(r => fields.some(f => String(r[f]||'').toLowerCase().includes(q)));
  }

  /* ── PAGINATION ── */
  function paginate(rows, page, perPage) {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const p     = Math.min(Math.max(1, page), pages);
    const start = (p-1) * perPage;
    return { rows: rows.slice(start, start+perPage), page:p, pages, total, start };
  }

  function renderPagination(container, {page, pages, total, start}, perPage, onChange) {
    const end = Math.min(start + perPage, total);
    let html = `<div class="pagination-info">Showing ${total===0?0:start+1}–${end} of ${total}</div>
      <div class="pagination-controls">`;
    html += `<button class="page-btn" ${page<=1?'disabled':''} data-p="${page-1}">‹</button>`;
    for (let i=1;i<=pages;i++) {
      if (pages<=7 || Math.abs(i-page)<=2 || i===1 || i===pages) {
        html += `<button class="page-btn ${i===page?'active':''}" data-p="${i}">${i}</button>`;
      } else if (Math.abs(i-page)===3) {
        html += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
      }
    }
    html += `<button class="page-btn" ${page>=pages?'disabled':''} data-p="${page+1}">›</button>`;
    html += `</div>`;
    container.innerHTML = html;
    container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => onChange(+btn.dataset.p));
    });
  }

  /* ── VENDOR NAME LOOKUP ── */
  function vendorName(id) {
    if (!id) return '—';
    const v = DB.vendors.byId(id);
    return v ? v.name : '—';
  }

  function employeeName(id) {
    if (!id) return '—';
    const e = DB.employees.byId(id);
    return e ? e.name : '—';
  }

  return { fmtDate, daysUntil, warrantyClass, warrantyBadge, timeAgo, statusBadge, categoryBadge, esc, toast, openModal, closeModal, confirm, exportCSV, filterRows, paginate, renderPagination, vendorName, employeeName };
})();
