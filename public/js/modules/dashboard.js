/* dashboard.js */
const DashboardModule = (() => {
  function render() {
    const s = DB.stats();
    const assets = DB.assets.all();
    const activity = DB.activity.all();

    const catCounts = {};
    assets.forEach(a => { catCounts[a.category] = (catCounts[a.category]||0)+1; });
    const catColors = { Laptop:'#6366f1', Desktop:'#22d3ee', Server:'#10b981', 'Network Device':'#f59e0b', Accessory:'#ef4444', Other:'#94a3b8' };

    const warrantyItems = assets
      .filter(a => a.warrantyExpiry)
      .map(a => ({ ...a, days: Utils.daysUntil(a.warrantyExpiry) }))
      .filter(a => a.days <= 90)
      .sort((a,b) => a.days - b.days)
      .slice(0, 5);

    const actIcons = { assigned:'🔗', added:'➕', repair:'🔧', retired:'🗑️', updated:'✏️' };

    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="kpi-grid">
    <div class="kpi-card primary stagger-1 animate-in" id="kpi-total" style="cursor:pointer">
      <div class="kpi-icon">📦</div>
      <div class="kpi-value">${s.totalAssets}</div>
      <div class="kpi-label">Total Assets</div>
      <div class="kpi-sub">Laptops, Desktops, Servers, Network</div>
    </div>
    <div class="kpi-card success stagger-2 animate-in" id="kpi-inuse" style="cursor:pointer">
      <div class="kpi-icon">✅</div>
      <div class="kpi-value">${s.inUse}</div>
      <div class="kpi-label">In Use</div>
      <div class="kpi-sub">Currently assigned to employees</div>
    </div>
    <div class="kpi-card info stagger-3 animate-in" id="kpi-avail" style="cursor:pointer">
      <div class="kpi-icon">📬</div>
      <div class="kpi-value">${s.available}</div>
      <div class="kpi-label">Available</div>
      <div class="kpi-sub">Ready to assign</div>
    </div>
    <div class="kpi-card warning stagger-4 animate-in" id="kpi-repair" style="cursor:pointer">
      <div class="kpi-icon">🔧</div>
      <div class="kpi-value">${s.repair}</div>
      <div class="kpi-label">Under Repair</div>
      <div class="kpi-sub">In workshop or faulty</div>
    </div>
    <div class="kpi-card danger stagger-5 animate-in" id="kpi-warranty" style="cursor:pointer">
      <div class="kpi-icon">⚠️</div>
      <div class="kpi-value">${s.warrantyExpired + s.warrantyExpiring}</div>
      <div class="kpi-label">Warranty Alerts</div>
      <div class="kpi-sub">${s.warrantyExpired} expired · ${s.warrantyExpiring} expiring soon</div>
    </div>
    <div class="kpi-card accent stagger-1 animate-in">
      <div class="kpi-icon">👤</div>
      <div class="kpi-value">${s.totalEmployees}</div>
      <div class="kpi-label">Employees</div>
      <div class="kpi-sub">${s.totalVendors} vendors registered</div>
    </div>
  </div>

  <div class="grid-2" style="gap:20px;margin-bottom:20px">
    <div class="card animate-in stagger-2">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--primary-dim)">📊</div>
          Asset Breakdown
        </div>
        <button class="btn btn-secondary btn-sm" onclick="App.navigate('assets')">View All</button>
      </div>
      <div class="mini-chart" id="category-chart"></div>
    </div>

    <div class="card animate-in stagger-3">
      <div class="card-header">
        <div class="card-title">
          <div class="card-title-icon" style="background:var(--warning-dim)">⏰</div>
          Warranty Expiring
        </div>
        <button class="btn btn-secondary btn-sm" onclick="App.navigate('reports')">Full Report</button>
      </div>
      <div id="warranty-list">
        ${warrantyItems.length === 0
          ? '<div class="empty-state" style="padding:30px 0"><div class="empty-state-icon">🎉</div><p>All warranties are up to date</p></div>'
          : warrantyItems.map(a => {
            const cls = a.days < 0 ? 'expired' : a.days <= 30 ? 'expiring' : 'ok';
            const lbl = a.days < 0 ? `Expired ${Math.abs(a.days)}d ago` : `${a.days} days left`;
            return `<div class="warranty-alert ${cls}" onclick="App.navigate('assets')">
              <div class="warranty-alert-icon">${a.days < 0 ? '🔴' : a.days <= 30 ? '🟡' : '🟢'}</div>
              <div class="warranty-alert-info">
                <h4>${Utils.esc(a.brand)} ${Utils.esc(a.model)}</h4>
                <p>${Utils.esc(a.assetTag)} · ${Utils.esc(a.category)}</p>
              </div>
              <div class="warranty-alert-date">${lbl}</div>
            </div>`;
          }).join('')}
      </div>
    </div>
  </div>

  <div class="card animate-in stagger-4">
    <div class="card-header">
      <div class="card-title">
        <div class="card-title-icon" style="background:var(--accent-dim)">⚡</div>
        Recent Activity
      </div>
    </div>
    <div class="activity-feed">
      ${activity.slice(0,8).map(a => `
        <div class="activity-item">
          <div class="activity-dot" style="background:var(--primary)"></div>
          <div class="activity-content">
            <div class="activity-text"><strong>${Utils.esc(a.subject)}</strong> — ${Utils.esc(a.detail)}</div>
            <div class="activity-time">${Utils.timeAgo(a.ts)}</div>
          </div>
          <span style="font-size:18px">${actIcons[a.action]||'📋'}</span>
        </div>`).join('') || '<div class="empty-state" style="padding:24px 0"><p>No recent activity</p></div>'}
    </div>
  </div>
</div>`;

    // Build category chart
    const total = Object.values(catCounts).reduce((a,b)=>a+b,0)||1;
    const chartEl = document.getElementById('category-chart');
    if (chartEl) {
      chartEl.innerHTML = Object.entries(catCounts).map(([cat,cnt]) => `
        <div class="chart-row">
          <div class="chart-label">${cat}</div>
          <div class="chart-bar-track"><div class="chart-bar-fill" style="width:0;background:${catColors[cat]||'#6366f1'}" data-w="${Math.round(cnt/total*100)}"></div></div>
          <div class="chart-val">${cnt}</div>
        </div>`).join('');
      setTimeout(() => {
        chartEl.querySelectorAll('.chart-bar-fill').forEach(b => { b.style.width = b.dataset.w + '%'; });
      }, 100);
    }

    // KPI click shortcuts
    document.getElementById('kpi-total')?.addEventListener('click',   () => App.navigate('assets'));
    document.getElementById('kpi-inuse')?.addEventListener('click',   () => App.navigate('assets'));
    document.getElementById('kpi-avail')?.addEventListener('click',   () => App.navigate('assets'));
    document.getElementById('kpi-repair')?.addEventListener('click',  () => App.navigate('assets'));
    document.getElementById('kpi-warranty')?.addEventListener('click',() => App.navigate('reports'));
  }

  return { render };
})();
