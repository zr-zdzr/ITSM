/* mobiles.js */
const MobilesModule = (() => {
  let state = { query:'', condition:'', page:1, perPage:15, sortCol:'', sortDir:'asc' };
  let allRows = [];
  const STATUSES   = ['in_use','available','repair','retired'];
  const CONDITIONS = ['Working','Legacy Device','Damaged'];
  const OS_PRESETS = ['Android','iOS','Other'];

  function conditionBadge(c) {
    const map = { Working:'badge-success', 'Legacy Device':'badge-warning', Damaged:'badge-danger' };
    return c ? `<span class="badge ${map[c]||'badge-muted'}">${Utils.esc(c)}</span>` : '<span class="text-muted">—</span>';
  }

  function mobWarranty(dateStr) {
    if (!dateStr) return '<span class="text-muted">—</span>';
    const expired = new Date(dateStr) < new Date();
    if (expired) return '<span class="badge badge-danger">Expired</span>';
    return Utils.esc(new Date(dateStr).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }));
  }

  function setSort(col) {
    if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = col; state.sortDir = 'asc'; }
    renderPage();
  }

  async function render() {
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    try { allRows = await API.get('/api/mobiles'); renderPage(); }
    catch(e) { Utils.toast(e.message,'error'); }
  }

  function filtered() {
    let r = allRows;
    if (state.query)     r = r.filter(row => ['manufacturer','model','serial_number','imei','imei2','asset_tag','department','assigned_user_name'].some(f=>String(row[f]||'').toLowerCase().includes(state.query.toLowerCase())));
    if (state.condition) r = r.filter(row => row.condition === state.condition);
    return Utils.sortRows(r, state.sortCol, state.sortDir);
  }

  function si(col) { return Utils.sortIcon(col, state.sortCol, state.sortDir); }

  function renderPage() {
    const canW = App.canPerm('mobiles','create');
    const canD = App.canPerm('mobiles','delete');
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>📱 Mobile Devices</h2><p>Company mobile device inventory</p></div>
    <div class="section-actions">
      ${canD?`<button class="btn btn-danger" id="mob-delete-all">🗑 Delete All</button>`:''}
      ${canW?`<button class="btn btn-secondary" id="mob-import">📥 Import CSV</button>`:''}
      <button class="btn btn-secondary" id="mob-export">⬇ Export CSV</button>
      ${canW?`<button class="btn btn-primary" id="mob-add">＋ Add Device</button>`:''}
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="mob-search" type="text" placeholder="Search tag, brand, model, serial, IMEI…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="mob-condition-filter">
      <option value="">All Conditions</option>
      ${CONDITIONS.map(c=>`<option value="${c}" ${state.condition===c?'selected':''}>${c}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('asset_tag')">Asset Tag${si('asset_tag')}</th>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('assigned_user_name')">Assigned To${si('assigned_user_name')}</th>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('manufacturer')">Manufacturer${si('manufacturer')}</th>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('model')">Model${si('model')}</th>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('serial_number')">Serial${si('serial_number')}</th>
      <th>IMEI 1 / IMEI 2</th>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('warranty_expiry')">Warranty${si('warranty_expiry')}</th>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('os')">OS${si('os')}</th>
      <th style="cursor:pointer" onclick="MobilesModule.setSort('condition')">Condition${si('condition')}</th>
      <th>Actions</th>
    </tr></thead><tbody id="mob-tbody"></tbody></table>
  </div>
  <div id="mob-pagination" class="pagination"></div>
</div>`;
    renderTable(canW, canD);
    document.getElementById('mob-search').addEventListener('input', e => { state.query=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('mob-condition-filter').addEventListener('change', e => { state.condition=e.target.value; state.page=1; renderTable(canW,canD); });
    document.getElementById('mob-export').addEventListener('click', () => API.get('/api/mobiles/export/csv'));
    if (canD) {
      document.getElementById('mob-delete-all').addEventListener('click', () => {
        if (!allRows.length) { Utils.toast('No devices to delete','warning'); return; }
        Utils.confirmDeleteAll('Mobile Devices', async (pass) => {
          try {
            const r = await API.del('/api/mobiles/all', { password: pass });
            allRows = [];
            Utils.toast(`Deleted ${r.deleted} devices`, 'success');
            renderTable(canW, canD);
          } catch(e) { Utils.toast(e.message,'error'); }
        });
      });
    }
    if (canW) {
      document.getElementById('mob-add').addEventListener('click', openAdd);
      document.getElementById('mob-import').addEventListener('click', () => Utils.openImportModal('Mobile Devices','/api/mobiles/import/csv',[
        {key:'asset_tag',     desc:'Asset tag e.g. IT-MB-0001'},
        {key:'manufacturer',  desc:'Samsung, Apple, Xiaomi…'},
        {key:'model',         desc:'Galaxy S23, iPhone 14…'},
        {key:'serial_number', desc:'Device serial number'},
        {key:'imei',          desc:'IMEI 1 (15 digits)'},
        {key:'imei2',         desc:'IMEI 2 for dual-SIM (optional)'},
        {key:'assigned_to',   desc:'Employee name or IT Inventory'},
        {key:'os',            desc:'Android, iOS or custom'},
        {key:'condition',     desc:'Working / Legacy Device / Damaged'},
      ]));
    }
  }

  function renderTable(canW, canD) {
    const rows = filtered(), paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('mob-tbody'); if (!tbody) return;
    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-state-icon">📱</div><h3>No devices found</h3></div></td></tr>`;
      return;
    }
    tbody.innerHTML = paged.rows.map(r => `
      <tr>
        <td><span class="td-mono">${Utils.esc(r.asset_tag||'—')}</span></td>
        <td>${r.assigned_type === 'user' && r.assigned_user_name
          ? `<span style="cursor:pointer;text-decoration:underline;font-weight:500" onclick="MobilesModule.openByUser(${r.id})">${Utils.esc(r.assigned_user_name)}</span>`
          : '<span class="badge badge-muted">IT Inventory</span>'}</td>
        <td>${Utils.esc(r.manufacturer||'—')}</td>
        <td>${Utils.esc(r.model||'—')}</td>
        <td><span class="td-mono text-sm">${Utils.esc(r.serial_number||'—')}</span></td>
        <td>
          <div class="td-mono text-sm">${Utils.esc(r.imei||'—')}</div>
          ${r.imei2 ? `<div class="td-mono text-sm" style="color:var(--text-muted);margin-top:2px">${Utils.esc(r.imei2)}</div>` : ''}
        </td>
        <td>${mobWarranty(r.warranty_expiry)}</td>
        <td><span class="badge badge-info">${Utils.esc(r.os||'—')}</span></td>
        <td>${conditionBadge(r.condition)}</td>
        <td><div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-sm" onclick="MobilesModule.openView(${r.id})">👁</button>
          ${canW?`<button class="btn btn-secondary btn-sm" onclick="MobilesModule.openEdit(${r.id})">✏️</button>`:''}
          ${canD?`<button class="btn btn-danger btn-sm" onclick="MobilesModule.deleteRow(${r.id})">🗑</button>`:''}
        </div></td>
      </tr>`).join('');
    Utils.renderPagination(document.getElementById('mob-pagination'), paged, state.perPage, (p,pp)=>{state.page=p; state.perPage=pp; renderTable(canW,canD);});
  }

  async function getEmpOptions(sel) {
    try {
      const emps = await API.get('/api/employees');
      return `<option value="">— IT Inventory —</option>`+emps.filter(e=>e.is_active).map(e=>`<option value="${e.id}" ${sel==e.id?'selected':''}>${Utils.esc(e.first_name+' '+e.last_name)}${e.department?' ('+Utils.esc(e.department)+')':''}</option>`).join('');
    } catch { return '<option value="">— IT Inventory —</option>'; }
  }

  async function mobForm(data = {}) {
    const empOpts = await getEmpOptions(data.assigned_user_id);
    const osPreset = ['Android','iOS'].includes(data.os) ? data.os : (data.os ? 'Other' : 'Android');
    const osCustom = osPreset === 'Other' && data.os !== 'Other' ? (data.os||'') : '';
    return `
<div class="form-grid form-grid-2">
  <div class="form-group"><label class="form-label">Asset Tag</label><input class="form-control" id="m-asset-tag" placeholder="IT-MB-0001" value="${Utils.esc(data.asset_tag||'')}"/></div>
  <div class="form-group"><label class="form-label required">Manufacturer</label><input class="form-control" id="m-mfr" placeholder="Samsung, Apple, Xiaomi…" value="${Utils.esc(data.manufacturer||'')}"/></div>
  <div class="form-group"><label class="form-label required">Model</label><input class="form-control" id="m-model" placeholder="Galaxy S23, iPhone 14…" value="${Utils.esc(data.model||'')}"/></div>
  <div class="form-group"><label class="form-label required">Serial Number</label><input class="form-control" id="m-serial" placeholder="Device serial number" value="${Utils.esc(data.serial_number||'')}"/></div>
  <div class="form-group"><label class="form-label">IMEI 1</label><input class="form-control" id="m-imei" placeholder="15-digit IMEI" maxlength="17" value="${Utils.esc(data.imei||'')}"/></div>
  <div class="form-group"><label class="form-label">IMEI 2 (Dual SIM)</label><input class="form-control" id="m-imei2" placeholder="optional" maxlength="17" value="${Utils.esc(data.imei2||'')}"/></div>
  <div class="form-group">
    <label class="form-label required">OS</label>
    <select class="form-control" id="m-os" onchange="document.getElementById('m-os-custom-row').style.display=this.value==='Other'?'block':'none'">
      ${OS_PRESETS.map(o=>`<option value="${o}" ${osPreset===o?'selected':''}>${o}</option>`).join('')}
    </select>
  </div>
  <div class="form-group" id="m-os-custom-row" style="${osPreset==='Other'?'':'display:none'}">
    <label class="form-label">Specify OS</label>
    <input class="form-control" id="m-os-custom" placeholder="e.g. Windows Phone, HarmonyOS…" value="${Utils.esc(osCustom)}"/>
  </div>
  <div class="form-group"><label class="form-label">OS Version</label><input class="form-control" id="m-osver" placeholder="Android 14, iOS 17…" value="${Utils.esc(data.os_version||'')}"/></div>
  <div class="form-group"><label class="form-label">Condition</label>
    <select class="form-control" id="m-condition">
      <option value="">— Not specified —</option>
      ${CONDITIONS.map(c=>`<option value="${c}" ${data.condition===c?'selected':''}>${c}</option>`).join('')}
    </select>
  </div>
  <div class="form-group"><label class="form-label">Assigned To</label>
    <select class="form-control" id="m-atype" onchange="document.getElementById('m-user-row').style.display=this.value==='user'?'block':'none'">
      <option value="inventory" ${data.assigned_type!=='user'?'selected':''}>IT Inventory</option>
      <option value="user" ${data.assigned_type==='user'?'selected':''}>Employee</option>
    </select>
  </div>
  <div class="form-group" id="m-user-row" style="${data.assigned_type==='user'?'':'display:none'}"><label class="form-label">Select Employee</label><select class="form-control" id="m-user">${empOpts}</select></div>
  <div class="form-group"><label class="form-label">Department</label><input class="form-control" id="m-dept" placeholder="Engineering, HR, IT…" value="${Utils.esc(data.department||'')}"/></div>
  <div class="form-group"><label class="form-label">Assigned Purpose</label>
    <select class="form-control" id="m-purpose" onchange="document.getElementById('m-svc-row').style.display=this.value==='service'?'block':'none'">
      <option value="">— Not specified —</option>
      <option value="personal" ${data.purpose==='personal'?'selected':''}>Personal</option>
      <option value="qa_testing" ${data.purpose==='qa_testing'?'selected':''}>QA Testing</option>
      <option value="service" ${data.purpose==='service'?'selected':''}>Service</option>
    </select>
  </div>
  <div class="form-group" id="m-svc-row" style="${data.purpose==='service'?'':'display:none'}"><label class="form-label">Service Details</label><input class="form-control" id="m-svcdet" placeholder="WhatsApp Business, OTP…" value="${Utils.esc(data.service_details||'')}"/></div>
  <div class="form-group"><label class="form-label">Warranty Start</label><input class="form-control" id="m-wstart" type="date" value="${data.warranty_start?data.warranty_start.split('T')[0]:''}"/></div>
  <div class="form-group"><label class="form-label">Warranty End</label><input class="form-control" id="m-warranty" type="date" value="${data.warranty_expiry?data.warranty_expiry.split('T')[0]:''}"/></div>
  <div class="form-group"><label class="form-label">Color</label><input class="form-control" id="m-color" value="${Utils.esc(data.color||'')}"/></div>
  <div class="form-group"><label class="form-label">Storage</label><input class="form-control" id="m-storage" placeholder="128GB" value="${Utils.esc(data.storage_capacity||'')}"/></div>
  <div class="form-group"><label class="form-label">Purchase Date</label><input class="form-control" id="m-purchase" type="date" value="${data.purchase_date?data.purchase_date.split('T')[0]:''}"/></div>
  <div class="form-group"><label class="form-label">Invoice Number</label><input class="form-control" id="m-invoice" value="${Utils.esc(data.invoice_number||'')}"/></div>
</div>
<div class="form-group" style="margin-top:12px"><label class="form-label">Notes</label><textarea class="form-control" id="m-notes">${Utils.esc(data.notes||'')}</textarea></div>`;
  }

  function collectMobForm() {
    const v = id => document.getElementById(id)?.value || '';
    const osVal = v('m-os') === 'Other' ? (document.getElementById('m-os-custom')?.value?.trim() || 'Other') : v('m-os');
    return {
      asset_tag:        v('m-asset-tag')||null,
      manufacturer:     v('m-mfr'),
      model:            v('m-model'),
      serial_number:    v('m-serial'),
      os:               osVal,
      imei:             v('m-imei')||null,
      imei2:            v('m-imei2')||null,
      department:       v('m-dept')||null,
      condition:        v('m-condition')||null,
      assigned_type:    v('m-atype'),
      assigned_user_id: v('m-user')||null,
      purpose:          v('m-purpose')||null,
      service_details:  v('m-svcdet')||null,
      warranty_start:   v('m-wstart')||null,
      warranty_expiry:  v('m-warranty')||null,
      os_version:       v('m-osver')||null,
      status:           v('m-atype') === 'user' ? 'in_use' : 'available',
      color:            v('m-color')||null,
      storage_capacity: v('m-storage')||null,
      purchase_date:    v('m-purchase')||null,
      invoice_number:   v('m-invoice')||null,
      notes:            v('m-notes')||null,
    };
  }

  function validateForm(d) {
    if (!d.manufacturer)  { Utils.toast('Manufacturer is required','error'); return false; }
    if (!d.model)         { Utils.toast('Model is required','error'); return false; }
    if (!d.serial_number) { Utils.toast('Serial number is required','error'); return false; }
    if (!d.os)            { Utils.toast('OS is required','error'); return false; }
    return true;
  }

  async function openAdd() {
    const body = await mobForm({ os:'Android', assigned_type:'inventory' });
    Utils.openModal({ title:'➕ Add Mobile Device', size:'lg', body, footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>` });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        const d = collectMobForm();
        if (!validateForm(d)) return;
        try { await API.post('/api/mobiles',d); Utils.closeModal(); Utils.toast('Device added','success'); allRows=await API.get('/api/mobiles'); renderTable(App.canPerm('mobiles','create'), App.canPerm('mobiles','delete')); }
        catch(e) { Utils.toast(e.message,'error'); }
      };
    },50);
  }

  async function openEdit(id) {
    const data = allRows.find(r=>r.id===id) || await API.get(`/api/mobiles/${id}`);
    const body = await mobForm(data);
    Utils.openModal({ title:`✏️ Edit — ${Utils.esc(data.asset_tag||data.manufacturer)}`, size:'lg', body, footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>` });
    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        const d = collectMobForm();
        if (!validateForm(d)) return;
        try { await API.put(`/api/mobiles/${id}`,d); Utils.closeModal(); Utils.toast('Updated','success'); allRows=await API.get('/api/mobiles'); renderTable(App.canPerm('mobiles','create'), App.canPerm('mobiles','delete')); }
        catch(e) { Utils.toast(e.message,'error'); }
      };
    },50);
  }

  function openView(id) {
    const r = allRows.find(row=>row.id===id); if (!r) return;
    const canW = App.canPerm('mobiles','update');
    const purposeColor = {personal:'badge-success',qa_testing:'badge-warning',service:'badge-primary'};
    Utils.openModal({ title:`📱 ${Utils.esc(r.asset_tag||'')} — ${Utils.esc(r.manufacturer)} ${Utils.esc(r.model)}`, body:`
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Asset Tag</div><div class="detail-value mono">${Utils.esc(r.asset_tag||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Assigned To</div><div class="detail-value">${r.assigned_type==='user'&&r.assigned_user_name?Utils.esc(r.assigned_user_name):'IT Inventory'}</div></div>
  <div class="detail-item"><div class="detail-label">Manufacturer</div><div class="detail-value">${Utils.esc(r.manufacturer||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Model</div><div class="detail-value">${Utils.esc(r.model||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Serial Number</div><div class="detail-value mono">${Utils.esc(r.serial_number||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">IMEI 1</div><div class="detail-value mono">${Utils.esc(r.imei||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">IMEI 2</div><div class="detail-value mono">${Utils.esc(r.imei2||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">OS</div><div class="detail-value"><span class="badge badge-info">${Utils.esc(r.os||'—')}</span> ${Utils.esc(r.os_version||'')}</div></div>
  <div class="detail-item"><div class="detail-label">Condition</div><div class="detail-value">${conditionBadge(r.condition)}</div></div>
  <div class="detail-item"><div class="detail-label">Warranty End</div><div class="detail-value">${mobWarranty(r.warranty_expiry)}</div></div>
  <div class="detail-item"><div class="detail-label">Warranty Start</div><div class="detail-value">${Utils.fmtDate(r.warranty_start)}</div></div>
  <div class="detail-item"><div class="detail-label">Department</div><div class="detail-value">${Utils.esc(r.department||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Assigned Purpose</div><div class="detail-value">${r.purpose?`<span class="badge ${purposeColor[r.purpose]||'badge-muted'}">${r.purpose.replace('_',' ')}</span>`:'—'}</div></div>
  ${r.purpose==='service'?`<div class="detail-item"><div class="detail-label">Service Details</div><div class="detail-value">${Utils.esc(r.service_details||'—')}</div></div>`:''}
  <div class="detail-item"><div class="detail-label">Color / Storage</div><div class="detail-value">${Utils.esc(r.color||'—')} · ${Utils.esc(r.storage_capacity||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Purchase Date</div><div class="detail-value">${Utils.fmtDate(r.purchase_date)}</div></div>
  <div class="detail-item"><div class="detail-label">Invoice</div><div class="detail-value">${Utils.esc(r.invoice_number||'—')}</div></div>
</div>${r.notes?`<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(r.notes)}</div></div>`:''}`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button>${canW?`<button class="btn btn-primary" onclick="MobilesModule.openEdit(${id})">✏️ Edit</button>`:''}`
    });
    setTimeout(()=>{ document.getElementById('mc').onclick=Utils.closeModal; },50);
  }

  function openByUser(id) {
    const row = allRows.find(r => r.id === id); if (!row) return;
    const name = row.assigned_user_name;
    const dept = row.department;
    const devices    = allRows.filter(r => r.assigned_type === 'user' && r.assigned_user_name === name);
    const deptDevices = dept ? allRows.filter(r => r.assigned_type === 'user' && r.department === dept) : [];
    const count      = devices.length;
    const deptCount  = deptDevices.length;
    Utils.openModal({
      title: `📱 ${Utils.esc(name)}`,
      size: 'lg',
      body: `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
  <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border)">
    <div style="font-size:28px;font-weight:700;color:var(--primary)">${count}</div>
    <div>
      <div style="font-weight:600;font-size:13px">Device${count!==1?'s':''} — Personal</div>
      <div style="font-size:11px;color:var(--text-muted)">${Utils.esc(name)}</div>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border)">
    <div style="font-size:28px;font-weight:700;color:var(--accent)">${deptCount}</div>
    <div>
      <div style="font-weight:600;font-size:13px">Device${deptCount!==1?'s':''} — Department</div>
      <div style="font-size:11px;color:var(--text-muted)">${Utils.esc(dept||'No department')}</div>
    </div>
  </div>
