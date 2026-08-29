/* O'LCHOV: uch yillik ma'lumot bilan dastur qancha vaqtda ochiladi?

   Da'vo shundaki, `App.tsx` kirishda BUTUN bazani brauzerga yuklaydi va
   2-3 yildan keyin bu ishlamay qoladi. Bu — taxmin. Quyida haqiqiy o'lchov.

   Ishga tushirish:
     cd backend && T_DB=<baza> npx ts-node --transpile-only _t_scale.ts seed
     (serverni ko'taring)
     cd backend && npx ts-node --transpile-only _t_scale.ts measure <token>
*/
const MODE = process.argv[2];
const TOKEN = process.argv[3];
const BASE = process.env.T_BASE || 'http://localhost:3086';

/* Realistik hajm: kuniga 60 bemor, yiliga 300 ish kuni, 3 yil.
   Bemorlarning bir qismi qaytib keladi, shuning uchun noyob bemor kamroq. */
const PATIENTS = 15000;
const VISITS = 54000;
const CHARGES = 130000;
const TRANSACTIONS = 55000;
const APPOINTMENTS = 40000;

function seed(dbPath: string) {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = OFF');          // faqat sinov ma'lumoti uchun

    const clinicId = db.prepare('SELECT id FROM Clinic LIMIT 1').get()?.id;
    if (!clinicId) { console.error('Klinika topilmadi'); process.exit(1); }
    let doctorId = db.prepare('SELECT id FROM Doctor LIMIT 1').get()?.id || null;
    if (!doctorId) {
        // `Appointment.doctorId` majburiy — dev bazada shifokor bo'lmasa yasaymiz
        doctorId = 'scale-doc-1';
        const cols = db.prepare("PRAGMA table_info('Doctor')").all()
            .filter((c: any) => c.notnull && c.dflt_value === null).map((c: any) => c.name);
        const vals: Record<string, any> = {
            id: doctorId, clinicId, firstName: 'Sinov', lastName: 'Shifokorov',
            specialty: 'Terapevt', phone: '+998900000000', email: 'sinov@local',
            username: 'sinovdoc', password: 'x', status: 'Active', percentage: 0,
            fixedSalary: 0, experience: 0, schedule: '', bio: '', avatar: '',
        };
        const names = cols.filter((c: string) => c in vals);
        db.prepare(`INSERT INTO Doctor (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`)
            .run(...names.map((n: string) => vals[n]));
        console.log('  (sinov shifokori yaratildi)');
    }

    let seed = 42;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
    const FIRST = ['Aziz', 'Dilnoza', 'Bekzod', 'Malika', 'Jasur', 'Nilufar', 'Sardor', 'Zilola'];
    const LAST = ['Karimov', 'Sobirova', 'Toshmatov', 'Yusupova', 'Rahimov', 'Alieva'];
    const dateOf = (i: number) => {
        const d = new Date(Date.now() - Math.floor(rnd() * 1095) * 86400000);
        return d.toISOString().split('T')[0];
    };

    console.log(`Ma'lumot yasalmoqda: ${PATIENTS} bemor, ${CHARGES} hisob qatori…`);
    const t0 = Date.now();

    const pids: string[] = [];
    db.transaction(() => {
        const ins = db.prepare(
            `INSERT INTO Patient (id, clinicId, firstName, lastName, phone, dob, gender, status, lastVisit, balance, createdAt, doctorId, medicalHistory)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?, 0, ?, ?, '')`);
        for (let i = 0; i < PATIENTS; i++) {
            const id = `scale-p-${i}`;
            pids.push(id);
            ins.run(id, clinicId, pick(FIRST), pick(LAST),
                `+9989${String(100000000 + i).slice(0, 8)}`,
                `19${60 + Math.floor(rnd() * 40)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`,
                rnd() > 0.5 ? 'Male' : 'Female', dateOf(i), new Date().toISOString(), doctorId);
        }
    })();
    console.log(`  bemorlar: ${Date.now() - t0} ms`);

    db.transaction(() => {
        const ins = db.prepare(
            `INSERT INTO Visit (id, clinicId, patientId, date, status, checkInTime)
             VALUES (?, ?, ?, ?, 'Completed', ?)`);
        for (let i = 0; i < VISITS; i++) {
            ins.run(`scale-v-${i}`, clinicId, pick(pids), dateOf(i), new Date().toISOString());
        }
    })();

    db.transaction(() => {
        const ins = db.prepare(
            `INSERT INTO VisitCharge (id, clinicId, patientId, patientName, source, name, quantity, unitPrice, discount, total, paidAmount, status, createdAt)
             VALUES (?, ?, ?, ?, 'Service', ?, 1, ?, 0, ?, ?, ?, ?)`);
        for (let i = 0; i < CHARGES; i++) {
            const price = 20000 + Math.floor(rnd() * 30) * 10000;
            const paid = rnd() > 0.2 ? price : 0;
            ins.run(`scale-c-${i}`, clinicId, pick(pids), 'Sinov Bemor', `Xizmat ${i % 40}`,
                price, price, paid, paid >= price ? 'Paid' : 'Unpaid', new Date().toISOString());
        }
    })();

    db.transaction(() => {
        const ins = db.prepare(
            `INSERT INTO "Transaction" (id, clinicId, patientId, patientName, date, amount, type, service, status, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?)`);
        for (let i = 0; i < TRANSACTIONS; i++) {
            ins.run(`scale-t-${i}`, clinicId, pick(pids), 'Sinov Bemor', dateOf(i),
                20000 + Math.floor(rnd() * 30) * 10000, pick(['Cash', 'Card', 'Click']),
                `Xizmat ${i % 40}`, new Date().toISOString());
        }
    })();

    db.transaction(() => {
        const ins = db.prepare(
            `INSERT INTO Appointment (id, clinicId, patientId, patientName, date, time, status, doctorId, doctorName, type, duration)
             VALUES (?, ?, ?, ?, ?, '10:00', 'Completed', ?, 'Shifokor', 'Konsultatsiya', 30)`);
        for (let i = 0; i < APPOINTMENTS; i++) {
            ins.run(`scale-a-${i}`, clinicId, pick(pids), 'Sinov Bemor', dateOf(i), doctorId);
        }
    })();

    const counts = ['Patient', 'Visit', 'VisitCharge', '"Transaction"', 'Appointment']
        .map((t) => `${t}: ${db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c}`);
    db.close();
    console.log(`\nTayyor (${Math.round((Date.now() - t0) / 1000)} s)`);
    console.log('  ' + counts.join(', '));
}

