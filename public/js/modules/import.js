/* import.js — CSV Import Module (Laptops/PCs + Employees) */
const ImportModule = (() => {

  /* ── COLUMN MAPPINGS ── */
  const ASSET_COLUMNS = [
    { key:'category',      label:'Category',       hint:'Laptop / Desktop / Server / Network Device / Accessory' },
    { key:'brand',         label:'Brand',           hint:'Dell, HP, Lenovo, Cisco…' },
    { key:'model',         label:'Model',           hint:'Latitude 5540, ProBook 450…' },
    { key:'serialNumber',  label:'Serial Number',   hint:'From sticker on device' },
    { key:'status',        label:'Status',          hint:'In Use / Available / Repair / Retired' },
    { key:'invoiceNumber', label:'Invoice Number',  hint:'INV-2024-001' },
    { key:'purchaseDate',  label:'Purchase Date',   hint:'YYYY-MM-DD e.g. 2024-01-15' },
    { key:'warrantyExpiry',label:'Warranty Expiry', hint:'YYYY-MM-DD e.g. 2027-01-15' },
    { key:'vendorName',    label:'Vendor Name',     hint:'Must match existing vendor name' },
    { key:'assignedToName',label:'Assigned To',     hint:'Employee full name (must exist)' },
    { key:'department',    label:'Department',      hint:'IT, HR, Development…' },
    { key:'location',      label:'Location',        hint:'HQ Floor 2, Server Room…' },
    { key:'assignedDate',  label:'Assigned Date',   hint:'YYYY-MM-DD' },
    { key:'cpu',           label:'CPU',             hint:'Intel Core i7-13th Gen' },
    { key:'ram',           label:'RAM',             hint:'16GB DDR4' },
    { key:'storage',       label:'Storage',         hint:'512GB SSD' },
    { key:'os',            label:'OS',              hint:'Ubuntu 22.04 / Windows 11 Pro' },
    { key:'ipAddress',     label:'IP Address',      hint:'192.168.1.100' },
    { key:'macAddress',    label:'MAC Address',     hint:'AA:BB:CC:DD:EE:FF' },
    { key:'notes',         label:'Notes',           hint:'Additional info' },
  ];

  const EMPLOYEE_COLUMNS = [
    { key:'name',       label:'Full Name',   hint:'Required' },
    { key:'email',      label:'Email',       hint:'john@company.com' },
    { key:'department', label:'Department',  hint:'IT, HR, Development, Finance…' },
    { key:'role',       label:'Role',        hint:'IT Manager, Developer…' },
    { key:'phone',      label:'Phone',       hint:'+92-321-0000000' },
  ];

  /* ── DOWNLOAD EXAMPLE CSVs ── */
  function downloadExampleAsset() {
    const header = ASSET_COLUMNS.map(c => c.label).join(',');
    const hint   = ASSET_COLUMNS.map(c => `"${c.hint}"`).join(',');
    const rows = [
      'Laptop,Dell,"Latitude 5540","DL-EXAMPLE-001","In Use","INV-2024-001",2024-01-15,2027-01-15,"Dell Technologies","Ali Hassan",Development,"HQ Floor 3",2024-01-20,"Intel Core i7-13th Gen","16GB DDR5","512GB SSD","Ubuntu 22.04","192.168.1.200","AA:BB:CC:DD:EE:AA","Example laptop row"',
      'Desktop,HP,"EliteDesk 800 G6","HP-EXAMPLE-002","Available","INV-2024-002",2024-02-01,2027-02-01,"HP Pakistan","","HR","HR Office","","Intel Core i5-12th Gen","8GB DDR4","256GB SSD","Windows 11 Pro","","","Spare desktop"',
      'Laptop,Lenovo,"ThinkPad X1 Carbon","LN-EXAMPLE-003","In Use","INV-2024-003",2024-03-01,2027-03-01,"Lenovo Pakistan","Sara Ahmed","Finance","Finance Office",2024-03-05,"Intel Core i5-13th Gen","16GB DDR4","512GB SSD","Windows 11 Pro","192.168.1.201","AA:BB:CC:DD:EE:BB",""',
    ];
    const csv = [header, hint, ...rows].join('\n');
    _download(csv, 'example_assets_import.csv');
    Utils.toast("Downloaded! Check your browser's default Downloads folder (usually ~/Downloads).", 'info');
  }

  function downloadExampleEmployee() {
    const header = EMPLOYEE_COLUMNS.map(c => c.label).join(',');
    const hint   = EMPLOYEE_COLUMNS.map(c => `"${c.hint}"`).join(',');
    const rows = [
      '"Ahmad Raza","ahmad.raza@company.com","IT","IT Staff","+92-321-1111111"',
      '"Fatima Noor","fatima.noor@company.com","Development","Frontend Dev","+92-321-2222222"',
      '"Hassan Ali","hassan.ali@company.com","HR","HR Officer","+92-321-3333333"',
      '"Zainab Khan","zainab.khan@company.com","Finance","Finance Analyst","+92-321-4444444"',
    ];
    const csv = [header, hint, ...rows].join('\n');
    _download(csv, 'example_employees_import.csv');
    Utils.toast("Downloaded! Check your browser's default Downloads folder (usually ~/Downloads).", 'info');
  }

  function _download(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  /* ── PARSE CSV ── */
  function parseCSV(text) {
    // Remove UTF-8 BOM if present
    if (text.startsWith('\uFEFF')) text = text.slice(1);
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    
    // Normalize headers: trim and lowercase for internal lookups, keep original for preview
    const rawHeaders = parseCSVLine(lines[0]).map(h => h.trim());
    const headers = rawHeaders.map(h => h.toLowerCase());

    const rows = lines.slice(1).map(l => {
      const vals = parseCSVLine(l);
      const obj  = {};
      // Store under both original and lowercase keys for maximum compatibility
      rawHeaders.forEach((h, i) => { 
        const val = (vals[i] || '').trim();
        obj[h] = val; 
        obj[h.toLowerCase()] = val;
      });
      return obj;
    }).filter(r => Object.values(r).some(v => v));
    return { headers: rawHeaders, rows };
  }

  function parseCSVLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += c;
    }
    result.push(cur);
    return result;
  }

  /* ── MAP CSV ROW TO ASSET ── */
  function mapAssetRow(row) {
    // Helper to get value case-insensitively
    const val = (key) => row[key] || row[key.toLowerCase()] || '';

    // Resolve vendor by name
    const vendorName = val('Vendor Name');
    const vendor = DB.vendors.all().find(v => v.name.toLowerCase() === vendorName.toLowerCase());

    // Resolve employee by name
    const empName = val('Assigned To');
    const emp     = DB.employees.all().find(e => e.name.toLowerCase() === empName.toLowerCase());

    let cat = val('Category') || 'Laptop';
    // Normalize category to Title Case to match system
    cat = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
    if (cat === 'Network device') cat = 'Network Device';

    return {
      category:      cat,
      brand:         val('Brand'),
      model:         val('Model'),
      serialNumber:  val('Serial Number'),
      status:        val('Status')        || 'Available',
      invoiceNumber: val('Invoice Number'),
      purchaseDate:  val('Purchase Date'),
      warrantyExpiry:val('Warranty Expiry'),
      vendorId:      vendor ? vendor.id : null,
      assignedTo:    emp    ? emp.id    : null,
      department:    val('Department')    || (emp ? emp.department : ''),
      location:      val('Location'),
      assignedDate:  val('Assigned Date'),
      cpu:           val('CPU'),
      ram:           val('RAM'),
      storage:       val('Storage'),
      os:            val('OS'),
      ipAddress:     val('IP Address'),
      macAddress:    val('MAC Address'),
      notes:         val('Notes'),
      assetTag:      DB.genAssetTag(cat),
    };
  }

  /* ── MAP CSV ROW TO EMPLOYEE ── */
  function mapEmployeeRow(row) {
    const val = (key) => row[key] || row[key.toLowerCase()] || '';
    return {
      name:       val('Full Name')   || val('Name'),
      email:      val('Email'),
      department: val('Department')  || 'IT',
      role:       val('Role'),
      phone:      val('Phone'),
    };
  }

  /* ── OPEN IMPORT MODAL ── */
  function openImport(type) {
    const isAsset = type === 'asset';
    const cols    = isAsset ? ASSET_COLUMNS : EMPLOYEE_COLUMNS;
    const exFn    = isAsset ? downloadExampleAsset : downloadExampleEmployee;
    const title   = isAsset ? '📥 Import Assets (Laptops / PCs)' : '📥 Import Employees';
    const accept  = '.csv,.tsv,.txt';
    const instructionsCols = cols.slice(0, isAsset ? 10 : 5);

    Utils.openModal({
      title,
      body: `
<div style="margin-bottom:20px">
  <div style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--accent-dim);border:1px solid rgba(34,211,238,0.2);border-radius:var(--radius-md);margin-bottom:16px">
    <span style="font-size:24px">📋</span>
    <div>
      <div style="font-weight:600;color:var(--accent)">Import from Google Sheets / Excel</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Export your Google Sheet as CSV (File → Download → CSV) then upload it here</div>
    </div>
    <button class="btn btn-secondary btn-sm" id="dl-example-btn">⬇ Download Example CSV</button>
  </div>

  <div style="margin-bottom:16px">
    <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Required Columns (first row must be headers)</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${instructionsCols.map(c=>`<span class="badge badge-primary" title="${Utils.esc(c.hint)}">${Utils.esc(c.label)}</span>`).join('')}
      ${isAsset ? `<span class="badge badge-muted">+ ${cols.length - instructionsCols.length} more optional columns</span>` : ''}
    </div>
  </div>

  <div id="drop-zone" style="border:2px dashed var(--border-strong);border-radius:var(--radius-lg);padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s;background:var(--bg-elevated)" 
    ondragover="event.preventDefault();this.style.borderColor='var(--primary)';this.style.background='var(--primary-dim)'"
    ondragleave="this.style.borderColor='var(--border-strong)';this.style.background='var(--bg-elevated)'"
    ondrop="ImportModule._handleDrop(event,'${type}')">
    <div style="font-size:36px;margin-bottom:12px">📂</div>
    <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:6px">Drop your CSV file here</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">or click to browse</div>
    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('csv-file-input').click()">Browse File</button>
    <input type="file" id="csv-file-input" accept="${accept}" style="display:none"/>
  </div>

  <div id="import-preview" style="margin-top:16px"></div>
</div>`,
      footer:`<button class="btn btn-secondary" id="mc">Cancel</button>
              <button class="btn btn-primary hidden" id="ms" data-type="${type}">📥 Import All Rows</button>`
    });

    setTimeout(() => {
      document.getElementById('mc').onclick = Utils.closeModal;
      document.getElementById('dl-example-btn').onclick = exFn;
      const fileInput = document.getElementById('csv-file-input');
      fileInput.addEventListener('change', e => {
        if (e.target.files[0]) _readFile(e.target.files[0], type);
      });
      // Also allow click on drop zone to open file picker
      document.getElementById('drop-zone').addEventListener('click', e => {
        if (e.target.tagName !== 'BUTTON') fileInput.click();
      });
      document.getElementById('ms').addEventListener('click', () => _doImport(type));
    }, 50);
  }

  function _handleDrop(event, type) {
    event.preventDefault();
    const dz = document.getElementById('drop-zone');
    if (dz) { dz.style.borderColor='var(--border-strong)'; dz.style.background='var(--bg-elevated)'; }
    const file = event.dataTransfer.files[0];
    if (file) _readFile(file, type);
  }

  function _readFile(file, type) {
    const reader = new FileReader();
    reader.onload = e => _showPreview(e.target.result, type, file.name);
    reader.readAsText(file);
  }

  function _showPreview(csvText, type, filename) {
    const { rows } = parseCSV(csvText);
    // Skip hint row if it matches expected pattern
    const dataRows = rows.filter(r => {
      const firstVal = Object.values(r)[0] || '';
      return !firstVal.toLowerCase().includes('laptop / desktop') &&
             !firstVal.toLowerCase().includes('required');
    });

    const preview = document.getElementById('import-preview');
    const saveBtn = document.getElementById('ms');
    if (!preview) return;

    if (dataRows.length === 0) {
      preview.innerHTML = `<div style="padding:16px;background:var(--danger-dim);border-radius:var(--radius-md);border:1px solid rgba(239,68,68,0.2);color:var(--danger)">⚠️ No valid data rows found in file. Make sure the first row is headers.</div>`;
      if (saveBtn) saveBtn.classList.add('hidden');
      return;
    }

    // Store for import
    window._importRows = { csvText, type, dataRows };

    const isAsset = type === 'asset';
    const previewRows = dataRows.slice(0, 5);
    const keys = isAsset
      ? ['Brand', 'Model', 'Category', 'Serial Number', 'Status', 'Assigned To', 'Department']
      : ['Full Name', 'Email', 'Department', 'Role', 'Phone'];

    preview.innerHTML = `
<div style="background:var(--success-dim);border:1px solid rgba(16,185,129,0.2);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
  <span>✅</span>
  <span style="font-size:13px"><strong>${dataRows.length}</strong> rows ready to import from <em>${Utils.esc(filename)}</em></span>
</div>
<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Preview (first ${Math.min(5,dataRows.length)} rows):</div>
<div class="table-wrapper">
  <table><thead><tr>${keys.map(k=>`<th>${Utils.esc(k)}</th>`).join('')}</tr></thead>
  <tbody>
    ${previewRows.map(r=>`<tr>${keys.map(k=>`<td style="font-size:12px">${Utils.esc(r[k]||'—')}</td>`).join('')}</tr>`).join('')}
    ${dataRows.length > 5 ? `<tr><td colspan="${keys.length}" style="text-align:center;color:var(--text-muted);font-size:12px">… and ${dataRows.length-5} more rows</td></tr>` : ''}
  </tbody></table>
</div>`;

    if (saveBtn) {
      saveBtn.textContent = `📥 Import ${dataRows.length} Row${dataRows.length!==1?'s':''}`;
      saveBtn.classList.remove('hidden');
    }
  }

  function _doImport(type) {
    const imp = window._importRows;
    if (!imp || imp.type !== type || !imp.dataRows || imp.dataRows.length === 0) {
      Utils.toast('No data to import', 'error'); return;
    }

    let imported = 0, skipped = 0;

    if (type === 'asset') {
      imp.dataRows.forEach((row, idx) => {
        try {
          const rowBrand = row['Brand'] || row['brand'] || '';
          const rowModel = row['Model'] || row['model'] || '';
          if (!rowBrand && !rowModel) { 
            console.warn(`[Import] Row ${idx+1} skipped: Missing Brand/Model columns. Content:`, row);
            skipped++; return; 
          }
          const data = mapAssetRow(row);
          DB.assets.insert(data);
          DB.activity.log('added', data.assetTag, `Imported: ${data.brand} ${data.model}`);
          imported++;
        } catch (err) {
          console.error(`[Import] Error processing row ${idx+1}:`, err, row);
          skipped++;
        }
      });
    } else {
      imp.dataRows.forEach((row, idx) => {
        try {
          const name = row['Full Name'] || row['full name'] || row['Name'] || row['name'] || '';
          if (!name) { 
             console.warn(`[Import] Row ${idx+1} skipped: Missing Full Name column. Content:`, row);
             skipped++; return; 
          }
          const data = mapEmployeeRow(row);
          // Skip duplicates by email
          const exists = DB.employees.all().find(e => e.email && e.email.toLowerCase() === (data.email||'').toLowerCase());
          if (exists) { skipped++; return; }
          DB.employees.insert(data);
          DB.activity.log('added','Employee',`Imported: ${data.name} (${data.department})`);
          imported++;
        } catch (err) {
          console.error(`[Import] Error processing row ${idx+1}:`, err, row);
          skipped++;
        }
      });
    }

    Utils.closeModal();
    window._importRows = null;

    const msg = `Successfully imported ${imported} record${imported!==1?'s':''}${skipped>0?` (${skipped} skipped — missing required fields or duplicates)`:''}`;
    Utils.toast(msg, imported > 0 ? 'success' : 'warning');

    // Refresh current module if applicable
    if (type === 'asset') {
      const b = document.getElementById('badge-assets');
      if (b) b.textContent = DB.assets.all().length;
      if (typeof AssetsModule !== 'undefined' && document.getElementById('asset-tbody')) AssetsModule.render();
    } else {
      const b = document.getElementById('badge-employees');
      if (b) b.textContent = DB.employees.all().length;
      if (typeof EmployeesModule !== 'undefined' && document.getElementById('emp-tbody')) EmployeesModule.render();
    }
  }

  return { openImport, downloadExampleAsset, downloadExampleEmployee, _handleDrop };
})();
