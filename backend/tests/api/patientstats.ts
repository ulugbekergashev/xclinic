/* BEMORLAR HISOBOTI va «OXIRGI TASHRIF» sinovi (2026-11-26).

   ASOSIY SAVOLLAR:
     1. Qabul ochilganda bemorning `lastVisit` i yangilanadimi? Ilgari u
        hech qachon yangilanmasdi: «6 oydan beri kelmagan» segmenti va
        «uzoq kelmaganlarni qaytarish» avtomatikasi hech kimni topmasdi.
     2. `/api/reports/patients` sonlari bir-biriga mosmi:
        kelgan = yangi + qaytib kelgan; yangi bemor «yangi»da, eski bemor
        (davrdan oldin qabuli bor) «qaytgan»da.
     3. «Yo'qolgan» — faol, oxirgi tashrifi 6 oydan oldin; segment bilan
        bir xil: Xabarlar auditoriyasi ham shu bemorni topadi.

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

/* Toshkent sanasi (UTC+5) — server ham shu bilan ishlaydi */
const tashkentDay = (offsetDays = 0) => new Date(Date.now() + 5 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const today = tashkentDay();
    const tag = String(Date.now()).slice(-7);

    console.log('\n═══ 1. QABUL «OXIRGI TASHRIF» NI YANGILAYDI ═══════');
    const p = (await call('POST', '/patients', {
        firstName: 'Stat', lastName: `Yangi${tag}`, gender: 'Male', phone: `+99893${tag}`, force: true,
    }, token)).data;
    ok('sinov bemori yaratildi', !!p?.id);
    if (!p?.id) return finish();
    ok('yangi bemorda lastVisit — «Never»', p.lastVisit === 'Never', String(p.lastVisit));

    const v = await call('POST', '/visits', { patientId: p.id, status: 'Waiting' }, token);
    ok('qabul ochildi', v.status === 200 && !!v.data?.id, `status ${v.status}`);
    const after = (await call('GET', `/patients/${p.id}`, undefined, token)).data;
    ok('qabuldan keyin lastVisit = bugun', after?.lastVisit === today, String(after?.lastVisit));

    console.log('\n═══ 2. BEMORLAR HISOBOTI ══════════════════════════');
    const r = await call('GET', `/reports/patients?from=${today}&to=${today}`, undefined, token);
    ok('endpoint 200 qaytardi', r.status === 200, `status ${r.status}`);
    if (r.status !== 200) return finish();
    const d = r.data;
    for (const key of ['current', 'prev', 'lost', 'newByDoctor', 'previous']) ok(`javobda «${key}» bor`, d[key] !== undefined);
    ok('kelgan = yangi + qaytib kelgan', d.current.visited === d.current.new + d.current.returning,
        `${d.current.visited} ≠ ${d.current.new} + ${d.current.returning}`);
    ok('bugungi yangi bemor «yangi»da sanaldi', d.current.new >= 1, String(d.current.new));
    /* Bir kunlik davrning o'tgan davri ham bir kun va undan oldin (oyning
       1-kunida — o'tgan oyning 1-kuni, Umumiydagi solishtirish qoidasi) */
    ok('o\'tgan davr — bitta, oldingi kun', d.previous.from === d.previous.to && d.previous.to < today,
        `${d.previous.from} — ${d.previous.to}`);
    const cmp = (await call('GET', `/reports/compare?from=${today}&to=${today}`, undefined, token)).data;
    ok('solishtirish davri Umumiy bilan bir xil', cmp?.previous?.from === d.previous.from && cmp?.previous?.to === d.previous.to,
        `${cmp?.previous?.from}–${cmp?.previous?.to} ≠ ${d.previous.from}–${d.previous.to}`);
    const docNew = (d.newByDoctor || []).reduce((s: number, x: any) => s + x.newPatients, 0);
    ok('shifokorlar bo\'yicha yangi bemorlar jami = «yangi»', docNew === d.current.new, `${docNew} ≠ ${d.current.new}`);

    console.log('\n═══ 3. YO\'QOLGAN — SEGMENT BILAN BIR XIL ═══════════');
    const old = (await call('POST', '/patients', {
        firstName: 'Stat', lastName: `Eski${tag}`, gender: 'Female', phone: `+99894${tag}`, force: true,
    }, token)).data;
    ok('eski bemor yaratildi', !!old?.id);
    const lastYear = tashkentDay(-300);
    await call('PUT', `/patients/${old.id}`, { lastVisit: lastYear }, token);
    const r2 = (await call('GET', `/reports/patients?from=${today}&to=${today}`, undefined, token)).data;
    const inList = (r2?.lost?.patients || []).some((x: any) => x.patientId === old.id);
    ok('300 kun kelmagan bemor «yo\'qolgan» ro\'yxatida', inList);
    ok('bugun kelgan bemor «yo\'qolgan» emas', !(r2?.lost?.patients || []).some((x: any) => x.patientId === p.id));
    ok('yo\'qolganlar soni ro\'yxatdan kam emas', r2?.lost?.total >= (r2?.lost?.patients || []).length);

    const aud = await call('POST', '/messages/audience', {
        segment: { match: 'all', conditions: [{ field: 'status', op: 'eq', value: 'Active' }, { field: 'lastVisit', op: 'before', value: 6 }] },
        channel: 'telegram_first',
    }, token);
    ok('Xabarlar auditoriyasi javob berdi', aud.status === 200, `status ${aud.status}`);
    if (aud.status === 200) {
        const ids = [...(aud.data?.patientIds || []), ...(aud.data?.unreachableList || []).map((x: any) => x.id)];
        ok('Xabarlar segmenti ham shu bemorni topadi', ids.includes(old.id));
        /* `matched` — segmentga tushgan HAMMA (yetib borish-bormasligidan qat'i nazar) */
        ok('segment soni = yo\'qolganlar soni', aud.data?.matched === r2?.lost?.total,
            `${aud.data?.matched} ≠ ${r2?.lost?.total}`);
    }

    console.log('\n═══ 4. BEKOR QABUL VA KELAJAK SANA ══════════════════');
    const q = (await call('POST', '/patients', {
        firstName: 'Stat', lastName: `Bekor${tag}`, gender: 'Male', phone: `+99895${tag}`, force: true,
    }, token)).data;
    ok('uchinchi bemor yaratildi', !!q?.id);
    const fut = await call('POST', '/visits', { patientId: q.id, date: tashkentDay(7), status: 'Waiting' }, token);
    ok('kelajak sanaga qabul ochildi', fut.status === 200, `status ${fut.status}`);
    const afterFut = (await call('GET', `/patients/${q.id}`, undefined, token)).data;
    ok('kelajak qabul «oxirgi tashrif» ni surmaydi', afterFut?.lastVisit === 'Never', String(afterFut?.lastVisit));
    const wrong = (await call('POST', '/visits', { patientId: q.id, status: 'Waiting' }, token)).data;
    const mid = (await call('GET', `/patients/${q.id}`, undefined, token)).data;
    ok('adashib ochilgan qabul — bugun', mid?.lastVisit === today, String(mid?.lastVisit));
    const cancel = await call('PUT', `/visits/${wrong.id}`, { status: 'Cancelled' }, token);
    ok('qabul bekor qilindi', cancel.status === 200, `status ${cancel.status}: ${JSON.stringify(cancel.data).slice(0, 120)}`);
    const back = (await call('GET', `/patients/${q.id}`, undefined, token)).data;
    ok('bekor qilingach «oxirgi tashrif» qaytdi', back?.lastVisit === 'Never', String(back?.lastVisit));

    console.log('\n═══ 5. RUXSAT ═════════════════════════════════════');
    const anon = await call('GET', `/reports/patients?from=${today}&to=${today}`);
    ok('kirmagan foydalanuvchiga yopiq', anon.status === 401 || anon.status === 403, `status ${anon.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
