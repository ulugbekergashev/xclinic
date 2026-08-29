/* AKTIVATSIYA sinovi — `/api/license/*`.
 *
 * NIMA UCHUN MUHIM. Yangi o'rnatmada baza bo'sh bo'ladi va bu marshrutlar
 * yagona kirish yo'li: ular ishlamasa xaridor dasturni o'rnatib, ochib,
 * ichkariga kira olmaydi. Bu mahsulotni sotishga to'sqinlik qiladigan
 * asosiy nuqta edi.
 *
 * Bu yerdagi sinovlar TO'LDIRILGAN bazaga qarshi ishlaydi (sinov jgurnali
 * haqiqiy bazaning nusxasini oladi), shuning uchun ular quyidagilarni
 * tekshiradi:
 *   · holat so'rovi mashina identifikatorini beradi
 *   · klinika mavjud bo'lganda sozlash TAKRORLANMAYDI
 *   · noto'g'ri kalit rad etiladi
 *   · kalit hisoblash barqaror va tiklash kaliti undan FARQ qiladi
 *
 * Bo'sh bazadagi to'liq oqim (sozlash -> kirish) qo'lda tekshirilgan;
 * uni bu yerda takrorlash uchun alohida server va bo'sh baza kerak.
 *
 * Ishga tushirish: cd backend && npm run test:api
 */
const BASE = process.env.T_BASE || 'http://localhost:3079';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(method: string, path: string, body?: any) {
    const r = await fetch(BASE + '/api' + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 160) }; }
    return { status: r.status, data };
}

async function main() {
    console.log('\n═══ 1. HOLAT SO\'ROVI ═══════════════════════════════');

    const st = await call('GET', '/license/status');
    ok('holat 200 qaytardi', st.status === 200, `status ${st.status}`);
    ok('mashina identifikatori bor', typeof st.data?.machineId === 'string' && st.data.machineId.length > 4,
        String(st.data?.machineId));
    ok('qisqartirilgan ko\'rinish ham bor', typeof st.data?.displayId === 'string');
    ok('klinika mavjudligi aytiladi', typeof st.data?.clinicExists === 'boolean');
    ok('aktivligi aytiladi', typeof st.data?.activated === 'boolean');

    /* Holat AVTORIZATSIYASIZ ochiq bo'lishi shart — u aynan tizimga
       kirib bo'lmaydigan holat uchun. */
    ok('holat token talab qilmaydi', st.status !== 401 && st.status !== 403);

    console.log('\n═══ 2. NOTO\'G\'RI KALIT RAD ETILADI ═════════════════');

    const bad = await call('POST', '/license/activate', { key: 'YOLGON-KALIT-12345678' });
    ok('noto\'g\'ri kalit bilan aktivatsiya rad etildi', bad.status === 400,
        `status ${bad.status}`);

    const empty = await call('POST', '/license/activate', {});
    ok('kalitsiz so\'rov rad etildi', empty.status === 400, `status ${empty.status}`);

    console.log('\n═══ 3. SOZLASH TAKRORLANMAYDI ══════════════════════');

    /* Bu sinov bazasida klinika BOR. Sozlash marshruti uni qayta yozib,
       ikkinchi admin yaratish yo'liga aylanmasligi kerak — aks holda
       tarmoqqa ulangan har kim yangi admin ochib olardi. */
    const dup = await call('POST', '/license/setup', {
        clinicName: 'Ikkinchi klinika',
        username: 'boshqa_admin',
        password: 'parol12345',
        key: 'HARQANDAY',
    });
    ok('mavjud klinika ustidan sozlash bloklandi', dup.status === 400 || dup.status === 409,
        `status ${dup.status}`);
    if (st.data?.clinicExists) {
        ok('sabab tushunarli aytilgan', typeof dup.data?.error === 'string' && dup.data.error.length > 5,
            JSON.stringify(dup.data).slice(0, 80));
    }

    console.log('\n═══ 4. KALIT HISOBLASH ═════════════════════════════');

    const { generateExpectedKey, generateRecoveryKey } = require('../../licenseService');
    const id = 'TEST-MACHINE-0001';

    const k1 = generateExpectedKey(id);
    const k2 = generateExpectedKey(id);
    ok('bir xil mashinaga bir xil kalit', k1 === k2, `${k1} != ${k2}`);
    ok('kalit 24 belgi', k1.length === 24, String(k1.length));
    ok('kalit faqat katta harf va raqam', /^[0-9A-F]+$/.test(k1), k1);

    const other = generateExpectedKey('TEST-MACHINE-0002');
    ok('boshqa mashinaga boshqa kalit', k1 !== other);

    /* Ikki kalit turi BOSHQA tuzdan hisoblanadi. Bir xil bo'lganida
       xaridordagi aktivatsiya kaliti admin parolini ham tiklay olardi. */
    const rec = generateRecoveryKey(id);
    ok('tiklash kaliti aktivatsiya kalitidan farq qiladi', rec !== k1, `${rec} == ${k1}`);
    ok('tiklash kaliti 20 belgi', rec.length === 20, String(rec.length));

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