async function measure() {
    const hit = async (path: string) => {
        const t0 = Date.now();
        const r = await fetch(BASE + '/api' + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const text = await r.text();
        const ms = Date.now() - t0;
        let rows = 0;
        try { const j = JSON.parse(text); rows = Array.isArray(j) ? j.length : (j?.items?.length || 0); } catch { /* ignore */ }
        return { ms, bytes: text.length, rows, status: r.status };
    };

    console.log('\nKIRISHDA YUKLANADIGAN MA\'LUMOT (App.tsx dagi Promise.all)');
    console.log('═'.repeat(64));

    const clinicId = (await (await fetch(BASE + '/api/clinics/me', {
        headers: { Authorization: `Bearer ${TOKEN}` },
    })).json().catch(() => ({})))?.id || '';

    const calls: [string, string][] = [
        ['bemorlar', `/patients?clinicId=${clinicId}&scope=clinic`],
        ['tranzaksiyalar', `/transactions?clinicId=${clinicId}`],
        ['qabullar', `/appointments?clinicId=${clinicId}`],
        ['hisob qatorlari', '/charges?status=Unpaid'],
        ['xarajatlar', `/expenses?clinicId=${clinicId}`],
    ];

    let totalMs = 0, totalBytes = 0, totalRows = 0;
    for (const [name, path] of calls) {
        const r = await hit(path);
        totalMs += r.ms; totalBytes += r.bytes; totalRows += r.rows;
        console.log(`  ${name.padEnd(18)} ${String(r.rows).padStart(7)} qator  ` +
            `${String(Math.round(r.bytes / 1024)).padStart(6)} KB  ${String(r.ms).padStart(6)} ms`);
    }

    console.log('─'.repeat(64));
    console.log(`  ${'JAMI'.padEnd(18)} ${String(totalRows).padStart(7)} qator  ` +
        `${String(Math.round(totalBytes / 1024)).padStart(6)} KB  ${String(totalMs).padStart(6)} ms`);

    // Parallel — App.tsx aynan shunday qiladi
    const t0 = Date.now();
    await Promise.all(calls.map(([, p]) => hit(p)));
    console.log(`\n  Promise.all bilan birga: ${Date.now() - t0} ms`);
    console.log(`  Brauzer xotirasida saqlanadigan JSON: ~${Math.round(totalBytes / 1024 / 1024 * 10) / 10} MB`);
    console.log(`  (JS obyektlari sifatida odatda 3-5 barobar ko'p joy egallaydi)`);

    // Solishtirish uchun: serverdagi qidiruv (10-relizda shu yo'l bo'ladi)
    const s = await hit('/patients/search?q=Karimov');
    console.log(`\n  Solishtirish — server qidiruvi: ${s.rows} qator, ${Math.round(s.bytes / 1024)} KB, ${s.ms} ms`);
}

if (MODE === 'seed') seed(process.env.T_DB!);
else measure().catch((e) => { console.error(e); process.exit(1); });
