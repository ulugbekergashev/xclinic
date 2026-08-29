/* 7.6 sinovi: kirish xavfsizligi.

   ASOSIY SAVOL: standart parolni bilgan odam interfeysni CHETLAB O'TIB
   ma'lumotga yeta oladimi? Tekshiruv aynan shuni "faqat UI bezagi" deb
   tanqid qilgan edi.

   Ishga tushirish: cd backend && npx ts-node --transpile-only _t_auth.ts
*/
const BASE = process.env.T_BASE || 'http://localhost:3092';

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
            // Soxtalashtirishga urinish: har so'rovda boshqa IP
            'X-Forwarded-For': `10.0.0.${Math.floor(Math.random() * 250) + 1}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

const login = (username: string, password: string) =>
    call('POST', '/auth/login', { username, password });

async function main() {
    console.log('\n═══ 1. STANDART PAROL — CHEKLANGAN TOKEN ══════════');
    const first = await login('admin', 'admin');
    ok('standart parol bilan kirish o\'tdi', first.status === 200, `status: ${first.status}`);
    ok('server mustChangePassword bayrog\'ini qaytardi',
        first.data?.mustChangePassword === true, `${JSON.stringify(first.data).slice(0, 120)}`);
    const limited = first.data?.token;
    ok('token berildi', !!limited);

    console.log('\n   ── curl bilan chetlab o\'tishga urinish ──');
    const attempts: [string, string][] = [
        ['GET', '/patients'], ['GET', '/transactions'], ['GET', '/charges'],
        ['GET', '/admin/integrity'], ['GET', '/inventory'], ['GET', '/visits'],
    ];
    let blocked = 0;
    for (const [m, p] of attempts) {
        const r = await call(m, p, undefined, limited);
        if (r.status === 403 && r.data?.code === 'MUST_CHANGE_PASSWORD') blocked++;
        else console.log(`     ✗ ${m} ${p} → ${r.status} ${JSON.stringify(r.data).slice(0, 70)}`);
    }
    ok(`CHEKLANGAN TOKEN hamma endpointda rad etildi (${blocked}/${attempts.length})`,
        blocked === attempts.length);

    // Ma'lumot yozishga urinish ham to'silsin
    const write = await call('POST', '/patients',
        { firstName: 'Yomon', lastName: 'Niyat', phone: '+998900000009', gender: 'Male' }, limited);
    ok('yozishga urinish ham rad etildi', write.status === 403, `status: ${write.status}`);

    console.log('\n═══ 2. PAROL ALMASHTIRISH ═════════════════════════');
    const weak = await call('POST', '/auth/change-password',
        { currentPassword: 'admin', newPassword: 'qisqa' }, limited);
    ok('qisqa parol rad etildi', weak.status === 400, `status: ${weak.status}`);

    const same = await call('POST', '/auth/change-password',
        { currentPassword: 'admin', newPassword: 'admin' }, limited);
    ok('standart parolni qayta qo\'yish rad etildi', same.status === 400, `status: ${same.status}`);

    const wrongCur = await call('POST', '/auth/change-password',
        { currentPassword: 'notmypassword', newPassword: 'YangiParol2026' }, limited);
    ok('noto\'g\'ri joriy parol rad etildi', wrongCur.status === 401, `status: ${wrongCur.status}`);

    const changed = await call('POST', '/auth/change-password',
        { currentPassword: 'admin', newPassword: 'YangiParol2026' }, limited);
    ok('parol almashtirildi', changed.status === 200, `status: ${changed.status}`);
    const full = changed.data?.token;
    ok('TO\'LIQ token qaytarildi', !!full);

    const nowWorks = await call('GET', '/patients', undefined, full);
    ok('yangi token bilan ma\'lumot ochildi', nowWorks.status === 200, `status: ${nowWorks.status}`);

    console.log('\n═══ 3. YANGI PAROL BILAN KIRISH ═══════════════════');
    const relog = await login('admin', 'YangiParol2026');
    ok('yangi parol ishlaydi', relog.status === 200);
    ok('endi mustChangePassword YO\'Q', relog.data?.mustChangePassword !== true,
        `${relog.data?.mustChangePassword}`);
    const okToken = relog.data?.token;
    ok('to\'liq token bilan hamma joy ochiq',
        (await call('GET', '/patients', undefined, okToken)).status === 200);
    ok('eski standart parol endi ishlamaydi', (await login('admin', 'admin')).status === 401);

    console.log('\n═══ 4. BRUTE-FORCE CHEKLOVI ═══════════════════════');
    /* DIQQAT: har so'rovda BOSHQA X-Forwarded-For yuborilmoqda. Agar cheklov
       o'sha sarlavha bo'yicha kalit qurganda edi, hujumchi cheksiz yangi
       hisoblagich olib, cheklovni butunlay chetlab o'tardi. */
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) {
        codes.push((await login('admin', `xato-parol-${i}`)).status);
    }
    const blockedAt = codes.findIndex((c) => c === 429);
    ok('bir necha xato urinishdan keyin 429 keldi', blockedAt >= 0,
        `kodlar: ${codes.join(',')}`);
    ok('cheklov X-Forwarded-For soxtalashtirilishiga qaramay ishladi', blockedAt >= 0 && blockedAt <= 6,
        `birinchi 429: ${blockedAt}-urinishda`);

    const rightNow = await login('admin', 'YangiParol2026');
    ok('bloklangan holatda TO\'G\'RI parol ham o\'tmaydi', rightNow.status === 429,
        `status: ${rightNow.status}`);

    console.log('\n═══ 5. MASOFAVIY KIRISH ═══════════════════════════');
    // Bloklovni chetlab o'tish uchun boshqa login orqali token olamiz emas —
    // avvalgi to'liq tokendan foydalanamiz
    const ra = await call('GET', '/admin/remote-access', undefined, okToken);
    ok('holat o\'qildi', ra.status === 200, `status: ${ra.status}`);
    ok('sukut bo\'yicha O\'CHIQ', ra.data?.enabled === false, `enabled: ${ra.data?.enabled}`);
    ok('standart parol endi ishlatilmayapti', ra.data?.defaultPasswordInUse === false);

    const onOk = await call('PUT', '/admin/remote-access', { enabled: true }, okToken);
    ok('parol almashtirilgach yoqish mumkin', onOk.status === 200, `status: ${onOk.status}`);
    const offOk = await call('PUT', '/admin/remote-access', { enabled: false }, okToken);
    ok('qayta o\'chirish mumkin', offOk.status === 200 && offOk.data?.enabled === false);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
