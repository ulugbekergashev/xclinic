/* STATSIONAR: BITTA BEMOR — BITTA FAOL YOTISH.

   ASOSIY SAVOL: server bir bemorni ikkinchi koykaga yotqizishni rad
   etadimi?

   Topilgan holat: `POST /api/admissions` faqat KOYKANI tekshirardi
   («Koyka band»), bemorning o'zi allaqachon yotganini emas. Bazada ikkita
   bemor ikki koykada yotgan holda topildi. Bu pulga tegadi: koyka-kun har
   ikkala yotish uchun hisoblanadi, bandlik soni esa yolg'on ko'rsatadi.

   Sinov ATAYLAB HTTP orqali: front nima qilishidan qat'i nazar, server
   o'zi qo'riqlayotganini isbotlaydi.

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

let seq = 0;
const uniquePhone = () => `+99895${String(1000000 + (seq++) + (Date.now() % 100000)).slice(-7)}`;

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 1. TAYYORGARLIK: palata, ikki koyka, ikki bemor ═══');
    const ward = await call('POST', '/wards', {
        /* `floor` sxemada SATR («1-qavat»). Son yuborilsa Prisma 500 beradi —
           bu sinov birinchi yurishda aynan shunda yiqildi. */
        name: `Sinov palata ${Date.now() % 100000}`, floor: '1-qavat', kind: 'Umumiy', dailyRate: 100000, bedCount: 2,
    }, token);
    const beds: any[] = ward.data?.beds || [];
    ok('palata ikki koyka bilan yaratildi', ward.status === 200 && beds.length === 2, `status ${ward.status}`);
    if (beds.length < 2) return finish();

    const mk = async (last: string) => (await call('POST', '/patients', {
        firstName: 'Sinov', lastName: last, gender: 'Male', phone: uniquePhone(), force: true,
    }, token)).data;
    const a = await mk(`Yotish${Date.now() % 100000}`);
    const b = await mk(`Ikkinchi${Date.now() % 100000}`);
    ok('ikki bemor yaratildi', !!a?.id && !!b?.id);
    if (!a?.id || !b?.id) return finish();

    console.log('\n═══ 2. BIRINCHI YOTQIZISH — o\'tadi ═══');
    const first = await call('POST', '/admissions', {
        patientId: a.id, patientName: `${a.lastName} ${a.firstName}`, bedId: beds[0].id, dailyRate: 100000,
    }, token);
    ok('bemor 1-koykaga yotqizildi', first.status === 200 && !!first.data?.id, `status ${first.status}: ${JSON.stringify(first.data).slice(0, 120)}`);

    console.log('\n═══ 3. O\'SHA BEMORNI IKKINCHI KOYKAGA — 409 ═══');
    const dup = await call('POST', '/admissions', {
        patientId: a.id, patientName: `${a.lastName} ${a.firstName}`, bedId: beds[1].id, dailyRate: 100000,
    }, token);
    ok('ikkinchi faol yotish rad etildi (409)', dup.status === 409, `status ${dup.status}`);
    ok('sabab kodi PATIENT_ALREADY_ADMITTED', dup.data?.code === 'PATIENT_ALREADY_ADMITTED', JSON.stringify(dup.data).slice(0, 120));
    ok('xabar qayerda yotganini aytadi', /yotibdi/.test(dup.data?.error || ''), dup.data?.error);

    /* Rad etilgan urinish koykani band qilib qo'ymagan bo'lishi kerak */
    const bedAfter = await call('GET', '/wards', undefined, token);
    const w = (bedAfter.data || []).find((x: any) => x.id === ward.data.id);
    const bed2 = (w?.beds || []).find((x: any) => x.id === beds[1].id);
    ok('2-koyka bo\'sh qoldi', bed2?.status === 'Free', `holat: ${bed2?.status}`);

    console.log('\n═══ 4. BOSHQA BEMOR O\'SHA KOYKAGA — «Koyka band» hali ishlaydi ═══');
    const sameBed = await call('POST', '/admissions', {
        patientId: b.id, patientName: `${b.lastName} ${b.firstName}`, bedId: beds[0].id, dailyRate: 100000,
    }, token);
    ok('band koykaga yotqizish rad etildi (409)', sameBed.status === 409, `status ${sameBed.status}`);

    console.log('\n═══ 5. CHIQARILGANDAN KEYIN QAYTA YOTQIZISH — o\'tadi ═══');
    const dis = await call('POST', `/admissions/${first.data.id}/discharge`, { confirmDebt: true }, token);
    ok('bemor chiqarildi', dis.status === 200, `status ${dis.status}: ${JSON.stringify(dis.data).slice(0, 120)}`);
    const again = await call('POST', '/admissions', {
        patientId: a.id, patientName: `${a.lastName} ${a.firstName}`, bedId: beds[1].id, dailyRate: 100000,
    }, token);
    ok('chiqarilgan bemor qayta yotqiziladi', again.status === 200, `status ${again.status}: ${JSON.stringify(again.data).slice(0, 120)}`);

    // Tozalash: sinov bazasi nusxa, lekin keyingi sinovlar uchun koyka bo'shasin
    if (again.data?.id) await call('POST', `/admissions/${again.data.id}/discharge`, { confirmDebt: true }, token);

    await bedDaysOnDischarge(token);
    await manualCharges(token);

    finish();
}

