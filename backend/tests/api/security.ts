/* XAVFSIZLIK VA KASSA — audit 2026-09-17 tuzatishlari qaytib kelmasin.
 *
 * Nimani tekshiradi:
 *
 *   1. Registrator kategoriya orqali ega parolini almashtira olmaydi
 *      (Prisma ichma-ich yozuvi, `data: req.body`).
 *   2. Javoblarda parol hashi va integratsiya sirlari yo'q.
 *   3. `/api/local-logins` yo'q; tunnel orqali login xatolari klinika
 *      kompyuterini bloklamaydi (`CF-Connecting-IP`).
 *   4. Sessiya bekor qilinadi: parol almashtirilsa va xodim bloklansa.
 *   5. `POST /api/transactions` — manfiy summa va pulsiz avans yo'q.
 *   6. Yopilgan smenani registrator qayta yopa olmaydi.
 *   7. Yopilmagan kunning naqd tushumi keyingi kun ochilish qoldig'iga o'tadi.
 *   8. Tahlil o'chirilsa uning to'lanmagan qatori bekor bo'ladi.
 *   9. Muddatli to'lovning bir oyi ikki marta to'lanmaydi (parallel).
 *  10. Moliyani o'qish: hamshira va laborant — yo'q; registrator — ega
 *      bayrog'iga qarab. AI sozlamalari egaga ochiq.
 *  11. Yuklash: HTML fayl rad etiladi. CORS: `http://10.evil.com` o'tmaydi.
 *
 * Ishga tushirish: cd backend && npm run test:api
 */
const BASE = process.env.T_BASE || 'http://localhost:3079';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(method: string, path: string, body?: any, token?: string, headers: Record<string, string> = {}) {
    const r = await fetch(BASE + '/api' + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data, headers: r.headers };
}

async function login(username: string, password = 'testpass123'): Promise<string | null> {
    const r = await call('POST', '/auth/login', { username, password });
    return r.status === 200 ? (r.data?.token ?? null) : null;
}

