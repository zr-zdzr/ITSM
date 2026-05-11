/* employees.js — Company Employee Directory */
const EmployeesModule = (() => {
  let allRows = [];
  let state = { query:'', location:'', employment_type:'', status:'active', page:1, perPage:20, sortCol:'', sortDir:'asc' };

  const LOCATIONS = ['Karachi','Lahore','Islamabad','Others'];
  const EMP_TYPES = ['Permanent','Contractual'];

  function fullName(e) { return `${e.first_name} ${e.last_name}`; }

  function setSort(col) {
    if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = col; state.sortDir = 'asc'; }
    renderPage();
  }

  function filtered() {
    let r = allRows;
    if (state.query) r = r.filter(e =>
      [e.first_name, e.last_name, e.email, e.designation, e.department, e.mobile_number]
        .some(f => String(f||'').toLowerCase().includes(state.query.toLowerCase()))
    );
    if (state.location)        r = r.filter(e => e.location === state.location);
    if (state.employment_type) r = r.filter(e => e.employment_type === state.employment_type);
    if (state.status === 'active')   r = r.filter(e => e.is_active);
    if (state.status === 'inactive') r = r.filter(e => !e.is_active);
    return Utils.sortRows(r, state.sortCol, state.sortDir);
  }

  function si(col) { return Utils.sortIcon(col, state.sortCol, state.sortDir); }

  async function render() {
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    try { allRows = await API.get('/api/employees'); renderPage(); }
    catch(e) { Utils.toast(e.message, 'error'); }
  }

  function renderPage() {
    const canW = App.canPerm('employees','create');
    const canD = App.canPerm('employees','delete');
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>👤 Employees</h2><p>Company employee directory</p></div>
    <div class="section-actions">
      ${canD ? `<button class="btn btn-danger" id="emp-delete-all">🗑 Delete All</button>` : ''}
      ${canW ? `<button class="btn btn-secondary" id="emp-import">📥 Import CSV</button>` : ''}
      ${canW ? `<button class="btn btn-secondary" id="emp-update-csv">✏️ Update CSV</button>` : ''}
      <button class="btn btn-secondary" id="emp-export">⬇ Export CSV</button>
      ${canW ? `<button class="btn btn-primary" id="emp-add">＋ Add Employee</button>` : ''}
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="emp-search" type="text" placeholder="Search name, email, designation, department…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="emp-location-filter">
      <option value="">All Locations</option>
      ${LOCATIONS.map(l=>`<option value="${l}" ${state.location===l?'selected':''}>${l}</option>`).join('')}
    </select>
    <select class="filter-select" id="emp-type-filter">
      <option value="">All Types</option>
      ${EMP_TYPES.map(t=>`<option value="${t}" ${state.employment_type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <select class="filter-select" id="emp-status-filter">
      <option value="active"   ${state.status==='active'?'selected':''}>Active</option>
      <option value="inactive" ${state.status==='inactive'?'selected':''}>Inactive</option>
      <option value=""         ${state.status===''?'selected':''}>All</option>
    </select>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th style="cursor:pointer" onclick="EmployeesModule.setSort('first_name')">Name${si('first_name')}</th>
      <th style="cursor:pointer" onclick="EmployeesModule.setSort('email')">Email${si('email')}</th>
      <th style="cursor:pointer" onclick="EmployeesModule.setSort('designation')">Designation${si('designation')}</th>
      <th style="cursor:pointer" onclick="EmployeesModule.setSort('department')">Department${si('department')}</th>
      <th style="cursor:pointer" onclick="EmployeesModule.setSort('mobile_number')">Mobile${si('mobile_number')}</th>
      <th style="cursor:pointer" onclick="EmployeesModule.setSort('location')">Location${si('location')}</th>
      <th style="cursor:pointer" onclick="EmployeesModule.setSort('employment_type')">Type${si('employment_type')}</th>
      <th>Status</th><th>Actions</th>
    </tr></thead><tbody id="emp-tbody"></tbody></table>
  </div>
  <div id="emp-pagination" class="pagination"></div>
</div>`;

    renderTable(canW, canD);

    document.getElementById('emp-search').addEventListener('input', e => { state.query=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('emp-location-filter').addEventListener('change', e => { state.location=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('emp-type-filter').addEventListener('change', e => { state.employment_type=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('emp-status-filter').addEventListener('change', e => { state.status=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('emp-export').addEventListener('click', () => API.get('/api/employees/export/csv'));

    if (canD) {
      document.getElementById('emp-delete-all').addEventListener('click', () => {
        if (!allRows.length) { Utils.toast('No employees to delete', 'warning'); return; }
        Utils.confirmDeleteAll('Employees', async (pass) => {
          try {
            const r = await API.del('/api/employees/all', { password: pass });
            allRows = [];
            Utils.toast(`Deleted ${r.deleted} employees`, 'success');
            renderTable(canW, canD);
          } catch(err) { Utils.toast(err.message, 'error'); }
        });
      });
    }

    if (canW) {
      document.getElementById('emp-update-csv').addEventListener('click', openUpdateModal);
      document.getElementById('emp-add').addEventListener('click', openAdd);
      document.getElementById('emp-import').addEventListener('click', () =>
        Utils.openImportModal('Employees', '/api/employees/import/csv', [
          {key:'first_name',      desc:'First name (required)'},
          {key:'last_name',       desc:'Last name (required)'},
          {key:'email',           desc:'Work email (optional)'},
          {key:'designation',     desc:'Job title (required)'},
          {key:'department',      desc:'Department name (required)'},
          {key:'mobile_number',   desc:'Mobile number e.g. 0321-0000000'},
          {key:'location',        desc:'Karachi, Lahore, Islamabad, Others'},
          {key:'employment_type', desc:'Permanent or Contractual'},
        ])
      );
    }
  }

  function renderTable(canW, canD) {
    const rows = filtered(), paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('emp-tbody'); if (!tbody) return;

    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">👤</div><h3>No employees found</h3><p>${allRows.length ? 'Adjust your filters' : 'Click "+ Add Employee" or import a CSV to get started'}</p></div></td></tr>`;
      return;
    }

    const locColor  = {Karachi:'badge-primary', Lahore:'badge-success', Islamabad:'badge-info', Others:'badge-muted'};
    const typeColor = {Permanent:'badge-success', Contractual:'badge-warning'};

    tbody.innerHTML = paged.rows.map(e => `
      <tr style="${!e.is_active?'opacity:0.55':''}">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--primary-hover));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0">${Utils.esc(e.first_name[0])}${Utils.esc(e.last_name[0])}</div>
            <span style="font-weight:600">${Utils.esc(fullName(e))}</span>
          </div>
        </td>
        <td><span class="td-mono text-sm">${e.email?Utils.esc(e.email):'<span class="text-muted">—</span>'}</span></td>
        <td><span class="text-sm">${Utils.esc(e.designation)}</span></td>
        <td><span class="badge badge-muted">${Utils.esc(e.department)}</span></td>
        <td><span class="text-sm text-muted">${Utils.esc(e.mobile_number||'—')}</span></td>
        <td>${e.location?`<span class="badge ${locColor[e.location]||'badge-muted'}">${Utils.esc(e.location)}</span>`:'<span class="text-muted">—</span>'}</td>
        <td>${e.employment_type?`<span class="badge ${typeColor[e.employment_type]||'badge-muted'}">${Utils.esc(e.employment_type)}</span>`:'<span class="text-muted">—</span>'}</td>
        <td>${e.is_active?'<span class="badge badge-success">Active</span>':'<span class="badge badge-danger">Inactive</span>'}</td>
        <td>
          <div style="display:flex;gap:5px">
            ${canW?`<button class="btn btn-secondary btn-sm" onclick="EmployeesModule.openEdit(${e.id})">✏️</button>`:''}
            ${canD?`<button class="btn btn-danger btn-sm" onclick="EmployeesModule.deleteRow(${e.id})">🗑</button>`:''}
          </div>
        </td>
      </tr>`).join('');

    Utils.renderPagination(document.getElementById('emp-pagination'), paged, state.perPage, (p,pp) => { state.page=p; state.perPage=pp; renderTable(canW,canD); });
  }

  function empForm(data = {}, isEdit = false) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group">
    <label class="form-label required">First Name</label>
    <input class="form-control" id="ef-fname" placeholder="First name" value="${Utils.esc(data.first_name||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Last Name</label>
    <input class="form-control" id="ef-lname" placeholder="Last name" value="${Utils.esc(data.last_name||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Designation</label>
    <input class="form-control" id="ef-desig" placeholder="Software Engineer, Manager…" value="${Utils.esc(data.designation||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Department</label>
    <input class="form-control" id="ef-dept" placeholder="Engineering, HR, Operations…" value="${Utils.esc(data.department||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Email</label>
    <input class="form-control" id="ef-email" type="email" placeholder="name@company.com" value="${Utils.esc(data.email||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Mobile Number</label>
    <input class="form-control" id="ef-mobile" placeholder="0321-0000000" value="${Utils.esc(data.mobile_number||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Location</label>
    <select class="form-control" id="ef-location">
      <option value="">— Select —</option>
      ${LOCATIONS.map(l=>`<option value="${l}" ${data.location===l?'selected':''}>${l}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Employment Type</label>
    <select class="form-control" id="ef-emptype">
      <option value="">— Select —</option>
      ${EMP_TYPES.map(t=>`<option value="${t}" ${data.employment_type===t?'selected':''}>${t}</option>`).join('')}
    </select>
  </div>
  ${isEdit ? `
  <div class="form-group">
    <label class="form-label">Status</label>
    <select class="form-control" id="ef-status">
      <option value="true"  ${data.is_active ?'selected':''}>Active</option>
      <option value="false" ${!data.is_active?'selected':''}>Inactive</option>
    </select>
  </div>` : ''}
</div>`;
  }

  function collectForm(isEdit = false) {
    const v = id => document.getElementById(id)?.value?.trim() || '';
    return {
      first_name:      v('ef-fname'),
      last_name:       v('ef-lname'),
      designation:     v('ef-desig'),
      department:      v('ef-dept'),
      email:           v('ef-email') || null,
      mobile_number:   v('ef-mobile') || null,
      location:        v('ef-location') || null,
      employment_type: v('ef-emptype') || null,
      ...(isEdit ? { is_active: document.getElementById('ef-status')?.value !== 'false' } : {}),
    };
  }

  function validate(d) {
    if (!d.first_name)  return 'First Name is required';
    if (!d.last_name)   return 'Last Name is required';
    if (!d.designation) return 'Designation is required';
    if (!d.department)  return 'Department is required';
    return null;
  }

  function openUpdateModal() {
    Utils.openModal({
      title: '✏️ Bulk Update Employees', size: 'lg',
      body: `
<div>
  <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">
    Upload a CSV to update existing employees. Each row must include <strong>id</strong> or <strong>email</strong> to identify the record.<br>
    <strong>Tip:</strong> Use <em>Export CSV</em> to download the current list, edit it in Excel/Sheets, then upload here.
  </p>
  <div class="form-group">
    <label class="form-label">Select CSV File</label>
    <input class="form-control" id="upd-file" type="file" accept=".csv"/>
  </div>
  <div id="upd-result" style="display:none;margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"></div>
</div>`,
      footer: `<button class="btn btn-secondary" id="upd-cancel">Close</button>
               <button class="btn btn-primary" id="upd-submit">Upload & Update</button>`
    });
    setTimeout(() => {
      document.getElementById('upd-cancel').onclick = Utils.closeModal;
      document.getElementById('upd-submit').onclick = async () => {
        const file = document.getElementById('upd-file').files[0];
        if (!file) { Utils.toast('Please select a CSV file', 'warning'); return; }
        const btn = document.getElementById('upd-submit');
        btn.textContent = 'Updating…'; btn.disabled = true;
        try {
          const r = await API.upload('/api/employees/update/csv', file);
          const el = document.getElementById('upd-result');
          el.style.display = 'flex';
          el.innerHTML = `<span class="badge badge-success">✔ ${r.updated} updated</span>
                          <span class="badge badge-warning">${r.skipped} skipped</span>
                          ${r.errors.length ? `<details style="width:100%;margin-top:6px"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted)">${r.errors.length} error(s)</summary><pre style="font-size:11px;color:var(--text-muted);margin-top:4px;white-space:pre-wrap">${Utils.esc(r.errors.join('\n'))}</pre></details>` : ''}`;
          Utils.toast(`Updated ${r.updated} employees`, 'success');
          if (r.updated > 0) {
            allRows = await API.get('/api/employees');
            renderTable(App.canPerm('employees','create'), App.canPerm('employees','delete'));
          }
        } catch (e) {
          Utils.toast(e.message, 'error');
          btn.textContent = 'Upload & Update'; btn.disabled = false;
        }
      };
    }, 50);
  }

  function openAdd() {
    Utils.openModal({
      title: '➕ Add Employee', size: 'lg',
      body: empForm({}, false),
      footer: `<button class="btn btn-secondary" id="mc">Cancel</button>
               <button class="btn btn-primary" id="ms">Save Employee</button>`
    });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        const d = collectForm(false);
        const err = validate(d); if (err) { Utils.toast(err, 'error'); return; }
        try {
          const created = await API.post('/api/employees', d);
          allRows.unshift(created);
          Utils.closeModal(); Utils.toast('Employee added', 'success');
          renderTable(App.canPerm('employees','create'), App.canPerm('employees','delete'));
        } catch(e) { Utils.toast(e.message, 'error'); }
      };
    }, 50);
  }

  function openEdit(id) {
    const data = allRows.find(e => e.id === id); if (!data) return;
    Utils.openModal({
      title: `✏️ Edit — ${fullName(data)}`, size: 'lg',
      body: empForm(data, true),
      footer: `<button class="btn btn-secondary" id="mc">Cancel</button>
               <button class="btn btn-primary" id="ms">Save Changes</button>`
    });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        const d = collectForm(true);
        const err = validate(d); if (err) { Utils.toast(err, 'error'); return; }
        try {
          const updated = await API.put(`/api/employees/${id}`, d);
          const idx = allRows.findIndex(e => e.id === id);
          if (idx > -1) allRows[idx] = updated;
          Utils.closeModal(); Utils.toast('Employee updated', 'success');
          renderTable(App.canPerm('employees','create'), App.canPerm('employees','delete'));
        } catch(e) { Utils.toast(e.message, 'error'); }
      };
    }, 50);
  }

  function deleteRow(id) {
    const e = allRows.find(r => r.id === id);
    Utils.confirm(`Delete ${fullName(e)}? Their name will be cleared from any assigned assets.`, async () => {
      try {
        await API.del(`/api/employees/${id}`);
        allRows = allRows.filter(r => r.id !== id);
        Utils.toast('Employee deleted', 'success');
        renderTable(App.canPerm('employees','create'), App.canPerm('employees','delete'));
      } catch(err) { Utils.toast(err.message, 'error'); }
    });
  }

  return { render, openEdit, deleteRow, setSort };
})();
