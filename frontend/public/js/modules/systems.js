/* systems.js — Systems module */
const SystemsModule = (() => {
  let state = { query:'', type:'', status:'', sortCol:'', sortDir:'asc', page:1, perPage:15 };
  let allRows = [];

  const TYPES      = ['Laptop','System','Server'];
  const STATUSES   = ['in_use','available','repair','retired'];
  const DISK_TYPES = ['SSD','NVMe','HDD','SATA','M.2'];
  const STATUS_LABELS = { in_use:'In Use', available:'Available', repair:'Repair', retired:'Retired' };
  const TYPE_COLORS   = { Laptop:'badge-primary', System:'badge-accent', Server:'badge-warning' };

  function filtered() {
    let r = allRows;
    if (state.query)  r = r.filter(row => ['serial_number','manufacturer','model','cpu','assigned_user_name','asset_tag','department'].some(f=>String(row[f]||'').toLowerCase().includes(state.query.toLowerCase())));
    if (state.type)   r = r.filter(row => row.type   === state.type);
    if (state.status) r = r.filter(row => row.status === state.status);
    return Utils.sortRows(r, state.sortCol, state.sortDir);
  }

  function setSort(col) {
    if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = col; state.sortDir = 'asc'; }
    state.page = 1;
    renderPage();
  }

  async function render() {
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    try {
      allRows = await API.get('/api/systems');
      document.getElementById('badge-systems').textContent = allRows.length;
      renderPage();
    } catch (e) { Utils.toast(e.message,'error'); }
  }

  function renderPage() {
    const canCreate = App.canPerm('systems','create');
    const canUpdate = App.canPerm('systems','update');
    const canDelete = App.canPerm('systems','delete');
    const canW = canCreate || canUpdate;
    const si = (c) => Utils.sortIcon(c, state.sortCol, state.sortDir);
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>💻 Systems</h2><p>Laptop, desktop and server inventory</p></div>
    <div class="section-actions">
      ${canDelete?`<button class="btn btn-danger" id="sys-del-all">🗑 Delete All</button>`:''}
      ${canCreate?`<button class="btn btn-secondary" id="sys-import-btn">📥 Import CSV</button>`:''}
      <button class="btn btn-secondary" id="sys-export-btn">⬇ Export CSV</button>
      ${canCreate?`<button class="btn btn-primary" id="sys-add-btn">＋ Add System</button>`:''}
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="sys-search" type="text" placeholder="Search tag, serial, model, CPU…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="sys-type-filter">
      <option value="">All Types</option>
      ${TYPES.map(t=>`<option value="${t}" ${state.type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <select class="filter-select" id="sys-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th class="sortable" onclick="SystemsModule.setSort('asset_tag')">Asset Tag${si('asset_tag')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('type')">Type${si('type')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('manufacturer')">Manufacturer / Model${si('manufacturer')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('generation')">Generation${si('generation')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('cpu')">CPU${si('cpu')}</th>
      <th>RAM (Slot 1)</th><th>Disk (Slot 1)</th>
      <th class="sortable" onclick="SystemsModule.setSort('assigned_user_name')">Assigned To${si('assigned_user_name')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('department')">Dept${si('department')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('condition')">Condition${si('condition')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('warranty_expiry')">Warranty${si('warranty_expiry')}</th>
      <th class="sortable" onclick="SystemsModule.setSort('status')">Status${si('status')}</th>
      <th>Actions</th>
    </tr></thead><tbody id="sys-tbody"></tbody></table>
  </div>
  <div id="sys-pagination" class="pagination"></div>
</div>`;
    renderTable(canCreate, canUpdate, canDelete);
    bindEvents(canCreate, canDelete);
  }

  function renderTable(canCreate, canUpdate, canDelete) {
    const rows = filtered(), paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('sys-tbody'); if (!tbody) return;
    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="13"><div class="empty-state"><div class="empty-state-icon">💻</div><h3>No systems found</h3></div></td></tr>`;
      return;
    }
    tbody.innerHTML = paged.rows.map(r => `
      <tr>
        <td><span class="td-mono">${Utils.esc(r.asset_tag||'—')}</span></td>
        <td><span class="badge ${TYPE_COLORS[r.type]||'badge-muted'}">${Utils.esc(r.type)}</span></td>
        <td>
          <div style="font-weight:500">${Utils.esc(r.manufacturer||'')} ${Utils.esc(r.model||'')}</div>
          <div class="text-xs text-muted td-mono">${Utils.esc(r.serial_number||'')}</div>
        </td>
        <td><span class="text-sm">${Utils.esc(r.generation||'—')}</span></td>
        <td><span class="text-sm">${Utils.esc(r.cpu||'—')}</span></td>
        <td><span class="text-sm text-muted">${r.ram1_size?Utils.esc(r.ram1_size)+(r.ram1_bus?' / '+Utils.esc(r.ram1_bus):''):'—'}</span></td>
        <td><span class="text-sm text-muted">${r.disk1_size?Utils.esc(r.disk1_size)+(r.disk1_type?' '+Utils.esc(r.disk1_type):''):'—'}</span></td>
        <td>${r.assigned_type==='user'&&r.assigned_user_name?`<span style="font-weight:500">${Utils.esc(r.assigned_user_name)}</span>`:'<span class="badge badge-muted">IT Inventory</span>'}</td>
        <td><span class="text-sm text-muted">${Utils.esc(r.department||'—')}</span></td>
        <td>${r.condition?`<span class="badge ${r.condition==='Working'?'badge-success':'badge-danger'}">${Utils.esc(r.condition)}</span>`:'—'}</td>
        <td>${Utils.warrantyBadge(r.warranty_expiry)}</td>
        <td>${Utils.statusBadge(r.status)}</td>
        <td><div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-sm" onclick="SystemsModule.openView(${r.id})">👁</button>
          ${canUpdate?`<button class="btn btn-secondary btn-sm" onclick="SystemsModule.openEdit(${r.id})">✏️</button>`:''}
          ${canDelete?`<button class="btn btn-danger btn-sm" onclick="SystemsModule.deleteRow(${r.id})">🗑</button>`:''}
        </div></td>
      </tr>`).join('');
    Utils.renderPagination(document.getElementById('sys-pagination'), paged, state.perPage, (p,pp) => { state.page=p; state.perPage=pp; renderTable(canCreate, canUpdate, canDelete); });
  }

  function bindEvents(canCreate, canDelete) {
    const canUpdate = App.canPerm('systems','update');
    document.getElementById('sys-search')?.addEventListener('input', e => { state.query=e.target.value; state.page=1; renderTable(canCreate, canUpdate, canDelete); });
    document.getElementById('sys-type-filter')?.addEventListener('change', e => { state.type=e.target.value; state.page=1; renderTable(canCreate, canUpdate, canDelete); });
    document.getElementById('sys-status-filter')?.addEventListener('change', e => { state.status=e.target.value; state.page=1; renderTable(canCreate, canUpdate, canDelete); });
    if (canDelete) {
      document.getElementById('sys-del-all')?.addEventListener('click', () => {
        if (!allRows.length) { Utils.toast('No systems to delete', 'warning'); return; }
        Utils.confirmDeleteAll('Systems', async (pass) => {
          try {
            const r = await API.del('/api/systems/all', { password: pass });
            allRows = [];
            document.getElementById('badge-systems').textContent = 0;
            Utils.toast(`Deleted ${r.deleted} systems`, 'success');
            renderPage();
          } catch(e) { Utils.toast(e.message, 'error'); }
        });
      });
    }
    if (canCreate) {
      document.getElementById('sys-add-btn')?.addEventListener('click', openAdd);
      document.getElementById('sys-import-btn')?.addEventListener('click', () =>
        Utils.openImportModal('Systems', '/api/systems/import/csv', [
          {key:'asset_tag',     desc:'e.g. IT-SYS-0001'},
          {key:'type',          desc:'Laptop, System, or Server'},
          {key:'manufacturer',  desc:'Dell, HP, Lenovo…'},
          {key:'model',         desc:'Latitude 5540, ProBook 450…'},
          {key:'serial_number', desc:'Device serial number'},
          {key:'generation',    desc:'e.g. 12th Gen, 13th Gen'},
          {key:'assigned_to',   desc:'User or IT Inventory'},
          {key:'condition',     desc:'Working or Damaged'},
          {key:'department',    desc:'Engineering, HR, IT…'},
          {key:'location',      desc:'HQ Floor 2, Server Room…'},
        ]));
    }
    document.getElementById('sys-export-btn')?.addEventListener('click', () => API.get('/api/systems/export/csv'));
  }

  function getEmpOptions(sel) {
    return API.get('/api/employees').then(emps =>
      `<option value="">— IT Inventory —</option>` +
      emps.filter(e=>e.is_active).map(e=>`<option value="${e.id}" ${sel==e.id?'selected':''}>${Utils.esc(e.first_name+' '+e.last_name)}${e.department?' ('+Utils.esc(e.department)+')':''}</option>`).join('')
    ).catch(() => '<option value="">— IT Inventory —</option>');
  }

  function diskRow(n, data={}) {
    return `
<div class="form-group"><label class="form-label">Disk Slot ${n} — Size</label><input class="form-control" id="f-disk${n}s" placeholder="e.g. 512GB" value="${Utils.esc(data[`disk${n}_size`]||'')}"/></div>
<div class="form-group"><label class="form-label">Disk Slot ${n} — Type</label>
  <select class="form-control" id="f-disk${n}t">
    <option value="">— None —</option>
    ${DISK_TYPES.map(t=>`<option value="${t}" ${data[`disk${n}_type`]===t?'selected':''}>${t}</option>`).join('')}
  </select>
</div>`;
  }

  function ramRow(n, data={}) {
    return `
<div class="form-group"><label class="form-label">RAM Slot ${n} — Size</label><input class="form-control" id="f-ram${n}s" placeholder="e.g. 8GB" value="${Utils.esc(data[`ram${n}_size`]||'')}"/></div>
<div class="form-group"><label class="form-label">RAM Slot ${n} — Bus</label><input class="form-control" id="f-ram${n}b" placeholder="e.g. 3200MHz" value="${Utils.esc(data[`ram${n}_bus`]||'')}"/></div>`;
  }

  async function sysForm(data = {}) {
    const empOpts = await getEmpOptions(data.assigned_user_id);
    return `
<div class="form-grid form-grid-2">
  <div class="form-group"><label class="form-label required">Type</label>
    <select class="form-control" id="f-type">
      ${TYPES.map(t=>`<option value="${t}" ${(data.type||'Laptop')===t?'selected':''}>${t}</option>`).join('')}
    </select>
  </div>
  <div class="form-group"><label class="form-label required">Serial Number</label><input class="form-control" id="f-serial" placeholder="SN from label/BIOS" value="${Utils.esc(data.serial_number||'')}"/></div>
  <div class="form-group"><label class="form-label">Manufacturer</label><input class="form-control" id="f-mfr" placeholder="Dell, HP, Lenovo…" value="${Utils.esc(data.manufacturer||'')}"/></div>
  <div class="form-group"><label class="form-label">Model</label><input class="form-control" id="f-model" placeholder="Latitude 5540…" value="${Utils.esc(data.model||'')}"/></div>
  <div class="form-group"><label class="form-label">Generation</label><input class="form-control" id="f-gen" placeholder="e.g. 12th Gen" value="${Utils.esc(data.generation||'')}"/></div>
  <div class="form-group"><label class="form-label">CPU</label><input class="form-control" id="f-cpu" placeholder="Intel Core i7-1255U…" value="${Utils.esc(data.cpu||'')}"/></div>
  <div class="form-group"><label class="form-label">Department</label><input class="form-control" id="f-dept" placeholder="Engineering, HR, IT…" value="${Utils.esc(data.department||'')}"/></div>
  <div class="form-group"><label class="form-label">Location</label><input class="form-control" id="f-location" placeholder="HQ Floor 2, Server Room…" value="${Utils.esc(data.location||'')}"/></div>
  <div class="form-group"><label class="form-label">Condition</label>
    <select class="form-control" id="f-condition">
      <option value="">— Not specified —</option>
      <option value="Working" ${data.condition==='Working'?'selected':''}>Working</option>
      <option value="Damaged" ${data.condition==='Damaged'?'selected':''}>Damaged</option>
    </select>
  </div>
  <div class="form-group"><label class="form-label">Status</label>
    <select class="form-control" id="f-status">
      ${STATUSES.map(s=>`<option value="${s}" ${(data.status||'available')===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}
    </select>
  </div>
  <div class="form-group"><label class="form-label">Assigned To</label>
    <select class="form-control" id="f-assigned-type" onchange="SystemsModule.toggleAssigned()">
      <option value="inventory" ${data.assigned_type!=='user'?'selected':''}>IT Inventory</option>
      <option value="user" ${data.assigned_type==='user'?'selected':''}>User</option>
    </select>
  </div>
  <div class="form-group" id="f-user-row" style="${data.assigned_type==='user'?'':'display:none'}">
    <label class="form-label">Select User</label>
    <select class="form-control" id="f-user">${empOpts}</select>
  </div>
  <div class="form-group"><label class="form-label">Warranty Expiry</label><input class="form-control" id="f-warranty" type="date" value="${data.warranty_expiry?data.warranty_expiry.split('T')[0]:''}"/></div>
  <div class="form-group"><label class="form-label">Purpose / Usage</label><input class="form-control" id="f-purpose" placeholder="Daily use, Development, Special task…" value="${Utils.esc(data.purpose||'')}"/></div>
</div>
<div style="margin-top:16px;margin-bottom:8px;font-weight:600;font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">💾 Disk Slots</div>
<div class="form-grid form-grid-2">${[1,2,3,4].map(n=>diskRow(n,data)).join('')}</div>
<div style="margin-top:16px;margin-bottom:8px;font-weight:600;font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">🧠 RAM Slots</div>
<div class="form-grid form-grid-2">${[1,2,3,4].map(n=>ramRow(n,data)).join('')}</div>
<div style="margin-top:16px;margin-bottom:8px;font-weight:600;font-size:13px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">📋 Additional</div>
<div class="form-grid form-grid-2">
  <div class="form-group"><label class="form-label">Purchase Date</label><input class="form-control" id="f-purchase" type="date" value="${data.purchase_date?data.purchase_date.split('T')[0]:''}"/></div>
  <div class="form-group"><label class="form-label">Invoice Number</label><input class="form-control" id="f-invoice" placeholder="INV-2024-001" value="${Utils.esc(data.invoice_number||'')}"/></div>
</div>
<div class="form-group"><label class="form-label">Notes</label><textarea class="form-control" id="f-notes">${Utils.esc(data.notes||'')}</textarea></div>`;
  }

  function toggleAssigned() {
    const isUser = document.getElementById('f-assigned-type').value === 'user';
    const row = document.getElementById('f-user-row');
    if (row) row.style.display = isUser ? '' : 'none';
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value || '';
    return {
      type:             v('f-type'),
      serial_number:    v('f-serial'),
      manufacturer:     v('f-mfr')||null,
      model:            v('f-model')||null,
      generation:       v('f-gen')||null,
      cpu:              v('f-cpu')||null,
      department:       v('f-dept')||null,
      location:         v('f-location')||null,
      condition:        v('f-condition')||null,
      status:           v('f-status'),
      assigned_type:    v('f-assigned-type'),
      assigned_user_id: v('f-user')||null,
      warranty_expiry:  v('f-warranty')||null,
      purpose:          v('f-purpose')||null,
      disk1_size: v('f-disk1s')||null, disk1_type: v('f-disk1t')||null,
      disk2_size: v('f-disk2s')||null, disk2_type: v('f-disk2t')||null,
      disk3_size: v('f-disk3s')||null, disk3_type: v('f-disk3t')||null,
      disk4_size: v('f-disk4s')||null, disk4_type: v('f-disk4t')||null,
      ram1_size:  v('f-ram1s')||null,  ram1_bus:   v('f-ram1b')||null,
      ram2_size:  v('f-ram2s')||null,  ram2_bus:   v('f-ram2b')||null,
      ram3_size:  v('f-ram3s')||null,  ram3_bus:   v('f-ram3b')||null,
      ram4_size:  v('f-ram4s')||null,  ram4_bus:   v('f-ram4b')||null,
      purchase_date:  v('f-purchase')||null,
      invoice_number: v('f-invoice')||null,
      notes:          v('f-notes')||null,
    };
  }

  async function openAdd() {
    const body = await sysForm({ type:'Laptop', status:'available', assigned_type:'inventory' });
    Utils.openModal({ title:'➕ Add System', size:'lg', body, footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save System</button>` });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        const d = collectForm();
        if (!d.serial_number) { Utils.toast('Serial number required','error'); return; }
        try {
          await API.post('/api/systems', d);
          Utils.closeModal(); Utils.toast('System added','success');
          allRows = await API.get('/api/systems');
          document.getElementById('badge-systems').textContent = allRows.length;
          renderPage();
        } catch(e) { Utils.toast(e.message,'error'); }
      };
    },50);
  }

  async function openEdit(id) {
    const data = allRows.find(r=>r.id===id) || await API.get(`/api/systems/${id}`);
    const body = await sysForm(data);
    Utils.openModal({ title:`✏️ Edit ${data.asset_tag||data.serial_number}`, size:'lg', body, footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Changes</button>` });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        try {
          await API.put(`/api/systems/${id}`, collectForm());
          Utils.closeModal(); Utils.toast('Updated','success');
          allRows = await API.get('/api/systems');
          renderPage();
        } catch(e) { Utils.toast(e.message,'error'); }
      };
    },50);
  }

  function openView(id) {
    const r = allRows.find(row=>row.id===id); if (!r) return;
    const diskSummary = [1,2,3,4].filter(n=>r[`disk${n}_size`]).map(n=>`<div class="detail-item"><div class="detail-label">Disk Slot ${n}</div><div class="detail-value">${Utils.esc(r[`disk${n}_size`])} ${Utils.esc(r[`disk${n}_type`]||'')}</div></div>`).join('');
    const ramSummary  = [1,2,3,4].filter(n=>r[`ram${n}_size`]).map(n=>`<div class="detail-item"><div class="detail-label">RAM Slot ${n}</div><div class="detail-value">${Utils.esc(r[`ram${n}_size`])} ${r[`ram${n}_bus`]?'@ '+Utils.esc(r[`ram${n}_bus`]):''}</div></div>`).join('');
    Utils.openModal({ title:`💻 ${r.asset_tag||r.serial_number}`, size:'lg', body:`
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Asset Tag</div><div class="detail-value mono">${Utils.esc(r.asset_tag||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value"><span class="badge ${TYPE_COLORS[r.type]||'badge-muted'}">${Utils.esc(r.type)}</span></div></div>
  <div class="detail-item"><div class="detail-label">Manufacturer / Model</div><div class="detail-value">${Utils.esc(r.manufacturer||'—')} ${Utils.esc(r.model||'')}</div></div>
  <div class="detail-item"><div class="detail-label">Serial Number</div><div class="detail-value mono">${Utils.esc(r.serial_number||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Generation</div><div class="detail-value">${Utils.esc(r.generation||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">CPU</div><div class="detail-value">${Utils.esc(r.cpu||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Condition</div><div class="detail-value">${r.condition?`<span class="badge ${r.condition==='Working'?'badge-success':'badge-danger'}">${Utils.esc(r.condition)}</span>`:'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(r.status)}</div></div>
  <div class="detail-item"><div class="detail-label">Assigned To</div><div class="detail-value">${r.assigned_type==='user'&&r.assigned_user_name?Utils.esc(r.assigned_user_name):'IT Inventory'}</div></div>
  <div class="detail-item"><div class="detail-label">Department</div><div class="detail-value">${Utils.esc(r.department||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Location</div><div class="detail-value">${Utils.esc(r.location||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Warranty</div><div class="detail-value">${Utils.warrantyBadge(r.warranty_expiry)}</div></div>
  <div class="detail-item"><div class="detail-label">Purpose</div><div class="detail-value">${Utils.esc(r.purpose||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Purchase Date</div><div class="detail-value">${Utils.fmtDate(r.purchase_date)}</div></div>
  ${diskSummary||'<div class="detail-item"><div class="detail-label">Disk</div><div class="detail-value">—</div></div>'}
  ${ramSummary||'<div class="detail-item"><div class="detail-label">RAM</div><div class="detail-value">—</div></div>'}
</div>${r.notes?`<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(r.notes)}</div></div>`:''}`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button>${App.canPerm('systems','update')?`<button class="btn btn-primary" onclick="SystemsModule.openEdit(${id})">✏️ Edit</button>`:''}`
    });
    setTimeout(() => { document.getElementById('mc').onclick = Utils.closeModal; }, 50);
  }

  function deleteRow(id) {
    const r = allRows.find(row=>row.id===id);
    Utils.confirm(`Delete ${r?.asset_tag||r?.serial_number}? This cannot be undone.`, async () => {
      try {
        await API.del(`/api/systems/${id}`);
        Utils.toast('Deleted','success');
        allRows = await API.get('/api/systems');
        document.getElementById('badge-systems').textContent = allRows.length;
        renderPage();
      } catch(e) { Utils.toast(e.message,'error'); }
    });
  }

  return { render, openView, openEdit, deleteRow, toggleAssigned, setSort };
})();
