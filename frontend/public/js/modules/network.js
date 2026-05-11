/* network.js */
const NetworkModule = (() => {
  let state = { query:'', device_type:'', status:'', page:1, perPage:15, sortCol:'', sortDir:'asc' };
  let allRows = [];
  const TYPES    = ['Switch','Router','Firewall','WiFi Controller','Access Point','UPS','NAS','Other'];
  const STATUSES = ['in_use','available','repair','retired'];

  function setSort(col) {
    if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = col; state.sortDir = 'asc'; }
    renderPage();
  }

  async function render() {
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    try { allRows = await API.get('/api/network'); renderPage(); }
    catch(e) { Utils.toast(e.message,'error'); }
  }

  function filtered() {
    let r = allRows;
    if (state.query)       r = r.filter(row => ['brand','model','serial_number','ip_address','location','device_type'].some(f=>String(row[f]||'').toLowerCase().includes(state.query.toLowerCase())));
    if (state.device_type) r = r.filter(row => row.device_type === state.device_type);
    if (state.status)      r = r.filter(row => row.status      === state.status);
    return Utils.sortRows(r, state.sortCol, state.sortDir);
  }

  function si(col) { return Utils.sortIcon(col, state.sortCol, state.sortDir); }

  function renderPage() {
    const canW = App.canPerm('network','create');
    const canD = App.canPerm('network','delete');
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>🌐 Network Devices</h2><p>Switches, routers, firewalls and wireless</p></div>
    <div class="section-actions">
      ${canD?`<button class="btn btn-danger" id="net-delete-all">🗑 Delete All</button>`:''}
      ${canW?`<button class="btn btn-secondary" id="net-import">📥 Import CSV</button>`:''}
      <button class="btn btn-secondary" id="net-export">⬇ Export CSV</button>
      ${canW?`<button class="btn btn-primary" id="net-add">＋ Add Device</button>`:''}
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="net-search" type="text" placeholder="Search brand, IP, serial…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="net-type-filter">
      <option value="">All Types</option>
      ${TYPES.map(t=>`<option value="${t}" ${state.device_type===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <select class="filter-select" id="net-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th style="cursor:pointer" onclick="NetworkModule.setSort('device_type')">Type${si('device_type')}</th>
      <th style="cursor:pointer" onclick="NetworkModule.setSort('brand')">Brand / Model${si('brand')}</th>
      <th style="cursor:pointer" onclick="NetworkModule.setSort('serial_number')">Serial${si('serial_number')}</th>
      <th style="cursor:pointer" onclick="NetworkModule.setSort('ip_address')">IP Address${si('ip_address')}</th>
      <th style="cursor:pointer" onclick="NetworkModule.setSort('location')">Location${si('location')}</th>
      <th>Firmware</th>
      <th style="cursor:pointer" onclick="NetworkModule.setSort('warranty_expiry')">Warranty${si('warranty_expiry')}</th>
      <th style="cursor:pointer" onclick="NetworkModule.setSort('status')">Status${si('status')}</th>
      <th>Actions</th>
    </tr></thead><tbody id="net-tbody"></tbody></table>
  </div>
  <div id="net-pagination" class="pagination"></div>
</div>`;
    renderTable(canW, canD);
    document.getElementById('net-search').addEventListener('input', e => { state.query=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('net-type-filter').addEventListener('change', e => { state.device_type=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('net-status-filter').addEventListener('change', e => { state.status=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('net-export').addEventListener('click', () => API.get('/api/network/export/csv'));
    if (canD) {
      document.getElementById('net-delete-all').addEventListener('click', () => {
        if (!allRows.length) { Utils.toast('No devices to delete','warning'); return; }
        Utils.confirmDeleteAll('Network Devices', async (pass) => {
          try {
            const r = await API.del('/api/network/all', { password: pass });
            allRows = [];
            Utils.toast(`Deleted ${r.deleted} devices`, 'success');
            renderTable(canW, canD);
          } catch(e) { Utils.toast(e.message,'error'); }
        });
      });
    }
    if (canW) {
      document.getElementById('net-add').addEventListener('click', openAdd);
      document.getElementById('net-import').addEventListener('click', () => Utils.openImportModal('Network Devices','/api/network/import/csv',[
        {key:'device_type', desc:'Switch, Router, Firewall, WiFi Controller, Access Point, UPS, NAS, Other'},
        {key:'brand', desc:'Cisco, Juniper…'},{key:'model', desc:'Model name'},
        {key:'serial_number', desc:'Serial number'},{key:'ip_address', desc:'IP Address'},
        {key:'mac_address', desc:'MAC Address'},{key:'location', desc:'Physical location'},
        {key:'status', desc:'in_use, available, repair, retired'},
        {key:'warranty_expiry', desc:'YYYY-MM-DD'},{key:'vendor', desc:'Supplier name'},
      ]));
    }
  }

  function renderTable(canW, canD) {
    const rows = filtered(), paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('net-tbody'); if (!tbody) return;
    if (!paged.rows.length) { tbody.innerHTML=`<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">🌐</div><h3>No devices found</h3></div></td></tr>`; return; }
    const typeIcon = {Switch:'🔀',Router:'📡',Firewall:'🔥','WiFi Controller':'📶','Access Point':'📶',UPS:'🔋',NAS:'💾',Other:'📦'};
    tbody.innerHTML = paged.rows.map(r=>`
      <tr>
        <td><span class="badge badge-info">${typeIcon[r.device_type]||''} ${Utils.esc(r.device_type)}</span></td>
        <td><div style="font-weight:500">${Utils.esc(r.brand||'')} ${Utils.esc(r.model||'')}</div></td>
        <td><span class="td-mono text-sm">${Utils.esc(r.serial_number||'—')}</span></td>
        <td><span class="td-mono text-sm">${Utils.esc(r.ip_address||'—')}</span></td>
        <td><span class="text-sm text-muted">${Utils.esc(r.location||'—')}</span></td>
        <td><span class="text-sm text-muted">${Utils.esc(r.firmware_version||'—')}</span></td>
        <td>${Utils.warrantyBadge(r.warranty_expiry)}</td>
        <td>${Utils.statusBadge(r.status)}</td>
        <td><div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-sm" onclick="NetworkModule.openView(${r.id})">👁</button>
          ${canW?`<button class="btn btn-secondary btn-sm" onclick="NetworkModule.openEdit(${r.id})">✏️</button>`:''}
          ${canD?`<button class="btn btn-danger btn-sm" onclick="NetworkModule.deleteRow(${r.id})">🗑</button>`:''}
        </div></td>
      </tr>`).join('');
    Utils.renderPagination(document.getElementById('net-pagination'), paged, state.perPage, (p,pp) => { state.page=p; state.perPage=pp; renderTable(canW,canD); });
  }

  function netForm(data = {}) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group">
    <label class="form-label required">Device Type</label>
    <select class="form-control" id="n-type">${TYPES.map(t=>`<option value="${t}" ${(data.device_type||'Switch')===t?'selected':''}>${t}</option>`).join('')}</select>
  </div>
  <div class="form-group"><label class="form-label">Status</label>
    <select class="form-control" id="n-status">${STATUSES.map(s=>`<option value="${s}" ${(data.status||'in_use')===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}</select>
  </div>
  <div class="form-group"><label class="form-label">Brand</label><input class="form-control" id="n-brand" value="${Utils.esc(data.brand||'')}" placeholder="Cisco, Juniper…"/></div>
  <div class="form-group"><label class="form-label">Model</label><input class="form-control" id="n-model" value="${Utils.esc(data.model||'')}"/></div>
  <div class="form-group"><label class="form-label">Serial Number</label><input class="form-control" id="n-serial" value="${Utils.esc(data.serial_number||'')}"/></div>
  <div class="form-group"><label class="form-label">IP Address</label><input class="form-control" id="n-ip" value="${Utils.esc(data.ip_address||'')}"/></div>
  <div class="form-group"><label class="form-label">MAC Address</label><input class="form-control" id="n-mac" value="${Utils.esc(data.mac_address||'')}"/></div>
  <div class="form-group"><label class="form-label">VLAN(s)</label><input class="form-control" id="n-vlan" value="${Utils.esc(data.vlan||'')}"/></div>
  <div class="form-group"><label class="form-label">Firmware Version</label><input class="form-control" id="n-fw" value="${Utils.esc(data.firmware_version||'')}"/></div>
  <div class="form-group"><label class="form-label">Rack Location</label><input class="form-control" id="n-rack" value="${Utils.esc(data.rack_location||'')}"/></div>
  <div class="form-group"><label class="form-label">Location</label><input class="form-control" id="n-loc" value="${Utils.esc(data.location||'')}"/></div>
  <div class="form-group"><label class="form-label">Vendor</label><input class="form-control" id="n-vendor" value="${Utils.esc(data.vendor||'')}"/></div>
  <div class="form-group"><label class="form-label">Warranty Expiry</label><input class="form-control" id="n-warranty" type="date" value="${data.warranty_expiry?data.warranty_expiry.split('T')[0]:''}"/></div>
  <div class="form-group"><label class="form-label">Purchase Date</label><input class="form-control" id="n-purchase" type="date" value="${data.purchase_date?data.purchase_date.split('T')[0]:''}"/></div>
</div>
<div class="form-group" style="margin-top:12px"><label class="form-label">Notes</label><textarea class="form-control" id="n-notes">${Utils.esc(data.notes||'')}</textarea></div>`;
  }

  function collectNetForm() {
    const v = id => document.getElementById(id)?.value||'';
    return { device_type:v('n-type'), status:v('n-status'), brand:v('n-brand'), model:v('n-model'), serial_number:v('n-serial'), ip_address:v('n-ip'), mac_address:v('n-mac'), vlan:v('n-vlan'), firmware_version:v('n-fw'), rack_location:v('n-rack'), location:v('n-loc'), vendor:v('n-vendor'), warranty_expiry:v('n-warranty')||null, purchase_date:v('n-purchase')||null, notes:v('n-notes') };
  }

  function openAdd() {
    Utils.openModal({ title:'➕ Add Network Device', size:'lg', body:netForm(), footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>` });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        try { await API.post('/api/network', collectNetForm()); Utils.closeModal(); Utils.toast('Device added','success'); allRows=await API.get('/api/network'); renderTable(App.canPerm('network','create'), App.canPerm('network','delete')); }
        catch(e) { Utils.toast(e.message,'error'); }
      };
    },50);
  }

  async function openEdit(id) {
    const data = allRows.find(r=>r.id===id) || await API.get(`/api/network/${id}`);
    Utils.openModal({ title:`✏️ Edit ${data.brand} ${data.model}`, size:'lg', body:netForm(data), footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>` });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        try { await API.put(`/api/network/${id}`, collectNetForm()); Utils.closeModal(); Utils.toast('Updated','success'); allRows=await API.get('/api/network'); renderTable(App.canPerm('network','create'), App.canPerm('network','delete')); }
        catch(e) { Utils.toast(e.message,'error'); }
      };
    },50);
  }

  function openView(id) {
    const r = allRows.find(row=>row.id===id); if (!r) return;
    const canW = App.canPerm('network','update');
    Utils.openModal({ title:`🌐 ${r.device_type} — ${r.brand} ${r.model}`, body:`
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Type</div><div class="detail-value"><span class="badge badge-info">${Utils.esc(r.device_type)}</span></div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(r.status)}</div></div>
  <div class="detail-item"><div class="detail-label">Brand / Model</div><div class="detail-value">${Utils.esc(r.brand||'')} ${Utils.esc(r.model||'')}</div></div>
  <div class="detail-item"><div class="detail-label">Serial Number</div><div class="detail-value mono">${Utils.esc(r.serial_number||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">IP Address</div><div class="detail-value mono">${Utils.esc(r.ip_address||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">MAC Address</div><div class="detail-value mono">${Utils.esc(r.mac_address||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">VLAN</div><div class="detail-value">${Utils.esc(r.vlan||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Firmware</div><div class="detail-value">${Utils.esc(r.firmware_version||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Rack Location</div><div class="detail-value">${Utils.esc(r.rack_location||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Location</div><div class="detail-value">${Utils.esc(r.location||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Vendor</div><div class="detail-value">${Utils.esc(r.vendor||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Warranty</div><div class="detail-value">${Utils.warrantyBadge(r.warranty_expiry)}</div></div>
</div>${r.notes?`<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(r.notes)}</div></div>`:''}`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button>${canW?`<button class="btn btn-primary" onclick="NetworkModule.openEdit(${id})">✏️ Edit</button>`:''}`
    });
    setTimeout(() => { document.getElementById('mc').onclick = Utils.closeModal; },50);
  }

  function deleteRow(id) {
    const r = allRows.find(row=>row.id===id);
    Utils.confirm(`Delete ${r?.device_type} — ${r?.brand} ${r?.model}?`, async () => {
      try { await API.del(`/api/network/${id}`); Utils.toast('Deleted','success'); allRows=allRows.filter(row=>row.id!==id); renderTable(App.canPerm('network','create'), App.canPerm('network','delete')); }
      catch(e) { Utils.toast(e.message,'error'); }
    });
  }

  return { render, openView, openEdit, deleteRow, setSort };
})();
