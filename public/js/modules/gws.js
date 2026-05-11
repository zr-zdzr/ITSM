/* gws.js — Google Workspace Accounts */
const GWSModule = (() => {
  let state = { query: '', role: '', status: '', page: 1, perPage: 10 };

  const ROLES    = ['Super Admin', 'Admin', 'User'];
  const STATUSES = ['Active', 'Suspended', 'Deleted'];

  function filtered() {
    let rows = DB.gws.all();
    if (state.query)  rows = Utils.filterRows(rows, state.query, ['googleEmail','displayName','department','orgUnit']);
    if (state.role)   rows = rows.filter(r => r.role   === state.role);
    if (state.status) rows = rows.filter(r => r.status === state.status);
    return rows;
  }

  function gwsBadge(status) {
    const map = { Active:'badge-success', Suspended:'badge-warning', Deleted:'badge-danger' };
    return `<span class="badge ${map[status]||'badge-muted'}">${status||'—'}</span>`;
  }

  function twoFABadge(enabled) {
    return enabled
      ? `<span class="badge badge-success">✔ Enabled</span>`
      : `<span class="badge badge-danger">✘ Disabled</span>`;
  }

  function storagePct(used, limit) {
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  function storageBar(used, limit) {
    const pct = storagePct(used, limit);
    const cls = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success';
    return `
<div style="display:flex;align-items:center;gap:8px">
  <div style="flex:1;height:6px;background:var(--border);border-radius:4px;overflow:hidden">
    <div style="width:${pct}%;height:100%;background:var(--${cls});border-radius:4px"></div>
  </div>
  <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">${used}/${limit} GB</span>
</div>`;
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>📧 GWS Google IDs</h2><p>Google Workspace account management</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="gws-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="gws-add-btn">＋ Add Account</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="gws-search" type="text" placeholder="Search email, name, department…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="gws-role-filter">
      <option value="">All Roles</option>
      ${ROLES.map(r=>`<option value="${r}" ${state.role===r?'selected':''}>${r}</option>`).join('')}
    </select>
    <select class="filter-select" id="gws-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table id="gws-table">
      <thead><tr>
        <th>Google Email</th><th>Display Name</th><th>Role</th>
        <th>Department</th><th>Storage</th><th>2FA</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody id="gws-tbody"></tbody>
    </table>
  </div>
  <div id="gws-pagination"></div>
</div>`;
    renderTable();
    bindEvents();
  }

  function renderTable() {
    const rows  = filtered();
    const paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('gws-tbody');
    if (!tbody) return;

    if (paged.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📧</div><h3>No accounts found</h3><p>Try adjusting your filters or add a new account</p><button class="btn btn-primary" id="empty-add-btn">＋ Add Account</button></div></td></tr>`;
      setTimeout(() => document.getElementById('empty-add-btn')?.addEventListener('click', openAdd), 50);
    } else {
      tbody.innerHTML = paged.rows.map(g => `
        <tr>
          <td><span class="td-mono" style="color:var(--primary)">${Utils.esc(g.googleEmail)}</span></td>
          <td style="font-weight:500">${Utils.esc(g.displayName)}</td>
          <td><span class="badge ${g.role==='Super Admin'?'badge-danger':g.role==='Admin'?'badge-warning':'badge-info'}">${Utils.esc(g.role)}</span></td>
          <td><span class="text-sm text-muted">${Utils.esc(g.department)||'—'}</span></td>
          <td style="min-width:160px">${storageBar(g.storageUsed||0, g.storageLimit||30)}</td>
          <td>${twoFABadge(g.twoFA)}</td>
          <td>${gwsBadge(g.status)}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="GWSModule.openView(${g.id})">👁</button>
              <button class="btn btn-secondary btn-sm" onclick="GWSModule.openEdit(${g.id})">✏️</button>
              <button class="btn btn-danger btn-sm"    onclick="GWSModule.deleteAccount(${g.id})">🗑</button>
            </div>
          </td>
        </tr>`).join('');
    }
    Utils.renderPagination(document.getElementById('gws-pagination'), paged, state.perPage, p => { state.page = p; renderTable(); });
  }

  function bindEvents() {
    document.getElementById('gws-search').addEventListener('input', e => { state.query = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('gws-role-filter').addEventListener('change', e => { state.role = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('gws-status-filter').addEventListener('change', e => { state.status = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('gws-add-btn').addEventListener('click', openAdd);
    document.getElementById('gws-export-btn').addEventListener('click', exportData);
  }

  function getEmpOptions(sel) {
    return `<option value="">— Not linked —</option>` +
      DB.employees.all().map(e => `<option value="${e.id}" ${sel==e.id?'selected':''}>${Utils.esc(e.name)} (${Utils.esc(e.department)})</option>`).join('');
  }

  function gwsForm(data = {}) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group" style="grid-column:span 2">
    <label class="form-label required">Google Email</label>
    <input class="form-control" id="g-email" type="email" placeholder="user@domain.com" value="${Utils.esc(data.googleEmail||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Display Name</label>
    <input class="form-control" id="g-name" placeholder="Full name" value="${Utils.esc(data.displayName||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Role</label>
    <select class="form-control" id="g-role">
      ${ROLES.map(r=>`<option value="${r}" ${(data.role||'User')===r?'selected':''}>${r}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Department</label>
    <input class="form-control" id="g-dept" placeholder="IT, HR, Development…" value="${Utils.esc(data.department||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Org Unit</label>
    <input class="form-control" id="g-ou" placeholder="/IT, /Engineering…" value="${Utils.esc(data.orgUnit||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Linked Employee</label>
    <select class="form-control" id="g-emp">${getEmpOptions(data.employeeId)}</select>
  </div>
  <div class="form-group">
    <label class="form-label">Status</label>
    <select class="form-control" id="g-status">
      ${STATUSES.map(s=>`<option value="${s}" ${(data.status||'Active')===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Storage Used (GB)</label>
    <input class="form-control" id="g-used" type="number" min="0" step="0.1" placeholder="0" value="${data.storageUsed||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Storage Limit (GB)</label>
    <input class="form-control" id="g-limit" type="number" min="0" step="1" placeholder="30" value="${data.storageLimit||30}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Creation Date</label>
    <input class="form-control" id="g-created" type="date" value="${data.creationDate||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Last Login</label>
    <input class="form-control" id="g-lastlogin" type="date" value="${data.lastLogin||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">2FA Status</label>
    <select class="form-control" id="g-2fa">
      <option value="true"  ${data.twoFA===true ?'selected':''}>Enabled</option>
      <option value="false" ${data.twoFA===false?'selected':''}>Disabled</option>
    </select>
  </div>
</div>
<div class="detail-section">
  <div class="form-group">
    <label class="form-label">Notes</label>
    <textarea class="form-control" id="g-notes" placeholder="Additional notes…">${Utils.esc(data.notes||'')}</textarea>
  </div>
</div>`;
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value || '';
    const emp = v('g-emp');
    return {
      googleEmail:  v('g-email'),
      displayName:  v('g-name'),
      role:         v('g-role'),
      department:   v('g-dept'),
      orgUnit:      v('g-ou'),
      employeeId:   emp ? +emp : null,
      status:       v('g-status'),
      storageUsed:  parseFloat(v('g-used')) || 0,
      storageLimit: parseFloat(v('g-limit')) || 30,
      creationDate: v('g-created'),
      lastLogin:    v('g-lastlogin'),
      twoFA:        v('g-2fa') === 'true',
      notes:        v('g-notes'),
    };
  }

  function openAdd() {
    Utils.openModal({
      title: '➕ Add GWS Account',
      body:  gwsForm({ status: 'Active', twoFA: false }),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary"   id="modal-save">Save Account</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm();
        if (!d.googleEmail || !d.displayName) { Utils.toast('Email and Display Name are required', 'error'); return; }
        const row = DB.gws.insert(d);
        DB.activity.log('added', d.googleEmail, `GWS account created: ${d.displayName}`);
        Utils.closeModal();
        Utils.toast(`Account ${d.googleEmail} added`, 'success');
        renderTable();
      };
    }, 50);
  }

  function openEdit(id) {
    const g = DB.gws.byId(id);
    if (!g) return;
    Utils.openModal({
      title: `✏️ Edit ${g.googleEmail}`,
      body:  gwsForm(g),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary"   id="modal-save">Save Changes</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm();
        if (!d.googleEmail || !d.displayName) { Utils.toast('Email and Display Name are required', 'error'); return; }
        DB.gws.update(id, d);
        DB.activity.log('updated', d.googleEmail, `GWS account updated: ${d.displayName}`);
        Utils.closeModal();
        Utils.toast('Account updated', 'success');
        renderTable();
      };
    }, 50);
  }

  function openView(id) {
    const g = DB.gws.byId(id);
    if (!g) return;
    const emp = g.employeeId ? DB.employees.byId(g.employeeId) : null;
    Utils.openModal({
      title: `📧 ${g.googleEmail}`,
      body: `
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Google Email</div><div class="detail-value mono" style="color:var(--primary)">${Utils.esc(g.googleEmail)}</div></div>
  <div class="detail-item"><div class="detail-label">Display Name</div><div class="detail-value">${Utils.esc(g.displayName)}</div></div>
  <div class="detail-item"><div class="detail-label">Role</div><div class="detail-value"><span class="badge ${g.role==='Super Admin'?'badge-danger':g.role==='Admin'?'badge-warning':'badge-info'}">${Utils.esc(g.role)}</span></div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${gwsBadge(g.status)}</div></div>
  <div class="detail-item"><div class="detail-label">Department</div><div class="detail-value">${Utils.esc(g.department)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Org Unit</div><div class="detail-value mono">${Utils.esc(g.orgUnit)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Linked Employee</div><div class="detail-value">${emp ? Utils.esc(emp.name) : '— Not linked —'}</div></div>
  <div class="detail-item"><div class="detail-label">2FA</div><div class="detail-value">${twoFABadge(g.twoFA)}</div></div>
</div>
<div class="detail-section">
  <div class="detail-section-title">💾 Storage</div>
  ${storageBar(g.storageUsed||0, g.storageLimit||30)}
</div>
<div class="detail-section">
  <div class="detail-grid">
    <div class="detail-item"><div class="detail-label">Creation Date</div><div class="detail-value">${Utils.fmtDate(g.creationDate)}</div></div>
    <div class="detail-item"><div class="detail-label">Last Login</div><div class="detail-value">${Utils.fmtDate(g.lastLogin)}</div></div>
  </div>
</div>
${g.notes ? `<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(g.notes)}</div></div>` : ''}`,
      footer:`<button class="btn btn-secondary" id="modal-cancel">Close</button>
              <button class="btn btn-primary" onclick="GWSModule.openEdit(${id});event.stopPropagation()">✏️ Edit</button>`
    });
    setTimeout(() => { document.getElementById('modal-cancel').onclick = Utils.closeModal; }, 50);
  }

  function deleteAccount(id) {
    const g = DB.gws.byId(id);
    if (!g) return;
    Utils.confirm(`Delete GWS account ${g.googleEmail}? This cannot be undone.`, () => {
      DB.gws.remove(id);
      DB.activity.log('deleted', g.googleEmail, `GWS account removed: ${g.displayName}`);
      Utils.toast('Account deleted', 'success');
      renderTable();
    });
  }

  function exportData() {
    Utils.exportCSV(filtered(), 'gws_accounts.csv', [
      { label: 'Google Email',   key: 'googleEmail' },
      { label: 'Display Name',   key: 'displayName' },
      { label: 'Role',           key: 'role' },
      { label: 'Department',     key: 'department' },
      { label: 'Org Unit',       key: 'orgUnit' },
      { label: 'Linked Employee',key: 'employeeId', render: r => Utils.employeeName(r.employeeId) },
      { label: 'Status',         key: 'status' },
      { label: 'Storage Used GB',key: 'storageUsed' },
      { label: 'Storage Limit GB',key: 'storageLimit' },
      { label: '2FA Enabled',    key: 'twoFA', render: r => r.twoFA ? 'Yes' : 'No' },
      { label: 'Creation Date',  key: 'creationDate' },
      { label: 'Last Login',     key: 'lastLogin' },
      { label: 'Notes',          key: 'notes' },
    ]);
  }

  return { render, openView, openEdit, deleteAccount };
})();
