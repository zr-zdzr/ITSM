/* employees.js */
const EmployeesModule = (() => {
  let state = { query:'', dept:'', page:1, perPage:10 };

  const DEPARTMENTS = ['IT','Development','HR','Finance','Operations','Marketing','Support','Management','Other'];
  const ROLES = ['IT Manager','IT Staff','Senior Developer','Frontend Dev','Backend Dev','HR Manager','Finance Analyst','Ops Lead','Marketing Lead','Support Engineer','Manager','Viewer','Other'];

  function filtered() {
    let rows = DB.employees.all();
    if (state.query) rows = Utils.filterRows(rows, state.query, ['name','email','department','role','phone']);
    if (state.dept)  rows = rows.filter(r => r.department === state.dept);
    return rows;
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>👤 Employees</h2><p>Manage staff and their assigned assets</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="emp-import-btn">📥 Import CSV</button>
      <button class="btn btn-secondary" id="emp-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="emp-add-btn">＋ Add Employee</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="emp-search" type="text" placeholder="Search employees…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="emp-dept-filter">
      <option value="">All Departments</option>
      ${DEPARTMENTS.map(d=>`<option value="${d}" ${state.dept===d?'selected':''}>${d}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table>
      <thead><tr>
        <th>Employee</th><th>Department</th><th>Role</th>
        <th>Contact</th><th>Assets Assigned</th><th>Actions</th>
      </tr></thead>
      <tbody id="emp-tbody"></tbody>
    </table>
  </div>
  <div id="emp-pagination"></div>
</div>`;
    renderTable();
    document.getElementById('emp-search').addEventListener('input', e => { state.query=e.target.value; state.page=1; renderTable(); });
    document.getElementById('emp-dept-filter').addEventListener('change', e => { state.dept=e.target.value; state.page=1; renderTable(); });
    document.getElementById('emp-add-btn').addEventListener('click', openAdd);
    document.getElementById('emp-import-btn').addEventListener('click', () => ImportModule.openImport('employee'));
    document.getElementById('emp-export-btn').addEventListener('click', exportData);
    const badge = document.getElementById('badge-employees');
    if (badge) badge.textContent = DB.employees.all().length;
  }

  function renderTable() {
    const rows  = filtered();
    const paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('emp-tbody');
    if (!tbody) return;
    const allAssets = DB.assets.all();
    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">👤</div><h3>No employees found</h3><p>Add your first employee to get started</p><button class="btn btn-primary" id="empty-add-e">＋ Add Employee</button></div></td></tr>`;
      setTimeout(()=>document.getElementById('empty-add-e')?.addEventListener('click',openAdd),50);
      return;
    }
    const deptColors = { IT:'primary', Development:'accent', HR:'success', Finance:'info', Operations:'warning', Marketing:'danger', Support:'warning', Management:'primary', Other:'muted' };
    tbody.innerHTML = paged.rows.map(e => {
      const cnt   = allAssets.filter(a=>a.assignedTo===e.id).length;
      const color = deptColors[e.department]||'muted';
      const initials = e.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;border-radius:10px;background:var(--primary-dim);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:var(--primary-light);flex-shrink:0">${initials}</div>
            <div>
              <div style="font-weight:600">${Utils.esc(e.name)}</div>
              <div class="text-xs text-muted">${Utils.esc(e.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="badge badge-${color}">${Utils.esc(e.department)}</span></td>
        <td><span class="text-sm">${Utils.esc(e.role)||'—'}</span></td>
        <td><span class="td-mono">${Utils.esc(e.phone)||'—'}</span></td>
        <td>
          ${cnt>0
            ? `<span class="badge badge-success">📦 ${cnt} asset${cnt!==1?'s':''}</span>`
            : `<span class="badge badge-muted">No assets</span>`}
        </td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="EmployeesModule.openView(${e.id})">👁</button>
          <button class="btn btn-secondary btn-sm" onclick="EmployeesModule.openEdit(${e.id})">✏️</button>
          <button class="btn btn-danger    btn-sm" onclick="EmployeesModule.deleteEmployee(${e.id})">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
    Utils.renderPagination(document.getElementById('emp-pagination'), paged, state.perPage, p=>{ state.page=p; renderTable(); });
  }

  function empForm(data={}) {
    return `<div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label required">Full Name</label><input class="form-control" id="ef-name" placeholder="John Smith" value="${Utils.esc(data.name||'')}"/></div>
      <div class="form-group"><label class="form-label required">Email</label><input class="form-control" id="ef-email" type="email" placeholder="john@company.com" value="${Utils.esc(data.email||'')}"/></div>
      <div class="form-group"><label class="form-label required">Department</label>
        <select class="form-control" id="ef-dept">
          ${DEPARTMENTS.map(d=>`<option value="${d}" ${data.department===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Role / Job Title</label>
        <select class="form-control" id="ef-role">
          <option value="">— Select Role —</option>
          ${ROLES.map(r=>`<option value="${r}" ${data.role===r?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="ef-phone" placeholder="+92-321-0000000" value="${Utils.esc(data.phone||'')}"/></div>
    </div>`;
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value||'';
    return { name:v('ef-name'), email:v('ef-email'), department:v('ef-dept'), role:v('ef-role'), phone:v('ef-phone') };
  }

  function openAdd() {
    Utils.openModal({ title:'➕ Add Employee', body:empForm({ department:'IT' }), footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Employee</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const d = collectForm();
        if (!d.name || !d.email) { Utils.toast('Name and Email are required','error'); return; }
        DB.employees.insert(d);
        DB.activity.log('added','Employee',`New employee: ${d.name} (${d.department})`);
        Utils.closeModal(); Utils.toast('Employee added','success'); renderTable();
        const badge = document.getElementById('badge-employees');
        if (badge) badge.textContent = DB.employees.all().length;
      };
    },50);
  }

  function openEdit(id) {
    const e = DB.employees.byId(id); if(!e) return;
    Utils.openModal({ title:`✏️ Edit ${e.name}`, body:empForm(e), footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Changes</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const d = collectForm();
        if (!d.name) { Utils.toast('Name is required','error'); return; }
        DB.employees.update(id,d);
        Utils.closeModal(); Utils.toast('Employee updated','success'); renderTable();
      };
    },50);
  }

  function openView(id) {
    const e = DB.employees.byId(id); if(!e) return;
    const myAssets = DB.assets.all().filter(a=>a.assignedTo===id);
    const initials = e.name.split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
    Utils.openModal({
      title: `👤 ${e.name}`,
      body:`
<div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;padding:20px;background:var(--bg-elevated);border-radius:var(--radius-lg)">
  <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,var(--primary),var(--accent));display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800">${initials}</div>
  <div>
    <div style="font-size:20px;font-weight:700">${Utils.esc(e.name)}</div>
    <div style="color:var(--text-muted);margin-top:4px">${Utils.esc(e.role||'')} · ${Utils.esc(e.department)}</div>
    <div style="color:var(--text-muted);font-size:12px;margin-top:2px">${Utils.esc(e.email)}</div>
  </div>
</div>
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value mono">${Utils.esc(e.phone)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Total Assets</div><div class="detail-value">${myAssets.length} assigned</div></div>
</div>
<div class="detail-section">
  <div class="detail-section-title">📦 Assigned Assets (${myAssets.length})</div>
  ${myAssets.length
    ? `<div class="table-wrapper" style="margin-top:12px"><table><thead><tr><th>Tag</th><th>Category</th><th>Brand/Model</th><th>Status</th><th>Warranty</th></tr></thead><tbody>
        ${myAssets.map(a=>`<tr>
          <td class="td-mono">${Utils.esc(a.assetTag)}</td>
          <td>${Utils.categoryBadge(a.category)}</td>
          <td>${Utils.esc(a.brand)} ${Utils.esc(a.model)}</td>
          <td>${Utils.statusBadge(a.status)}</td>
          <td>${Utils.warrantyBadge(a.warrantyExpiry)}</td>
        </tr>`).join('')}
      </tbody></table></div>`
    : '<p class="text-muted text-sm" style="margin-top:8px">No assets currently assigned</p>'}
</div>`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button><button class="btn btn-primary" onclick="EmployeesModule.openEdit(${id})">✏️ Edit</button>`
    });
    setTimeout(()=>{ document.getElementById('mc').onclick = Utils.closeModal; },50);
  }

  function deleteEmployee(id) {
    const e = DB.employees.byId(id); if(!e) return;
    const cnt = DB.assets.all().filter(a=>a.assignedTo===id).length;
    Utils.confirm(`Delete employee "${e.name}"?${cnt>0?` They have ${cnt} asset(s) assigned.`:''}`, () => {
      DB.employees.remove(id);
      Utils.toast('Employee deleted','success');
      renderTable();
      const badge = document.getElementById('badge-employees');
      if (badge) badge.textContent = DB.employees.all().length;
    });
  }

  function exportData() {
    const allAssets = DB.assets.all();
    Utils.exportCSV(filtered(),'employees.csv',[
      {label:'Name',key:'name'},{label:'Email',key:'email'},
      {label:'Department',key:'department'},{label:'Role',key:'role'},
      {label:'Phone',key:'phone'},
      {label:'Assets Assigned',key:'id',render:r=>allAssets.filter(a=>a.assignedTo===r.id).length},
    ]);
  }

  return { render, openView, openEdit, deleteEmployee };
})();
