/* 7.5 sinovi: yaxlitlik tekshiruvi.

   ASOSIY SAVOL: soxta ogohlantirish bermaydimi? Tekshiruv yolg'on xato
   ko'rsatsa — bir-ikki marta bekorga qo'ng'iroq qilgandan keyin unga hech
   kim qaramaydi, ya'ni foydasi noldan past bo'ladi.

   Ishga tushirish:
     cd backend && T_DB=<baza> npx ts-node --transpile-only _t_integrity.ts <token>
*/
const BASE = process.env.T_BASE || 'http://localhost:3093';
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
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
    return { status: r.status, data };
}

const check = (r: any, key: string) => (r.data?.checks || []).find((c: any) => c.key === key);
const show = (r: any) => (r.data?.checks || []).forEach((c: any) =>
    console.log(`     ${c.severity === 'ok' ? '·' : c.severity === 'info' ? 'i' : c.severity === 'warn' ? '!' : '✗'} ` +
        `${c.title}: ${c.severity === 'ok' ? 'toza' : c.count} (${c.scanned} tekshirildi)`));

async function main() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }

    console.log('\n═══ 1. SOG\'LOM BAZADA — soxta xato bo\'lmasin ═══════');
    const first = await api('GET', '/admin/integrity');
    ok('endpoint ishladi (BigInt yiqilishi yo\'q)', first.status === 200,
        `status: ${first.status}, ${JSON.stringify(first.data).slice(0, 200)}`);
    if (first.status !== 200) process.exit(1);
    show(first);
    ok('boshlang\'ich holatda BUZILISH yo\'q', first.data.errorCount === 0,
        `xatolar: ${first.data.errorCount}`);

    console.log('\n═══ 2. ODATIY ISH — keyin ham toza qolsinmi ═══════');
    const pid = (await api('POST', '/patients', {
        firstName: 'Yaxlit', lastName: 'Tekshirov', phone: '+998900000004', gender: 'Male',
    })).data?.id;

    // Avans, to'lov, qisman to'lov, qaytarish — to'liq pul aylanishi
    await api('POST', '/transactions', {
        patientId: pid, patientName: 'Tekshirov Yaxlit', amount: 300000,
        date: new Date().toISOString().split('T')[0], service: 'Avans', type: 'Cash', status: 'Paid',
    });
    const ch1 = (await api('POST', '/charges', { patientId: pid, patientName: 'Tekshirov Yaxlit', name: 'To\'liq', unitPrice: 100000, quantity: 1 })).data;
    const ch2 = (await api('POST', '/charges', { patientId: pid, patientName: 'Tekshirov Yaxlit', name: 'Qisman', unitPrice: 200000, quantity: 1 })).data;
    const ch3 = (await api('POST', '/charges', { patientId: pid, patientName: 'Tekshirov Yaxlit', name: 'Qaytariladi', unitPrice: 50000, quantity: 1 })).data;

    await api('POST', '/payments', { chargeIds: [ch1.id], amount: 100000, method: 'Balance' });
    await api('POST', '/payments', { chargeIds: [ch2.id], amount: 80000, method: 'Cash' });
    await api('POST', '/payments', { chargeIds: [ch3.id], amount: 50000, method: 'Cash' });
    await api('POST', `/charges/${ch3.id}/refund`, { amount: 50000, method: 'Balance', reason: 'sinov' });

    // Ombor: kirim, chiqim, inventarizatsiya
    const item = (await api('POST', '/inventory', {
        name: `Yaxlitlik ${Date.now() % 100000}`, unit: 'dona', quantity: 0, price: 1000, isConsumable: true,
    })).data;
    await api('POST', '/stock-movements/in', { itemId: item.id, quantity: 15, cost: 100, batchNumber: 'Y1', expiryDate: '2027-01-01' });
    await api('POST', '/stock-movements/out', { itemId: item.id, quantity: 4, reason: 'Manual' });
    await api('POST', '/stock-movements/adjust', { itemId: item.id, actualQuantity: 10, note: 'sinov' });

    const second = await api('GET', '/admin/integrity');
    show(second);
    ok('odatiy ishdan keyin ham BUZILISH yo\'q', second.data.errorCount === 0,
        `xatolar: ${second.data.errorCount}`);

    const balCheck = check(second, 'patient_balance');
    ok('avans balansi mos (qaytarish hisobga olindi)', balCheck?.count === 0,
        `farq: ${balCheck?.count}, ${JSON.stringify(balCheck?.sample || []).slice(0, 160)}`);

    const batchCheck = check(second, 'batch_movements');
    ok('partiya invarianti buzilmadi (inventarizatsiyadan keyin ham)',
        batchCheck?.count === 0, `farq: ${batchCheck?.count}`);

    /* ─── 3. YAGONA JURNAL (0028) ──────────────────────────────────────────
       Ilgari bu bo'lim TESKARISINI tekshirardi: eski yo'l ishlashi va
       tekshiruv undan soxta xato bermasligi kerak edi. Ombor ikki jurnalga
       bo'lingani uchun item darajasidagi invariantni umuman tekshirib
       bo'lmasdi — shuning uchun faqat partiya darajasi qaralardi.

       0028 dan keyin eski yo'l yopilgan va invariant HAQIQIY. */
    console.log('\n═══ 3. YAGONA JURNAL — item invarianti ════════════');

    const oldPath = await api('PUT', `/inventory/${item.id}/stock`, {
        change: 2, type: 'OUT', note: 'eski yo\'l sinovi', userName: 'sinov',
    });
    ok('eski yo\'l YOPILGAN (410)', oldPath.status === 410, `status: ${oldPath.status}`);

    // Bemor materiali endi oddiy chiqim — o'sha yagona jurnalga tushadi
    await api('POST', '/stock-movements/out', {
        itemId: item.id, quantity: 2, reason: 'Manual', patientId: pid, note: 'bemor materiali',
    });

    const third = await api('GET', '/admin/integrity');
    const batch3 = check(third, 'batch_movements');
    const item3 = check(third, 'item_movements');
    const legacy3 = check(third, 'inventory_legacy_writes');
    ok('bemor materialidan keyin BUZILISH yo\'q', third.data.errorCount === 0,
        `xatolar: ${third.data.errorCount}, partiya: ${batch3?.count}, item: ${item3?.count}`);
    ok('item invarianti tekshirilyapti va toza', item3?.count === 0 && item3?.severity === 'ok',
        `severity: ${item3?.severity}, count: ${item3?.count}`);
    ok('eski jadvalga yangi yozuv tushmagan', legacy3?.severity === 'ok',
        `severity: ${legacy3?.severity}`);

    console.log('\n═══ 4. HAQIQIY BUZILISH TOPILADIMI ════════════════');
    const dbPath = process.env.T_DB;
    if (!dbPath) {
        console.log('  ⏭  T_DB berilmagan — buzilishni aniqlash sinovi o\'tkazib yuborildi');
    } else {
        const Database = require('better-sqlite3');
        const db = new Database(dbPath);

        // (a) paidAmount ni qo'lda buzamiz
        db.prepare('UPDATE VisitCharge SET paidAmount = paidAmount + 12345 WHERE id = ?').run(ch2.id);
        // (c) partiya qoldig'ini qo'lda buzamiz
        db.prepare('UPDATE InventoryBatch SET quantity = quantity + 7 WHERE itemId = ?').run(item.id);
        /* (c2) mahsulot qoldig'ini harakat yozmasdan buzamiz — 0028 gacha bu
           tekshiruv MUMKIN EMAS edi, chunki eski yo'l aynan shunday qilardi
           va har mahsulotda soxta xato chiqardi. */
        db.prepare('UPDATE InventoryItem SET quantity = quantity + 5 WHERE id = ?').run(item.id);
        // (d) balansni qo'lda buzamiz
        db.prepare('UPDATE Patient SET balance = balance + 99999 WHERE id = ?').run(pid);
        db.close();

        const fourth = await api('GET', '/admin/integrity');
        show(fourth);
        const a4 = check(fourth, 'charge_payments');
        const c4 = check(fourth, 'batch_movements');
        const d4 = check(fourth, 'patient_balance');

        ok('(a) to\'lov nomuvofiqligi TOPILDI', a4?.count >= 1 && a4?.severity === 'error',
            `count: ${a4?.count}`);
        ok('(c) partiya nomuvofiqligi TOPILDI', c4?.count >= 1 && c4?.severity === 'error',
            `count: ${c4?.count}`);
        const c4b = check(fourth, 'item_movements');
        ok('(c2) mahsulot qoldig\'i nomuvofiqligi TOPILDI',
            c4b?.count >= 1 && c4b?.severity === 'error', `count: ${c4b?.count}`);
        ok('(d) balans nomuvofiqligi TOPILDI', d4?.count >= 1,
            `count: ${d4?.count}`);
        ok('umumiy holat "buzilgan" deb belgilandi', fourth.data.ok === false);
        ok('buzilish topilganda ham JSON qaytdi (BigInt yiqilishi yo\'q)',
            fourth.status === 200, `status: ${fourth.status}`);

        // Namunadagi qiymatlar o'qiladigan turda bo'lsin (string "0" muammosi)
        const s = a4?.sample?.[0];
        ok('namunadagi summalar SON turida (matn emas)',
            !s || (typeof s.paidAmount === 'number' && typeof s.paymentsSum === 'number'),
            `paidAmount: ${typeof s?.paidAmount}, paymentsSum: ${typeof s?.paymentsSum}`);

        console.log('\n═══ 5. BALANSNI TUZATISH ══════════════════════════');
        const dry = await api('POST', '/admin/recalculate-balances', {});
        ok('quruq yuritish farqni ko\'rsatdi', dry.data?.dryRun === true && dry.data?.mismatches >= 1,
            `mismatches: ${dry.data?.mismatches}`);
        const applied = await api('POST', '/admin/recalculate-balances', { confirm: true });
        ok('tuzatish bajarildi', applied.data?.patientsFixed >= 1, `fixed: ${applied.data?.patientsFixed}`);

        const fifth = await api('GET', '/admin/integrity');
        ok('tuzatishdan keyin balans farqi yo\'q', check(fifth, 'patient_balance')?.count === 0,
            `qolgan: ${check(fifth, 'patient_balance')?.count}`);
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
