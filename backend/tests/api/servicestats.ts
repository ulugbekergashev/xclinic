/* XIZMATLAR HISOBOTI va BO'LIMLAR ustunlari sinovi (2026-11-26).

   ASOSIY SAVOLLAR:
     1. `/api/reports/services` jami Umumiydagi «Xizmatlar» bilan bir xilmi?
        Bo'lim bo'yicha yig'indi Bo'limlar jadvalidagi o'sha bo'lim bilan-chi?
     2. Xizmat qatori: soni (× miqdor), summa, chegirma, narxnoma narxi to'g'rimi?
        Retsepti yo'q xizmatda material — null (0 emas), retsept qo'shilsa —
        narx × miqdor × soni.
     3. Tahlil buyurtmasi (bitta kassa qatori) tahlilma-tahlil yoyiladimi va
        bo'laklar yig'indisi qatorning o'zi bilan so'mma-so'm tengmi?
     4. Bo'limlar: «Bemorlar» va «O'rtacha chek» bor; jami bemorlar — klinika
        bo'yicha har xil bemor (bo'limlar yig'indisidan oshmaydi).

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

const tashkentDay = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const api = (m: string, p: string, b?: any) => call(m, p, b, token);
    const today = tashkentDay();
    const tag = String(Date.now()).slice(-6);
    const q = `from=${today}&to=${today}`;

    console.log('\n═══ 1. MA\'LUMOT: bo\'lim, xizmat, qabul, chegirma ═════');
    const dept = (await api('POST', '/departments', { name: `Sinov bo'limi ${tag}`, code: `S${tag}` })).data;
    ok('bo\'lim yaratildi', !!dept?.id, JSON.stringify(dept).slice(0, 100));
    const svc = (await api('POST', '/services', { name: `Hisobot xizmati ${tag}`, price: 100000, duration: 20 })).data;
    ok('xizmat yaratildi', !!svc?.id);
    const unsoldSvc = (await api('POST', '/services', { name: `Hech kim olmagan ${tag}`, price: 55000, duration: 10 })).data;
    const p = (await api('POST', '/patients', { firstName: 'Xizmat', lastName: `Sinov${tag}`, gender: 'Male', phone: `+99897${tag}1`, force: true })).data;
    const visit = (await api('POST', '/visits', { patientId: p.id, departmentId: dept.id, status: 'Waiting' })).data;
    ok('bo\'lim qabuli ochildi', !!visit?.id, JSON.stringify(visit).slice(0, 100));
    const ch = await api('POST', '/charges', {
        visitId: visit.id, patientId: p.id, patientName: `Sinov${tag} Xizmat`, source: 'Service',
        name: svc.name, serviceId: svc.id, unitPrice: 100000, quantity: 2, discount: 20000,
    });
    ok('2 ta xizmat, 20 000 chegirma bilan yozildi', ch.status === 200 && ch.data?.total === 180000, `status ${ch.status}, total ${ch.data?.total}`);

    console.log('\n═══ 2. XIZMAT QATORI ════════════════════════════════');
    let r = await api('GET', `/reports/services?${q}`);
    ok('endpoint 200 qaytardi', r.status === 200, `status ${r.status}`);
    if (r.status !== 200) return finish();
    const row = (r.data.services || []).find((x: any) => x.serviceId === svc.id);
    ok('xizmat qatori bor', !!row);
    ok('soni = 2 (miqdor hisobga olindi)', row?.count === 2, String(row?.count));
    ok('summa = 180 000', row?.revenue === 180000, String(row?.revenue));
    ok('chegirma = 20 000', row?.discount === 20000, String(row?.discount));
    ok('narxnoma narxi = 100 000', row?.listPrice === 100000, String(row?.listPrice));
    ok('bo\'limi to\'g\'ri', row?.departmentId === dept.id, String(row?.departmentId));
    ok('retsepti yo\'q — material null (0 emas)', row?.materialCost === null, String(row?.materialCost));
    ok('olinmagan xizmat «bajarilmagan» ro\'yxatida', (r.data.unsold || []).some((u: any) => u.serviceId === unsoldSvc?.id));
    ok('olingan xizmat «bajarilmagan» da yo\'q', !(r.data.unsold || []).some((u: any) => u.serviceId === svc.id));

    const item = (await api('POST', '/inventory', { name: `Hisobot material ${tag}`, unit: 'dona', quantity: 0, price: 3000, isConsumable: true })).data;
    const rec = await api('PUT', `/service-recipes/${svc.id}`, { lines: [{ itemId: item.id, quantity: 2 }] });
    ok('retsept saqlandi', rec.status === 200, `status ${rec.status}`);
    r = await api('GET', `/reports/services?${q}`);
    const row2 = (r.data.services || []).find((x: any) => x.serviceId === svc.id);
    ok('material = 3 000 × 2 × 2 = 12 000', row2?.materialCost === 12000, String(row2?.materialCost));

    console.log('\n═══ 3. TAHLIL — tahlilma-tahlil ═════════════════════');
    const t1 = (await api('POST', '/lab-tests', { name: `Qand ${tag}`, code: `Q${tag}`, price: 30000, cost: 5000 })).data;
    const t2 = (await api('POST', '/lab-tests', { name: `ALT ${tag}`, code: `A${tag}`, price: 70000 })).data;
    const order = await api('POST', '/lab-orders', { patientId: p.id, patientName: `Sinov${tag} Xizmat`, testIds: [t1.id, t2.id] });
    ok('ikki tahlilli yo\'llanma', order.status === 200, `status ${order.status}`);
    const labCharge = ((await api('GET', `/charges?patientId=${p.id}`)).data || []).find((c: any) => c.source === 'Lab' && c.sourceId === order.data?.id);
    ok('kassada bitta tahlil qatori', !!labCharge, '');
    if (labCharge) {
        const dsc = await api('PUT', `/charges/${labCharge.id}/discount`, { discount: 10000 });
        ok('tahlil qatoriga chegirma berildi', dsc.status === 200, `status ${dsc.status}`);
    }
    r = await api('GET', `/reports/services?${q}`);
    const lab1 = (r.data.services || []).find((x: any) => x.key.startsWith(`lab:${t1.id}`));
    const lab2 = (r.data.services || []).find((x: any) => x.key.startsWith(`lab:${t2.id}`));
    ok('ikkala tahlil alohida qator', !!lab1 && !!lab2);
    const labNow = ((await api('GET', `/charges?patientId=${p.id}`)).data || []).find((c: any) => c.id === labCharge?.id);
    ok('bo\'laklar yig\'indisi = kassa qatori', (lab1?.revenue || 0) + (lab2?.revenue || 0) === labNow?.total,
        `${lab1?.revenue} + ${lab2?.revenue} ≠ ${labNow?.total}`);
    ok('tahlil tannarxi — kartadan (5 000)', lab1?.materialCost === 5000, String(lab1?.materialCost));
    ok('tannarxi yo\'q tahlil — null', lab2?.materialCost === null, String(lab2?.materialCost));

    console.log('\n═══ 4. MOSLIK — Umumiy va Bo\'limlar bilan ═════════════');
    const sum = (await api('GET', `/reports/summary?${q}`)).data;
    ok('jami = Umumiydagi «Xizmatlar»', r.data.totals.revenue === sum?.totals?.revenue, `${r.data.totals.revenue} ≠ ${sum?.totals?.revenue}`);
    const cmp = (await api('GET', `/reports/compare?${q}`)).data;
    ok("o'tgan davr jami = Umumiydagi solishtirish", r.data.totals.prevRevenue === cmp?.previous?.revenue,
        `${r.data.totals.prevRevenue} ≠ ${cmp?.previous?.revenue}`);
    const rowsSum = (r.data.services || []).reduce((s: number, x: any) => s + x.revenue, 0);
    ok('qatorlar yig\'indisi = jami', rowsSum === r.data.totals.revenue, `${rowsSum} ≠ ${r.data.totals.revenue}`);
    const deps = (await api('GET', `/reports/departments?${q}`)).data;
    let allMatch = true; let why = '';
    for (const d of deps?.departments || []) {
        const s = (r.data.services || []).filter((x: any) => (x.departmentId || null) === (d.departmentId || null)).reduce((a: number, x: any) => a + x.revenue, 0);
        if (Math.round(s) !== Math.round(d.revenue)) { allMatch = false; why = `${d.name}: ${s} ≠ ${d.revenue}`; }
    }
    ok('har bo\'lim: xizmatlar yig\'indisi = Bo\'limlar jadvali', allMatch, why);
    const sumDept = (sum?.byDepartment || []).find((d: any) => d.departmentId === dept.id);
    const depRow = (deps?.departments || []).find((d: any) => d.departmentId === dept.id);
    ok('Umumiydagi bo\'lim taqsimoti ham bir xil', sumDept?.revenue === depRow?.revenue, `${sumDept?.revenue} ≠ ${depRow?.revenue}`);
    ok('bo\'limda bemorlar soni = 1', depRow?.patients === 1, String(depRow?.patients));
    ok('o\'rtacha chek = 180 000 (bitta qabul)', depRow?.avgCheck === 180000, String(depRow?.avgCheck));
    const perDept = (deps?.departments || []).reduce((s: number, d: any) => s + (d.patients || 0), 0);
    ok('jami bemorlar ≤ bo\'limlar yig\'indisi (har xil bemor)', deps?.totals?.patients >= 1 && deps.totals.patients <= perDept,
        `${deps?.totals?.patients} / ${perDept}`);

    console.log('\n═══ 5. RUXSAT ═════════════════════════════════════');
    const anon = await call('GET', `/reports/services?${q}`);
    ok('kirmagan foydalanuvchiga yopiq', anon.status === 401 || anon.status === 403, `status ${anon.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
