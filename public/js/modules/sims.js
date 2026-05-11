/* sims.js — SIM Card Records */
const SIMsModule = (() => {
  let state = { query: '', carrier: '', status: '', page: 1, perPage: 10 };

  const CARRIERS = ['Jazz', 'Telenor', 'Ufone', 'Zong', 'Other'];
  const STATUSES = ['Active', 'Inactive', 'Suspended'];

  function filtered() {
    let rows = DB.sims.all();
    if (state.query)   rows = Utils.filterRows(rows, state.query, ['phoneNumber','iccid','plan','carrier']);
    if (state.carrier) rows = rows.filter(r => r.carrier === state.carrier);
    if (state.status)  rows = rows.filter(r => r.status  === state.status);
    return rows;
  }

  function carrierBadge(carrier) {
    const map = { Jazz:'badge-primary', Telenor:'badge-info', Ufone:'badge-accent', Zong:'badge-success', Other:'badge-muted' };
    return `<span class="badge ${map[carrier]||'badge-muted'}">${carrier||'—'}</span>`;
  }

  function render() {
    document.getElementById('page-content').innerHTML = `
<div class="animate-in">
  <div class="section-header">
    <div class="section-title"><h2>📶 SIMs Record</h2><p>Company SIM card management</p></div>
    <div class="section-actions">
      <button class="btn btn-secondary" id="sim-export-btn">⬇ Export CSV</button>
      <button class="btn btn-primary"   id="sim-add-btn">＋ Add SIM</button>
    </div>
  </div>
  <div class="table-toolbar">
    <div class="search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input id="sim-search" type="text" placeholder="Search number, ICCID, plan…" value="${Utils.esc(state.query)}"/>
    </div>
    <select class="filter-select" id="sim-carrier-filter">
      <option value="">All Carriers</option>
      ${CARRIERS.map(c=>`<option value="${c}" ${state.carrier===c?'selected':''}>${c}</option>`).join('')}
    </select>
    <select class="filter-select" id="sim-status-filter">
      <option value="">All Statuses</option>
      ${STATUSES.map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="table-wrapper">
    <table id="sim-table">
      <thead><tr>
        <th>Phone Number</th><th>Carrier</th><th>Plan</th>
        <th>Data Limit</th><th>Status</th><th>Assigned To</th><th>Monthly Rate</th><th>Actions</th>
      </tr></thead>
      <tbody id="sim-tbody"></tbody>
    </table>
  </div>
  <div id="sim-pagination"></div>
</div>`;
    renderTable();
    bindEvents();
  }

  function renderTable() {
    const rows  = filtered();
    const paged = Utils.paginate(rows, state.page, state.perPage);
    const tbody = document.getElementById('sim-tbody');
    if (!tbody) return;

    if (paged.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📶</div><h3>No SIMs found</h3><p>Try adjusting your filters or add a new SIM</p><button class="btn btn-primary" id="empty-add-btn">＋ Add SIM</button></div></td></tr>`;
      setTimeout(() => document.getElementById('empty-add-btn')?.addEventListener('click', openAdd), 50);
    } else {
      tbody.innerHTML = paged.rows.map(s => `
        <tr>
          <td><span class="td-mono" style="font-weight:500">${Utils.esc(s.phoneNumber)}</span></td>
          <td>${carrierBadge(s.carrier)}</td>
          <td><span class="text-sm">${Utils.esc(s.plan)||'—'}</span></td>
          <td><span class="text-sm text-muted">${Utils.esc(s.dataLimit)||'—'}</span></td>
          <td>${Utils.statusBadge(s.status)}</td>
          <td>
            ${s.assignedTo
              ? `<div style="font-weight:500">${Utils.esc(Utils.employeeName(s.assignedTo))}</div>`
              : '<span class="text-muted">—</span>'}
          </td>
          <td><span class="text-sm">${s.monthlyRate ? 'PKR ' + s.monthlyRate.toLocaleString() : '—'}</span></td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-secondary btn-sm" onclick="SIMsModule.openView(${s.id})">👁</button>
              <button class="btn btn-secondary btn-sm" onclick="SIMsModule.openEdit(${s.id})">✏️</button>
              <button class="btn btn-danger btn-sm"    onclick="SIMsModule.deleteSIM(${s.id})">🗑</button>
            </div>
          </td>
        </tr>`).join('');
    }
    Utils.renderPagination(document.getElementById('sim-pagination'), paged, state.perPage, p => { state.page = p; renderTable(); });
  }

  function bindEvents() {
    document.getElementById('sim-search').addEventListener('input', e => { state.query = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('sim-carrier-filter').addEventListener('change', e => { state.carrier = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('sim-status-filter').addEventListener('change', e => { state.status = e.target.value; state.page = 1; renderTable(); });
    document.getElementById('sim-add-btn').addEventListener('click', openAdd);
    document.getElementById('sim-export-btn').addEventListener('click', exportData);
  }

  function getEmpOptions(sel) {
    return `<option value="">— Unassigned —</option>` +
      DB.employees.all().map(e => `<option value="${e.id}" ${sel==e.id?'selected':''}>${Utils.esc(e.name)} (${Utils.esc(e.department)})</option>`).join('');
  }

  function getMobileOptions(sel) {
    return `<option value="">— No device linked —</option>` +
      DB.mobiles.all().map(m => `<option value="${m.id}" ${sel==m.id?'selected':''}>${Utils.esc(m.assetTag)} — ${Utils.esc(m.brand)} ${Utils.esc(m.model)}</option>`).join('');
  }

  function simForm(data = {}) {
    return `
<div class="form-grid form-grid-2">
  <div class="form-group">
    <label class="form-label required">Phone Number</label>
    <input class="form-control" id="s-phone" placeholder="0321-0000000" value="${Utils.esc(data.phoneNumber||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">ICCID (SIM Serial)</label>
    <input class="form-control" id="s-iccid" placeholder="19-20 digit ICCID" value="${Utils.esc(data.iccid||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label required">Carrier / Network</label>
    <select class="form-control" id="s-carrier">
      ${CARRIERS.map(c=>`<option value="${c}" ${(data.carrier||'Jazz')===c?'selected':''}>${c}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Status</label>
    <select class="form-control" id="s-status">
      ${STATUSES.map(s=>`<option value="${s}" ${(data.status||'Active')===s?'selected':''}>${s}</option>`).join('')}
    </select>
  </div>
  <div class="form-group">
    <label class="form-label">Plan / Package</label>
    <input class="form-control" id="s-plan" placeholder="Business Pro 50GB…" value="${Utils.esc(data.plan||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Data Limit</label>
    <input class="form-control" id="s-data" placeholder="50GB, Unlimited…" value="${Utils.esc(data.dataLimit||'')}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Monthly Rate (PKR)</label>
    <input class="form-control" id="s-rate" type="number" min="0" placeholder="1500" value="${data.monthlyRate||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Assigned To</label>
    <select class="form-control" id="s-emp">${getEmpOptions(data.assignedTo)}</select>
  </div>
  <div class="form-group">
    <label class="form-label">Linked Mobile Device</label>
    <select class="form-control" id="s-mobile">${getMobileOptions(data.mobileId)}</select>
  </div>
  <div class="form-group">
    <label class="form-label">Activation Date</label>
    <input class="form-control" id="s-activated" type="date" value="${data.activationDate||''}"/>
  </div>
  <div class="form-group">
    <label class="form-label">Expiry Date</label>
    <input class="form-control" id="s-expiry" type="date" value="${data.expiryDate||''}"/>
  </div>
</div>
<div class="detail-section">
  <div class="form-group">
    <label class="form-label">Notes</label>
    <textarea class="form-control" id="s-notes" placeholder="Additional notes…">${Utils.esc(data.notes||'')}</textarea>
  </div>
</div>`;
  }

  function collectForm() {
    const v = id => document.getElementById(id)?.value || '';
    const emp    = v('s-emp');
    const mobile = v('s-mobile');
    return {
      phoneNumber:    v('s-phone'),
      iccid:         v('s-iccid'),
      carrier:       v('s-carrier'),
      status:        v('s-status'),
      plan:          v('s-plan'),
      dataLimit:     v('s-data'),
      monthlyRate:   v('s-rate') ? +v('s-rate') : null,
      assignedTo:    emp    ? +emp    : null,
      mobileId:      mobile ? +mobile : null,
      activationDate:v('s-activated'),
      expiryDate:    v('s-expiry') || null,
      notes:         v('s-notes'),
    };
  }

  function openAdd() {
    Utils.openModal({
      title: '➕ Add SIM Record',
      body:  simForm({ status: 'Active', carrier: 'Jazz' }),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary"   id="modal-save">Save SIM</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm();
        if (!d.phoneNumber) { Utils.toast('Phone Number is required', 'error'); return; }
        DB.sims.insert(d);
        DB.activity.log('added', d.phoneNumber, `SIM added: ${d.carrier} — ${d.plan||''}`);
        Utils.closeModal();
        Utils.toast(`SIM ${d.phoneNumber} added`, 'success');
        renderTable();
      };
    }, 50);
  }

  function openEdit(id) {
    const s = DB.sims.byId(id);
    if (!s) return;
    Utils.openModal({
      title: `✏️ Edit SIM ${s.phoneNumber}`,
      body:  simForm(s),
      footer:`<button class="btn btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn btn-primary"   id="modal-save">Save Changes</button>`
    });
    setTimeout(() => {
      document.getElementById('modal-cancel').onclick = Utils.closeModal;
      document.getElementById('modal-save').onclick = () => {
        const d = collectForm();
        if (!d.phoneNumber) { Utils.toast('Phone Number is required', 'error'); return; }
        DB.sims.update(id, d);
        DB.activity.log('updated', d.phoneNumber, `SIM updated: ${d.carrier} — ${d.plan||''}`);
        Utils.closeModal();
        Utils.toast('SIM updated', 'success');
        renderTable();
      };
    }, 50);
  }

  function openView(id) {
    const s = DB.sims.byId(id);
    if (!s) return;
    const emp    = s.assignedTo ? DB.employees.byId(s.assignedTo) : null;
    const mobile = s.mobileId   ? DB.mobiles.byId(s.mobileId)     : null;
    Utils.openModal({
      title: `📶 SIM — ${s.phoneNumber}`,
      body: `
<div class="detail-grid">
  <div class="detail-item"><div class="detail-label">Phone Number</div><div class="detail-value mono" style="font-size:16px;font-weight:600">${Utils.esc(s.phoneNumber)}</div></div>
  <div class="detail-item"><div class="detail-label">Carrier</div><div class="detail-value">${carrierBadge(s.carrier)}</div></div>
  <div class="detail-item"><div class="detail-label">Status</div><div class="detail-value">${Utils.statusBadge(s.status)}</div></div>
  <div class="detail-item"><div class="detail-label">ICCID</div><div class="detail-value mono">${Utils.esc(s.iccid)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Plan / Package</div><div class="detail-value">${Utils.esc(s.plan)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Data Limit</div><div class="detail-value">${Utils.esc(s.dataLimit)||'—'}</div></div>
  <div class="detail-item"><div class="detail-label">Monthly Rate</div><div class="detail-value">${s.monthlyRate ? 'PKR ' + s.monthlyRate.toLocaleString() : '—'}</div></div>
  <div class="detail-item"><div class="detail-label">Activation Date</div><div class="detail-value">${Utils.fmtDate(s.activationDate)}</div></div>
  <div class="detail-item"><div class="detail-label">Expiry Date</div><div class="detail-value">${s.expiryDate ? Utils.fmtDate(s.expiryDate) : '— No expiry —'}</div></div>
</div>
<div class="detail-section">
  <div class="detail-section-title">🔗 Assignments</div>
  <div class="detail-grid">
    <div class="detail-item"><div class="detail-label">Assigned To</div><div class="detail-value">${emp ? Utils.esc(emp.name) : '— Unassigned —'}</div></div>
    <div class="detail-item"><div class="detail-label">Linked Mobile</div><div class="detail-value">${mobile ? `<span class="td-mono">${Utils.esc(mobile.assetTag)}</span> — ${Utils.esc(mobile.brand)} ${Utils.esc(mobile.model)}` : '— Not linked —'}</div></div>
  </div>
</div>
${s.notes ? `<div class="detail-section"><div class="detail-label">Notes</div><div class="detail-value" style="margin-top:8px">${Utils.esc(s.notes)}</div></div>` : ''}`,
      footer:`<button class="btn btn-secondary" id="modal-cancel">Close</button>
              <button class="btn btn-primary" onclick="SIMsModule.openEdit(${id});event.stopPropagation()">✏️ Edit</button>`
    });
    setTimeout(() => { document.getElementById('modal-cancel').onclick = Utils.closeModal; }, 50);
  }

  function deleteSIM(id) {
    const s = DB.sims.byId(id);
    if (!s) return;
    Utils.confirm(`Delete SIM ${s.phoneNumber} (${s.carrier})? This cannot be undone.`, () => {
      DB.sims.remove(id);
      DB.activity.log('deleted', s.phoneNumber, `SIM removed: ${s.carrier} — ${s.plan||''}`);
      Utils.toast('SIM deleted', 'success');
      renderTable();
    });
  }

  function exportData() {
    Utils.exportCSV(filtered(), 'sims.csv', [
      { label: 'Phone Number',    key: 'phoneNumber' },
      { label: 'ICCID',          key: 'iccid' },
      { label: 'Carrier',        key: 'carrier' },
      { label: 'Plan',           key: 'plan' },
      { label: 'Data Limit',     key: 'dataLimit' },
      { label: 'Monthly Rate',   key: 'monthlyRate' },
      { label: 'Status',         key: 'status' },
      { label: 'Assigned To',    key: 'assignedTo', render: r => Utils.employeeName(r.assignedTo) },
      { label: 'Linked Mobile',  key: 'mobileId',   render: r => { const m = r.mobileId ? DB.mobiles.byId(r.mobileId) : null; return m ? `${m.assetTag} ${m.brand} ${m.model}` : '—'; } },
      { label: 'Activation Date',key: 'activationDate' },
      { label: 'Expiry Date',    key: 'expiryDate' },
      { label: 'Notes',          key: 'notes' },
    ]);
  }

  return { render, openView, openEdit, deleteSIM };
})();
