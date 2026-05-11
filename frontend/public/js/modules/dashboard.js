/* dashboard.js */
const DashboardModule = (() => {
  let charts = [];

  function destroyCharts() {
    charts.forEach(c => c.destroy());
    charts = [];
  }

  function render() {
    destroyCharts();
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    API.get('/api/reports/dashboard').then(data => {
      const byStatus = (arr) => {
        const m = {}; arr.forEach(r => m[r.status] = +r.n); return m;
      };
      const sys = byStatus(data.systems);
      const mob = byStatus(data.mobiles);
      const gws = byStatus(data.gws);
      const totalSys = Object.values(sys).reduce((a,b)=>a+b,0);
      const totalNet = data.networkDevices.reduce((a,r)=>a+ +r.n,0);
      const totalMob = Object.values(mob).reduce((a,b)=>a+b,0);
      const totalSim = data.sims.reduce((a,r)=>a+ +r.n,0);
      const totalGws = Object.values(gws).reduce((a,b)=>a+b,0);
      const lic = {}; (data.gwsLicense||[]).forEach(r => { lic[r.license] = +r.n; });
      const typ = {}; (data.gwsType||[]).forEach(r => { typ[r.account_type] = +r.n; });
      const simPkg = (data.simPackages||[]);

      document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="kpi-grid">
    <div class="kpi-card primary stagger-1 animate-in" style="cursor:pointer" onclick="App.navigate('systems')">
      <div class="kpi-icon">💻</div><div class="kpi-value">${totalSys}</div>
      <div class="kpi-label">PC / Systems</div>
      <div class="kpi-sub">${sys.in_use||0} in use · ${sys.available||0} available</div>
    </div>
    <div class="kpi-card info stagger-2 animate-in" style="cursor:pointer" onclick="App.navigate('network')">
      <div class="kpi-icon">🌐</div><div class="kpi-value">${totalNet}</div>
      <div class="kpi-label">Network Devices</div>
      <div class="kpi-sub">${data.networkDevices.map(r=>r.device_type+': '+r.n).join(' · ')}</div>
    </div>
    <div class="kpi-card success stagger-3 animate-in" style="cursor:pointer" onclick="App.navigate('mobiles')">
      <div class="kpi-icon">📱</div><div class="kpi-value">${totalMob}</div>
      <div class="kpi-label">Mobile Phones</div>
      <div class="kpi-sub">${mob.in_use||0} in use · ${mob.available||0} available</div>
    </div>
    <div class="kpi-card accent stagger-4 animate-in" style="cursor:pointer" onclick="App.navigate('sims')">
      <div class="kpi-icon">📶</div><div class="kpi-value">${totalSim}</div>
      <div class="kpi-label">SIM Cards</div>
      <div class="kpi-sub">
        <span style="color:var(--success)">${data.sims.filter(r=>r.status==='active').reduce((a,r)=>a+ +r.n,0)} active</span> · <span style="color:var(--danger)">${data.sims.filter(r=>r.status==='suspended').reduce((a,r)=>a+ +r.n,0)} suspended</span><br>
        ${simPkg.map(p=>`${Utils.esc(p.package_name)}: ${p.n}`).join(' · ')||'No packages'}
      </div>
    </div>
    <div class="kpi-card warning stagger-5 animate-in" style="cursor:pointer" onclick="App.navigate('gws')">
      <div class="kpi-icon">☁️</div><div class="kpi-value">${totalGws}</div>
      <div class="kpi-label">Cloud IDs</div>
      <div class="kpi-sub">
        <span style="color:var(--success)">${gws.active||0} active</span> · <span style="color:var(--danger)">${gws.suspended||0} suspended</span><br>
        Starter: ${lic['Starter']||0} · Standard: ${lic['Standard']||0} · Vault: ${lic['Vault']||0} · N/A: ${lic['Not Assigned']||0}<br>
        User: ${typ['user']||0} · Service: ${typ['service_account']||0}
      </div>
    </div>
    <div class="kpi-card danger stagger-1 animate-in">
      <div class="kpi-icon">⚠️</div><div class="kpi-value">${data.warrantyExpired + data.warrantySoon}</div>
      <div class="kpi-label">Warranty Alerts</div>
      <div class="kpi-sub">${data.warrantyExpired} expired · ${data.warrantySoon} expiring soon</div>
    </div>
  </div>

  <div class="charts-grid">
    <div class="chart-card">
      <div class="chart-title">System Status</div>
      <canvas id="chart-systems" height="220"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">Network Devices by Type</div>
      <canvas id="chart-network" height="220"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">SIM Cards by Carrier</div>
      <canvas id="chart-sims" height="220"></canvas>
    </div>
    <div class="chart-card">
      <div class="chart-title">GWS Account Status</div>
      <canvas id="chart-gws" height="220"></canvas>
    </div>
  </div>

  <div class="section-grid">
    <div class="section-card">
      <div class="section-card-title">🕒 Recent Activity</div>
      <div class="activity-list">
        ${data.recentActivity.length === 0
          ? '<p style="color:var(--text-muted);font-size:13px;padding:12px 0">No activity yet</p>'
          : data.recentActivity.map(a => `
          <div class="activity-item">
            <div class="activity-dot"></div>
            <div class="activity-content">
              <div class="activity-title">${Utils.esc(a.action)} — ${Utils.esc(a.record_label||'')}</div>
              <div class="activity-meta">${Utils.esc(a.user_name||'System')} · ${Utils.fmtDate(a.created_at)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>
  </div>
</div>`;

      const COLORS = ['#6366f1','#22d3ee','#10b981','#f59e0b','#ef4444','#94a3b8','#8b5cf6'];
      const opts = { plugins: { legend: { position: 'right', labels: { color:'#94a3b8', boxWidth:12, padding:12 } } }, animation: { duration: 600 } };

      const mkDoughnut = (id, labels, values) => {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        charts.push(new Chart(ctx, { type:'doughnut', data:{ labels, datasets:[{ data:values, backgroundColor:COLORS, borderWidth:2, borderColor:'#1a2332' }] }, options:opts }));
      };

      mkDoughnut('chart-systems',
        Object.keys(sys).map(k=>k.replace('_',' ')), Object.values(sys));
      mkDoughnut('chart-network',
        data.networkDevices.map(r=>r.device_type), data.networkDevices.map(r=>+r.n));

      // SIMs by carrier
      const simByCarrier = {};
      data.sims.forEach(r => { simByCarrier[r.vendor] = (simByCarrier[r.vendor]||0) + +r.n; });
      mkDoughnut('chart-sims', Object.keys(simByCarrier), Object.values(simByCarrier));

      mkDoughnut('chart-gws', Object.keys(gws), Object.values(gws));

    }).catch(e => {
      document.getElementById('page-content').innerHTML = `<div class="empty-state"><div class="empty-state-icon">❌</div><h3>Failed to load dashboard</h3><p>${Utils.esc(e.message)}</p></div>`;
    });
  }

  return { render };
})();
