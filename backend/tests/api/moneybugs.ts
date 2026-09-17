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
    /* Davr — O'TGAN oy: u to'liq tugagan, ya'ni fix maosh to'liq
       hisoblanadi. Joriy oy yaramaydi: hali ishlanmagan kunlar uchun pul
       hisoblanmaydi (vedomost davr oxirini BUGUNGI kun bilan cheklaydi). */
    const nowTk = new Date();
    const prevMonth = new Date(nowTk.getFullYear(), nowTk.getMonth() - 1, 1);
    const py = prevMonth.getFullYear();
    const pm = String(prevMonth.getMonth() + 1).padStart(2, '0');
    const mLast = new Date(py, prevMonth.getMonth() + 1, 0).getDate();
    const mFrom = `${py}-${pm}-01`;
    const mTo = `${py}-${pm}-${String(mLast).padStart(2, '0')}`;

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
        // O'tgan oyning yarmi — u ham to'liq tugagan davr.
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

    await auditMoneyFixes();

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

/* ═══ AUDIT TUZATISHLARI (2026-09) ════════════════════════════════════════
   Beshta pul xatosi, har biri HTTP orqali:
     1. qisman to'langan qator bekor qilinardi (muolaja/tekshiruv o'chirilganda);
     2. bitta to'lov ikki bemorning qatorini yopardi;
     3. SMS dagi {qarz} va «qarzdorlar» filtri eski modeldan sanalardi;
     4. bosh sahifa avansdan to'lovni tushumga ikkinchi marta qo'shardi;
     5. tekshiruv narxi brauzerdan olinardi va tahrirda kassaga yetmasdi. */
