/* INTERNET MANZILLARI — DOIMIY VA ZAXIRA.

   ASOSIY SAVOL: masofaviy kirish yoqilganda Sozlamalar IKKALA manzilni
   ko'radimi, zaxira manzildan kirish ishlaydimi va o'chirilganda ikkalasi
   ham yo'qoladimi?

   Nega API darajasida. Birlik sinovi (`tests/tunnelAddresses.test.ts`)
   funksiyani tekshiradi, bu esa SERVERNI: marshrut o'sha funksiyani
   to'g'ri bayroq bilan chaqiradimi va CORS zaxira manzilni taniydimi.
   CORS aynan bir marta sindirgan joy: tunnel ochilardi, sahifa ko'rinardi,
   lekin kirish «Tizimga kirishda xatolik» berardi (`server.ts`,
   `activeTunnelOrigins`).

   Tunnel ko'tarilmaydi — Electron qiladigan ishni sinov qo'lda qiladi:
   manzil fayllarini sinov serverining papkasiga yozadi.

   Ishga tushirish: cd backend && npm run test:api
*/
import fs from 'fs';
import path from 'path';

const BASE = process.env.T_BASE || 'http://localhost:3079';
/* Sinov serverining userData papkasi — baza nusxasi ham shu yerda. */
const USER_DATA = process.env.T_DB ? path.dirname(process.env.T_DB) : '';

const STABLE = 'https://k-0000000000.xclinic.org';
const QUICK = 'https://sinov-zaxira-manzil.trycloudflare.com';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(method: string, p: string, body?: any, token?: string, origin?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    const r = await fetch(BASE + '/api' + p, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data, allowOrigin: r.headers.get('access-control-allow-origin') };
}

const writeAddresses = () => {
    fs.writeFileSync(path.join(USER_DATA, 'cf-tunnel.json'), JSON.stringify({ url: STABLE }), 'utf8');
    fs.writeFileSync(path.join(USER_DATA, 'cf-quick-tunnel.json'), JSON.stringify({ url: QUICK }), 'utf8');
};

async function main() {
    ok('sinov serverining papkasi ma\'lum', !!USER_DATA && fs.existsSync(USER_DATA), `T_DB: ${process.env.T_DB}`);
    if (!USER_DATA) return finish();

    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 1. YOQILGAN — IKKALA MANZIL ═══════════════════');
    const on = await call('PUT', '/admin/remote-access', { enabled: true }, token);
    ok('yoqildi', on.status === 200 && on.data?.enabled === true, `status: ${on.status}`);
    ok('qayta ishga tushirish shart emas', on.data?.restartRequired === false,
        `restartRequired: ${on.data?.restartRequired}`);

    writeAddresses();
    const info = await call('GET', '/network-info');
    ok('doimiy manzil qaytdi', info.data?.stableUrl === STABLE, `stableUrl: ${info.data?.stableUrl}`);
    ok('zaxira manzil ALOHIDA qaytdi', info.data?.quickUrl === QUICK, `quickUrl: ${info.data?.quickUrl}`);
    ok('eski `tunnelUrl` maydoni — doimiysi', info.data?.tunnelUrl === STABLE, `tunnelUrl: ${info.data?.tunnelUrl}`);

    console.log('\n═══ 2. ZAXIRA MANZILDAN KIRISH (CORS) ════════════');
    /* Brauzer POST da `Origin` yuboradi — kirish aynan shu yerda
       yiqilardi. */
    const viaQuick = await call('POST', '/auth/login',
        { username: 'admin', password: 'testpass123' }, undefined, QUICK);
    ok('zaxira manzildan kirish o\'tdi', viaQuick.status === 200 && !!viaQuick.data?.token,
        `status: ${viaQuick.status}`);
    ok('javobda zaxira manzilga ruxsat bor', viaQuick.allowOrigin === QUICK,
        `allow-origin: ${viaQuick.allowOrigin}`);

    const lookalike = await call('GET', '/network-info', undefined, undefined,
        'https://boshqa-manzil.trycloudflare.com');
    ok('begona trycloudflare manzili ruxsat olmaydi', lookalike.allowOrigin !== 'https://boshqa-manzil.trycloudflare.com',
        `status: ${lookalike.status}, allow-origin: ${lookalike.allowOrigin}`);

    console.log('\n═══ 3. O\'CHIRILGAN — HECH QANDAY MANZIL ══════════');
    const off = await call('PUT', '/admin/remote-access', { enabled: false }, token);
    ok('o\'chirildi', off.status === 200 && off.data?.enabled === false, `status: ${off.status}`);
    const afterOff = await call('GET', '/network-info');
    ok('ikkala manzil ham yo\'q', afterOff.data?.stableUrl === null && afterOff.data?.quickUrl === null
        && afterOff.data?.tunnelUrl === null,
        `stable: ${afterOff.data?.stableUrl}, quick: ${afterOff.data?.quickUrl}, tunnel: ${afterOff.data?.tunnelUrl}`);

    /* Electron tunnelni 30 soniya ichida yopadi — shu orada fayl yana
       paydo bo'lsa ham (yoki eski o'rnatmadan qolgan bo'lsa ham) o'chiq
       holatda manzil KO'RSATILMAYDI. */
    writeAddresses();
    const stale = await call('GET', '/network-info');
    ok('qolib ketgan fayl o\'chiq holatda ko\'rsatilmaydi', stale.data?.stableUrl === null && stale.data?.quickUrl === null,
        `stable: ${stale.data?.stableUrl}, quick: ${stale.data?.quickUrl}`);

    for (const f of ['cf-tunnel.json', 'cf-quick-tunnel.json']) {
        try { fs.unlinkSync(path.join(USER_DATA, f)); } catch { /* yo'q */ }
    }
    return finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
