/* reports.js */
const ReportsModule = (() => {
  let charts = [];
  function destroyCharts() { charts.forEach(c=>c.destroy()); charts=[]; }

  async function render() {
    destroyCharts();
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>📈 Reports</h2><p>Analytics, exports and insights</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="rep-full-export">⬇ Full Report CSV</button>
    </div>
  </div>
  <div class="reports-tabs">
    <button class="rep-tab active" data-tab="warranty">⚠️ Warranty</button>
    <button class="rep-tab" data-tab="assignments">👤 Assignments</button>
    <button class="rep-tab" data-tab="by-brand">🏷 By Brand</button>
    <button class="rep-tab" data-tab="by-asset-tag">🔍 By Asset Tag</button>
    <button class="rep-tab" data-tab="sim-costs">📶 SIM Costs</button>
    <button class="rep-tab" data-tab="gws-report">☁️ Cloud IDs</button>
    <button class="rep-tab" data-tab="elog">📋 eLog</button>
  </div>
  <div id="rep-content"></div>
</div>`;

    document.getElementById('rep-full-export').addEventListener('click', () => API.get('/api/reports/summary/csv'));
    document.querySelectorAll('.rep-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rep-tab').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        loadTab(btn.dataset.tab);
      });
    });
    loadTab('warranty');
  }

  async function loadTab(tab) {
    destroyCharts();
    const el = document.getElementById('rep-content');
    el.innerHTML = '<div class="spinner"></div>';
    try {
      if (tab === 'warranty')     await renderWarranty(el);
      if (tab === 'assignments')  await renderAssignments(el);
      if (tab === 'by-brand')     await renderByBrand(el);
      if (tab === 'by-asset-tag') await renderByAssetTag(el);
      if (tab === 'sim-costs')    await renderSimCosts(el);
      if (tab === 'gws-report')   await renderGWSReport(el);
      if (tab === 'elog')         await renderELog(el);
    } catch(e) { el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><p>${Utils.esc(e.message)}</p></div>`; }
  }

  async function renderWarranty(el) {
    const rows = await API.get('/api/reports/warranty');
    const expired = rows.filter(r=>r.days_remaining<0);
    const soon    = rows.filter(r=>r.days_remaining>=0&&r.days_remaining<=90);
    const ok      = rows.filter(r=>r.days_remaining>90);

    el.innerHTML = `
<div class="kpi-grid" style="margin-top:16px">
  <div class="kpi-card danger animate-in"><div class="kpi-icon">❌</div><div class="kpi-value">${expired.length}</div><div class="kpi-label">Expired</div></div>
  <div class="kpi-card warning animate-in"><div class="kpi-icon">⚠️</div><div class="kpi-value">${soon.length}</div><div class="kpi-label">Expiring in 90 days</div></div>
  <div class="kpi-card success animate-in"><div class="kpi-icon">✅</div><div class="kpi-value">${ok.length}</div><div class="kpi-label">Valid</div></div>
</div>
<div style="margin-top:24px">
  <button class="btn btn-secondary" onclick="API.get('/api/reports/warranty').then(rows=>{window.open('data:text/csv,'+encodeURIComponent(['serial_number,manufacturer,model,warranty_expiry,days_remaining,status,assigned_user_name'].concat(rows.map(r=>[r.serial_number,r.manufacturer,r.model,r.warranty_expiry,r.days_remaining,r.status,r.assigned_user_name].join(','))).join('\n')))})">⬇ Export Warranty CSV</button>
</div>
<div class="table-wrapper" style="margin-top:16px">
  <table><thead><tr><th>Serial Number</th><th>Device</th><th>Assigned To</th><th>Warranty Expiry</th><th>Days</th></tr></thead>
  <tbody>${rows.map(r=>`
    <tr>
      <td><span class="td-mono">${Utils.esc(r.serial_number)}</span></td>
      <td>${Utils.esc(r.manufacturer||r.system_category||'')}&nbsp;${Utils.esc(r.model||'')}</td>
      <td>${r.assigned_user_name?Utils.esc(r.assigned_user_name):'<span class="badge badge-muted">IT Inventory</span>'}</td>
      <td>${Utils.warrantyBadge(r.warranty_expiry)}</td>
      <td style="font-weight:600;color:${r.days_remaining<0?'var(--danger)':r.days_remaining<=30?'var(--warning)':'var(--success)'}">${r.days_remaining} days</td>
    </tr>`).join('')}</tbody></table>
</div>`;
  }

  async function renderAssignments(el) {
    const data = await API.get('/api/reports/assignments');
    const allUsers = {};
    [...data.systems, ...data.mobiles, ...data.sims].forEach(row => {
      if (!allUsers[row.email]) allUsers[row.email] = { name:row.name, department:row.department, items:[] };
      (row.items||[]).forEach(item => allUsers[row.email].items.push(item));
    });

    el.innerHTML = `
<div style="margin-top:16px">
  ${Object.entries(allUsers).length === 0
    ? '<div class="empty-state"><div class="empty-state-icon">👤</div><h3>No assignments yet</h3></div>'
    : Object.entries(allUsers).map(([email, u]) => `
    <div class="section-card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-weight:600">${Utils.esc(u.name)}</div>
          <div class="text-xs text-muted">${Utils.esc(email)} · ${Utils.esc(u.department||'—')}</div>
        </div>
        <span class="badge badge-primary">${u.items.length} item${u.items.length!==1?'s':''}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${u.items.map(item=>`<div class="badge badge-info">${Utils.esc(item.type)}: ${Utils.esc(item.label||item.model||'')}</div>`).join('')}
      </div>
    </div>`).join('')}
</div>`;
  }

  async function renderByBrand(el) {
    const data = await API.get('/api/reports/by-brand');

    function brandTable(rows, title) {
      if (!rows.length) return `<p class="text-muted" style="font-size:13px">No data</p>`;
      return `
<div style="margin-bottom:24px">
  <h4 style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">${title}</h4>
  <div class="table-wrapper">
    <table><thead><tr><th>Brand</th><th>Count</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td><span class="badge badge-info">${Utils.esc(r.brand)}</span></td><td style="font-weight:600">${r.cnt}</td></tr>`).join('')}</tbody></table>
  </div>
</div>`;
    }

    el.innerHTML = `
<div style="margin-top:16px">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px">
    <div>${brandTable(data.systems,  '🖥️ Systems by Manufacturer')}</div>
    <div>${brandTable(data.mobiles,  '📱 Mobiles by Manufacturer')}</div>
    <div>${brandTable(data.network,  '🌐 Network by Brand')}</div>
  </div>
</div>`;
  }

  async function renderByAssetTag(el) {
    el.innerHTML = `
<div style="margin-top:16px">
  <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center">
    <div class="search-box" style="flex:1;max-width:400px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="at-search" type="text" placeholder="Search by asset tag…"/>
    </div>
    <button class="btn btn-primary" id="at-go">Search</button>
  </div>
  <div id="at-results"></div>
</div>`;

    async function search() {
      const q = document.getElementById('at-search').value.trim();
      const res = document.getElementById('at-results');
      res.innerHTML = '<div class="spinner"></div>';
      try {
        const data = await API.get('/api/reports/by-asset-tag' + (q ? `?q=${encodeURIComponent(q)}` : ''));
        const allRows = [...data.systems.map(r=>({...r,_type:'System'})), ...data.mobiles.map(r=>({...r,_type:'Mobile'}))];
        if (!allRows.length) { res.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>No matching assets</h3></div>'; return; }
        res.innerHTML = `
<div class="table-wrapper">
  <table><thead><tr>
    <th>Asset Tag</th><th>Type</th><th>Manufacturer</th><th>Model</th><th>Serial Number</th>
    <th>Status</th><th>Condition</th><th>Department</th><th>Assigned To</th>
  </tr></thead>
  <tbody>${allRows.map(r=>`
    <tr>
      <td><span class="td-mono" style="font-weight:600">${Utils.esc(r.asset_tag||'—')}</span></td>
      <td><span class="badge ${r._type==='System'?'badge-primary':'badge-info'}">${Utils.esc(r._type)}</span>${r.type?` <span class="text-xs text-muted">${Utils.esc(r.type)}</span>`:''}</td>
      <td>${Utils.esc(r.manufacturer||'—')}</td>
      <td>${Utils.esc(r.model||'—')}</td>
      <td><span class="td-mono text-sm">${Utils.esc(r.serial_number||'—')}</span></td>
      <td>${Utils.statusBadge(r.status)}</td>
      <td>${r.condition?`<span class="badge ${r.condition==='Working'?'badge-success':'badge-danger'}">${Utils.esc(r.condition)}</span>`:'<span class="text-muted">—</span>'}</td>
      <td>${Utils.esc(r.department||'—')}</td>
      <td>${r.assigned_user_name?Utils.esc(r.assigned_user_name):'<span class="badge badge-muted">IT Inventory</span>'}</td>
    </tr>`).join('')}
  </tbody></table>
</div>`;
      } catch(e) { res.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">${Utils.esc(e.message)}</p></div>`; }
    }

    document.getElementById('at-go').addEventListener('click', search);
    document.getElementById('at-search').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    search();
  }

  async function renderSimCosts(el) {
    const rows = await API.get('/api/reports/sim-costs');
    const total = rows.reduce((a,r)=>a+(+r.total_monthly||0),0);
    const COLORS = ['#6366f1','#22d3ee','#10b981','#f59e0b','#ef4444'];

    el.innerHTML = `
<div class="kpi-grid" style="margin-top:16px">
  <div class="kpi-card primary animate-in"><div class="kpi-icon">📶</div><div class="kpi-value">PKR ${total.toLocaleString()}</div><div class="kpi-label">Monthly SIM Cost</div></div>
</div>
<div class="charts-grid" style="margin-top:16px">
  <div class="chart-card">
    <div class="chart-title">Cost by Carrier</div>
    <canvas id="chart-sim-costs" height="240"></canvas>
  </div>
  <div class="chart-card">
    <div class="chart-title">SIM Count by Carrier</div>
    <canvas id="chart-sim-count" height="240"></canvas>
  </div>
</div>
<div class="table-wrapper" style="margin-top:16px">
  <table><thead><tr><th>Carrier</th><th>Active SIMs</th><th>Monthly Cost</th><th>Avg per SIM</th></tr></thead>
  <tbody>${rows.map(r=>`
    <tr>
      <td><span class="badge badge-info">${Utils.esc(r.vendor)}</span></td>
      <td>${r.count}</td>
      <td style="font-weight:600">PKR ${Number(r.total_monthly||0).toLocaleString()}</td>
      <td>PKR ${r.count>0?Math.round(r.total_monthly/r.count).toLocaleString():0}</td>
    </tr>`).join('')}</tbody></table>
</div>`;

    setTimeout(()=>{
      const opts={plugins:{legend:{position:'right',labels:{color:'#94a3b8',boxWidth:12}}},animation:{duration:600}};
      const mkD=(id,labels,data)=>{const ctx=document.getElementById(id);if(!ctx)return;charts.push(new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:COLORS,borderWidth:2,borderColor:'#1a2332'}]},options:opts}));};
      mkD('chart-sim-costs',rows.map(r=>r.vendor),rows.map(r=>+r.total_monthly||0));
      mkD('chart-sim-count',rows.map(r=>r.vendor),rows.map(r=>+r.count));
    },100);
  }

  async function renderGWSReport(el) {
    const rows = await API.get('/api/reports/gws');
    const noTFA     = rows.filter(r => !r.two_fa && r.status==='active').length;
    const suspended = rows.filter(r => r.status==='suspended').length;
    const roleColor = {'Super Admin':'badge-danger','Admin':'badge-warning','User':'badge-info'};
    const licColor  = {Starter:'badge-muted',Standard:'badge-primary',Vault:'badge-success'};

    el.innerHTML = `
<div class="kpi-grid" style="margin-top:16px">
  <div class="kpi-card danger animate-in"><div class="kpi-icon">🔓</div><div class="kpi-value">${noTFA}</div><div class="kpi-label">Active — 2FA Off</div></div>
  <div class="kpi-card warning animate-in"><div class="kpi-icon">⏸</div><div class="kpi-value">${suspended}</div><div class="kpi-label">Suspended</div></div>
  <div class="kpi-card success animate-in"><div class="kpi-icon">☁️</div><div class="kpi-value">${rows.length}</div><div class="kpi-label">Total Cloud IDs</div></div>
</div>
<div class="table-wrapper" style="margin-top:16px">
  <table><thead><tr><th>Email</th><th>Name</th><th>Org Unit</th><th>Role</th><th>License</th><th>2FA</th><th>Status</th></tr></thead>
  <tbody>${rows.map(r=>`
    <tr>
      <td><span class="td-mono" style="color:var(--primary);font-size:12px">${Utils.esc(r.email)}</span></td>
      <td>${Utils.esc(r.display_name)}</td>
      <td><span class="text-sm text-muted">${Utils.esc(r.org_unit||'—')}</span></td>
      <td><span class="badge ${roleColor[r.gws_role]||'badge-muted'}">${Utils.esc(r.gws_role||'—')}</span></td>
      <td>${r.license?`<span class="badge ${licColor[r.license]||'badge-muted'}">${Utils.esc(r.license)}</span>`:'<span class="text-muted">—</span>'}</td>
      <td>${r.two_fa?'<span class="badge badge-success">✔</span>':'<span class="badge badge-danger">✘</span>'}</td>
      <td><span class="badge ${{active:'badge-success',suspended:'badge-warning',deleted:'badge-danger'}[r.status]||'badge-muted'}">${r.status}</span></td>
    </tr>`).join('')}</tbody></table>
</div>`;
  }

  async function renderELog(el) {
    const ACTION_COLOR = {
      login:'badge-success', logout:'badge-muted', login_failed:'badge-danger', login_blocked:'badge-danger',
      created:'badge-primary', updated:'badge-warning', deleted:'badge-danger',
      imported:'badge-info', bulk_updated:'badge-warning', deleted_all:'badge-danger',
      password_changed:'badge-warning', password_reset:'badge-warning',
    };
    const TABLE_LABELS = {
      auth:'🔐 Auth', users:'👥 Users', systems:'🖥️ Systems', mobiles:'📱 Mobiles',
      sims:'📶 SIMs', network:'🌐 Network', gws:'☁️ GWS', employees:'👤 Employees',
    };

    let rows = [], filter = { table_name:'', action:'' };

    async function load() {
      el.innerHTML = '<div class="spinner"></div>';
      const q = new URLSearchParams();
      if (filter.table_name) q.set('table_name', filter.table_name);
      if (filter.action)     q.set('action', filter.action);
      q.set('limit', 500);
      rows = await API.get('/api/reports/elog?' + q.toString());
      renderLog();
    }

    function renderLog() {
      el.innerHTML = `
<div style="margin-top:16px">
  <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <select class="filter-select" id="elog-table" style="min-width:150px">
      <option value="">All Modules</option>
      ${Object.entries(TABLE_LABELS).map(([k,v])=>`<option value="${k}" ${filter.table_name===k?'selected':''}>${v}</option>`).join('')}
    </select>
    <input class="form-control" id="elog-action" placeholder="Filter by action…" value="${Utils.esc(filter.action)}" style="max-width:200px"/>
    <button class="btn btn-secondary" id="elog-clear">Clear</button>
    <span class="text-sm text-muted" style="margin-left:auto">${rows.length} entries</span>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th>Time</th><th>User</th><th>IP Address</th><th>Action</th><th>Module</th><th>Record</th><th>Details</th>
    </tr></thead>
    <tbody>
      ${rows.length ? rows.map(r=>`
        <tr>
          <td style="white-space:nowrap"><span class="text-sm text-muted">${Utils.fmtDate(r.created_at)} ${new Date(r.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></td>
          <td>
            <div style="font-size:12px;font-weight:500">${r.user_name?Utils.esc(r.user_name):'<span class="text-muted">—</span>'}</div>
            <div style="font-size:11px;color:var(--text-muted)">${r.user_email?Utils.esc(r.user_email):''}</div>
          </td>
          <td><span class="td-mono" style="font-size:11px">${r.ip_address?Utils.esc(r.ip_address):'<span class="text-muted">—</span>'}</span></td>
          <td><span class="badge ${ACTION_COLOR[r.action]||'badge-muted'}">${Utils.esc(r.action?.replace(/_/g,' '))}</span></td>
          <td><span class="text-sm text-muted">${TABLE_LABELS[r.table_name]||Utils.esc(r.table_name||'—')}</span></td>
          <td><span class="text-sm">${r.record_label?Utils.esc(r.record_label):'<span class="text-muted">—</span>'}</span></td>
          <td><span class="text-sm text-muted">${r.details?Utils.esc(r.details):'—'}</span></td>
        </tr>`).join('')
        : `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📋</div><h3>No log entries</h3></div></td></tr>`}
    </tbody></table>
  </div>
</div>`;
      document.getElementById('elog-table').addEventListener('change', e => { filter.table_name=e.target.value; load(); });
      document.getElementById('elog-action').addEventListener('input', e => { filter.action=e.target.value; });
      document.getElementById('elog-action').addEventListener('keydown', e => { if (e.key==='Enter') load(); });
      document.getElementById('elog-clear').addEventListener('click', () => { filter={table_name:'',action:''}; load(); });
    }

    await load();
  }

  return { render };
})();
