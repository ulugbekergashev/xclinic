/* QAYTA KO'RIK sinovi (2026-11-26).

   ASOSIY SAVOLLAR:
     1. Shifokor qabulga qayta ko'rik sanasini qo'ya oladimi; qabul kuni yoki
        undan oldingi sana, noto'g'ri sana rad etiladimi; yopilgan qabulga ham
        qo'yiladimi; `null` olib tashlaydimi?
     2. Registratura ro'yxati (`/follow-ups`): belgilangan bemor chiqadimi,
        kalendarga yozilsa «yozilgan» bo'ladimi, qaytib kelgan bemor
        ro'yxatdan chiqadimi?
     3. Xabarlar avtomatikasida «Qayta ko'rik» triggeri bormi va qoida
        yaratiladimi?

   Ishga tushirish: cd backend && npm run test:api
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

const day = (offset = 0) => new Date(Date.now() + 5 * 3600e3 + offset * 864e5).toISOString().slice(0, 10);

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const api = (m: string, p: string, b?: any) => call(m, p, b, token);
    const tag = String(Date.now()).slice(-6);
    const today = day(0);

    console.log('\n═══ 1. SANANI QO\'YISH ══════════════════════════════');
    const p = (await api('POST', '/patients', { firstName: 'Qayta', lastName: `Korik${tag}`, gender: 'Male', phone: `+99899${tag}1`, force: true })).data;
    const v = (await api('POST', '/visits', { patientId: p.id, status: 'Waiting' })).data;
    ok('bemor va qabul ochildi', !!p?.id && !!v?.id);
    if (!v?.id) return finish();

    const same = await api('POST', `/visits/${v.id}/follow-up`, { date: today });
    ok('qabul kunining o\'zi — 400', same.status === 400, `status ${same.status}`);
    const bad = await api('POST', `/visits/${v.id}/follow-up`, { date: '2026-13-45' });
    ok('noto\'g\'ri sana — 400', bad.status === 400, `status ${bad.status}`);

    await api('PUT', `/visits/${v.id}`, { status: 'Completed', force: true });
    const set = await api('POST', `/visits/${v.id}/follow-up`, { date: day(1) });
    ok('yopilgan qabulga ham qo\'yildi (ertaga)', set.status === 200 && set.data?.followUpDate === day(1), `status ${set.status}: ${JSON.stringify(set.data).slice(0, 100)}`);

    console.log('\n═══ 2. REGISTRATURA RO\'YXATI ═══════════════════════');
    let list = (await api('GET', '/follow-ups')).data;
    let row = (list?.rows || []).find((r: any) => r.visitId === v.id);
    ok('ro\'yxatda chiqdi', !!row);
    ok('hali yozilmagan', row?.booked === null, JSON.stringify(row?.booked));
    ok('telefon bor', !!row?.phone);

    const doctors = (await api('GET', '/doctors')).data || [];
    const doc = doctors[0];
    if (doc) {
        const appt = await api('POST', '/appointments', {
            patientId: p.id, patientName: `Korik${tag} Qayta`, doctorId: doc.id, doctorName: 'Dr',
            type: 'Konsultatsiya', date: day(1), time: '07:15', duration: 15, status: 'Pending',
        });
        ok('kalendarga yozildi', appt.status === 200, `status ${appt.status}`);
        list = (await api('GET', '/follow-ups')).data;
        row = (list?.rows || []).find((r: any) => r.visitId === v.id);
        ok('ro\'yxatda «yozilgan»', !!row?.booked && row.booked.date === day(1), JSON.stringify(row?.booked));
    }

    const p2 = (await api('POST', '/patients', { firstName: 'Qaytgan', lastName: `Bemor${tag}`, gender: 'Female', phone: `+99899${tag}2`, force: true })).data;
    const v2 = (await api('POST', '/visits', { patientId: p2.id, status: 'Waiting' })).data;
    await api('POST', `/visits/${v2.id}/follow-up`, { date: day(2) });
    list = (await api('GET', '/follow-ups')).data;
    ok('ikkinchi bemor ro\'yxatda', (list?.rows || []).some((r: any) => r.visitId === v2.id));
    await api('POST', '/visits', { patientId: p2.id, date: day(2), status: 'Waiting', force: true });
    list = (await api('GET', '/follow-ups')).data;
    ok('qaytib kelgan bemor ro\'yxatdan chiqdi', !(list?.rows || []).some((r: any) => r.visitId === v2.id));

    const clear = await api('POST', `/visits/${v.id}/follow-up`, { date: null });
    ok('olib tashlandi', clear.status === 200 && clear.data?.followUpDate === null);
    list = (await api('GET', '/follow-ups')).data;
    ok('olib tashlangani ro\'yxatda yo\'q', !(list?.rows || []).some((r: any) => r.visitId === v.id));

    console.log('\n═══ 3. XABAR AVTOMATIKASI ═══════════════════════════');
    const triggers = (await api('GET', '/automation-triggers')).data || [];
    const fu = triggers.find((x: any) => x.id === 'follow_up');
    ok('«Qayta ko\'rik» triggeri bor', !!fu);
    ok('kun oldin sozlanadi (0–3)', fu?.offset?.unit === 'day' && (fu?.offset?.options || []).includes(0));
    const tpl = (await api('POST', '/message-templates', { name: `Qayta ko'rik ${tag}`, text: "{firstName}, {date} kuni qayta ko'rikka keling. {clinicName}" })).data;
    if (tpl?.id) {
        const rule = await api('POST', '/automation-rules', { name: `Qayta ko'rik ${tag}`, templateId: tpl.id, trigger: 'follow_up', hoursBefore: 0, channel: 'telegram_first' });
        ok('qoida yaratildi, «0 kun» saqlandi', rule.status === 200 && rule.data?.hoursBefore === 0, `status ${rule.status}: ${JSON.stringify(rule.data).slice(0, 120)}`);
    } else {
        ok('shablon yaratildi', false, JSON.stringify(tpl).slice(0, 120));
    }

    console.log('\n═══ 4. RUXSAT ═════════════════════════════════════');
    const anon = await call('GET', '/follow-ups');
    ok('kirmagan foydalanuvchiga yopiq', anon.status === 401 || anon.status === 403, `status ${anon.status}`);
    const anonSet = await call('POST', `/visits/${v.id}/follow-up`, { date: day(3) });
    ok('kirmagan foydalanuvchi sana qo\'ya olmaydi', anonSet.status === 401 || anonSet.status === 403, `status ${anonSet.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
