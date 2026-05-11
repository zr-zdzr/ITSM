/* gws.js — Cloud IDs */
const GWSModule = (() => {
  let state = { query:'', account_type:'', status:'', page:1, perPage:15, sortCol:'', sortDir:'asc' };
  let allRows = [];

  const STATUSES  = ['active','suspended'];
  const ROLES     = ['Super Admin','Admin','User'];
  const LICENSES  = ['Starter','Standard','Vault','Not Assigned'];
  const ACC_TYPES = [['user','User Account'],['service_account','Service Account']];

  function setSort(col) {
    if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = col; state.sortDir = 'asc'; }
    renderPage();
  }

  async function render() {
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    try { allRows = await API.get('/api/gws'); renderPage(); }
    catch(e) { Utils.toast(e.message,'error'); }
  }

  function filtered() {
    let r = allRows;
    if (state.query)        r = r.filter(row => ['email','display_name','department','designation','org_unit'].some(f => String(row[f]||'').toLowerCase().includes(state.query.toLowerCase())));
    if (state.account_type) r = r.filter(row => row.account_type === state.account_type);
    if (state.status)       r = r.filter(row => row.status === state.status);
    return Utils.sortRows(r, state.sortCol, state.sortDir);
  }

  function si(col) { return Utils.sortIcon(col, state.sortCol, state.sortDir); }

  function renderPage() {
    const canW = App.canPerm('gws','create');
    const canD = App.canPerm('gws','delete');
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>☁️ Cloud IDs</h2><p>Cloud account management</p></div>
    <div class="section-actions">
      ${canD?`<button class="btn btn-danger" id="gws-delete-all">🗑 Delete All</button>`:''}
      ${canW?`<button class="btn btn-secondary" id="gws-import">📥 Import CSV</button>`:''}
      <button class="btn btn-secondary" id="gws-export">⬇ Export CSV</button>
      ${canW?`<button class="btn btn-primary" id="gws-add">＋ Add Cloud ID</button>`:''}
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="gws-search" type="text" placeholder="Search email, name, department, org unit…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="gws-type-filter">
      <option value="">All Types</option>
      ${ACC_TYPES.map(([v,l]) => `<option value="${v}" ${state.account_type===v?'selected':''}>${l}</option>`).join('')}
    </select>
    <select class="filter-select" id="gws-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s => `<option value="${s}" ${state.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th style="cursor:pointer" onclick="GWSModule.setSort('email')">Email${si('email')}</th>
      <th style="cursor:pointer" onclick="GWSModule.setSort('display_name')">Display Name${si('display_name')}</th>
      <th style="cursor:pointer" onclick="GWSModule.setSort('org_unit')">Org Unit${si('org_unit')}</th>
      <th style="cursor:pointer" onclick="GWSModule.setSort('account_type')">Type${si('account_type')}</th>
      <th style="cursor:pointer" onclick="GWSModule.setSort('gws_role')">Role${si('gws_role')}</th>
      <th style="cursor:pointer" onclick="GWSModule.setSort('license')">License${si('license')}</th>
      <th style="cursor:pointer" onclick="GWSModule.setSort('status')">Status${si('status')}</th>
      <th>Actions</th>
    </tr></thead><tbody id="gws-tbody"></tbody></table>
  </div>
  <div id="gws-pagination" class="pagination"></div>
</div>`;

    renderTable(canW, canD);
    document.getElementById('gws-search').addEventListener('input', e => { state.query=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('gws-type-filter').addEventListener('change', e => { state.account_type=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('gws-status-filter').addEventListener('change', e => { state.status=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('gws-export').addEventListener('click', () => API.get('/api/gws/export/csv'));
    if (canD) {
      document.getElementById('gws-delete-all').addEventListener('click', () => {
        if (!allRows.length) { Utils.toast('No Cloud IDs to delete','warning'); return; }
        Utils.confirmDeleteAll('Cloud IDs', async (pass) => {
          try {
            const r = await API.del('/api/gws/all', { password: pass });
            allRows = [];
            Utils.toast(`Deleted ${r.deleted} Cloud IDs`, 'success');
            renderTable(canW, canD);
          } catch(e) { Utils.toast(e.message,'error'); }
        });
      });
    }
    if (canW) {
      document.getElementById('gws-add').addEventListener('click', openAdd);
      document.getElementById('gws-import').addEventListener('click', () =>
        Utils.openImportModal('Cloud IDs', '/api/gws/import/csv', [
          { key:'email',        desc:'Cloud email address (required)' },
          { key:'first_name',   desc:'First name (required)' },
          { key:'last_name',    desc:'Last name (required)' },
          { key:'designation',  desc:'Job title' },
          { key:'department',   desc:'Department name' },
          { key:'org_unit',     desc:'Org unit e.g. /Engineering, /IT' },
          { key:'account_type', desc:'user or service_account' },
          { key:'gws_role',     desc:'Super Admin, Admin, User' },
          { key:'license',      desc:'Starter, Standard, Vault or Not Assigned' },
          { key:'status',       desc:'active or suspended' },
        ])
      );
    }
  }

  function renderTable(canW, canD) {
    const rows = filtered(), paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('gws-tbody'); if (!tbody) return;
    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">☁️</div><h3>No Cloud IDs found</h3><p>${allRows.length ? 'Adjust your filters' : 'Click "+ Add Cloud ID" or import a CSV to get started'}</p></div></td></tr>`;
      return;
    }
    const roleColor    = { 'Super Admin':'badge-danger','Admin':'badge-warning','User':'badge-info' };
    const statusColor  = { active:'badge-success', suspended:'badge-danger' };
    const licenseColor = { Starter:'badge-muted', Standard:'badge-primary', Vault:'badge-success', 'Not Assigned':'badge-muted' };

    tbody.innerHTML = paged.rows.map(r => `
      <tr style="${r.status==='suspended'?'opacity:0.6':''}">
        <td><span class="td-mono" style="color:var(--primary);font-size:12px">${Utils.esc(r.email)}</span></td>
        <td>
          <div style="font-weight:500;font-size:13px">${Utils.esc(r.display_name)}</div>
          ${r.designation?`<div class="text-xs text-muted">${Utils.esc(r.designation)}</div>`:''}
        </td>
        <td><span class="text-sm text-muted">${Utils.esc(r.org_unit||'—')}</span></td>
        <td><span class="badge ${r.account_type==='service_account'?'badge-accent':'badge-primary'}">${r.account_type==='service_account'?'Service':'User'}</span></td>
        <td>${r.gws_role?`<span class="badge ${roleColor[r.gws_role]||'badge-muted'}">${Utils.esc(r.gws_role)}</span>`:'<span class="text-muted">—</span>'}</td>
        <td>${r.license?`<span class="badge ${licenseColor[r.license]||'badge-muted'}">${Utils.esc(r.license)}</span>`:'<span class="text-muted">—</span>'}</td>
        <td><span class="badge ${statusColor[r.status]||'badge-muted'}">${r.status.charAt(0).toUpperCase()+r.status.slice(1)}</span></td>
        <td><div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-sm" onclick="GWSModule.openView(${r.id})">👁</button>
          ${canW?`<button class="btn btn-secondary btn-sm" onclick="GWSModule.openEdit(${r.id})">✏️</button>`:''}
          ${canD?`<button class="btn btn-danger btn-sm" onclick="GWSModule.deleteRow(${r.id})">🗑</button>`:''}
        </div></td>
      </tr>`).join('');

    Utils.renderPagination(document.getElementById('gws-pagination'), paged, state.perPage, (p,pp) => { state.page=p; state.perPage=pp; renderTable(canW,canD); });
  }

  function gwsForm(data = {}) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group" style="grid-column:span 2">
    <label class="form-label required">Cloud Email</label>
    <input class="form-control" id="g-email" type="email" placeholder="user@company.com" value="${Utils.esc(data.email||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Display Name</label>
    <input class="form-control" id="g-name" placeholder="Full name" value="${Utils.esc(data.display_name||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Designation</label>
    <input class="form-control" id="g-desig" placeholder="Job title" value="${Utils.esc(data.designation||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Department</label>
    <input class="form-control" id="g-dept" placeholder="Department" value="${Utils.esc(data.department||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Organisational Unit</label>
    <input class="form-control" id="g-ou" placeholder="/Engineering, /IT, /HR…" value="${Utils.esc(data.org_unit||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Account Type</label>
    <select class="form-control" id="g-atype">
      ${ACC_TYPES.map(([v,l]) => `<option value="${v}" ${(data.account_type||'user')===v?'selected':''}>${l}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Role</label>
    <select class="form-control" id="g-role">
      ${ROLES.map(r => `<option value="${r}" ${(data.gws_role||'User')===r?'selected':''}>${r}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">License</label>
    <select class="form-control" id="g-license">
      <option value="">— Select —</option>
      ${LICENSES.map(l => `<option value="${l}" ${data.license===l?'selected':''}>${l}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Status</label>
    <select class="form-control" id="g-status">
      <option value="active"    ${(data.status||'active')==='active'?'selected':''}>Active</option>
      <option value="suspended" ${data.status==='suspended'?'selected':''}>Suspended</option>
    </select>
  </div>
</div>
<div class="form-group" style="margin-top:12px">
  <label class="form-label">Notes</label>
  <textarea class="form-control" id="g-notes" rows="2">${Utils.esc(data.notes||'')}</textarea>
</div>`;
  }

  function collectGWSForm() {
    const v = id => document.getElementById(id)?.value || '';
    return {
      email:        v('g-email'),
      display_name: v('g-name'),
      designation:  v('g-desig') || null,
      department:   v('g-dept')  || null,
      org_unit:     v('g-ou')    || null,
      account_type: v('g-atype'),
      gws_role:     v('g-role'),
      license:      v('g-license') || null,
      status:       v('g-status'),
      notes:        v('g-notes') || null,
    };
  }

  function openAdd() {
    Utils.openModal({
      title: '＋ Add Cloud ID', size: 'lg',
      body: gwsForm({ account_type:'user', status:'active' }),
      footer: `<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>`
    });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        const d = collectGWSForm();
        if (!d.email || !d.display_name) { Utils.toast('Email and display name are required', 'error'); return; }
        try {
          const created = await API.post('/api/gws', d);
          allRows.unshift(created);
          Utils.closeModal(); Utils.toast('Cloud ID added', 'success');
          renderTable(App.canPerm('gws','create'), App.canPerm('gws','delete'));
        } catch(e) { Utils.toast(e.message, 'error'); }
      };
    }, 50);
  }

  async function openEdit(id) {
    const data = allRows.find(r => r.id === id) || await API.get(`/api/gws/${id}`);
    Utils.openModal({
      title: `✏️ Edit — ${Utils.esc(data.email)}`, size: 'lg',
      body: gwsForm(data),
      footer: `<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>`
    });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        try {
          const updated = await API.put(`/api/gws/${id}`, collectGWSForm());
          const idx = allRows.findIndex(r => r.id === id);
          if (idx > -1) allRows[idx] = updated;
          Utils.closeModal(); Utils.toast('Updated', 'success');
          renderTable(App.canPerm('gws','create'), App.canPerm('gws','delete'));
        } catch(e) { Utils.toast(e.message, 'error'); }
      };
    }, 50);
  }

  function openView(id) {
    const r = allRows.find(row => row.id === id); if (!r) return;
    const canW = App.canPerm('gws','update');
    const roleColor   = { 'Super Admin':'badge-danger','Admin':'badge-warning','User':'badge-info' };
    const statusColor = { active:'badge-success', suspended:'badge-warning' };
    const licColor    = { Starter:'badge-muted', Standard:'badge-primary', Vault:'badge-success' };
    Utils.openModal({
      title: `☁️ ${Utils.esc(r.display_name)}`,
      body: `
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value mono" style="color:var(--primary)">${Utils.esc(r.email)}</div></div>
  <div class="detail-item"><div class="detail-label">Display Name</div><div class="detail-value">${Utils.esc(r.display_name)}</div></div>
  <div class="detail-item"><div class="detail-label">Designation</div><div class="detail-value">${Utils.esc(r.designation||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Department</div><div class="detail-value">${Utils.esc(r.department||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Org Unit</div><div class="detail-value mono">${Utils.esc(r.org_unit||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Account Type</div><div class="detail-value"><span class="badge ${r.account_type==='service_account'?'badge-accent':'badge-primary'}">${r.account_type==='service_account'?'Service Account':'User Account'}</span></div></div>
  <div class="detail-item"><div class="detail-label">Role</div><div class="detail-value">${r.gws_role?`<span class="badge ${roleColor[r.gws_role]||'badge-muted'}">${Utils.esc(r.gws_role)}</span>`:'—'}</div></div>
  <div class="detail-item"><div class="detail-label">License</div><div class="detail-value">${r.license?`<span class="badge ${licColor[r.license]||'badge-muted'}">${Utils.esc(r.license)}</span>`:'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value"><span class="badge ${statusColor[r.status]||'badge-muted'}">${r.status}</span></div></div>
</div>
${r.notes?`<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(r.notes)}</div></div>`:''}`,
      footer: `<button class="btn btn-secondary" id="mc">Close</button>${canW?`<button class="btn btn-primary" onclick="GWSModule.openEdit(${id})">✏️ Edit</button>`:''}`
    });
    setTimeout(() => { document.getElementById('mc').onclick = Utils.closeModal; }, 50);
  }

  function deleteRow(id) {
    const r = allRows.find(row => row.id === id);
    Utils.confirm(`Delete Cloud ID ${Utils.esc(r?.email||'')}?`, async () => {
      try {
        await API.del(`/api/gws/${id}`);
        allRows = allRows.filter(row => row.id !== id);
        Utils.toast('Deleted', 'success');
        renderTable(App.canPerm('gws','create'), App.canPerm('gws','delete'));
      } catch(e) { Utils.toast(e.message, 'error'); }
    });
  }

  return { render, openView, openEdit, deleteRow, setSort };
})();
