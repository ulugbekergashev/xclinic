/* OLDINDAN BOSILGAN BLANKA sozlamasi sinovi (2026-11-26).

   ASOSIY SAVOLLAR:
     1. Sozlamalar → Umumiy: chekkalar (mm) va «shapka oldindan bosilgan»
        saqlanadimi va klinikani o'qiganda qaytadimi?
     2. Chegaradan tashqari qiymat (500 mm, manfiy) chegaraga tortiladimi;
        bo'sh qiymat — NULL (odatiy chekka)?
     3. Boshqa maydonlarni saqlash chekkalarga tegmaydimi?

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
    const clinicId = login.data?.user?.clinicId
        || (await call('GET', '/clinics', undefined, token)).data?.[0]?.id;
    ok('ega kirdi', !!token && !!clinicId);
    if (!token || !clinicId) return finish();
    const api = (m: string, p: string, b?: any) => call(m, p, b, token);
    const read = async () => (await api('GET', `/clinics/${clinicId}`)).data || {};

    const before = await read();
    try {
        console.log('\n═══ 1. SAQLASH VA O\'QISH ═══════════════════════════');
        const put = await api('PUT', `/clinics/${clinicId}/general`, {
            printTopMm: 55, printBottomMm: 30, printSideMm: 18, printHideHeader: true,
        });
        ok('saqlandi — 200', put.status === 200, `status ${put.status}: ${JSON.stringify(put.data).slice(0, 120)}`);
        const c1 = await read();
        ok('chekkalar qaytdi (55/30/18)', c1.printTopMm === 55 && c1.printBottomMm === 30 && c1.printSideMm === 18,
            JSON.stringify({ t: c1.printTopMm, b: c1.printBottomMm, s: c1.printSideMm }));
        ok('«shapka oldindan bosilgan» yoqildi', c1.printHideHeader === true);

        console.log('\n═══ 2. CHEGARA VA BO\'SH QIYMAT ══════════════════════');
        await api('PUT', `/clinics/${clinicId}/general`, { printTopMm: 500, printBottomMm: -7, printSideMm: '' });
        const c2 = await read();
        ok('500 mm → 80 mm', c2.printTopMm === 80, String(c2.printTopMm));
        ok('manfiy → 0', c2.printBottomMm === 0, String(c2.printBottomMm));
        ok('bo\'sh → NULL (odatiy chekka)', c2.printSideMm === null, String(c2.printSideMm));
        ok('yuborilmagan bayroq o\'zgarmadi', c2.printHideHeader === true);

        console.log('\n═══ 3. BOSHQA MAYDON CHEKKAGA TEGMAYDI ═══════════════');
        await api('PUT', `/clinics/${clinicId}/general`, { letterheadNote: 'Sinov izohi' });
        const c3 = await read();
        ok('izoh saqlandi, chekkalar joyida', c3.letterheadNote === 'Sinov izohi' && c3.printTopMm === 80 && c3.printBottomMm === 0);

        const anon = await call('PUT', `/clinics/${clinicId}/general`, { printTopMm: 10 });
        ok('kirmagan foydalanuvchi — 401/403', anon.status === 401 || anon.status === 403, `status ${anon.status}`);
    } finally {
        await api('PUT', `/clinics/${clinicId}/general`, {
            printTopMm: before.printTopMm ?? null,
            printBottomMm: before.printBottomMm ?? null,
            printSideMm: before.printSideMm ?? null,
            printHideHeader: !!before.printHideHeader,
            letterheadNote: before.letterheadNote ?? '',
        });
    }
    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
