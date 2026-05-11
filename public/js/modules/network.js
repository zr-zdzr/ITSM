/* network.js */
const NetworkModule = (() => {
  let state = { query:'', type:'', page:1, perPage:10 };
  const TYPES = ['Switch','Router','Firewall','Access Point','Server','UPS','NAS','Other'];
  const STATUSES = ['In Use','Available','Repair','Retired'];

  function filtered() {
    let rows = DB.network.all();
    if (state.query) rows = Utils.filterRows(rows, state.query, ['assetTag','brand','model','serialNumber','ipAddress','rackLocation','firmwareVersion']);
    if (state.type)  rows = rows.filter(r => r.deviceType === state.type);
    return rows;
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>🌐 Network Devices</h2><p>Switches, routers, firewalls and access points</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="net-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="net-add-btn">＋ Add Device</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="net-search" type="text" placeholder="Search by IP, model, location…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="net-type-filter">
      <option value="">All Types</option>
      ${TYPES.map(t=>`<option value="${t}" ${state.type===t?'selected':''}>${t}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table>
      <thead><tr>
        <th>Asset Tag</th><th>Type</th><th>Brand/Model</th>
        <th>IP Address</th><th>Location</th><th>Firmware</th>
        <th>Status</th><th>Warranty</th><th>Actions</th>
      </tr></thead>
      <tbody id="net-tbody"></tbody>
    </table>
  </div>
  <div id="net-pagination"></div>
</div>`;
    renderTable();
    document.getElementById('net-search').addEventListener('input', e=>{ state.query=e.target.value; state.page=1; renderTable(); });
    document.getElementById('net-type-filter').addEventListener('change', e=>{ state.type=e.target.value; state.page=1; renderTable(); });
    document.getElementById('net-add-btn').addEventListener('click', openAdd);
    document.getElementById('net-export-btn').addEventListener('click', exportData);
  }

  function renderTable() {
    const rows  = filtered();
    const paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('net-tbody');
    if (!tbody) return;
    const typeIcons = { Switch:'🔀', Router:'📡', Firewall:'🛡️', 'Access Point':'📶', Server:'🗄️', UPS:'🔋', NAS:'💾', Other:'🔧' };
    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">🌐</div><h3>No network devices</h3><p>Add your first network device</p><button class="btn btn-primary" id="empty-add-n">＋ Add Device</button></div></td></tr>`;
      setTimeout(()=>document.getElementById('empty-add-n')?.addEventListener('click',openAdd),50);
      return;
    }
    tbody.innerHTML = paged.rows.map(d=>`
      <tr>
        <td><span class="td-mono">${Utils.esc(d.assetTag)}</span></td>
        <td><span class="badge badge-info">${typeIcons[d.deviceType]||'🔧'} ${Utils.esc(d.deviceType)}</span></td>
        <td><div style="font-weight:500">${Utils.esc(d.brand)} ${Utils.esc(d.model)}</div>
            ${d.serialNumber?`<div class="text-xs text-muted">${Utils.esc(d.serialNumber)}</div>`:''}</td>
        <td><span class="td-mono">${Utils.esc(d.ipAddress)||'—'}</span></td>
        <td><div>${Utils.esc(d.location||'—')}</div>${d.rackLocation?`<div class="text-xs text-muted">${Utils.esc(d.rackLocation)}</div>`:''}</td>
        <td><span class="text-xs text-muted font-mono">${Utils.esc(d.firmwareVersion||'—')}</span></td>
        <td>${Utils.statusBadge(d.status)}</td>
        <td>${Utils.warrantyBadge(d.warrantyExpiry)}</td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="NetworkModule.openView(${d.id})">👁</button>
          <button class="btn btn-secondary btn-sm" onclick="NetworkModule.openEdit(${d.id})">✏️</button>
          <button class="btn btn-danger    btn-sm" onclick="NetworkModule.deleteDevice(${d.id})">🗑</button>
        </div></td>
      </tr>`).join('');
    Utils.renderPagination(document.getElementById('net-pagination'), paged, state.perPage, p=>{ state.page=p; renderTable(); });
  }

  function getVendorOptions(sel) {
    return DB.vendors.all().map(v=>`<option value="${v.id}" ${sel==v.id?'selected':''}>${Utils.esc(v.name)}</option>`).join('');
  }

  function netForm(data={}) {
    return `<div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label required">Device Type</label>
        <select class="form-control" id="nf-type">${TYPES.map(t=>`<option value="${t}" ${data.deviceType===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label required">Status</label>
        <select class="form-control" id="nf-status">${STATUSES.map(s=>`<option value="${s}" ${data.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label required">Brand</label><input class="form-control" id="nf-brand" placeholder="Cisco, Juniper, Mikrotik…" value="${Utils.esc(data.brand||'')}"/></div>
      <div class="form-group"><label class="form-label required">Model</label><input class="form-control" id="nf-model" placeholder="Catalyst 2960-X" value="${Utils.esc(data.model||'')}"/></div>
      <div class="form-group"><label class="form-label">Serial Number</label><input class="form-control" id="nf-serial" value="${Utils.esc(data.serialNumber||'')}"/></div>
      <div class="form-group"><label class="form-label">IP Address</label><input class="form-control" id="nf-ip" placeholder="192.168.1.1" value="${Utils.esc(data.ipAddress||'')}"/></div>
      <div class="form-group"><label class="form-label">VLAN</label><input class="form-control" id="nf-vlan" placeholder="VLAN 10, VLAN 20" value="${Utils.esc(data.vlan||'')}"/></div>
      <div class="form-group"><label class="form-label">Firmware Version</label><input class="form-control" id="nf-fw" placeholder="15.2(7)E4" value="${Utils.esc(data.firmwareVersion||'')}"/></div>
      <div class="form-group"><label class="form-label">Location</label><input class="form-control" id="nf-loc" placeholder="Server Room, Floor 3…" value="${Utils.esc(data.location||'')}"/></div>
      <div class="form-group"><label class="form-label">Rack Location</label><input class="form-control" id="nf-rack" placeholder="Rack A - U12" value="${Utils.esc(data.rackLocation||'')}"/></div>
      <div class="form-group"><label class="form-label">Purchase Date</label><input class="form-control" id="nf-purchase" type="date" value="${data.purchaseDate||''}"/></div>
      <div class="form-group"><label class="form-label">Warranty Expiry</label><input class="form-control" id="nf-warranty" type="date" value="${data.warrantyExpiry||''}"/></div>
      <div class="form-group"><label class="form-label">Vendor</label>
        <select class="form-control" id="nf-vendor"><option value="">— Select Vendor —</option>${getVendorOptions(data.vendorId)}</select></div>
      <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-control" id="nf-notes">${Utils.esc(data.notes||'')}</textarea></div>
    </div>`;
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value||'';
    return { deviceType:v('nf-type'), status:v('nf-status'), brand:v('nf-brand'), model:v('nf-model'),
      serialNumber:v('nf-serial'), ipAddress:v('nf-ip'), vlan:v('nf-vlan'), firmwareVersion:v('nf-fw'),
      location:v('nf-loc'), rackLocation:v('nf-rack'), purchaseDate:v('nf-purchase'),
      warrantyExpiry:v('nf-warranty'), vendorId:v('nf-vendor')?+v('nf-vendor'):null, notes:v('nf-notes') };
  }

  function openAdd() {
    Utils.openModal({ title:'➕ Add Network Device', body:netForm({ deviceType:'Switch', status:'In Use' }),
      footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Device</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const d = collectForm();
        if (!d.brand||!d.model) { Utils.toast('Brand and Model are required','error'); return; }
        const tag = DB.genAssetTag('Network Device');
        const row = DB.network.insert({ ...d, assetTag:tag });
        DB.activity.log('added', row.assetTag, `New ${d.deviceType}: ${d.brand} ${d.model}`);
        Utils.closeModal(); Utils.toast(`Device ${tag} added`,'success'); renderTable();
      };
    },50);
  }

  function openEdit(id) {
    const d = DB.network.byId(id); if(!d) return;
    Utils.openModal({ title:`✏️ Edit ${d.assetTag}`, body:netForm(d),
      footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Changes</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const nd = collectForm();
        if (!nd.brand||!nd.model) { Utils.toast('Brand and Model are required','error'); return; }
        DB.network.update(id,nd);
        Utils.closeModal(); Utils.toast('Device updated','success'); renderTable();
      };
    },50);
  }

  function openView(id) {
    const d = DB.network.byId(id); if(!d) return;
    const vendor = d.vendorId ? DB.vendors.byId(d.vendorId) : null;
    Utils.openModal({
      title:`🌐 ${d.assetTag} — ${d.brand} ${d.model}`,
      body:`<div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Asset Tag</div><div class="detail-value mono">${Utils.esc(d.assetTag)}</div></div>
        <div class="detail-item"><div class="detail-label">Device Type</div><div class="detail-value">${Utils.esc(d.deviceType)}</div></div>
        <div class="detail-item"><div class="detail-label">Brand</div><div class="detail-value">${Utils.esc(d.brand)}</div></div>
        <div class="detail-item"><div class="detail-label">Model</div><div class="detail-value">${Utils.esc(d.model)}</div></div>
        <div class="detail-item"><div class="detail-label">Serial No.</div><div class="detail-value mono">${Utils.esc(d.serialNumber)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(d.status)}</div></div>
        <div class="detail-item"><div class="detail-label">IP Address</div><div class="detail-value mono">${Utils.esc(d.ipAddress)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">VLAN</div><div class="detail-value">${Utils.esc(d.vlan)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Firmware</div><div class="detail-value mono">${Utils.esc(d.firmwareVersion)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Rack Location</div><div class="detail-value">${Utils.esc(d.rackLocation)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Location</div><div class="detail-value">${Utils.esc(d.location)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Vendor</div><div class="detail-value">${vendor?Utils.esc(vendor.name):'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Purchase Date</div><div class="detail-value">${Utils.fmtDate(d.purchaseDate)}</div></div>
        <div class="detail-item"><div class="detail-label">Warranty</div><div class="detail-value">${Utils.warrantyBadge(d.warrantyExpiry)}</div></div>
        ${d.notes?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-label">Notes</div><div class="detail-value">${Utils.esc(d.notes)}</div></div>`:''}
      </div>`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button><button class="btn btn-primary" onclick="NetworkModule.openEdit(${id})">✏️ Edit</button>`
    });
    setTimeout(()=>{ document.getElementById('mc').onclick = Utils.closeModal; },50);
  }

  function deleteDevice(id) {
    const d = DB.network.byId(id); if(!d) return;
    Utils.confirm(`Delete device ${d.assetTag} (${d.brand} ${d.model})?`, () => {
      DB.network.remove(id); Utils.toast('Device deleted','success'); renderTable();
    });
  }

  function exportData() {
    Utils.exportCSV(filtered(),'network_devices.csv',[
      {label:'Asset Tag',key:'assetTag'},{label:'Type',key:'deviceType'},
      {label:'Brand',key:'brand'},{label:'Model',key:'model'},
      {label:'Serial No.',key:'serialNumber'},{label:'IP Address',key:'ipAddress'},
      {label:'VLAN',key:'vlan'},{label:'Firmware',key:'firmwareVersion'},
      {label:'Location',key:'location'},{label:'Rack',key:'rackLocation'},
      {label:'Status',key:'status'},{label:'Warranty Expiry',key:'warrantyExpiry'},
      {label:'Vendor',key:'vendorId',render:r=>Utils.vendorName(r.vendorId)},
    ]);
  }

  return { render, openView, openEdit, deleteDevice };
})();
