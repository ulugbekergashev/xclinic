/* SAYTDAN QABULGA YOZILISH (2026-11-26, migratsiya 0046).

   ASOSIY SAVOLLAR:
     1. Sozlama o'chiq — ochiq marshrutlar 404.
     2. Ochiq ma'lumot: faqat klinika, shifokor ismi/mutaxassisligi, kunlar va
        bo'sh vaqtlar — bemor ismi, telefon, id lar yo'q.
     3. So'rov: yomon telefon / qisqa ism — 400; tuzoq — jim o'tadi; band vaqt —
        409; mavjud va yangi telefon uchun javob bir xil.
     4. So'rov 'Requested' bo'ladi va vaqtni band qiladi.
     5. Tasdiqlash ('Confirmed'), boshqa vaqtga tasdiqlash, ikkinchi marta — 409;
        rad etish — so'rov yaratgan bo'sh karta o'chadi.
     6. Avtomatik tasdiq — darhol 'Confirmed'.
     7. Ruxsat: kirmagan — tasdiqlay olmaydi; sozlama — faqat ega.

   Ishga tushirish: cd backend && T_ONLY=booking npm run test:api
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

const day = (n: number) => new Date(Date.now() + 5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const api = (m: string, p: string, b?: any, tk = token) => call(m, p, b, tk);
    const clinicId = login.data?.user?.clinicId || (await api('GET', '/clinics')).data?.[0]?.id;
    const tag = String(Date.now()).slice(-6);
    const q = `c=${encodeURIComponent(clinicId)}`;
    const before = (await api('GET', '/online-booking/settings')).data;

    const recUser = `bookrec${tag}`;
    await api('POST', '/receptionists', { firstName: 'Bron', lastName: `Reg${tag}`, phone: `+99894${tag}6`, username: recUser, password: 'testpass123' });
    const recToken = (await call('POST', '/auth/login', { username: recUser, password: 'testpass123' })).data?.token;
    const doc = (await api('POST', '/doctors', { firstName: 'Sayt', lastName: `Shifokor${tag}`, phone: `+99895${tag}7`, specialty: 'Kardiolog', startHour: 9, endHour: 17 })).data;
    ok('shifokor va registrator', !!doc?.id && !!recToken, JSON.stringify(doc).slice(0, 100));
    const D = day(2);

    try {
        console.log("\n═══ 1. O'CHIQ ═══════════════════════════════════════════");
        await api('PUT', '/online-booking/settings', { enabled: false, autoConfirm: false });
        let r = await call('GET', `/public/booking?${q}`);
        ok('o\'chiq — 404', r.status === 404, `${r.status}`);
        r = await call('POST', '/public/booking', { c: clinicId, doctorId: doc.id, date: D, time: '10:00', name: 'Aziz', phone: '+998905551234' });
        ok('o\'chiq — POST ham 404', r.status === 404, `${r.status}`);

        console.log("\n═══ 2. OCHIQ MA'LUMOT ═══════════════════════════════════");
        r = await api('PUT', '/online-booking/settings', { enabled: true }, recToken);
        ok('registrator yoqa olmaydi — 403', r.status === 403, `${r.status}`);
        r = await api('PUT', '/online-booking/settings', { enabled: true });
        ok('ega yoqdi', r.status === 200 && r.data?.enabled === true, `${r.status}`);
        const info = await call('GET', `/public/booking?${q}`);
        const d = info.data?.doctors?.find((x: any) => x.id === doc.id);
        ok('shifokor ro\'yxatda: ism, mutaxassislik, kunlar', !!d && d.specialty === 'Kardiolog' && d.days.includes(D), JSON.stringify(d).slice(0, 120));
        ok('telefon, ish soati kabi ichki maydonlar yo\'q', d && !('phone' in d) && !('startHour' in d), Object.keys(d || {}).join(','));
        let slots = (await call('GET', `/public/booking/slots?${q}&doctorId=${doc.id}&date=${D}`)).data;
        ok('bo\'sh vaqtlar — faqat vaqt satrlari', Array.isArray(slots?.times) && slots.times.includes('10:00') && slots.times.every((x: string) => /^\d{2}:\d{2}$/.test(x)), JSON.stringify(slots).slice(0, 120));
        ok('javobda bemor ma\'lumoti yo\'q', Object.keys(slots || {}).join(',') === 'times');

        console.log("\n═══ 3. SO'ROV ═══════════════════════════════════════════");
        const base = { c: clinicId, doctorId: doc.id, date: D };
        r = await call('POST', '/public/booking', { ...base, time: '10:00', name: 'A', phone: '+998905551234' });
        ok('1 harfli ism — 400', r.status === 400, `${r.status}`);
        r = await call('POST', '/public/booking', { ...base, time: '10:00', name: 'Aziz', phone: '12345' });
        ok('yomon telefon — 400', r.status === 400, `${r.status}`);
        r = await call('POST', '/public/booking', { ...base, time: '10:00', name: 'Bot', phone: '+998905551234', website: 'http://spam' });
        ok('tuzoq — jim muvaffaqiyat, yozilmaydi', r.status === 200 && r.data?.ok === true, `${r.status}`);
        const phone = `+99890${tag.slice(0, 3)}${tag.slice(3)}9`.slice(0, 13);
        r = await call('POST', '/public/booking', { ...base, time: '10:00', name: `Aziz Sayt${tag}`, phone });
        ok('so\'rov yuborildi — javobda id yo\'q', r.status === 200 && r.data?.ok === true && r.data?.confirmed === false && !('id' in (r.data || {})), `${r.status} ${JSON.stringify(r.data)}`);
        r = await call('POST', '/public/booking', { ...base, time: '10:00', name: 'Boshqa', phone: '+998935551111' });
        ok('o\'sha vaqt endi band — 409', r.status === 409, `${r.status}`);
        slots = (await call('GET', `/public/booking/slots?${q}&doctorId=${doc.id}&date=${D}`)).data;
        ok('10:00 bo\'sh vaqtlardan chiqdi', !slots?.times?.includes('10:00'));

        const appts = (await api('GET', `/appointments?clinicId=${clinicId}&from=${D}&to=${D}`)).data || [];
        const req = appts.find((a: any) => a.doctorId === doc.id && a.time === '10:00');
        ok("Kalendarda 'Requested', manba — sayt", req?.status === 'Requested' && req?.source === 'site', JSON.stringify(req).slice(0, 140));

        console.log("\n═══ 4. TASDIQLASH / RAD ═════════════════════════════════");
        r = await call('POST', `/appointments/${req.id}/confirm`, {});
        ok('kirmagan — tasdiqlay olmaydi', r.status === 401 || r.status === 403, `${r.status}`);
        r = await api('POST', `/appointments/${req.id}/confirm`, { date: D, time: '11:00' }, recToken);
        ok('registrator boshqa vaqtga tasdiqladi', r.status === 200 && r.data?.success === true, `${r.status} ${JSON.stringify(r.data)}`);
        r = await api('POST', `/appointments/${req.id}/confirm`, {}, recToken);
        ok('ikkinchi marta — 409', r.status === 409, `${r.status}`);
        const moved = ((await api('GET', `/appointments?clinicId=${clinicId}&from=${D}&to=${D}`)).data || []).find((a: any) => a.id === req.id);
        ok('yozuv 11:00 da, Confirmed', moved?.status === 'Confirmed' && moved?.time === '11:00', JSON.stringify(moved).slice(0, 120));

        const phone2 = `+99891${tag}8`.slice(0, 13);
        await call('POST', '/public/booking', { ...base, time: '14:00', name: `Rad Etiladi${tag}`, phone: phone2 });
        const req2 = ((await api('GET', `/appointments?clinicId=${clinicId}&from=${D}&to=${D}`)).data || []).find((a: any) => a.doctorId === doc.id && a.time === '14:00');
        r = await api('POST', `/appointments/${req2?.id}/reject`, undefined, recToken);
        ok('rad etildi', r.status === 200, `${r.status}`);
        const pts = (await api('GET', `/patients?search=${encodeURIComponent(`Rad`)}`)).data;
        const list = Array.isArray(pts) ? pts : pts?.patients || pts?.items || [];
        ok("so'rov yaratgan bo'sh karta o'chdi", !list.some((x: any) => String(x.lastName || '').includes(`Etiladi${tag}`)), String(list.length));

        console.log("\n═══ 5. AVTOMATIK TASDIQ ═════════════════════════════════");
        await api('PUT', '/online-booking/settings', { autoConfirm: true });
        r = await call('POST', '/public/booking', { ...base, time: '15:00', name: `Avto Tasdiq${tag}`, phone: `+99897${tag}1`.slice(0, 13) });
        ok('darhol tasdiqlandi', r.status === 200 && r.data?.confirmed === true, `${r.status} ${JSON.stringify(r.data)}`);
    } finally {
        await api('PUT', '/online-booking/settings', { enabled: !!before?.enabled, autoConfirm: !!before?.autoConfirm });
    }
    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
