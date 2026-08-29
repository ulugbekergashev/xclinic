/* 7.7 sinovi: uchta pul bugi. HAQIQIY server, HTTP orqali.

   Ishga tushirish (server 3096-portda ko'tarilgan bo'lishi kerak):
     cd backend && npx ts-node --transpile-only _t_moneybugs.ts <token>
*/
const BASE = process.env.T_BASE || 'http://localhost:3096';
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
    let data: any = null;
    const text = await r.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

const balanceOf = async (id: string) => (await api('GET', `/patients/${id}`)).data?.balance ?? null;

async function main() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }

    console.log('\n═══ TAYYORGARLIK ═══════════════════════════════════');
    const clinic = (await api('GET', '/clinics/me')).data
        || (await api('GET', '/departments')).data?.[0];
    const pRes = await api('POST', '/patients', {
        firstName: 'Sinov', lastName: 'Bemorov', phone: '+998900000001', gender: 'Male',
    });
    const patientId = pRes.data?.id;
    ok('sinov bemori yaratildi', !!patientId, JSON.stringify(pRes.data).slice(0, 120));
    if (!patientId) process.exit(1);

    // Avans kiritamiz: 500 000
    const avans = await api('POST', '/transactions', {
        patientId, patientName: 'Bemorov Sinov', amount: 500000,
        date: new Date().toISOString().split('T')[0],
        service: 'Avans', type: 'Cash', status: 'Paid',
    });
    ok('avans kiritildi (500 000)', avans.status === 200 || avans.status === 201);
    ok('balans 500 000 bo\'ldi', Math.round(await balanceOf(patientId)) === 500000,
        `balans: ${await balanceOf(patientId)}`);

    console.log('\n═══ BUG A — bog\'langan chekni o\'chirish ════════════');

    // Qator yaratamiz va uni AVANSDAN to'laymiz → type:'Balance' chek + ChargePayment
    const ch = await api('POST', '/charges', {
        patientId, patientName: 'Bemorov Sinov', name: 'Sinov xizmati', unitPrice: 100000, quantity: 1,
    });
    const chargeId = ch.data?.id;
    ok('hisob qatori yaratildi (100 000)', !!chargeId, JSON.stringify(ch.data).slice(0, 120));

    const payRes = await api('POST', '/payments', {
        chargeIds: [chargeId], amount: 100000, method: 'Balance',
    });
    ok("avansdan to'landi", payRes.status === 200, JSON.stringify(payRes.data).slice(0, 150));
    const afterPay = await balanceOf(patientId);
    ok('balans 400 000 ga tushdi', Math.round(afterPay) === 400000, `balans: ${afterPay}`);

    const txId = payRes.data?.transaction?.id;
    ok('chek id olindi', !!txId);

    // Ro'yxatda linkedToCharges bayrog'i bormi
    const list = await api('GET', '/transactions');
    const listed = (list.data || []).find((t: any) => t.id === txId);
    ok('ro\'yxatda linkedToCharges = true', listed?.linkedToCharges === true,
        `qiymat: ${listed?.linkedToCharges}`);

    // ── ASOSIY SINOV: o'chirishga urinish
    const balBefore = await balanceOf(patientId);
    const del1 = await api('DELETE', `/transactions/${txId}`);
    const balAfter = await balanceOf(patientId);
    ok("bog'langan chek o'chirilmadi (409)", del1.status === 409,
        `status: ${del1.status}, javob: ${JSON.stringify(del1.data).slice(0, 120)}`);
    ok('BALANS O\'ZGARMADI (bug tuzatildi)', Math.round(balBefore) === Math.round(balAfter),
        `${balBefore} → ${balAfter}`);

    // Uch marta bosib ko'ramiz — eski kodda balans har safar oshardi
    await api('DELETE', `/transactions/${txId}`);
    await api('DELETE', `/transactions/${txId}`);
    const balAfter3 = await balanceOf(patientId);
    ok('3 marta bosilganda ham balans o\'zgarmadi', Math.round(balAfter3) === Math.round(balBefore),
        `${balBefore} → ${balAfter3}`);

    // Chek haqiqatan joyidami
    const still = (await api('GET', '/transactions')).data?.find((t: any) => t.id === txId);
    ok('chek joyida qoldi', !!still);

    console.log('\n═══ BUG A2 — bog\'langan chekni tahrirlash ══════════');
    const putAmount = await api('PUT', `/transactions/${txId}`, { amount: 999999 });
    ok('summani o\'zgartirish rad etildi (409)', putAmount.status === 409,
        `status: ${putAmount.status}`);
    const putDate = await api('PUT', `/transactions/${txId}`, { date: '2026-08-01' });
    ok('sanani tuzatishga RUXSAT (200)', putDate.status === 200,
        `status: ${putDate.status}, ${JSON.stringify(putDate.data).slice(0, 100)}`);

    console.log('\n═══ BUG A3 — oddiy chek o\'chirilishi kerak ═════════');
    const plain = await api('POST', '/transactions', {
        patientId, patientName: 'Bemorov Sinov', amount: 50000,
        date: new Date().toISOString().split('T')[0],
        service: 'Avans', type: 'Cash', status: 'Paid',
    });
    const plainId = plain.data?.id;
    const balBeforePlain = await balanceOf(patientId);
    const delPlain = await api('DELETE', `/transactions/${plainId}`);
    const balAfterPlain = await balanceOf(patientId);
    ok('bog\'lanmagan avans cheki o\'chdi (200)', delPlain.status === 200, `status: ${delPlain.status}`);
    ok('balans to\'g\'ri qaytarildi (−50 000)',
        Math.round(balBeforePlain - balAfterPlain) === 50000,
        `${balBeforePlain} → ${balAfterPlain}`);

    console.log('\n═══ BUG B — qaytarilgan avans o\'chib ketmasin ══════');
    // Qatorni AVANSGA qaytaramiz
    const refund = await api('POST', `/charges/${chargeId}/refund`, {
        amount: 100000, method: 'Balance', reason: 'sinov',
    });
    ok('avansga qaytarildi', refund.status === 200, JSON.stringify(refund.data).slice(0, 130));
    const balAfterRefund = await balanceOf(patientId);
    ok('balans qaytgan summaga oshdi', Math.round(balAfterRefund) === Math.round(balAfterPlain) + 100000,
        `${balAfterPlain} → ${balAfterRefund}`);

    // ── ASOSIY SINOV: qayta hisoblash quruq yuritishda farq ko'rsatmasligi kerak
    const dry = await api('POST', '/admin/recalculate-balances', {});
    ok('quruq yuritish (dryRun) sukut bo\'yicha', dry.data?.dryRun === true, JSON.stringify(dry.data).slice(0, 120));
    const mine = (dry.data?.sample || []).find((d: any) => d.patientId === patientId);
    ok('QAYTARILGAN AVANS FARQ BERMADI (bug tuzatildi)', !mine,
        mine ? `farq: ${JSON.stringify(mine)}` : '');

    // Tasdiq bilan chaqirsak ham balans o'zgarmasligi kerak
    const applied = await api('POST', '/admin/recalculate-balances', { confirm: true });
    const balAfterRecalc = await balanceOf(patientId);
    ok('confirm bilan ham balans o\'zgarmadi',
        Math.round(balAfterRecalc) === Math.round(balAfterRefund),
        `${balAfterRefund} → ${balAfterRecalc} (tuzatilgan: ${applied.data?.patientsFixed})`);

    console.log('\n═══ BUG C — bo\'lib to\'lashda avansdan ═════════════');
    const today = new Date().toISOString().split('T')[0];
    const plan = await api('POST', '/installments', {
        patientId, service: 'Sinov davolash',
        totalAmount: 200000, totalPaid: 0,
        startDate: today, endDate: today, status: 'Active',
        items: [
            { expectedDate: today, amount: 100000, status: 'Pending' },
            { expectedDate: today, amount: 100000, status: 'Pending' },
        ],
    });
    const planId = plan.data?.id;
    if (!planId) {
        console.log(`  ⏭  bo'lib to'lash rejasi yaratilmadi (${plan.status}) — sinov o'tkazib yuborildi`);
        console.log(`     javob: ${JSON.stringify(plan.data).slice(0, 160)}`);
    } else {
        const items = plan.data?.items || (await api('GET', `/installments/${planId}`)).data?.items || [];
        const itemId = items[0]?.id;
        ok('reja va qatorlar yaratildi', !!itemId, `qatorlar: ${items.length}`);
        if (itemId) {
            const balBeforeInst = await balanceOf(patientId);
            const payInst = await api('POST', `/installments/${itemId}/pay`, {
                date: new Date().toISOString().split('T')[0], paymentMethod: 'Balance',
            });
            const balAfterInst = await balanceOf(patientId);
            ok('avansdan to\'landi (200)', payInst.status === 200, `status: ${payInst.status}`);
            ok('BALANS KAMAYDI (bug tuzatildi)',
                Math.round(balBeforeInst - balAfterInst) === Math.round(items[0].amount),
                `${balBeforeInst} → ${balAfterInst}, qator: ${items[0]?.amount}`);
        }
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
