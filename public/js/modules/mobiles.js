/* mobiles.js — Mobile Device Records */
const MobilesModule = (() => {
  let state = { query: '', status: '', os: '', page: 1, perPage: 10 };

  const STATUSES   = ['In Use', 'Available', 'Repair', 'Retired'];
  const OS_OPTIONS = ['Android', 'iOS', 'Other'];

  function filtered() {
    let rows = DB.mobiles.all();
    if (state.query)  rows = Utils.filterRows(rows, state.query, ['assetTag','brand','model','imei1','imei2','serialNumber','color']);
    if (state.status) rows = rows.filter(r => r.status === state.status);
    if (state.os)     rows = rows.filter(r => r.os === state.os);
    return rows;
  }

  function mobileBadge(brand) {
    const icons = { Apple: '🍎', Samsung: '📱', Xiaomi: '📱', Huawei: '📱', OnePlus: '📱' };
    return icons[brand] || '📱';
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>📱 Mobile Records</h2><p>Company mobile devices inventory</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="mob-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="mob-add-btn">＋ Add Mobile</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="mob-search" type="text" placeholder="Search brand, model, IMEI…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="mob-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${s}</option>`).join('')}
    </select>
    <select class="filter-select" id="mob-os-filter">
      <option value="">All OS</option>
      ${OS_OPTIONS.map(o=>`<option value="${o}" ${state.os===o?'selected':''}>${o}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table id="mob-table">
      <thead><tr>
        <th>Asset Tag</th><th>Device</th><th>IMEI 1</th>
        <th>OS</th><th>Status</th><th>Assigned To</th><th>Warranty</th><th>Actions</th>
      </tr></thead>
      <tbody id="mob-tbody"></tbody>
    </table>
  </div>
  <div id="mob-pagination"></div>
</div>`;
    renderTable();
    bindEvents();
  }

  function renderTable() {
    const rows  = filtered();
    const paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('mob-tbody');
    if (!tbody) return;

    if (paged.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📱</div><h3>No mobile devices found</h3><p>Try adjusting your filters or add a new device</p><button class="btn btn-primary" id="empty-add-btn">＋ Add Mobile</button></div></td></tr>`;
      setTimeout(() => document.getElementById('empty-add-btn')?.addEventListener('click', openAdd), 50);
    } else {
      tbody.innerHTML = paged.rows.map(m => `
        <tr>
          <td><span class="td-mono">${Utils.esc(m.assetTag)}</span></td>
          <td>
            <div style="font-weight:500">${mobileBadge(m.brand)} ${Utils.esc(m.brand)} ${Utils.esc(m.model)}</div>
            <div class="text-xs text-muted">${Utils.esc(m.color)||''} ${m.storageCapacity?'· '+Utils.esc(m.storageCapacity):''}</div>
          </td>
          <td><span class="text-sm text-muted td-mono">${Utils.esc(m.imei1)||'—'}</span></td>
          <td><span class="badge badge-info">${Utils.esc(m.os)||'—'}</span></td>
          <td>${Utils.statusBadge(m.status)}</td>
          <td>
            ${m.assignedTo
              ? `<div style="font-weight:500">${Utils.esc(Utils.employeeName(m.assignedTo))}</div><div class="text-xs text-muted">${Utils.esc(m.department)||''}</div>`
              : '<span class="text-muted">—</span>'}
          </td>
          <td>${Utils.warrantyBadge(m.warrantyExpiry)}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="MobilesModule.openView(${m.id})">👁</button>
              <button class="btn btn-secondary btn-sm" onclick="MobilesModule.openEdit(${m.id})">✏️</button>
              <button class="btn btn-danger btn-sm"    onclick="MobilesModule.deleteMobile(${m.id})">🗑</button>
            </div>
          </td>
        </tr>`).join('');
    }
    Utils.renderPagination(document.getElementById('mob-pagination'), paged, state.perPage, p => { state.page = p; renderTable(); });
  }

  function bindEvents() {
    document.getElementById('mob-search').addEventListener('input', e => { state.query = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('mob-status-filter').addEventListener('change', e => { state.status = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('mob-os-filter').addEventListener('change', e => { state.os = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('mob-add-btn').addEventListener('click', openAdd);
    document.getElementById('mob-export-btn').addEventListener('click', exportData);
  }

  function getEmpOptions(sel) {
    return `<option value="">— Unassigned —</option>` +
      DB.employees.all().map(e => `<option value="${e.id}" ${sel==e.id?'selected':''}>${Utils.esc(e.name)} (${Utils.esc(e.department)})</option>`).join('');
  }

  function getVendorOptions(sel) {
    return `<option value="">— Select Vendor —</option>` +
      DB.vendors.all().map(v => `<option value="${v.id}" ${sel==v.id?'selected':''}>${Utils.esc(v.name)}</option>`).join('');
  }

  function mobileForm(data = {}) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group">
    <label class="form-label required">Brand</label>
    <input class="form-control" id="m-brand" placeholder="Samsung, Apple, Xiaomi…" value="${Utils.esc(data.brand||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Model</label>
    <input class="form-control" id="m-model" placeholder="Galaxy S23, iPhone 14…" value="${Utils.esc(data.model||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">IMEI 1</label>
    <input class="form-control" id="m-imei1" placeholder="15-digit IMEI" maxlength="17" value="${Utils.esc(data.imei1||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">IMEI 2 (dual SIM)</label>
    <input class="form-control" id="m-imei2" placeholder="15-digit IMEI (optional)" maxlength="17" value="${Utils.esc(data.imei2||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Serial Number</label>
    <input class="form-control" id="m-serial" placeholder="Serial from box/settings" value="${Utils.esc(data.serialNumber||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Color</label>
    <input class="form-control" id="m-color" placeholder="Phantom Black, Space Gray…" value="${Utils.esc(data.color||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">OS</label>
    <select class="form-control" id="m-os">
      ${OS_OPTIONS.map(o=>`<option value="${o}" ${(data.os||'Android')===o?'selected':''}>${o}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">OS Version</label>
    <input class="form-control" id="m-osver" placeholder="Android 14, iOS 17…" value="${Utils.esc(data.osVersion||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Storage Capacity</label>
    <input class="form-control" id="m-storage" placeholder="128GB, 256GB…" value="${Utils.esc(data.storageCapacity||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Status</label>
    <select class="form-control" id="m-status">
      ${STATUSES.map(s=>`<option value="${s}" ${(data.status||'Available')===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Purchase Date</label>
    <input class="form-control" id="m-purchase" type="date" value="${data.purchaseDate||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Warranty Expiry</label>
    <input class="form-control" id="m-warranty" type="date" value="${data.warrantyExpiry||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Invoice Number</label>
    <input class="form-control" id="m-invoice" placeholder="INV-2024-M01" value="${Utils.esc(data.invoiceNumber||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Vendor</label>
    <select class="form-control" id="m-vendor">${getVendorOptions(data.vendorId)}</select>
  </div>
  <div class="form-group">
    <label class="form-label">Assigned To</label>
    <select class="form-control" id="m-assignedTo">${getEmpOptions(data.assignedTo)}</select>
  </div>
  <div class="form-group">
    <label class="form-label">Department</label>
    <input class="form-control" id="m-dept" placeholder="IT, HR, Operations…" value="${Utils.esc(data.department||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Location</label>
    <input class="form-control" id="m-location" placeholder="HQ, IT Store…" value="${Utils.esc(data.location||'')}"/>
  </div>
</div>
<div class="detail-section">
  <div class="form-group">
    <label class="form-label">Notes</label>
    <textarea class="form-control" id="m-notes" placeholder="Additional notes…">${Utils.esc(data.notes||'')}</textarea>
  </div>
</div>`;
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value || '';
    const emp = v('m-assignedTo');
    const empData = emp ? DB.employees.byId(+emp) : null;
    return {
      brand:           v('m-brand'),
      model:           v('m-model'),
      imei1:           v('m-imei1'),
      imei2:           v('m-imei2'),
      serialNumber:    v('m-serial'),
      color:           v('m-color'),
      os:              v('m-os'),
      osVersion:       v('m-osver'),
      storageCapacity: v('m-storage'),
      status:          v('m-status'),
      purchaseDate:    v('m-purchase'),
      warrantyExpiry:  v('m-warranty'),
      invoiceNumber:   v('m-invoice'),
      vendorId:        v('m-vendor') ? +v('m-vendor') : null,
      assignedTo:      emp ? +emp : null,
      department:      v('m-dept') || (empData?.department || ''),
      location:        v('m-location'),
      notes:           v('m-notes'),
    };
  }

  function openAdd() {
    Utils.openModal({
      title: '➕ Add Mobile Device',
      body:  mobileForm({ status: 'Available', os: 'Android' }),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary"   id="modal-save">Save Device</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm();
        if (!d.brand || !d.model) { Utils.toast('Brand and Model are required', 'error'); return; }
        if (!d.imei1) { Utils.toast('IMEI 1 is required', 'error'); return; }
        const tag = DB.genMobileTag();
        const row = DB.mobiles.insert({ ...d, assetTag: tag });
        DB.activity.log('added', row.assetTag, `Mobile added: ${d.brand} ${d.model}`);
        Utils.closeModal();
        Utils.toast(`Mobile ${tag} added`, 'success');
        renderTable();
      };
    }, 50);
  }

  function openEdit(id) {
    const m = DB.mobiles.byId(id);
    if (!m) return;
    Utils.openModal({
      title: `✏️ Edit ${m.assetTag}`,
      body:  mobileForm(m),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary"   id="modal-save">Save Changes</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm();
        if (!d.brand || !d.model) { Utils.toast('Brand and Model are required', 'error'); return; }
        DB.mobiles.update(id, d);
        DB.activity.log('updated', m.assetTag, `Mobile updated: ${d.brand} ${d.model}`);
        Utils.closeModal();
        Utils.toast('Mobile updated', 'success');
        renderTable();
      };
    }, 50);
  }

  function openView(id) {
    const m = DB.mobiles.byId(id);
    if (!m) return;
    const emp    = m.assignedTo ? DB.employees.byId(m.assignedTo) : null;
    const vendor = m.vendorId   ? DB.vendors.byId(m.vendorId)     : null;
    Utils.openModal({
      title: `📱 ${m.assetTag} — ${m.brand} ${m.model}`,
      body: `
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Asset Tag</div><div class="detail-value mono">${Utils.esc(m.assetTag)}</div></div>
  <div class="detail-item"><div class="detail-label">Brand / Model</div><div class="detail-value">${mobileBadge(m.brand)} ${Utils.esc(m.brand)} ${Utils.esc(m.model)}</div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(m.status)}</div></div>
  <div class="detail-item"><div class="detail-label">Color</div><div class="detail-value">${Utils.esc(m.color)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">IMEI 1</div><div class="detail-value mono">${Utils.esc(m.imei1)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">IMEI 2</div><div class="detail-value mono">${Utils.esc(m.imei2)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Serial Number</div><div class="detail-value mono">${Utils.esc(m.serialNumber)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">OS</div><div class="detail-value">${Utils.esc(m.os)||'—'} ${Utils.esc(m.osVersion||'')}</div></div>
  <div class="detail-item"><div class="detail-label">Storage</div><div class="detail-value">${Utils.esc(m.storageCapacity)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Purchase Date</div><div class="detail-value">${Utils.fmtDate(m.purchaseDate)}</div></div>
  <div class="detail-item"><div class="detail-label">Warranty</div><div class="detail-value">${Utils.warrantyBadge(m.warrantyExpiry)}</div></div>
  <div class="detail-item"><div class="detail-label">Vendor</div><div class="detail-value">${vendor ? Utils.esc(vendor.name) : '—'}</div></div>
</div>
<div class="detail-section">
  <div class="detail-section-title">👤 Assignment</div>
  <div class="detail-grid">
    <div class="detail-item"><div class="detail-label">Assigned To</div><div class="detail-value">${emp ? Utils.esc(emp.name) : '— Unassigned —'}</div></div>
    <div class="detail-item"><div class="detail-label">Department</div><div class="detail-value">${Utils.esc(m.department)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">Location</div><div class="detail-value">${Utils.esc(m.location)||'—'}</div></div>
  </div>
</div>
${m.notes ? `<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(m.notes)}</div></div>` : ''}`,
      footer:`<button class="btn btn-secondary" id="modal-cancel">Close</button>
              <button class="btn btn-primary" onclick="MobilesModule.openEdit(${id});event.stopPropagation()">✏️ Edit</button>`
    });
    setTimeout(() => { document.getElementById('modal-cancel').onclick = Utils.closeModal; }, 50);
  }

  function deleteMobile(id) {
    const m = DB.mobiles.byId(id);
    if (!m) return;
    Utils.confirm(`Delete mobile ${m.assetTag} (${m.brand} ${m.model})? This cannot be undone.`, () => {
      DB.mobiles.remove(id);
      DB.activity.log('deleted', m.assetTag, `Mobile removed: ${m.brand} ${m.model}`);
      Utils.toast('Mobile deleted', 'success');
      renderTable();
    });
  }

  function exportData() {
    Utils.exportCSV(filtered(), 'mobiles.csv', [
      { label: 'Asset Tag',       key: 'assetTag' },
      { label: 'Brand',           key: 'brand' },
      { label: 'Model',           key: 'model' },
      { label: 'IMEI 1',         key: 'imei1' },
      { label: 'IMEI 2',         key: 'imei2' },
      { label: 'Serial Number',   key: 'serialNumber' },
      { label: 'Color',           key: 'color' },
      { label: 'OS',              key: 'os' },
      { label: 'OS Version',      key: 'osVersion' },
      { label: 'Storage',         key: 'storageCapacity' },
      { label: 'Status',          key: 'status' },
      { label: 'Assigned To',     key: 'assignedTo', render: r => Utils.employeeName(r.assignedTo) },
      { label: 'Department',      key: 'department' },
      { label: 'Location',        key: 'location' },
      { label: 'Purchase Date',   key: 'purchaseDate' },
      { label: 'Warranty Expiry', key: 'warrantyExpiry' },
      { label: 'Invoice No.',     key: 'invoiceNumber' },
      { label: 'Vendor',          key: 'vendorId', render: r => Utils.vendorName(r.vendorId) },
    ]);
  }

  return { render, openView, openEdit, deleteMobile };
})();
