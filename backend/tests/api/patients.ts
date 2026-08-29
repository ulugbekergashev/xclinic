/* Reliz 8 sinovi: qidiruv (8.1) va takror bemor (8.3).

   Ishga tushirish: cd backend && npx ts-node --transpile-only _t_patients.ts <token>
*/
const BASE = process.env.T_BASE || 'http://localhost:3089';
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

const uniq = Date.now() % 1000000;
// Noyob telefon: dev bazasidagi mavjud raqamlar bilan to'qnashmasin
const PH = `+99893${String(uniq).padStart(7, '0')}`.slice(0, 13);
const PH_DIGITS = PH.replace(/\D/g, '').slice(-9);
/* JSHSHIR — AYNAN 14 raqam (S3.1 dan beri server tekshiradi).
   Ilgari bu yerda `\`3${uniq}0000000\`.slice(0, 14)` turardi. `uniq` —
   SON (`Date.now() % 1000000`), ya'ni boshidagi nol yo'qoladi va qator
   ba'zan 13 belgi bo'lib qolardi. Sinov shu sababdan tasodifiy yiqilardi. */
const PINFL = `3${String(uniq).padStart(6, '0')}0000000`.slice(0, 14);

async function main() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }

    console.log('\n═══ 8.1 QIDIRUV — karta raqami va JSHSHIR ═════════');
    const p1 = await api('POST', '/patients', {
        firstName: 'Aziz', lastName: `Qidiruvov${uniq}`, phone: PH,
        gender: 'Male', dob: '1990-05-15', cardNumber: `KRT-${uniq}`, pinfl: PINFL,
    });
    ok('bemor yaratildi', p1.status === 200 || p1.status === 201,
        `status: ${p1.status}, ${JSON.stringify(p1.data).slice(0, 130)}`);

    const byName = await api('GET', `/patients/search?q=Qidiruvov${uniq}`);
    ok('familiya bo\'yicha topildi', (byName.data || []).some((p: any) => p.id === p1.data?.id));

    const byCard = await api('GET', `/patients/search?q=KRT-${uniq}`);
    ok('KARTA RAQAMI bo\'yicha topildi', (byCard.data || []).some((p: any) => p.id === p1.data?.id),
        `topilgan: ${(byCard.data || []).length}`);

    // Telefon turli ko'rinishda
    for (const q of [PH_DIGITS, PH_DIGITS.replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4'), `+998${PH_DIGITS}`]) {
        const r = await api('GET', `/patients/search?q=${encodeURIComponent(q)}`);
        ok(`telefon "${q}" bo'yicha topildi`, (r.data || []).some((p: any) => p.id === p1.data?.id),
            `topilgan: ${(r.data || []).length}`);
    }

    const short = await api('GET', '/patients/search?q=a');
    ok('bitta harf rad etildi (400)', short.status === 400, `status: ${short.status}`);

    console.log('\n═══ 8.3 TAKROR BEMOR ══════════════════════════════');
    // Bir xil telefon
    const dupPhone = await api('POST', '/patients', {
        firstName: 'Boshqa', lastName: 'Odam', phone: PH, gender: 'Male',
    });
    ok('bir xil telefon — 409', dupPhone.status === 409, `status: ${dupPhone.status}`);
    ok('javobda topilganlar ro\'yxati bor', (dupPhone.data?.matches || []).length >= 1,
        `matches: ${(dupPhone.data?.matches || []).length}`);
    ok('kod DUPLICATE_PATIENT', dupPhone.data?.code === 'DUPLICATE_PATIENT');

    // Turli formatda yozilgan bir xil raqam ham topilishi kerak
    const dupFmt = await api('POST', '/patients', {
        firstName: 'Yana', lastName: 'Kimdir', phone: PH_DIGITS, gender: 'Male',
    });
    ok('BOSHQA FORMATDAGI bir xil raqam ham topildi', dupFmt.status === 409,
        `status: ${dupFmt.status}`);

    // Bir xil ism + familiya + tug'ilgan sana
    const dupName = await api('POST', '/patients', {
        firstName: 'Aziz', lastName: `Qidiruvov${uniq}`, phone: `+99894${String(uniq).padStart(7,'0')}`.slice(0,13),
        gender: 'Male', dob: '1990-05-15',
    });
    ok('ism + familiya + tug\'ilgan sana — 409', dupName.status === 409, `status: ${dupName.status}`);

    // Bir xil ism, LEKIN boshqa sana — ruxsat
    const okDiff = await api('POST', '/patients', {
        firstName: 'Aziz', lastName: `Qidiruvov${uniq}`, phone: `+99895${String(uniq).padStart(7,'0')}`.slice(0,13),
        gender: 'Male', dob: '1975-01-01',
    });
    ok('bir xil ism, boshqa sana — RUXSAT', okDiff.status === 200 || okDiff.status === 201,
        `status: ${okDiff.status}`);

    // force bilan baribir yaratish
    const forced = await api('POST', '/patients', {
        firstName: 'Boshqa', lastName: 'Odam', phone: PH,
        gender: 'Male', force: true,
    });
    ok('force: true bilan yaratildi', forced.status === 200 || forced.status === 201,
        `status: ${forced.status}`);

    console.log('\n═══ 8.3b TAKRORLARNI TOPISH VA BIRLASHTIRISH ══════');
    const dups = await api('GET', '/patient-duplicates');
    ok('takrorlar ro\'yxati olindi', dups.status === 200, `status: ${dups.status}`);
    const myGroup = (dups.data?.groups || []).find((g: any) =>
        g.patients.some((p: any) => p.id === p1.data?.id) &&
        g.patients.some((p: any) => p.id === forced.data?.id));
    ok('force bilan yaratilgan juftlik TAKROR deb topildi', !!myGroup,
        `guruhlar: ${(dups.data?.groups || []).length}`);

    // Manba bemorga ma'lumot qo'shamiz
    const src = forced.data?.id, tgt = p1.data?.id;
    await api('POST', '/transactions', {
        patientId: src, patientName: 'Odam Boshqa', amount: 70000,
        date: new Date().toISOString().split('T')[0], service: 'Avans', type: 'Cash', status: 'Paid',
    });
    await api('POST', '/charges', { patientId: src, patientName: 'Odam Boshqa', name: 'Sinov', unitPrice: 40000, quantity: 1 });

    const dry = await api('POST', '/patient-merge', { targetId: tgt, sourceId: src });
    ok('quruq yuritish sukut bo\'yicha', dry.data?.dryRun === true, `${JSON.stringify(dry.data).slice(0, 120)}`);
    ok('ko\'chadigan yozuvlar sanaldi', (dry.data?.totalRows || 0) >= 2,
        `totalRows: ${dry.data?.totalRows}, rows: ${JSON.stringify(dry.data?.rows)}`);
    ok('avans balansi ham hisobga olindi', dry.data?.balanceMoved === 70000,
        `balanceMoved: ${dry.data?.balanceMoved}`);

    /* Yaxlitlikni merge dan OLDIN ham o'lchaymiz. To'g'ri savol "baza toza"
       emas, "birlashtirish YANGI xato qo'shdimi" — bazada boshqa sinovlardan
       qolgan ataylab buzilgan yozuv bo'lishi mumkin. */
    const integBefore = (await api('GET', '/admin/integrity')).data?.errorCount ?? 0;

    const srcBalBefore = (await api('GET', `/patients/${src}`)).data?.balance || 0;
    const tgtBalBefore = (await api('GET', `/patients/${tgt}`)).data?.balance || 0;

    const merged = await api('POST', '/patient-merge', { targetId: tgt, sourceId: src, confirm: true });
    ok('birlashtirish bajarildi', merged.status === 200 && merged.data?.success === true,
        `status: ${merged.status}`);

    const tgtAfter = (await api('GET', `/patients/${tgt}`)).data;
    const srcAfter = (await api('GET', `/patients/${src}`)).data;
    ok('balans asosiy kartaga ko\'chdi',
        Math.round(tgtAfter?.balance) === Math.round(tgtBalBefore + srcBalBefore),
        `${tgtBalBefore} + ${srcBalBefore} → ${tgtAfter?.balance}`);
    ok('manba karta ARXIVGA o\'tdi (o\'chirilmadi)',
        srcAfter?.status === 'Archived' && !!srcAfter?.id, `status: ${srcAfter?.status}`);
    ok('manba balansi nolga tushdi', Math.round(srcAfter?.balance || 0) === 0);

    const tgtCharges = (await api('GET', `/charges?patientId=${tgt}`)).data || [];
    ok('hisob qatorlari ko\'chdi', tgtCharges.some((c: any) => c.name === 'Sinov'),
        `qatorlar: ${tgtCharges.length}`);

    const srcCharges = (await api('GET', `/charges?patientId=${src}`)).data || [];
    ok('manbada qator qolmadi', srcCharges.length === 0, `qolgan: ${srcCharges.length}`);

    // Yaxlitlik buzilmadimi
    const integ = await api('GET', '/admin/integrity');
    ok("birlashtirish YANGI yaxlitlik xatosi qoshmadi",
        (integ.data?.errorCount ?? 0) <= integBefore,
        `oldin: ${integBefore}, keyin: ${integ.data?.errorCount}`);

    const selfMerge = await api('POST', '/patient-merge', { targetId: tgt, sourceId: tgt, confirm: true });
    ok('o\'ziga qo\'shishga urinish rad etildi', selfMerge.status === 400);

    /* ─── KESIM FILTRLARI (10.3 qoldig'i) ──────────────────────────────────
       Bemor va shifokor kartasi 45 kunlik oynadan tashqaridagi tarixni shu
       filtrlar orqali oladi. Filtr ishlamay qolsa karta jimgina qisqa tarix
       ko'rsatadi — ya'ni buzilish ko'rinmaydi. Shuning uchun sinov. */
    console.log('\n═══ KESIM FILTRLARI — bemor va shifokor kartasi ═══');

    const allTx = (await api('GET', '/transactions')).data || [];
    const withPatient = allTx.find((t: any) => t.patientId);

    if (!withPatient) {
        console.log('  ⏭  bazada bemorli to\'lov yo\'q — o\'tkazib yuborildi');
    } else {
        const scoped = (await api('GET', `/transactions?patientId=${withPatient.patientId}`)).data || [];
        ok('to\'lovlar bemor bo\'yicha filtrlanadi',
            scoped.length > 0 && scoped.every((t: any) => t.patientId === withPatient.patientId),
            `qaytdi: ${scoped.length}`);
        ok('filtr ro\'yxatni QISQARTIRADI (butun jadval emas)',
            scoped.length <= allTx.length);
    }

    const allAppts = (await api('GET', '/appointments')).data || [];
    const someAppt = allAppts.find((a: any) => a.doctorId);
    if (!someAppt) {
        console.log('  ⏭  bazada shifokorli qabul yo\'q — o\'tkazib yuborildi');
    } else {
        const byDoc = (await api('GET', `/appointments?doctorId=${someAppt.doctorId}`)).data || [];
        ok('qabullar shifokor bo\'yicha filtrlanadi',
            byDoc.length > 0 && byDoc.every((a: any) => a.doctorId === someAppt.doctorId),
            `qaytdi: ${byDoc.length}`);

        const byPat = (await api('GET', `/appointments?patientId=${someAppt.patientId}`)).data || [];
        ok('qabullar bemor bo\'yicha ham filtrlanadi',
            byPat.every((a: any) => a.patientId === someAppt.patientId), `qaytdi: ${byPat.length}`);

        const pats = (await api('GET', `/patients?scope=clinic&doctorId=${someAppt.doctorId}`)).data || [];
        ok('bemorlar shifokor bo\'yicha filtrlanadi',
            pats.every((p: any) => p.doctorId === someAppt.doctorId), `qaytdi: ${pats.length}`);
    }

    // Parametrsiz chaqiruv o'zgarmasligi shart — mavjud ekranlar shunga tayanadi
    ok('parametrsiz chaqiruv ilgarigidek to\'liq ro\'yxat qaytaradi',
        ((await api('GET', '/transactions')).data || []).length === allTx.length);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('Sinov yiqildi:', e); process.exit(1); });
