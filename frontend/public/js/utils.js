/* utils.js — Shared helpers */
const Utils = (() => {
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 864e5);
  }

  function warrantyBadge(dateStr) {
    const days = daysUntil(dateStr);
    if (days === null) return '<span class="badge badge-muted">—</span>';
    if (days < 0)     return `<span class="badge badge-danger">Expired</span>`;
    if (days <= 30)   return `<span class="badge badge-danger">${days}d left</span>`;
    if (days <= 90)   return `<span class="badge badge-warning">${days}d left</span>`;
    return `<span class="badge badge-success">${fmtDate(dateStr)}</span>`;
  }

  function statusBadge(status) {
    const map = {
      in_use:'badge-success', available:'badge-info', repair:'badge-warning', retired:'badge-muted',
      active:'badge-success', inactive:'badge-muted', suspended:'badge-warning',
      'In Use':'badge-success', 'Available':'badge-info', 'Repair':'badge-warning', 'Retired':'badge-muted',
    };
    return `<span class="badge ${map[status]||'badge-muted'}">${(status||'—').replace(/_/g,' ')}</span>`;
  }

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function toast(msg, type = 'info') {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${esc(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 350); }, 3500);
  }

  function openModal({ title, body, footer, size }) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title || '';
    document.getElementById('modal-body').innerHTML    = body  || '';
    document.getElementById('modal-footer').innerHTML  = footer || '';
    modal.classList.toggle('sm', size === 'sm');
    modal.classList.toggle('lg', size === 'lg');
    overlay.classList.add('open');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.getElementById('modal-body').innerHTML   = '';
    document.getElementById('modal-footer').innerHTML = '';
  }

  function confirm(msg, onYes) {
    openModal({
      title: 'Confirm Action', size: 'sm',
      body:  `<p style="color:var(--text-secondary);font-size:14px;line-height:1.6">${esc(msg)}</p>`,
      footer:`<button class="btn btn-secondary" id="conf-no">Cancel</button>
              <button class="btn btn-danger" id="conf-yes">Confirm</button>`
    });
    setTimeout(() => {
      document.getElementById('conf-no').onclick  = closeModal;
      document.getElementById('conf-yes').onclick = () => { closeModal(); onYes(); };
    }, 50);
  }

  // Password-confirmed delete all modal
  function confirmDeleteAll(entityName, onConfirm) {
    openModal({
      title: `⚠️ Delete All ${entityName}`, size: 'sm',
      body: `
<div style="color:var(--danger);background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius);padding:12px;margin-bottom:16px;font-size:13px;line-height:1.5">
  <strong>Warning:</strong> This will permanently delete ALL ${entityName} records. This cannot be undone.
</div>
<div class="form-group">
  <label class="form-label required">Enter your password to confirm</label>
  <input class="form-control" type="password" id="del-all-pass" placeholder="Your current password" autocomplete="current-password"/>
</div>`,
      footer: `<button class="btn btn-secondary" id="da-no">Cancel</button>
               <button class="btn btn-danger" id="da-yes">Delete All</button>`
    });
    setTimeout(() => {
      const go = () => {
        const pass = document.getElementById('del-all-pass')?.value;
        if (!pass) return toast('Password is required', 'error');
        closeModal();
        onConfirm(pass);
      };
      document.getElementById('da-no').onclick  = closeModal;
      document.getElementById('da-yes').onclick = go;
      document.getElementById('del-all-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    }, 50);
  }

  // Sort helpers
  function sortIcon(col, sortCol, sortDir) {
    if (col !== sortCol) return ' <span style="opacity:0.25;font-size:10px;vertical-align:middle">⇅</span>';
    return sortDir === 'asc'
      ? ' <span style="font-size:10px;vertical-align:middle;color:var(--primary)">▲</span>'
      : ' <span style="font-size:10px;vertical-align:middle;color:var(--primary)">▼</span>';
  }

  function sortRows(rows, col, dir) {
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      let av = a[col] ?? '', bv = b[col] ?? '';
      if (typeof av === 'number' && typeof bv === 'number')
        return dir === 'asc' ? av - bv : bv - av;
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      const ad = Date.parse(av), bd = Date.parse(bv);
      if (!isNaN(ad) && !isNaN(bd))
        return dir === 'asc' ? ad - bd : bd - ad;
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  function paginate(rows, page, perPage) {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const p     = Math.min(Math.max(1, page), pages);
    const start = (p - 1) * perPage;
    return { rows: rows.slice(start, start + perPage), page: p, pages, total, start };
  }

  const PER_PAGE_OPTS = [15, 50, 100, 150, 200];

  function renderPagination(container, { page, pages, total, start }, perPage, onChange) {
    if (!container) return;
    const end = Math.min(start + perPage, total);
    let html = `<div class="pagination-info">Showing ${total===0?0:start+1}–${end} of ${total}</div>`;
    html += `<div class="pagination-controls">`;
    html += `<button class="page-btn" ${page<=1?'disabled':''} data-p="${page-1}">‹</button>`;
    for (let i=1;i<=pages;i++) {
      if (pages<=7||Math.abs(i-page)<=2||i===1||i===pages) html+=`<button class="page-btn ${i===page?'active':''}" data-p="${i}">${i}</button>`;
      else if (Math.abs(i-page)===3) html+=`<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
    }
    html += `<button class="page-btn" ${page>=pages?'disabled':''} data-p="${page+1}">›</button></div>`;
    html += `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted)">
      <span>Rows:</span>
      <select class="filter-select pp-sel" style="padding:4px 28px 4px 8px;font-size:12px;height:30px">
        ${PER_PAGE_OPTS.map(n=>`<option value="${n}" ${n===perPage?'selected':''}>${n}</option>`).join('')}
      </select>
    </div>`;
    container.innerHTML = html;
    container.querySelectorAll('.page-btn:not([disabled])').forEach(btn =>
      btn.addEventListener('click', () => onChange(+btn.dataset.p, perPage)));
    const sel = container.querySelector('.pp-sel');
    if (sel) sel.addEventListener('change', () => onChange(1, +sel.value));
  }

  function roleBadge(role) {
    const map    = { super_admin:'badge-danger', user:'badge-warning', viewer:'badge-info' };
    const labels = { super_admin:'Super Admin',  user:'User',          viewer:'Viewer'     };
    return `<span class="badge ${map[role]||'badge-muted'}">${labels[role]||role}</span>`;
  }

  // Import modal helper
  function openImportModal(title, endpoint, fields) {
    const fieldRows = fields.map(f => `<tr><td class="td-mono">${f.key}</td><td>${f.desc}</td></tr>`).join('');
    openModal({
      title: `📥 Import ${title}`,
      size: 'lg',
      body: `
<div style="margin-bottom:16px">
  <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">Upload a CSV file. First row must be the header. Download the sample file for the correct format.</p>
  <details style="margin-bottom:16px">
    <summary style="cursor:pointer;color:var(--primary);font-size:13px;font-weight:600">View expected columns</summary>
    <div class="table-wrapper" style="margin-top:8px">
      <table><thead><tr><th>Column</th><th>Description</th></tr></thead><tbody>${fieldRows}</tbody></table>
    </div>
  </details>
  <div class="form-group">
    <label class="form-label">Select CSV File</label>
    <input class="form-control" id="import-file" type="file" accept=".csv"/>
  </div>
  <div id="import-result" style="display:none;margin-top:12px"></div>
</div>`,
      footer:`<button class="btn btn-secondary" id="modal-cancel">Close</button>
              <button class="btn btn-secondary" id="sample-dl">📄 Sample CSV</button>
              <button class="btn btn-primary" id="import-submit">Upload & Import</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = closeModal;
      document.getElementById('sample-dl').onclick = () => API.get(endpoint.replace('/import/csv', '/sample/csv'));
      document.getElementById('import-submit').onclick = async () => {
        const file = document.getElementById('import-file').files[0];
        if (!file) { toast('Please select a CSV file', 'warning'); return; }
        try {
          document.getElementById('import-submit').textContent = 'Importing…';
          document.getElementById('import-submit').disabled = true;
          const r = await API.upload(endpoint, file);
          const el = document.getElementById('import-result');
          el.style.display = 'block';
          const errHtml = r.errors && r.errors.length
            ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted)">${r.errors.length} error${r.errors.length!==1?'s':''} (click to view)</summary><ul style="margin:6px 0 0 16px;font-size:11px;color:var(--danger)">${r.errors.slice(0,20).map(e=>`<li>${esc(e)}</li>`).join('')}</ul></details>` : '';
          el.innerHTML = `<div class="badge badge-success">✔ ${r.inserted} imported</div> <div class="badge badge-warning">${r.skipped} skipped</div>${errHtml}`;
          toast(`Imported ${r.inserted} records${r.skipped?' ('+r.skipped+' skipped)':''}`, r.inserted>0?'success':'warning');
        } catch (e) {
          toast(e.message, 'error');
          document.getElementById('import-submit').textContent = 'Upload & Import';
          document.getElementById('import-submit').disabled = false;
        }
      };
    }, 50);
  }

  return {
    fmtDate, daysUntil, warrantyBadge, statusBadge, esc, toast,
    openModal, closeModal, confirm, confirmDeleteAll,
    sortIcon, sortRows,
    paginate, renderPagination, roleBadge, openImportModal,
  };
})();
