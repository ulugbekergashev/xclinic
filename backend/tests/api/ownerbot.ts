/* RAHBAR VA SHIFOKOR BOTI (2026-11-27, migratsiya 0050).

   ASOSIY SAVOLLAR:
     1. Sozlamalar: dastlab hisobot YOQIQ 22:00 (avvalgidek), shifokorga xabar
        yoqiq; noto'g'ri vaqt — 400; faqat ega (403).
     2. Namuna: botdagi «Xizmatlar» soni Hisobot (/reports/summary) bilan
        aynan bir xil.
     3. Shifokorga qabul xabari: yangi · ko'chirildi · boshqa shifokorga
        o'tdi (ikkalasiga) · bekor · o'chirildi. Sozlama o'chiq bo'lsa yoki
        qabul o'tgan kunga bo'lsa — xabar yo'q.
        Haqiqiy Telegram yo'q: bot ishga tushmagan, xabar Telegram tarixiga
        «Failed» bo'lib yoziladi — matni va oluvchisi shundan tekshiriladi.

   Ishga tushirish: cd backend && T_ONLY=ownerbot npm run test:api
*/
const BASE = process.env.T_BASE || 'http://localhost:3079';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(method: string, path: string, body?: any, token?: string) {
    const r = await fetch(BASE + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Toshkent kuni ± n */
const tDay = (n = 0) => new Date(Date.now() + 5 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

async function main() {
    const dbPath = process.env.T_DB;
    if (!dbPath) { console.log("  ⏭  T_DB berilmagan — to'plam o'tkazib yuborildi"); return finish(); }
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);

    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) { db.close(); return finish(); }
    const api = (m: string, p: string, b?: any) => call(m, p, b, token);
    const clinicId = login.data?.user?.clinicId || (await api('GET', '/clinics')).data?.[0]?.id;
    const tag = String(Date.now()).slice(-6);
    const orig = db.prepare('SELECT botToken, doctorNotify, ownerReportEnabled, ownerReportTime FROM Clinic WHERE id = ?').get(clinicId);
    const logsTo = (chat: string) => db.prepare('SELECT message FROM TelegramLog WHERE recipient = ? ORDER BY rowid').all(chat).map((r: any) => String(r.message));
    const waitLogs = async (chat: string, n: number) => {
        for (let i = 0; i < 40; i++) { if (logsTo(chat).length >= n) break; await sleep(50); }
        return logsTo(chat);
    };

    const chatA = `91${tag}`, chatB = `92${tag}`;
    let docA: any = null, docB: any = null;
    try {
        console.log('\n═══ 1. SOZLAMALAR ═════════════════════════════════════');
        let r = await api('GET', `/clinics/${clinicId}/telegram-bot`);
        ok('karta ma\'lumoti', r.status === 200 && Array.isArray(r.data?.doctors), `${r.status}`);
        ok('dastlab: hisobot yoqiq 22:00, shifokorga xabar yoqiq', r.data?.ownerReportEnabled === true && r.data?.ownerReportTime === '22:00' && r.data?.doctorNotify === true, JSON.stringify(r.data).slice(0, 200));
        r = await api('PUT', `/clinics/${clinicId}/telegram-bot`, { ownerReportTime: '25:61' });
        ok("noto'g'ri vaqt — 400", r.status === 400, `${r.status}`);
        r = await api('PUT', `/clinics/${clinicId}/telegram-bot`, { ownerReportTime: '21:30', ownerReportEnabled: false });
        ok('saqlandi', r.status === 200 && r.data?.ownerReportTime === '21:30' && r.data?.ownerReportEnabled === false, JSON.stringify(r.data));
        r = await call('GET', `/clinics/${clinicId}/telegram-bot`);
        ok('kirmagan — 401/403', r.status === 401 || r.status === 403, `${r.status}`);

        console.log('\n═══ 2. NAMUNA = HISOBOT ═══════════════════════════════');
        const sum = (await api('GET', `/reports/summary?from=${tDay()}&to=${tDay()}`)).data;
        r = await api('GET', `/clinics/${clinicId}/telegram-bot/preview?p=d&s=sum`);
        const html = String(r.data?.html || '');
        const money = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        ok('namuna keldi (HTML)', r.status === 200 && html.includes('Hisobot'), `${r.status} ${html.slice(0, 80)}`);
        ok('«Xizmatlar» — Hisobot bilan bir xil', sum?.totals?.revenue === 0
            ? (html.includes('qabul ham') || html.includes(`Xizmatlar: <b>0</b>`))
            : html.includes(`Xizmatlar: <b>${money(sum.totals.revenue)}</b>`), `${sum?.totals?.revenue} | ${html.slice(0, 300)}`);
        /* Qaytarish tranzaksiyasi «Kassaga tushdi» ga qo'shilmaydi (kod sharhi) */
        const tillOf = (h: string) => Number((/Kassaga tushdi: <b>([\d ]+)<\/b>/.exec(h)?.[1] || '0').replace(/\s/g, ''));
        const till0 = tillOf(String((await api('GET', `/clinics/${clinicId}/telegram-bot/preview?p=d&s=cash`)).data?.html || ''));
        db.prepare("INSERT INTO \"Transaction\" (id, patientName, date, amount, type, service, status, clinicId) VALUES (?, 'Qaytarish sinov', ?, 777000, 'Refund', 'Qaytarish', 'Paid', ?)")
            .run(`refund-${tag}`, tDay(), clinicId);
        try {
            const till1 = tillOf(String((await api('GET', `/clinics/${clinicId}/telegram-bot/preview?p=d&s=cash`)).data?.html || ''));
            ok('qaytarish «Kassaga tushdi» ni oshirmaydi', till1 === till0, `${till0} → ${till1}`);
        } finally {
            db.prepare('DELETE FROM "Transaction" WHERE id = ?').run(`refund-${tag}`);
        }
        for (const s of ['doc', 'cash', 'debt', 'ns']) {
            r = await api('GET', `/clinics/${clinicId}/telegram-bot/preview?p=m&s=${s}`);
            ok(`bo'lim «${s}» (oy) ishlaydi`, r.status === 200 && String(r.data?.html || '').length > 20, `${r.status}`);
        }

        console.log('\n═══ 3. SHIFOKORGA QABUL XABARI ════════════════════════');
        db.prepare("UPDATE Clinic SET botToken = 'TESTTOKEN-OWNERBOT', doctorNotify = 1 WHERE id = ?").run(clinicId);
        docA = (await api('POST', '/doctors', { firstName: 'Xabar', lastName: `A${tag}`, specialty: 'Terapevt', phone: `+99890${tag}1`, status: 'Active' })).data;
        docB = (await api('POST', '/doctors', { firstName: 'Xabar', lastName: `B${tag}`, specialty: 'Terapevt', phone: `+99890${tag}2`, status: 'Active' })).data;
        ok('ikki shifokor', !!docA?.id && !!docB?.id, JSON.stringify(docA).slice(0, 120));
        db.prepare('UPDATE Doctor SET telegramChatId = ? WHERE id = ?').run(chatA, docA.id);
        db.prepare('UPDATE Doctor SET telegramChatId = ? WHERE id = ?').run(chatB, docB.id);
        const p = (await api('POST', '/patients', { firstName: 'Bot', lastName: `Bemor${tag}`, gender: 'Male', dob: '1980-01-01', phone: `+99891${tag}3`, force: true })).data;
        const base = { patientId: p.id, patientName: `Bemor${tag} Bot`, type: 'Konsultatsiya', duration: 30, status: 'Confirmed' };

        r = await api('POST', '/appointments', { ...base, doctorId: docA.id, doctorName: `Xabar A${tag}`, date: tDay(1), time: '10:00' });
        const appt = r.data;
        ok('qabul yozildi', r.status === 200 && !!appt?.id, `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
        let a = await waitLogs(chatA, 1);
        ok('A shifokorga «Yangi qabul»', a.length === 1 && a[0].includes('Yangi qabul') && a[0].includes(`Bemor${tag}`), JSON.stringify(a));

        await api('PUT', `/appointments/${appt.id}`, { time: '11:30' });
        a = await waitLogs(chatA, 2);
        ok("ko'chirildi — eski vaqt chizilgan", a.length === 2 && a[1].includes("ko'chirildi") && a[1].includes('<s>') && a[1].includes('11:30'), JSON.stringify(a[1]));

        await api('PUT', `/appointments/${appt.id}`, { doctorId: docB.id, doctorName: `Xabar B${tag}` });
        a = await waitLogs(chatA, 3);
        const b = await waitLogs(chatB, 1);
        ok("o'tkazildi — B ga «Sizga qabul o'tkazildi»", b.length === 1 && b[0].includes("o'tkazildi"), JSON.stringify(b));
        ok("o'tkazildi — A ga «boshqa shifokorga»", a.length === 3 && a[2].includes('boshqa shifokorga'), JSON.stringify(a[2]));

        await api('PUT', `/appointments/${appt.id}`, { status: 'Cancelled' });
        const b2 = await waitLogs(chatB, 2);
        ok('bekor — B ga xabar', b2.length === 2 && b2[1].includes('bekor'), JSON.stringify(b2[1]));

        await api('PUT', `/appointments/${appt.id}`, { status: 'Confirmed' });
        const b3 = await waitLogs(chatB, 3);
        ok('qayta tiklandi — yangi qabul', b3.length === 3 && b3[2].includes('Yangi qabul'), JSON.stringify(b3[2]));

        await api('DELETE', `/appointments/${appt.id}`);
        const b4 = await waitLogs(chatB, 4);
        ok("o'chirildi — bekor xabari", b4.length === 4 && b4[3].includes('bekor'), JSON.stringify(b4[3]));

        console.log("\n═══ 4. XABAR YO'Q HOLATLAR ════════════════════════════");
        const before = logsTo(chatA).length;
        await api('POST', '/appointments', { ...base, doctorId: docA.id, doctorName: `Xabar A${tag}`, date: tDay(-3), time: '09:00' });
        await sleep(400);
        ok("o'tgan kunga yozilgan qabul — xabar yo'q", logsTo(chatA).length === before);
        db.prepare('UPDATE Clinic SET doctorNotify = 0 WHERE id = ?').run(clinicId);
        await api('POST', '/appointments', { ...base, doctorId: docA.id, doctorName: `Xabar A${tag}`, date: tDay(2), time: '09:00' });
        await sleep(400);
        ok("sozlama o'chiq — xabar yo'q", logsTo(chatA).length === before);

        console.log("\n═══ 5. REGISTRATOR (0051) ═════════════════════════════");
        const recUser = `obrec${tag}`;
        await api('POST', '/receptionists', { firstName: 'Bot', lastName: `Reg${tag}`, phone: `+99894${tag}5`, username: recUser, password: 'testpass123' });
        const rec = db.prepare('SELECT id FROM Receptionist WHERE username = ?').get(recUser);
        const chatR = `93${tag}`;
        db.prepare('UPDATE Receptionist SET telegramChatId = ? WHERE id = ?').run(chatR, rec?.id);
        r = await api('GET', `/clinics/${clinicId}/telegram-bot`);
        const recRow = (r.data?.receptionists || []).find((x: any) => x.id === rec?.id);
        ok('kartada registrator «ulangan»', recRow?.linked === true, JSON.stringify(r.data?.receptionists).slice(0, 160));

        const origBooking = db.prepare('SELECT onlineBookingEnabled, bookingAutoConfirm FROM Clinic WHERE id = ?').get(clinicId);
        db.prepare('UPDATE Clinic SET onlineBookingEnabled = 1, bookingAutoConfirm = 0 WHERE id = ?').run(clinicId);
        db.prepare('UPDATE Doctor SET startHour = 9, endHour = 17 WHERE id = ?').run(docA.id);
        try {
            const resp = await call('POST', '/public/booking', { c: clinicId, doctorId: docA.id, date: tDay(3), time: '15:00', name: `Sayt Bemor${tag}`, phone: `+99897${tag}4`.slice(0, 13) });
            ok("saytdan so'rov yuborildi", resp.status === 200 && resp.data?.confirmed === false, `${resp.status} ${JSON.stringify(resp.data)}`);
            const recLogs = await waitLogs(chatR, 1);
            ok("registratorga «Saytdan yangi so'rov»", recLogs.some(m => m.includes("Saytdan yangi so'rov") && m.includes(`Bemor${tag}`)), JSON.stringify(recLogs));
        } finally {
            db.prepare('UPDATE Clinic SET onlineBookingEnabled = ?, bookingAutoConfirm = ? WHERE id = ?').run(origBooking.onlineBookingEnabled, origBooking.bookingAutoConfirm, clinicId);
            db.prepare('UPDATE Receptionist SET telegramChatId = NULL WHERE id = ?').run(rec?.id);
        }
    } finally {
        db.prepare('UPDATE Clinic SET botToken = ?, doctorNotify = ?, ownerReportEnabled = ?, ownerReportTime = ? WHERE id = ?')
            .run(orig.botToken, orig.doctorNotify, orig.ownerReportEnabled, orig.ownerReportTime, clinicId);
        for (const d of [docA, docB]) if (d?.id) db.prepare('UPDATE Doctor SET telegramChatId = NULL WHERE id = ?').run(d.id);
        db.close();
    }
    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
