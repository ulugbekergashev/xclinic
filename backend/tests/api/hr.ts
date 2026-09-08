/* XODIMLAR MODULI: oylik, bonus/jarima, davomat va ish grafigi.
 *
 * Nimani tekshiradi — pul bilan bog'liq to'rtta va'da:
 *
 *   1. OYLIK IKKI MARTA TO'LANMAYDI. Bir xodimga bir oy uchun ikkinchi
 *      to'lov 409 bo'ladi. Baza darajasida ham unikal indeks turibdi.
 *
 *   2. SHIFOKORNING ASOSIY OYLIGI KARTADAN TO'LANMAYDI. Vedomost
 *      (`payroll.ts`) uni allaqachon hisoblaydi — ikkinchi yo'l ochilsa
 *      bitta pul ikki marta berilardi. Kartadan faqat bonus chiqadi.
 *
 *   3. PUL XARAJAT BO'LIB CHIQADI. To'lovdan keyin `Expense` yozuvi
 *      paydo bo'ladi va summasi bir xil — aks holda kassada ham,
 *      hisobotda ham ko'rinmaydi.
 *
 *   4. TO'LANGAN OY QOTADI. To'langandan keyin bonus ham qo'shilmaydi,
 *      jarima ham o'chirilmaydi: hujjat keyin o'zgarmasligi kerak.
 *
 * Ustiga: summa serverda qayta hisoblanadi (brauzerdan kelgan raqamga
 * ishonilmaydi), davomat kelajakka yozilmaydi, ish grafigi tozalanadi.
 *
 * Ishga tushirish: cd backend && npm run test:api
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

const tag = () => String(Date.now()).slice(-7) + Math.floor(Math.random() * 100);

/* Registrator tokeni ikki bo'limda kerak — ruxsat tekshiruvida ham,
   eganing tasmasida ham. */
let recToken: string | undefined;

/* Sinov o'z oyini oladi — o'tgan yilning noyabri. Joriy oy ishlatilsa,
   sinov demo ma'lumoti yoki qo'lda kiritilgan yozuvlarga urilib qolardi. */
