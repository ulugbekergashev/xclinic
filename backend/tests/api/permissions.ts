/* S1.2 sinovi: RUXSATLAR — kim qaysi amalni bajara oladi.

   ASOSIY SAVOL: `permissions.ts` jadvali haqiqatan ishlayaptimi, yoki
   yozilgan-u qo'llanmaganmi?

   Audit topgan holat: 160 marshrutdan 144 tasi tokenni tekshirardi, lekin
   rolni atigi 16 tasi tekshirardi. Ya'ni registrator ham xarajat o'chira,
   klinika sozlamalarini o'zgartira va ommaviy SMS yubora olardi.

   NIMA UCHUN EGADAN SINAB BO'LMAYDI. Ega hamma narsaga haqli, shuning
   uchun undan yuritilgan sinov cheklov borligini umuman isbotlamaydi.
   Sinov aynan CHEKLANGAN rollardan — registrator, shifokor, hamshira —
   kirib, ularga taqiqlangan amal 403 qaytarishini tekshiradi.

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
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

async function login(username: string, password = 'testpass123'): Promise<string | null> {
    const r = await call('POST', '/auth/login', { username, password });
    return r.status === 200 ? (r.data?.token ?? null) : null;
}

/** Bazadagi birinchi xodimning login nomini oladi — ismlar seedga bog'liq. */
async function firstUsername(adminToken: string, endpoint: string): Promise<string | null> {
    const r = await call('GET', endpoint, undefined, adminToken);
    const rows = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
    const withLogin = rows.find((x: any) => x?.username);
    return withLogin?.username ?? null;
}

/* Taqiqlangan amallar: [nom, usul, yo'l, tana].
   Tana ATAYLAB haqiqiy: agar ruxsat tekshiruvi ishlamasa, so'rov haqiqatan
   bajarilib qolmasligi uchun barchasi mavjud bo'lmagan ID ga uriladi yoki
   yozuvni o'zgartirmaydigan shaklda yuboriladi. */
type Attempt = [string, string, string, any?];

const DENIED_FOR_RECEPTIONIST: Attempt[] = [
    /* Registrator mayda naqd xarajat yozadi (2026-11-22) — oylik va karta bilan esa yo'q */
    ['oylik xarajati', 'POST', '/expenses', { title: 'sinov', amount: 1, category: 'Salary', method: 'Cash' }],
    ['kartadan xarajat', 'POST', '/expenses', { title: 'sinov', amount: 1, category: 'Other', method: 'Card' }],
    ['xarajatni o\'zgartirish', 'PUT', '/expenses/yoq-bunday-id', { amount: 1 }],
    ['xarajatni o\'chirish', 'DELETE', '/expenses/yoq-bunday-id'],
    ['to\'lovni o\'chirish', 'DELETE', '/transactions/yoq-bunday-id'],
    ['to\'lovni o\'zgartirish', 'PUT', '/transactions/yoq-bunday-id', { amount: 1 }],
    ['kassa kunini o\'chirish', 'DELETE', '/cash-register/2026-01-01'],
    ['shifokor yaratish', 'POST', '/doctors', { firstName: 'X', lastName: 'Y' }],
    ['hamshira yaratish', 'POST', '/nurses', { firstName: 'X', lastName: 'Y' }],
    ['shifokor stavkasi', 'PUT', '/doctor-rates/yoq-bunday-id', { percent: 90 }],
    ['oylik vedomosti', 'POST', '/payroll/runs', { from: '2026-01-01', to: '2026-01-31' }],
    ['ommaviy SMS', 'POST', '/messages/send-bulk', { text: 'sinov' }],
    ['xabar shabloni', 'POST', '/message-templates', { name: 'x', text: 'y' }],
    ['bo\'lim qo\'shish', 'POST', '/departments', { name: 'sinov' }],
    ['ombor tuzatishi', 'POST', '/stock-movements/adjust', { itemId: 'yoq', qty: 1 }],
    ['bemorni o\'chirish', 'DELETE', '/patients/yoq-bunday-id'],
    ['bemorlarni birlashtirish', 'POST', '/patient-merge', { keepId: 'a', mergeId: 'b' }],
    ['zaxira nusxadan tiklash', 'POST', '/admin/backup/restore', { file: 'x' }],
    ['chegirma berish', 'PUT', '/charges/yoq-bunday-id/discount', { discount: 100 }],
];

