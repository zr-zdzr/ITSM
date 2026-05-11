/* accessories.js */
const AccessoriesModule = (() => {
  let state = { query:'', type:'', page:1, perPage:10 };
  const TYPES = ['Mouse','Keyboard','Monitor','RAM','SSD','HDD','Cable','USB Hub','Power Adapter','Docking Station','Headset','Webcam','Other'];
  const STATUSES = ['Active','Inactive'];

  function filtered() {
    let rows = DB.accessories.all();
    if (state.query) rows = Utils.filterRows(rows, state.query, ['type','brand','model','serialNumber']);
    if (state.type)  rows = rows.filter(r => r.type === state.type);
    return rows;
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>🔌 Accessories</h2><p>Peripherals, components and consumable stock</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="acc-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="acc-add-btn">＋ Add Accessory</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="acc-search" type="text" placeholder="Search accessories…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="acc-type-filter">
      <option value="">All Types</option>
      ${TYPES.map(t=>`<option value="${t}" ${state.type===t?'selected':''}>${t}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table>
      <thead><tr>
        <th>Type</th><th>Brand/Model</th><th>Total Qty</th>
        <th>Available</th><th>In Use</th><th>Vendor</th>
        <th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody id="acc-tbody"></tbody>
    </table>
  </div>
  <div id="acc-pagination"></div>
</div>`;
    renderTable();
    document.getElementById('acc-search').addEventListener('input', e=>{ state.query=e.target.value; state.page=1; renderTable(); });
    document.getElementById('acc-type-filter').addEventListener('change', e=>{ state.type=e.target.value; state.page=1; renderTable(); });
    document.getElementById('acc-add-btn').addEventListener('click', openAdd);
    document.getElementById('acc-export-btn').addEventListener('click', exportData);
  }

  function renderTable() {
    const rows  = filtered();
    const paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('acc-tbody');
    if (!tbody) return;
    const typeIcons = { Mouse:'🖱️', Keyboard:'⌨️', Monitor:'🖥️', RAM:'🧠', SSD:'💾', HDD:'💿', Cable:'🔌', 'USB Hub':'🔗', 'Power Adapter':'⚡', 'Docking Station':'🔧', Headset:'🎧', Webcam:'📷', Other:'📦' };
    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🔌</div><h3>No accessories found</h3><p>Add your first accessory or peripheral</p><button class="btn btn-primary" id="empty-add-a">＋ Add Accessory</button></div></td></tr>`;
      setTimeout(()=>document.getElementById('empty-add-a')?.addEventListener('click',openAdd),50);
      return;
    }
    tbody.innerHTML = paged.rows.map(a=>{
      const inUse = (a.quantity||0) - (a.available||0);
      const pct   = a.quantity>0 ? Math.round((a.available/a.quantity)*100) : 0;
      return `<tr>
        <td><span class="badge badge-accent">${typeIcons[a.type]||'📦'} ${Utils.esc(a.type)}</span></td>
        <td><div style="font-weight:500">${Utils.esc(a.brand)} ${Utils.esc(a.model)}</div>
            ${a.serialNumber?`<div class="text-xs text-muted">${Utils.esc(a.serialNumber)}</div>`:''}</td>
        <td><strong>${a.quantity}</strong></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;min-width:50px">
              <div style="width:${pct}%;height:100%;background:var(--success);border-radius:3px"></div>
            </div>
            <span style="color:var(--success);font-weight:600">${a.available}</span>
          </div>
        </td>
        <td><span style="color:var(--warning)">${inUse}</span></td>
        <td><span class="text-sm">${Utils.esc(Utils.vendorName(a.vendorId))}</span></td>
        <td>${Utils.statusBadge(a.status||'Active')}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="AccessoriesModule.openView(${a.id})">👁</button>
          <button class="btn btn-secondary btn-sm" onclick="AccessoriesModule.openEdit(${a.id})">✏️</button>
          <button class="btn btn-danger    btn-sm" onclick="AccessoriesModule.deleteAcc(${a.id})">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
    Utils.renderPagination(document.getElementById('acc-pagination'), paged, state.perPage, p=>{ state.page=p; renderTable(); });
  }

  function getVendorOptions(sel) {
    return DB.vendors.all().map(v=>`<option value="${v.id}" ${sel==v.id?'selected':''}>${Utils.esc(v.name)}</option>`).join('');
  }
  function getAssetOptions(sel) {
    return `<option value="">— Not linked —</option>` + DB.assets.all().map(a=>`<option value="${a.id}" ${sel==a.id?'selected':''}>${Utils.esc(a.assetTag)} — ${Utils.esc(a.brand)} ${Utils.esc(a.model)}</option>`).join('');
  }

  function accForm(data={}) {
    return `<div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label required">Type</label>
        <select class="form-control" id="af-type">${TYPES.map(t=>`<option value="${t}" ${data.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label required">Status</label>
        <select class="form-control" id="af-status">${STATUSES.map(s=>`<option value="${s}" ${data.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label required">Brand</label><input class="form-control" id="af-brand" placeholder="Logitech, Kingston…" value="${Utils.esc(data.brand||'')}"/></div>
      <div class="form-group"><label class="form-label required">Model</label><input class="form-control" id="af-model" placeholder="MX Master 3" value="${Utils.esc(data.model||'')}"/></div>
      <div class="form-group"><label class="form-label">Serial / Part No.</label><input class="form-control" id="af-serial" value="${Utils.esc(data.serialNumber||'')}"/></div>
      <div class="form-group"><label class="form-label">Vendor</label>
        <select class="form-control" id="af-vendor"><option value="">— Select Vendor —</option>${getVendorOptions(data.vendorId)}</select></div>
      <div class="form-group"><label class="form-label required">Total Quantity</label><input class="form-control" id="af-qty" type="number" min="0" value="${data.quantity||1}"/></div>
      <div class="form-group"><label class="form-label required">Available</label><input class="form-control" id="af-avail" type="number" min="0" value="${data.available!=null?data.available:1}"/></div>
      <div class="form-group"><label class="form-label">Purchase Date</label><input class="form-control" id="af-purchase" type="date" value="${data.purchaseDate||''}"/></div>
      <div class="form-group"><label class="form-label">Linked Asset (optional)</label>
        <select class="form-control" id="af-asset">${getAssetOptions(data.linkedAssetId)}</select></div>
      <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-control" id="af-notes">${Utils.esc(data.notes||'')}</textarea></div>
    </div>`;
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value||'';
    return { type:v('af-type'), status:v('af-status'), brand:v('af-brand'), model:v('af-model'),
      serialNumber:v('af-serial'), vendorId:v('af-vendor')?+v('af-vendor'):null,
      quantity:parseInt(v('af-qty'))||1, available:parseInt(v('af-avail'))||0,
      purchaseDate:v('af-purchase'), linkedAssetId:v('af-asset')?+v('af-asset'):null, notes:v('af-notes') };
  }

  function openAdd() {
    Utils.openModal({ title:'➕ Add Accessory', body:accForm({ type:'Mouse', status:'Active' }),
      footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const d = collectForm();
        if (!d.brand||!d.model) { Utils.toast('Brand and Model are required','error'); return; }
        if (d.available > d.quantity) { Utils.toast('Available cannot exceed total quantity','error'); return; }
        DB.accessories.insert(d);
        DB.activity.log('added','Accessory',`New ${d.type}: ${d.brand} ${d.model} (qty: ${d.quantity})`);
        Utils.closeModal(); Utils.toast('Accessory added','success'); renderTable();
      };
    },50);
  }

  function openEdit(id) {
    const a = DB.accessories.byId(id); if(!a) return;
    Utils.openModal({ title:`✏️ Edit ${a.brand} ${a.model}`, body:accForm(a),
      footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Changes</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const d = collectForm();
        if (!d.brand||!d.model) { Utils.toast('Brand and Model are required','error'); return; }
        if (d.available > d.quantity) { Utils.toast('Available cannot exceed total quantity','error'); return; }
        DB.accessories.update(id,d);
        Utils.closeModal(); Utils.toast('Accessory updated','success'); renderTable();
      };
    },50);
  }

  function openView(id) {
    const a = DB.accessories.byId(id); if(!a) return;
    const vendor = a.vendorId ? DB.vendors.byId(a.vendorId) : null;
    const linked = a.linkedAssetId ? DB.assets.byId(a.linkedAssetId) : null;
    const inUse  = (a.quantity||0)-(a.available||0);
    Utils.openModal({
      title:`🔌 ${a.brand} ${a.model}`,
      body:`<div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value">${Utils.esc(a.type)}</div></div>
        <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(a.status||'Active')}</div></div>
        <div class="detail-item"><div class="detail-label">Brand</div><div class="detail-value">${Utils.esc(a.brand)}</div></div>
        <div class="detail-item"><div class="detail-label">Model</div><div class="detail-value">${Utils.esc(a.model)}</div></div>
        <div class="detail-item"><div class="detail-label">Total Quantity</div><div class="detail-value" style="font-size:20px;font-weight:700;color:var(--primary-light)">${a.quantity}</div></div>
        <div class="detail-item"><div class="detail-label">Available</div><div class="detail-value" style="font-size:20px;font-weight:700;color:var(--success)">${a.available}</div></div>
        <div class="detail-item"><div class="detail-label">In Use</div><div class="detail-value" style="font-size:20px;font-weight:700;color:var(--warning)">${inUse}</div></div>
        <div class="detail-item"><div class="detail-label">Vendor</div><div class="detail-value">${vendor?Utils.esc(vendor.name):'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Purchase Date</div><div class="detail-value">${Utils.fmtDate(a.purchaseDate)}</div></div>
        <div class="detail-item"><div class="detail-label">Linked Asset</div><div class="detail-value">${linked?`<span class="td-mono">${Utils.esc(linked.assetTag)}</span>`:'—'}</div></div>
        ${a.notes?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Notes</div><div class="detail-value">${Utils.esc(a.notes)}</div></div>`:''}
      </div>`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button><button class="btn btn-primary" onclick="AccessoriesModule.openEdit(${id})">✏️ Edit</button>`
    });
    setTimeout(()=>{ document.getElementById('mc').onclick = Utils.closeModal; },50);
  }

  function deleteAcc(id) {
    const a = DB.accessories.byId(id); if(!a) return;
    Utils.confirm(`Delete "${a.brand} ${a.model}" (${a.type})?`, () => {
      DB.accessories.remove(id); Utils.toast('Accessory deleted','success'); renderTable();
    });
  }

  function exportData() {
    Utils.exportCSV(filtered(),'accessories.csv',[
      {label:'Type',key:'type'},{label:'Brand',key:'brand'},{label:'Model',key:'model'},
      {label:'Total Qty',key:'quantity'},{label:'Available',key:'available'},
      {label:'In Use',key:'id',render:r=>(r.quantity||0)-(r.available||0)},
      {label:'Vendor',key:'vendorId',render:r=>Utils.vendorName(r.vendorId)},
      {label:'Purchase Date',key:'purchaseDate'},{label:'Status',key:'status'},
    ]);
  }

  return { render, openView, openEdit, deleteAcc };
})();
