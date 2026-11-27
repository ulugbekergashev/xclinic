/* SHIKOYAT VA FIKRLAR (2026-11-26, migratsiya 0047).

   ASOSIY SAVOLLAR:
     1. Registrator bemor kartasidan shikoyat yozadi; qisqa matn / begona bemor — rad.
     2. Ro'yxat: statistika (ochiq, oyda hal qilingan), mas'ullar ro'yxati.
     3. Mas'ul tayinlash: noma'lum odam — 400.
     4. Yopish: izohsiz — 400; ikkinchi marta — 409; «oyda hal qilindi» oshadi.
     5. Ruxsat: shifokor (standart) — 403; registrator qayta ocha olmaydi;
        xabar sozlamasi — faqat ega.

   Ishga tushirish: cd backend && T_ONLY=complaints npm run test:api
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
    const api = (m: string, p: string, b?: any, tk = token) => call(m, p, b, tk);
    const clinicId = login.data?.user?.clinicId || (await api('GET', '/clinics')).data?.[0]?.id;
    const tag = String(Date.now()).slice(-6);

    const recUser = `cmprec${tag}`;
    await api('POST', '/receptionists', { firstName: 'Shikoyat', lastName: `Reg${tag}`, phone: `+99892${tag}3`, username: recUser, password: 'testpass123' });
    const recToken = (await call('POST', '/auth/login', { username: recUser, password: 'testpass123' })).data?.token;
    ok('registrator kirdi', !!recToken);
    const docUser = `cmpdoc${tag}`;
    await api('POST', '/doctors', { firstName: 'Shikoyat', lastName: `Doc${tag}`, phone: `+99892${tag}4`, specialty: 'Terapevt', username: docUser, password: 'testpass123' });
    const docToken = (await call('POST', '/auth/login', { username: docUser, password: 'testpass123' })).data?.token;
    ok('shifokor kirdi', !!docToken);

    const p = (await api('POST', '/patients', { firstName: 'Norozi', lastName: `Bemor${tag}`, gender: 'Female', phone: `+99893${tag}5`, force: true })).data;
    ok('bemor yaratildi', !!p?.id);

    console.log("\n═══ 1. YOZISH ═══════════════════════════════════════════");
    let r = await api('POST', '/complaints', { patientId: p.id, text: 'ab' }, recToken);
    ok('2 harfli matn — 400', r.status === 400, `${r.status}`);
    r = await api('POST', '/complaints', { patientId: `yoq-${tag}`, text: 'Uzoq kutdim' }, recToken);
    ok('begona bemor — 404', r.status === 404, `${r.status}`);
    r = await api('POST', '/complaints', { patientId: p.id, text: 'Uzoq kutdim', assigneeKey: 'DOCTOR:yoq' }, recToken);
    ok("noma'lum mas'ul — 400", r.status === 400, `${r.status}`);
    r = await api('POST', '/complaints', { patientId: p.id, text: `Chekda xizmat ikki marta yozilgan ${tag}` }, recToken);
    ok('registrator yozdi', r.status === 200 && !!r.data?.id, `${r.status} ${JSON.stringify(r.data)}`);
    const id = r.data?.id;
    r = await api('POST', '/complaints', { patientId: p.id, text: 'Shifokor yozmoqchi' }, docToken);
    ok('shifokor (standart ruxsat) — 403', r.status === 403, `${r.status}`);

    console.log("\n═══ 2. RO'YXAT ══════════════════════════════════════════");
    let list = (await api('GET', '/complaints', undefined, recToken));
    ok('registrator ro\'yxatni ko\'radi', list.status === 200 && Array.isArray(list.data?.rows), `${list.status}`);
    const row = list.data?.rows?.find((x: any) => x.id === id);
    ok('shikoyat ochiq, manbasi registratura', row?.status === 'open' && row?.source === 'reception' && row?.patientName.includes(`Bemor${tag}`), JSON.stringify(row).slice(0, 160));
    ok('telefon ko\'rinadi (ruxsati bor)', !!row?.phone, String(row?.phone));
    ok('mas\'ullar ro\'yxatida ega va registrator', list.data?.assignees?.some((a: any) => a.key.startsWith('CLINIC_ADMIN:'))
        && list.data?.assignees?.some((a: any) => a.key.startsWith('RECEPTIONIST:')));
    const resolvedBefore = list.data?.stats?.resolvedMonth ?? 0;
    const doc = await api('GET', '/complaints', undefined, docToken);
    ok('shifokor ro\'yxatni ko\'rmaydi — 403', doc.status === 403, `${doc.status}`);

    console.log("\n═══ 3. MAS'UL VA YOPISH ════════════════════════════════");
    const owner = list.data.assignees.find((a: any) => a.key.startsWith('CLINIC_ADMIN:'));
    r = await api('PUT', `/complaints/${id}`, { assigneeKey: owner.key }, recToken);
    ok("mas'ul tayinlandi", r.status === 200 && r.data?.assigneeKey === owner.key, `${r.status} ${JSON.stringify(r.data)}`);
    r = await api('PUT', `/complaints/${id}`, { assigneeKey: 'RECEPTIONIST:yoq' }, recToken);
    ok("noma'lum mas'ul — 400", r.status === 400, `${r.status}`);
    r = await api('POST', `/complaints/${id}/resolve`, { resolution: '' }, recToken);
    ok('izohsiz yopish — 400', r.status === 400, `${r.status}`);
    r = await api('POST', `/complaints/${id}/resolve`, { resolution: "Bemorga qo'ng'iroq qilindi, ortiqcha summa qaytarildi" }, recToken);
    ok('yopildi', r.status === 200, `${r.status}`);
    r = await api('POST', `/complaints/${id}/resolve`, { resolution: 'Yana' }, recToken);
    ok('ikkinchi marta — 409', r.status === 409, `${r.status}`);
    list = await api('GET', '/complaints', undefined, recToken);
    const after = list.data?.rows?.find((x: any) => x.id === id);
    ok('yechim kartada, kim yopgani bor', after?.status === 'resolved' && after?.resolution?.includes("qo'ng'iroq") && !!after?.resolvedByName, JSON.stringify(after).slice(0, 160));
    ok('«oyda hal qilindi» oshdi', (list.data?.stats?.resolvedMonth ?? 0) === resolvedBefore + 1, `${resolvedBefore} → ${list.data?.stats?.resolvedMonth}`);

    console.log("\n═══ 4. EGA AMALLARI ═════════════════════════════════════");
    r = await api('POST', `/complaints/${id}/reopen`, undefined, recToken);
    ok('registrator qayta ocha olmaydi — 403', r.status === 403, `${r.status}`);
    r = await api('POST', `/complaints/${id}/reopen`);
    ok('ega qayta ochdi', r.status === 200, `${r.status}`);
    r = await api('PUT', `/clinics/${clinicId}/complaint-alert`, { enabled: true }, recToken);
    ok('registrator xabar sozlamasini o\'zgartira olmaydi — 403', r.status === 403, `${r.status}`);
    r = await api('PUT', `/clinics/${clinicId}/complaint-alert`, { enabled: false });
    ok('ega xabar sozlamasini saqladi', r.status === 200 && r.data?.complaintAlert === false, `${r.status}`);
    await api('POST', `/complaints/${id}/resolve`, { resolution: 'Sinov tugadi' });
    r = await call('GET', '/complaints');
    ok('kirmagan foydalanuvchi — 401/403', r.status === 401 || r.status === 403, `${r.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
