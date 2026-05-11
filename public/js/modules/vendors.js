/* vendors.js */
const VendorsModule = (() => {
  let state = { query:'', page:1, perPage:10 };

  function filtered() {
    return Utils.filterRows(DB.vendors.all(), state.query, ['name','contact','email','phone','address']);
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>🏢 Vendors</h2><p>Manage supplier contacts and information</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="vendor-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="vendor-add-btn">＋ Add Vendor</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="vendor-search" type="text" placeholder="Search vendors…" value="${Utils.esc(state.query)}"/>
    </div>
  </div>
  <div class="table-wrapper">
    <table>
      <thead><tr>
        <th>Vendor Name</th><th>Contact Person</th><th>Phone</th>
        <th>Email</th><th>Assets</th><th>Actions</th>
      </tr></thead>
      <tbody id="vendor-tbody"></tbody>
    </table>
  </div>
  <div id="vendor-pagination"></div>
</div>`;
    renderTable();
    document.getElementById('vendor-search').addEventListener('input', e => { state.query = e.target.value; state.page=1; renderTable(); });
    document.getElementById('vendor-add-btn').addEventListener('click', openAdd);
    document.getElementById('vendor-export-btn').addEventListener('click', exportData);
  }

  function renderTable() {
    const rows  = filtered();
    const paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('vendor-tbody');
    if (!tbody) return;
    const allAssets = DB.assets.all();
    if (!paged.rows.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">🏢</div><h3>No vendors found</h3><p>Add your first vendor to get started</p><button class="btn btn-primary" id="empty-add-v">＋ Add Vendor</button></div></td></tr>`;
      setTimeout(()=>document.getElementById('empty-add-v')?.addEventListener('click',openAdd),50);
      return;
    }
    tbody.innerHTML = paged.rows.map(v => {
      const cnt = allAssets.filter(a=>a.vendorId===v.id).length;
      return `<tr>
        <td><div style="font-weight:600">${Utils.esc(v.name)}</div>${v.address?`<div class="text-xs text-muted">${Utils.esc(v.address)}</div>`:''}</td>
        <td>${Utils.esc(v.contact)||'—'}</td>
        <td><span class="td-mono">${Utils.esc(v.phone)||'—'}</span></td>
        <td><a href="mailto:${Utils.esc(v.email)}" style="color:var(--primary-light);text-decoration:none">${Utils.esc(v.email)||'—'}</a></td>
        <td><span class="badge badge-primary">${cnt} assets</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="VendorsModule.openView(${v.id})">👁</button>
          <button class="btn btn-secondary btn-sm" onclick="VendorsModule.openEdit(${v.id})">✏️</button>
          <button class="btn btn-danger    btn-sm" onclick="VendorsModule.deleteVendor(${v.id})">🗑</button>
        </div></td>
      </tr>`;
    }).join('');
    Utils.renderPagination(document.getElementById('vendor-pagination'), paged, state.perPage, p=>{ state.page=p; renderTable(); });
  }

  function vendorForm(data={}) {
    return `<div class="form-grid form-grid-2">
      <div class="form-group"><label class="form-label required">Vendor Name</label><input class="form-control" id="vf-name" placeholder="Dell Technologies" value="${Utils.esc(data.name||'')}"/></div>
      <div class="form-group"><label class="form-label">Contact Person</label><input class="form-control" id="vf-contact" placeholder="John Smith" value="${Utils.esc(data.contact||'')}"/></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="vf-phone" placeholder="+92-321-1234567" value="${Utils.esc(data.phone||'')}"/></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="vf-email" type="email" placeholder="vendor@email.com" value="${Utils.esc(data.email||'')}"/></div>
      <div class="form-group full"><label class="form-label">Address</label><input class="form-control" id="vf-address" placeholder="City, Province" value="${Utils.esc(data.address||'')}"/></div>
      <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-control" id="vf-notes" placeholder="Supplier notes…">${Utils.esc(data.notes||'')}</textarea></div>
    </div>`;
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value||'';
    return { name:v('vf-name'), contact:v('vf-contact'), phone:v('vf-phone'), email:v('vf-email'), address:v('vf-address'), notes:v('vf-notes') };
  }

  function openAdd() {
    Utils.openModal({ title:'➕ Add Vendor', body:vendorForm(), footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Vendor</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const d = collectForm();
        if (!d.name) { Utils.toast('Vendor name is required','error'); return; }
        DB.vendors.insert(d);
        DB.activity.log('added','Vendor',`New vendor added: ${d.name}`);
        Utils.closeModal(); Utils.toast('Vendor added','success'); renderTable();
      };
    },50);
  }

  function openEdit(id) {
    const v = DB.vendors.byId(id); if(!v) return;
    Utils.openModal({ title:`✏️ Edit ${v.name}`, body:vendorForm(v), footer:`<button class="btn btn-secondary" id="mc">Cancel</button><button class="btn btn-primary" id="ms">Save Changes</button>` });
    setTimeout(()=>{
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('ms').onclick = () => {
        const d = collectForm();
        if (!d.name) { Utils.toast('Vendor name is required','error'); return; }
        DB.vendors.update(id,d);
        Utils.closeModal(); Utils.toast('Vendor updated','success'); renderTable();
      };
    },50);
  }

  function openView(id) {
    const v = DB.vendors.byId(id); if(!v) return;
    const assets = DB.assets.all().filter(a=>a.vendorId===id);
    Utils.openModal({
      title:`🏢 ${v.name}`,
      body:`<div class="detail-grid">
        <div class="detail-item"><div class="detail-label">Contact</div><div class="detail-value">${Utils.esc(v.contact)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Phone</div><div class="detail-value mono">${Utils.esc(v.phone)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${Utils.esc(v.email)||'—'}</div></div>
        <div class="detail-item"><div class="detail-label">Address</div><div class="detail-value">${Utils.esc(v.address)||'—'}</div></div>
        ${v.notes?`<div class="detail-item full"><div class="detail-label">Notes</div><div class="detail-value">${Utils.esc(v.notes)}</div></div>`:''}
      </div>
      <div class="detail-section"><div class="detail-section-title">📦 Assets from this Vendor (${assets.length})</div>
        ${assets.length?`<div class="table-wrapper" style="margin-top:12px"><table><thead><tr><th>Asset Tag</th><th>Category</th><th>Brand/Model</th><th>Status</th></tr></thead><tbody>
          ${assets.map(a=>`<tr><td class="td-mono">${Utils.esc(a.assetTag)}</td><td>${Utils.categoryBadge(a.category)}</td><td>${Utils.esc(a.brand)} ${Utils.esc(a.model)}</td><td>${Utils.statusBadge(a.status)}</td></tr>`).join('')}
        </tbody></table></div>`:'<p class="text-muted text-sm">No assets from this vendor yet</p>'}
      </div>`,
      footer:`<button class="btn btn-secondary" id="mc">Close</button><button class="btn btn-primary" onclick="VendorsModule.openEdit(${id})">✏️ Edit</button>`
    });
    setTimeout(()=>{ document.getElementById('mc').onclick = Utils.closeModal; },50);
  }

  function deleteVendor(id) {
    const v = DB.vendors.byId(id); if(!v) return;
    Utils.confirm(`Delete vendor "${v.name}"? This cannot be undone.`, () => {
      DB.vendors.remove(id); Utils.toast('Vendor deleted','success'); renderTable();
    });
  }

  function exportData() {
    Utils.exportCSV(filtered(),'vendors.csv',[
      {label:'Name',key:'name'},{label:'Contact',key:'contact'},{label:'Phone',key:'phone'},
      {label:'Email',key:'email'},{label:'Address',key:'address'},{label:'Notes',key:'notes'},
    ]);
  }

  return { render, openView, openEdit, deleteVendor };
})();
