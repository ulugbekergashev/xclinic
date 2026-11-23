/* S2.1 sinovi: RAQAMLAR IZCHILLIGI — bitta savol, bitta javob.

   ASOSIY SAVOL: bir xil ko'rsatkich turli endpointlarda bir xil raqam
   qaytaradimi?

   Audit topgan holat: qarz bir vaqtning o'zida to'rt xil ko'rsatilardi —
   Bosh sahifa «0», Bemorlar «0», Kassa «0», Hisobot «11 501 043».
   Sabab ta'rifda emas, MANBADA edi: uchta ekran `Transaction.status =
   'Pending'` dan brauzerda sanardi, biri esa `VisitCharge` dan serverda.
   Brauzerdagilar bundan tashqari faqat yuklangan oynani (45 kun, 500
   bemor) ko'rardi.

   Bu sinov aynan shuni qo'riqlaydi: kimdir yana bir joyda o'zicha sanay
   boshlasa, u shu yerda yiqiladi.

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

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + '01';

    console.log('\n═══ 1. QARZ — UCH ENDPOINTDA BIR XIL ══════════════');
    const [snap, dash, summ] = await Promise.all([
        call('GET', `/reports/snapshot?from=${monthStart}&to=${today}`, undefined, token),
        call('GET', '/reports/dashboard', undefined, token),
        call('GET', `/reports/summary?from=${monthStart}&to=${today}`, undefined, token),
    ]);

    ok('snapshot javob berdi', snap.status === 200, `status: ${snap.status}`);
    ok('dashboard javob berdi', dash.status === 200, `status: ${dash.status}`);
    ok('summary javob berdi', summ.status === 200, `status: ${summ.status}`);
    if (snap.status !== 200) return finish();

    const s = snap.data;
    ok('qarz summasi: snapshot === dashboard',
        s.debt.amount === dash.data?.debt?.amount,
        `${s.debt.amount} vs ${dash.data?.debt?.amount}`);
    ok('qarz summasi: snapshot === summary.openDebt',
        s.debt.amount === summ.data?.openDebt?.amount,
        `${s.debt.amount} vs ${summ.data?.openDebt?.amount}`);
    ok('qarzdor bemorlar soni ham bir xil',
        s.debt.patients === dash.data?.debt?.patients
        && s.debt.patients === summ.data?.openDebt?.patients,
        `${s.debt.patients} / ${dash.data?.debt?.patients} / ${summ.data?.openDebt?.patients}`);

    console.log('\n═══ 2. QARZ TA\'RIFI TO\'G\'RIMI ═══════════════════');
    /* Qarz = Σ(to'lanmagan qatorlarning qoldig'i) — `billing.ts` da
       yozilgan model. Buni mustaqil ravishda qatorlardan qayta sanaymiz. */
    const debtors = await call('GET', '/reports/debtors', undefined, token);
    const fromDebtors = (debtors.data?.patients || [])
        .reduce((acc: number, p: any) => acc + (p.due || 0), 0);
    ok('qarz qarzdorlar ro\'yxati yig\'indisiga teng',
        Math.abs(fromDebtors - s.debt.amount) < 1,
        `qarzdorlardan: ${fromDebtors}, snapshot: ${s.debt.amount}`);

    ok('qarzdor BEMORLAR soni qatorlar sonidan katta emas',
        s.debt.patients <= s.debt.charges,
        `bemor: ${s.debt.patients}, qator: ${s.debt.charges}`);

    console.log('\n═══ 3. BEMORLAR SANOG\'I ═══════════════════════════');
    const patients = await call('GET', '/patients', undefined, token);
    const listCount = Array.isArray(patients.data) ? patients.data.length : (patients.data?.items?.length ?? -1);
    ok('«Jami bemorlar» — TASHRIF emas, BEMOR sanaladi',
        s.patients.total >= listCount && s.patients.total > 0,
        `snapshot: ${s.patients.total}, ro'yxat: ${listCount}`);
    ok('«Yangi bemorlar» butun bazadan kichik',
        s.patients.newLast7Days <= s.patients.total,
        `yangi: ${s.patients.newLast7Days}, jami: ${s.patients.total}`);
    ok('faol bemorlar jamidan oshmaydi',
        s.patients.active <= s.patients.total,
        `${s.patients.active} / ${s.patients.total}`);

    console.log('\n═══ 4. O\'RTACHA CHEK ══════════════════════════════');
    const expected = s.period.visits > 0 ? Math.round(s.period.charged / s.period.visits) : 0;
    ok('o\'rtacha chek = buyurilgan summa / tashriflar',
        Math.abs(s.period.avgCheck - expected) <= 1,
        `${s.period.avgCheck} vs ${expected}`);
    ok('davr qarzi = buyurilgan − olingan',
        Math.abs(s.period.due - (s.period.charged - s.period.collected)) < 1,
        `${s.period.due} vs ${s.period.charged - s.period.collected}`);

    console.log('\n═══ 4b. SOF FOYDA BITTA ═══════════════════════════');
    /* Hisobot ekranida ikki «foyda» bor edi: solishtirish kartasida
       «olingan − xarajat», pastda «tushum − material − xarajat». Egasining
       qoidasi: SOF FOYDA = TUSHUM − XARAJAT. Ikkalasi bir xil bo'lishi shart. */
    const cmp = await call('GET', `/reports/compare?from=${monthStart}&to=${today}`, undefined, token);
    ok('compare javob berdi', cmp.status === 200, `status: ${cmp.status}`);
    const tot = summ.data?.totals || {};
    ok('sof foyda: summary === compare',
        Math.abs((tot.netProfit ?? NaN) - (cmp.data?.current?.profit ?? NaN)) < 1,
        `${tot.netProfit} vs ${cmp.data?.current?.profit}`);
    ok('sof foyda = tushum − xarajat',
        Math.abs(tot.netProfit - (tot.revenue - tot.doctorShare - tot.otherExpenses)) < 1,
        `${tot.netProfit} vs ${tot.revenue} − ${tot.doctorShare} − ${tot.otherExpenses}`);
    ok('xarajat: summary === compare',
        Math.abs((tot.doctorShare + tot.otherExpenses) - (cmp.data?.current?.expense ?? NaN)) < 1,
        `${tot.doctorShare + tot.otherExpenses} vs ${cmp.data?.current?.expense}`);

    console.log('\n═══ 4c. XIZMATLAR SUMMASI — HAMMA TABDA BITTA ═════');
    /* Moliya rejasi 4–5-vazifa (2026-11-23). Umumiy (compare), pastdagi
       summary, Shifokorlar va Bo'limlar bir davr uchun BIR XIL «Xizmatlar»
       summasini berishi shart: hammasi qabul sanasi bo'yicha sanaydi. */
    const [docs, depts] = await Promise.all([
        call('GET', `/reports/doctors?from=${monthStart}&to=${today}`, undefined, token),
        call('GET', `/reports/departments?from=${monthStart}&to=${today}`, undefined, token),
    ]);
    ok('xizmatlar: summary === compare',
        Math.abs((tot.revenue ?? NaN) - (cmp.data?.current?.revenue ?? NaN)) < 1,
        `${tot.revenue} vs ${cmp.data?.current?.revenue}`);
    ok('xizmatlar: shifokorlar jami === compare',
        Math.abs((docs.data?.totals?.revenue ?? NaN) - (cmp.data?.current?.revenue ?? NaN)) < 1,
        `${docs.data?.totals?.revenue} vs ${cmp.data?.current?.revenue}`);
    const deptSum = (depts.data?.departments || depts.data?.rows || []).reduce((s: number, d: any) => s + (d.revenue || 0), 0);
    ok("xizmatlar: bo'limlar yig'indisi === compare",
        Math.abs(deptSum - (cmp.data?.current?.revenue ?? NaN)) < 1,
        `${deptSum} vs ${cmp.data?.current?.revenue}`);

    console.log('\n═══ 4d. OYLAR BO\'YICHA — SHU OY = SOLISHTIRISH ═══');
    /* Moliya rejasi 6: «Oylar bo'yicha» jadvalidagi joriy oy qatori Umumiy
       plitkalari bilan bir xil bo'lishi shart (oy boshidan bugungacha). */
    const months = await call('GET', `/reports/months?year=${today.slice(0, 4)}`, undefined, token);
    ok('months javob berdi', months.status === 200 && months.data?.months?.length === 12, `status: ${months.status}`);
    const thisMonth = (months.data?.months || []).find((m: any) => m.month === today.slice(0, 7)) || {};
    for (const k of ['revenue', 'collected', 'expense', 'profit']) {
        ok(`oylar: joriy oy ${k} === compare`,
            Math.abs((thisMonth[k] ?? NaN) - (cmp.data?.current?.[k] ?? NaN)) < 1,
            `${thisMonth[k]} vs ${cmp.data?.current?.[k]}`);
    }
    /* To'liq oy — o'tgan oy ham to'liq (31-kun tushib qolmasin) */
    const fullMonth = await call('GET', '/reports/compare?from=2026-11-01&to=2026-11-30', undefined, token);
    ok("to'liq noyabr ↔ to'liq oktyabr (1–31)",
        fullMonth.data?.previous?.from === '2026-10-01' && fullMonth.data?.previous?.to === '2026-10-31',
        `${fullMonth.data?.previous?.from} – ${fullMonth.data?.previous?.to}`);
    const debt = await call('GET', '/reports/debtors', undefined, token);
    ok('qarzdorlarda telefon maydoni bor (Moliya rejasi 7)',
        (debt.data?.patients || []).every((p: any) => 'phone' in p),
        JSON.stringify((debt.data?.patients || [])[0] || {}).slice(0, 120));
    const badYear = await call('GET', '/reports/months?year=abc', undefined, token);
    ok("noto'g'ri yil — joriy yil olinadi", badYear.status === 200 && badYear.data?.year === Number(today.slice(0, 4)), `status: ${badYear.status}`);

    console.log('\n═══ 5. DAVR CHEGARASI HURMAT QILINADI ═════════════');
    /* Qarz davrga bog'liq EMAS — bir kunlik oraliqda ham o'zgarmasligi
       kerak. Tushum esa bog'liq. */
    const narrow = await call('GET', `/reports/snapshot?from=${today}&to=${today}`, undefined, token);
    ok('tor davrda ham qarz o\'zgarmadi (davrga bog\'liq emas)',
        narrow.data?.debt?.amount === s.debt.amount,
        `${narrow.data?.debt?.amount} vs ${s.debt.amount}`);
    ok('tor davrda buyurilgan summa oshmadi',
        (narrow.data?.period?.charged ?? 0) <= s.period.charged,
        `${narrow.data?.period?.charged} vs ${s.period.charged}`);
    ok('javobda davr chegarasi ko\'rsatilgan',
        narrow.data?.range?.from === today && narrow.data?.range?.to === today,
        JSON.stringify(narrow.data?.range));

    console.log('\n=== 6. SAHIFALASH (S5.5) ===');
    /* Audit: bemorlar (67 ta) va to'lovlar (286 ta) bir sahifada;
       5 000 bemorda bu sahifa ochilmay qoladi. */
    const plain = await call('GET', '/patients', undefined, token);
    ok("sahifasiz so'rov ODDIY MASSIV qaytaradi", Array.isArray(plain.data), typeof plain.data);

    const p1 = await call('GET', '/patients?page=1&limit=10', undefined, token);
    ok("sahifali so'rov konvert qaytaradi",
        !Array.isArray(p1.data) && Array.isArray(p1.data?.items),
        JSON.stringify(Object.keys(p1.data || {})));
    ok("sahifada 10 tadan ko'p emas", (p1.data?.items || []).length <= 10,
        String((p1.data?.items || []).length));
    ok("umumiy son qaytadi", typeof p1.data?.total === 'number' && p1.data.total > 0,
        String(p1.data?.total));
    ok("umumiy son sahifasiz ro'yxat bilan mos",
        p1.data?.total === (Array.isArray(plain.data) ? plain.data.length : -1),
        `${p1.data?.total} vs ${Array.isArray(plain.data) ? plain.data.length : '?'}`);

    const p2 = await call('GET', '/patients?page=2&limit=10', undefined, token);
    const ids1 = new Set((p1.data?.items || []).map((x: any) => x.id));
    const overlap = (p2.data?.items || []).filter((x: any) => ids1.has(x.id));
    ok("2-sahifa 1-sahifani takrorlamaydi", overlap.length === 0, `takror: ${overlap.length}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
