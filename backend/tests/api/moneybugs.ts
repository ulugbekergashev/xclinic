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

    console.log('\n═══ BO\'LIB TO\'LASH QATORLAR USTIGA QURILADI ════════');
    /* Ilgari reja ALOHIDA pul modeli edi: xizmat nomi erkin matn, summa
       qo'lda. Har to'lov chek yozardi, `ChargePayment` esa YOZMASDI —
       ya'ni shifokor bu puldan ulush olmasdi. Endi reja mavjud
       to'lanmagan qatorlarni bo'ladi va to'lov kassadagi oddiy to'lov
       bilan bir xil yo'ldan o'tadi. */
    const today = new Date().toISOString().split('T')[0];

    const instCharge = await api('POST', '/charges', {
        patientId, patientName: 'Bemorov Sinov',
        source: 'Other', name: 'Breket tizimi',
        quantity: 1, unitPrice: 200000, total: 200000,
    });
    const instChargeId = instCharge.data?.id;
    ok('bo\'lib to\'lash uchun qator yaratildi', !!instChargeId,
        JSON.stringify(instCharge.data).slice(0, 120));

    /* SUMMASIZ reja tuzib bo'lmaydi: qarz qatorlardan keladi. */
    const noRows = await api('POST', '/installments', {
        patientId, chargeIds: [], months: 3, startDate: today,
    });
    ok('qatorsiz reja RAD ETILDI', noRows.status === 400, `status: ${noRows.status}`);

    const plan = await api('POST', '/installments', {
        patientId, chargeIds: [instChargeId], months: 2, startDate: today,
    });
    const planId = plan.data?.id;
    ok('reja yaratildi', !!planId, `status: ${plan.status}, ${JSON.stringify(plan.data).slice(0, 140)}`);

    if (planId) {
        const items = plan.data?.items || [];
        ok('jadval ikki oyga bo\'lindi', items.length === 2, `qatorlar: ${items.length}`);
        ok('jadval yig\'indisi qarzga TENG',
            Math.round(items.reduce((s: number, i: any) => s + i.amount, 0)) === 200000,
            String(items.reduce((s: number, i: any) => s + i.amount, 0)));
        ok('reja summasi qatordan olindi', Math.round(plan.data?.totalAmount) === 200000,
            String(plan.data?.totalAmount));

        /* Bitta qator ikki rejada bo'lolmaydi. */
        const twice = await api('POST', '/installments', {
            patientId, chargeIds: [instChargeId], months: 3, startDate: today,
        });
        ok('bir qator ikkinchi rejaga TUSHMADI (409)', twice.status === 409,
            `status: ${twice.status}`);

        const itemId = items[0]?.id;
        if (itemId) {
            const balBeforeInst = await balanceOf(patientId);
            const payInst = await api('POST', `/installments/${itemId}/pay`, {
                paymentMethod: 'Balance', receivedByName: 'Sinov kassiri',
            });
            ok('avansdan to\'landi (200)', payInst.status === 200,
                `status: ${payInst.status}, ${JSON.stringify(payInst.data).slice(0, 140)}`);
            const balAfterInst = await balanceOf(patientId);
            ok('BALANS KAMAYDI',
                Math.round(balBeforeInst - balAfterInst) === Math.round(items[0].amount),
                `${balBeforeInst} → ${balAfterInst}, qator: ${items[0]?.amount}`);

            /* ENG MUHIMI: pul QATORGA tushdi. Ilgari chek yozilardi, qator
               esa «to'lanmagan» bo'lib qolaverardi — shifokor ulushi ham
               shu sababli nolga teng edi. */
            const fresh = ((await api('GET', `/charges?patientId=${patientId}`)).data || [])
                .find((c: any) => c.id === instChargeId);
            ok('qatorning to\'langan summasi oshdi',
                Math.round(fresh?.paidAmount || 0) === 100000, String(fresh?.paidAmount));
            ok('qator hali to\'liq to\'lanmagan', fresh?.status === 'Unpaid', String(fresh?.status));

            // Ikkinchi oy — qator to'liq yopiladi va reja tugaydi
            const second = await api('POST', `/installments/${items[1].id}/pay`, {
                paymentMethod: 'Cash',
            });
            ok('ikkinchi oy to\'landi', second.status === 200, `status: ${second.status}`);

            const done = ((await api('GET', `/charges?patientId=${patientId}`)).data || [])
                .find((c: any) => c.id === instChargeId);
            ok('qator TO\'LIQ to\'landi', done?.status === 'Paid', String(done?.status));

            const plans = (await api('GET', `/installments?patientId=${patientId}`)).data || [];
            const mine2 = plans.find((x: any) => x.id === planId);
            ok('reja yopildi', mine2?.status === 'Completed', String(mine2?.status));
            ok('rejada qarz qolmadi', Math.round(mine2?.due ?? -1) === 0, String(mine2?.due));

            /* To'langan oyi bor rejani o'chirib bo'lmaydi. */
            const del = await api('DELETE', `/installments/${planId}`);
            ok('to\'langan reja O\'CHIRILMADI (409)', del.status === 409, `status: ${del.status}`);
        }
    }

    console.log('\n═══ DIAGNOSTIKA: NATIJA TO\'LOVDAN KEYIN ══════════════');
    /* Laboratoriyada bu to'siq bor edi (402), diagnostikada YO'Q: UZI
       xulosasini to'lovsiz yozib, chop etib berish mumkin edi va qator
       «To'lanmagan» bo'lib qolaverardi. Bemor natijani olib ketgach,
       pulni undirish deyarli imkonsiz. */
    const stRes = await api('POST', '/studies', {
        patientId, patientName: 'Bemorov Sinov',
        modality: 'UZI', name: 'Qorin bo\'shlig\'i UZI', price: 180000,
    });
    const studyId = stRes.data?.id;
    ok('tekshiruv yaratildi', !!studyId, JSON.stringify(stRes.data).slice(0, 120));

    if (studyId) {
        const studyRow = async () =>
            ((await api('GET', '/studies')).data || []).find((x: any) => x.id === studyId);

        const before = await studyRow();
        ok('ro\'yxatda to\'lov holati bor: to\'lanmagan', before?.paid === false,
            `paid: ${before?.paid}`);
        ok('qarz summasi ko\'rsatilgan', Math.round(before?.due || 0) === 180000,
            `due: ${before?.due}`);

        const blocked = await api('PUT', `/studies/${studyId}`, {
            conclusion: 'Patologiya aniqlanmadi', status: 'Completed',
        });
        ok('TO\'LOVSIZ XULOSA RAD ETILDI (402)', blocked.status === 402,
            `status: ${blocked.status}`);
        ok('402 javobida qarz summasi bor', Math.round(blocked.data?.due || 0) === 180000,
            String(blocked.data?.due));

        const stillEmpty = await studyRow();
        ok('xulosa yozilmagan', !stillEmpty?.conclusion, String(stillEmpty?.conclusion));

        /* To'siq faqat NATIJAGA. Holatni «bajarilmoqda» ga o'tkazish
           to'lovsiz ham mumkin: bemor apparatga kirdi, pulni esa
           kassada keyinroq to'laydi. */
        const inProgress = await api('PUT', `/studies/${studyId}`, { status: 'InProgress' });
        ok('holatni o\'zgartirish to\'siqsiz o\'tdi', inProgress.status === 200,
            `status: ${inProgress.status}`);

        // Endi to'laymiz
        const chargeRow = ((await api('GET', `/charges?patientId=${patientId}`)).data || [])
            .find((c: any) => c.source === 'Study' && c.sourceId === studyId);
        ok('tekshiruv uchun hisob qatori yaratilgan', !!chargeRow);

        if (chargeRow) {
            const paidRes = await api('POST', '/payments', {
                chargeIds: [chargeRow.id], amount: 180000,
                payments: [{ method: 'Cash', amount: 180000 }],
            });
            ok('tekshiruv to\'landi', paidRes.status === 200,
                `status: ${paidRes.status}, ${JSON.stringify(paidRes.data).slice(0, 120)}`);

            const afterPay = await studyRow();
            ok('ro\'yxatda endi to\'langan', afterPay?.paid === true, `paid: ${afterPay?.paid}`);
            ok('qarz nolga tushdi', Math.round(afterPay?.due || 0) === 0, `due: ${afterPay?.due}`);

            const allowed = await api('PUT', `/studies/${studyId}`, {
                conclusion: 'Patologiya aniqlanmadi', status: 'Completed',
            });
            ok('to\'lovdan keyin xulosa yozildi', allowed.status === 200,
                `status: ${allowed.status}`);
            ok('xulosa saqlandi', (await studyRow())?.conclusion === 'Patologiya aniqlanmadi');
        }
    }

    console.log('\n═══ FIX MAOSH VEDOMOSTGA TUSHADI ═════════════════');
    /* `salaryType` va `fixedSalary` shifokor formasida anchadan beri
       tahrirlanardi, lekin vedomost ularni O'QIMASDI: fix maoshli
       shifokor faqat foizini ko'rardi, oylikni esa kassir qo'lda
       «Boshqa xarajat» bilan yozardi. */
    const salaryMonth = new Date();
    const mFrom = `${salaryMonth.getFullYear()}-${String(salaryMonth.getMonth() + 1).padStart(2, '0')}-01`;
    const mLast = new Date(salaryMonth.getFullYear(), salaryMonth.getMonth() + 1, 0).getDate();
    const mTo = `${salaryMonth.getFullYear()}-${String(salaryMonth.getMonth() + 1).padStart(2, '0')}-${String(mLast).padStart(2, '0')}`;

    const salaryDoc = await api('POST', '/doctors', {
        firstName: 'Fix', lastName: `Maoshov${Date.now() % 100000}`,
        specialty: 'Terapevt', phone: '+998900000777', status: 'Active',
        username: `fixdoc${Date.now() % 1000000}`, password: 'testpass123',
        percentage: 0, salaryType: 'fixed', fixedSalary: 3000000,
    });
    const salaryDocId = salaryDoc.data?.id;
    ok('fix maoshli shifokor yaratildi', !!salaryDocId,
        `status: ${salaryDoc.status}, ${JSON.stringify(salaryDoc.data).slice(0, 140)}`);

    if (salaryDocId) {
        const preview = await api('GET', `/payroll/preview?from=${mFrom}&to=${mTo}`);
        ok('vedomost oldindan hisobi olindi', preview.status === 200, `status: ${preview.status}`);

        const row = (preview.data?.lines || []).find((l: any) => l.doctorId === salaryDocId);
        ok('TO\'LOVSIZ ham vedomostda qatori bor', !!row,
            `qatorlar: ${(preview.data?.lines || []).length}`);
        ok('to\'liq oyga fix maosh to\'liq hisoblandi',
            Math.round(row?.fixed || 0) === 3000000, String(row?.fixed));
        ok('hisoblangan summa fix maoshga teng',
            Math.round(row?.accrued || 0) === 3000000, String(row?.accrued));

        /* Yarim oy — yarim maosh. Davr kunlari bo'yicha taqsimlanadi. */
        const half = Math.floor(mLast / 2);
        const halfTo = `${mFrom.slice(0, 8)}${String(half).padStart(2, '0')}`;
        const p2 = await api('GET', `/payroll/preview?from=${mFrom}&to=${halfTo}`);
        const row2 = (p2.data?.lines || []).find((l: any) => l.doctorId === salaryDocId);
        const expectHalf = Math.round(3000000 * (half / mLast));
        ok('yarim davrga maosh KUNLAR bo\'yicha bo\'lindi',
            Math.abs((row2?.fixed || 0) - expectHalf) <= 1,
            `kutilgan ~${expectHalf}, bor ${row2?.fixed}`);

        /* `none` — standart qiymat. Uni «hech narsa» deb talqin qilish
           ishlab turgan klinikalarning vedomostini nolga tushirardi,
           shuning uchun u foiz bo'lib qoladi. */
        const plainDoc = await api('POST', '/doctors', {
            firstName: 'Foiz', lastName: `Ulushov${Date.now() % 100000}`,
            specialty: 'Terapevt', phone: '+998900000778', status: 'Active',
            username: `pctdoc${Date.now() % 1000000}`, password: 'testpass123',
            percentage: 40,
        });
        if (plainDoc.data?.id) {
            const p3 = await api('GET', `/payroll/preview?from=${mFrom}&to=${mTo}`);
            const row3 = (p3.data?.lines || []).find((l: any) => l.doctorId === plainDoc.data.id);
            ok('foizli shifokorga fix maosh QO\'SHILMADI', !row3 || (row3.fixed || 0) === 0,
                String(row3?.fixed));
        }
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