/* HISOBGA QO'LDA QATOR — nom va summa (`POST /admissions/:id/charges`).

   Klinika so'rovi: yotgan bemorga berilgan dori summasini oddiy kiritish va
   chiqishda hammasini chek qilib berish. Sinov uch narsani isbotlaydi:
   qator AYNAN shu yotish hisobiga tushadi; hamshira yoza oladi, laborant
   yo'q; chiqarilgan bemorga va noto'g'ri summaga yozilmaydi. */
async function manualCharges(token: string) {
    console.log('\n═══ 9. HISOBGA QO\'LDA QATOR ═══════════════════════════');
    const t9 = String(Date.now()).slice(-6);
    const p = (await call('POST', '/patients', {
        firstName: 'Hisob', lastName: `Qator${t9}`, gender: 'Male', phone: uniquePhone(), force: true,
    }, token)).data;
    const adm = await call('POST', '/admissions', {
        patientId: p?.id, patientName: `${p?.lastName} ${p?.firstName}`, dailyRate: 0,
    }, token);
    ok('bemor yotqizildi', adm.status === 200 && !!adm.data?.id, `status ${adm.status}`);
    if (!adm.data?.id) return;
    const path = `/admissions/${adm.data.id}/charges`;
    const billing = async () => (await call('GET', `/admissions/${adm.data.id}/billing`, undefined, token)).data;

    const added = await call('POST', path, { name: 'Dorilar', amount: 150000, source: 'Medication' }, token);
    ok('qator yozildi', added.status === 200 && Math.round(added.data?.total || 0) === 150000,
        `status ${added.status}: ${JSON.stringify(added.data).slice(0, 120)}`);
    ok('qator shu yotishga va bemorga bog\'landi',
        added.data?.admissionId === adm.data.id && added.data?.patientId === p.id);
    ok('kim yozgani saqlandi', !!added.data?.createdByName, String(added.data?.createdByName));
    /* Qator ombor yoki tayinlov bilan tasdiqlanmagan — faqat odam yozgan
       summa. Shuning uchun u kassa jurnalida turishi shart. */
    const trail = (await call('GET', '/cash-audit', undefined, token)).data;
    const entry = (Array.isArray(trail) ? trail : []).find((x: any) => x.entityId === added.data?.id);
    ok('kassa jurnaliga yozildi', entry?.action === 'Create' && /150000/.test(entry?.summary || ''),
        JSON.stringify(entry || null).slice(0, 140));

    const b1 = await billing();
    ok('hisobda ko\'rindi: yozilgan 150 000, qarz 150 000',
        Math.round(b1?.accrued) === 150000 && Math.round(b1?.due) === 150000, `accrued ${b1?.accrued}, due ${b1?.due}`);
    ok('manba — Dorilar', b1?.bySource?.Medication?.count === 1, JSON.stringify(b1?.bySource));

    /* Noto'g'ri kiritish — hech narsa yozilmaydi */
    const bad: [string, any][] = [
        ['nomsiz', { name: '  ', amount: 1000 }],
        ['nol summa', { name: 'Dori', amount: 0 }],
        ['manfiy summa', { name: 'Dori', amount: -5000 }],
        ['son emas', { name: 'Dori', amount: 'abc' }],
        ['haddan katta summa', { name: 'Dori', amount: 5_000_000_000 }],
    ];
    for (const [label, body] of bad) {
        const r = await call('POST', path, body, token);
        ok(`${label} — 400`, r.status === 400, `status ${r.status}`);
    }
    /* Koyka qatorini qo'lda «yasab» bo'lmaydi — manba «Boshqa» ga tushadi */
    const forged = await call('POST', path, { name: 'Soxta koyka', amount: 1000, source: 'Bed' }, token);
    ok('begona manba qabul qilinmaydi (Other bo\'ladi)', forged.status === 200 && forged.data?.source === 'Other',
        `source ${forged.data?.source}`);
    const b2 = await billing();
    ok('xato urinishlar hisobni o\'zgartirmadi', Math.round(b2?.accrued) === 151000, `accrued ${b2?.accrued}`);

    /* ROLLAR: hamshira — ha, laborant — yo'q. Loginlar bazadagi xodimlardan. */
    const usernameOf = async (endpoint: string) => {
        const rows = (await call('GET', endpoint, undefined, token)).data;
        return (Array.isArray(rows) ? rows : rows?.items || []).find((x: any) => x?.username)?.username || null;
    };
    const loginAs = async (username: string | null) => username
        ? (await call('POST', '/auth/login', { username, password: 'testpass123' })).data?.token || null
        : null;
    const nurseToken = await loginAs(await usernameOf('/nurses'));
    if (nurseToken) {
        const byNurse = await call('POST', path, { name: 'Sistema', amount: 30000, source: 'Service' }, nurseToken);
        ok('hamshira yoza oladi', byNurse.status === 200, `status ${byNurse.status}: ${JSON.stringify(byNurse.data).slice(0, 100)}`);
        const general = await call('POST', '/charges', { patientId: p.id, name: 'Sinov', unitPrice: 1000 }, nurseToken);
        ok('umumiy /charges hamshiraga yopiq qoldi (403)', general.status === 403, `status ${general.status}`);
    } else {
        console.log('  ⚠️  bazada hamshira logini yo\'q — rol tekshiruvi o\'tkazib yuborildi');
    }
    const labToken = await loginAs(await usernameOf('/lab-technicians'));
    if (labToken) {
        const byLab = await call('POST', path, { name: 'Sinov', amount: 1000 }, labToken);
        ok('laborant yoza olmaydi (403)', byLab.status === 403, `status ${byLab.status}`);
    }

    const foreign = await call('POST', '/admissions/yoq-bunday-yotish/charges', { name: 'Dori', amount: 1000 }, token);
    ok('yo\'q yotish — 404', foreign.status === 404, `status ${foreign.status}`);

    await call('POST', `/admissions/${adm.data.id}/discharge`, { confirmDebt: true }, token);
    const late = await call('POST', path, { name: 'Dori', amount: 1000 }, token);
    ok('chiqarilgan bemorga yozilmaydi (409)', late.status === 409, `status ${late.status}`);
}

