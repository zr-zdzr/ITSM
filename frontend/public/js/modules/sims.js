/* sims.js */
const SIMsModule = (() => {
  let state = { query:'', vendor:'', status:'', page:1, perPage:15, sortCol:'', sortDir:'asc' };
  let allRows = [];
  const VENDORS  = ['Jazz','Telenor','Ufone','Zong','Other'];
  const STATUSES = ['active','inactive','suspended'];

  function setSort(col) {
    if (state.sortCol === col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = col; state.sortDir = 'asc'; }
    renderPage();
  }

  async function render() {
    document.getElementById('page-content').innerHTML = '<div class="spinner"></div>';
    try { allRows = await API.get('/api/sims'); renderPage(); }
    catch(e) { Utils.toast(e.message,'error'); }
  }

  function filtered() {
    let r = allRows;
    if (state.query)  r = r.filter(row=>['phone_number','user_name','sim_holder','package_name','data_limit','vendor'].some(f=>String(row[f]||'').toLowerCase().includes(state.query.toLowerCase())));
    if (state.vendor) r = r.filter(row=>row.vendor===state.vendor);
    if (state.status) r = r.filter(row=>row.status===state.status);
    return Utils.sortRows(r, state.sortCol, state.sortDir);
  }

  function si(col) { return Utils.sortIcon(col, state.sortCol, state.sortDir); }

  function renderPage() {
    const canW = App.canPerm('sims','create');
    const canD = App.canPerm('sims','delete');
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>📶 SIM Cards</h2><p>Company SIM card management</p></div>
    <div class="section-actions">
      ${canD?`<button class="btn btn-danger" id="sim-delete-all">🗑 Delete All</button>`:''}
      ${canW?`<button class="btn btn-secondary" id="sim-import">📥 Import CSV</button>`:''}
      <button class="btn btn-secondary" id="sim-export">⬇ Export CSV</button>
      ${canW?`<button class="btn btn-primary" id="sim-add">＋ Add SIM</button>`:''}
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="sim-search" type="text" placeholder="Search number, user, package…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="sim-vendor-filter">
      <option value="">All Carriers</option>
      ${VENDORS.map(v=>`<option value="${v}" ${state.vendor===v?'selected':''}>${v}</option>`).join('')}
    </select>
    <select class="filter-select" id="sim-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table><thead><tr>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('phone_number')">Phone Number${si('phone_number')}</th>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('vendor')">Carrier${si('vendor')}</th>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('user_name')">User Name${si('user_name')}</th>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('package_name')">Calling Package${si('package_name')}</th>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('data_limit')">Data Package${si('data_limit')}</th>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('sim_holder')">SIM Holder${si('sim_holder')}</th>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('monthly_rate')">Monthly Rate${si('monthly_rate')}</th>
      <th style="cursor:pointer" onclick="SIMsModule.setSort('status')">Status${si('status')}</th>
      <th>Actions</th>
    </tr></thead><tbody id="sim-tbody"></tbody></table>
  </div>
  <div id="sim-pagination" class="pagination"></div>
</div>`;
    renderTable(canW,canD);
    document.getElementById('sim-search').addEventListener('input',e=>{state.query=e.target.value;state.page=1;renderTable(canW,canD);});
    document.getElementById('sim-vendor-filter').addEventListener('change',e=>{state.vendor=e.target.value;state.page=1;renderTable(canW,canD);});
    document.getElementById('sim-status-filter').addEventListener('change',e=>{state.status=e.target.value;state.page=1;renderTable(canW,canD);});
    document.getElementById('sim-export').addEventListener('click',()=>API.get('/api/sims/export/csv'));
    if (canD) {
      document.getElementById('sim-delete-all').addEventListener('click', () => {
        if (!allRows.length) { Utils.toast('No SIMs to delete','warning'); return; }
        Utils.confirmDeleteAll('SIM Cards', async (pass) => {
          try {
            const r = await API.del('/api/sims/all', { password: pass });
            allRows = [];
            Utils.toast(`Deleted ${r.deleted} SIM cards`, 'success');
            renderTable(canW, canD);
          } catch(e) { Utils.toast(e.message,'error'); }
        });
      });
    }
    if (canW) {
      document.getElementById('sim-add').addEventListener('click', openAdd);
      document.getElementById('sim-import').addEventListener('click', ()=>Utils.openImportModal('SIM Cards','/api/sims/import/csv',[
        {key:'phone_number',  desc:'Phone number (required)'},
        {key:'vendor',        desc:'Jazz, Telenor, Ufone, Zong, Other (required)'},
        {key:'user_name',     desc:'Name of the person using the SIM (required)'},
        {key:'calling_package',desc:'Voice / calling plan name (required)'},
        {key:'data_package',  desc:'Data plan name or size (optional)'},
        {key:'sim_holder',    desc:'Who physically holds the SIM card (required)'},
      ]));
    }
  }

  function renderTable(canW,canD) {
    const rows=filtered(), paged=Utils.paginate(rows,state.page,state.perPage);
    const tbody=document.getElementById('sim-tbody'); if(!tbody) return;
    const carrierColor={Jazz:'badge-primary',Telenor:'badge-info',Ufone:'badge-accent',Zong:'badge-success',Other:'badge-muted'};
    if(!paged.rows.length){tbody.innerHTML=`<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">📶</div><h3>No SIMs found</h3></div></td></tr>`;return;}
    tbody.innerHTML=paged.rows.map(r=>`
      <tr>
        <td><span class="td-mono" style="font-weight:600">${Utils.esc(r.phone_number)}</span></td>
        <td><span class="badge ${carrierColor[r.vendor]||'badge-muted'}">${Utils.esc(r.vendor)}</span></td>
        <td><span class="text-sm">${Utils.esc(r.user_name||'—')}</span></td>
        <td><span class="text-sm">${Utils.esc(r.package_name||'—')}</span></td>
        <td><span class="text-sm text-muted">${Utils.esc(r.data_limit||'—')}</span></td>
        <td><span class="text-sm">${Utils.esc(r.sim_holder||'—')}</span></td>
        <td><span class="text-sm">${r.monthly_rate?'PKR '+Number(r.monthly_rate).toLocaleString():'—'}</span></td>
        <td>${Utils.statusBadge(r.status)}</td>
        <td><div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-sm" onclick="SIMsModule.openView(${r.id})">👁</button>
          ${canW?`<button class="btn btn-secondary btn-sm" onclick="SIMsModule.openEdit(${r.id})">✏️</button>`:''}
          ${canD?`<button class="btn btn-danger btn-sm" onclick="SIMsModule.deleteRow(${r.id})">🗑</button>`:''}
        </div></td>
      </tr>`).join('');
    Utils.renderPagination(document.getElementById('sim-pagination'),paged,state.perPage,(p,pp)=>{state.page=p;state.perPage=pp;renderTable(canW,canD);});
  }

  function simForm(data={}) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group"><label class="form-label required">Phone Number</label><input class="form-control" id="s-phone" placeholder="0321-0000000" value="${Utils.esc(data.phone_number||'')}"/></div>
  <div class="form-group"><label class="form-label required">Carrier</label><select class="form-control" id="s-vendor">${VENDORS.map(v=>`<option value="${v}" ${(data.vendor||'Jazz')===v?'selected':''}>${v}</option>`).join('')}</select></div>
  <div class="form-group"><label class="form-label required">User Name</label><input class="form-control" id="s-username" placeholder="Name of person using SIM" value="${Utils.esc(data.user_name||'')}"/></div>
  <div class="form-group"><label class="form-label required">SIM Holder</label><input class="form-control" id="s-holder" placeholder="Who physically holds the SIM" value="${Utils.esc(data.sim_holder||'')}"/></div>
  <div class="form-group"><label class="form-label required">Calling Package</label><input class="form-control" id="s-pkg" placeholder="e.g. Jazz Business Voice" value="${Utils.esc(data.package_name||'')}"/></div>
  <div class="form-group"><label class="form-label">Data Package</label><input class="form-control" id="s-data" placeholder="e.g. 50GB Monthly" value="${Utils.esc(data.data_limit||'')}"/></div>
  <div class="form-group"><label class="form-label">Monthly Rate (PKR)</label><input class="form-control" id="s-rate" type="number" min="0" value="${data.monthly_rate||''}"/></div>
  <div class="form-group"><label class="form-label">Status</label><select class="form-control" id="s-status">${STATUSES.map(s=>`<option value="${s}" ${(data.status||'active')===s?'selected':''}>${s}</option>`).join('')}</select></div>
</div>
<div class="form-group" style="margin-top:12px"><label class="form-label">Notes</label><textarea class="form-control" id="s-notes">${Utils.esc(data.notes||'')}</textarea></div>`;
  }

  function collectSimForm() {
    const v=id=>document.getElementById(id)?.value||'';
    return {
      phone_number: v('s-phone'),
      vendor:       v('s-vendor'),
      user_name:    v('s-username'),
      sim_holder:   v('s-holder'),
      package_name: v('s-pkg'),
      data_limit:   v('s-data')||null,
      monthly_rate: v('s-rate')||null,
      status:       v('s-status'),
      notes:        v('s-notes'),
    };
  }

  function validateForm(d) {
    if (!d.phone_number)  { Utils.toast('Phone number is required','error'); return false; }
    if (!d.vendor)        { Utils.toast('Carrier is required','error'); return false; }
    if (!d.user_name)     { Utils.toast('User name is required','error'); return false; }
    if (!d.sim_holder)    { Utils.toast('SIM holder is required','error'); return false; }
    if (!d.package_name)  { Utils.toast('Calling package is required','error'); return false; }
    return true;
  }

  async function openAdd() {
    Utils.openModal({ title:'➕ Add SIM Card', size:'lg', body:simForm({ status:'active', vendor:'Jazz' }), footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick=Utils.closeModal;
      document.getElementById('ms').onclick=async()=>{
        const d=collectSimForm(); if(!validateForm(d)) return;
        try{await API.post('/api/sims',d);Utils.closeModal();Utils.toast('SIM added','success');allRows=await API.get('/api/sims');renderTable(App.canPerm('sims','create'),App.canPerm('sims','delete'));}
        catch(e){Utils.toast(e.message,'error');}
      };
    },50);
  }

  async function openEdit(id) {
    const data=allRows.find(r=>r.id===id)||await API.get(`/api/sims/${id}`);
    Utils.openModal({title:`✏️ Edit SIM ${data.phone_number}`,size:'lg',body:simForm(data),footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save</button>`});
    setTimeout(()=>{
      document.getElementById('mc').onclick=Utils.closeModal;
      document.getElementById('ms').onclick=async()=>{
        const d=collectSimForm(); if(!validateForm(d)) return;
        try{await API.put(`/api/sims/${id}`,d);Utils.closeModal();Utils.toast('Updated','success');allRows=await API.get('/api/sims');renderTable(App.canPerm('sims','create'),App.canPerm('sims','delete'));}
        catch(e){Utils.toast(e.message,'error');}
      };
    },50);
  }

  function openView(id) {
    const r=allRows.find(row=>row.id===id);if(!r)return;
    const canW = App.canPerm('sims','update');
    const carrierColor={Jazz:'badge-primary',Telenor:'badge-info',Ufone:'badge-accent',Zong:'badge-success',Other:'badge-muted'};
    Utils.openModal({title:`📶 SIM — ${r.phone_number}`,body:`
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Phone Number</div><div class="detail-value mono" style="font-size:18px;font-weight:700">${Utils.esc(r.phone_number)}</div></div>
  <div class="detail-item"><div class="detail-label">Carrier</div><div class="detail-value"><span class="badge ${carrierColor[r.vendor]||'badge-muted'}">${Utils.esc(r.vendor)}</span></div></div>
  <div class="detail-item"><div class="detail-label">User Name</div><div class="detail-value">${Utils.esc(r.user_name||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">SIM Holder</div><div class="detail-value">${Utils.esc(r.sim_holder||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Calling Package</div><div class="detail-value">${Utils.esc(r.package_name||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Data Package</div><div class="detail-value">${Utils.esc(r.data_limit||'—')}</div></div>
  <div class="detail-item"><div class="detail-label">Monthly Rate</div><div class="detail-value">${r.monthly_rate?'PKR '+Number(r.monthly_rate).toLocaleString():'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(r.status)}</div></div>
</div>${r.notes?`<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(r.notes)}</div></div>`:''}`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button>${canW?`<button class="btn btn-primary" onclick="SIMsModule.openEdit(${id})">✏️ Edit</button>`:''}`
    });
    setTimeout(()=>{document.getElementById('mc').onclick=Utils.closeModal;},50);
  }

  function deleteRow(id) {
    const r=allRows.find(row=>row.id===id);
    Utils.confirm(`Delete SIM ${r?.phone_number}?`,async()=>{
      try{await API.del(`/api/sims/${id}`);Utils.toast('Deleted','success');allRows=allRows.filter(row=>row.id!==id);renderTable(App.canPerm('sims','create'),App.canPerm('sims','delete'));}
      catch(e){Utils.toast(e.message,'error');}
    });
  }

  return { render, openView, openEdit, deleteRow, setSort };
})();
