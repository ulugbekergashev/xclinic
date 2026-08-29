/* Reliz 9 sinovi: hodisalar oqimi (SSE) va smena poygasi.

   ASOSIY SAVOL: bir ekrandagi amal ikkinchi ekranga YETIB BORADIMI va
   qancha vaqtda? Ilgari javob "30 soniyagacha yoki umuman yo'q" edi.

   Ishga tushirish: cd backend && npx ts-node --transpile-only _t_events.ts <token>
*/
const BASE = process.env.T_BASE || 'http://localhost:3088';
const TOKEN = process.argv[2];

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function api(method: string, p: string, body?: any, token = TOKEN) {
    const r = await fetch(BASE + '/api' + p, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

/** Oqimni ochadi va kelgan hodisalarni yig'adi */
function openStream(token = TOKEN) {
    const ctrl = new AbortController();
    const events: any[] = [];
    let ready = false;

    const done = (async () => {
        const res = await fetch(BASE + '/api/events', {
            headers: { Authorization: `Bearer ${token}` },
            signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE ochilmadi: ${res.status}`);
        ready = true;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        try {
            for (;;) {
                const { done: fin, value } = await reader.read();
                if (fin) break;
                buf += dec.decode(value, { stream: true });
                const parts = buf.split('\n\n');
                buf = parts.pop() || '';
                for (const chunk of parts) {
                    const line = chunk.split('\n').find((l) => l.startsWith('data:'));
                    if (!line) continue;
                    try { events.push(JSON.parse(line.slice(5).trim())); } catch { /* ignore */ }
                }
            }
        } catch { /* abort */ }
    })();

    return {
        events,
        close: () => ctrl.abort(),
        waitReady: async () => { for (let i = 0; i < 50 && !ready; i++) await sleep(50); return ready; },
        /** Berilgan turdagi hodisani kutadi */
        wait: async (type: string, ms = 3000) => {
            const t0 = Date.now();
            while (Date.now() - t0 < ms) {
                const e = events.find((x) => x.type === type);
                if (e) return { event: e, ms: Date.now() - t0 };
                await sleep(20);
            }
            return null;
        },
        done,
    };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }

    console.log('\n═══ 1. OQIM OCHILADIMI ════════════════════════════');
    const s1 = openStream();
    ok('oqim ochildi', await s1.waitReady());

    const noAuth = await fetch(BASE + '/api/events');
    ok('tokensiz ulanish rad etildi (401)', noAuth.status === 401, `status: ${noAuth.status}`);

    console.log('\n═══ 2. QABUL OCHILDI → ekranlar bilishi kerak ═════');
    const pid = (await api('POST', '/patients', {
        firstName: 'Live', lastName: `Sinovov${Date.now() % 100000}`,
        phone: `+99897${String(Date.now() % 10000000).padStart(7, '0')}`.slice(0, 13), gender: 'Male',
    })).data?.id;
    ok('bemor yaratildi', !!pid);

    const visit = await api('POST', '/visits', { patientId: pid, force: true });
    ok('qabul ochildi', visit.status === 200, `status: ${visit.status}`);

    const got = await s1.wait('visit.created');
    ok('OQIM "visit.created" ni yetkazdi', !!got, `hodisalar: ${JSON.stringify(s1.events.map((e) => e.type))}`);
    if (got) {
        ok(`yetib borish vaqti < 1 s (${got.ms} ms)`, got.ms < 1000);
        ok('hodisada visitId bor', !!got.event.visitId);
        ok('hodisada BEMOR ISMI YO\'Q (maxfiylik)',
            !JSON.stringify(got.event).toLowerCase().includes('sinovov'),
            JSON.stringify(got.event).slice(0, 120));
    }

    console.log('\n═══ 3. TO\'LOV → laboratoriya bilishi kerak ════════');
    const ch = (await api('POST', '/charges', {
        patientId: pid, patientName: 'Sinovov Live', name: 'Live sinov', unitPrice: 30000, quantity: 1,
    })).data;
    const s2 = openStream();
    await s2.waitReady();
    await api('POST', '/payments', { chargeIds: [ch.id], amount: 30000, method: 'Cash' });
    const paid = await s2.wait('charge.paid');
    ok('OQIM "charge.paid" ni yetkazdi', !!paid, `hodisalar: ${JSON.stringify(s2.events.map((e) => e.type))}`);

    console.log('\n═══ 4. IKKI EKRAN — ikkalasi ham oladimi ══════════');
    const a = openStream(); const b = openStream();
    await a.waitReady(); await b.waitReady();
    await api('POST', '/visits', { patientId: pid, force: true });
    const ea = await a.wait('visit.created');
    const eb = await b.wait('visit.created');
    ok('ikkala ekran ham hodisani oldi', !!ea && !!eb,
        `a: ${!!ea}, b: ${!!eb}`);
    a.close(); b.close();

    console.log('\n═══ 5. UZILISH — server yiqilmasin ════════════════');
    const c = openStream();
    await c.waitReady();
    c.close();                       // to'satdan uziladi
    await sleep(200);
    const still = await api('GET', '/patients/search?q=Live');
    ok('uzilishdan keyin server ishlayapti', still.status === 200, `status: ${still.status}`);

    const afterDrop = openStream();
    ok('yangi ulanish ochildi', await afterDrop.waitReady());
    await api('POST', '/visits', { patientId: pid, force: true });
    ok('yangi ulanish hodisa oladi', !!(await afterDrop.wait('visit.created')));
    afterDrop.close();

    console.log('\n═══ 9.3 SMENA POYGASI ═════════════════════════════');
    const today = new Date().toISOString().split('T')[0];
    const shiftNo = 90 + (Date.now() % 9);
    const [r1, r2] = await Promise.all([
        api('POST', '/cash-register/open', { date: today, shift: shiftNo, openingCash: 0 }),
        api('POST', '/cash-register/open', { date: today, shift: shiftNo, openingCash: 0 }),
    ]);
    const codes = [r1.status, r2.status].sort();
    ok('bittasi ochdi, ikkinchisi 409 oldi', codes[0] === 200 && codes[1] === 409,
        `statuslar: ${codes.join(', ')}`);
    const conflictBody = r1.status === 409 ? r1.data : r2.data;
    ok('409 javobida SHIFT_CONFLICT kodi bor', conflictBody?.code === 'SHIFT_CONFLICT',
        JSON.stringify(conflictBody).slice(0, 110));

    const third = await api('POST', '/cash-register/open', { date: today, shift: shiftNo });
    ok('uchinchi urinish ham 409', third.status === 409, `status: ${third.status}`);

    s1.close(); s2.close();
    await sleep(150);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
