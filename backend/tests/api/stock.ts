/* 7.4 sinovi: ombor atomarligi.

   Asosiy invariant: mahsulot qoldig'i = StockMovement qatorlari yig'indisi
   va partiya qoldiqlari bilan kelishilgan bo'lishi kerak.

   Ishga tushirish: cd backend && npx ts-node --transpile-only _t_stock.ts <token>
*/
const BASE = process.env.T_BASE || 'http://localhost:3094';
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

const itemById = async (id: string) =>
    ((await api('GET', '/inventory')).data || []).find((i: any) => i.id === id);

async function movementSum(itemId: string) {
    const moves = (await api('GET', `/stock-movements?itemId=${itemId}`)).data || [];
    // 'Transfer' umumiy qoldiqni o'zgartirmaydi — yig'indiga kirmaydi
    return moves.filter((m: any) => m.type !== 'Transfer')
        .reduce((s: number, m: any) => s + m.quantity, 0);
}

async function main() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }

    console.log('\n═══ TAYYORGARLIK ═══════════════════════════════════');
    const created = await api('POST', '/inventory', {
        name: `Sinov material ${Date.now() % 100000}`, unit: 'dona',
        quantity: 0, minQuantity: 0, price: 1000, isConsumable: true,
    });
    const itemId = created.data?.id;
    ok('material yaratildi', !!itemId, JSON.stringify(created.data).slice(0, 120));
    if (!itemId) process.exit(1);

    // Uch partiya, turli muddat bilan — FEFO tartibini tekshirish uchun
    await api('POST', '/stock-movements/in', { itemId, quantity: 10, cost: 100, batchNumber: 'B-KECH', expiryDate: '2027-12-01' });
    await api('POST', '/stock-movements/in', { itemId, quantity: 10, cost: 100, batchNumber: 'B-ERTA', expiryDate: '2026-10-01' });
    await api('POST', '/stock-movements/in', { itemId, quantity: 10, cost: 100, batchNumber: 'B-YOQ' });
    const afterIn = await itemById(itemId);
    ok('kirimdan keyin qoldiq 30', Math.round(afterIn?.quantity) === 30, `qoldiq: ${afterIn?.quantity}`);
    ok('kirim: qoldiq = harakatlar yig\'indisi',
        Math.round(await movementSum(itemId)) === 30, `yig'indi: ${await movementSum(itemId)}`);

    console.log('\n═══ 1. FEFO tartibi ═══════════════════════════════');
    await api('POST', '/stock-movements/out', { itemId, quantity: 5, reason: 'Manual', note: 'fefo sinovi' });
    const batches = (await api('GET', `/inventory/${itemId}/batches`)).data
        || (await api('GET', '/inventory-batches')).data || [];
    const erta = batches.find?.((b: any) => b.batchNumber === 'B-ERTA');
    if (erta) {
        ok('eng yaqin muddatli partiyadan yechildi (B-ERTA: 10 → 5)',
            Math.round(erta.quantity) === 5, `qoldi: ${erta.quantity}`);
    } else {
        // Partiya endpointi bo'lmasa harakat qatoridan tekshiramiz
        const moves = (await api('GET', `/stock-movements?itemId=${itemId}`)).data || [];
        const out = moves.find((m: any) => m.type === 'Out');
        ok('chiqim partiyaga bog\'landi', !!out?.batchId, `batchId: ${out?.batchId}`);
    }

    console.log('\n═══ 2. PARALLEL CHIQIM — yig\'indi saqlanadimi ═════');
    const N = 10, QTY = 2;   // jami 20
    const before = (await itemById(itemId)).quantity;
    const results = await Promise.all(
        Array.from({ length: N }, () => api('POST', '/stock-movements/out',
            { itemId, quantity: QTY, reason: 'Manual', note: 'parallel' })),
    );
    const okCount = results.filter((r) => r.status === 200).length;
    const after = (await itemById(itemId)).quantity;

    ok(`${N} ta parallel chiqim — hammasi o'tdi`, okCount === N, `o'tgan: ${okCount}/${N}`);
    ok('qoldiq aynan kutilgancha kamaydi',
        Math.round(before - after) === N * QTY, `${before} → ${after}, kutilgan −${N * QTY}`);

    const sum = await movementSum(itemId);
    ok('INVARIANT: qoldiq = harakatlar yig\'indisi',
        Math.abs(sum - after) < 0.001, `harakatlar: ${sum}, qoldiq: ${after}`);

    console.log('\n═══ 3. RETSEPT — hammasi yoki hech biri ═══════════');
    const m1 = (await api('POST', '/inventory', { name: `R1 ${Date.now() % 100000}`, unit: 'dona', quantity: 0, price: 500, isConsumable: true })).data;
    const m2 = (await api('POST', '/inventory', { name: `R2 ${Date.now() % 100000}`, unit: 'dona', quantity: 0, price: 700, isConsumable: true })).data;
    await api('POST', '/stock-movements/in', { itemId: m1.id, quantity: 20, cost: 50 });
    await api('POST', '/stock-movements/in', { itemId: m2.id, quantity: 20, cost: 50 });

    const svc = (await api('POST', '/services', {
        name: `Sinov xizmati ${Date.now() % 100000}`, price: 50000, duration: 30,
    })).data;
    ok('xizmat yaratildi', !!svc?.id, JSON.stringify(svc).slice(0, 110));

    const rec = await api('PUT', `/service-recipes/${svc.id}`, {
        lines: [{ itemId: m1.id, quantity: 3 }, { itemId: m2.id, quantity: 2 }],
    });
    ok('retsept saqlandi', rec.status === 200, `status: ${rec.status}, ${JSON.stringify(rec.data).slice(0, 90)}`);

    // Retsept qabulga xizmat qo'shilganda ishlaydi — shu yo'l bilan sinaymiz
    const pid = (await api('POST', '/patients', {
        firstName: 'Ombor', lastName: 'Sinovov', phone: '+998900000003', gender: 'Male',
    })).data?.id;
    const visit = (await api('POST', '/visits', { patientId: pid, force: true })).data;
    ok('qabul ochildi', !!visit?.id, JSON.stringify(visit).slice(0, 110));

    const b1 = (await itemById(m1.id)).quantity;
    const b2 = (await itemById(m2.id)).quantity;
    const proc = await api('POST', `/visits/${visit.id}/procedures`, { serviceId: svc.id });
    ok("xizmat qabulga qo'shildi", proc.status === 200, `status: ${proc.status}`);
    const a1 = (await itemById(m1.id)).quantity;
    const a2 = (await itemById(m2.id)).quantity;
    ok('retsept bo\'yicha IKKALA modda chiqdi (3 va 2)',
        Math.round(b1 - a1) === 3 && Math.round(b2 - a2) === 2,
        `m1: ${b1}→${a1}, m2: ${b2}→${a2}`);

    /* ── ROLLBACK: retsept o'rtasida xato ──────────────────────────────────
       Ikkinchi qatorning `itemId` sini mavjud bo'lmagan qiymatga
       almashtiramiz (tashqi kalit buziladi). Eski kodda birinchi modda
       ALLAQACHON chiqarilgan bo'lardi va omborda yo'qolgan qoldiq qolardi.
       Endi hammasi bitta tranzaksiyada — birinchisi ham tegilmasligi kerak.

       Buzish bazada to'g'ridan-to'g'ri qilinadi (sinov skripti orqali). */
    const brokenPath = process.env.T_DB;
    if (brokenPath) {
        const Database = require('better-sqlite3');
        const db = new Database(brokenPath);
        /* FK ni FAQAT shu ulanishda o'chiramiz — buzuq qiymatni yozish uchun.
           Server o'z ulanishida FK ni yoqiq tutadi, ya'ni chiqimga urinish
           aynan tashqi kalitda yiqiladi — bizga kerakli sahna shu. */
        db.pragma('foreign_keys = OFF');
        db.prepare('UPDATE ServiceRecipe SET itemId = ? WHERE serviceId = ? AND itemId = ?')
            .run('yoq-bunday-modda', svc.id, m2.id);
        db.close();

        const c1 = (await itemById(m1.id)).quantity;
        const c2 = (await itemById(m2.id)).quantity;
        const proc2 = await api('POST', `/visits/${visit.id}/procedures`, { serviceId: svc.id, force: true });
        const d1 = (await itemById(m1.id)).quantity;
        const d2 = (await itemById(m2.id)).quantity;
        ok('ROLLBACK: xato bo\'lganda birinchi modda ham tegilmadi',
            Math.round(c1) === Math.round(d1) && Math.round(c2) === Math.round(d2),
            `m1: ${c1}→${d1}, m2: ${c2}→${d2} (xizmat: ${proc2.status})`);
        ok('xizmat baribir qo\'shildi (tibbiy yozuv ombor xatosidan yo\'qolmaydi)',
            proc2.status === 200, `status: ${proc2.status}`);
    } else {
        console.log('  ⏭  T_DB berilmagan — rollback sinovi o\'tkazib yuborildi');
    }

    console.log('\n═══ 4. INVENTARIZATSIYA ═══════════════════════════');
    const beforeAdj = (await itemById(itemId)).quantity;
    const adj = await api('POST', '/stock-movements/adjust', { itemId, actualQuantity: beforeAdj - 3, note: 'sinov' });
    ok('inventarizatsiya o\'tdi', adj.status === 200 && adj.data?.changed === true,
        `status: ${adj.status}, ${JSON.stringify(adj.data).slice(0, 90)}`);
    const afterAdj = (await itemById(itemId)).quantity;
    ok('qoldiq haqiqiy songa tenglashdi', Math.round(afterAdj) === Math.round(beforeAdj - 3),
        `${beforeAdj} → ${afterAdj}`);
    ok('INVARIANT saqlandi', Math.abs((await movementSum(itemId)) - afterAdj) < 0.001,
        `harakatlar: ${await movementSum(itemId)}, qoldiq: ${afterAdj}`);

    // O'zgarish bo'lmasa hech narsa yozilmaydi
    const noop = await api('POST', '/stock-movements/adjust', { itemId, actualQuantity: afterAdj });
    ok('farq bo\'lmasa harakat yozilmaydi', noop.data?.changed === false,
        JSON.stringify(noop.data).slice(0, 80));

    console.log('\n═══ 5. PARALLEL INVENTARIZATSIYA + CHIQIM ═════════');
    const b5 = (await itemById(itemId)).quantity;
    const [adjR, outR] = await Promise.all([
        api('POST', '/stock-movements/adjust', { itemId, actualQuantity: b5 + 5, note: 'poyga' }),
        api('POST', '/stock-movements/out', { itemId, quantity: 1, reason: 'Manual', note: 'poyga' }),
    ]);
    ok('ikkalasi ham xatosiz tugadi', adjR.status === 200 && outR.status === 200,
        `adjust: ${adjR.status}, out: ${outR.status}`);
    const a5 = (await itemById(itemId)).quantity;
    const s5 = await movementSum(itemId);
    ok('INVARIANT poygadan keyin ham saqlandi', Math.abs(s5 - a5) < 0.001,
        `harakatlar: ${s5}, qoldiq: ${a5}`);

    /* ─── 6. BEMOR KARTASIDAN MATERIAL (0028) ──────────────────────────────
       Ilgari bu yo'l `PUT /api/inventory/:id/stock` edi: qoldiqni qayta
       yozardi, partiyalarga tegmasdi va `InventoryLog` ga tushardi — ombordagi
       ikkinchi, parallel hisob aynan shu yerdan boshlanardi. Endi u ham
       oddiy chiqim: FEFO, harakat qatori, invariant. */
    console.log('\n═══ 6. BEMOR MATERIALI — YAGONA JURNAL ════════════');

    const eskiYol = await api('PUT', `/inventory/${itemId}/stock`, {
        change: 1, type: 'OUT', userName: 'sinov',
    });
    ok('eski yo\'l yopilgan (410)', eskiYol.status === 410, `status: ${eskiYol.status}`);
    ok('eski jurnalni o\'chirish ham yopilgan (410)',
        (await api('DELETE', '/inventory/logs/qandaydir-id')).status === 410);

    const patients = (await api('GET', '/patients?limit=1')).data || [];
    const patientId = patients[0]?.id;

    if (!patientId) {
        console.log('  ⏭  bazada bemor yo\'q — bemor kesimi o\'tkazib yuborildi');
    } else {
        const b6 = (await itemById(itemId)).quantity;
        const use = await api('POST', '/stock-movements/out', {
            itemId, quantity: 2, reason: 'Manual', patientId, note: 'Bemor kartasidan',
        });
        ok('bemor materiali yozildi', use.status === 200, `status: ${use.status}`);

        const a6 = (await itemById(itemId)).quantity;
        ok('qoldiq 2 ga kamaydi', Math.abs(a6 - (b6 - 2)) < 0.001, `${b6} → ${a6}`);
        ok('INVARIANT saqlandi', Math.abs((await movementSum(itemId)) - a6) < 0.001,
            `harakatlar: ${await movementSum(itemId)}, qoldiq: ${a6}`);

        // Bemor kesimi ko'rinadimi — kartadagi ro'yxat shundan o'qiydi
        const byPatient = (await api('GET', `/stock-movements?patientId=${patientId}`)).data || [];
        const mine = byPatient.filter((m: any) => m.itemId === itemId);
        ok('bemor bo\'yicha filtr ishlaydi', mine.length >= 1, `topildi: ${mine.length}`);

        /* Bekor qilish. Muhimi: qator O'CHIRILMAYDI — teskarisi yoziladi.
           Ilgari «o'chirish» tugmasi qoldiqni tiklardi, lekin izni ham
           yo'q qilardi. */
        const target = mine[0];
        const rev = await api('POST', `/stock-movements/${target.id}/reverse`, {});
        ok('chiqim bekor qilindi', rev.status === 200, `status: ${rev.status}`);

        const a6r = (await itemById(itemId)).quantity;
        ok('qoldiq qaytdi', Math.abs(a6r - (a6 + Math.abs(target.quantity))) < 0.001,
            `${a6} → ${a6r}`);
        ok('INVARIANT bekor qilishdan keyin ham saqlandi',
            Math.abs((await movementSum(itemId)) - a6r) < 0.001,
            `harakatlar: ${await movementSum(itemId)}, qoldiq: ${a6r}`);

        const stillThere = ((await api('GET', `/stock-movements?itemId=${itemId}`)).data || [])
            .some((m: any) => m.id === target.id);
        ok('asl qator jurnalda QOLDI (o\'chirilmadi)', stillThere);

        const twice = await api('POST', `/stock-movements/${target.id}/reverse`, {});
        ok('ikkinchi marta bekor qilib bo\'lmaydi (409)', twice.status === 409,
            `status: ${twice.status}`);

        const logs = (await api('GET', `/inventory/logs?patientId=${patientId}`)).data || [];
        const row = logs.find((l: any) => l.id === target.id);
        ok('bemor kartasidagi ro\'yxat harakatlardan o\'qiydi', !!row);
        ok('bekor qilingani belgilangan', row?.reversed === true);
    }

    console.log('\n═══ 7. KIRIM XARAJATGA TUSHADI ═════════════════════');
    /* Ilgari ombor kirimi partiya, harakat va qoldiqni yozardi, xarajat
       esa YO'Q edi: sotib olingan dori foyda hisobiga umuman tushmasdi.
       U faqat material sarflanganda, tannarx sifatida ko'rinardi — ya'ni
       omborda turgan tovar hech qayerda hisoblanmasdi. */
    const expensesOf = async () =>
        ((await api('GET', '/expenses')).data || [])
            .filter((e: any) => e.category === 'Inventory');

    const expItem = await api('POST', '/inventory', {
        name: `Xarajat sinovi ${Date.now() % 100000}`, unit: 'dona',
        quantity: 0, minQuantity: 0, price: 0, isConsumable: true,
    });
    const expItemId = expItem.data?.id;
    ok('xarajat sinovi uchun material yaratildi', !!expItemId);

    if (expItemId) {
        const before = await expensesOf();
        const inRes = await api('POST', '/stock-movements/in', {
            itemId: expItemId, quantity: 4, cost: 12500, note: 'Sinov kirimi',
        });
        ok('kirim o\'tdi', inRes.status === 200, `status: ${inRes.status}`);
        ok('javobda xarajat summasi bor', inRes.data?.expenseAmount === 50000,
            String(inRes.data?.expenseAmount));

        const after = await expensesOf();
        const mine = after.filter((e: any) => e.inventoryItemId === expItemId);
        ok('kirim uchun BITTA xarajat yozildi', mine.length === 1, `topildi: ${mine.length}`);
        ok('summa = miqdor × narx', Math.round(mine[0]?.amount || 0) === 50000,
            String(mine[0]?.amount));
        ok('toifa \'Inventory\'', mine[0]?.category === 'Inventory', String(mine[0]?.category));
        ok('xarajatlar soni bittaga oshdi', after.length === before.length + 1,
            `${before.length} → ${after.length}`);

        /* Narxsiz kirim (bepul kelgan yoki narxi noma'lum tovar) nol
           summali qator yaratmasligi kerak — u faqat aralashtiradi. */
        const free = await api('POST', '/stock-movements/in', {
            itemId: expItemId, quantity: 3, cost: 0,
        });
        ok('narxsiz kirim ham o\'tdi', free.status === 200, `status: ${free.status}`);
        ok('narxsiz kirim xarajat YOZMADI',
            (await expensesOf()).filter((e: any) => e.inventoryItemId === expItemId).length === 1);

        const fin = await itemById(expItemId);
        ok('qoldiq 7 (4 + 3)', Math.round(fin?.quantity) === 7, `qoldiq: ${fin?.quantity}`);
    }

    console.log('\n═══ 8. XIZMAT RETSEPTI VA TANNARX ═══════════════');
    /* Server retseptni ALLAQACHON bilardi va hisobotdagi tannarx aynan
       shundan hisoblanadi, lekin uni KIRITADIGAN ekran yo'q edi: tannarx
       har doim nol chiqardi va «qaysi xizmat foydali» degan savolga
       javob berib bo'lmasdi. */
    const svcRes = await api('POST', '/services', {
        name: `Retsept sinovi ${Date.now() % 100000}`, price: 200000, duration: 30,
    });
    const svcId = svcRes.data?.id;
    ok('xizmat yaratildi', !!svcId, JSON.stringify(svcRes.data).slice(0, 120));

    if (svcId && expItemId) {
        const put = await api('PUT', `/service-recipes/${svcId}`, {
            lines: [{ itemId: expItemId, quantity: 2 }],
        });
        ok('retsept saqlandi', put.status === 200, `status: ${put.status}`);
        ok('bitta qator qaytdi', (put.data || []).length === 1, String((put.data || []).length));

        const cost = await api('GET', `/service-recipes/${svcId}/cost`);
        ok('tannarx hisobi javob berdi', cost.status === 200, `status: ${cost.status}`);
        ok('narx javobda bor', Math.round(cost.data?.price) === 200000, String(cost.data?.price));
        ok('retsept qatorlari sanaldi', cost.data?.lines === 1, String(cost.data?.lines));

        /* Saqlash ALMASHTIRADI, qo'shmaydi: forma butun ro'yxatni yuboradi
           va o'chirilgan qator ham shunda bilinadi. */
        const empty = await api('PUT', `/service-recipes/${svcId}`, { lines: [] });
        ok('bo\'sh ro\'yxat retseptni tozaladi',
            empty.status === 200 && (empty.data || []).length === 0,
            `status: ${empty.status}, ${(empty.data || []).length} qator`);
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
