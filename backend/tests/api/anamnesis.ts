/* Tibbiy tarix (anamnez) sinovi — migratsiya 0039.

   ASOSIY SAVOLLAR:
     1. Qolgan bo'limlar (dori, operatsiya, qon guruhi…) bemor yozuviga
        saqlanadimi va qayta o'qiladimi?
     2. Buzilgan JSON bazaga tushmaydimi? Tushsa, karta uni o'qiy olmay
        hamma bo'limni «so'ralmagan» deb ko'rsatardi.
     3. Kim va qachon o'zgartirgani yoziladimi — kasallik, JSON va allergiya
        o'zgarganda ham?
     4. Registrator allergiya qo'sha va olib tashlay oladimi (klinika egasi,
        2026-11-21)? Ilgari server unga 403 qaytarardi.

   Ishga tushirish: cd backend && npm run test:api
*/
const BASE = process.env.T_BASE || 'http://localhost:3079';
const TOKEN = process.argv[2];

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(method: string, p: string, body?: any, token = TOKEN) {
    const r = await fetch(BASE + '/api' + p, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

async function login(username: string, password = 'testpass123'): Promise<string | null> {
    const r = await fetch(BASE + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
    });
    return r.status === 200 ? ((await r.json())?.token ?? null) : null;
}

const uniq = Date.now() % 1000000;
const PH = `+99894${String(uniq).padStart(7, '0')}`.slice(0, 13);

async function main() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }

    const created = await call('POST', '/patients', {
        firstName: 'Anamnez', lastName: `Sinovov${uniq}`, phone: PH, gender: 'Female', dob: '1988-03-02',
    });
    const id = created.data?.id;
    ok('bemor yaratildi', !!id, `status: ${created.status}`);
    if (!id) return finish();

    console.log('\n═══ 1. BO\'LIMLAR SAQLANADI ═══════════════════════');
    const data = {
        none: { allergies: true },
        meds: ['Varfarin', 'Lizinopril 10 mg'],
        surgeries: [{ name: 'appendectomy', year: '2015' }],
        blood: 'II', rh: '+', pregnancy: 'no',
    };
    const put = await call('PUT', `/patients/${id}`, { anamnesis: JSON.stringify(data) });
    ok('saqlandi', put.status === 200, `status: ${put.status}`);
    const back = await call('GET', `/patients/${id}`);
    let parsed: any = null;
    try { parsed = JSON.parse(back.data?.anamnesis || 'null'); } catch { /* pastda tekshiriladi */ }
    ok('qayta o\'qildi: dorilar', JSON.stringify(parsed?.meds) === JSON.stringify(data.meds), back.data?.anamnesis);
    ok('qayta o\'qildi: qon guruhi', parsed?.blood === 'II' && parsed?.rh === '+');
    ok('qayta o\'qildi: «allergiyasi yo\'q»', parsed?.none?.allergies === true);

    console.log('\n═══ 2. BUZILGAN MA\'LUMOT RAD ETILADI ══════════════');
    const bad = await call('PUT', `/patients/${id}`, { anamnesis: '{buzilgan' });
    ok('yaroqsiz JSON — 400', bad.status === 400, `status: ${bad.status}`);
    const arr = await call('PUT', `/patients/${id}`, { anamnesis: '[1,2]' });
    ok('massiv — 400', arr.status === 400, `status: ${arr.status}`);
    const still = await call('GET', `/patients/${id}`);
    ok('avvalgisi buzilmadi', still.data?.anamnesis === put.data?.anamnesis);

    console.log('\n═══ 3. KIM VA QACHON ═════════════════════════════');
    ok('JSON saqlanganda belgi qo\'yildi', !!put.data?.anamnesisUpdatedAt && !!put.data?.anamnesisUpdatedBy,
        JSON.stringify({ at: put.data?.anamnesisUpdatedAt, by: put.data?.anamnesisUpdatedBy }));
    const before = new Date(put.data?.anamnesisUpdatedAt || 0).getTime();
    await new Promise(r => setTimeout(r, 1100));
    const hist = await call('PUT', `/patients/${id}`, { medicalHistory: 'BRONXIAL ASTMA (J45.9)' });
    ok('kasallik saqlanganda belgi yangilandi', new Date(hist.data?.anamnesisUpdatedAt || 0).getTime() > before);
    /* Bemor formasi tahrirda kasalliklar matnini har safar qayta yuboradi —
       o'zgarmagan matn soxta «yangilandi» belgisi qo'ymasligi kerak */
    const same = await call('PUT', `/patients/${id}`, { medicalHistory: 'BRONXIAL ASTMA (J45.9)', phone: PH });
    ok('o\'zgarmagan kasallik matni — belgi o\'zgarmaydi',
        same.data?.anamnesisUpdatedAt === hist.data?.anamnesisUpdatedAt,
        `${same.data?.anamnesisUpdatedAt} vs ${hist.data?.anamnesisUpdatedAt}`);
    const other = await call('PUT', `/patients/${id}`, { address: 'Sinov ko\'chasi' });
    ok('manzil o\'zgarsa — belgi o\'zgarmaydi',
        other.data?.anamnesisUpdatedAt === hist.data?.anamnesisUpdatedAt,
        `${other.data?.anamnesisUpdatedAt} vs ${hist.data?.anamnesisUpdatedAt}`);

    console.log('\n═══ 4. REGISTRATOR ALLERGIYA YOZADI ══════════════');
    const recs = await call('GET', '/receptionists');
    const recName = (Array.isArray(recs.data) ? recs.data : recs.data?.items || []).find((r: any) => r?.username)?.username;
    const rec = recName ? await login(recName) : null;
    ok('registrator kirdi', !!rec, String(recName));
    if (rec) {
        const add = await call('POST', `/patients/${id}/allergies`, { substance: 'Lidokain', severity: 'Severe' }, rec);
        ok('registrator allergiya qo\'shdi', add.status === 200, `status: ${add.status} ${JSON.stringify(add.data).slice(0, 120)}`);
        const sum = await call('GET', `/patients/${id}/summary`);
        ok('xulosada ko\'rinadi', (sum.data?.allergies || []).some((a: any) => a.substance === 'Lidokain'));
        ok('xulosada kim yangilagani bor', !!sum.data?.patient?.anamnesisUpdatedAt);
        const del = add.data?.id ? await call('DELETE', `/patients/${id}/allergies/${add.data.id}`, undefined, rec) : { status: 0 };
        ok('registrator faolsizlantirdi', del.status === 200, `status: ${del.status}`);
    }

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
