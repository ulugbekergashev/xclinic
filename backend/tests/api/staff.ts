/* XODIMLAR: umumiy maydonlar va yagona ro'yxat.
 *
 * Nimani tekshiradi:
 *
 *   1. Shifokor yaratishda BO'LIM saqlanadimi. Ilgari `POST /api/doctors`
 *      bu maydonni umuman qabul qilmasdi: forma yuborardi, server jimgina
 *      tashlab yuborardi. Natijada har yangi shifokor hamma joyda
 *      «bo'limsiz» bo'lardi, «Bugun», karta va kalendar esa shifokorlarni
 *      aynan bo'lim bo'yicha filtrlaydi.
 *
 *   2. Bo'lim, kabinet va ish soatlari TO'RT rolda ham ishlaydimi
 *      (migratsiya 0035). Ilgari ular faqat shifokorda bor edi.
 *
 *   3. `GET /api/staff` hammasini bitta ro'yxatda, rol bilan qaytaradimi
 *      va parol chiqib ketmaydimi.
 *
 * Ishga tushirish: cd backend && npm run test:api
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

const tag = () => String(Date.now()).slice(-7) + Math.floor(Math.random() * 100);

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    const departments = (await call('GET', '/departments', undefined, token)).data || [];
    const dep = departments[0];
    ok("bo'lim topildi", !!dep, String(dep?.name));
    if (!dep) return finish();

    console.log("\n═══ 1. SHIFOKOR YARATISHDA BO'LIM SAQLANADI ═══════");
    const t1 = tag();
    const doc = await call('POST', '/doctors', {
        firstName: 'Bolim', lastName: `Shifokorov${t1}`, specialty: 'Terapevt',
        phone: '+998901112233', status: 'Active',
        username: `docdep${t1}`, password: 'testpass123',
        departmentId: dep.id, room: '204', startHour: 9, endHour: 18,
    }, token);
    ok('shifokor yaratildi', doc.status === 200,
        `status: ${doc.status}, ${JSON.stringify(doc.data).slice(0, 140)}`);
    ok("BO'LIM SAQLANDI", doc.data?.departmentId === dep.id,
        `kutilgan ${dep.id}, bor ${doc.data?.departmentId}`);
    ok('kabinet saqlandi', doc.data?.room === '204', String(doc.data?.room));
    ok('ish soatlari saqlandi', doc.data?.startHour === 9 && doc.data?.endHour === 18,
        `${doc.data?.startHour}–${doc.data?.endHour}`);

    /* Begona bo'limga ulab bo'lmaydi. */
    const alien = await call('POST', '/doctors', {
        firstName: 'Begona', lastName: `Bolim${tag()}`, specialty: 'x',
        phone: '+998901112234', status: 'Active',
        departmentId: 'yoq-bolim-id',
    }, token);
    ok("mavjud bo'lmagan bo'lim RAD ETILDI", alien.status === 400, `status: ${alien.status}`);

    /* Soat chegarasi: 0..23. Chegaradan tashqari qiymat jadvalni jimgina
       buzadi — kalendar bo'sh ustun chizadi va sabab ko'rinmaydi. */
    const badHour = await call('POST', '/doctors', {
        firstName: 'Soat', lastName: `Xato${tag()}`, specialty: 'x',
        phone: '+998901112235', status: 'Active', startHour: 30,
    }, token);
    ok("noto'g'ri ish soati RAD ETILDI", badHour.status === 400, `status: ${badHour.status}`);

    console.log("\n═══ 2. UMUMIY MAYDONLAR TO'RT ROLDA HAM ══════════");
    const t2 = tag();
    const rec = await call('POST', '/receptionists', {
        firstName: 'Reg', lastName: `Xodimov${t2}`, phone: '+998901112236',
        username: `rec${t2}`, password: 'testpass123',
        departmentId: dep.id, room: '101', startHour: 8, endHour: 20,
    }, token);
    ok('registrator yaratildi', rec.status === 200,
        `status: ${rec.status}, ${JSON.stringify(rec.data).slice(0, 140)}`);
    ok("registratorda BO'LIM bor", rec.data?.departmentId === dep.id, String(rec.data?.departmentId));
    ok('registratorda kabinet bor', rec.data?.room === '101', String(rec.data?.room));

    const t3 = tag();
    const lab = await call('POST', '/lab-technicians', {
        firstName: 'Lab', lastName: `Xodimov${t3}`, phone: '+998901112237',
        specialty: 'Klinik', departmentId: dep.id, room: '007', startHour: 8, endHour: 16,
    }, token);
    ok('laborant yaratildi', lab.status === 200,
        `status: ${lab.status}, ${JSON.stringify(lab.data).slice(0, 140)}`);
    ok("laborantda BO'LIM bor", lab.data?.departmentId === dep.id, String(lab.data?.departmentId));
    ok('laborantda kabinet bor', lab.data?.room === '007', String(lab.data?.room));

    const t4 = tag();
    const nurse = await call('POST', '/nurses', {
        firstName: 'Ham', lastName: `Shirayev${t4}`, phone: '+998901112238',
        departmentId: dep.id, room: '303', startHour: 7, endHour: 19,
        specialty: 'Palata',
    }, token);
    ok('hamshira yaratildi', nurse.status === 200,
        `status: ${nurse.status}, ${JSON.stringify(nurse.data).slice(0, 140)}`);
    ok('hamshirada kabinet bor', nurse.data?.room === '303', String(nurse.data?.room));
    ok('hamshirada mutaxassislik bor', nurse.data?.specialty === 'Palata', String(nurse.data?.specialty));

    console.log("\n═══ 3. HAMMA XODIM BITTA RO'YXATDA ════════════════");
    const staff = await call('GET', '/staff', undefined, token);
    ok('ro\'yxat keldi', staff.status === 200 && Array.isArray(staff.data),
        `status: ${staff.status}`);
    const rows: any[] = staff.data || [];

    const roles = new Set(rows.map(r => r.role));
    ok('to\'rt rol ham bor', ['DOCTOR', 'RECEPTIONIST', 'LAB_TECHNICIAN', 'NURSE']
        .every(r => roles.has(r)), Array.from(roles).join(', '));

    ok('yangi shifokor ro\'yxatda', rows.some(r => r.id === doc.data?.id && r.role === 'DOCTOR'));
    ok('yangi registrator ro\'yxatda', rows.some(r => r.id === rec.data?.id && r.role === 'RECEPTIONIST'));
    ok('yangi laborant ro\'yxatda', rows.some(r => r.id === lab.data?.id && r.role === 'LAB_TECHNICIAN'));
    ok('yangi hamshira ro\'yxatda', rows.some(r => r.id === nurse.data?.id && r.role === 'NURSE'));

    /* PAROL HECH QACHON chiqmaydi. */
    const leaked = rows.filter(r => 'password' in r);
    ok('PAROL chiqmadi', leaked.length === 0,
        leaked.map(r => `${r.role}:${r.lastName}`).slice(0, 3).join(', '));

    ok('familiya bo\'yicha tartiblangan',
        rows.every((r, i) => i === 0
            || `${rows[i - 1].lastName} ${rows[i - 1].firstName}`
                .localeCompare(`${r.lastName} ${r.firstName}`) <= 0));

    console.log("\n═══ 4. TAHLIL QATORI SHIFOKORGA BOG'LANADI ══════");
    /* Laboratoriya ekrani yo'llanmaga faqat shifokor NOMINI yuborardi,
       identifikatorni emas. Server esa hisob qatorini `order.doctorId`
       bilan yaratadi — ya'ni qator `doctorId: null` bilan tug'ilardi va
       shifokor tahlil pulidan ULUSH OLMASDI. Vedomost buni «shifokor
       ko'rsatilmagan» deb tashlab ketardi, hech kim sezmasdi. */
    const tests = (await call('GET', '/lab-tests', undefined, token)).data || [];
    const patientsList = (await call('GET', '/patients', undefined, token)).data || [];
    const p1 = patientsList[0];
    ok('tahlil katalogi va bemor topildi', tests.length > 0 && !!p1,
        `tahlil: ${tests.length}`);

    if (tests.length && p1 && doc.data?.id) {
        const order = await call('POST', '/lab-orders', {
            patientId: p1.id, patientName: `${p1.lastName} ${p1.firstName}`,
            doctorId: doc.data.id, doctorName: 'Shifokorov Bolim',
            testIds: [tests[0].id],
        }, token);
        ok('yo\'llanma yaratildi', order.status === 200,
            `status: ${order.status}, ${JSON.stringify(order.data).slice(0, 140)}`);
        ok('yo\'llanmada shifokor identifikatori bor',
            order.data?.doctorId === doc.data.id, String(order.data?.doctorId));

        const charges = (await call('GET', `/charges?patientId=${p1.id}`, undefined, token)).data || [];
        const row = charges.find((c: any) => c.source === 'Lab' && c.sourceId === order.data?.id);
        ok('tahlil uchun hisob qatori yaratildi', !!row, String(charges.length));
        ok('QATOR SHIFOKORGA BOG\'LANDI', row?.doctorId === doc.data.id,
            `kutilgan ${doc.data.id}, bor ${row?.doctorId}`);
    }

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
