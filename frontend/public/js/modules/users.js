/* users.js — Super Admin only */
const UsersModule = (() => {
  let allRows = [];
  const ROLES = ['super_admin','user'];
  const ROLE_LABELS = { super_admin:'Super Admin', user:'User' };
  const MODULES = ['systems','network','mobiles','sims','gws','employees','reports'];
  const MODULE_LABELS = { systems:'Systems', network:'Network', mobiles:'Mobiles', sims:'SIM Cards', gws:'Cloud IDs', employees:'Employees', reports:'Reports' };
  const ACTIONS = ['create','read','update','delete'];

  async function render() {
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    try { allRows = await API.get('/api/users'); renderPage(); }
    catch(e) { Utils.toast(e.message,'error'); }
  }

  function renderPage() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>👥 User Management</h2><p>Manage system access and permissions</p></div>
    <div class="section-actions">
      <button class="btn btn-primary" id="usr-create-btn">＋ Create User</button>
    </div>
  </div>
  <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-bottom:20px">
    <h3 style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Role Overview</h3>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;font-size:12px">
      <div><div class="badge badge-danger" style="margin-bottom:6px">Super Admin</div><ul style="color:var(--text-secondary);padding-left:14px;line-height:1.8"><li>Full access to all modules</li><li>Manage system users &amp; permissions</li><li>Cannot be restricted by permissions</li></ul></div>
      <div><div class="badge badge-warning" style="margin-bottom:6px">User</div><ul style="color:var(--text-secondary);padding-left:14px;line-height:1.8"><li>Access controlled by per-module permissions</li><li>CRUD permissions assigned individually</li><li>Click ✏️ to configure permissions</li></ul></div>
    </div>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th>Employee</th><th>Login ID (Email)</th><th>Role</th>
      <th>Status</th><th>Last Login</th><th>Created</th><th>Actions</th>
    </tr></thead><tbody id="usr-tbody"></tbody></table>
  </div>
</div>`;
    renderTable();
    document.getElementById('usr-create-btn').addEventListener('click', openCreate);
  }

  function renderTable() {
    const tbody = document.getElementById('usr-tbody'); if (!tbody) return;
    const me = App.getUser();
    if (!allRows.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">👥</div><h3>No users yet</h3><p>Click "Create User" to give an employee portal access.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = allRows.map(u => `
      <tr style="${!u.is_active?'opacity:0.5':''}">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:30px;height:30px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0">${Utils.esc(u.name[0]||'?')}</div>
            <div>
              <div style="font-weight:500;font-size:13px">${Utils.esc(u.name)}</div>
              ${u.employee_name?`<div style="font-size:11px;color:var(--text-muted)">${Utils.esc(u.employee_name)}</div>`:''}
            </div>
          </div>
        </td>
        <td><span class="td-mono text-sm">${Utils.esc(u.email)}</span></td>
        <td>${Utils.roleBadge(u.role)}</td>
        <td>${u.is_active?'<span class="badge badge-success">Active</span>':'<span class="badge badge-danger">Inactive</span>'}</td>
        <td><span class="text-sm text-muted">${u.last_login?Utils.fmtDate(u.last_login):'Never'}</span></td>
        <td><span class="text-sm text-muted">${Utils.fmtDate(u.created_at)}</span></td>
        <td>
          <div style="display:flex;gap:5px">
            ${u.id===me?.id
              ? '<span class="text-sm text-muted">(you)</span>'
              : `<button class="btn btn-secondary btn-sm" onclick="UsersModule.openEdit(${u.id})">✏️</button>
                 <button class="btn btn-danger btn-sm" onclick="UsersModule.deleteUser(${u.id})">🗑</button>`
            }
          </div>
        </td>
      </tr>`).join('');
  }

  async function openCreate() {
    Utils.openModal({
      title: '＋ Create Portal User', size: 'sm',
      body: `<div class="form-group"><label class="form-label">Loading employees…</label></div>`,
      footer: `<button class="btn btn-secondary" id="mc">Cancel</button>
               <button class="btn btn-primary" id="ms">Create User</button>`
    });

    setTimeout(async () => {
      document.getElementById('mc').onclick = Utils.closeModal;
      let emps = [];
      try { emps = await API.get('/api/users/employees/available'); } catch(_) {}

      document.getElementById('modal-body').innerHTML = emps.length === 0
        ? `<div class="empty-state" style="padding:20px"><div class="empty-state-icon">👤</div><p>All active employees already have portal accounts, or no employees exist yet. Add employees first.</p></div>`
        : `
<div class="form-group">
  <label class="form-label required">Select Employee</label>
  <select class="form-control" id="cu-emp">
    <option value="">— Choose employee —</option>
    ${emps.map(e=>`<option value="${e.id}" data-email="${Utils.esc(e.email||'')}" data-name="${Utils.esc(e.first_name+' '+e.last_name)}">${Utils.esc(e.first_name+' '+e.last_name)}${e.department?' ('+Utils.esc(e.department)+')':''}</option>`).join('')}
  </select>
  <p style="font-size:11px;color:var(--text-muted);margin-top:4px">Employee's email becomes the login ID</p>
</div>
<div class="form-group">
  <label class="form-label">Login ID (Email)</label>
  <input class="form-control" id="cu-email" disabled placeholder="Auto-filled from employee email"/>
</div>
<div class="form-group">
  <label class="form-label required">Role</label>
  <select class="form-control" id="cu-role">
    ${ROLES.map(r=>`<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}
  </select>
</div>
<div class="form-group">
  <label class="form-label required">Temporary Password</label>
  <input class="form-control" type="password" id="cu-pass" placeholder="Min 6 characters" autocomplete="new-password"/>
</div>`;

      if (emps.length > 0) {
        document.getElementById('cu-emp').addEventListener('change', function() {
          const opt = this.options[this.selectedIndex];
          document.getElementById('cu-email').value = opt.dataset.email || '';
        });
      }

      document.getElementById('ms').onclick = async () => {
        if (!emps.length) return Utils.closeModal();
        const employee_id = document.getElementById('cu-emp')?.value;
        const role        = document.getElementById('cu-role')?.value;
        const password    = document.getElementById('cu-pass')?.value?.trim();
        if (!employee_id) return Utils.toast('Please select an employee', 'error');
        if (!password)    return Utils.toast('Password is required', 'error');
        if (password.length < 6) return Utils.toast('Password must be at least 6 characters', 'error');
        try {
          const created = await API.post('/api/users', { employee_id: Number(employee_id), role, password });
          allRows.unshift(created);
          Utils.closeModal(); Utils.toast('User created successfully', 'success'); renderTable();
        } catch(e) { Utils.toast(e.message, 'error'); }
      };
    }, 50);
  }

  async function openEdit(id) {
    const u = allRows.find(r => r.id === id); if (!u) return;

    let perms = {};
    if (u.role === 'user') {
      try { perms = await API.get(`/api/users/${id}/permissions`); } catch(_) {}
    }

    const permMatrix = u.role === 'user' ? `
<hr style="border-color:var(--border);margin:16px 0"/>
<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px">Module Permissions</div>
<div style="overflow-x:auto">
<table style="width:100%;font-size:12px;border-collapse:collapse">
  <thead>
    <tr style="border-bottom:1px solid var(--border)">
      <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">Module</th>
      ${ACTIONS.map(a=>`<th style="text-align:center;padding:6px 8px;color:var(--text-muted);text-transform:capitalize">${a}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${MODULES.map(mod => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:6px 8px;font-weight:500">${MODULE_LABELS[mod]||mod}</td>
      ${ACTIONS.map(act => {
        const checked = perms[mod]?.[`can_${act}`] ? 'checked' : '';
        const disabled = act === 'read' ? 'disabled checked' : checked;
        return `<td style="text-align:center;padding:6px 8px"><input type="checkbox" id="perm-${mod}-${act}" ${act==='read'?'disabled checked':checked}/></td>`;
      }).join('')}
    </tr>`).join('')}
  </tbody>
</table>
</div>` : '';

    Utils.openModal({
      title: `✏️ Edit — ${Utils.esc(u.name)}`, size: 'lg',
      body: `
<div class="form-group">
  <label class="form-label">Login ID</label>
  <input class="form-control" value="${Utils.esc(u.email)}" disabled/>
</div>
<div class="form-group">
  <label class="form-label">Role</label>
  <select class="form-control" id="u-role" onchange="UsersModule._onRoleChange(this.value)">
    ${ROLES.map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_LABELS[r]}</option>`).join('')}
  </select>
</div>
<div class="form-group">
  <label class="form-label">Account Status</label>
  <select class="form-control" id="u-active">
    <option value="true"  ${u.is_active?'selected':''}>Active</option>
    <option value="false" ${!u.is_active?'selected':''}>Inactive</option>
  </select>
</div>
<hr style="border-color:var(--border);margin:16px 0"/>
<div class="form-group">
  <label class="form-label">Reset Password <span style="font-size:11px;color:var(--text-muted)">(leave blank to keep current)</span></label>
  <input class="form-control" type="password" id="u-newpass" placeholder="New password (min 6 chars)" autocomplete="new-password"/>
</div>
${permMatrix}`,
      footer: `<button class="btn btn-secondary" id="mc">Cancel</button>
               <button class="btn btn-primary"   id="ms">Save Changes</button>`
    });

    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = async () => {
        const role      = document.getElementById('u-role').value;
        const is_active = document.getElementById('u-active').value === 'true';
        const newpass   = document.getElementById('u-newpass').value?.trim();
        try {
          const updated = await API.put(`/api/users/${id}`, { role, is_active });
          const idx = allRows.findIndex(r => r.id === id);
          if (idx > -1) allRows[idx] = { ...allRows[idx], ...updated };

          if (role === 'user') {
            const permissions = {};
            for (const mod of MODULES) {
              permissions[mod] = {};
              for (const act of ACTIONS) {
                permissions[mod][`can_${act}`] = act === 'read' ? true : !!(document.getElementById(`perm-${mod}-${act}`)?.checked);
              }
            }
            await API.put(`/api/users/${id}/permissions`, { permissions });
          }

          if (newpass) {
            if (newpass.length < 6) return Utils.toast('Password must be at least 6 characters', 'error');
            await API.patch(`/api/users/${id}/password`, { new_password: newpass });
            Utils.toast('Password reset', 'success');
          }
          Utils.closeModal(); Utils.toast('User updated', 'success'); renderTable();
        } catch(e) { Utils.toast(e.message, 'error'); }
      };
    }, 50);
  }

  function _onRoleChange(role) {
    const permSection = document.querySelector('table[style*="border-collapse"]')?.closest('div[style*="overflow-x"]')?.parentElement;
    if (!permSection) return;
    if (role !== 'user') {
      permSection.style.display = 'none';
    } else {
      permSection.style.display = '';
    }
  }

  function deleteUser(id) {
    const u = allRows.find(r => r.id === id); if (!u) return;
    Utils.confirm(`Remove portal access for ${u.name}? They can no longer log in.`, async () => {
      try {
        await API.del(`/api/users/${id}`);
        allRows = allRows.filter(r => r.id !== id);
        Utils.toast('User deleted', 'success'); renderTable();
      } catch(e) { Utils.toast(e.message, 'error'); }
    });
  }

  return { render, openCreate, openEdit, deleteUser, _onRoleChange };
})();