const DENIED_FOR_DOCTOR: Attempt[] = [
    ['xarajat qo\'shish', 'POST', '/expenses', { title: 'sinov', amount: 1 }],
    ['kassa ochish', 'POST', '/cash-register/open', { openingCash: 0 }],
    ['to\'lov qabul qilish', 'POST', '/transactions', { amount: 1 }],
    ['lid yaratish', 'POST', '/leads', { name: 'sinov' }],
    ['klinika sozlamasi', 'PUT', '/clinics/x/settings', { name: 'x' }],
    ['xizmat narxi', 'POST', '/services', { name: 'x', price: 1 }],
];

const DENIED_FOR_NURSE: Attempt[] = [
    ['tashxis qo\'yish', 'POST', '/diagnoses', { patientId: 'x', code: 'I10' }],
    ['retsept yozish', 'POST', '/prescriptions', { patientId: 'x' }],
    ['to\'lov qabul qilish', 'POST', '/transactions', { amount: 1 }],
    ['xarajat qo\'shish', 'POST', '/expenses', { title: 'sinov', amount: 1 }],
    ['qabul yaratish', 'POST', '/appointments', { patientId: 'x' }],
];

async function assertDenied(role: string, token: string, attempts: Attempt[]) {
    let blocked = 0;
    const leaks: string[] = [];
    for (const [name, method, path, body] of attempts) {
        const r = await call(method, path, body, token);
        if (r.status === 403) blocked++;
        else leaks.push(`${name} (${method} ${path}) → ${r.status}`);
    }
    ok(`${role}: ${attempts.length} ta taqiqlangan amalning hammasi rad etildi`,
        blocked === attempts.length,
        leaks.length ? `o'tib ketdi: ${leaks.join('; ')}` : '');
}

