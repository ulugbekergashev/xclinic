/* AI AMALLARI — TASDIQ BILAN (2026-11-27).

   AI kaliti sinovda yo'q, shuning uchun model chaqirilmaydi: token sinovning
   o'zida xuddi server kabi imzolanadi (ma'lum JWT kaliti) va
   /api/ai/actions/confirm ga yuboriladi.

   ASOSIY SAVOLLAR:
     1. Tasdiqlangan amal ilova yo'li bilan bajariladi (qabul haqiqatan yoziladi).
     2. Bir martalik: ikkinchi marta — 409.
     3. Boshqa foydalanuvchining tokeni — 409; muddati o'tgani — 409;
        buzilgan imzo — 409.
     4. Ruxsat — o'sha manzilning O'ZI: registrator xarajat amalini tasdiqlasa
        ham, /api/expenses ning qoidasi ishlaydi.
     5. Ovoz: kalit yo'q — 503 tushunarli xabar bilan.

   Ishga tushirish: cd backend && T_ONLY=aiactions npm run test:api
*/
import { signAction, actionOwner } from '../../ai/actions';

/** Token ichidagi foydalanuvchi (server req.user bilan bir xil) */
const jwtUser = (tk: string) => JSON.parse(Buffer.from(String(tk).split('.')[1] || '', 'base64url').toString() || '{}');

