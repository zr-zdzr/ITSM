/* ============================================================
   db.js — LocalStorage Data Layer + Seed Data
   ============================================================ */

const DB = (() => {
  const KEYS = {
    assets:      'itms_assets',
    vendors:     'itms_vendors',
    employees:   'itms_employees',
    accessories: 'itms_accessories',
    network:     'itms_network',
    gws:         'itms_gws',
    mobiles:     'itms_mobiles',
    sims:        'itms_sims',
    activity:    'itms_activity',
    counters:    'itms_counters',
  };

  /* ── LOW-LEVEL ── */
  const get  = k => JSON.parse(localStorage.getItem(k) || '[]');
  const set  = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const getO = k => JSON.parse(localStorage.getItem(k) || '{}');
  const setO = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ── COUNTERS (auto-increment) ── */
  function nextId(type) {
    const c = getO(KEYS.counters);
    c[type] = (c[type] || 0) + 1;
    setO(KEYS.counters, c);
    return c[type];
  }

  function genMobileTag() {
    const n = String(nextId('mobileTag')).padStart(4, '0');
    return `IT-MB-${n}`;
  }

  function genAssetTag(category) {
    const prefixes = { Laptop:'LT', Desktop:'DT', Server:'SV', 'Network Device':'ND', Accessory:'AC', Mobile:'MB', Other:'OT' };
    const p = prefixes[category] || 'IT';
    const n = String(nextId('assetTag')).padStart(4, '0');
    return `IT-${p}-${n}`;
  }

  /* ── GENERIC CRUD ── */
  function all(table)  { return get(KEYS[table]); }
  function byId(table, id) { return all(table).find(r => r.id === id) || null; }
  function insert(table, data) {
    const rows = all(table);
    const row  = { ...data, id: Date.now() + Math.random(), createdAt: new Date().toISOString() };
    rows.push(row);
    set(KEYS[table], rows);
    return row;
  }
  function update(table, id, data) {
    const rows = all(table).map(r => r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r);
    set(KEYS[table], rows);
    return rows.find(r => r.id === id);
  }
  function remove(table, id) {
    const rows = all(table).filter(r => r.id !== id);
    set(KEYS[table], rows);
  }

  /* ── ACTIVITY LOG ── */
  function logActivity(action, subject, detail = '') {
    const logs = get(KEYS.activity);
    logs.unshift({ id: Date.now(), action, subject, detail, ts: new Date().toISOString() });
    if (logs.length > 100) logs.splice(100);
    set(KEYS.activity, logs);
  }
  function getActivity() { return get(KEYS.activity); }

  /* ── SEED DATA ── */
  const SEEDED_KEY = 'itms_seeded_v4';
  function seed() {
    if (localStorage.getItem(SEEDED_KEY)) return;

    // VENDORS
    const vendors = [
      { id: 1001, name: 'Dell Technologies',  contact: 'Ahmed Raza',    phone: '+92-321-1234567', email: 'ahmed@dell.pk',       address: 'Lahore, Punjab',    notes: 'Primary laptop & server supplier', createdAt: '2024-01-10T08:00:00Z' },
      { id: 1002, name: 'HP Pakistan',         contact: 'Sara Khan',     phone: '+92-300-9876543', email: 'sara@hp.pk',          address: 'Karachi, Sindh',    notes: 'Desktops and printers',            createdAt: '2024-02-01T08:00:00Z' },
      { id: 1003, name: 'Cisco Systems PK',   contact: 'Babar Ali',     phone: '+92-333-5556677', email: 'babar@cisco.pk',     address: 'Islamabad',         notes: 'Network infrastructure',           createdAt: '2024-01-15T08:00:00Z' },
      { id: 1004, name: 'Lenovo Pakistan',    contact: 'Fatima Malik',  phone: '+92-345-1112233', email: 'fatima@lenovo.pk',   address: 'Lahore, Punjab',    notes: 'Laptops for dev team',             createdAt: '2024-03-01T08:00:00Z' },
      { id: 1005, name: 'Tech Accessories PK',contact: 'Usman Tariq',   phone: '+92-312-4445566', email: 'usman@techpk.com',   address: 'Rawalpindi',        notes: 'RAM, SSDs, cables, peripherals',   createdAt: '2024-02-15T08:00:00Z' },
    ];
    set(KEYS.vendors, vendors);

    // EMPLOYEES
    const employees = [
      { id: 2001, name: 'Zeeshan Rafiq',    email: 'zeeshan@company.com',  department: 'IT',          role: 'IT Manager',        phone: '+92-321-0000001', createdAt: '2023-06-01T08:00:00Z' },
      { id: 2002, name: 'Ali Hassan',        email: 'ali@company.com',       department: 'Development', role: 'Senior Developer',  phone: '+92-321-0000002', createdAt: '2023-07-15T08:00:00Z' },
      { id: 2003, name: 'Sara Ahmed',        email: 'sara@company.com',      department: 'HR',          role: 'HR Manager',        phone: '+92-321-0000003', createdAt: '2023-08-01T08:00:00Z' },
      { id: 2004, name: 'Omar Farooq',       email: 'omar@company.com',      department: 'Finance',     role: 'Finance Analyst',   phone: '+92-321-0000004', createdAt: '2023-09-01T08:00:00Z' },
      { id: 2005, name: 'Hina Malik',        email: 'hina@company.com',      department: 'Development', role: 'Frontend Dev',      phone: '+92-321-0000005', createdAt: '2023-10-01T08:00:00Z' },
      { id: 2006, name: 'Tariq Mahmood',    email: 'tariq@company.com',     department: 'Operations',  role: 'Ops Lead',          phone: '+92-321-0000006', createdAt: '2023-11-01T08:00:00Z' },
      { id: 2007, name: 'Ayesha Siddiqui', email: 'ayesha@company.com',    department: 'Marketing',   role: 'Marketing Lead',    phone: '+92-321-0000007', createdAt: '2024-01-10T08:00:00Z' },
      { id: 2008, name: 'Bilal Khan',        email: 'bilal@company.com',     department: 'Development', role: 'Backend Dev',       phone: '+92-321-0000008', createdAt: '2024-02-01T08:00:00Z' },
      { id: 2009, name: 'Nadia Hussain',    email: 'nadia@company.com',     department: 'Support',     role: 'Support Engineer',  phone: '+92-321-0000009', createdAt: '2024-03-01T08:00:00Z' },
      { id: 2010, name: 'Fahad Qureshi',    email: 'fahad@company.com',     department: 'IT',          role: 'IT Staff',          phone: '+92-321-0000010', createdAt: '2024-03-15T08:00:00Z' },
    ];
    set(KEYS.employees, employees);

    // ASSETS
    const assets = [
      { id: 3001, assetTag:'IT-LT-0001', category:'Laptop',  brand:'Dell', model:'Latitude 5540',    serialNumber:'DL5540001', purchaseDate:'2023-06-01', invoiceNumber:'INV-2023-001', vendorId:1001, warrantyExpiry:'2026-06-01', status:'In Use', assignedTo:2001, department:'IT',          location:'HQ Floor 2', assignedDate:'2023-06-05', cpu:'Intel Core i7-13th Gen', ram:'16GB DDR5', storage:'512GB SSD', macAddress:'AA:BB:CC:DD:EE:01', ipAddress:'192.168.1.101', os:'Ubuntu 22.04', notes:'IT Manager laptop', createdAt:'2023-06-01' },
      { id: 3002, assetTag:'IT-LT-0002', category:'Laptop',  brand:'Dell', model:'Latitude 5540',    serialNumber:'DL5540002', purchaseDate:'2023-07-15', invoiceNumber:'INV-2023-002', vendorId:1001, warrantyExpiry:'2026-07-15', status:'In Use', assignedTo:2002, department:'Development', location:'HQ Floor 3', assignedDate:'2023-07-20', cpu:'Intel Core i7-13th Gen', ram:'32GB DDR5', storage:'1TB SSD',   macAddress:'AA:BB:CC:DD:EE:02', ipAddress:'192.168.1.102', os:'Ubuntu 22.04', notes:'Dev team laptop', createdAt:'2023-07-15' },
      { id: 3003, assetTag:'IT-LT-0003', category:'Laptop',  brand:'Lenovo', model:'ThinkPad X1 Carbon', serialNumber:'LN-X1C-003', purchaseDate:'2023-10-01', invoiceNumber:'INV-2023-005', vendorId:1004, warrantyExpiry:'2026-10-01', status:'In Use', assignedTo:2005, department:'Development', location:'HQ Floor 3', assignedDate:'2023-10-05', cpu:'Intel Core i5-13th Gen', ram:'16GB DDR5', storage:'512GB SSD', macAddress:'AA:BB:CC:DD:EE:03', ipAddress:'192.168.1.103', os:'Windows 11 Pro', notes:'Frontend dev laptop', createdAt:'2023-10-01' },
      { id: 3004, assetTag:'IT-DT-0001', category:'Desktop', brand:'HP', model:'EliteDesk 800 G6',   serialNumber:'HP-ED-0001', purchaseDate:'2023-08-01', invoiceNumber:'INV-2023-003', vendorId:1002, warrantyExpiry:'2026-08-01', status:'In Use', assignedTo:2003, department:'HR', location:'HR Office', assignedDate:'2023-08-05', cpu:'Intel Core i5-12th Gen', ram:'8GB DDR4', storage:'256GB SSD', macAddress:'AA:BB:CC:DD:EE:04', ipAddress:'192.168.1.104', os:'Windows 11 Pro', notes:'HR department desktop', createdAt:'2023-08-01' },
      { id: 3005, assetTag:'IT-DT-0002', category:'Desktop', brand:'HP', model:'EliteDesk 800 G6',   serialNumber:'HP-ED-0002', purchaseDate:'2023-09-01', invoiceNumber:'INV-2023-004', vendorId:1002, warrantyExpiry:'2026-09-01', status:'In Use', assignedTo:2004, department:'Finance', location:'Finance Office', assignedDate:'2023-09-05', cpu:'Intel Core i5-12th Gen', ram:'8GB DDR4', storage:'256GB SSD', macAddress:'AA:BB:CC:DD:EE:05', ipAddress:'192.168.1.105', os:'Windows 11 Pro', notes:'Finance desktop', createdAt:'2023-09-01' },
      { id: 3006, assetTag:'IT-SV-0001', category:'Server',  brand:'Dell', model:'PowerEdge R740',   serialNumber:'DL-PE-R740-001', purchaseDate:'2022-01-15', invoiceNumber:'INV-2022-001', vendorId:1001, warrantyExpiry:'2025-01-15', status:'In Use', assignedTo:null, department:'IT', location:'Server Room', assignedDate:null, cpu:'Intel Xeon Silver 4210', ram:'64GB ECC', storage:'4TB RAID', macAddress:'AA:BB:CC:DD:EE:06', ipAddress:'192.168.1.10', os:'Ubuntu Server 22.04', notes:'Primary application server', createdAt:'2022-01-15' },
      { id: 3007, assetTag:'IT-LT-0004', category:'Laptop',  brand:'Dell', model:'Vostro 5310',      serialNumber:'DL-VS-0004', purchaseDate:'2024-01-10', invoiceNumber:'INV-2024-001', vendorId:1001, warrantyExpiry:'2027-01-10', status:'In Use', assignedTo:2007, department:'Marketing', location:'Marketing Office', assignedDate:'2024-01-15', cpu:'Intel Core i5-12th Gen', ram:'8GB DDR4', storage:'256GB SSD', macAddress:'AA:BB:CC:DD:EE:07', ipAddress:'192.168.1.107', os:'Windows 11 Home', notes:'Marketing team laptop', createdAt:'2024-01-10' },
      { id: 3008, assetTag:'IT-LT-0005', category:'Laptop',  brand:'Lenovo', model:'ThinkPad E14',   serialNumber:'LN-E14-0005', purchaseDate:'2024-02-01', invoiceNumber:'INV-2024-002', vendorId:1004, warrantyExpiry:'2027-02-01', status:'In Use', assignedTo:2008, department:'Development', location:'HQ Floor 3', assignedDate:'2024-02-05', cpu:'AMD Ryzen 5 5600U', ram:'16GB DDR4', storage:'512GB SSD', macAddress:'AA:BB:CC:DD:EE:08', ipAddress:'192.168.1.108', os:'Ubuntu 22.04', notes:'Backend dev laptop', createdAt:'2024-02-01' },
      { id: 3009, assetTag:'IT-LT-0006', category:'Laptop',  brand:'Dell', model:'Latitude 3540',    serialNumber:'DL-3540-006', purchaseDate:'2023-12-01', invoiceNumber:'INV-2023-010', vendorId:1001, warrantyExpiry:'2026-12-01', status:'Available', assignedTo:null, department:null, location:'IT Store', assignedDate:null, cpu:'Intel Core i3-12th Gen', ram:'8GB DDR4', storage:'256GB SSD', macAddress:'AA:BB:CC:DD:EE:09', ipAddress:null, os:'Windows 11 Pro', notes:'Spare laptop', createdAt:'2023-12-01' },
      { id: 3010, assetTag:'IT-DT-0003', category:'Desktop', brand:'HP', model:'ProDesk 400 G7',     serialNumber:'HP-PD-0003', purchaseDate:'2022-06-01', invoiceNumber:'INV-2022-005', vendorId:1002, warrantyExpiry:'2025-06-01', status:'Repair', assignedTo:null, department:'Support', location:'IT Workshop', assignedDate:null, cpu:'Intel Core i3-11th Gen', ram:'4GB DDR4', storage:'120GB SSD', macAddress:'AA:BB:CC:DD:EE:10', ipAddress:null, os:'Windows 10 Pro', notes:'Screen issue — sent for repair', createdAt:'2022-06-01' },
      { id: 3011, assetTag:'IT-LT-0007', category:'Laptop',  brand:'HP', model:'ProBook 450 G9',     serialNumber:'HP-PB-0007', purchaseDate:'2024-03-01', invoiceNumber:'INV-2024-003', vendorId:1002, warrantyExpiry:'2027-03-01', status:'In Use', assignedTo:2009, department:'Support', location:'Support Desk', assignedDate:'2024-03-05', cpu:'Intel Core i5-12th Gen', ram:'8GB DDR4', storage:'256GB SSD', macAddress:'AA:BB:CC:DD:EE:11', ipAddress:'192.168.1.111', os:'Windows 11 Pro', notes:'Support team laptop', createdAt:'2024-03-01' },
      { id: 3012, assetTag:'IT-LT-0008', category:'Laptop',  brand:'Lenovo', model:'IdeaPad 5',      serialNumber:'LN-IP5-0008', purchaseDate:'2021-05-01', invoiceNumber:'INV-2021-003', vendorId:1004, warrantyExpiry:'2024-05-01', status:'Retired', assignedTo:null, department:null, location:'IT Store', assignedDate:null, cpu:'Intel Core i5-10th Gen', ram:'8GB DDR4', storage:'256GB SSD', macAddress:'AA:BB:CC:DD:EE:12', ipAddress:null, os:'Windows 10 Home', notes:'End of life — retired', createdAt:'2021-05-01' },
    ];
    set(KEYS.assets, assets);

    // NETWORK DEVICES
    const network = [
      { id: 4001, assetTag:'IT-ND-0001', deviceType:'Switch', brand:'Cisco', model:'Catalyst 2960-X', serialNumber:'CSC-SW-001', purchaseDate:'2022-03-01', vendorId:1003, warrantyExpiry:'2025-03-01', status:'In Use', ipAddress:'192.168.1.1', vlan:'VLAN 10, VLAN 20', firmwareVersion:'15.2(7)E4', rackLocation:'Rack A - U12', location:'Server Room', notes:'Core switch', createdAt:'2022-03-01' },
      { id: 4002, assetTag:'IT-ND-0002', deviceType:'Router', brand:'Cisco', model:'ISR 4331',         serialNumber:'CSC-RT-002', purchaseDate:'2022-03-01', vendorId:1003, warrantyExpiry:'2025-03-01', status:'In Use', ipAddress:'192.168.1.254', vlan:'All', firmwareVersion:'16.9.7', rackLocation:'Rack A - U1', location:'Server Room', notes:'Main internet router', createdAt:'2022-03-01' },
      { id: 4003, assetTag:'IT-ND-0003', deviceType:'Firewall', brand:'Cisco', model:'ASA 5506-X',     serialNumber:'CSC-FW-003', purchaseDate:'2022-04-01', vendorId:1003, warrantyExpiry:'2025-04-01', status:'In Use', ipAddress:'10.0.0.1', vlan:'DMZ, LAN', firmwareVersion:'9.16(4)', rackLocation:'Rack A - U2', location:'Server Room', notes:'Perimeter firewall', createdAt:'2022-04-01' },
      { id: 4004, assetTag:'IT-ND-0004', deviceType:'Switch', brand:'Cisco', model:'SG350-28',         serialNumber:'CSC-SW-004', purchaseDate:'2023-01-15', vendorId:1003, warrantyExpiry:'2026-01-15', status:'In Use', ipAddress:'192.168.1.2', vlan:'VLAN 10', firmwareVersion:'2.5.7.05', rackLocation:'Rack B - U8', location:'Floor 3', notes:'Floor 3 access switch', createdAt:'2023-01-15' },
      { id: 4005, assetTag:'IT-ND-0005', deviceType:'Access Point', brand:'Cisco', model:'Aironet 2800',serialNumber:'CSC-AP-005', purchaseDate:'2023-06-01', vendorId:1003, warrantyExpiry:'2026-06-01', status:'In Use', ipAddress:'192.168.1.51', vlan:'VLAN 20', firmwareVersion:'8.10.183.0', rackLocation:'Wall Mount', location:'HQ Floor 2', notes:'WiFi AP Floor 2', createdAt:'2023-06-01' },
    ];
    set(KEYS.network, network);

    // ACCESSORIES
    const accessories = [
      { id: 5001, type:'Mouse',    brand:'Logitech', model:'MX Master 3', serialNumber:'LG-MX3-001', quantity:15, available:8, purchaseDate:'2023-06-01', vendorId:1005, status:'Active', linkedAssetId:null, notes:'Wireless mice for employees', createdAt:'2023-06-01' },
      { id: 5002, type:'Keyboard', brand:'Logitech', model:'K120',        serialNumber:'LG-K120-001', quantity:20, available:5, purchaseDate:'2023-06-01', vendorId:1005, status:'Active', linkedAssetId:null, notes:'USB keyboards stock', createdAt:'2023-06-01' },
      { id: 5003, type:'RAM',      brand:'Kingston', model:'DDR4 16GB',   serialNumber:'KG-RAM-001',  quantity:10, available:6, purchaseDate:'2023-09-01', vendorId:1005, status:'Active', linkedAssetId:null, notes:'Upgrade stock for desktops', createdAt:'2023-09-01' },
      { id: 5004, type:'SSD',      brand:'Samsung',  model:'870 EVO 1TB', serialNumber:'SM-SSD-001',  quantity:8,  available:3, purchaseDate:'2023-10-01', vendorId:1005, status:'Active', linkedAssetId:null, notes:'Replacement SSDs', createdAt:'2023-10-01' },
      { id: 5005, type:'Cable',    brand:'Generic',  model:'Cat6 Patch 2m',serialNumber:'GN-CAB-001', quantity:50, available:32, purchaseDate:'2023-01-01', vendorId:1005, status:'Active', linkedAssetId:null, notes:'Network patch cables', createdAt:'2023-01-01' },
      { id: 5006, type:'Monitor',  brand:'Dell',     model:'P2422H 24"',  serialNumber:'DL-MON-001',  quantity:5,  available:2, purchaseDate:'2024-01-15', vendorId:1001, status:'Active', linkedAssetId:3004, notes:'monitors for desktops', createdAt:'2024-01-15' },
      { id: 5007, type:'USB Hub',  brand:'Anker',    model:'7-Port USB 3.0',serialNumber:'AN-HUB-001', quantity:12, available:7, purchaseDate:'2023-11-01', vendorId:1005, status:'Active', linkedAssetId:null, notes:'USB hubs for workstations', createdAt:'2023-11-01' },
    ];
    set(KEYS.accessories, accessories);

    // ACTIVITY LOG
    const activity = [
      { id: 1, action:'assigned', subject:'IT-LT-0005', detail:'Assigned to Bilal Khan', ts:'2024-02-05T09:00:00Z' },
      { id: 2, action:'added',    subject:'IT-LT-0004', detail:'New asset added from Dell', ts:'2024-01-10T10:30:00Z' },
      { id: 3, action:'repair',   subject:'IT-DT-0003', detail:'Sent to workshop for screen repair', ts:'2024-03-20T08:00:00Z' },
      { id: 4, action:'added',    subject:'IT-ND-0005', detail:'Cisco AP installed on Floor 2', ts:'2023-06-05T11:00:00Z' },
      { id: 5, action:'retired',  subject:'IT-LT-0008', detail:'Lenovo IdeaPad 5 retired - EOL', ts:'2024-04-01T09:00:00Z' },
    ];
    set(KEYS.activity, activity);

    // GWS GOOGLE IDS
    const gws = [
      { id: 7001, googleEmail: 'zeeshan@antigravity.com', displayName: 'Zeeshan Rafiq',    role: 'Super Admin', department: 'IT',          employeeId: 2001, storageUsed: 12.5, storageLimit: 30, status: 'Active',    twoFA: true,  orgUnit: '/IT',          creationDate: '2022-01-01', lastLogin: '2026-05-08', notes: 'Primary IT Admin account', createdAt: '2022-01-01T08:00:00Z' },
      { id: 7002, googleEmail: 'ali@antigravity.com',     displayName: 'Ali Hassan',        role: 'User',        department: 'Development', employeeId: 2002, storageUsed: 8.2,  storageLimit: 30, status: 'Active',    twoFA: true,  orgUnit: '/Engineering', creationDate: '2023-07-15', lastLogin: '2026-05-07', notes: '',                         createdAt: '2023-07-15T08:00:00Z' },
      { id: 7003, googleEmail: 'sara@antigravity.com',    displayName: 'Sara Ahmed',        role: 'User',        department: 'HR',          employeeId: 2003, storageUsed: 5.0,  storageLimit: 30, status: 'Active',    twoFA: false, orgUnit: '/HR',          creationDate: '2023-08-01', lastLogin: '2026-05-06', notes: '2FA not yet enabled',      createdAt: '2023-08-01T08:00:00Z' },
      { id: 7004, googleEmail: 'omar@antigravity.com',    displayName: 'Omar Farooq',       role: 'User',        department: 'Finance',     employeeId: 2004, storageUsed: 3.1,  storageLimit: 30, status: 'Active',    twoFA: true,  orgUnit: '/Finance',     creationDate: '2023-09-01', lastLogin: '2026-04-20', notes: '',                         createdAt: '2023-09-01T08:00:00Z' },
      { id: 7005, googleEmail: 'exuser@antigravity.com',  displayName: 'Ex Employee',       role: 'User',        department: 'Marketing',   employeeId: null, storageUsed: 2.0,  storageLimit: 30, status: 'Suspended', twoFA: false, orgUnit: '/Marketing',   creationDate: '2022-06-01', lastLogin: '2025-01-15', notes: 'Employee left — suspended', createdAt: '2022-06-01T08:00:00Z' },
    ];
    set(KEYS.gws, gws);

    // MOBILE RECORDS
    const mobiles = [
      { id: 8001, assetTag: 'IT-MB-0001', brand: 'Samsung', model: 'Galaxy S23',      imei1: '354321012345678', imei2: '',               serialNumber: 'R3CX12345',  color: 'Phantom Black', purchaseDate: '2023-06-01', invoiceNumber: 'INV-2023-M01', vendorId: null, warrantyExpiry: '2025-06-01', status: 'In Use',    assignedTo: 2001, department: 'IT',         location: 'HQ',       os: 'Android', osVersion: 'Android 14', storageCapacity: '256GB', notes: 'IT Manager phone',  createdAt: '2023-06-01T08:00:00Z' },
      { id: 8002, assetTag: 'IT-MB-0002', brand: 'Apple',   model: 'iPhone 14',       imei1: '354321012345679', imei2: '',               serialNumber: 'F2MN98765',  color: 'Space Gray',    purchaseDate: '2023-09-01', invoiceNumber: 'INV-2023-M02', vendorId: null, warrantyExpiry: '2025-09-01', status: 'In Use',    assignedTo: 2006, department: 'Operations', location: 'HQ',       os: 'iOS',     osVersion: 'iOS 17',     storageCapacity: '128GB', notes: 'Ops Lead phone',    createdAt: '2023-09-01T08:00:00Z' },
      { id: 8003, assetTag: 'IT-MB-0003', brand: 'Samsung', model: 'Galaxy A54',      imei1: '354321012345680', imei2: '354321012345681', serialNumber: 'R3CX54321',  color: 'Awesome White', purchaseDate: '2024-01-01', invoiceNumber: 'INV-2024-M01', vendorId: null, warrantyExpiry: '2026-01-01', status: 'Available', assignedTo: null, department: null,         location: 'IT Store', os: 'Android', osVersion: 'Android 14', storageCapacity: '128GB', notes: 'Spare device',      createdAt: '2024-01-01T08:00:00Z' },
      { id: 8004, assetTag: 'IT-MB-0004', brand: 'Xiaomi',  model: 'Redmi Note 12',   imei1: '354321012345682', imei2: '',               serialNumber: 'XM-RN12-001',color: 'Ice Blue',      purchaseDate: '2022-06-01', invoiceNumber: 'INV-2022-M01', vendorId: null, warrantyExpiry: '2024-06-01', status: 'Retired',   assignedTo: null, department: null,         location: 'IT Store', os: 'Android', osVersion: 'Android 12', storageCapacity: '64GB',  notes: 'Retired — EOL',    createdAt: '2022-06-01T08:00:00Z' },
    ];
    set(KEYS.mobiles, mobiles);

    // SIMS RECORD
    const sims = [
      { id: 9001, phoneNumber: '0321-0000001', iccid: '8992010112345678901', carrier: 'Jazz',    plan: 'Business Pro 50GB', dataLimit: '50GB',  status: 'Active',   assignedTo: 2001, mobileId: 8001, activationDate: '2023-06-01', expiryDate: null,         monthlyRate: 1500, notes: 'IT Manager SIM',           createdAt: '2023-06-01T08:00:00Z' },
      { id: 9002, phoneNumber: '0321-0000006', iccid: '8992010112345678902', carrier: 'Jazz',    plan: 'Business Pro 50GB', dataLimit: '50GB',  status: 'Active',   assignedTo: 2006, mobileId: 8002, activationDate: '2023-09-01', expiryDate: null,         monthlyRate: 1500, notes: 'Ops Lead SIM',             createdAt: '2023-09-01T08:00:00Z' },
      { id: 9003, phoneNumber: '0300-1234567', iccid: '8992040112345678903', carrier: 'Ufone',   plan: 'Data SIM 30GB',     dataLimit: '30GB',  status: 'Active',   assignedTo: null, mobileId: null, activationDate: '2024-02-01', expiryDate: null,         monthlyRate: 800,  notes: 'Spare hotspot SIM',        createdAt: '2024-02-01T08:00:00Z' },
      { id: 9004, phoneNumber: '0333-9876543', iccid: '8992030112345678904', carrier: 'Telenor', plan: 'Business 20GB',     dataLimit: '20GB',  status: 'Inactive', assignedTo: null, mobileId: null, activationDate: '2022-01-01', expiryDate: '2025-01-01', monthlyRate: 600,  notes: 'Inactive — plan expired',  createdAt: '2022-01-01T08:00:00Z' },
      { id: 9005, phoneNumber: '0311-5555555', iccid: '8992060112345678905', carrier: 'Zong',    plan: 'Business 100GB',    dataLimit: '100GB', status: 'Active',   assignedTo: 2007, mobileId: null, activationDate: '2024-03-01', expiryDate: null,         monthlyRate: 2000, notes: 'Marketing Lead heavy plan', createdAt: '2024-03-01T08:00:00Z' },
    ];
    set(KEYS.sims, sims);

    // set counters so auto-ids don't collide
    setO(KEYS.counters, { assetTag: 12, mobileTag: 4 });

    localStorage.setItem(SEEDED_KEY, '1');
  }

  /* ── PUBLIC API ── */
  return {
    // raw
    all, byId, insert, update, remove,
    // tables
    vendors:     { all:()=>all('vendors'),     byId:id=>byId('vendors',id),     insert:d=>insert('vendors',d),     update:(id,d)=>update('vendors',id,d),     remove:id=>remove('vendors',id) },
    employees:   { all:()=>all('employees'),   byId:id=>byId('employees',id),   insert:d=>insert('employees',d),   update:(id,d)=>update('employees',id,d),   remove:id=>remove('employees',id) },
    assets:      { all:()=>all('assets'),      byId:id=>byId('assets',id),      insert:d=>insert('assets',d),      update:(id,d)=>update('assets',id,d),      remove:id=>remove('assets',id) },
    accessories: { all:()=>all('accessories'), byId:id=>byId('accessories',id), insert:d=>insert('accessories',d), update:(id,d)=>update('accessories',id,d), remove:id=>remove('accessories',id) },
    network:     { all:()=>all('network'),     byId:id=>byId('network',id),     insert:d=>insert('network',d),     update:(id,d)=>update('network',id,d),     remove:id=>remove('network',id) },
    gws:         { all:()=>all('gws'),         byId:id=>byId('gws',id),         insert:d=>insert('gws',d),         update:(id,d)=>update('gws',id,d),         remove:id=>remove('gws',id) },
    mobiles:     { all:()=>all('mobiles'),     byId:id=>byId('mobiles',id),     insert:d=>insert('mobiles',d),     update:(id,d)=>update('mobiles',id,d),     remove:id=>remove('mobiles',id) },
    sims:        { all:()=>all('sims'),        byId:id=>byId('sims',id),        insert:d=>insert('sims',d),        update:(id,d)=>update('sims',id,d),        remove:id=>remove('sims',id) },
    activity:    { log:logActivity, all:getActivity },
    genAssetTag, genMobileTag,
    seed,

    // stats helpers
    stats() {
      const assets = all('assets');
      const net    = all('network');
      const acc    = all('accessories');
      return {
        totalAssets:    assets.length + net.length,
        inUse:          assets.filter(a=>a.status==='In Use').length,
        available:      assets.filter(a=>a.status==='Available').length,
        repair:         assets.filter(a=>a.status==='Repair').length,
        retired:        assets.filter(a=>a.status==='Retired').length,
        totalEmployees: all('employees').length,
        totalVendors:   all('vendors').length,
        networkDevices: net.length,
        accessories:    acc.length,
        warrantyExpired:  assets.filter(a=>a.warrantyExpiry && new Date(a.warrantyExpiry)<new Date()).length,
        warrantyExpiring: assets.filter(a=>{
          if(!a.warrantyExpiry) return false;
          const d = new Date(a.warrantyExpiry);
          const now = new Date();
          return d>=now && d<=new Date(now.getTime()+90*864e5);
        }).length,
        gwsAccounts:    all('gws').length,
        gwsActive:      all('gws').filter(g=>g.status==='Active').length,
        totalMobiles:   all('mobiles').length,
        mobilesInUse:   all('mobiles').filter(m=>m.status==='In Use').length,
        totalSims:      all('sims').length,
        simsActive:     all('sims').filter(s=>s.status==='Active').length,
      };
    }
  };
})();

// Boot seed
DB.seed();
