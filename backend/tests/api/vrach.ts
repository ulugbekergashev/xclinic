/* Vrach ish joyi (2026-11-23, migratsiya 0040): ko'rik matni, tashxis
   turi, yo'naltirish — to'liq aylanish.

   ASOSIY SAVOLLAR:
     1. Ko'rik matni saqlanadimi, registrator uni yoza olmaydimi?
     2. Birinchi tashxis «asosiy», keyingisi «yondosh» bo'ladimi; asosiy
        almashtirilsa eskisi yondoshga tushadimi; qulfda o'zgarmaydimi?
     3. Ichki yo'naltirish: qabul qiluvchi KIM va NIMA UCHUN yuborganini
        ko'radimi, javob yuboruvchiga qaytadimi?
     4. Tashqi yo'naltirish nomi bilan yoziladimi?

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

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    const tag = String(Date.now()).slice(-7);
    const p = (await call('POST', '/patients', {
        firstName: 'Vrach', lastName: `Sinov${tag}`, gender: 'Female', phone: `+99891${tag}`, force: true,
    }, token)).data;
    ok('sinov bemori yaratildi', !!p?.id);
    if (!p?.id) return finish();

    const depts = (await call('GET', '/departments', undefined, token)).data || [];
    ok('kamida ikki bo\'lim bor', depts.length >= 2, String(depts.length));
    const [d1, d2] = depts;

    console.log('\n═══ 1. KO\'RIK MATNI ═══════════════════════════════');
    const v1 = (await call('POST', '/visits', { patientId: p.id, departmentId: d1?.id, doctorName: 'Ahmedova Kamola', status: 'In Progress' }, token)).data;
    ok('qabul ochildi', !!v1?.id);
    const put = await call('PUT', `/visits/${v1.id}`, { objectiveText: 'Qorin yumshoq, epigastriyda og\'riqli' }, token);
    ok('ko\'rik matni saqlandi', put.status === 200 && put.data?.objectiveText?.includes('epigastriy'), `status: ${put.status}`);
    const got = (await call('GET', `/visits/${v1.id}`, undefined, token)).data;
    ok('qabulni o\'qiganda ko\'rik matni keladi', got?.objectiveText?.includes('epigastriy'));

    console.log('\n═══ 2. TASHXIS TURI ════════════════════════════════');
    const dx1 = (await call('POST', '/diagnoses', { patientId: p.id, visitId: v1.id, code: 'K29.5', name: 'Surunkali gastrit', date: '2026-11-23', status: 'Active' }, token)).data;
    ok('birinchi tashxis — asosiy', dx1?.kind === 'Main', String(dx1?.kind));
    const dx2 = (await call('POST', '/diagnoses', { patientId: p.id, visitId: v1.id, code: 'K21.0', name: 'Reflyuks', date: '2026-11-23', status: 'Active' }, token)).data;
    ok('ikkinchi tashxis — yondosh', dx2?.kind === 'Concomitant', String(dx2?.kind));
    const bad = await call('PATCH', `/diagnoses/${dx2.id}`, { kind: 'Nimadir' }, token);
    ok('noto\'g\'ri tur rad etildi', bad.status === 400, `status: ${bad.status}`);
    const sw = await call('PATCH', `/diagnoses/${dx2.id}`, { kind: 'Main' }, token);
    ok('ikkinchisi asosiy qilindi', sw.status === 200 && sw.data?.kind === 'Main', `status: ${sw.status}`);
    const all = (await call('GET', `/diagnoses?patientId=${p.id}`, undefined, token)).data || [];
    const first = all.find((d: any) => d.id === dx1.id);
    ok('eski asosiy yondoshga tushdi — qabulda bitta asosiy', first?.kind === 'Concomitant', String(first?.kind));
    const qabulsiz = (await call('POST', '/diagnoses', { patientId: p.id, code: 'I10', name: 'Gipertoniya', date: '2026-11-23', status: 'Active', isChronic: true }, token)).data;
    ok('qabulsiz (anamnez) tashxisda tur yo\'q', qabulsiz?.id && qabulsiz.kind == null, String(qabulsiz?.kind));

    console.log('\n═══ 3. ICHKI YO\'NALTIRISH ═════════════════════════');
    const ref = await call('POST', '/visits', {
        patientId: p.id, departmentId: d2?.id, status: 'Waiting',
        referralSource: 'Internal', referredFromVisitId: v1.id, referralReason: 'Qand miqdori chegarada',
    }, token);
    ok('yo\'naltirilgan qabul ochildi', ref.status === 200 && !!ref.data?.id, `status: ${ref.status}`);
    const r2 = (await call('GET', `/visits/${ref.data?.id}`, undefined, token)).data;
    ok('qabul qiluvchi KIM yuborganini ko\'radi', (r2?.referredByName || '').includes('Ahmedova'), String(r2?.referredByName));
    ok('sababi saqlangan', r2?.referralReason === 'Qand miqdori chegarada');
    ok('yuboruvchi qabul ma\'lumoti keladi', r2?.referredFrom?.id === v1.id);
    const back = (await call('GET', `/visits/${v1.id}`, undefined, token)).data;
    ok('javob yuboruvchiga qaytadi (referredVisits)', (back?.referredVisits || []).some((x: any) => x.id === ref.data?.id),
        JSON.stringify((back?.referredVisits || []).map((x: any) => x.id)));

    const fake = await call('POST', '/visits', {
        patientId: p.id, departmentId: d2?.id, force: true,
        referralSource: 'Internal', referredFromVisitId: 'yoq-bunday-qabul',
    }, token);
    ok('begona/yo\'q qabuldan yo\'naltirish rad etildi', fake.status === 400 || fake.status === 404, `status: ${fake.status}`);

    console.log('\n═══ 4. TASHQI YO\'NALTIRISH ════════════════════════');
    const ext = await call('POST', '/visits', {
        patientId: p.id, departmentId: d1?.id, force: true,
        referralSource: 'External', referredByName: 'Dr. Aliyev — 5-oilaviy poliklinika',
    }, token);
    ok('tashqi yo\'llanma bilan qabul ochildi', ext.status === 200, `status: ${ext.status}`);
    ok('tashqi yo\'naltiruvchi nomi saqlandi', ext.data?.referredByName === 'Dr. Aliyev — 5-oilaviy poliklinika', String(ext.data?.referredByName));
    const noName = await call('POST', '/visits', {
        patientId: p.id, departmentId: d2?.id, force: true, referralSource: 'External',
    }, token);
    ok('tashqi yo\'llanma nomsiz rad etildi', noName.status === 400, `status: ${noName.status}`);
    const wrongSrc = await call('POST', '/visits', {
        patientId: p.id, departmentId: d2?.id, force: true, referralSource: 'Reklama',
    }, token);
    ok('noma\'lum manba rad etildi', wrongSrc.status === 400, `status: ${wrongSrc.status}`);

    console.log('\n═══ 5. QULF ════════════════════════════════════════');
    const lock = await call('POST', `/visits/${v1.id}/lock`, {}, token);
    ok('qabul qulflandi', lock.status === 200, `status: ${lock.status}`);
    const lockedPut = await call('PUT', `/visits/${v1.id}`, { objectiveText: 'boshqa matn' }, token);
    ok('qulfda ko\'rik matni o\'zgarmaydi', lockedPut.status === 409, `status: ${lockedPut.status}`);
    const lockedKind = await call('PATCH', `/diagnoses/${dx1.id}`, { kind: 'Main' }, token);
    ok('qulfda tashxis turi o\'zgarmaydi', lockedKind.status === 409, `status: ${lockedKind.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
