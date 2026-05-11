/* app.js — Router + Bootstrap */
const App = (() => {

  const PAGES = {
    dashboard:   { title:'Dashboard',       subtitle:'Overview of all IT assets', mod: DashboardModule   },
    assets:      { title:'All Assets',      subtitle:'Manage hardware inventory',  mod: AssetsModule      },
    vendors:     { title:'Vendors',         subtitle:'Supplier management',        mod: VendorsModule     },
    employees:   { title:'Employees',       subtitle:'Staff and asset assignments',mod: EmployeesModule   },
    network:     { title:'Network Devices', subtitle:'Switches, routers, APs',    mod: NetworkModule     },
    accessories: { title:'Accessories',     subtitle:'Peripherals and components', mod: AccessoriesModule },
    reports:     { title:'Reports',         subtitle:'Analytics and exports',      mod: ReportsModule     },
  };

  let current = 'dashboard';

  function navigate(page) {
    if (!PAGES[page]) page = 'dashboard';
    current = page;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    // Update header
    const cfg = PAGES[page];
    document.getElementById('header-page-title').textContent    = cfg.title;
    document.getElementById('header-page-subtitle').textContent = cfg.subtitle;

    // Render module
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    setTimeout(() => cfg.mod.render(), 50);

    // Update URL hash
    history.replaceState(null, '', '#' + page);

    // Update notification dot
    updateNotifDot();
  }

  function updateNotifDot() {
    const expired  = DB.assets.all().filter(a => a.warrantyExpiry && Utils.daysUntil(a.warrantyExpiry) < 0).length;
    const expiring = DB.assets.all().filter(a => { const d=Utils.daysUntil(a.warrantyExpiry); return d!=null&&d>=0&&d<=30; }).length;
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = (expired+expiring) > 0 ? 'block' : 'none';
  }

  function updateBadges() {
    const ab = document.getElementById('badge-assets');
    const eb = document.getElementById('badge-employees');
    if (ab) ab.textContent = DB.assets.all().length;
    if (eb) eb.textContent = DB.employees.all().length;
  }

  function init() {
    // Wire up nav links
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        navigate(el.dataset.page);
      });
    });

    // Sidebar toggle
    const sidebarEl = document.getElementById('sidebar');
    const mainEl    = document.getElementById('main');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    toggleBtn?.addEventListener('click', () => {
      sidebarEl.classList.toggle('collapsed');
      mainEl.classList.toggle('expanded');
      toggleBtn.textContent = sidebarEl.classList.contains('collapsed') ? '▶' : '◀';
    });

    // Close modal on overlay click / ESC
    document.getElementById('modal-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) Utils.closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') Utils.closeModal();
    });

    // Modal close button
    document.getElementById('modal-close-btn')?.addEventListener('click', Utils.closeModal);

    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      navigate(current);
      Utils.toast('Data refreshed', 'info');
    });

    // Notification button → go to reports/warranty
    document.getElementById('notif-btn')?.addEventListener('click', () => navigate('reports'));

    // Global search
    let searchTimer;
    document.getElementById('global-search')?.addEventListener('input', e => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      searchTimer = setTimeout(() => {
        if (q.length >= 2) doGlobalSearch(q);
        else if (q.length === 0) e.target.blur();
      }, 350);
    });

    // Hash-based routing on load
    const hash = location.hash.replace('#','');
    const startPage = PAGES[hash] ? hash : 'dashboard';

    updateBadges();
    navigate(startPage);
  }

  function doGlobalSearch(q) {
    const results = [];
    const ql = q.toLowerCase();

    DB.assets.all().forEach(a => {
      if ([a.assetTag,a.brand,a.model,a.serialNumber,a.ipAddress].some(f=>String(f||'').toLowerCase().includes(ql))) {
        results.push({ type:'Asset', label:`${a.assetTag} — ${a.brand} ${a.model}`, page:'assets', badge:'badge-primary' });
      }
    });
    DB.employees.all().forEach(e => {
      if ([e.name,e.email,e.department].some(f=>String(f||'').toLowerCase().includes(ql))) {
        results.push({ type:'Employee', label:`${e.name} (${e.department})`, page:'employees', badge:'badge-success' });
      }
    });
    DB.vendors.all().forEach(v => {
      if ([v.name,v.contact,v.email].some(f=>String(f||'').toLowerCase().includes(ql))) {
        results.push({ type:'Vendor', label:`${v.name}`, page:'vendors', badge:'badge-info' });
      }
    });
    DB.network.all().forEach(n => {
      if ([n.assetTag,n.brand,n.model,n.ipAddress].some(f=>String(f||'').toLowerCase().includes(ql))) {
        results.push({ type:'Network', label:`${n.assetTag} — ${n.brand} ${n.model}`, page:'network', badge:'badge-accent' });
      }
    });

    if (results.length === 0) {
      Utils.toast(`No results for "${q}"`, 'warning');
      return;
    }

    const body = `
<p style="color:var(--text-muted);font-size:12px;margin-bottom:16px">Found ${results.length} result(s) for "<strong style="color:var(--text-primary)">${Utils.esc(q)}</strong>"</p>
<div style="display:flex;flex-direction:column;gap:8px">
  ${results.slice(0,12).map((r,i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--bg-elevated);border-radius:var(--radius-md);cursor:pointer;border:1px solid var(--border);transition:all 0.2s"
         onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'"
         onclick="Utils.closeModal();App.navigate('${r.page}')">
      <span class="badge ${r.badge}">${Utils.esc(r.type)}</span>
      <span style="flex:1;font-size:13px">${Utils.esc(r.label)}</span>
      <span style="color:var(--text-muted);font-size:12px">→</span>
    </div>`).join('')}
</div>`;

    Utils.openModal({
      title:`🔍 Search: "${q}"`,
      body,
      footer:`<button class="btn btn-secondary" id="mc">Close</button>`
    });
    setTimeout(()=>{ document.getElementById('mc').onclick = Utils.closeModal; },50);
    document.getElementById('global-search').value = '';
  }

  return { navigate, init };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
