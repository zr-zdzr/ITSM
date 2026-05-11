/* reports.js */
const ReportsModule = (() => {
  let activeTab = 'warranty';

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>📈 Reports</h2><p>Analytics, exports and warranty tracking</p></div>
  </div>
  <div class="tabs">
    <div class="tab ${activeTab==='warranty'?'active':''}" data-tab="warranty">⚠️ Warranty Report</div>
    <div class="tab ${activeTab==='status'?'active':''}"   data-tab="status">📊 Asset Status</div>
    <div class="tab ${activeTab==='vendor'?'active':''}"   data-tab="vendor">🏢 Vendor Report</div>
    <div class="tab ${activeTab==='employee'?'active':''}" data-tab="employee">👤 Employee Report</div>
    <div class="tab ${activeTab==='full'?'active':''}"     data-tab="full">📋 Full Export</div>
  </div>
  <div id="report-body"></div>
</div>`;
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      renderTab();
    }));
    renderTab();
  }

  function renderTab() {
    const c = document.getElementById('report-body');
    if (!c) return;
    if (activeTab==='warranty')  c.innerHTML = warrantyReport();
    if (activeTab==='status')    c.innerHTML = statusReport();
    if (activeTab==='vendor')    c.innerHTML = vendorReport();
    if (activeTab==='employee')  c.innerHTML = employeeReport();
    if (activeTab==='full')      renderFullExport(c);

    // Bind export buttons
    c.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.export;
        if (t==='warranty') exportWarranty();
        if (t==='status')   exportStatus();
        if (t==='vendor')   exportVendor();
        if (t==='employee') exportEmployee();
        if (t==='full')     exportFull();
      });
    });
  }

  /* ── WARRANTY REPORT ── */
  function warrantyReport() {
    const assets = DB.assets.all();
    const expired  = assets.filter(a => a.warrantyExpiry && Utils.daysUntil(a.warrantyExpiry) < 0).sort((a,b)=>new Date(a.warrantyExpiry)-new Date(b.warrantyExpiry));
    const exp30    = assets.filter(a => { const d=Utils.daysUntil(a.warrantyExpiry); return d!=null&&d>=0&&d<=30; });
    const exp90    = assets.filter(a => { const d=Utils.daysUntil(a.warrantyExpiry); return d!=null&&d>30&&d<=90; });
    const ok       = assets.filter(a => { const d=Utils.daysUntil(a.warrantyExpiry); return d!=null&&d>90; });

    const section = (title, rows, cls) => rows.length===0?'': `
      <div style="margin-bottom:24px">
        <div style="font-size:13px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">${title} <span class="badge badge-${cls==='danger'?'danger':cls==='warning'?'warning':'success'}">${rows.length}</span></div>
        <div class="table-wrapper"><table><thead><tr><th>Asset Tag</th><th>Category</th><th>Brand/Model</th><th>Assigned To</th><th>Expiry Date</th><th>Status</th></tr></thead>
        <tbody>${rows.map(a=>`<tr>
          <td class="td-mono">${Utils.esc(a.assetTag)}</td>
          <td>${Utils.categoryBadge(a.category)}</td>
          <td>${Utils.esc(a.brand)} ${Utils.esc(a.model)}</td>
          <td>${a.assignedTo?Utils.esc(Utils.employeeName(a.assignedTo)):'—'}</td>
          <td>${Utils.warrantyBadge(a.warrantyExpiry)}</td>
          <td>${Utils.statusBadge(a.status)}</td>
        </tr>`).join('')}</tbody></table></div>
      </div>`;

    return `
<div class="card">
  <div class="card-header">
    <div class="card-title">⚠️ Warranty Status Report</div>
    <button class="btn btn-success btn-sm" data-export="warranty">⬇ Export CSV</button>
  </div>
  <div class="kpi-grid" style="margin-bottom:24px">
    <div class="kpi-card danger"><div class="kpi-icon" style="background:var(--danger-dim)">🔴</div><div class="kpi-value">${expired.length}</div><div class="kpi-label">Expired</div></div>
    <div class="kpi-card warning"><div class="kpi-icon" style="background:var(--warning-dim)">🟡</div><div class="kpi-value">${exp30.length}</div><div class="kpi-label">Expiring ≤ 30 days</div></div>
    <div class="kpi-card info"><div class="kpi-icon" style="background:var(--info-dim)">🟠</div><div class="kpi-value">${exp90.length}</div><div class="kpi-label">Expiring ≤ 90 days</div></div>
    <div class="kpi-card success"><div class="kpi-icon" style="background:var(--success-dim)">🟢</div><div class="kpi-value">${ok.length}</div><div class="kpi-label">Healthy</div></div>
  </div>
  ${section('🔴 Expired', expired, 'danger')}
  ${section('🟡 Expiring within 30 days', exp30, 'warning')}
  ${section('🟠 Expiring within 90 days', exp90, 'info')}
  ${section('🟢 Healthy (> 90 days)', ok, 'success')}
</div>`;
  }

  /* ── STATUS REPORT ── */
  function statusReport() {
    const assets = DB.assets.all();
    const byStatus = {};
    assets.forEach(a=>{ byStatus[a.status]=(byStatus[a.status]||[]).concat(a); });
    const byCategory = {};
    assets.forEach(a=>{ byCategory[a.category]=(byCategory[a.category]||[]).concat(a); });
    const total = assets.length||1;
    const catColors = { Laptop:'#6366f1', Desktop:'#22d3ee', Server:'#10b981', 'Network Device':'#f59e0b', Accessory:'#ef4444', Other:'#94a3b8' };

    return `
<div class="grid-2" style="gap:20px;margin-bottom:20px">
  <div class="card">
    <div class="card-title" style="margin-bottom:20px">📊 By Status</div>
    ${Object.entries(byStatus).map(([s,rows])=>{
      const pct=Math.round(rows.length/total*100);
      return `<div class="chart-row" style="margin-bottom:10px">
        <div class="chart-label">${s}</div>
        <div class="chart-bar-track" style="flex:1;height:10px;background:var(--border);border-radius:5px">
          <div style="width:${pct}%;height:100%;border-radius:5px;background:${s==='In Use'?'var(--success)':s==='Available'?'var(--info)':s==='Repair'?'var(--warning)':'var(--text-muted)'};transition:width 0.8s"></div>
        </div>
        <span style="width:80px;text-align:right;font-size:12px;color:var(--text-muted)">${rows.length} (${pct}%)</span>
      </div>`;
    }).join('')}
  </div>
  <div class="card">
    <div class="card-title" style="margin-bottom:20px">📦 By Category</div>
    ${Object.entries(byCategory).map(([c,rows])=>{
      const pct=Math.round(rows.length/total*100);
      return `<div class="chart-row" style="margin-bottom:10px">
        <div class="chart-label">${c}</div>
        <div class="chart-bar-track" style="flex:1;height:10px;background:var(--border);border-radius:5px">
          <div style="width:${pct}%;height:100%;border-radius:5px;background:${catColors[c]||'#6366f1'};transition:width 0.8s"></div>
        </div>
        <span style="width:80px;text-align:right;font-size:12px;color:var(--text-muted)">${rows.length} (${pct}%)</span>
      </div>`;
    }).join('')}
  </div>
</div>
<div class="card">
  <div class="card-header"><div class="card-title">All Assets by Status</div><button class="btn btn-success btn-sm" data-export="status">⬇ Export CSV</button></div>
  <div class="table-wrapper"><table><thead><tr><th>Asset Tag</th><th>Category</th><th>Brand/Model</th><th>Status</th><th>Assigned To</th><th>Location</th><th>Warranty</th></tr></thead>
  <tbody>${assets.sort((a,b)=>a.status.localeCompare(b.status)).map(a=>`<tr>
    <td class="td-mono">${Utils.esc(a.assetTag)}</td>
    <td>${Utils.categoryBadge(a.category)}</td>
    <td>${Utils.esc(a.brand)} ${Utils.esc(a.model)}</td>
    <td>${Utils.statusBadge(a.status)}</td>
    <td>${a.assignedTo?Utils.esc(Utils.employeeName(a.assignedTo)):'—'}</td>
    <td>${Utils.esc(a.location||'—')}</td>
    <td>${Utils.warrantyBadge(a.warrantyExpiry)}</td>
  </tr>`).join('')}</tbody></table></div>
</div>`;
  }

  /* ── VENDOR REPORT ── */
  function vendorReport() {
    const vendors = DB.vendors.all();
    const assets  = DB.assets.all();
    const network = DB.network.all();
    return `
<div class="card">
  <div class="card-header"><div class="card-title">🏢 Vendor Purchase Report</div><button class="btn btn-success btn-sm" data-export="vendor">⬇ Export CSV</button></div>
  <div class="table-wrapper"><table><thead><tr>
    <th>Vendor</th><th>Contact</th><th>Assets Supplied</th><th>Network Devices</th><th>Total Items</th><th>Latest Purchase</th>
  </tr></thead><tbody>
    ${vendors.map(v=>{
      const va = assets.filter(a=>a.vendorId===v.id);
      const vn = network.filter(n=>n.vendorId===v.id);
      const dates = [...va,...vn].map(x=>x.purchaseDate).filter(Boolean).sort();
      const latest = dates[dates.length-1];
      return `<tr>
        <td><div style="font-weight:600">${Utils.esc(v.name)}</div><div class="text-xs text-muted">${Utils.esc(v.email||'')}</div></td>
        <td>${Utils.esc(v.contact||'—')}</td>
        <td><span class="badge badge-primary">${va.length}</span></td>
        <td><span class="badge badge-info">${vn.length}</span></td>
        <td><strong>${va.length+vn.length}</strong></td>
        <td>${Utils.fmtDate(latest)}</td>
      </tr>`;
    }).join('')}
  </tbody></table></div>
</div>`;
  }

  /* ── EMPLOYEE REPORT ── */
  function employeeReport() {
    const emps = DB.employees.all();
    const assets = DB.assets.all();
    const deptMap = {};
    emps.forEach(e=>{ deptMap[e.department]=(deptMap[e.department]||0)+1; });

    return `
<div class="card" style="margin-bottom:20px">
  <div class="card-header"><div class="card-title">👤 Employee Asset Report</div><button class="btn btn-success btn-sm" data-export="employee">⬇ Export CSV</button></div>
  <div class="table-wrapper"><table><thead><tr>
    <th>Employee</th><th>Department</th><th>Role</th><th>Assets Assigned</th><th>Asset Tags</th>
  </tr></thead><tbody>
    ${emps.map(e=>{
      const myAssets = assets.filter(a=>a.assignedTo===e.id);
      return `<tr>
        <td><div style="font-weight:600">${Utils.esc(e.name)}</div><div class="text-xs text-muted">${Utils.esc(e.email)}</div></td>
        <td><span class="badge badge-primary">${Utils.esc(e.department)}</span></td>
        <td>${Utils.esc(e.role||'—')}</td>
        <td><strong>${myAssets.length}</strong></td>
        <td>${myAssets.map(a=>`<span class="td-mono" style="margin-right:4px;font-size:11px">${Utils.esc(a.assetTag)}</span>`).join('')||'<span class="text-muted">None</span>'}</td>
      </tr>`;
    }).join('')}
  </tbody></table></div>
</div>`;
  }

  /* ── FULL EXPORT ── */
  function renderFullExport(c) {
    const s = DB.stats();
    c.innerHTML = `
<div class="card">
  <div class="card-header"><div class="card-title">📋 Full Inventory Export</div></div>
  <div class="grid-2" style="gap:16px;margin-bottom:24px">
    <div class="kpi-card primary"><div class="kpi-icon">📦</div><div class="kpi-value">${s.totalAssets}</div><div class="kpi-label">Total Assets</div></div>
    <div class="kpi-card success"><div class="kpi-icon">👤</div><div class="kpi-value">${s.totalEmployees}</div><div class="kpi-label">Employees</div></div>
    <div class="kpi-card info"><div class="kpi-icon">🏢</div><div class="kpi-value">${s.totalVendors}</div><div class="kpi-label">Vendors</div></div>
    <div class="kpi-card accent"><div class="kpi-icon">🔌</div><div class="kpi-value">${s.accessories}</div><div class="kpi-label">Accessory Lines</div></div>
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border)">
      <div><div style="font-weight:600">💻 All Assets</div><div class="text-xs text-muted">${DB.assets.all().length} records</div></div>
      <button class="btn btn-primary btn-sm" data-export="full">⬇ Export Assets CSV</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border)">
      <div><div style="font-weight:600">🌐 Network Devices</div><div class="text-xs text-muted">${DB.network.all().length} records</div></div>
      <button class="btn btn-primary btn-sm" id="exp-net">⬇ Export Network CSV</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border)">
      <div><div style="font-weight:600">🔌 Accessories</div><div class="text-xs text-muted">${DB.accessories.all().length} records</div></div>
      <button class="btn btn-primary btn-sm" id="exp-acc">⬇ Export Accessories CSV</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border)">
      <div><div style="font-weight:600">🏢 Vendors</div><div class="text-xs text-muted">${DB.vendors.all().length} records</div></div>
      <button class="btn btn-primary btn-sm" id="exp-ven">⬇ Export Vendors CSV</button>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border)">
      <div><div style="font-weight:600">👤 Employees</div><div class="text-xs text-muted">${DB.employees.all().length} records</div></div>
      <button class="btn btn-primary btn-sm" id="exp-emp">⬇ Export Employees CSV</button>
    </div>
  </div>