</div>
<div class="table-wrapper"><table><thead><tr>
  <th>Asset Tag</th><th>Manufacturer</th><th>Model</th><th>IMEI 1 / IMEI 2</th><th>OS</th><th>Condition</th><th>Warranty</th>
</tr></thead><tbody>
  ${devices.map(d=>`<tr>
    <td><span class="td-mono">${Utils.esc(d.asset_tag||'—')}</span></td>
    <td>${Utils.esc(d.manufacturer||'—')}</td>
    <td>${Utils.esc(d.model||'—')}</td>
    <td>
      <div class="td-mono text-sm">${Utils.esc(d.imei||'—')}</div>
      ${d.imei2?`<div class="td-mono text-sm" style="color:var(--text-muted);margin-top:2px">${Utils.esc(d.imei2)}</div>`:''}
    </td>
    <td><span class="badge badge-info">${Utils.esc(d.os||'—')}</span></td>
    <td>${conditionBadge(d.condition)}</td>
    <td>${mobWarranty(d.warranty_expiry)}</td>
  </tr>`).join('')}
</tbody></table></div>`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button>`
    });
    setTimeout(()=>{ document.getElementById('mc').onclick=Utils.closeModal; },50);
  }

  function deleteRow(id) {
    const r = allRows.find(row=>row.id===id);
    Utils.confirm(`Delete ${r?.asset_tag||''} — ${r?.manufacturer} ${r?.model}?`, async () => {
      try { await API.del(`/api/mobiles/${id}`); Utils.toast('Deleted','success'); allRows=allRows.filter(row=>row.id!==id); renderTable(App.canPerm('mobiles','create'), App.canPerm('mobiles','delete')); }
      catch(e) { Utils.toast(e.message,'error'); }
    });
  }

  return { render, openView, openEdit, openByUser, deleteRow, setSort };
})();
