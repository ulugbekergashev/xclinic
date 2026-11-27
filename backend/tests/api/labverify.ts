/* PROBIRKA YORLIG'I VA NATIJANI TASDIQLASH (2026-11-26, migratsiya 0045).

   ASOSIY SAVOLLAR:
     1. Yorliq: kod faqat raqam (YYMMDD + 4 xona), qayta bosilsa o'zgarmaydi,
        «Olindi» o'sha kodni saqlaydi, keyingi buyurtma +1; namuna turlari.
     2. Sozlama: dastlab o'chiq; noma'lum o'lcham — 400; faqat ega.
     3. Tasdiq O'CHIQ — hech narsa o'zgarmaydi: natija qo'lda yuboriladi.
     4. Tasdiq YOQIQ:
          · chala natija — 409 NOT_COMPLETE;
          · tasdiqlanmagan natija Telegramga ketmaydi (qo'lda — 409 NOT_VERIFIED,
            o'zi — jim kutadi);
          · laborant o'zi kiritganini tasdiqlay olmaydi (409 SELF_VERIFY);
          · ruxsat berilmagan xodim — 403;
          · ega tasdiqlaydi → o'zi yuborish shu zahoti ketadi;
          · tasdiqlangan natija tuzatilsa — tasdiq bekor.

   Haqiqiy Telegram chaqirilmaydi: soxta server TELEGRAM_API_BASE portida.
   Bot tokeni, chat id, sozlamalar va ruxsatlar oxirida qaytariladi.

   Ishga tushirish: cd backend && T_ONLY=labverify npm run test:api
*/
import http from 'http';

const BASE = process.env.T_BASE || 'http://localhost:3079';
const MOCK_PORT = 3089;

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

/** Toshkent kuni — server `dayPrefix` bilan bir xil */
const dayPrefix = () => {
    const d = new Date(Date.now() + 5 * 3600e3);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(d.getUTCFullYear() % 100)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
};

let hits = 0;
function startMock(): Promise<http.Server> {
    const srv = http.createServer((req, res) => {
        req.on('data', () => { /* tana kerak emas */ });
        req.on('end', () => {
            hits++;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, result: { message_id: hits } }));
        });
    });
    return new Promise((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(MOCK_PORT, '127.0.0.1', () => resolve(srv));
    });
}

