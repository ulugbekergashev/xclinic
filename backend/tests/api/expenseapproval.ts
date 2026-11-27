/* XARAJATNI TASDIQLASH VA BO'LIM BYUDJETI (2026-11-26, migratsiya 0048).

   ASOSIY SAVOLLAR:
     1. Chegara yo'q (dastlab) — registrator xarajati darhol yoziladi.
     2. Chegara bor: kattasi — Pending, kichigi — Approved; egasiniki — doim Approved.
     3. Pending xarajat kassa hisobiga ham, hisobotga ham tushmaydi.
     4. Tasdiqlash — bugungi xarajat, hisobotga tushadi; ikkinchi marta — 409.
        Rad etish — hech qayerda sanalmaydi.
     5. Registrator tasdiqlay/rad eta olmaydi va sozlamani o'zgartira olmaydi (403).
     6. Byudjet: «sarflandi» = Hisobot → Bo'limlardagi xarajat; byudjetsiz bo'lim chiqmaydi.

   Ishga tushirish: cd backend && T_ONLY=expenseapproval npm run test:api
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

const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const api = (m: string, p: string, b?: any, tk = token) => call(m, p, b, tk);
    const clinicId = login.data?.user?.clinicId || (await api('GET', '/clinics')).data?.[0]?.id;
    const tag = String(Date.now()).slice(-6);

    const recUser = `exprec${tag}`;
    const rec = await api('POST', '/receptionists', { firstName: 'Xarajat', lastName: `Kassir${tag}`, phone: `+99891${tag}2`, username: recUser, password: 'testpass123' });
    ok('registrator yaratildi', rec.status === 200, `${rec.status}`);
    const recToken = (await call('POST', '/auth/login', { username: recUser, password: 'testpass123' })).data?.token;
    ok('registrator kirdi', !!recToken);

    const dep = (await api('POST', '/departments', { name: `Byudjet ${tag}`, code: `B${tag}`, type: 'CLINICAL' })).data;
    ok("bo'lim yaratildi", !!dep?.id, JSON.stringify(dep).slice(0, 100));
    const before = (await api('GET', `/clinics/${clinicId}`)).data;

    /* Kassa kutilayotgan summasi — kassa hisobini tekshirish uchun */
    const expected = async () => (await api('GET', `/cash-register/expected?date=${today()}`)).data;
    const summary = async () => (await api('GET', `/reports/summary?from=${today()}&to=${today()}`)).data;
    const deptExpense = async () => ((await api('GET', `/reports/departments?from=${today()}&to=${today()}`)).data?.departments || [])
        .find((r: any) => r.departmentId === dep.id)?.expense || 0;
    const mk = (amount: number, tk = recToken, extra: any = {}) => api('POST', '/expenses', {
        amount, category: 'Utilities', title: `Sinov ${tag}`, method: 'Cash', departmentId: dep.id, ...extra,
    }, tk);

    try {
        console.log("\n═══ 1. CHEGARA YO'Q — AVVALGIDEK ═══════════════════════");
        let r = await mk(2_000_000);
        ok('2 mln — darhol yozildi (Approved)', r.status === 200 && r.data?.status === 'Approved', `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
        if (r.data?.id) await api('DELETE', `/expenses/${r.data.id}`);

        console.log('\n═══ 2. CHEGARA BOR ═══════════════════════════════════');
        r = await api('PUT', `/clinics/${clinicId}/expense-settings`, { expenseApprovalThreshold: 1_000_000 }, recToken);
        ok('registrator chegarani o\'zgartira olmaydi — 403', r.status === 403, `${r.status}`);
        r = await api('PUT', `/clinics/${clinicId}/expense-settings`, { expenseApprovalThreshold: 1_000_000, budgets: [{ departmentId: dep.id, monthlyBudget: 5_000_000 }] });
        ok('ega chegara va byudjet qo\'ydi', r.status === 200 && r.data?.expenseApprovalThreshold === 1_000_000, `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);

        const exp0 = await expected();
        const sum0 = await summary();
        const dep0 = await deptExpense();

        const big = await mk(2_000_000);
        ok('2 mln (registrator) — Pending', big.data?.status === 'Pending' && !!big.data?.requestedByName, JSON.stringify(big.data).slice(0, 140));
        const small = await mk(300_000);
        ok('300 ming — darhol (Approved)', small.data?.status === 'Approved', JSON.stringify(small.data?.status));
        const own = await mk(5_000_000, token, { category: 'Other' });
        ok('egasi yozgan 5 mln — Approved', own.data?.status === 'Approved', JSON.stringify(own.data?.status));

        console.log('\n═══ 3. PENDING HECH QAYERDA SANALMAYDI ════════════════');
        const exp1 = await expected();
        const cashKey = 'expectedCash';
        const d1 = Number(exp0?.[cashKey] ?? 0) - Number(exp1?.[cashKey] ?? 0);
        ok('kassadan faqat 300 ming + 5 mln chiqdi (2 mln emas)', Math.round(d1) === 5_300_000, `${cashKey}: ${exp0?.[cashKey]} → ${exp1?.[cashKey]}`);
        const sum1 = await summary();
        const sumKey = 'otherExpenses';
        const sv = (x: any) => Number(x?.totals?.[sumKey] ?? 0);
        ok('hisobotda 2 mln yo\'q', Math.round(sv(sum1) - sv(sum0)) === 5_300_000, `${sumKey}: ${sv(sum0)} → ${sv(sum1)}`);
        ok('Bo\'limlar hisobotida ham yo\'q', Math.round((await deptExpense()) - dep0) === 5_300_000, `${dep0} → ${await deptExpense()}`);

        console.log('\n═══ 4. TASDIQLASH / RAD ETISH ═════════════════════════');
        r = await api('POST', `/expenses/${big.data.id}/approve`, undefined, recToken);
        ok('registrator tasdiqlay olmaydi — 403', r.status === 403, `${r.status}`);
        r = await api('POST', `/expenses/${big.data.id}/approve`);
        ok('ega tasdiqladi — bugungi kun', r.status === 200 && r.data?.status === 'Approved' && r.data?.date === today() && !!r.data?.decidedByName, `${r.status} ${JSON.stringify(r.data).slice(0, 140)}`);
        r = await api('POST', `/expenses/${big.data.id}/approve`);
        ok('qayta tasdiqlash — 409', r.status === 409, `${r.status}`);
        ok('endi Bo\'limlar hisobotida 7,3 mln', Math.round((await deptExpense()) - dep0) === 7_300_000, String(await deptExpense()));

        const big2 = await mk(1_500_000);
        r = await api('POST', `/expenses/${big2.data.id}/reject`);
        ok('rad etildi — yozuv qoldi', r.status === 200 && r.data?.status === 'Rejected', `${r.status}`);
        ok('rad etilgani sanalmaydi', Math.round((await deptExpense()) - dep0) === 7_300_000, String(await deptExpense()));

        /* Tahrir orqali chegarani aylanib o'tib bo'lmaydi (ega tahrir huquqini bergan xodim) */
        const list = (await api('GET', '/expenses')).data || [];
        ok('ro\'yxatda holatlar bor', list.some((e: any) => e.id === big2.data.id && e.status === 'Rejected'));

        console.log("\n═══ 5. BYUDJET ════════════════════════════════════════");
        const b = (await api('GET', `/reports/department-budget?month=${today().slice(0, 7)}`)).data;
        const row = b?.rows?.find((x: any) => x.departmentId === dep.id);
        const monthDept = ((await api('GET', `/reports/departments?from=${today().slice(0, 7)}-01&to=${today()}`)).data);
        const monthRows = monthDept?.departments || [];
        const monthExp = monthRows.find?.((x: any) => x.departmentId === dep.id)?.expense || 0;
        ok('byudjet: 5 mln, sarflandi = Bo\'limlar hisobotidagi son', row?.budget === 5_000_000 && row?.spent === monthExp, `${JSON.stringify(row)} vs ${monthExp}`);
        r = await api('GET', '/reports/department-budget', undefined, recToken);
        ok('registrator byudjetni ko\'rmaydi', r.status === 403, `${r.status}`);
        await api('PUT', `/clinics/${clinicId}/expense-settings`, { budgets: [{ departmentId: dep.id, monthlyBudget: null }] });
        const b2 = (await api('GET', '/reports/department-budget')).data;
        ok('byudjet olib tashlangan bo\'lim chiqmaydi', !b2?.rows?.some((x: any) => x.departmentId === dep.id));

        for (const e of [big, small, own, big2]) if (e.data?.id) await api('DELETE', `/expenses/${e.data.id}`);
    } finally {
        await api('PUT', `/clinics/${clinicId}/expense-settings`, { expenseApprovalThreshold: before?.expenseApprovalThreshold ?? null });
    }
    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