const tag = () => String(Date.now()).slice(-7) + Math.floor(Math.random() * 100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => {
    const d = new Date(Date.now() + 5 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
};

async function main() {
    const admin = await login('admin');
    ok('ega kirdi', !!admin);
    if (!admin) return finish();

    const clinics = (await call('GET', '/clinics', undefined, admin)).data || [];
    const clinicId = clinics[0]?.id;
    ok('klinika topildi', !!clinicId);

    /* Sinov registratori — mavjud xodimlarga tegmaslik uchun yangisi. */
    const t = tag();
    const recUser = `secrec${t}`;
    const rec = await call('POST', '/receptionists', {
        firstName: 'Xavf', lastName: `Sinov${t}`, phone: '+998901234567',
        username: recUser, password: 'testpass123',
    }, admin);
    ok('sinov registratori yaratildi', rec.status === 200, `status: ${rec.status}`);
    let recToken = await login(recUser);
    ok('registrator kirdi', !!recToken);
    if (!recToken || !clinicId) return finish();

    console.log('\n═══ 1. KATEGORIYA ORQALI EGA PAROLI ════════════════');
    const cat = await call('POST', '/categories', { name: `Xavf${t}` }, recToken);
    ok('registrator kategoriya yaratdi', cat.status === 200, `status: ${cat.status}`);
    const nested = await call('PUT', `/categories/${cat.data?.id}`, {
        name: `Xavf2${t}`, clinic: { update: { password: 'hacked123' } },
    }, recToken);
    ok('ichma-ich tana e\'tiborsiz qoldi (nom yangilandi)', nested.status === 200 && nested.data?.name === `Xavf2${t}`,
        `status: ${nested.status}`);
    ok('ega hamon eski paroli bilan kiradi', !!(await login('admin')));
    ok('«hacked123» bilan KIRIB BO\'LMAYDI', !(await login('admin', 'hacked123')));
    const nestedCreate = await call('POST', '/categories', {
        name: `Xavf3${t}`, clinic: { create: { username: `evil${t}` } },
    }, recToken);
    ok('yaratishda ham ichma-ich tana e\'tiborsiz', nestedCreate.status === 200 && nestedCreate.data?.clinicId === clinicId,
        `status: ${nestedCreate.status}`);

    console.log('\n═══ 2. JAVOBLARDA SIRLAR YO\'Q ═══════════════════');
    const recClinics = (await call('GET', '/clinics', undefined, recToken)).data || [];
    ok('registratorga klinika paroli bormaydi', recClinics[0] && recClinics[0].password === undefined);
    const secretLeak = ['botToken', 'eskizPassword', 'dmedApiKey', 'dmedApiSecret', 'leadApiKey', 'licenseKey']
        .filter((f) => recClinics[0]?.[f] && recClinics[0][f] !== '********');
    ok('registratorga integratsiya sirlari bormaydi', secretLeak.length === 0, secretLeak.join(', '));
    for (const ep of ['/doctors', '/receptionists', '/lab-technicians', '/staff']) {
        const rows = (await call('GET', ep, undefined, recToken)).data || [];
        const list = Array.isArray(rows) ? rows : (rows.items || []);
        ok(`${ep}: parol maydoni yo'q`, !list.some((x: any) => 'password' in x), `${list.length} qator`);
        ok(`${ep}: maosh maydoni registratorga yo'q`, !list.some((x: any) => 'fixedSalary' in x || 'percentage' in x));
    }
    const adminDocs = (await call('GET', '/doctors', undefined, admin)).data || [];
    ok('egaga ham parol hashi bormaydi', !adminDocs.some((x: any) => 'password' in x));

    console.log('\n═══ 3. LOGINLAR RO\'YXATI VA TUNNEL CHEKLOVI ══════');
    const ll = await call('GET', '/local-logins');
    ok('/api/local-logins yo\'q', ll.status === 404 || !Array.isArray(ll.data), `status: ${ll.status}`);

    /* Tunnel orqali 31 ta noto'g'ri urinish — har biri boshqa login bilan,
       login bo'yicha cheklovga tushmasin. */
    for (let i = 0; i < 31; i++) {
        await call('POST', '/auth/login', { username: `yoq${t}_${i}`, password: 'xato' }, undefined,
            { 'CF-Connecting-IP': '203.0.113.7' });
    }
    const tunnelBlocked = await call('POST', '/auth/login', { username: `yoq${t}_x`, password: 'xato' }, undefined,
        { 'CF-Connecting-IP': '203.0.113.7' });
    ok('tunneldagi hujumchi bloklandi (429)', tunnelBlocked.status === 429, `status: ${tunnelBlocked.status}`);
    ok('shu kompyuterdan kirish BLOKLANMADI', !!(await login('admin')));

    console.log('\n═══ 4. SESSIYANI BEKOR QILISH ══════════════════════');
    const recId = rec.data?.id;
    const before = await call('GET', '/patients?limit=1', undefined, recToken);
    ok('registrator tokeni ishlaydi', before.status === 200, `status: ${before.status}`);
    const pw = await call('PUT', `/receptionists/${recId}`, { password: 'yangiparol123' }, admin);
    ok('ega registrator parolini almashtirdi', pw.status === 200, `status: ${pw.status}`);
    const afterPw = await call('GET', '/patients?limit=1', undefined, recToken);
    ok('ESKI TOKEN KUCHINI YO\'QOTDI (401)', afterPw.status === 401, `status: ${afterPw.status}`);

    recToken = await login(recUser, 'yangiparol123');
    ok('yangi parol bilan kirdi', !!recToken);
    const block = await call('PUT', `/receptionists/${recId}`, { status: 'Blocked' }, admin);
    ok('ega registratorni blokladi', block.status === 200, `status: ${block.status}`);
    await sleep(10_500); // holat keshi 10 soniya
    const afterBlock = await call('GET', '/patients?limit=1', undefined, recToken!);
    ok('BLOKLANGAN XODIM TOKENI ISHLAMAYDI (401)', afterBlock.status === 401, `status: ${afterBlock.status}`);
    await call('PUT', `/receptionists/${recId}`, { status: 'Active', password: 'testpass123' }, admin);
    recToken = await login(recUser);
    ok('qayta faollashtirilgach kirdi', !!recToken);
    if (!recToken) return finish();

    console.log('\n═══ 5. TRANZAKSIYA: MANFIY SUMMA VA PULSIZ AVANS ═══');
    const patients = (await call('GET', '/patients?limit=1', undefined, admin)).data || [];
    const p = patients[0];
    const base = { patientId: p?.id, patientName: 'Sinov', date: today(), service: 'Konsultatsiya', status: 'Paid' };
    const neg = await call('POST', '/transactions', { ...base, type: 'Cash', amount: -500000 }, recToken);
    ok('manfiy naqd chek RAD ETILDI (400)', neg.status === 400, `status: ${neg.status}`);
    const free = await call('POST', '/transactions', { ...base, service: 'Avans', type: 'Balance', amount: 100000 }, recToken);
    ok('«avansdan avans» RAD ETILDI (400)', free.status === 400, `status: ${free.status}`);
    const refundType = await call('POST', '/transactions', { ...base, type: 'Refund', amount: 1000 }, recToken);
    ok('qo\'lda «Refund» cheki RAD ETILDI (400)', refundType.status === 400, `status: ${refundType.status}`);
    const okTx = await call('POST', '/transactions', { ...base, type: 'Cash', amount: 1000.4 }, recToken);
    ok('oddiy chek o\'tdi va summa butun so\'m', okTx.status === 200 && okTx.data?.amount === 1000,
        `status: ${okTx.status}, amount: ${okTx.data?.amount}`);

    console.log('\n═══ 6. YOPILGAN SMENA QAYTA YOPILMAYDI ═════════════');
    const closeDate = '2031-02-10';
    const c1 = await call('POST', '/cash-register/close', { date: closeDate, countedCash: 0 }, recToken);
    ok('registrator smenani yopdi', c1.status === 200, `status: ${c1.status}, ${JSON.stringify(c1.data).slice(0, 120)}`);
    const c2 = await call('POST', '/cash-register/close', { date: closeDate, countedCash: 0 }, recToken);
    ok('registrator QAYTA yopa olmadi (409)', c2.status === 409, `status: ${c2.status}`);
    const c3 = await call('POST', '/cash-register/close', { date: closeDate, countedCash: 0 }, admin);
    ok('ega qayta yopa oladi', c3.status === 200, `status: ${c3.status}`);

    console.log('\n═══ 7. YOPILMAGAN KUN KEYINGI KUNGA O\'TADI ═════════');
    const anchor = await call('POST', '/cash-register/close', { date: '2031-03-10', countedCash: 400000 }, admin);
    ok('anker kun yopildi (400 000)', anchor.status === 200, `status: ${anchor.status}`);
    const mid = await call('POST', '/transactions', { ...base, date: '2031-03-11', type: 'Cash', amount: 70000 }, admin);
    ok('yopilmagan kunga naqd tushum', mid.status === 200, `status: ${mid.status}`);
    const exp = await call('GET', `/cash-register/expected?date=2031-03-12`, undefined, admin);
    ok('ochilish qoldig\'i = 400 000 + 70 000', Math.round(exp.data?.openingCash) === 470000,
        `openingCash: ${exp.data?.openingCash}`);

    console.log('\n═══ 8. TAHLIL O\'CHIRILSA QATORI BEKOR BO\'LADI ═════');
    const labTests = (await call('GET', '/lab-tests', undefined, admin)).data || [];
    if (labTests.length && p) {
        const order = await call('POST', '/lab-orders', {
            patientId: p.id, patientName: `${p.lastName} ${p.firstName}`, testIds: [labTests[0].id],
        }, admin);
        ok('yo\'llanma yaratildi', order.status === 200, `status: ${order.status}`);
        const charge = ((await call('GET', `/charges?patientId=${p.id}`, undefined, admin)).data || [])
            .find((c: any) => c.source === 'Lab' && c.sourceId === order.data?.id);
        ok('tahlil qatori bor', !!charge);
        const del = await call('DELETE', `/lab-orders/${order.data?.id}`, undefined, admin);
        ok('yo\'llanma o\'chirildi', del.status === 200, `status: ${del.status}`);
        const after = ((await call('GET', `/charges?patientId=${p.id}`, undefined, admin)).data || [])
            .find((c: any) => c.id === charge?.id);
        ok('QATOR BEKOR QILINDI (qarz qolmadi)', !after || after.status === 'Cancelled', `holat: ${after?.status}`);

        const order2 = await call('POST', '/lab-orders', {
            patientId: p.id, patientName: `${p.lastName} ${p.firstName}`, testIds: [labTests[0].id],
        }, admin);
        const charge2 = ((await call('GET', `/charges?patientId=${p.id}`, undefined, admin)).data || [])
            .find((c: any) => c.source === 'Lab' && c.sourceId === order2.data?.id);
        const pay = await call('POST', '/payments', { chargeIds: [charge2?.id], amount: charge2?.total, method: 'Cash' }, admin);
        ok('ikkinchi tahlil to\'landi', pay.status === 200, `status: ${pay.status}`);
        const delPaid = await call('DELETE', `/lab-orders/${order2.data?.id}`, undefined, admin);
        ok('to\'langan tahlil O\'CHIRILMADI (409)', delPaid.status === 409, `status: ${delPaid.status}`);
    } else {
        ok('tahlil katalogi bor', false, 'katalog bo\'sh — sinov o\'tkazilmadi');
    }

    console.log('\n═══ 9. MUDDATLI TO\'LOV BIR OY IKKI MARTA EMAS ══════');
    const pp = (await call('POST', '/patients', {
        firstName: 'Muddat', lastName: `Parallel${t}`, phone: `+9989${t.slice(-8).padStart(8, '1')}`, gender: 'Male',
    }, admin)).data;
    const ch = pp?.id ? (await call('POST', '/charges', {
        patientId: pp.id, patientName: `Parallel${t} Muddat`, name: 'Reja', unitPrice: 300000, quantity: 1,
    }, admin)).data : null;
    const plan = ch?.id ? await call('POST', '/installments', {
        patientId: pp.id, chargeIds: [ch.id], months: 3, startDate: '2031-01-31',
    }, admin) : null;
    ok('reja yaratildi', plan?.status === 200, `status: ${plan?.status}, ${JSON.stringify(plan?.data).slice(0, 120)}`);
    const items = plan?.data?.items || [];
    const dates = items.map((i: any) => i.expectedDate);
    ok('31-yanvardan oylar siljimaydi (fev oxiri, 31-mart, 30-aprel)',
        JSON.stringify(dates) === JSON.stringify(['2031-02-28', '2031-03-31', '2031-04-30']), JSON.stringify(dates));
    if (items[0]?.id) {
        const [a, b] = await Promise.all([
            call('POST', `/installments/${items[0].id}/pay`, { paymentMethod: 'Cash' }, admin),
            call('POST', `/installments/${items[0].id}/pay`, { paymentMethod: 'Cash' }, admin),
        ]);
        const oks = [a, b].filter((r) => r.status === 200).length;
        ok('parallel ikki bosishdan faqat BITTASI o\'tdi', oks === 1, `statuslar: ${a.status}, ${b.status}`);
        const planAfter = (await call('GET', `/installments?patientId=${pp.id}`, undefined, admin)).data;
        const pl = Array.isArray(planAfter) ? planAfter.find((x: any) => x.id === plan?.data?.id) : null;
        if (pl) ok('totalPaid bir oylik summa', Math.round(pl.totalPaid) === Math.round(items[0].amount), String(pl.totalPaid));
    }

    console.log('\n═══ 10. MOLIYANI O\'QISH ═════════════════════════════');
    const nurses = (await call('GET', '/nurses', undefined, admin)).data || [];
    const nurseName = (Array.isArray(nurses) ? nurses : []).find((x: any) => x?.username)?.username;
    const nurseToken = nurseName ? await login(nurseName) : null;
    if (nurseToken) {
        for (const ep of ['/expenses', '/cash-audit', '/reports/summary', '/transactions', '/cash-movements']) {
            const r = await call('GET', ep, undefined, nurseToken);
            ok(`hamshira ${ep} → 403`, r.status === 403, `status: ${r.status}`);
        }
    } else {
        ok('bazada hamshira logini bor', false, 'hamshira yo\'q — sinov o\'tkazilmadi');
    }

    const acBefore = recClinics[0]?.accessControl;
    const setAc = await call('PUT', `/clinics/${clinicId}/access-control`,
        { accessControl: { receptionist: { showFinance: false } } }, admin);
    ok('ega registratorga moliyani yopdi', setAc.status === 200, `status: ${setAc.status}`);
    const recExp = await call('GET', '/expenses', undefined, recToken);
    ok('registrator xarajatlarni ko\'ra olmaydi (403)', recExp.status === 403, `status: ${recExp.status}`);
    const recTx = await call('GET', '/transactions?limit=1', undefined, recToken);
    ok('registrator to\'lovlar ro\'yxatini ko\'radi (bemor kartasi uchun)', recTx.status === 200, `status: ${recTx.status}`);
    const adminExp = await call('GET', '/expenses', undefined, admin);
    ok('ega xarajatlarni ko\'radi', adminExp.status === 200, `status: ${adminExp.status}`);
    let restore: any = null;
    try { restore = acBefore ? (typeof acBefore === 'string' ? JSON.parse(acBefore) : acBefore) : null; } catch { restore = null; }
    await call('PUT', `/clinics/${clinicId}/access-control`, { accessControl: restore }, admin);
    const recExp2 = await call('GET', '/expenses', undefined, recToken);
    ok('sozlama qaytarilgach registrator yana ko\'radi', recExp2.status === 200, `status: ${recExp2.status}`);

    const ai = await call('PUT', '/ai/settings', {}, admin);
    ok('ega AI sozlamasini saqlay oladi (403 emas)', ai.status !== 403, `status: ${ai.status}, ${JSON.stringify(ai.data).slice(0, 80)}`);

    console.log('\n═══ 11. YUKLASH VA CORS ════════════════════════════');
    if (p?.id) {
        const form = new FormData();
        form.append('photo', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
        const up = await fetch(`${BASE}/api/patients/${p.id}/photos`, {
            method: 'POST', headers: { Authorization: `Bearer ${admin}` }, body: form,
        });
        ok('HTML fayl yuklanmadi (400)', up.status === 400, `status: ${up.status}`);
    }
    const evil = await fetch(`${BASE}/api/clinics`, {
        headers: { Origin: 'http://10.evil.com', Authorization: `Bearer ${admin}` },
    });
    ok('CORS: http://10.evil.com ruxsat olmadi',
        evil.headers.get('access-control-allow-origin') !== 'http://10.evil.com',
        String(evil.headers.get('access-control-allow-origin')));
    const lan = await fetch(`${BASE}/api/clinics`, {
        headers: { Origin: 'http://192.168.1.20:3101', Authorization: `Bearer ${admin}` },
    });
    ok('CORS: LAN manzili ruxsat oldi',
        lan.headers.get('access-control-allow-origin') === 'http://192.168.1.20:3101',
        String(lan.headers.get('access-control-allow-origin')));

    // Sinov registratori o'chiriladi
    await call('DELETE', `/receptionists/${recId}`, undefined, admin);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi`);
    process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); fail++; finish(); });