async function auditMoneyFixes() {
    const chargeById = async (patientId: string, id: string) =>
        ((await api('GET', `/charges?patientId=${patientId}&status=`)).data || [])
            .find((c: any) => c.id === id)
        || ((await api('GET', `/charges?patientId=${patientId}&status=Cancelled`)).data || [])
            .find((c: any) => c.id === id);

    const tagA = String(Date.now()).slice(-7);
    const pa = (await api('POST', '/patients', {
        firstName: 'Qisman', lastName: `Tolov${tagA}`, gender: 'Male', phone: `+99897${tagA}`, force: true,
    })).data;
    const pb = (await api('POST', '/patients', {
        firstName: 'Boshqa', lastName: `Bemor${tagA}`, gender: 'Female', phone: `+99898${tagA}`, force: true,
    })).data;
    ok('audit bemorlari yaratildi', !!pa?.id && !!pb?.id, JSON.stringify(pa).slice(0, 100));
    if (!pa?.id || !pb?.id) return;
    const nameA = `${pa.lastName} ${pa.firstName}`;
    const nameB = `${pb.lastName} ${pb.firstName}`;

    console.log('\n═══ AUDIT 1. QISMAN TO\'LANGAN QATOR BEKOR QILINMAYDI ═══');
    const va = (await api('POST', '/visits', { patientId: pa.id, force: true })).data;
    const proc = await api('POST', `/visits/${va?.id}/procedures`, { procedureName: 'Audit muolajasi', price: 100000 });
    ok("muolaja qo'shildi", proc.status === 200, `status: ${proc.status}, ${JSON.stringify(proc.data).slice(0, 100)}`);
    const procCharge = ((await api('GET', `/visits/${va?.id}/charges`)).data?.charges || [])
        .find((c: any) => c.source === 'Service' && c.sourceId === proc.data?.id);
    ok('muolaja qatori yaratildi', !!procCharge);

    if (proc.data?.id && procCharge) {
        const part = await api('POST', '/payments', { chargeIds: [procCharge.id], amount: 30000, method: 'Cash' });
        ok("qisman to'landi (30 000 / 100 000)", part.status === 200, `status: ${part.status}`);

        const delProc = await api('DELETE', `/visit-procedures/${proc.data.id}`);
        ok("qisman to'langan muolaja O'CHIRILMADI (409)", delProc.status === 409,
            `status: ${delProc.status}, ${JSON.stringify(delProc.data).slice(0, 120)}`);
        ok('sabab CHARGE_HAS_PAYMENT', delProc.data?.code === 'CHARGE_HAS_PAYMENT', String(delProc.data?.code));

        const kept = await chargeById(pa.id, procCharge.id);
        ok('QATOR BEKOR QILINMADI (Unpaid, 30 000 to\'langan)',
            kept?.status === 'Unpaid' && Math.round(kept?.paidAmount) === 30000,
            `${kept?.status}, ${kept?.paidAmount}`);

        const delCharge = await api('DELETE', `/charges/${procCharge.id}`);
        ok("qatorni to'g'ridan-to'g'ri o'chirish ham RAD ETILDI (409)", delCharge.status === 409,
            `status: ${delCharge.status}`);

        const back = await api('POST', `/charges/${procCharge.id}/refund`, { amount: 30000, method: 'Cash', reason: 'audit' });
        ok('pul qaytarildi', back.status === 200, `status: ${back.status}`);
        const delAfter = await api('DELETE', `/visit-procedures/${proc.data.id}`);
        ok("qaytarishdan keyin muolaja o'chdi", delAfter.status === 200, `status: ${delAfter.status}`);
        const gone = await chargeById(pa.id, procCharge.id);
        ok('endi qator bekor qilindi', gone?.status === 'Cancelled', String(gone?.status));
    }

    /* Tekshiruv ham xuddi shunday: qisman to'langan UZI o'chirilmaydi. */
    const st = await api('POST', '/studies', {
        patientId: pa.id, patientName: nameA, modality: 'UZI', name: 'Audit UZI', price: 80000,
    });
    const stCharge = ((await api('GET', `/charges?patientId=${pa.id}`)).data || [])
        .find((c: any) => c.source === 'Study' && c.sourceId === st.data?.id);
    if (st.data?.id && stCharge) {
        await api('POST', '/payments', { chargeIds: [stCharge.id], amount: 10000, method: 'Cash' });
        const delSt = await api('DELETE', `/studies/${st.data.id}`);
        ok("qisman to'langan tekshiruv O'CHIRILMADI (409)", delSt.status === 409, `status: ${delSt.status}`);
        const stillSt = ((await api('GET', `/studies?patientId=${pa.id}`)).data || []).some((s: any) => s.id === st.data.id);
        ok('tekshiruv joyida qoldi', stillSt);
    } else {
        ok('audit tekshiruvi va qatori yaratildi', false, `status: ${st.status}`);
    }

    /* Meros holat: bekor qilingan, lekin puli olingan qator (tuzatishdan
       oldin yaratilgan). Qaytarish uni 'Unpaid' ga TIRILTIRMASLIGI kerak. */
    const dbPath = process.env.T_DB;
    if (dbPath) {
        const legacy = await api('POST', '/charges', { patientId: pa.id, patientName: nameA, name: 'Meros qator', unitPrice: 50000, quantity: 1 });
        await api('POST', '/payments', { chargeIds: [legacy.data?.id], amount: 20000, method: 'Cash' });
        const Database = require('better-sqlite3');
        const db = new Database(dbPath);
        db.prepare("UPDATE VisitCharge SET status = 'Cancelled' WHERE id = ?").run(legacy.data?.id);
        db.close();
        const r2 = await api('POST', `/charges/${legacy.data?.id}/refund`, { amount: 20000, method: 'Cash', reason: 'meros' });
        ok("bekor qilingan qatorning puli qaytarildi", r2.status === 200, `status: ${r2.status}`);
        ok("qator BEKORLIGICHA QOLDI ('Unpaid' ga tirilmadi)", r2.data?.charge?.status === 'Cancelled',
            String(r2.data?.charge?.status));
    } else {
        console.log('  ⏭  T_DB berilmagan — meros qator sinovi o\'tkazib yuborildi');
    }

    console.log('\n═══ AUDIT 2. BITTA TO\'LOV — BITTA BEMOR ═══════════════');
    const ca = await api('POST', '/charges', { patientId: pa.id, patientName: nameA, name: 'A qatori', unitPrice: 40000, quantity: 1 });
    const cb = await api('POST', '/charges', { patientId: pb.id, patientName: nameB, name: 'B qatori', unitPrice: 60000, quantity: 1 });
    ok('ikki bemorga qator yozildi', !!ca.data?.id && !!cb.data?.id);
    const txBefore = ((await api('GET', `/transactions?patientId=${pa.id}`)).data || []).length;
    const mixed = await api('POST', '/payments', { chargeIds: [ca.data?.id, cb.data?.id], method: 'Cash' });
    ok("ikki bemorning qatori bitta to'lovda RAD ETILDI (400)", mixed.status === 400,
        `status: ${mixed.status}, ${JSON.stringify(mixed.data).slice(0, 120)}`);
    ok('sabab MIXED_PATIENTS', mixed.data?.code === 'MIXED_PATIENTS', String(mixed.data?.code));
    const txAfter = ((await api('GET', `/transactions?patientId=${pa.id}`)).data || []).length;
    ok('chek yozilmadi', txAfter === txBefore, `${txBefore} → ${txAfter}`);
    ok("B qatori to'lanmagan qoldi",
        Math.round((await chargeById(pb.id, cb.data?.id))?.paidAmount || 0) === 0);

    console.log('\n═══ AUDIT 3. SMS: {qarz} HISOB QATORLARIDAN ═══════════');
    await api('POST', '/payments', { chargeIds: [cb.data?.id], amount: 15000, method: 'Cash' });
    const debtSegment = {
        match: 'all',
        conditions: [
            { field: 'hasDebt', op: 'is_true' },
            // Ro'yxat 500 bilan cheklangan — faqat bugun yaratilganlar
            { field: 'registered', op: 'within', value: 1 },
        ],
    };
    const aud = await api('POST', '/messages/audience', { segment: debtSegment, channel: 'sms' });
    ok('auditoriya hisoblandi', aud.status === 200, `status: ${aud.status}`);
    const rowB = (aud.data?.recipients || []).find((r: any) => r.id === pb.id);
    ok("qarzdor QATORLAR bo'yicha topildi", !!rowB, `topildi: ${(aud.data?.recipients || []).length}`);
    ok('{qarz} = total − paidAmount (60 000 − 15 000 = 45 000)', Math.round(rowB?.debt || 0) === 45000,
        String(rowB?.debt));

    console.log('\n═══ AUDIT 4. BOSH SAHIFA: AVANSDAN TO\'LOV TUSHUM EMAS ══');
    const adv = await api('POST', '/payments/advance', { patientId: pa.id, amount: 100000, method: 'Cash' });
    ok('avans qabul qilindi', adv.status === 200, `status: ${adv.status}`);
    const revenue = async () => (await api('GET', '/reports/dashboard')).data?.today?.revenue;
    const rev0 = await revenue();
    const byBalance = await api('POST', '/payments', { chargeIds: [ca.data?.id], amount: 40000, method: 'Balance' });
    ok("avansdan to'landi", byBalance.status === 200, `status: ${byBalance.status}`);
    const rev1 = await revenue();
    ok("AVANSDAN TO'LOV bugungi tushumga QO'SHILMADI", rev1 === rev0, `${rev0} → ${rev1}`);
    const byCash = await api('POST', '/payments', { chargeIds: [cb.data?.id], amount: 45000, method: 'Cash' });
    ok("naqd to'landi", byCash.status === 200, `status: ${byCash.status}`);
    const rev2 = await revenue();
    ok("naqd to'lov tushumga qo'shildi (+45 000)", rev2 === rev1 + 45000, `${rev1} → ${rev2}`);

    const aud2 = await api('POST', '/messages/audience', { segment: debtSegment, channel: 'sms' });
    ok("to'liq to'lagan bemor qarzdorlar ro'yxatidan CHIQDI",
        !(aud2.data?.recipients || []).some((r: any) => r.id === pb.id));

    console.log('\n═══ AUDIT 5. TEKSHIRUV NARXI KATALOGDAN ══════════════');
    const svc = (await api('POST', '/services', { name: `Audit UZI xizmati ${tagA}`, price: 150000, duration: 20 })).data;
    ok('katalog xizmati yaratildi', !!svc?.id, JSON.stringify(svc).slice(0, 100));
    if (svc?.id) {
        const st2 = await api('POST', '/studies', {
            patientId: pb.id, patientName: nameB, modality: 'UZI', name: 'Katalog UZI',
            serviceId: svc.id, price: 1,
        });
        ok('tekshiruv yaratildi', st2.status === 200, `status: ${st2.status}`);
        ok("narx BRAUZERDAN EMAS, katalogdan (150 000)", Math.round(st2.data?.price) === 150000, String(st2.data?.price));
        const c2 = () => api('GET', `/charges?patientId=${pb.id}`).then((r) =>
            (r.data || []).find((c: any) => c.source === 'Study' && c.sourceId === st2.data?.id));
        ok('kassadagi qator ham 150 000', Math.round((await c2())?.total || 0) === 150000);

        const edit = await api('PUT', `/studies/${st2.data?.id}`, { price: 120000 });
        ok('narx tahrirlandi', edit.status === 200, `status: ${edit.status}`);
        ok("KASSADAGI QATOR HAM O'ZGARDI (120 000)", Math.round((await c2())?.total || 0) === 120000,
            String((await c2())?.total));

        const charge2 = await c2();
        await api('POST', '/payments', { chargeIds: [charge2?.id], amount: 20000, method: 'Cash' });
        const edit2 = await api('PUT', `/studies/${st2.data?.id}`, { price: 90000 });
        ok("puli olingan tekshiruv narxi o'zgarmadi (409)", edit2.status === 409, `status: ${edit2.status}`);
        ok('qator summasi joyida (120 000)', Math.round((await c2())?.total || 0) === 120000);

        const badSvc = await api('POST', '/studies', {
            patientId: pb.id, patientName: nameB, modality: 'UZI', name: 'Yoq xizmat', serviceId: 99999999, price: 5,
        });
        ok("mavjud bo'lmagan xizmat rad etildi (404)", badSvc.status === 404, `status: ${badSvc.status}`);
    }
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
