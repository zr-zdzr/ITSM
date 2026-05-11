/* app.js — Router + Bootstrap */
const App = (() => {
  let currentUser = null;

  const PAGES = {
    dashboard: { title:'Dashboard',        subtitle:'IT inventory overview',           mod: DashboardModule   },
    systems:   { title:'Systems',           subtitle:'Laptop, desktop and server inventory', mod: SystemsModule },
    network:   { title:'Network Devices',  subtitle:'Switches, routers, firewalls',    mod: NetworkModule     },
    mobiles:   { title:'Mobile Phones',    subtitle:'Company mobile device inventory', mod: MobilesModule     },
    sims:      { title:'SIM Cards',        subtitle:'SIM card management',             mod: SIMsModule        },
    gws:       { title:'Cloud IDs',         subtitle:'Cloud account management',        mod: GWSModule         },
    employees: { title:'Employees',        subtitle:'Company employee directory',      mod: EmployeesModule   },
    reports:   { title:'Reports',          subtitle:'Analytics and exports',           mod: ReportsModule     },
    users:     { title:'User Management',  subtitle:'System access control',           mod: UsersModule       },
  };

  // Check if current user has a given permission for a module.
  // super_admin bypasses all checks (returns true).
  // For user role, checks the permissions object from /me.
  function canPerm(module, action) {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    const perms = currentUser.permissions;
    if (!perms) return false;
    return perms[module]?.[`can_${action}`] === true;
  }

  function navigate(page) {
    if (!PAGES[page]) page = 'dashboard';
    if (page === 'users' && currentUser?.role !== 'super_admin') page = 'dashboard';

    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page));

    const cfg = PAGES[page];
    document.getElementById('header-page-title').textContent    = cfg.title;
    document.getElementById('header-page-subtitle').textContent = cfg.subtitle;
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    history.replaceState(null, '', '#' + page);
    setTimeout(() => cfg.mod.render(), 30);
  }

  function openChangePassword() {
    Utils.openModal({
      title: '🔑 Change Password', size: 'sm',
      body: `
<div class="form-group">
  <label class="form-label required">Current Password</label>
  <input class="form-control" type="password" id="cp-cur" placeholder="Current password" autocomplete="current-password"/>
</div>
<div class="form-group">
  <label class="form-label required">New Password</label>
  <input class="form-control" type="password" id="cp-new" placeholder="Min 6 characters" autocomplete="new-password"/>
</div>
<div class="form-group">
  <label class="form-label required">Confirm New Password</label>
  <input class="form-control" type="password" id="cp-con" placeholder="Repeat new password" autocomplete="new-password"/>
</div>`,
      footer: `<button class="btn btn-secondary" id="cp-cancel">Cancel</button>
               <button class="btn btn-primary"   id="cp-save">Change Password</button>`
    });
    setTimeout(() => {
      document.getElementById('cp-cancel').onclick = Utils.closeModal;
      document.getElementById('cp-save').onclick = async () => {
        const cur = document.getElementById('cp-cur').value?.trim();
        const nw  = document.getElementById('cp-new').value?.trim();
        const con = document.getElementById('cp-con').value?.trim();
        if (!cur || !nw || !con) return Utils.toast('All fields are required', 'error');
        if (nw.length < 6) return Utils.toast('New password must be at least 6 characters', 'error');
        if (nw !== con)    return Utils.toast('New passwords do not match', 'error');
        try {
          await API.post('/auth/change-password', { current_password: cur, new_password: nw });
          Utils.closeModal(); Utils.toast('Password changed successfully', 'success');
        } catch(e) { Utils.toast(e.message, 'error'); }
      };
    }, 50);
  }

  function setUserUI(user) {
    currentUser = user;
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-role').textContent = ({ super_admin:'Super Admin', user:'User', viewer:'Viewer' })[user.role] || user.role;
    const headerName = document.getElementById('header-user-name');
    if (headerName) headerName.textContent = user.name;
    if (user.avatar_url) {
      const img = document.getElementById('user-avatar');
      img.src = user.avatar_url; img.style.display = 'block';
    }
    if (user.role === 'super_admin') {
      document.getElementById('admin-nav').style.display = 'block';
    }
  }

  async function init() {
    try {
      const user = await API.get('/auth/me');
      setUserUI(user);
      document.getElementById('app').style.opacity = '1';
    } catch (_) {
      return;
    }

    // Nav links
    document.querySelectorAll('.nav-item[data-page]').forEach(el =>
      el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); })
    );

    // Sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('main');
    const toggle  = document.getElementById('sidebar-toggle-btn');
    toggle?.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      main.classList.toggle('expanded');
      toggle.textContent = sidebar.classList.contains('collapsed') ? '>' : '<';
    });

    // User menu
    const userMenuBtn      = document.getElementById('user-menu-btn');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');
    userMenuBtn?.addEventListener('click', e => {
      e.stopPropagation();
      userMenuDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => userMenuDropdown?.classList.remove('open'));

    // Change password from menu
    document.getElementById('change-pass-menu-btn')?.addEventListener('click', () => {
      userMenuDropdown.classList.remove('open');
      openChangePassword();
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (localStorage.getItem('itms-theme') === 'light') {
      document.body.classList.add('light-mode');
      if (themeBtn) themeBtn.textContent = '🌙 Dark Mode';
    }
    themeBtn?.addEventListener('click', () => {
      document.body.classList.toggle('light-mode');
      const isLight = document.body.classList.contains('light-mode');
      localStorage.setItem('itms-theme', isLight ? 'light' : 'dark');
      themeBtn.textContent = isLight ? '🌙 Dark Mode' : '☀️ Bright Mode';
      userMenuDropdown.classList.remove('open');
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      await API.post('/auth/logout');
      location.href = '/login.html';
    });

    // Modal close
    document.getElementById('modal-overlay')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) Utils.closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') Utils.closeModal(); });
    document.getElementById('modal-close-btn')?.addEventListener('click', Utils.closeModal);

    // Refresh
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      const page = location.hash.replace('#','') || 'dashboard';
      navigate(page);
      Utils.toast('Refreshed', 'info');
    });

    // Hash routing
    const hash = location.hash.replace('#','');
    navigate(PAGES[hash] ? hash : 'dashboard');
  }

  return { navigate, getUser: () => currentUser, canPerm, init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
