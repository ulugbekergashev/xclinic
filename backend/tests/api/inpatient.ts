/* STATSIONAR: BITTA BEMOR — BITTA FAOL YOTISH.

   ASOSIY SAVOL: server bir bemorni ikkinchi koykaga yotqizishni rad
   etadimi?

   Topilgan holat: `POST /api/admissions` faqat KOYKANI tekshirardi
   («Koyka band»), bemorning o'zi allaqachon yotganini emas. Bazada ikkita
   bemor ikki koykada yotgan holda topildi. Bu pulga tegadi: koyka-kun har
   ikkala yotish uchun hisoblanadi, bandlik soni esa yolg'on ko'rsatadi.

   Sinov ATAYLAB HTTP orqali: front nima qilishidan qat'i nazar, server
   o'zi qo'riqlayotganini isbotlaydi.

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

let seq = 0;
const uniquePhone = () => `+99895${String(1000000 + (seq++) + (Date.now() % 100000)).slice(-7)}`;

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 1. TAYYORGARLIK: palata, ikki koyka, ikki bemor ═══');
    const ward = await call('POST', '/wards', {
        /* `floor` sxemada SATR («1-qavat»). Son yuborilsa Prisma 500 beradi —
           bu sinov birinchi yurishda aynan shunda yiqildi. */
        name: `Sinov palata ${Date.now() % 100000}`, floor: '1-qavat', kind: 'Umumiy', dailyRate: 100000, bedCount: 2,
    }, token);
    const beds: any[] = ward.data?.beds || [];
    ok('palata ikki koyka bilan yaratildi', ward.status === 200 && beds.length === 2, `status ${ward.status}`);
    if (beds.length < 2) return finish();

    const mk = async (last: string) => (await call('POST', '/patients', {
        firstName: 'Sinov', lastName: last, gender: 'Male', phone: uniquePhone(), force: true,
    }, token)).data;
    const a = await mk(`Yotish${Date.now() % 100000}`);
    const b = await mk(`Ikkinchi${Date.now() % 100000}`);
    ok('ikki bemor yaratildi', !!a?.id && !!b?.id);
    if (!a?.id || !b?.id) return finish();

    console.log('\n═══ 2. BIRINCHI YOTQIZISH — o\'tadi ═══');
    const first = await call('POST', '/admissions', {
        patientId: a.id, patientName: `${a.lastName} ${a.firstName}`, bedId: beds[0].id, dailyRate: 100000,
    }, token);
    ok('bemor 1-koykaga yotqizildi', first.status === 200 && !!first.data?.id, `status ${first.status}: ${JSON.stringify(first.data).slice(0, 120)}`);

    console.log('\n═══ 3. O\'SHA BEMORNI IKKINCHI KOYKAGA — 409 ═══');
    const dup = await call('POST', '/admissions', {
        patientId: a.id, patientName: `${a.lastName} ${a.firstName}`, bedId: beds[1].id, dailyRate: 100000,
    }, token);
    ok('ikkinchi faol yotish rad etildi (409)', dup.status === 409, `status ${dup.status}`);
    ok('sabab kodi PATIENT_ALREADY_ADMITTED', dup.data?.code === 'PATIENT_ALREADY_ADMITTED', JSON.stringify(dup.data).slice(0, 120));
    ok('xabar qayerda yotganini aytadi', /yotibdi/.test(dup.data?.error || ''), dup.data?.error);

    /* Rad etilgan urinish koykani band qilib qo'ymagan bo'lishi kerak */
    const bedAfter = await call('GET', '/wards', undefined, token);
    const w = (bedAfter.data || []).find((x: any) => x.id === ward.data.id);
    const bed2 = (w?.beds || []).find((x: any) => x.id === beds[1].id);
    ok('2-koyka bo\'sh qoldi', bed2?.status === 'Free', `holat: ${bed2?.status}`);

    console.log('\n═══ 4. BOSHQA BEMOR O\'SHA KOYKAGA — «Koyka band» hali ishlaydi ═══');
    const sameBed = await call('POST', '/admissions', {
        patientId: b.id, patientName: `${b.lastName} ${b.firstName}`, bedId: beds[0].id, dailyRate: 100000,
    }, token);
    ok('band koykaga yotqizish rad etildi (409)', sameBed.status === 409, `status ${sameBed.status}`);

    console.log('\n═══ 5. CHIQARILGANDAN KEYIN QAYTA YOTQIZISH — o\'tadi ═══');
    const dis = await call('POST', `/admissions/${first.data.id}/discharge`, { confirmDebt: true }, token);
    ok('bemor chiqarildi', dis.status === 200, `status ${dis.status}: ${JSON.stringify(dis.data).slice(0, 120)}`);
    const again = await call('POST', '/admissions', {
        patientId: a.id, patientName: `${a.lastName} ${a.firstName}`, bedId: beds[1].id, dailyRate: 100000,
    }, token);
    ok('chiqarilgan bemor qayta yotqiziladi', again.status === 200, `status ${again.status}: ${JSON.stringify(again.data).slice(0, 120)}`);

    // Tozalash: sinov bazasi nusxa, lekin keyingi sinovlar uchun koyka bo'shasin
    if (again.data?.id) await call('POST', `/admissions/${again.data.id}/discharge`, { confirmDebt: true }, token);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
