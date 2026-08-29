/* 7.3 sinovi: to'lov oqimining atomarligi va poyga himoyasi.

   Ishga tushirish: cd backend && npx ts-node --transpile-only _t_payments.ts <token>
*/
const BASE = process.env.T_BASE || 'http://localhost:3095';
const TOKEN = process.argv[2];

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function api(method: string, path: string, body?: any) {
    const r = await fetch(BASE + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

const today = () => new Date().toISOString().split('T')[0];
let patientId = '';
const balanceOf = async () => (await api('GET', `/patients/${patientId}`)).data?.balance ?? 0;

async function newCharge(price: number) {
    const r = await api('POST', '/charges', {
        patientId, patientName: 'Toshov Sinov', name: `Xizmat ${price}`, unitPrice: price, quantity: 1,
    });
    return r.data?.id as string;
}
const getCharge = async (id: string) =>
    (await api('GET', `/charges?patientId=${patientId}`)).data?.find((c: any) => c.id === id);

async function main() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }

    console.log('\n═══ TAYYORGARLIK ═══════════════════════════════════');
    patientId = (await api('POST', '/patients', {
        firstName: 'Sinov', lastName: 'Toshov', phone: '+998900000002', gender: 'Male',
    })).data?.id;
    ok('bemor yaratildi', !!patientId);

    console.log('\n═══ 1. POYGA — ikki kassir bitta qatorni ══════════');
    const c1 = await newCharge(100000);
    ok('qator yaratildi (100 000)', !!c1);

    // Ikkalasi ham AYNI paytda to'lamoqchi
    const [r1, r2] = await Promise.all([
        api('POST', '/payments', { chargeIds: [c1], amount: 100000, method: 'Cash' }),
        api('POST', '/payments', { chargeIds: [c1], amount: 100000, method: 'Cash' }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    ok('bittasi 200, ikkinchisi rad etildi',
        statuses[0] === 200 && (statuses[1] === 409 || statuses[1] === 400),
        `statuslar: ${statuses.join(', ')}`);

    const after1 = await getCharge(c1);
    ok('qator AYNAN bir marta to\'landi (paidAmount = 100 000)',
        Math.round(after1?.paidAmount) === 100000, `paidAmount: ${after1?.paidAmount}`);
    ok('qator holati Paid', after1?.status === 'Paid', `status: ${after1?.status}`);

    // Kassada nechta chek paydo bo'ldi?
    const txs = (await api('GET', '/transactions')).data || [];
    const forCharge = txs.filter((t: any) => t.service?.includes('Xizmat 100000'));
    ok('kassada AYNAN bitta chek (fantom chek yo\'q)', forCharge.length === 1,
        `cheklar: ${forCharge.length} — ${forCharge.map((t: any) => t.amount).join(', ')}`);

    console.log('\n═══ 2. ESKIRGAN HOLAT — 409 ═══════════════════════');
    const c2 = await newCharge(200000);
    // Yarmini to'laymiz
    await api('POST', '/payments', { chargeIds: [c2], amount: 50000, method: 'Cash' });
    // Endi mijoz "eski" holatga tayanib to'liq 200 000 to'lamoqchi
    const stale = await api('POST', '/payments', { chargeIds: [c2], amount: 200000, method: 'Cash' });
    ok('qarzdan ko\'p to\'lov rad etildi', stale.status === 400 || stale.status === 409,
        `status: ${stale.status}, ${JSON.stringify(stale.data).slice(0, 90)}`);
    const c2after = await getCharge(c2);
    ok('qator o\'zgarmadi (50 000 to\'langan)', Math.round(c2after?.paidAmount) === 50000,
        `paidAmount: ${c2after?.paidAmount}`);

    console.log('\n═══ 3. ROLLBACK — avans yetmasa hech narsa yozilmasin ═══');
    const c3 = await newCharge(300000);
    const balBefore = await balanceOf();
    const txCountBefore = ((await api('GET', '/transactions')).data || []).length;
    const noBal = await api('POST', '/payments', {
        chargeIds: [c3], amount: 300000, method: 'Balance',
    });
    ok('avans yetmasligi rad etildi (400)', noBal.status === 400, `status: ${noBal.status}`);
    const c3after = await getCharge(c3);
    const txCountAfter = ((await api('GET', '/transactions')).data || []).length;
    ok('qator to\'lanmagan qoldi', Math.round(c3after?.paidAmount || 0) === 0,
        `paidAmount: ${c3after?.paidAmount}`);
    ok('CHEK YARATILMADI (rollback ishladi)', txCountAfter === txCountBefore,
        `${txCountBefore} → ${txCountAfter}`);
    ok('balans o\'zgarmadi', Math.round(await balanceOf()) === Math.round(balBefore));

    console.log('\n═══ 4. KO\'P USULLI TO\'LOV atomar ═════════════════');
    const c4 = await newCharge(150000);
    const multi = await api('POST', '/payments', {
        chargeIds: [c4], amount: 150000,
        payments: [{ method: 'Cash', amount: 100000 }, { method: 'Card', amount: 50000 }],
    });
    ok('naqd + karta to\'lov o\'tdi (200)', multi.status === 200, `status: ${multi.status}`);
    ok('ikkita chek yaratildi', (multi.data?.transactions || []).length === 2,
        `cheklar: ${(multi.data?.transactions || []).length}`);
    const c4after = await getCharge(c4);
    ok('qator to\'liq to\'landi', Math.round(c4after?.paidAmount) === 150000 && c4after?.status === 'Paid',
        `paidAmount: ${c4after?.paidAmount}, status: ${c4after?.status}`);

    console.log('\n═══ 5. QAYTARISH atomar ═══════════════════════════');
    const balBeforeRef = await balanceOf();
    const ref = await api('POST', `/charges/${c4}/refund`, {
        amount: 150000, method: 'Balance', reason: 'sinov',
    });
    ok('qaytarish o\'tdi (200)', ref.status === 200, `status: ${ref.status}`);
    ok('balansga qaytdi', Math.round(await balanceOf()) === Math.round(balBeforeRef) + 150000,
        `${balBeforeRef} → ${await balanceOf()}`);
    const c4ref = await getCharge(c4);
    ok('qator yana to\'lanmagan', Math.round(c4ref?.paidAmount || 0) === 0 && c4ref?.status === 'Unpaid',
        `paidAmount: ${c4ref?.paidAmount}, status: ${c4ref?.status}`);

    // To'langanidan ko'p qaytarish — rad etilishi va hech narsa yozilmasligi kerak
    const txBeforeBad = ((await api('GET', '/transactions')).data || []).length;
    const badRef = await api('POST', `/charges/${c4}/refund`, { amount: 999999, method: 'Cash' });
    ok('ortiqcha qaytarish rad etildi', badRef.status === 400, `status: ${badRef.status}`);
    ok('rad etilganda chek yaratilmadi',
        ((await api('GET', '/transactions')).data || []).length === txBeforeBad);

    console.log('\n═══ 6. CHEGIRMA — eskirgan holatda 409 ════════════');
    const c5 = await newCharge(100000);
    const disc = await api('PUT', `/charges/${c5}/discount`, { discount: 20000 });
    ok('chegirma berildi (200)', disc.status === 200, `status: ${disc.status}`);
    const c5after = await getCharge(c5);
    ok('jami 80 000 bo\'ldi', Math.round(c5after?.total) === 80000, `total: ${c5after?.total}`);

    console.log('\n═══ 7. BEKOR QILISH — ikki marta bosish ═══════════');
    const c6 = await newCharge(60000);
    const d1 = await api('DELETE', `/charges/${c6}`);
    const d2 = await api('DELETE', `/charges/${c6}`);
    ok('birinchi bekor qilish 200', d1.status === 200, `status: ${d1.status}`);
    ok('ikkinchi bosish ham 200 (idempotent saqlandi)', d2.status === 200, `status: ${d2.status}`);

    const c7 = await newCharge(70000);
    await api('POST', '/payments', { chargeIds: [c7], amount: 70000, method: 'Cash' });
    const delPaid = await api('DELETE', `/charges/${c7}`);
    ok('to\'langan qatorni bekor qilib bo\'lmaydi (409)', delPaid.status === 409,
        `status: ${delPaid.status}`);

    console.log('\n═══ 8. YAXLITLIK — ChargePayment = paidAmount ═════');
    const allCharges = (await api('GET', `/charges?patientId=${patientId}`)).data || [];
    let bad = 0;
    for (const c of allCharges) {
        const sum = (c.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
        if (c.payments && Math.abs(sum - (c.paidAmount || 0)) > 0.01) {
            bad++;
            console.log(`     ✗ ${c.name}: ChargePayment yig'indisi ${sum}, paidAmount ${c.paidAmount}`);
        }
    }
    ok('hamma qatorda ChargePayment yig\'indisi paidAmount ga teng', bad === 0, `nomuvofiq: ${bad}`);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