const PERIOD = `${new Date().getFullYear() - 1}-11`;

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    /* ═══ 1. NORMAL XODIM: OYLIK HISOBI ═══════════════════════════════ */
    console.log('\n═══ 1. REGISTRATOR: ASOSIY OYLIK ══════════════════');
    const t = tag();
    const rec = await call('POST', '/receptionists', {
        firstName: 'Oylik', lastName: `Testov${t}`,
        phone: '+998901110000', username: `hrrec${t}`, password: 'testpass123',
        fixedSalary: 2000000, workDays: '1,2,3,4,5',
    }, token);
    ok('registrator yaratildi', rec.status === 200,
        `status: ${rec.status}, ${JSON.stringify(rec.data).slice(0, 140)}`);
    const recId = rec.data?.id;
    ok('OYLIK SAQLANDI', rec.data?.fixedSalary === 2000000, String(rec.data?.fixedSalary));
    ok('ish kunlari saqlandi', rec.data?.workDays === '1,2,3,4,5', String(rec.data?.workDays));
    if (!recId) return finish();

    const m0 = await call('GET', `/hr/staff/RECEPTIONIST/${recId}/month?period=${PERIOD}`, undefined, token);
    ok('oylik hisobi keldi', m0.status === 200, `status: ${m0.status}`);
    ok('asosiy = kartadagi oylik', m0.data?.base === 2000000, String(m0.data?.base));
    ok("to'lanishi kerak = asosiy", m0.data?.due === 2000000, String(m0.data?.due));
    ok("hali to'lanmagan", m0.data?.payment === null, JSON.stringify(m0.data?.payment));

    /* ═══ 2. BONUS VA JARIMA ══════════════════════════════════════════ */
    console.log('\n═══ 2. BONUS VA JARIMA HISOBGA TUSHADI ════════════');
    const bonus = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/adjustments`, {
        period: PERIOD, type: 'Bonus', reason: 'Bayram', amount: 300000,
    }, token);
    ok("bonus qo'shildi", bonus.status === 201, `status: ${bonus.status}`);

    const penalty = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/adjustments`, {
        period: PERIOD, type: 'Penalty', reason: 'Kechikish', amount: 100000,
    }, token);
    ok("jarima qo'shildi", penalty.status === 201, `status: ${penalty.status}`);

    const m1 = await call('GET', `/hr/staff/RECEPTIONIST/${recId}/month?period=${PERIOD}`, undefined, token);
    ok('bonus yig\'indisi', m1.data?.bonus === 300000, String(m1.data?.bonus));
    ok('jarima yig\'indisi', m1.data?.penalty === 100000, String(m1.data?.penalty));
    ok('HISOB: 2 000 000 + 300 000 − 100 000 = 2 200 000',
        m1.data?.due === 2200000, String(m1.data?.due));

    /* Noto'g'ri qiymatlar rad etiladi. */
    const badType = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/adjustments`,
        { period: PERIOD, type: 'Sovga', reason: 'x', amount: 100 }, token);
    ok("noma'lum turi rad etildi", badType.status === 400, `status: ${badType.status}`);
    const noReason = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/adjustments`,
        { period: PERIOD, type: 'Bonus', reason: '  ', amount: 100 }, token);
    ok('sababsiz yozuv rad etildi', noReason.status === 400, `status: ${noReason.status}`);
    const zero = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/adjustments`,
        { period: PERIOD, type: 'Bonus', reason: 'nol', amount: 0 }, token);
    ok('nol summa rad etildi', zero.status === 400, `status: ${zero.status}`);

    /* ═══ 3. TO'LOV: XARAJAT VA IKKILANMASLIK ═════════════════════════ */
    console.log("\n═══ 3. TO'LOV BIR MARTA VA XARAJAT BILAN ══════════");
    const expBefore = (await call('GET', '/expenses', undefined, token)).data || [];
    const countBefore = Array.isArray(expBefore) ? expBefore.length : 0;

    /* Brauzerdan yolg'on summa yuboramiz — server o'zi qayta hisoblashi
       kerak, aks holda kim xohlasa o'shancha yozardi. */
    const payed = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/pay`,
        { period: PERIOD, method: 'Cash', amount: 999999999 }, token);
    ok("oylik to'landi", payed.status === 201, `status: ${payed.status}, ${JSON.stringify(payed.data).slice(0, 140)}`);
    ok('SUMMA SERVERDA HISOBLANDI (yuborilgan raqam olinmadi)',
        payed.data?.payment?.amount === 2200000, String(payed.data?.payment?.amount));
    ok('xarajat yozuvi yaratildi', !!payed.data?.expense?.id);
    ok('xarajat summasi bir xil', payed.data?.expense?.amount === 2200000,
        String(payed.data?.expense?.amount));
    ok("xarajat kategoriyasi 'Salary'", payed.data?.expense?.category === 'Salary',
        String(payed.data?.expense?.category));

    const expAfter = (await call('GET', '/expenses', undefined, token)).data || [];
    ok('xarajatlar ro\'yxati bittaga oshdi',
        Array.isArray(expAfter) && expAfter.length === countBefore + 1,
        `${countBefore} → ${Array.isArray(expAfter) ? expAfter.length : '?'}`);

    const twice = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/pay`,
        { period: PERIOD }, token);
    ok('IKKINCHI TO\'LOV RAD ETILDI (409)', twice.status === 409, `status: ${twice.status}`);

    /* ═══ 4. TO'LANGAN OY QOTADI ══════════════════════════════════════ */
    console.log("\n═══ 4. TO'LANGAN OY O'ZGARMAYDI ═══════════════════");
    const lateBonus = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/adjustments`,
        { period: PERIOD, type: 'Bonus', reason: 'kech', amount: 50000 }, token);
    ok("to'langan oyga bonus qo'shilmadi (409)", lateBonus.status === 409, `status: ${lateBonus.status}`);

    const adjId = bonus.data?.id;
    if (adjId) {
        const delAfterPay = await call('DELETE', `/hr/adjustments/${adjId}`, undefined, token);
        ok("to'langan oyning yozuvi o'chirilmadi (409)", delAfterPay.status === 409,
            `status: ${delAfterPay.status}`);
    }

    const m2 = await call('GET', `/hr/staff/RECEPTIONIST/${recId}/month?period=${PERIOD}`, undefined, token);
    ok("oy endi to'langan deb ko'rinadi", m2.data?.payment?.amount === 2200000,
        JSON.stringify(m2.data?.payment).slice(0, 120));

    /* ═══ 5. SHIFOKOR: ASOSIY OYLIK VEDOMOSTDA ════════════════════════ */
    console.log('\n═══ 5. SHIFOKOR: KARTADAN ASOSIY OYLIK CHIQMAYDI ══');
    const t2 = tag();
    const doc = await call('POST', '/doctors', {
        firstName: 'Ulush', lastName: `Shifokorov${t2}`, specialty: 'Terapevt',
        phone: '+998901110001', status: 'Active',
        salaryType: 'fixed', fixedSalary: 5000000, percentage: 30,
        workDays: '1,3,5', startHour: 9, endHour: 15,
    }, token);
    ok('shifokor yaratildi', doc.status === 200, `status: ${doc.status}`);
    const docId = doc.data?.id;
    if (docId) {
        const dm = await call('GET', `/hr/staff/DOCTOR/${docId}/month?period=${PERIOD}`, undefined, token);
        ok('shifokorda kartadagi asosiy = 0 (vedomostda hisoblanadi)',
            dm.data?.base === 0, String(dm.data?.base));
        ok('shifokorda ulush bloki bor', dm.data?.share != null);

        /* Bonussiz to'lash — to'lanadigan narsa yo'q. */
        const emptyPay = await call('POST', `/hr/staff/DOCTOR/${docId}/pay`, { period: PERIOD }, token);
        ok('BONUSSIZ SHIFOKORGA TO\'LOV RAD ETILDI', emptyPay.status === 400,
            `status: ${emptyPay.status}, ${String(emptyPay.data?.error).slice(0, 80)}`);

        /* Bonus qo'shilsa — faqat u to'lanadi. */
        await call('POST', `/hr/staff/DOCTOR/${docId}/adjustments`,
            { period: PERIOD, type: 'Bonus', reason: 'Ustama', amount: 400000 }, token);
        const docPay = await call('POST', `/hr/staff/DOCTOR/${docId}/pay`, { period: PERIOD }, token);
        ok("shifokorga BONUS to'landi", docPay.status === 201, `status: ${docPay.status}`);
        ok('to\'langan summa = faqat bonus (fix maosh EMAS)',
            docPay.data?.payment?.amount === 400000, String(docPay.data?.payment?.amount));
        ok('xarajat sarlavhasida «bonus» yozilgan',
            String(docPay.data?.expense?.title || '').includes('bonus'),
            String(docPay.data?.expense?.title));
    }

    /* ═══ 6. DAVOMAT ══════════════════════════════════════════════════ */
    console.log('\n═══ 6. DAVOMAT ═══════════════════════════════════');
    const day = `${PERIOD}-05`;
    const mark = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: day, status: 'Present' }, token);
    ok('kun belgilandi', mark.status === 200, `status: ${mark.status}`);

    const again = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: day, status: 'Absent' }, token);
    ok('takroriy belgilash YANGI qator yaratmaydi', again.status === 200, `status: ${again.status}`);

    const att = await call('GET', `/hr/staff/RECEPTIONIST/${recId}/attendance?period=${PERIOD}`, undefined, token);
    ok('davomat ro\'yxati keldi', att.status === 200, `status: ${att.status}`);
    ok('shu kun bitta marta yozilgan',
        (att.data?.days || []).filter((d: any) => d.date === day).length === 1,
        JSON.stringify(att.data?.days).slice(0, 120));
    ok('oxirgi holat saqlandi',
        (att.data?.days || []).find((d: any) => d.date === day)?.status === 'Absent');

    const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const futureMark = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: future, status: 'Present' }, token);
    ok('KELAJAKDAGI kun rad etildi', futureMark.status === 400, `status: ${futureMark.status}`);

    const badStatus = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: day, status: 'Kelgandir' }, token);
    ok("noma'lum holat rad etildi", badStatus.status === 400, `status: ${badStatus.status}`);

    const clear = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: day, status: '' }, token);
    ok('belgini olib tashlash ishlaydi', clear.status === 200 && clear.data?.cleared === true,
        JSON.stringify(clear.data));

    /* ═══ 7. UMUMIY RAQAMLAR VA YUKLAMA ═══════════════════════════════ */
    console.log('\n═══ 7. KPI RAQAMLARI SERVERDAN ═══════════════════');
    const sum = await call('GET', '/hr/summary', undefined, token);
    ok('summary javob berdi', sum.status === 200, `status: ${sum.status}`);
    ok('jami xodim soni bor', typeof sum.data?.total === 'number', String(sum.data?.total));
    ok('oylik fondi bor', typeof sum.data?.salaryFund === 'number', String(sum.data?.salaryFund));
    ok('oyligi kiritilmaganlar sanaldi', typeof sum.data?.noSalary === 'number', String(sum.data?.noSalary));

    const wl = await call('GET', '/hr/workload', undefined, token);
    ok('yuklama javob berdi', wl.status === 200, `status: ${wl.status}`);
    if (docId) {
        const mine = (wl.data?.rows || []).find((r: any) => r.doctorId === docId);
        ok('grafigi bor shifokorda sig\'im hisoblandi',
            mine?.capacityMinutes === 3 * 6 * 60, String(mine?.capacityMinutes));
    }

    /* ═══ 8. RUXSAT ═══════════════════════════════════════════════════ */
    console.log('\n═══ 8. RUXSAT: FAQAT KLINIKA EGASI ═══════════════');
    const recLogin = await call('POST', '/auth/login', { username: `hrrec${t}`, password: 'testpass123' });
    recToken = recLogin.data?.token;
    ok('registrator kirdi', !!recToken, JSON.stringify(recLogin.data).slice(0, 120));
    if (recToken) {
        const denied = await call('GET', `/hr/staff/RECEPTIONIST/${recId}/month?period=${PERIOD}`, undefined, recToken);
        ok('registratorga oylik hisobi YOPIQ (403)', denied.status === 403, `status: ${denied.status}`);
        const deniedPay = await call('POST', `/hr/staff/RECEPTIONIST/${recId}/pay`, { period: PERIOD }, recToken);
        ok("registrator oylik to'lay olmaydi (403)", deniedPay.status === 403, `status: ${deniedPay.status}`);
    }

    /* Token umuman bo'lmasa */
    const anon = await call('GET', '/hr/summary');
    ok('tokensiz so\'rov rad etildi', anon.status === 401 || anon.status === 403, `status: ${anon.status}`);

    /* ═══ 9. BEGONA XODIM VA NOTO'G'RI ROL ════════════════════════════ */
    console.log("\n═══ 9. YO'Q XODIM VA NOTO'G'RI ROL ════════════════");
    const noStaff = await call('GET', `/hr/staff/RECEPTIONIST/yoq-id/month?period=${PERIOD}`, undefined, token);
    ok('mavjud bo\'lmagan xodim 404', noStaff.status === 404, `status: ${noStaff.status}`);
    const badRole = await call('GET', `/hr/staff/HAYDOVCHI/${recId}/month?period=${PERIOD}`, undefined, token);
    ok("noma'lum rol 400", badRole.status === 400, `status: ${badRole.status}`);

    /* ═══ 10. DAVOMAT YIG'MASI ════════════════════════════════════════ */
    console.log("\n═══ 10. DAVOMAT — HAMMA XODIM BO'YICHA ════════════");
    /* Yuqorida shu xodimga belgi qo'yilgan va keyin OLIB TASHLANGAN edi,
       shuning uchun avval ikkita kun belgilaymiz: biri kelgan, biri yo'q. */
    await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: `${PERIOD}-06`, status: 'Present' }, token);
    await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: `${PERIOD}-07`, status: 'Absent' }, token);
    await call('POST', `/hr/staff/RECEPTIONIST/${recId}/attendance`,
        { date: `${PERIOD}-08`, status: 'Late' }, token);

    const sm = await call('GET', `/hr/attendance-summary?period=${PERIOD}`, undefined, token);
    ok("davomat yig'masi keldi", sm.status === 200, `status: ${sm.status}`);
    const mine = (sm.data?.rows || []).find((r: any) => r.id === recId);
    ok("xodim ro'yxatda bor", !!mine, JSON.stringify(sm.data?.rows?.length));
    ok('belgilangan kun = 3', mine?.markedDays === 3, String(mine?.markedDays));
    ok('keldi = 1', mine?.present === 1, String(mine?.present));
    ok('kelmadi = 1', mine?.absent === 1, String(mine?.absent));
    ok('kechikdi = 1', mine?.late === 1, String(mine?.late));
    /* KECHIKKAN KUN — KELGAN kun: odam ishga chiqqan. (1+1)/3 = 67% */
    ok('FOIZ kechikishni kelgan deb sanaydi (67%)', mine?.percent === 67, String(mine?.percent));

    /* Belgilanmagan xodimda foiz YO'Q — nol emas. Nol «kelmagan» degani,
       holbuki uni hech kim belgilamagan. */
    const untracked = (sm.data?.rows || []).find((r: any) => r.markedDays === 0);
    ok('belgilanmagan xodimda foiz null (nol emas)',
        !untracked || untracked.percent === null, JSON.stringify(untracked));

    /* ═══ 11. EGANING TASMASI: «BUGUN HAL QILINSIN» ═══════════════════ */
    console.log("\n═══ 11. BUGUN HAL QILINSIN ═══════════════════════");
    const care = await call('GET', '/reports/attention', undefined, token);
    ok("ro'yxat javob berdi", care.status === 200, `status: ${care.status}`);
    ok('bandlar massiv', Array.isArray(care.data?.items), JSON.stringify(care.data).slice(0, 120));

    const list = care.data?.items || [];
    ok("NOL bo'lgan band ro'yxatga tushmagan",
        list.every((i: any) => i.count > 0), JSON.stringify(list.map((i: any) => `${i.key}=${i.count}`)));
    ok('har bandda manzil bor',
        list.every((i: any) => typeof i.link === 'string' && i.link.startsWith('/')),
        JSON.stringify(list.map((i: any) => i.link)));
    ok("shoshilinchlik bo'yicha tartiblangan", (() => {
        const rank: any = { high: 0, medium: 1, low: 2 };
        return list.every((it: any, i: number) => i === 0 || rank[list[i - 1].level] <= rank[it.level]);
    })(), JSON.stringify(list.map((i: any) => i.level)));

    /* Oyligi kiritilmagan xodim ATAYLAB yaratildi (yuqorida laborant
       yaratilmagan bo'lsa ham, demo bazada bunday xodim bor) — band
       chiqsa, uning manzili Xodimlar moduliga olib borishi kerak. */
    const salaryItem = list.find((i: any) => i.key === 'staff_no_salary');
    if (salaryItem) {
        ok('oylik bandi Xodimlarga olib boradi', salaryItem.link === '/staff', salaryItem.link);
    }

    const dash = await call('GET', '/reports/dashboard', undefined, token);
    ok('bosh sahifa raqamlari keldi', dash.status === 200, `status: ${dash.status}`);
    ok("QARZ YOSHI qo'shildi", dash.data?.debtors != null
        && typeof dash.data.debtors.overdue30 === 'number',
        JSON.stringify(dash.data?.debtors));
    ok("30+ kunlik qarzdorlar umumiydan ko'p emas",
        (dash.data?.debtors?.overdue30 || 0) <= (dash.data?.debtors?.patients || 0),
        JSON.stringify(dash.data?.debtors));

    if (recToken) {
        const denied = await call('GET', '/reports/attention', undefined, recToken);
        ok('registratorga tasma YOPIQ (403)', denied.status === 403, `status: ${denied.status}`);
    }

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
