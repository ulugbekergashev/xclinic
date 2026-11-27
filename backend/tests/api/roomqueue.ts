/* DIAGNOSTIKA VA LABORATORIYA NAVBATI (2026-11-27, migratsiya 0049).

   ASOSIY SAVOLLAR:
     1. Talon: tekshiruv va tahlil ro'yxatida bemorning qabul taloni (KOD-NN)
        keladi — yangi raqam yo'q, tablodagi bilan bir xil.
     2. Chaqirish ixtiyoriy: bosilsa tabloga «xona» bilan chiqadi, qabul
        (Visit) holatiga tegilmaydi — bemor shifokor navbatiga qaytmaydi.
     3. Boshlash: faqat «Yo'llandi» dan, ikkinchi bosish — 409; tablo holati
        «In Progress».
     4. Yopilgan tekshiruv va proba olingan buyurtma tablodan ketadi va
        chaqirib bo'lmaydi (409).
     5. Talonsiz yo'llanma chaqiriladi, lekin tabloga chiqmaydi.
     6. Kirmagan foydalanuvchi — 401/403.

   Ishga tushirish: cd backend && T_ONLY=roomqueue npm run test:api
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
    const board = async () => (await call('GET', `/queue-board/${clinicId}`)).data || [];

    let depId: string | null = null;
    try {
        console.log('\n═══ 1. TALON ═══════════════════════════════════════════');
        const code = `Q${tag.slice(-4)}`;
        const dep = await api('POST', '/departments', { name: `Navbat sinov ${code}`, code, type: 'CLINICAL' });
        depId = dep.data?.id || null;
        ok("bo'lim yaratildi", !!depId, `${dep.status}`);
        const p = (await api('POST', '/patients', { firstName: 'Navbat', lastName: `Sinov${tag}`, gender: 'Female', dob: '1990-01-02', phone: `+99893${tag}2`, force: true })).data;
        const visit = (await api('POST', '/visits', { patientId: p?.id, departmentId: depId, force: true })).data;
        ok('qabul ochildi va raqam oldi', !!visit?.id && visit.queueNumber != null, JSON.stringify(visit).slice(0, 160));
        const ticket = `${code}-${String(visit?.queueNumber ?? 0).padStart(2, '0')}`;

        const study = (await api('POST', '/studies', {
            patientId: p?.id, patientName: `Sinov${tag} Navbat`, visitId: visit?.id,
            modality: 'UZI', name: 'Qorin UZI', price: 0,
        })).data;
        ok('UZI yo\'llanmasi yozildi', !!study?.id, JSON.stringify(study).slice(0, 160));
        const listed = ((await api('GET', '/studies')).data || []).find((s: any) => s.id === study?.id);
        ok("tekshiruv ro'yxatida qabul taloni", listed?.ticket === ticket, `${listed?.ticket} ≠ ${ticket}`);
        ok('chaqirilmagan — tabloda xona qatori yo\'q', !(await board()).some((e: any) => e.room && e.ticket === ticket));

        console.log('\n═══ 2. CHAQIRISH ══════════════════════════════════════');
        const visitBefore = db.prepare('SELECT status FROM Visit WHERE id = ?').get(visit.id)?.status;
        let r = await api('POST', `/studies/${study.id}/call`);
        ok('chaqirildi', r.status === 200 && !!r.data?.calledAt, `${r.status} ${JSON.stringify(r.data)}`);
        let row = (await board()).find((e: any) => e.room === 'UZI' && e.ticket === ticket);
        ok('tabloda: o\'sha talon, «UZI» xonasi, Called', row?.status === 'Called' && !!row?.calledAt, JSON.stringify(row));
        ok('tabloda bemor ismi yo\'q', !JSON.stringify(row || {}).includes(`Sinov${tag}`));
        const visitAfter = db.prepare('SELECT status FROM Visit WHERE id = ?').get(visit.id)?.status;
        ok("qabul holati o'zgarmadi (shifokor navbatiga qaytmadi)", visitAfter === visitBefore && visitAfter !== 'Called', `${visitBefore} → ${visitAfter}`);
        const first = row?.calledAt;
        await new Promise(res => setTimeout(res, 20));
        r = await api('POST', `/studies/${study.id}/call`);
        row = (await board()).find((e: any) => e.room === 'UZI' && e.ticket === ticket);
        ok('qayta chaqirish — yangi vaqt (tablo qayta e\'lon qiladi)', r.status === 200 && row?.calledAt !== first, `${first} → ${row?.calledAt}`);

        console.log('\n═══ 3. BOSHLASH ═══════════════════════════════════════');
        r = await api('POST', `/studies/${study.id}/start`);
        ok('boshlandi — Bajarilmoqda', r.status === 200 && r.data?.status === 'InProgress', `${r.status}`);
        r = await api('POST', `/studies/${study.id}/start`);
        ok('ikkinchi «Boshlash» — 409', r.status === 409, `${r.status}`);
        row = (await board()).find((e: any) => e.room === 'UZI' && e.ticket === ticket);
        ok('tabloda holat In Progress', row?.status === 'In Progress', JSON.stringify(row));

        console.log('\n═══ 4. YOPILGANI TABLODAN KETADI ══════════════════════');
        db.prepare("UPDATE DiagnosticStudy SET status = 'Completed' WHERE id = ?").run(study.id);
        ok('yopilgan tekshiruv tablodan ketdi', !(await board()).some((e: any) => e.room === 'UZI' && e.ticket === ticket));
        r = await api('POST', `/studies/${study.id}/call`);
        ok('yopilganini chaqirib bo\'lmaydi — 409', r.status === 409, `${r.status}`);

        console.log('\n═══ 5. LABORATORIYA ═══════════════════════════════════');
        const test = (await api('POST', '/lab-tests', { name: `Navbat qon ${tag}`, code: `NQ${tag}`, sampleType: 'Qon', price: 0 })).data;
        const order = (await api('POST', '/lab-orders', { patientId: p?.id, patientName: `Sinov${tag} Navbat`, visitId: visit?.id, doctorName: 'Dr. Sinov', testIds: [test?.id] })).data;
        ok('tahlil yo\'llanmasi', !!order?.id, JSON.stringify(order).slice(0, 160));
        const lo = ((await api('GET', `/lab-orders?clinicId=${clinicId}`)).data || []).find((o: any) => o.id === order?.id);
        ok("tahlil ro'yxatida o'sha talon", lo?.ticket === ticket, `${lo?.ticket}`);
        r = await api('POST', `/lab-orders/${order.id}/call`);
        ok('qon olishga chaqirildi', r.status === 200 && !!r.data?.calledAt, `${r.status}`);
        row = (await board()).find((e: any) => e.room === 'Laboratoriya' && e.ticket === ticket);
        ok('tabloda «Laboratoriya» xonasi', row?.status === 'Called', JSON.stringify(row));
        r = await api('POST', `/lab-orders/${order.id}/collect`);
        ok('proba olindi', r.status === 200, `${r.status}`);
        ok('proba olingach tablodan ketdi', !(await board()).some((e: any) => e.room === 'Laboratoriya' && e.ticket === ticket));
        r = await api('POST', `/lab-orders/${order.id}/call`);
        ok('olinganidan keyin chaqirib bo\'lmaydi — 409', r.status === 409, `${r.status}`);

        console.log('\n═══ 6. TALONSIZ VA RUXSAT ═════════════════════════════');
        const loose = (await api('POST', '/studies', { patientId: p?.id, patientName: `Sinov${tag} Navbat`, modality: 'EKG', name: 'EKG', price: 0 })).data;
        r = await api('POST', `/studies/${loose?.id}/call`);
        ok('talonsiz tekshiruv ham chaqiriladi', r.status === 200, `${r.status}`);
        const b = await board();
        ok('lekin tabloga chiqmaydi (raqamsiz e\'lon yo\'q)', !b.some((e: any) => e.room === 'EKG' && !e.ticket), JSON.stringify(b.filter((e: any) => e.room === 'EKG')));
        r = await call('POST', `/studies/${loose?.id}/call`);
        ok('kirmagan foydalanuvchi — 401/403', r.status === 401 || r.status === 403, `${r.status}`);
        r = await call('POST', `/lab-orders/${order.id}/call`);
        ok('kirmagan foydalanuvchi (lab) — 401/403', r.status === 401 || r.status === 403, `${r.status}`);
        r = await api('POST', '/studies/yoq-id/call');
        ok("boshqa/yo'q tekshiruv — 409", r.status === 409, `${r.status}`);

        console.log('\n═══ 7. KECHAGI QABUL TALONI E\'LON QILINMAYDI ═════════');
        const old = (await api('POST', '/studies', { patientId: p?.id, patientName: `Sinov${tag} Navbat`, visitId: visit?.id, modality: 'KT', name: 'KT', price: 0 })).data;
        await api('POST', `/studies/${old?.id}/call`);
        ok("bugungi qabul — tabloda KT bor", (await board()).some((e: any) => e.room === 'KT' && e.ticket === ticket));
        const realDate = db.prepare('SELECT date FROM Visit WHERE id = ?').get(visit.id)?.date;
        db.prepare("UPDATE Visit SET date = '2000-01-01' WHERE id = ?").run(visit.id);
        try {
            ok('qabul kechagi bo\'lsa — tablodan ketdi (eski T-05 boshqa bemorniki bo\'lishi mumkin)',
                !(await board()).some((e: any) => e.room === 'KT' && e.ticket === ticket));
            const oldRow = ((await api('GET', '/studies')).data || []).find((s: any) => s.id === old?.id);
            ok("ro'yxatda ham talon yo'q", oldRow && oldRow.ticket === null, JSON.stringify(oldRow?.ticket));
        } finally {
            db.prepare('UPDATE Visit SET date = ? WHERE id = ?').run(realDate, visit.id);
        }
    } finally {
        if (depId) await api('DELETE', `/departments/${depId}`).catch(() => null);
        db.close();
    }
    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
