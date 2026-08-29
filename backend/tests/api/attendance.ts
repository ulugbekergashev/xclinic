/* DAVOMAT VA KUNLAR HISOBOTI sinovi — `/api/reports/attendance`.

   ASOSIY SAVOL: «qaysi kunlarda mijoz yaxshi kelyapti?» degan savolga
   raqam bilan javob bera olamizmi?

   Ilgari javob yo'q edi: kalendar bo'yicha umuman statistika yig'ilmasdi,
   `/api/reports/dashboard` esa faqat BUGUNGI yozuvlar sonini berardi.

   Bu yerda tekshiriladigan narsa — sonlar bir-biriga MOS kelishi.
   Hisobot uch xil kesim beradi (kun, hafta kuni, soat) va ularning
   hammasi bitta manbadan — o'sha davrdagi yozuvlardan — chiqadi.
   Agar kesimlar bo'yicha yig'indi umumiy songa teng bo'lmasa, demak
   qayerdadir yozuv ikki marta sanalgan yoki tushib qolgan.

   Ishga tushirish: cd backend && npm run test:api
*/
const BASE = process.env.T_BASE || 'http://localhost:3079';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(path: string, token?: string) {
    const r = await fetch(BASE + '/api' + path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

async function main() {
    const login = await fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'testpass123' }),
    });
    const token = (await login.json())?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 1. HISOBOT JAVOB BERADIMI ═════════════════════');

    const r = await call('/reports/attendance?from=2000-01-01&to=2100-01-01', token);
    ok('endpoint 200 qaytardi', r.status === 200, `status ${r.status}`);
    if (r.status !== 200) return finish();

    const d = r.data;
    for (const key of ['range', 'totals', 'byWeekday', 'byDay', 'byHour', 'byDoctor']) {
        ok(`javobda «${key}» bor`, d[key] !== undefined);
    }

    console.log('\n═══ 2. HAFTA KUNLARI TO\'LIQMI ════════════════════');

    ok('yetti kun ham bor', Array.isArray(d.byWeekday) && d.byWeekday.length === 7,
        `${d.byWeekday?.length} ta`);
    ok('dushanbadan boshlanadi', d.byWeekday?.[0]?.name === 'Dushanba', d.byWeekday?.[0]?.name);
    ok('yakshanba oxirida', d.byWeekday?.[6]?.name === 'Yakshanba', d.byWeekday?.[6]?.name);

    console.log('\n═══ 3. KESIMLAR BIR-BIRIGA MOS KELADIMI ═══════════');

    /* Bir yozuv qaysi kesimda hisoblansa ham, YIG'INDI bir xil chiqishi
       kerak. Farq chiqsa — yoki ikki marta sanalgan, yoki tushib qolgan. */
    const wdBooked = (d.byWeekday || []).reduce((s: number, w: any) => s + w.booked, 0);
    const dayBooked = (d.byDay || []).reduce((s: number, x: any) => s + x.booked, 0);
    const docBooked = (d.byDoctor || []).reduce((s: number, x: any) => s + x.booked, 0);

    ok(`hafta kunlari yig'indisi = umumiy (${wdBooked} = ${d.totals.booked})`,
        wdBooked === d.totals.booked);
    ok(`kunlar yig'indisi = umumiy (${dayBooked} = ${d.totals.booked})`,
        dayBooked === d.totals.booked);
    ok(`shifokorlar yig'indisi = umumiy (${docBooked} = ${d.totals.booked})`,
        docBooked === d.totals.booked);

    const wdVisits = (d.byWeekday || []).reduce((s: number, w: any) => s + w.visits, 0);
    ok(`tashriflar ham mos (${wdVisits} = ${d.totals.visits})`, wdVisits === d.totals.visits);

    console.log('\n═══ 4. RAQAMLAR MA\'NOLIMI ════════════════════════');

    ok('kelganlar soni yozilganlardan oshmaydi', d.totals.arrived <= d.totals.booked,
        `${d.totals.arrived} > ${d.totals.booked}`);
    ok('kelish ulushi 0..100 oralig\'ida',
        d.totals.arrivalRate >= 0 && d.totals.arrivalRate <= 100, String(d.totals.arrivalRate));
    ok('kelmaslik ulushi 0..100 oralig\'ida',
        d.totals.noShowRate >= 0 && d.totals.noShowRate <= 100, String(d.totals.noShowRate));

    /* «Bekor qilingan» kelmaganga qo'shilmasligi kerak — bu ataylab
       shunday: oldindan ogohlantirgan bemor bilan shunchaki kelmagani
       bir xil emas va ular bitta raqamga qo'shilsa hisobot yolg'on
       bo'ladi. */
    const sums = d.totals.arrived + d.totals.noShow + d.totals.cancelled;
    ok(`keldi+kelmadi+bekor yozilganlardan oshmaydi (${sums} ≤ ${d.totals.booked})`,
        sums <= d.totals.booked);

    console.log('\n═══ 5. SOATLAR VA ENG GAVJUM KUN ══════════════════');

    ok('soatlar 7 dan 20 gacha', Array.isArray(d.byHour) && d.byHour.length === 14,
        `${d.byHour?.length} ta`);
    const hourBooked = (d.byHour || []).reduce((s: number, x: any) => s + x.booked, 0);
    ok(`soatlar yig'indisi umumiydan oshmaydi (${hourBooked} ≤ ${d.totals.booked})`,
        hourBooked <= d.totals.booked);

    if (d.totals.booked > 0) {
        ok('eng gavjum kun aniqlangan', !!d.best, 'best = null');
        if (d.best && d.worst) {
            ok(`eng gavjum ≥ eng bo'sh (${d.best.avgVisits} ≥ ${d.worst.avgVisits})`,
                d.best.avgVisits >= d.worst.avgVisits);
        }
    }

    console.log('\n═══ 6. DAVR CHEGARASI HURMAT QILINADIMI ═══════════');

    /* Tor oraliq so'ralganda hisobot faqat shu oraliqni qaytarishi
       kerak. Ilgari shunga o'xshash joyda `createdAt` bo'yicha filtr
       ishlatilgani uchun sana chegarasi surilib ketardi. */
    const narrow = await call('/reports/attendance?from=2026-08-24&to=2026-08-26', token);
    ok('tor oraliq 200 qaytardi', narrow.status === 200);
    const outside = (narrow.data?.byDay || []).filter(
        (x: any) => x.date < '2026-08-24' || x.date > '2026-08-26');
    ok('oraliqdan tashqari kun yo\'q', outside.length === 0,
        outside.map((x: any) => x.date).join(', '));
    ok('so\'ralgan oraliq javobda aks etgan',
        narrow.data?.range?.from === '2026-08-24' && narrow.data?.range?.to === '2026-08-26');

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