</div>`;
    c.querySelector('[data-export="full"]')?.addEventListener('click', exportFull);
    c.querySelector('#exp-net')?.addEventListener('click', exportNetwork);
    c.querySelector('#exp-acc')?.addEventListener('click', exportAccess);
    c.querySelector('#exp-ven')?.addEventListener('click', exportVendors);
    c.querySelector('#exp-emp')?.addEventListener('click', exportEmployee);
  }

  /* ── EXPORTS ── */
  const ASSET_COLS = [
    {label:'Asset Tag',key:'assetTag'},{label:'Category',key:'category'},
    {label:'Brand',key:'brand'},{label:'Model',key:'model'},
    {label:'Serial No.',key:'serialNumber'},{label:'Status',key:'status'},
    {label:'Assigned To',key:'assignedTo',render:r=>Utils.employeeName(r.assignedTo)},
    {label:'Department',key:'department'},{label:'Location',key:'location'},
    {label:'Purchase Date',key:'purchaseDate'},{label:'Warranty Expiry',key:'warrantyExpiry'},
    {label:'Vendor',key:'vendorId',render:r=>Utils.vendorName(r.vendorId)},
    {label:'CPU',key:'cpu'},{label:'RAM',key:'ram'},{label:'Storage',key:'storage'},
    {label:'OS',key:'os'},{label:'IP',key:'ipAddress'},{label:'MAC',key:'macAddress'},
  ];

  function exportWarranty() { Utils.exportCSV(DB.assets.all().filter(a=>a.warrantyExpiry).sort((a,b)=>new Date(a.warrantyExpiry)-new Date(b.warrantyExpiry)), 'warranty_report.csv', ASSET_COLS); }
  function exportStatus()   { Utils.exportCSV(DB.assets.all(), 'asset_status_report.csv', ASSET_COLS); }
  function exportFull()     { Utils.exportCSV(DB.assets.all(), 'full_assets_export.csv', ASSET_COLS); }
  function exportNetwork()  { 
    Utils.exportCSV(DB.network.all(),'network_devices.csv',[
      {label:'Asset Tag',key:'assetTag'},{label:'Type',key:'deviceType'},{label:'Brand',key:'brand'},{label:'Model',key:'model'},
      {label:'IP',key:'ipAddress'},{label:'VLAN',key:'vlan'},{label:'Firmware',key:'firmwareVersion'},
      {label:'Location',key:'location'},{label:'Rack',key:'rackLocation'},
      {label:'Vendor',key:'vendorId',render:r=>Utils.vendorName(r.vendorId)},
    ]);
  }
  function exportAccess()  {
    Utils.exportCSV(DB.accessories.all(),'accessories.csv',[
      {label:'Type',key:'type'},{label:'Brand',key:'brand'},{label:'Model',key:'model'},
      {label:'Total Qty',key:'quantity'},{label:'Available',key:'available'},
      {label:'Vendor',key:'vendorId',render:r=>Utils.vendorName(r.vendorId)},
    ]);
  }
  function exportVendors() {
    Utils.exportCSV(DB.vendors.all(),'vendors.csv',[
      {label:'Name',key:'name'},{label:'Contact',key:'contact'},{label:'Phone',key:'phone'},
      {label:'Email',key:'email'},{label:'Address',key:'address'},
    ]);
  }
  function exportEmployee() {
    const assets = DB.assets.all();
    Utils.exportCSV(DB.employees.all(),'employees_report.csv',[
      {label:'Name',key:'name'},{label:'Email',key:'email'},{label:'Department',key:'department'},
      {label:'Role',key:'role'},{label:'Phone',key:'phone'},
      {label:'Assets Count',key:'id',render:r=>assets.filter(a=>a.assignedTo===r.id).length},
      {label:'Asset Tags',key:'id',render:r=>assets.filter(a=>a.assignedTo===r.id).map(a=>a.assetTag).join(', ')},
    ]);
  }
  function exportVendor() { exportVendors(); }

  return { render };
})();
