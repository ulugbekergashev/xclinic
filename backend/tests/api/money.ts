/* 11.1 sinovi: pul butun songa keltirildimi va taqsimot yig'indisi saqlanadimi.

   ASOSIY SAVOL: `Float` ustunlarni `Int` ga ko'chirish (11.1-B) HAQIQATAN
   kerakmi? Agar yozish nuqtalari butun son kafolatlasa, ustun turi faqat
   qo'shimcha himoya bo'ladi — ya'ni qimmat va xavfli jadval qayta qurishni
   asoslash uchun avval BU o'lchov kerak.

   Ishga tushirish: cd backend && T_DB=<baza> npx ts-node --transpile-only _t_money.ts <token>
*/
import { som, qty, splitProportionally } from '../../money';

const BASE = process.env.T_BASE || 'http://localhost:3087';
const TOKEN = process.argv[2];

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function api(method: string, p: string, body?: any) {
    const r = await fetch(BASE + '/api' + p, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

async function main() {
    /* Sof birlik sinovlari (splitProportionally, som, qty) endi
       `tests/money.test.ts` da — vitest bilan, serversiz ishlaydi.
       Bu yerda faqat HAQIQIY to'lovlar orqali tekshiriladigan qism qoldi. */

    if (!TOKEN) { console.log('\n(token berilmadi — server sinovi o\'tkazib yuborildi)'); }
    else {
        console.log('\n═══ 3. HAQIQIY TO\'LOVLAR — kasr paydo bo\'ladimi ══');
        const pid = (await api('POST', '/patients', {
            firstName: 'Pul', lastName: `Sinovov${Date.now() % 100000}`,
            phone: `+99899${String(Date.now() % 10000000).padStart(7, '0')}`.slice(0, 13), gender: 'Male',
        })).data?.id;
        ok('bemor yaratildi', !!pid);

        /* Eng yomon holat: uchga bo'linmaydigan summa, uch qator, ikki usul.
           Har bosqichda kasr paydo bo'lish imkoniyati bor. */
        const ids: string[] = [];
        for (const price of [33333, 33333, 33334]) {
            const c = await api('POST', '/charges', {
                patientId: pid, patientName: 'Sinovov Pul', name: `Kasr ${price}`,
                unitPrice: price, quantity: 1,
            });
            if (c.data?.id) ids.push(c.data.id);
        }
        ok('uchta qator yaratildi', ids.length === 3);

        const pay = await api('POST', '/payments', {
            chargeIds: ids, amount: 100000,
            payments: [{ method: 'Cash', amount: 33333 }, { method: 'Card', amount: 66667 }],
        });
        ok('ikki usulli to\'lov o\'tdi', pay.status === 200,
            `status: ${pay.status}, ${JSON.stringify(pay.data).slice(0, 130)}`);

        // Foizli chegirma — kasrning ikkinchi manbai
        const c2 = (await api('POST', '/charges', {
            patientId: pid, patientName: 'Sinovov Pul', name: 'Chegirmali',
            unitPrice: 99999, quantity: 1,
        })).data;
        await api('PUT', `/charges/${c2.id}/discount`, { discount: 33333 });
        await api('POST', '/payments', { chargeIds: [c2.id], amount: 66666, method: 'Cash' });

        // Endi bazani tekshiramiz
        const dbPath = process.env.T_DB;
        if (!dbPath) console.log('     (T_DB berilmadi — baza tekshiruvi yo\'q)');
        else {
            const Database = require('better-sqlite3');
            const db = new Database(dbPath, { readonly: true });
            const cols: [string, string][] = [
                ['Transaction', 'amount'], ['VisitCharge', 'total'], ['VisitCharge', 'paidAmount'],
                ['VisitCharge', 'unitPrice'], ['VisitCharge', 'discount'],
                ['ChargePayment', 'amount'], ['Patient', 'balance'], ['CashMovement', 'amount'],
            ];
            let frac = 0, scanned = 0;
            for (const [t, c] of cols) {
                const r = db.prepare(
                    `SELECT COUNT(*) n, SUM(CASE WHEN "${c}" IS NOT NULL AND "${c}" != CAST("${c}" AS INTEGER) THEN 1 ELSE 0 END) bad FROM "${t}"`,
                ).get();
                scanned += r.n;
                if (r.bad) { frac += r.bad; console.log(`     ✗ ${t}.${c}: ${r.bad} ta kasrli`); }
            }
            db.close();
            ok(`bazada KASRLI pul yo'q (${scanned} qator tekshirildi)`, frac === 0, `kasrli: ${frac}`);
        }

        const integ = await api('GET', '/admin/integrity');
        const a = (integ.data?.checks || []).find((c: any) => c.key === 'charge_payments');
        ok('to\'lov yig\'indilari qatorlarga AYNAN mos', a?.count === 0,
            `nomuvofiq: ${a?.count}, ${JSON.stringify(a?.sample || []).slice(0, 150)}`);
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