async function main() {
    console.log('\n═══ 0. TAYYORGARLIK ═══════════════════════════════');
    const admin = await login('admin');
    ok('ega kirdi', !!admin);
    if (!admin) { console.log('\n  Ega kira olmadi — qolgan sinovlar o\'tkazilmaydi.'); return finish(); }

    const recName = await firstUsername(admin, '/receptionists');
    const docName = await firstUsername(admin, '/doctors');
    const nurseName = await firstUsername(admin, '/nurses');
    ok('bazada registrator logini bor', !!recName, String(recName));
    ok('bazada shifokor logini bor', !!docName, String(docName));

    console.log('\n═══ 1. REGISTRATOR ════════════════════════════════');
    const recToken = recName ? await login(recName) : null;
    ok('registrator kirdi', !!recToken, recName ?? 'login topilmadi');
    if (recToken) {
        await assertDenied('registrator', recToken, DENIED_FOR_RECEPTIONIST);

        // Ruxsat etilgani ISHLASHI ham shart — aks holda cheklov ish oqimini buzadi.
        const allowed = await call('GET', '/patients', undefined, recToken);
        ok('registrator bemorlar ro\'yxatini ko\'ra oladi', allowed.status === 200, `status: ${allowed.status}`);
        const cash = await call('POST', '/cash-register/open', { openingCash: 0 }, recToken);
        ok('registrator kassa ocha oladi (403 emas)', cash.status !== 403, `status: ${cash.status}`);
    }

    console.log('\n═══ 2. SHIFOKOR ═══════════════════════════════════');
    const docToken = docName ? await login(docName) : null;
    ok('shifokor kirdi', !!docToken, docName ?? 'login topilmadi');
    if (docToken) {
        await assertDenied('shifokor', docToken, DENIED_FOR_DOCTOR);
        const allowed = await call('GET', '/patients', undefined, docToken);
        ok('shifokor bemorlar ro\'yxatini ko\'ra oladi', allowed.status === 200, `status: ${allowed.status}`);
    }

    console.log('\n═══ 3. HAMSHIRA ═══════════════════════════════════');
    const nurseToken = nurseName ? await login(nurseName) : null;
    ok('hamshira kirdi', !!nurseToken, nurseName ?? 'login topilmadi');
    if (nurseToken) {
        await assertDenied('hamshira', nurseToken, DENIED_FOR_NURSE);
        const vitals = await call('POST', '/vitals', { patientId: 'yoq', measurements: [] }, nurseToken);
        ok('hamshira ko\'rsatkich kiritishga haqli (403 emas)', vitals.status !== 403, `status: ${vitals.status}`);

        /* Pul hisobotlari: ilgari faqat kirish tekshirilardi va hamshira
           tushum, qarz va qarzdorlar ro'yxatini o'qiy olardi. */
        for (const path of ['/reports/dashboard', '/reports/debtors', '/reports/attendance']) {
            const r = await call('GET', path, undefined, nurseToken);
            ok(`hamshira ${path} ni o'qiy olmaydi`,
                r.status === 403 && r.data?.code === 'FINANCE_HIDDEN', `status: ${r.status}, code: ${r.data?.code}`);
        }
        /* Snapshot — bemor sonlari kerak (Bemorlar sahifasi), pul emas. */
        const snap = await call('GET', '/reports/snapshot', undefined, nurseToken);
        ok('hamshira snapshot dan bemor sonini oladi', snap.status === 200 && typeof snap.data?.patients?.total === 'number',
            `status: ${snap.status}`);
        ok('hamshira snapshot da pul ko\'rmaydi', snap.data?.debt === null && snap.data?.period === null,
            JSON.stringify({ debt: snap.data?.debt, period: snap.data?.period }).slice(0, 120));
    }
    const adminSnap = await call('GET', '/reports/snapshot', undefined, admin);
    ok('ega snapshot da pulni ko\'radi', typeof adminSnap.data?.debt?.amount === 'number', `status: ${adminSnap.status}`);

    console.log('\n═══ 3a. RUXSATLAR SOZLAMASI SHAKLI ═════════════════');
    /* Tana tekshiruvsiz saqlanardi. Endi faqat to'rt rol va uchta maydon. */
    const clinicId = (await call('GET', '/clinics', undefined, admin)).data?.[0]?.id;
    if (clinicId) {
        const before = await call('GET', `/clinics/${clinicId}`, undefined, admin);
        const prev = before.data?.accessControl ?? null;
        const restore = typeof prev === 'string' ? JSON.parse(prev) : prev;
        try {
            const put = await call('PUT', `/clinics/${clinicId}/access-control`, {
                accessControl: {
                    doctor: { hiddenModules: ['calendar', '<script>', 7], showFinance: false, extra: 'x' },
                    hacker: { showFinance: true },
                },
            }, admin);
            const saved = typeof put.data?.clinic?.accessControl === 'string'
                ? JSON.parse(put.data.clinic.accessControl) : put.data?.clinic?.accessControl;
            ok('ruxsatlar saqlandi', put.status === 200, `status: ${put.status}`);
            ok('notanish rol tashlandi', saved && !('hacker' in saved), JSON.stringify(saved));
            ok('yashirilgan modul ruxsatlarga o\'tdi (Kalendar yopiq)', saved?.doctor?.perms?.calendar?.on === false,
                JSON.stringify(saved?.doctor?.perms?.calendar));
            ok('noto\'g\'ri modul nomi tashlandi', !JSON.stringify(saved).includes('<script>'), '');
            ok('ortiqcha maydon tashlandi', saved?.doctor && !('extra' in saved.doctor));

            /* Buzuq tana cheklovlarni jimgina o'chirmasin */
            const bad = await call('PUT', `/clinics/${clinicId}/access-control`, { accessControl: 'hammasi' }, admin);
            ok('buzuq ruxsat tanasi rad etildi (400)', bad.status === 400, `status: ${bad.status}`);
            const still = await call('GET', `/clinics/${clinicId}`, undefined, admin);
            const stillAc = typeof still.data?.accessControl === 'string' ? JSON.parse(still.data.accessControl) : still.data?.accessControl;
            ok('rad etilgandan keyin cheklov joyida', stillAc?.doctor?.showFinance === false, JSON.stringify(stillAc));

            /* ─── OCHIB BERISH SERVERDA HAM ISHLAYDI ─────────────────────
               Shifokorga Sozlamalar (xizmat toifasi yaratish — registrator
               ishi), hamshiraga pul ko'rsatkichlari. */
            if (docToken && nurseToken) {
                const name = `Sinov toifa ${Date.now()}`;
                const denied = await call('POST', '/categories', { name }, docToken);
                ok('ochib berilmaguncha shifokor toifa yarata olmaydi', denied.status === 403, `status: ${denied.status}`);
                const nurseDash0 = await call('GET', '/reports/dashboard', undefined, nurseToken);
                ok('ochib berilmaguncha hamshira tushumni ko\'rmaydi', nurseDash0.status === 403, `status: ${nurseDash0.status}`);

                /* Yangi shakl: har rolda `perms` (Xodimlar → Ruxsatlar). Shifokorga
                   Sozlamalar «O'zgartiradi» (o'chirishsiz), Xodimlar (shifokorda
                   bunday bo'lim yo'q) va noma'lum bo'lim; hamshiraga — summalar. */
                const grant = await call('PUT', `/clinics/${clinicId}/access-control`, {
                    accessControl: {
                        doctor: { perms: { settings: { on: true, cells: { services: 'vce' } }, staff: { on: true }, yoq: { on: true } } },
                        nurse: { perms: { money: { sp: { amounts: true } } } },
                    },
                }, admin);
                const g = typeof grant.data?.clinic?.accessControl === 'string'
                    ? JSON.parse(grant.data.clinic.accessControl) : grant.data?.clinic?.accessControl;
                ok('Sozlamalar shifokorga ochildi', g?.doctor?.perms?.settings?.on === true, JSON.stringify(g?.doctor?.perms?.settings));
                ok('Xodimlar va noma\'lum bo\'lim ochilmaydi', !g?.doctor?.perms?.staff && !g?.doctor?.perms?.yoq,
                    Object.keys(g?.doctor?.perms || {}).join(','));
                ok('eski bayroqni server o\'zi hisobladi', g?.nurse?.showFinance === true && !g?.doctor?.hiddenModules?.includes('settings'),
                    JSON.stringify({ nurse: g?.nurse?.showFinance, docHidden: g?.doctor?.hiddenModules }));

                const allowed = await call('POST', '/categories', { name }, docToken);
                ok('Sozlamalar ochib berilgach shifokor toifa yaratadi', allowed.status === 200, `status: ${allowed.status}`);
                if (allowed.data?.id) await call('DELETE', `/categories/${allowed.data.id}`, undefined, admin);
                const stillOwnerOnly = await call('DELETE', '/categories/yoq', undefined, docToken);
                ok('o\'chirish berilmagan — shifokor toifani o\'chira olmaydi', stillOwnerOnly.status === 403, `status: ${stillOwnerOnly.status}`);

                const staffWrite = await call('POST', '/doctors', { firstName: 'X', lastName: 'Y' }, docToken);
                ok('shifokor xodim qo\'sha olmaydi', staffWrite.status === 403, `status: ${staffWrite.status}`);

                const nurseDash = await call('GET', '/reports/dashboard', undefined, nurseToken);
                ok('pul ochib berilgach hamshira tushumni ko\'radi', nurseDash.status === 200, `status: ${nurseDash.status}`);

                /* Olib qo'yish ham ishlaydi: registratordan bemor qo'shishni olamiz.
                   (Bu PUT butun sozlamani almashtiradi — shuning uchun oxirida.) */
                const recTok = recName ? await login(recName) : null;
                if (recTok) {
                    await call('PUT', `/clinics/${clinicId}/access-control`, {
                        accessControl: { receptionist: { perms: { patients: { on: true, cells: { card: 'v' } } } } },
                    }, admin);
                    const recAdd = await call('POST', '/patients', { firstName: 'Sinov', lastName: 'Ruxsat', phone: '+998901112299' }, recTok);
                    ok('bemor qo\'shish olib qo\'yilgach registrator qo\'sha olmaydi', recAdd.status === 403, `status: ${recAdd.status}`);
                }
            }

        } finally {
            await call('PUT', `/clinics/${clinicId}/access-control`, { accessControl: restore }, admin);
        }
    } else {
        ok('klinika topildi', false, 'GET /clinics bo\'sh');
    }

    console.log('\n═══ 4. JADVALDA YO\'Q MARSHRUT ═════════════════════');
    /* Mavjud bo'lmagan yozuv marshruti: jadvalda qoidasi yo'q, ya'ni
       "sukut bo'yicha rad etish" ishlashi kerak. Ega bo'lsa ham. */
    const unlisted = await call('POST', '/bunday-marshrut-yoq', {}, admin);
    ok('jadvalda yo\'q yozuv amali egaga ham ochilmaydi',
        unlisted.status === 403 || unlisted.status === 404,
        `status: ${unlisted.status}`);

    console.log('\n═══ 5. O\'CHIRISH JURNALI (S1.4) ═══════════════════');
    /* Jurnalda `action='Delete'` yozuvlari soni 0 edi: 35 ta o'chirish
       marshruti bor, lekin hech biri jurnalga yozmasdi. */
    const lead = await call('POST', '/leads', { name: 'Sinov O\'chirish', phone: '+998900000199' }, admin);
    ok('sinov lidi yaratildi', lead.status === 200 || lead.status === 201, `status: ${lead.status}`);
    const leadId = lead.data?.id;

    if (leadId) {
        const before = await call('GET', '/access-log?action=Delete&limit=200', undefined, admin);
        const countOf = (r: any) => (Array.isArray(r.data) ? r.data : (r.data?.items ?? []))
            .filter((x: any) => x?.action === 'Delete').length;
        const n0 = countOf(before);

        const del = await call('DELETE', `/leads/${leadId}`, undefined, admin);
        ok('lid o\'chirildi', del.status === 200 || del.status === 204, `status: ${del.status}`);

        // `res.on('finish')` javobdan keyin yozadi — yozilishini kutamiz.
        await new Promise(r => setTimeout(r, 400));

        const after = await call('GET', '/access-log?action=Delete&limit=200', undefined, admin);
        const rows = (Array.isArray(after.data) ? after.data : (after.data?.items ?? []))
            .filter((x: any) => x?.action === 'Delete');
        ok('o\'chirish jurnalga tushdi', rows.length > n0, `oldin ${n0}, keyin ${rows.length}`);

        const mine = rows.find((x: any) => x.entityId === leadId);
        ok('jurnalda o\'chirilgan yozuvning turi va ID\'si bor',
            !!mine && mine.entityType === 'Lead',
            mine ? `entityType: ${mine.entityType}` : 'yozuv topilmadi');
        ok('jurnalda kim o\'chirgani yozilgan', !!mine?.userRole, mine ? `rol: ${mine.userRole}` : '');
    }

    console.log('\n═══ 6. TOKEN SAQLASH (S1.3) ═══════════════════════');
    /* Login javobida kirish tokeni TANADA, yangilash tokeni esa faqat
       `httpOnly` cookie'da bo'lishi kerak. */
    const raw = await fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'testpass123' }),
    });
    const setCookie = raw.headers.get('set-cookie') || '';
    const body = await raw.json();

    ok('login yangilash cookie\'sini qo\'ydi', setCookie.includes('xclinic_refresh='), setCookie.slice(0, 60));
    ok('cookie httpOnly', /httponly/i.test(setCookie));
    ok('cookie SameSite=Strict', /samesite=strict/i.test(setCookie));
    ok('kirish tokeni javob tanasida', !!body?.token);

    // Kirish tokeni qisqa muddatli bo'lishi shart — bu S1.3 ning asosiy foydasi.
    const payload = body?.token
        ? JSON.parse(Buffer.from(String(body.token).split('.')[1], 'base64').toString())
        : {};
    const ttlMin = payload.exp && payload.iat ? Math.round((payload.exp - payload.iat) / 60) : -1;
    ok('kirish tokeni 30 daqiqalik (30 kunlik emas)', ttlMin > 0 && ttlMin <= 60, `${ttlMin} daqiqa`);
    ok('kirish tokeni typ=access', payload.typ === 'access', String(payload.typ));

    /* Yangilash tokenini kirish tokeni sifatida ishlatib bo'lmaydi.
       Ikkalasi bir sir bilan imzolangani uchun bu tekshiruv bo'lmasa,
       cookie'dan olingan 30 kunlik token oddiy token bo'lib ishlab ketardi. */
    const cookieToken = /xclinic_refresh=([^;]+)/.exec(setCookie)?.[1];
    if (cookieToken) {
        const misuse = await call('GET', '/patients', undefined, decodeURIComponent(cookieToken));
        ok('yangilash tokeni bilan API ga kirib bo\'lmaydi', misuse.status === 401, `status: ${misuse.status}`);
    } else {
        ok('yangilash tokeni cookie\'dan o\'qildi', false, 'cookie topilmadi');
    }

    // Cookie bilan yangilash ishlaydi — sahifa yangilangandan keyin sessiya tiklanadi.
    const refreshed = await fetch(BASE + '/api/auth/refresh', {
        method: 'POST',
        headers: { Cookie: `xclinic_refresh=${cookieToken}` },
    });
    const rBody = await refreshed.json().catch(() => ({}));
    ok('cookie orqali yangi kirish tokeni olindi', refreshed.status === 200 && !!rBody?.token,
        `status: ${refreshed.status}`);
    ok('yangilangan tokenda rol saqlanib qoldi', rBody?.role === 'CLINIC_ADMIN', String(rBody?.role));

    // Cookie'siz yangilash — 401.
    const noCookie = await fetch(BASE + '/api/auth/refresh', { method: 'POST' });
    ok('cookie\'siz yangilash rad etildi', noCookie.status === 401, `status: ${noCookie.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
