/* S2.5 sinovi: MUDDATI O'TGAN PARTIYA.

   ASOSIY SAVOL: muddati o'tgan dorini sarflab bo'ladimi?

   Audit topgan holat (B-25): «Partiya va muddat» tabida 13 ta partiya
   «MUDDATI O'TGAN» deb turardi, «Qoldiqlar» tabida esa shu mahsulotlarda
   hech qanday belgi yo'q edi va sarflashga to'siq ham yo'q edi.

   ENG YOMONI kodda edi: chiqim FEFO tartibida ishlardi — «muddati eng
   yaqini birinchi». Mantiq to'g'ri, oqibati teskari: muddati ALLAQACHON
   o'tgan partiya ro'yxatning eng boshida turardi, ya'ni tizim yaroqsiz
   dorini BIRINCHI NAVBATDA sarflardi.

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

const shiftDays = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
};

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 1. TAYYORGARLIK ═══════════════════════════════');
    const item = await call('POST', '/inventory', {
        name: `Sinov dori ${Date.now()}`, unit: 'dona',
        quantity: 0, minQuantity: 0, isMedication: true, isConsumable: true,
    }, token);
    const itemId = item.data?.id;
    ok('sinov mahsuloti yaratildi', !!itemId, `status: ${item.status}`);
    if (!itemId) return finish();

    // Muddati O'TGAN partiya — 10 kun oldin tugagan
    const badBatch = await call('POST', `/inventory/${itemId}/batches`, {
        batchNumber: 'ESKI-001', expiryDate: shiftDays(-10), quantity: 100, cost: 1000,
    }, token);
    ok("muddati o'tgan partiya kiritildi (100 dona)", badBatch.status === 200, `status: ${badBatch.status}`);

    console.log('\n═══ 2. SARFLASHGA TO\'SIQ ══════════════════════════');
    /* Faqat muddati o'tgan qoldiq bor — chiqim RAD ETILISHI kerak.
       Ilgari bu so'rov muvaffaqiyat qaytarardi va aynan shu partiyadan
       yechardi. */
    const blocked = await call('POST', '/stock-movements/out', {
        itemId, quantity: 5, reason: 'Manual',
    }, token);
    ok('chiqim RAD ETILDI', blocked.status === 409, `status: ${blocked.status}`);
    ok('xato kodi EXPIRED_STOCK_BLOCKED',
        blocked.data?.code === 'EXPIRED_STOCK_BLOCKED', String(blocked.data?.code));
    ok("javobda muddati o'tgan partiya ko'rsatilgan",
        (blocked.data?.expired || []).some((b: any) => b.batchNumber === 'ESKI-001'),
        JSON.stringify(blocked.data?.expired || []).slice(0, 80));
    ok('yaroqli qoldiq 0 deb ko\'rsatildi', blocked.data?.usable === 0, String(blocked.data?.usable));

    console.log('\n═══ 3. YAROQLI PARTIYA QO\'SHILSA — O\'TADI ═════════');
    const goodBatch = await call('POST', `/inventory/${itemId}/batches`, {
        batchNumber: 'YANGI-001', expiryDate: shiftDays(180), quantity: 20, cost: 1200,
    }, token);
    ok('yaroqli partiya kiritildi (20 dona)', goodBatch.status === 200, `status: ${goodBatch.status}`);

    const passed = await call('POST', '/stock-movements/out', {
        itemId, quantity: 5, reason: 'Manual',
    }, token);
    ok('chiqim endi o\'tdi', passed.status === 200, `status: ${passed.status}`);

    /* ENG MUHIM TEKSHIRUV: chiqim qaysi partiyadan bo'ldi.
       Eski FEFO muddati o'tganini birinchi olardi. */
    const batches = await call('GET', `/inventory/${itemId}/batches`, undefined, token);
    const bad = (batches.data || []).find((b: any) => b.batchNumber === 'ESKI-001');
    const good = (batches.data || []).find((b: any) => b.batchNumber === 'YANGI-001');
    ok("muddati o'tgan partiyaga TEGILMADI (100 qoldi)", bad?.quantity === 100, String(bad?.quantity));
    ok('yaroqli partiyadan yechildi (20 → 15)', good?.quantity === 15, String(good?.quantity));

    console.log('\n═══ 4. YAROQLI QOLDIQ YETMASA ═════════════════════');
    /* Yaroqlisi 15 ta, 50 ta so'raladi. Muddati o'tganidan to'ldirib
       yubormasligi kerak. */
    const short = await call('POST', '/stock-movements/out', {
        itemId, quantity: 50, reason: 'Manual',
    }, token);
    ok('yetmaganda ham rad etildi', short.status === 409, `status: ${short.status}`);
    ok('yaroqli qoldiq to\'g\'ri ko\'rsatildi (15)', short.data?.usable === 15, String(short.data?.usable));

    console.log('\n═══ 5. FORCE — TAQIQ EMAS, TANLOV ═════════════════');
    const forced = await call('POST', '/stock-movements/out', {
        itemId, quantity: 50, reason: 'Manual', note: 'sinov', force: true,
    }, token);
    ok('force bilan sarflandi', forced.status === 200, `status: ${forced.status}`);

    console.log('\n═══ 6. QOLDIQLAR RO\'YXATIDA BELGI ═════════════════');
    /* Ilgari muddat faqat «Partiya va muddat» tabida ko'rinardi —
       asosiy ro'yxatga qarab ishlayotgan odam bilmasdi. */
    const list = await call('GET', '/inventory', undefined, token);
    const row = (list.data || []).find((i: any) => i.id === itemId);
    ok('mahsulot ro\'yxatda topildi', !!row);
    ok("ro'yxatda muddati o'tgan qoldiq ko'rsatilgan",
        typeof row?.expiredQuantity === 'number' && row.expiredQuantity > 0,
        String(row?.expiredQuantity));
    ok('eng yaqin yaroqli muddat ham qaytadi',
        typeof row?.nextExpiry === 'string' || row?.nextExpiry === null,
        String(row?.nextExpiry));

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
