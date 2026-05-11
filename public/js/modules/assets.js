/* assets.js */
const AssetsModule = (() => {
  let state = { query:'', category:'', status:'', page:1, perPage:10 };

  const CATEGORIES = ['Laptop','Desktop','Server','Network Device','Accessory','Other'];
  const STATUSES   = ['In Use','Available','Repair','Retired'];
  const OS_OPTIONS = ['Ubuntu 22.04','Ubuntu 20.04','Windows 11 Pro','Windows 11 Home','Windows 10 Pro','macOS Ventura','Other'];

  function filtered() {
    let rows = DB.assets.all();
    if (state.query)    rows = Utils.filterRows(rows, state.query, ['assetTag','brand','model','serialNumber','assignedTo','department','ipAddress','os']);
    if (state.category) rows = rows.filter(r => r.category === state.category);
    if (state.status)   rows = rows.filter(r => r.status   === state.status);
    return rows;
  }

  function render() {
    const pc = document.getElementById('page-content');
    pc.innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title">
      <h2>💻 All Assets</h2>
      <p>Manage all IT hardware assets</p>
    </div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="asset-import-btn">📥 Import CSV</button>
      <button class="btn btn-secondary" id="asset-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="asset-add-btn">＋ Add Asset</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="asset-search" type="text" placeholder="Search assets…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="asset-cat-filter">
      <option value="">All Categories</option>
      ${CATEGORIES.map(c=>`<option value="${c}" ${state.category===c?'selected':''}>${c}</option>`).join('')}
    </select>
    <select class="filter-select" id="asset-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table id="asset-table">
      <thead><tr>
        <th>Asset Tag</th><th>Category</th><th>Brand / Model</th>
        <th>Serial No.</th><th>Status</th><th>Assigned To</th>
        <th>Warranty</th><th>Actions</th>
      </tr></thead>
      <tbody id="asset-tbody"></tbody>
    </table>
  </div>
  <div id="asset-pagination"></div>
</div>`;
    renderTable();
    bindEvents();
  }

  function renderTable() {
    const rows    = filtered();
    const paged   = Utils.paginate(rows, state.page, state.perPage);
    const tbody   = document.getElementById('asset-tbody');
    if (!tbody) return;

    if (paged.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📭</div><h3>No assets found</h3><p>Try adjusting your filters or add a new asset</p><button class="btn btn-primary" id="empty-add-btn">＋ Add Asset</button></div></td></tr>`;
      setTimeout(() => document.getElementById('empty-add-btn')?.addEventListener('click', openAdd), 50);
    } else {
      tbody.innerHTML = paged.rows.map(a => `
        <tr>
          <td><span class="td-mono">${Utils.esc(a.assetTag)}</span></td>
          <td>${Utils.categoryBadge(a.category)}</td>
          <td>
            <div style="font-weight:500">${Utils.esc(a.brand)} ${Utils.esc(a.model)}</div>
            ${a.os ? `<div class="text-xs text-muted">${Utils.esc(a.os)}</div>` : ''}
          </td>
          <td><span class="text-sm text-muted">${Utils.esc(a.serialNumber)||'—'}</span></td>
          <td>${Utils.statusBadge(a.status)}</td>
          <td>
            ${a.assignedTo ? `<div style="font-weight:500">${Utils.esc(Utils.employeeName(a.assignedTo))}</div><div class="text-xs text-muted">${Utils.esc(a.department)||''}</div>` : '<span class="text-muted">—</span>'}
          </td>
          <td>${Utils.warrantyBadge(a.warrantyExpiry)}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="AssetsModule.openView(${a.id})">👁</button>
              <button class="btn btn-secondary btn-sm" onclick="AssetsModule.openEdit(${a.id})">✏️</button>
              <button class="btn btn-danger btn-sm"    onclick="AssetsModule.deleteAsset(${a.id})">🗑</button>
            </div>
          </td>
        </tr>`).join('');
    }
    Utils.renderPagination(document.getElementById('asset-pagination'), paged, state.perPage, p => { state.page = p; renderTable(); });
    document.getElementById('badge-assets') && (document.getElementById('badge-assets').textContent = DB.assets.all().length);
  }

  function bindEvents() {
    document.getElementById('asset-search').addEventListener('input', e => { state.query = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('asset-cat-filter').addEventListener('change', e => { state.category = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('asset-status-filter').addEventListener('change', e => { state.status = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('asset-add-btn').addEventListener('click', openAdd);
    document.getElementById('asset-import-btn').addEventListener('click', () => ImportModule.openImport('asset'));
    document.getElementById('asset-export-btn').addEventListener('click', exportData);
  }

  function getVendorOptions(sel) {
    return DB.vendors.all().map(v => `<option value="${v.id}" ${sel==v.id?'selected':''}>${Utils.esc(v.name)}</option>`).join('');
  }
  function getEmpOptions(sel) {
    return `<option value="">— Unassigned —</option>` + DB.employees.all().map(e => `<option value="${e.id}" ${sel==e.id?'selected':''}>${Utils.esc(e.name)} (${Utils.esc(e.department)})</option>`).join('');
  }

  function assetForm(data = {}) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group">
    <label class="form-label required">Category</label>
    <select class="form-control" id="f-category">
      ${CATEGORIES.map(c=>`<option value="${c}" ${data.category===c?'selected':''}>${c}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label required">Status</label>
    <select class="form-control" id="f-status">
      ${STATUSES.map(s=>`<option value="${s}" ${data.status===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label required">Brand</label>
    <input class="form-control" id="f-brand" placeholder="Dell, HP, Lenovo…" value="${Utils.esc(data.brand||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Model</label>
    <input class="form-control" id="f-model" placeholder="Latitude 5540, ProBook 450…" value="${Utils.esc(data.model||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Serial Number</label>
    <input class="form-control" id="f-serial" placeholder="S/N from label" value="${Utils.esc(data.serialNumber||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Invoice Number</label>
    <input class="form-control" id="f-invoice" placeholder="INV-2024-001" value="${Utils.esc(data.invoiceNumber||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Purchase Date</label>
    <input class="form-control" id="f-purchase" type="date" value="${data.purchaseDate||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Warranty Expiry</label>
    <input class="form-control" id="f-warranty" type="date" value="${data.warrantyExpiry||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Vendor</label>
    <select class="form-control" id="f-vendor"><option value="">— Select Vendor —</option>${getVendorOptions(data.vendorId)}</select>
  </div>
  <div class="form-group">
    <label class="form-label">Assigned To</label>
    <select class="form-control" id="f-assignedTo">${getEmpOptions(data.assignedTo)}</select>
  </div>
  <div class="form-group">
    <label class="form-label">Department</label>
    <input class="form-control" id="f-dept" placeholder="IT, HR, Dev…" value="${Utils.esc(data.department||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Location</label>
    <input class="form-control" id="f-location" placeholder="HQ Floor 2, Server Room…" value="${Utils.esc(data.location||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Assigned Date</label>
    <input class="form-control" id="f-assignedDate" type="date" value="${data.assignedDate||''}"/>
  </div>
</div>
<div class="detail-section">
  <div class="detail-section-title">💻 Hardware Details</div>
  <div class="form-grid form-grid-2">
    <div class="form-group">
      <label class="form-label">CPU</label>
      <input class="form-control" id="f-cpu" placeholder="Intel Core i7-13th Gen" value="${Utils.esc(data.cpu||'')}"/>
    </div>
    <div class="form-group">
      <label class="form-label">RAM</label>
      <input class="form-control" id="f-ram" placeholder="16GB DDR4" value="${Utils.esc(data.ram||'')}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Storage</label>
      <input class="form-control" id="f-storage" placeholder="512GB SSD" value="${Utils.esc(data.storage||'')}"/>
    </div>
    <div class="form-group">
      <label class="form-label">Operating System</label>
      <select class="form-control" id="f-os">
        <option value="">— Select OS —</option>
        ${OS_OPTIONS.map(o=>`<option value="${o}" ${data.os===o?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">MAC Address</label>
      <input class="form-control" id="f-mac" placeholder="AA:BB:CC:DD:EE:FF" value="${Utils.esc(data.macAddress||'')}"/>
    </div>
    <div class="form-group">
      <label class="form-label">IP Address</label>
      <input class="form-control" id="f-ip" placeholder="192.168.1.100" value="${Utils.esc(data.ipAddress||'')}"/>
    </div>
  </div>
</div>
<div class="detail-section">
  <div class="form-group">
    <label class="form-label">Notes</label>
    <textarea class="form-control" id="f-notes" placeholder="Additional notes…">${Utils.esc(data.notes||'')}</textarea>
  </div>
</div>`;
  }

  function collectForm(existingTag) {
    const v = id => document.getElementById(id)?.value||'';
    const emp = v('f-assignedTo');
    const empData = emp ? DB.employees.byId(+emp) : null;
    return {
      category: v('f-category'), status: v('f-status'),
      brand: v('f-brand'), model: v('f-model'),
      serialNumber: v('f-serial'), invoiceNumber: v('f-invoice'),
      purchaseDate: v('f-purchase'), warrantyExpiry: v('f-warranty'),
      vendorId: v('f-vendor') ? +v('f-vendor') : null,
      assignedTo: emp ? +emp : null,
      department: v('f-dept') || (empData?.department||''),
      location: v('f-location'), assignedDate: v('f-assignedDate'),
      cpu: v('f-cpu'), ram: v('f-ram'), storage: v('f-storage'),
      os: v('f-os'), macAddress: v('f-mac'), ipAddress: v('f-ip'),
      notes: v('f-notes'),
    };
  }

  function openAdd() {
    Utils.openModal({
      title: '➕ Add New Asset',
      body:  assetForm({ category:'Laptop', status:'Available' }),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary" id="modal-save">Save Asset</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm();
        if (!d.brand || !d.model) { Utils.toast('Brand and Model are required','error'); return; }
        const tag = DB.genAssetTag(d.category);
        const row = DB.assets.insert({ ...d, assetTag: tag });
        DB.activity.log('added', row.assetTag, `New ${d.category} added: ${d.brand} ${d.model}`);
        Utils.closeModal();
        Utils.toast(`Asset ${tag} added successfully`, 'success');
        renderTable();
      };
    }, 50);
  }

  function openEdit(id) {
    const a = DB.assets.byId(id);
    if (!a) return;
    Utils.openModal({
      title: `✏️ Edit ${a.assetTag}`,
      body:  assetForm(a),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary"   id="modal-save">Save Changes</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm(a.assetTag);
        if (!d.brand || !d.model) { Utils.toast('Brand and Model are required','error'); return; }
        DB.assets.update(id, d);
        DB.activity.log('updated', a.assetTag, `Updated: ${d.brand} ${d.model}`);
        Utils.closeModal();
        Utils.toast('Asset updated', 'success');
        renderTable();
      };
    }, 50);
  }

  function openView(id) {
    const a = DB.assets.byId(id);
    if (!a) return;
    const vendor = a.vendorId ? DB.vendors.byId(a.vendorId) : null;
    const emp    = a.assignedTo ? DB.employees.byId(a.assignedTo) : null;
    Utils.openModal({
      title: `📋 ${a.assetTag} — ${a.brand} ${a.model}`,
      body: `
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Asset Tag</div><div class="detail-value mono">${Utils.esc(a.assetTag)}</div></div>
  <div class="detail-item"><div class="detail-label">Category</div><div class="detail-value">${Utils.categoryBadge(a.category)}</div></div>
  <div class="detail-item"><div class="detail-label">Brand</div><div class="detail-value">${Utils.esc(a.brand)}</div></div>
  <div class="detail-item"><div class="detail-label">Model</div><div class="detail-value">${Utils.esc(a.model)}</div></div>
  <div class="detail-item"><div class="detail-label">Serial Number</div><div class="detail-value mono">${Utils.esc(a.serialNumber)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(a.status)}</div></div>
  <div class="detail-item"><div class="detail-label">Purchase Date</div><div class="detail-value">${Utils.fmtDate(a.purchaseDate)}</div></div>
  <div class="detail-item"><div class="detail-label">Warranty Expiry</div><div class="detail-value">${Utils.warrantyBadge(a.warrantyExpiry)}</div></div>
  <div class="detail-item"><div class="detail-label">Invoice No.</div><div class="detail-value">${Utils.esc(a.invoiceNumber)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Vendor</div><div class="detail-value">${vendor ? Utils.esc(vendor.name) : '—'}</div></div>
</div>
<div class="detail-section">
  <div class="detail-section-title">👤 Assignment</div>
  <div class="detail-grid">
    <div class="detail-item"><div class="detail-label">Assigned To</div><div class="detail-value">${emp ? Utils.esc(emp.name) : '— Unassigned —'}</div></div>
    <div class="detail-item"><div class="detail-label">Department</div><div class="detail-value">${Utils.esc(a.department)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">Location</div><div class="detail-value">${Utils.esc(a.location)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">Assigned Date</div><div class="detail-value">${Utils.fmtDate(a.assignedDate)}</div></div>
  </div>
</div>
${(a.cpu||a.ram||a.storage) ? `
<div class="detail-section">
  <div class="detail-section-title">💻 Hardware</div>
  <div class="detail-grid">
    <div class="detail-item"><div class="detail-label">CPU</div><div class="detail-value">${Utils.esc(a.cpu)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">RAM</div><div class="detail-value">${Utils.esc(a.ram)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">Storage</div><div class="detail-value">${Utils.esc(a.storage)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">OS</div><div class="detail-value">${Utils.esc(a.os)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">MAC Address</div><div class="detail-value mono">${Utils.esc(a.macAddress)||'—'}</div></div>
    <div class="detail-item"><div class="detail-label">IP Address</div><div class="detail-value mono">${Utils.esc(a.ipAddress)||'—'}</div></div>
  </div>
</div>` : ''}
${a.notes ? `<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(a.notes)}</div></div>` : ''}`,
      footer:`<button class="btn btn-secondary" id="modal-cancel">Close</button>
              <button class="btn btn-primary" onclick="AssetsModule.openEdit(${id});event.stopPropagation()">✏️ Edit</button>`
    });
    setTimeout(() => { document.getElementById('modal-cancel').onclick = Utils.closeModal; }, 50);
  }

  function deleteAsset(id) {
    const a = DB.assets.byId(id);
    if (!a) return;
    Utils.confirm(`Delete asset ${a.assetTag} (${a.brand} ${a.model})? This cannot be undone.`, () => {
      DB.assets.remove(id);
      DB.activity.log('deleted', a.assetTag, `Removed ${a.brand} ${a.model}`);
      Utils.toast('Asset deleted', 'success');
      renderTable();
    });
  }

  function exportData() {
    Utils.exportCSV(filtered(), 'assets.csv', [
      { label:'Asset Tag',    key:'assetTag' },
      { label:'Category',     key:'category' },
      { label:'Brand',        key:'brand' },
      { label:'Model',        key:'model' },
      { label:'Serial No.',   key:'serialNumber' },
      { label:'Status',       key:'status' },
      { label:'Assigned To',  key:'assignedTo', render: r => Utils.employeeName(r.assignedTo) },
      { label:'Department',   key:'department' },
      { label:'Location',     key:'location' },
      { label:'Purchase Date',key:'purchaseDate' },
      { label:'Warranty Expiry', key:'warrantyExpiry' },
      { label:'Vendor',       key:'vendorId', render: r => Utils.vendorName(r.vendorId) },
      { label:'CPU',          key:'cpu' },
      { label:'RAM',          key:'ram' },
      { label:'Storage',      key:'storage' },
      { label:'OS',           key:'os' },
      { label:'IP Address',   key:'ipAddress' },
      { label:'MAC Address',  key:'macAddress' },
    ]);
  }

  return { render, openView, openEdit, deleteAsset };
})();
