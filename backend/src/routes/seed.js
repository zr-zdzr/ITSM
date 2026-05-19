const router  = require('express').Router();
const db       = require('../config/db');
const bcrypt   = require('bcryptjs');
const { requireAuth, requireRole } = require('../middleware/auth');

// Only super_admin can seed
router.post('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  const { force = false } = req.body;
  const results = {};

  try {
    // ── Employees ──────────────────────────────────────────
    const existEmp = await db.query('SELECT COUNT(*) FROM employees');
    if (force || Number(existEmp.rows[0].count) === 0) {
      const EMPLOYEES = [
        { name: 'Ahmed Raza',       email: 'ahmed.raza@bykea.com',      des: 'Software Engineer',       dept: 'Engineering',     mob: '0321-1000001', loc: 'Karachi',   et: 'Permanent'   },
        { name: 'Sara Khan',        email: 'sara.khan@bykea.com',        des: 'HR Manager',              dept: 'Human Resources', mob: '0300-2000002', loc: 'Lahore',    et: 'Permanent'   },
        { name: 'Usman Ahmed',      email: 'usman.ahmed@bykea.com',      des: 'Network Engineer',        dept: 'IT',              mob: '0333-3000003', loc: 'Islamabad', et: 'Permanent'   },
        { name: 'Hira Malik',       email: 'hira.malik@bykea.com',       des: 'Product Manager',         dept: 'Product',         mob: '0312-4000004', loc: 'Karachi',   et: 'Permanent'   },
        { name: 'Bilal Siddiqui',   email: 'bilal.siddiqui@bykea.com',   des: 'DevOps Engineer',         dept: 'IT',              mob: '0345-5000005', loc: 'Karachi',   et: 'Contractual' },
        { name: 'Ayesha Noor',      email: 'ayesha.noor@bykea.com',      des: 'Business Analyst',        dept: 'Operations',      mob: '0311-6000006', loc: 'Lahore',    et: 'Permanent'   },
        { name: 'Zain Hussain',     email: 'zain.hussain@bykea.com',     des: 'Frontend Developer',      dept: 'Engineering',     mob: '0301-7000007', loc: 'Karachi',   et: 'Permanent'   },
        { name: 'Fatima Sheikh',    email: 'fatima.sheikh@bykea.com',    des: 'Finance Analyst',         dept: 'Finance',         mob: '0322-8000008', loc: 'Karachi',   et: 'Permanent'   },
        { name: 'Omar Farooq',      email: 'omar.farooq@bykea.com',      des: 'Backend Developer',       dept: 'Engineering',     mob: '0344-9000009', loc: 'Islamabad', et: 'Contractual' },
        { name: 'Mehwish Ali',      email: 'mehwish.ali@bykea.com',      des: 'QA Engineer',             dept: 'Engineering',     mob: '0316-0000010', loc: 'Karachi',   et: 'Permanent'   },
      ];
      let count = 0;
      for (const e of EMPLOYEES) {
        await db.query(
          `INSERT INTO employees (full_name,email,designation,department,mobile_number,location,employment_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (email) DO NOTHING`,
          [e.name, e.email, e.des, e.dept, e.mob, e.loc, e.et]
        );
        count++;
      }
      results.employees = count;
    } else { results.employees = 'skipped'; }

    // Fetch employee IDs for assignments
    const empRows = await db.query('SELECT id FROM employees ORDER BY id LIMIT 10');
    const empIds  = empRows.rows.map(r => r.id);

    // ── Systems ────────────────────────────────────────────
    const existSys = await db.query('SELECT COUNT(*) FROM systems');
    if (force || Number(existSys.rows[0].count) === 0) {
      const SYSTEMS = [
        { tag:'IT-SYS-S001', type:'Laptop',  bt:'Branded',   mfr:'Dell',    model:'Latitude 5540',    sn:'DELLSN001', gen:'12th Gen', dept:'Engineering',  loc:'Karachi HQ',  atype:'employee', uid: empIds[0]||null, cpu:'Intel Core i7-1255U', cores:'10', r1:'16',r1b:'3200MHz',r1s:'A1', r2:'16',r2b:'3200MHz',r2s:'A2', d1:'512GB',d1t:'NVMe',   st:'assigned', we:'2027-03-01' },
        { tag:'IT-SYS-S002', type:'Laptop',  bt:'Branded',   mfr:'HP',      model:'EliteBook 840 G9', sn:'HPELSN002', gen:'12th Gen', dept:'Product',      loc:'Karachi HQ',  atype:'employee', uid: empIds[3]||null, cpu:'Intel Core i5-1235U', cores:'10', r1:'8', r1b:'3200MHz',r1s:'A1', r2:'8', r2b:'3200MHz',r2s:'A2', d1:'256GB',d1t:'NVMe',   st:'assigned', we:'2026-12-01' },
        { tag:'IT-SYS-S003', type:'Laptop',  bt:'Branded',   mfr:'Lenovo',  model:'ThinkPad X1 Carbon', sn:'LNVSN003', gen:'11th Gen', dept:'Engineering', loc:'Karachi HQ',  atype:'employee', uid: empIds[6]||null, cpu:'Intel Core i7-1165G7',cores:'8', r1:'16',r1b:'4266MHz',r1s:'A1', r2:'',  r2b:'',       r2s:'',  d1:'1TB',  d1t:'NVMe',   st:'assigned', we:'2027-06-01' },
        { tag:'IT-SYS-S004', type:'Laptop',  bt:'Branded',   mfr:'Apple',   model:'MacBook Pro 14"',  sn:'APPSN004', gen:'M2',       dept:'Engineering',  loc:'Karachi HQ',  atype:'employee', uid: empIds[8]||null, cpu:'Apple M2 Pro',         cores:'12', r1:'16',r1b:'Unified',  r1s:'',  r2:'',  r2b:'',       r2s:'',  d1:'512GB',d1t:'NVMe',   st:'assigned', we:'2028-01-01' },
        { tag:'IT-SYS-S005', type:'PC',      bt:'Unbranded', mfr:'Custom',  model:'Desktop Build',    sn:'CSTSN005', gen:'10th Gen', dept:'IT',           loc:'Server Room', atype:'inventory',uid: null,            cpu:'Intel Core i5-10400',  cores:'6',  r1:'8', r1b:'2666MHz',r1s:'A1', r2:'8', r2b:'2666MHz',r2s:'B1', d1:'256GB',d1t:'SSD',    st:'available',we:''           },
        { tag:'IT-SYS-S006', type:'PC',      bt:'Branded',   mfr:'Dell',    model:'OptiPlex 3090',    sn:'DELLOPTSN006',gen:'10th Gen',dept:'Finance',    loc:'Finance Office',atype:'employee',uid: empIds[7]||null, cpu:'Intel Core i5-10500',  cores:'6',  r1:'8', r1b:'2666MHz',r1s:'A1', r2:'',  r2b:'',       r2s:'',  d1:'256GB',d1t:'SSD',    st:'assigned', we:'2026-09-01' },
        { tag:'IT-SYS-S007', type:'Server',  bt:'Branded',   mfr:'Dell',    model:'PowerEdge R740',   sn:'DELLSRVSN007',gen:'2nd Gen',dept:'IT',         loc:'Server Room', atype:'inventory',uid: null,            cpu:'Intel Xeon Gold 6230', cores:'20', r1:'32',r1b:'2933MHz',r1s:'A1',r2:'32',r2b:'2933MHz',r2s:'A2', d1:'1.2TB',d1t:'SATA',  st:'in_use',   we:'2026-06-30' },
        { tag:'IT-SYS-S008', type:'Laptop',  bt:'Branded',   mfr:'HP',      model:'ProBook 450 G9',   sn:'HPROBSN008',gen:'12th Gen',dept:'Operations',  loc:'Lahore Office',atype:'employee',uid: empIds[5]||null, cpu:'Intel Core i5-1235U',  cores:'10', r1:'8', r1b:'3200MHz',r1s:'A1', r2:'8', r2b:'3200MHz',r2s:'A2', d1:'256GB',d1t:'NVMe',   st:'assigned', we:'2027-02-01' },
        { tag:'IT-SYS-S009', type:'Laptop',  bt:'Branded',   mfr:'Dell',    model:'Latitude 3520',    sn:'DELLSN009', gen:'11th Gen', dept:'Engineering', loc:'Karachi HQ',  atype:'wfh',      uid: empIds[9]||null, cpu:'Intel Core i5-1135G7', cores:'8',  r1:'8', r1b:'3200MHz',r1s:'A1', r2:'',  r2b:'',       r2s:'',  d1:'256GB',d1t:'NVMe',   st:'assigned', we:'2026-11-01' },
        { tag:'IT-SYS-S010', type:'Workstation',bt:'Branded', mfr:'HP',     model:'Z4 G4',            sn:'HPZ4SN010', gen:'10th Gen', dept:'Engineering', loc:'Karachi HQ',  atype:'employee', uid: empIds[1]||null, cpu:'Intel Xeon W-2225',    cores:'8',  r1:'32',r1b:'2933MHz',r1s:'A1',r2:'32',r2b:'2933MHz',r2s:'A2', d1:'512GB',d1t:'NVMe',   st:'assigned', we:'2027-08-01' },
      ];
      let count = 0;
      for (const s of SYSTEMS) {
        await db.query(
          `INSERT INTO systems
             (asset_tag,type,brand_type,manufacturer,model,serial_number,generation,department,location,
              assigned_type,assigned_user_id,cpu,cpu_cores,
              ram1_size,ram1_bus,ram1_slot,ram2_size,ram2_bus,ram2_slot,
              disk1_size,disk1_type,status,warranty_expiry)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
           ON CONFLICT (asset_tag) DO NOTHING`,
          [s.tag,s.type,s.bt,s.mfr,s.model,s.sn.toUpperCase(),s.gen,s.dept,s.loc,
           s.atype,s.uid,s.cpu,s.cores,
           s.r1||null,s.r1b||null,s.r1s||null,s.r2||null,s.r2b||null,s.r2s||null,
           s.d1||null,s.d1t||null,s.st,s.we||null]
        );
        count++;
      }
      results.systems = count;
    } else { results.systems = 'skipped'; }

    // ── Network Devices ────────────────────────────────────
    const existNet = await db.query('SELECT COUNT(*) FROM network_devices');
    if (force || Number(existNet.rows[0].count) === 0) {
      const NETWORK = [
        { dt:'Switch',       brand:'Cisco',    model:'Catalyst 2960-X', sn:'FOC2960X001', ip:'192.168.1.1',   mac:'00:1A:2B:3C:4D:01', loc:'Server Room',   st:'in_use', we:'2026-12-01' },
        { dt:'Switch',       brand:'Cisco',    model:'SG300-28',        sn:'FOC0300X002', ip:'192.168.1.2',   mac:'00:1A:2B:3C:4D:02', loc:'HQ Floor 2',    st:'in_use', we:'2027-03-01' },
        { dt:'Router',       brand:'Juniper',  model:'MX204',           sn:'JNP0204X003', ip:'10.0.0.1',      mac:'00:2C:4E:6F:7A:03', loc:'Server Room',   st:'in_use', we:'2027-01-01' },
        { dt:'Firewall',     brand:'Fortinet', model:'FortiGate 100F',  sn:'FGT100FX004', ip:'192.168.1.254', mac:'00:3D:5F:8A:9B:04', loc:'Server Room',   st:'in_use', we:'2027-06-01' },
        { dt:'Access Point', brand:'Ubiquiti', model:'UniFi AP AC Pro', sn:'UAP00PRX005', ip:'192.168.1.50',  mac:'00:4E:6A:AB:BC:05', loc:'HQ Floor 2',    st:'in_use', we:'2026-09-01' },
        { dt:'Access Point', brand:'Ubiquiti', model:'UniFi AP AC Lite',sn:'UAP00LTX006', ip:'192.168.1.51',  mac:'00:5F:7B:BC:CD:06', loc:'HQ Reception',  st:'in_use', we:'2026-09-01' },
      ];
      let count = 0;
      for (const n of NETWORK) {
        await db.query(
          `INSERT INTO network_devices (device_type,brand,model,serial_number,ip_address,mac_address,location,status,warranty_expiry)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [n.dt,n.brand,n.model,n.sn.toUpperCase(),n.ip,n.mac,n.loc,n.st,n.we||null]
        );
        count++;
      }
      results.network = count;
    } else { results.network = 'skipped'; }

    // ── Mobile Devices ─────────────────────────────────────
    const existMob = await db.query('SELECT COUNT(*) FROM mobiles');
    if (force || Number(existMob.rows[0].count) === 0) {
      const MOBILES = [
        { tag:'IT-MB-001', type:'Mobile', mfr:'Samsung', model:'Galaxy S23',      sn:'SMSGSN001', imei:'351000000000001', imei2:'351000000000002', os:'Android', dept:'Engineering',  loc:'Karachi', atype:'employee', uid:empIds[0]||null, we:'2026-08-01' },
        { tag:'IT-MB-002', type:'Mobile', mfr:'Apple',   model:'iPhone 14 Pro',   sn:'APLESN002', imei:'352000000000001', imei2:'',                os:'iOS',     dept:'Product',      loc:'Karachi', atype:'employee', uid:empIds[3]||null, we:'2027-02-01' },
        { tag:'IT-MB-003', type:'Mobile', mfr:'Samsung', model:'Galaxy A54',      sn:'SMSGSN003', imei:'353000000000001', imei2:'353000000000002', os:'Android', dept:'Operations',   loc:'Lahore',  atype:'employee', uid:empIds[5]||null, we:'2026-11-01' },
        { tag:'IT-MB-004', type:'Mobile', mfr:'Xiaomi',  model:'Redmi Note 12',   sn:'XMISN004',  imei:'354000000000001', imei2:'354000000000002', os:'Android', dept:'Finance',      loc:'Karachi', atype:'employee', uid:empIds[7]||null, we:'2026-06-01' },
        { tag:'IT-MB-005', type:'Mobile', mfr:'Samsung', model:'Galaxy S22',      sn:'SMSGSN005', imei:'355000000000001', imei2:'355000000000002', os:'Android', dept:'IT',           loc:'Karachi', atype:'inventory',uid:null,            we:''           },
        { tag:'IT-MB-006', type:'Pad',    mfr:'Apple',   model:'iPad Air 5th Gen',sn:'APLESN006', imei:'',               imei2:'',                os:'iOS',     dept:'Engineering',  loc:'Karachi', atype:'employee', uid:empIds[6]||null, we:'2027-05-01' },
      ];
      let count = 0;
      for (const m of MOBILES) {
        await db.query(
          `INSERT INTO mobiles (asset_tag,type,manufacturer,model,serial_number,imei,imei2,os,department,location,assigned_type,assigned_user_id,warranty_expiry)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (asset_tag) DO NOTHING`,
          [m.tag,m.type,m.mfr,m.model,m.sn.toUpperCase(),m.imei.toUpperCase()||null,m.imei2.toUpperCase()||null,m.os,m.dept,m.loc,m.atype,m.uid,m.we||null]
        );
        count++;
      }
      results.mobiles = count;
    } else { results.mobiles = 'skipped'; }

    // ── SIM Cards ──────────────────────────────────────────
    const existSim = await db.query('SELECT COUNT(*) FROM sims');
    if (force || Number(existSim.rows[0].count) === 0) {
      const SIMS = [
        { ph:'0321-1000001', iccid:'8992110000000000001', vendor:'Jazz',     st:'active', atype:'employee', uid:empIds[0]||null, pkg:'Corporate 10GB',  rate:600,  svc:'Corporate' },
        { ph:'0300-2000002', iccid:'8992120000000000002', vendor:'Zong',     st:'active', atype:'employee', uid:empIds[1]||null, pkg:'Business Plus',   rate:800,  svc:'Corporate' },
        { ph:'0333-3000003', iccid:'8992130000000000003', vendor:'Ufone',    st:'active', atype:'employee', uid:empIds[2]||null, pkg:'Postpaid 5GB',    rate:500,  svc:'Postpaid'  },
        { ph:'0312-4000004', iccid:'8992140000000000004', vendor:'Jazz',     st:'active', atype:'employee', uid:empIds[4]||null, pkg:'Corporate 10GB',  rate:600,  svc:'Corporate' },
        { ph:'0345-5000005', iccid:'8992150000000000005', vendor:'Telenor',  st:'active', atype:'inventory',uid:null,            pkg:'Postpaid 3GB',    rate:400,  svc:'Postpaid'  },
        { ph:'0316-0000010', iccid:'8992160000000000006', vendor:'Zong',     st:'active', atype:'employee', uid:empIds[9]||null, pkg:'Business Plus',   rate:800,  svc:'Corporate' },
      ];
      let count = 0;
      for (const s of SIMS) {
        await db.query(
          `INSERT INTO sims (phone_number,iccid,vendor,status,assigned_type,assigned_user_id,package_name,monthly_rate,service_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (phone_number) DO NOTHING`,
          [s.ph,s.iccid,s.vendor,s.st,s.atype,s.uid,s.pkg,s.rate,s.svc]
        );
        count++;
      }
      results.sims = count;
    } else { results.sims = 'skipped'; }

    // ── Cloud IDs (GWS) ────────────────────────────────────
    const existGws = await db.query('SELECT COUNT(*) FROM gws_accounts');
    if (force || Number(existGws.rows[0].count) === 0) {
      const GWS = [
        { dn:'Ahmed Raza',    email:'ahmed.raza@bykea.com',     dept:'Engineering',     des:'Software Engineer',     type:'User',            org:'/Engineering', st:'active' },
        { dn:'Sara Khan',     email:'sara.khan@bykea.com',      dept:'Human Resources', des:'HR Manager',            type:'User',            org:'/HR',          st:'active' },
        { dn:'Usman Ahmed',   email:'usman.ahmed@bykea.com',    dept:'IT',              des:'Network Engineer',      type:'User',            org:'/IT',          st:'active' },
        { dn:'Hira Malik',    email:'hira.malik@bykea.com',     dept:'Product',         des:'Product Manager',       type:'User',            org:'/Product',     st:'active' },
        { dn:'Bilal Siddiqui',email:'bilal.siddiqui@bykea.com', dept:'IT',             des:'DevOps Engineer',        type:'User',            org:'/IT',          st:'active' },
        { dn:'IT Support',    email:'itsupport@bykea.com',      dept:'IT',              des:'Shared Mailbox',        type:'Shared Mailbox',  org:'/IT',          st:'active' },
        { dn:'Noreply',       email:'noreply@bykea.com',        dept:'IT',              des:'Service Account',       type:'Service Account', org:'/Services',    st:'active' },
      ];
      let count = 0;
      for (const g of GWS) {
        await db.query(
          `INSERT INTO gws_accounts (display_name,email,department,designation,account_type,org_unit,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (email) DO NOTHING`,
          [g.dn,g.email,g.dept,g.des,g.type,g.org,g.st]
        );
        count++;
      }
      results.cloudIds = count;
    } else { results.cloudIds = 'skipped'; }

    // ── Inventory Items ────────────────────────────────────
    const existInv = await db.query('SELECT COUNT(*) FROM inv_items');
    if (force || Number(existInv.rows[0].count) === 0) {
      const ITEMS = [
        { name:'CAT6 Ethernet Cable (2m)', model:'CAT6-2M',   mfr:'Generic',  unit:'pcs', type:'quantity'           },
        { name:'HDMI Cable (1.5m)',         model:'HDMI-1.5M', mfr:'Generic',  unit:'pcs', type:'quantity'           },
        { name:'USB-C Charging Adapter',    model:'65W USB-C', mfr:'Anker',    unit:'pcs', type:'quantity'           },
        { name:'Wireless Mouse',            model:'M185',      mfr:'Logitech', unit:'pcs', type:'quantity_returnable' },
        { name:'Wireless Keyboard',         model:'K380',      mfr:'Logitech', unit:'pcs', type:'quantity_returnable' },
        { name:'Laptop Bag 15.6"',          model:'Business',  mfr:'Samsonite',unit:'pcs', type:'quantity_returnable' },
        { name:'HDMI-to-VGA Adapter',       model:'HDMI-VGA',  mfr:'Generic',  unit:'pcs', type:'quantity'           },
        { name:'Power Strip (6-outlet)',    model:'PS-6',      mfr:'Belkin',   unit:'pcs', type:'quantity'           },
      ];
      const STOCK = [30, 20, 25, 15, 12, 8, 18, 10];
      let count = 0;
      for (let i = 0; i < ITEMS.length; i++) {
        const it = ITEMS[i];
        const r = await db.query(
          `INSERT INTO inv_items (name,model,manufacturer,unit,tracking_type,created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [it.name, it.model, it.mfr, it.unit, it.type, req.user.id]
        );
        const itemId = r.rows[0].id;
        await db.query(
          `INSERT INTO inv_stock (item_id, quantity) VALUES ($1, $2)
           ON CONFLICT (item_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
          [itemId, STOCK[i]]
        );
        count++;
      }
      results.inventory = count;
    } else { results.inventory = 'skipped'; }

    res.json({ ok: true, results });

  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Check current counts
router.get('/status', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const [emp, sys, net, mob, sim, gws, inv] = await Promise.all([
      db.query('SELECT COUNT(*) FROM employees'),
      db.query('SELECT COUNT(*) FROM systems'),
      db.query('SELECT COUNT(*) FROM network_devices'),
      db.query('SELECT COUNT(*) FROM mobiles'),
      db.query('SELECT COUNT(*) FROM sims'),
      db.query('SELECT COUNT(*) FROM gws_accounts'),
      db.query('SELECT COUNT(*) FROM inv_items'),
    ]);
    res.json({
      employees:  Number(emp.rows[0].count),
      systems:    Number(sys.rows[0].count),
      network:    Number(net.rows[0].count),
      mobiles:    Number(mob.rows[0].count),
      sims:       Number(sim.rows[0].count),
      cloudIds:   Number(gws.rows[0].count),
      inventory:  Number(inv.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