/* KOYKA HAQI CHIQARISHDA — ROLDAN QAT'I NAZAR, TAKRORSIZ.

   Topilgan holat: ekran avval `charge-bed-days` ni chaqirardi (shifokorga
   403, xato yutilardi), keyin `discharge` (shifokorga ochiq). Natijada
   shifokor chiqargan bemorning kunlari hisobga tushmasdi. Ikkinchi xato:
   ustma-ust chaqiruvlar bitta kunga ikki qator yozishi mumkin edi. */
async function bedDaysOnDischarge(token: string) {
    console.log('\n═══ 6. SHIFOKOR CHIQARSA HAM KOYKA HAQI YOZILADI ═══');
    const t6 = String(Date.now()).slice(-6);
    const doc = await call('POST', '/doctors', {
        firstName: 'Statsionar', lastName: `Shifokor${t6}`, specialty: 'Terapevt',
        phone: uniquePhone(), status: 'Active', username: `inpdoc${t6}`, password: 'testpass123',
    }, token);
    ok('shifokor yaratildi', !!doc.data?.id, `status ${doc.status}: ${JSON.stringify(doc.data).slice(0, 120)}`);
    const docToken = (await call('POST', '/auth/login', { username: `inpdoc${t6}`, password: 'testpass123' })).data?.token;
    ok('shifokor kirdi', !!docToken);
    if (!docToken) return;

    const mkPatient = async (last: string) => (await call('POST', '/patients', {
        firstName: 'Koyka', lastName: last, gender: 'Female', phone: uniquePhone(), force: true,
    }, token)).data;

    /* Yotish 3 kun oldin boshlangan deb qo'yiladi (sinov bazasida): 4 kun
       = 3 kun oldin + bugun. T_DB bo'lmasa — faqat bugun. */
    const backdate = (admissionId: string): number => {
        const dbPath = process.env.T_DB;
        if (!dbPath) return 1;
        const Database = require('better-sqlite3');
        const db = new Database(dbPath);
        db.prepare('UPDATE Admission SET admittedAt = admittedAt - ? WHERE id = ?').run(3 * 86400000, admissionId);
        db.close();
        return 4;
    };
    const bedRows = async (id: string) =>
        ((await call('GET', `/admissions/${id}/billing`, undefined, token)).data?.bySource?.Bed?.count) || 0;

    const p1 = await mkPatient(`Shifokor${t6}`);
    const adm1 = await call('POST', '/admissions', {
        patientId: p1?.id, patientName: `${p1?.lastName} ${p1?.firstName}`, dailyRate: 70000,
    }, token);
    ok('yotqizildi', adm1.status === 200, `status ${adm1.status}`);
    if (adm1.data?.id) {
        const days = backdate(adm1.data.id);
        ok('hali koyka qatori yo\'q', (await bedRows(adm1.data.id)) === 0);

        // Ekran qiladigan narsa: charge-bed-days — shifokorga yopiq
        const denied = await call('POST', `/admissions/${adm1.data.id}/charge-bed-days`, {}, docToken);
        ok('charge-bed-days shifokorga yopiq (403)', denied.status === 403, `status ${denied.status}`);

        const noConfirm = await call('POST', `/admissions/${adm1.data.id}/discharge`, {}, docToken);
        ok('chiqarish koyka qarzini KO\'RDI (409, tasdiq kerak)', noConfirm.status === 409 && noConfirm.data?.needsConfirm === true,
            `status ${noConfirm.status}: ${JSON.stringify(noConfirm.data).slice(0, 120)}`);
        ok(`qarz = ${days} kun × 70 000`, noConfirm.data?.due === days * 70000, String(noConfirm.data?.due));

        const dis = await call('POST', `/admissions/${adm1.data.id}/discharge`, { confirmDebt: true }, docToken);
        ok('SHIFOKOR chiqardi', dis.status === 200, `status ${dis.status}: ${JSON.stringify(dis.data).slice(0, 120)}`);
        ok(`KOYKA HAQI YOZILDI: ${days} kun — ${days} qator (takrorsiz)`, (await bedRows(adm1.data.id)) === days,
            String(await bedRows(adm1.data.id)));
    }

    console.log('\n═══ 7. USTMA-UST CHAQIRUV — BITTA KUNGA BITTA QATOR ═══');
    const p2 = await mkPatient(`Parallel${t6}`);
    const adm2 = await call('POST', '/admissions', {
        patientId: p2?.id, patientName: `${p2?.lastName} ${p2?.firstName}`, dailyRate: 50000,
    }, token);
    if (adm2.data?.id) {
        const days = backdate(adm2.data.id);
        const par = await Promise.all(Array.from({ length: 6 }, () =>
            call('POST', `/admissions/${adm2.data.id}/charge-bed-days`, {}, token)));
        ok('6 ta parallel chaqiruv xatosiz', par.every((r) => r.status === 200), par.map((r) => r.status).join(','));
        const total = par.reduce((s, r) => s + (r.data?.charged || 0), 0);
        ok(`jami ${days} kun yozildi (takror yo'q)`, total === days, `charged yig'indisi: ${total}`);
        ok(`bazada ${days} qator`, (await bedRows(adm2.data.id)) === days, String(await bedRows(adm2.data.id)));

        await call('POST', `/admissions/${adm2.data.id}/discharge`, { confirmDebt: true }, docToken);
        ok('chiqarishdan keyin ham qator soni o\'zgarmadi', (await bedRows(adm2.data.id)) === days);
    }

    /* DORI BERISH: OMBOR CHIQIMI O'TMASA — PUL HAM YOZILMAYDI.
       Ilgari chiqim xatosi yutilardi, hisob qatori esa baribir yozilardi:
       bemor omborda «bor» bo'lib turgan dori uchun to'lardi. */
    console.log('\n═══ 8. DORI: CHIQIM O\'TMASA HISOB HAM YO\'Q ═══════════');
    const p3 = await mkPatient(`Dori${t6}`);
    const adm3 = await call('POST', '/admissions', {
        patientId: p3?.id, patientName: `${p3?.lastName} ${p3?.firstName}`, dailyRate: 0,
    }, token);
    const drug = (await call('POST', '/inventory', {
        name: `Sinov dori ${t6}`, unit: 'ampula', quantity: 0, price: 12000, isMedication: true, isConsumable: true,
    }, token)).data;
    await call('POST', '/stock-movements/in', {
        itemId: drug?.id, quantity: 3, cost: 0, batchNumber: 'ESKI', expiryDate: '2020-01-01',
    }, token);
    const order = await call('POST', `/admissions/${adm3.data?.id}/medications`, {
        medicationId: drug?.id, name: 'Sinov dori', dosage: '1 ampula',
    }, token);
    ok('dori tayinlandi', !!order.data?.id, `status ${order.status}: ${JSON.stringify(order.data).slice(0, 100)}`);
    if (order.data?.id && adm3.data?.id) {
        const medRows = async () =>
            ((await call('GET', `/admissions/${adm3.data.id}/billing`, undefined, token)).data?.bySource?.Medication?.count) || 0;
        const blocked = await call('POST', `/medication-orders/${order.data.id}/administer`, { status: 'Given' }, docToken);
        ok("faqat muddati o'tgan dori — 409 (sabab ko'rsatildi)",
            blocked.status === 409 && blocked.data?.code === 'EXPIRED_STOCK_BLOCKED',
            `status ${blocked.status}: ${JSON.stringify(blocked.data).slice(0, 120)}`);
        ok('HISOB QATORI YOZILMADI', (await medRows()) === 0, String(await medRows()));
        const mar = (await call('GET', `/admissions/${adm3.data.id}/mar`, undefined, token)).data;
        const marks = (mar?.orders || []).flatMap((o: any) => o.administrations || []);
        ok('yarim yozuv qolmadi (berilganlik belgisi yo\'q)', marks.length === 0, `belgilar: ${marks.length}`);

        const forced = await call('POST', `/medication-orders/${order.data.id}/administer`,
            { status: 'Given', force: true }, docToken);
        ok('force bilan berildi', forced.status === 200, `status ${forced.status}: ${JSON.stringify(forced.data).slice(0, 120)}`);
        ok('chiqim va hisob BIRGA yozildi', forced.data?.stockMoves === 1 && Math.round(forced.data?.charge?.total || 0) === 12000,
            `stockMoves: ${forced.data?.stockMoves}, charge: ${forced.data?.charge?.total}`);
        await call('POST', `/admissions/${adm3.data.id}/discharge`, { confirmDebt: true }, docToken);
    }
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