const BASE = process.env.T_BASE || 'http://localhost:3079';
const SECRET = process.env.T_JWT || '';

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
const tDay = (n = 0) => new Date(Date.now() + 5 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

async function main() {
    if (!SECRET) { console.log("  ⏭  T_JWT berilmagan — o'tkazib yuborildi"); return finish(); }
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    const me = token ? jwtUser(token) : null;
    ok('ega kirdi', !!token && !!me?.role, JSON.stringify(login.data).slice(0, 120));
    if (!token) return finish();
    const api = (m: string, p: string, b?: any, tk = token) => call(m, p, b, tk);
    const clinicId = me?.clinicId || (await api('GET', '/clinics')).data?.[0]?.id;
    const owner = actionOwner(me);
    const tag = String(Date.now()).slice(-6);

    const doc = (await api('POST', '/doctors', { firstName: 'AI', lastName: `Amal${tag}`, specialty: 'Terapevt', phone: `+99890${tag}8`, status: 'Active' })).data;
    const p = (await api('POST', '/patients', { firstName: 'Amal', lastName: `Bemor${tag}`, gender: 'Female', dob: '1990-02-03', phone: `+99893${tag}7`, force: true })).data;
    ok('shifokor va bemor', !!doc?.id && !!p?.id);

    console.log('\n═══ 1. TASDIQ — ILOVA YO\'LI ═══════════════════════════');
    const book = {
        kind: 'book_appointment', summary: 'sinov',
        request: { method: 'POST' as const, path: '/api/appointments', body: { patientId: p.id, patientName: `Amal Bemor${tag}`, doctorId: doc.id, doctorName: `AI Amal${tag}`, date: tDay(2), time: '12:30', duration: 30, status: 'Confirmed', type: 'Konsultatsiya' } },
    };
    const tk = signAction(book, owner, clinicId, SECRET);
    let r = await api('POST', '/ai/actions/confirm', { token: tk });
    ok('tasdiqlandi — bajarildi', r.status === 200 && r.data?.success === true && !!r.data?.result?.id, `${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
    const appts = (await api('GET', `/appointments?clinicId=${clinicId}&from=${tDay(2)}&to=${tDay(2)}`)).data || [];
    ok('qabul haqiqatan kalendarda', appts.some((a: any) => a.doctorId === doc.id && a.time === '12:30'));

    console.log('\n═══ 2. BIR MARTALIK VA EGALIK ══════════════════════════');
    r = await api('POST', '/ai/actions/confirm', { token: tk });
    ok('ikkinchi marta — 409', r.status === 409, `${r.status} ${r.data?.message}`);
    /* Boshqa bemor, o'sha shifokor va vaqt (o'sha bemor qayta yozilsa ilova borini qaytaradi) */
    const p2 = (await api('POST', '/patients', { firstName: 'Ikkinchi', lastName: `Bemor${tag}`, gender: 'Male', dob: '1991-02-03', phone: `+99895${tag}2`, force: true })).data;
    const clash = signAction({ ...book, request: { ...book.request, body: { ...book.request.body, patientId: p2.id, patientName: `Ikkinchi Bemor${tag}` } } }, owner, clinicId, SECRET);
    r = await api('POST', '/ai/actions/confirm', { token: clash });
    ok("band vaqt — ilovadagi to'qnashuv qoidasi (409)", r.status === 409 && /band/i.test(r.data?.message || ''), `${r.status} ${r.data?.message}`);
    r = await api('POST', '/ai/actions/confirm', { token: signAction(book, 'RECEPTIONIST:boshqa', clinicId, SECRET) });
    ok('boshqa foydalanuvchiniki — 409', r.status === 409, `${r.status}`);
    r = await api('POST', '/ai/actions/confirm', { token: signAction(book, owner, clinicId, SECRET, Date.now() - 11 * 60_000) });
    ok("muddati o'tgan — 409", r.status === 409 && /muddat/i.test(r.data?.message || ''), `${r.status} ${r.data?.message}`);
    const forged = signAction(book, owner, clinicId, 'boshqa-kalit');
    r = await api('POST', '/ai/actions/confirm', { token: forged });
    ok('qalbaki imzo — 409', r.status === 409, `${r.status}`);
    r = await api('POST', '/ai/actions/confirm', { token: signAction({ ...book, request: { method: 'POST', path: '/api/clinics/x/settings', body: {} } }, owner, clinicId, SECRET) });
    ok("ro'yxatda yo'q manzil — 409", r.status === 409, `${r.status}`);

    /* To'lov: tayyorlangandan beri qarz o'zgargan (bu bemorda qarz yo'q) — bajarilmaydi */
    const pay = { kind: 'record_payment', summary: 'sinov', request: { method: 'POST' as const, path: '/api/payments', body: { chargeIds: ['x'], amount: 1000, method: 'Cash' } }, guard: { patientId: p.id, due: 999000 } };
    r = await api('POST', '/ai/actions/confirm', { token: signAction(pay, owner, clinicId, SECRET) });
    ok("qarz o'zgargan to'lov — 409", r.status === 409 && /qarz/i.test(r.data?.message || ''), `${r.status} ${r.data?.message}`);

    console.log('\n═══ 3. RUXSAT — MANZILNING O\'ZI ═══════════════════════');
    const recUser = `aiact${tag}`;
    await api('POST', '/receptionists', { firstName: 'AI', lastName: `Reg${tag}`, phone: `+99894${tag}3`, username: recUser, password: 'testpass123' });
    const rl = await call('POST', '/auth/login', { username: recUser, password: 'testpass123' });
    const recTok = rl.data?.token, rec = recTok ? jwtUser(recTok) : null;
    ok('registrator kirdi', !!recTok);
    const exp = { kind: 'create_expense', summary: 'sinov', request: { method: 'POST' as const, path: '/api/expenses', body: { date: tDay(), amount: 1000, category: 'Other', title: 'AI sinov', method: 'Cash' } } };
    r = await api('POST', '/ai/actions/confirm', { token: signAction(exp, actionOwner(rec), clinicId, SECRET) }, recTok);
    const recCanExpense = (await api('POST', '/expenses', { date: tDay(), amount: 1, category: 'Other', title: 'tekshiruv', method: 'Cash' }, recTok)).status;
    ok('registrator natijasi /api/expenses bilan bir xil', (r.status === 200) === (recCanExpense === 200), `amal ${r.status}, to'g'ridan ${recCanExpense}`);

    console.log('\n═══ 4. OVOZ ═════════════════════════════════════════════');
    const v = await fetch(`${BASE}/api/ai/transcribe?mime=audio/webm&lang=uz`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` }, body: Buffer.alloc(4000),
    });
    const vd: any = await v.json().catch(() => ({}));
    ok("AI kaliti yo'q — 503, tushunarli xabar", v.status === 503 && /kalit/i.test(vd?.message || ''), `${v.status} ${vd?.message}`);
    const v2 = await fetch(`${BASE}/api/ai/transcribe?mime=audio/webm`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(10) });
    ok('kirmagan — 401/403', v2.status === 401 || v2.status === 403, `${v2.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