async function main() {
    const dbPath = process.env.T_DB;
    if (!dbPath) { console.log("  ⏭  T_DB berilmagan — to'plam o'tkazib yuborildi"); return finish(); }
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);

    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const api = (m: string, p: string, b?: any, tk = token) => call(m, p, b, tk);
    const clinicId = login.data?.user?.clinicId || (await api('GET', '/clinics')).data?.[0]?.id;
    const tag = String(Date.now()).slice(-6);

    const orig = db.prepare('SELECT botToken, labResultAutoSend, labVerifyRequired, labLabelSize, labLabelAuto, accessControl FROM Clinic WHERE id = ?').get(clinicId);
    let mock: http.Server | null = null;
    try {
        mock = await startMock();

        /* Laborant — o'z login bilan */
        const techUser = `labv${tag}`;
        const tech = await api('POST', '/lab-technicians', {
            firstName: 'Tasdiq', lastName: `Laborant${tag}`, phone: `+99890${tag}9`, username: techUser, password: 'testpass123',
        });
        ok('laborant yaratildi', tech.status === 200, `${tech.status} ${JSON.stringify(tech.data).slice(0, 120)}`);
        const techLogin = await call('POST', '/auth/login', { username: techUser, password: 'testpass123' });
        const techToken = techLogin.data?.token;
        const techName = `Tasdiq Laborant${tag}`;
        ok('laborant kirdi', !!techToken, JSON.stringify(techLogin.data).slice(0, 120));

        const p = (await api('POST', '/patients', { firstName: 'Probirka', lastName: `Kod${tag}`, gender: 'Male', dob: '1985-03-04', phone: `+99894${tag}1`, force: true })).data;
        const blood = (await api('POST', '/lab-tests', {
            name: `Qon sinov ${tag}`, code: `QS${tag}`, sampleType: 'Qon', price: 0,
            parameters: [{ name: 'Gemoglobin', unit: 'g/L', refLow: 120, refHigh: 160 }],
        })).data;
        const urine = (await api('POST', '/lab-tests', {
            name: `Siydik sinov ${tag}`, code: `SS${tag}`, sampleType: 'Siydik', price: 0,
            parameters: [{ name: 'Oqsil', unit: 'g/L', refHigh: 0.14 }],
        })).data;
        const order = (await api('POST', '/lab-orders', { patientId: p?.id, patientName: `Kod${tag} Probirka`, doctorName: 'Dr. Sinov', testIds: [blood?.id, urine?.id] })).data;
        ok('bemor, ikki namuna turi va yo\'llanma', !!order?.id, JSON.stringify(order).slice(0, 120));
        if (!order?.id) return;

        console.log("\n═══ 1. YORLIQ ═══════════════════════════════════════════");
        let r = await api('POST', `/lab-orders/${order.id}/label`);
        const code = r.data?.code;
        ok('kod: 10 xonali raqam, bugungi sana bilan', r.status === 200 && /^\d{10}$/.test(code || '') && code.startsWith(dayPrefix()), `${r.status} ${code}`);
        ok('har namuna turiga bitta yorliq (Qon, Siydik)', r.data?.groups?.length === 2
            && r.data.groups.some((g: any) => g.sample === 'Qon') && r.data.groups.some((g: any) => g.sample === 'Siydik'), JSON.stringify(r.data?.groups));
        ok('bemor ismi va tug\'ilgan sanasi bor', String(r.data?.patientName || '').includes(`Kod${tag}`) && !!r.data?.dob, JSON.stringify(r.data).slice(0, 160));
        ok('o\'lcham sozlanmagan — 40x30', r.data?.size === '40x30', r.data?.size);
        r = await api('POST', `/lab-orders/${order.id}/label`);
        ok('qayta bosilsa kod o\'zgarmaydi', r.data?.code === code, r.data?.code);
        r = await api('POST', `/lab-orders/${order.id}/collect`);
        ok('«Olindi» o\'sha kodni saqlaydi', r.status === 200 && r.data?.order?.sampleCode === code, `${r.status} ${r.data?.order?.sampleCode}`);
        const order2 = (await api('POST', '/lab-orders', { patientId: p?.id, patientName: `Kod${tag} Probirka`, doctorName: 'Dr. Sinov', testIds: [blood?.id] })).data;
        r = await api('POST', `/lab-orders/${order2.id}/collect`);
        const code2 = r.data?.order?.sampleCode;
        ok('keyingi buyurtma — boshqa, kattaroq kod', /^\d{10}$/.test(code2 || '') && code2 > code, `${code} → ${code2}`);
        r = await api('POST', `/lab-orders/nonexistent-${tag}/label`);
        ok('yo\'q buyurtma — 404', r.status === 404, `${r.status}`);

        console.log("\n═══ 2. SOZLAMA ══════════════════════════════════════════");
        const c0 = (await api('GET', `/clinics/${clinicId}`)).data;
        ok('dastlab o\'chiq', c0?.labVerifyRequired === false || orig.labVerifyRequired === 1, String(c0?.labVerifyRequired));
        r = await api('PUT', `/clinics/${clinicId}/lab-settings`, { labLabelSize: 'A4' });
        ok('noma\'lum o\'lcham — 400', r.status === 400, `${r.status}`);
        r = await api('PUT', `/clinics/${clinicId}/lab-settings`, { labLabelSize: '58x40' }, techToken);
        ok('laborant sozlamani o\'zgartira olmaydi — 403', r.status === 403, `${r.status}`);
        r = await api('PUT', `/clinics/${clinicId}/lab-settings`, { labLabelSize: '58x40', labLabelAuto: true });
        ok('ega o\'lchamni saqladi', r.status === 200 && r.data?.labLabelSize === '58x40' && r.data?.labLabelAuto === true, JSON.stringify(r.data));
        r = await api('POST', `/lab-orders/${order.id}/label`);
        ok('yorliq yangi o\'lchamni oladi', r.data?.size === '58x40', r.data?.size);

        /* Natija kiritish — laborant nomidan */
        const view = (await api('GET', `/lab-orders/${order.id}/results`)).data;
        const rows = (vals: Record<string, string>) => (view?.items || []).flatMap((it: any) =>
            it.parameters.map((pr: any) => ({ orderItemId: it.id, parameterId: pr.parameterId, value: vals[pr.name] ?? '' })))
            .filter((x: any) => x.value !== '');   // ekran ham bo'sh qiymatni yubormaydi
        const enter = (vals: Record<string, string>, tk = techToken) =>
            api('POST', `/lab-orders/${order.id}/results`, { force: true, results: rows(vals) }, tk);

        console.log("\n═══ 3. TASDIQ O'CHIQ — AVVALGIDEK ═══════════════════════");
        db.prepare('UPDATE Clinic SET botToken = ?, labResultAutoSend = 0, labVerifyRequired = 0 WHERE id = ?').run('TESTTOKEN', clinicId);
        db.prepare('UPDATE Patient SET telegramChatId = ? WHERE id = ?').run(`66${tag}`, p.id);
        r = await enter({ Gemoglobin: '130' });
        ok('chala natija saqlandi', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`);
        r = await api('POST', `/lab-orders/${order.id}/verify`);
        ok('sozlama o\'chiq — tasdiqlash 409 VERIFY_OFF', r.status === 409 && r.data?.code === 'VERIFY_OFF', `${r.status} ${JSON.stringify(r.data)}`);
        const v0 = (await api('GET', `/lab-orders/${order.id}/results`)).data;
        ok('ko\'rinishda verifyRequired=false', v0?.verifyRequired === false, String(v0?.verifyRequired));
        const enteredRow = db.prepare('SELECT enteredBy FROM LabResult r JOIN LabOrderItem i ON i.id = r.orderItemId WHERE i.orderId = ? LIMIT 1').get(order.id);
        ok('kim kiritgani — laborantning serverdagi nomi', enteredRow?.enteredBy === techName, `${enteredRow?.enteredBy} / ${techName}`);

        console.log("\n═══ 4. TASDIQ YOQIQ ═════════════════════════════════════");
        r = await api('PUT', `/clinics/${clinicId}/lab-settings`, { labVerifyRequired: true });
        ok('ega tasdiqlashni yoqdi', r.status === 200 && r.data?.labVerifyRequired === true, JSON.stringify(r.data));
        db.prepare('UPDATE Clinic SET labResultAutoSend = 1 WHERE id = ?').run(clinicId);

        r = await api('POST', `/lab-orders/${order.id}/verify`);
        ok('chala natija — 409 NOT_COMPLETE', r.status === 409 && r.data?.code === 'NOT_COMPLETE', `${r.status} ${JSON.stringify(r.data)}`);

        const before = hits;
        r = await enter({ Gemoglobin: '130', Oqsil: '0.1' });
        ok('to\'liq natija saqlandi', r.status === 200, `${r.status}`);
        await sleep(700);
        ok('tasdiqlanmagan — o\'zi yuborilmadi', hits === before, `${before} → ${hits}`);
        r = await api('POST', `/lab-orders/${order.id}/send-telegram`);
        ok('qo\'lda ham — 409 NOT_VERIFIED', r.status === 409 && r.data?.code === 'NOT_VERIFIED', `${r.status} ${JSON.stringify(r.data)}`);
        const v1 = (await api('GET', `/lab-orders/${order.id}/results`)).data;
        ok('ko\'rinish: verifyRequired, hali tasdiqlanmagan', v1?.verifyRequired === true && !v1?.verifiedAt && v1?.status === 'Completed', JSON.stringify({ vr: v1?.verifyRequired, va: v1?.verifiedAt, st: v1?.status }));

        r = await api('POST', `/lab-orders/${order.id}/verify`, undefined, techToken);
        ok('ruxsat berilmagan laborant — 403', r.status === 403, `${r.status} ${JSON.stringify(r.data)}`);
        const grant = await api('PUT', `/clinics/${clinicId}/access-control`, {
            accessControl: { labTechnician: { perms: { lab: { on: true, cells: { orders: 've' }, sp: { results: true, verify: true } } } } },
        });
        ok('egasi laborantga «tasdiqlash» ni berdi', grant.status === 200, `${grant.status} ${JSON.stringify(grant.data).slice(0, 160)}`);
        r = await api('POST', `/lab-orders/${order.id}/verify`, undefined, techToken);
        ok('o\'zi kiritganini tasdiqlay olmaydi — 409 SELF_VERIFY', r.status === 409 && r.data?.code === 'SELF_VERIFY', `${r.status} ${JSON.stringify(r.data)}`);

        r = await api('POST', `/lab-orders/${order.id}/verify`);
        ok('ega tasdiqladi', r.status === 200 && !!r.data?.verifiedAt, `${r.status} ${JSON.stringify(r.data)}`);
        await sleep(900);
        ok('tasdiqdan keyin natija o\'zi ketdi', hits === before + 1, `${before} → ${hits}`);
        const log = db.prepare("SELECT source FROM TelegramLog WHERE refId = ? AND status = 'Sent'").get(`lab:${order.id}`);
        ok('jurnalda — avtomatik yuborish', log?.source === 'lab_auto', JSON.stringify(log));
        const acc = db.prepare("SELECT * FROM AccessLog WHERE entityId = ? AND entityType = 'LabResultVerify'").get(order.id);
        ok('kim tasdiqlagani AccessLog da', !!acc);
        r = await api('POST', `/lab-orders/${order.id}/verify`);
        ok('qayta tasdiqlash — xato emas, o\'sha vaqt', r.status === 200 && !!r.data?.verifiedAt, `${r.status}`);

        r = await enter({ Gemoglobin: '131', Oqsil: '0.1' }, token);
        const after = db.prepare('SELECT verifiedAt, verifiedByName FROM LabOrder WHERE id = ?').get(order.id);
        ok('tuzatildi — tasdiq bekor', r.status === 200 && after?.verifiedAt === null && after?.verifiedByName === null, JSON.stringify(after));
        r = await enter({ Gemoglobin: '131', Oqsil: '0.1' }, token);
        await api('POST', `/lab-orders/${order.id}/verify`);
        r = await enter({ Gemoglobin: '131', Oqsil: '0.1' }, token);
        const same = db.prepare('SELECT verifiedAt FROM LabOrder WHERE id = ?').get(order.id);
        ok('o\'zgarmagan qiymatni qayta saqlash tasdiqni buzmaydi', !!same?.verifiedAt, JSON.stringify(same));

        const idRow = db.prepare('SELECT enteredById FROM LabResult r JOIN LabOrderItem i ON i.id = r.orderItemId WHERE i.orderId = ? LIMIT 1').get(order.id);
        ok('kim kiritgani id bilan yozildi («ROL:id»)', /^(LAB_TECHNICIAN|CLINIC_ADMIN):/.test(idRow?.enteredById || ''), idRow?.enteredById);
        r = await api('PUT', `/lab-orders/${order.id}`, { status: 'InProgress' });
        const reopened = db.prepare('SELECT verifiedAt FROM LabOrder WHERE id = ?').get(order.id);
        ok('qayta ochilgan buyurtmada tasdiq bekor', r.status === 200 && reopened?.verifiedAt === null, `${r.status} ${JSON.stringify(reopened)}`);

        r = await call('POST', `/lab-orders/${order.id}/verify`);
        ok('kirmagan foydalanuvchi — 401/403', r.status === 401 || r.status === 403, `${r.status}`);
    } finally {
        db.prepare('UPDATE Clinic SET botToken = ?, labResultAutoSend = ?, labVerifyRequired = ?, labLabelSize = ?, labLabelAuto = ?, accessControl = ? WHERE id = ?')
            .run(orig.botToken, orig.labResultAutoSend, orig.labVerifyRequired, orig.labLabelSize, orig.labLabelAuto, orig.accessControl, clinicId);
        if (mock) await new Promise(res => mock!.close(() => res(null)));
        db.close();
    }
    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
