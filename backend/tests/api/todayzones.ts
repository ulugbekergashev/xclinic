/* «BUGUN» ZONALARI: laboratoriya va statsionar raqamlari.

   ASOSIY SAVOL: `/api/today/zones` bergan raqam bo'limning HAQIQIY holatiga
   mos keladimi — yo'llanma bosqichdan bosqichga o'tganda va bemor yotqizilib,
   ko'rilib, chiqarilganda?

   Nima uchun kerak. Bu raqamlar «Bugun» ekranida turadi va ularga qarab
   qaror qilinadi («laboratoriyada navbat bor», «bo'sh koyka qolmadi»).
   Ekran ularni o'zi sanamaydi — server bergan sonni chizadi; ya'ni xato
   bo'lsa, uni ekranda hech narsa ushlamaydi.

   Sinov mutlaq sonni emas, O'ZGARISHNI tekshiradi: baza nusxasida oldindan
   yo'llanma va yotgan bemorlar bor, ularning soni seedga bog'liq.

   Ishga tushirish: cd backend && npm run test:api
*/
import { slotMinutes } from '../../../shared/medSchedule';

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

async function login(username: string): Promise<string | null> {
    const r = await call('POST', '/auth/login', { username, password: 'testpass123' });
    return r.status === 200 ? (r.data?.token ?? null) : null;
}

/** Bazadagi birinchi xodimning login nomi — ismlar seedga bog'liq. */
async function firstUsername(adminToken: string, endpoint: string): Promise<string | null> {
    const r = await call('GET', endpoint, undefined, adminToken);
    const rows = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
    return rows.find((x: any) => x?.username)?.username ?? null;
}

let seq = 0;
const uniquePhone = () => `+99896${String(1000000 + (seq++) + (Date.now() % 100000)).slice(-7)}`;

async function main() {
    const admin = await login('admin');
    ok('ega kirdi', !!admin);
    if (!admin) return finish();

    const zones = async (token = admin) => (await call('GET', '/today/zones', undefined, token)).data;
    const mkPatient = async (last: string) => (await call('POST', '/patients', {
        firstName: 'Sinov', lastName: last, gender: 'Male', phone: uniquePhone(), force: true,
    }, admin)).data;
    const stamp = Date.now() % 100000;

    console.log('\n═══ 1. KIM KO\'RADI ═══');
    ok('ega — 200', (await call('GET', '/today/zones', undefined, admin)).status === 200);
    ok('tokensiz — 401', (await call('GET', '/today/zones')).status === 401);
    const regName = await firstUsername(admin, '/receptionists');
    const regToken = regName ? await login(regName) : null;
    if (regToken) ok('registrator — 200', (await call('GET', '/today/zones', undefined, regToken)).status === 200);
    else console.log('  – registrator hisobi yo\'q, o\'tkazib yuborildi');
    /* Hamshira ham ko'radi: «Bugun» da unga xarita va statsionar zonasi
       chiziladi. Shifokor esa o'z bemorlarini o'z ekranida ko'radi — butun
       bo'limning holati unga berilmaydi. */
    for (const [who, endpoint, expected] of [['hamshira', '/nurses', 200], ['shifokor', '/doctors', 403]] as const) {
        const name = await firstUsername(admin, endpoint);
        const token = name ? await login(name) : null;
        if (token) ok(`${who} — ${expected}`, (await call('GET', '/today/zones', undefined, token)).status === expected);
        else console.log(`  – ${who} hisobi yo'q, o'tkazib yuborildi`);
    }

    console.log('\n═══ 2. LABORATORIYA: yo\'llanma bosqichdan bosqichga ═══');
    const tests: any[] = ((await call('GET', '/lab-tests', undefined, admin)).data || []).filter((t: any) => t.isActive);
    if (tests.length === 0) {
        console.log('  – tahlillar katalogi bo\'sh, laboratoriya qismi o\'tkazib yuborildi');
    } else {
        const lab0 = (await zones()).lab;
        const n = (z: any) => ({
            waiting: z?.waiting?.count ?? 0, working: z?.working?.count ?? 0,
            ready: z?.ready?.count ?? 0, unseen: z?.ready?.unseen ?? 0, stale: z?.stale ?? 0,
        });
        const base = n(lab0);

        const p = await mkPatient(`Zona${stamp}`);
        const order = async () => (await call('POST', '/lab-orders', {
            patientId: p.id, patientName: `Zona${stamp} Sinov`, doctorName: 'Sinov', testIds: [tests[0].id],
        }, admin)).data;
        const o1 = await order();
        ok('yo\'llanma yozildi', !!o1?.id);
        let lab = (await zones()).lab;
        ok('laboratoriya zonasi bor', !!lab);
        ok('kutayotganlar +1', n(lab).waiting === base.waiting + 1, `${base.waiting} → ${n(lab).waiting}`);
        if (base.waiting < 6) {
            ok('kutayotganlar orasida shu bemor', (lab?.waiting?.people || []).some((x: any) => x.patientId === p.id));
        }

        /* Bitta bemorga ikkinchi yo'llanma: namuna olish xonasi oldida baribir
           BITTA odam turadi. */
        const o2 = await order();
        lab = (await zones()).lab;
        ok('ikkinchi yo\'llanma — odam soni o\'zgarmadi', n(lab).waiting === base.waiting + 1, `${n(lab).waiting}`);

        const c1 = await call('POST', `/lab-orders/${o1.id}/collect`, undefined, admin);
        ok('proba olindi', c1.status === 200, `status ${c1.status}`);
        lab = (await zones()).lab;
        ok('ishlanmoqda +1', n(lab).working === base.working + 1, `${base.working} → ${n(lab).working}`);
        ok('bemor hali kutmoqda (ikkinchi yo\'llanmasi bor)', n(lab).waiting === base.waiting + 1);
        await call('POST', `/lab-orders/${o2.id}/collect`, undefined, admin);
        lab = (await zones()).lab;
        ok('ikkalasi ham olingach — kutayotganlardan chiqdi', n(lab).waiting === base.waiting, `${n(lab).waiting}`);
        ok('ishlanmoqda +2', n(lab).working === base.working + 2, `${n(lab).working}`);
        ok('yangi olingan proba kechikkan emas',
            n(lab).working - (lab?.working?.overdue ?? 0) >= 2, `overdue ${lab?.working?.overdue}`);

        /* Natija kiritiladi (`force` — to'lov tekshiruvini chetlab: bu sinov
           pulni emas, sanoqni tekshiradi). */
        const sheet = (await call('GET', `/lab-orders/${o1.id}/results`, undefined, admin)).data;
        const results = (sheet?.items || []).flatMap((it: any) =>
            (it.parameters || []).slice(0, 1).map((prm: any) => ({ orderItemId: it.id, parameterId: prm.parameterId, value: '5' })));
        if (results.length === 0) {
            console.log('  – tahlilda ko\'rsatkich yo\'q, «tayyor» bosqichi o\'tkazib yuborildi');
        } else {
            const saved = await call('POST', `/lab-orders/${o1.id}/results`, { results, enteredBy: 'Sinov', force: true }, admin);
            ok('natija saqlandi', saved.status === 200, `status ${saved.status}: ${JSON.stringify(saved.data).slice(0, 120)}`);
            lab = (await zones()).lab;
            ok('ishlanmoqda −1', n(lab).working === base.working + 1, `${n(lab).working}`);
            ok('bugun tayyor +1', n(lab).ready === base.ready + 1, `${base.ready} → ${n(lab).ready}`);
            ok('shifokor ko\'rmagan +1', n(lab).unseen === base.unseen + 1, `${base.unseen} → ${n(lab).unseen}`);

            const seen = await call('POST', `/lab-orders/${o1.id}/seen`, undefined, admin);
            ok('natija ko\'rildi deb belgilandi', seen.status === 200, `status ${seen.status}`);
            lab = (await zones()).lab;
            ok('ko\'rilmaganlar −1, tayyorlar joyida',
                n(lab).unseen === base.unseen && n(lab).ready === base.ready + 1, `unseen ${n(lab).unseen}, ready ${n(lab).ready}`);
        }
        ok('eskirgan yo\'llanmalar soni o\'zgarmadi', n(lab).stale === base.stale, `${base.stale} → ${n(lab).stale}`);
    }

    console.log('\n═══ 3. STATSIONAR: yotqizish → obxod → chiqarish ═══');
    const inp0 = (await zones()).inpatient;
    const ward = await call('POST', '/wards', {
        name: `Zona palata ${stamp}`, floor: '1-qavat', kind: 'Umumiy', dailyRate: 100000, bedCount: 2,
    }, admin);
    const beds: any[] = ward.data?.beds || [];
    ok('palata ikki koyka bilan yaratildi', ward.status === 200 && beds.length === 2, `status ${ward.status}`);
    if (beds.length < 2) return finish();

    const find = (z: any) => (z?.wards || []).find((w: any) => w.id === ward.data.id);
    let inp = (await zones()).inpatient;
    ok('statsionar zonasi bor', !!inp);
    ok('yangi palata zonada, ikkala koyka bo\'sh',
        (find(inp)?.beds || []).length === 2 && find(inp).beds.every((b: any) => b.status === 'Free' && !b.admissionId));
    ok('jami koyka +2', inp.beds.total === (inp0?.beds?.total ?? 0) + 2, `${inp0?.beds?.total} → ${inp.beds.total}`);
    ok('yig\'indi jamiga teng', inp.beds.occupied + inp.beds.free + inp.beds.cleaning + inp.beds.blocked === inp.beds.total,
        JSON.stringify(inp.beds));
    const before = inp;

    const patient = await mkPatient(`ZonaYotgan${stamp}`);
    const adm = await call('POST', '/admissions', {
        patientId: patient.id, patientName: `ZonaYotgan${stamp} Sinov`, bedId: beds[0].id, reason: 'Sinov',
    }, admin);
    ok('bemor yotqizildi', adm.status === 200 && !!adm.data?.id, `status ${adm.status}: ${JSON.stringify(adm.data).slice(0, 120)}`);
    if (!adm.data?.id) return finish();

    inp = (await zones()).inpatient;
    const bed = () => find(inp)?.beds?.find((b: any) => b.id === beds[0].id);
    ok('koyka band, bemor nomi bilan', bed()?.status === 'Occupied' && bed()?.admissionId === adm.data.id
        && bed()?.patientName === `ZonaYotgan${stamp} Sinov`, JSON.stringify(bed()));
    ok('bugun yotgan, hali ko\'rilmagan', bed()?.admittedToday === true && bed()?.seenToday === false);
    ok('band +1, bo\'sh −1', inp.beds.occupied === before.beds.occupied + 1 && inp.beds.free === before.beds.free - 1,
        JSON.stringify(inp.beds));
    ok('«bugun yotdi» +1', inp.admittedToday === before.admittedToday + 1, `${before.admittedToday} → ${inp.admittedToday}`);
    ok('«bugun ko\'rilmagan» +1', inp.notSeenToday === before.notSeenToday + 1, `${before.notSeenToday} → ${inp.notSeenToday}`);

    const round = await call('POST', `/admissions/${adm.data.id}/rounds`, { notes: 'Ahvoli barqaror (sinov)' }, admin);
    ok('obxod yozildi', round.status === 200, `status ${round.status}`);
    inp = (await zones()).inpatient;
    ok('koyka «ko\'rildi»', bed()?.seenToday === true);
    ok('«bugun ko\'rilmagan» qaytdi', inp.notSeenToday === before.notSeenToday, `${inp.notSeenToday}`);

    console.log('\n═══ 4. DORI: vaqti kelgan muolaja ═══');
    /* Tayinlovda soat yo'q — «har 2 soatda» matnidan jadval chiqariladi
       (`shared/medSchedule.ts`): 06:00 dan 22:00 gacha o'n ikki vaqt. Sinov
       kunning istalgan soatida yuriladi, shuning uchun kutilgan son shu
       paytgacha o'tgan vaqtlardan hisoblanadi. */
    const tashkentMin = (() => {
        const d = new Date(Date.now() + 5 * 3600e3);
        return d.getUTCHours() * 60 + d.getUTCMinutes();
    })();
    const passed = slotMinutes(12).filter(m => m <= tashkentMin).length;
    const dueBase = inp.medsDue;
    const med = await call('POST', `/admissions/${adm.data.id}/medications`, {
        name: `Sinov dori ${stamp}`, dosage: '1 tab', route: 'Ichga', frequency: 'har 2 soatda',
    }, admin);
    ok('dori tayinlandi', med.status === 200 && !!med.data?.id, `status ${med.status}: ${JSON.stringify(med.data).slice(0, 120)}`);
    if (med.data?.id) {
        inp = (await zones()).inpatient;
        ok(passed > 0 ? '«vaqti keldi» +1' : 'kun boshida hali vaqti kelmagan — son o\'zgarmadi',
            inp.medsDue === dueBase + (passed > 0 ? 1 : 0), `${dueBase} → ${inp.medsDue} (o'tgan vaqtlar: ${passed})`);

        /* Zaruratga qarab beriladigan dori jadvalsiz — u hech qachon «kutmaydi». */
        const prn = await call('POST', `/admissions/${adm.data.id}/medications`, {
            name: `Sinov og'riq qoldiruvchi ${stamp}`, frequency: "Og'riqda",
        }, admin);
        ok('zaruratga qarab tayinlandi', prn.status === 200, `status ${prn.status}`);
        const afterPrn = (await zones()).inpatient;
        ok('«og\'riqda» sonni o\'zgartirmaydi', afterPrn.medsDue === inp.medsDue, `${inp.medsDue} → ${afterPrn.medsDue}`);

        /* Statsionarning kunlik ro'yxati ham shu qoidadan o'qiydi. */
        const sched = (await call('GET', '/inpatient/med-schedule', undefined, admin)).data;
        const row = (sched?.rows || []).find((r: any) => r.admissionId === adm.data.id);
        const mine = (row?.orders || []).find((o: any) => o.id === med.data.id);
        const asNeeded = (row?.orders || []).find((o: any) => o.id === prn.data?.id);
        ok('ro\'yxatda jadval: kuniga 12, o\'n ikki vaqt', mine?.perDay === 12 && (mine?.slots || []).length === 12,
            JSON.stringify({ perDay: mine?.perDay, slots: mine?.slots?.length }));
        ok('ro\'yxatda kutayotgan dozalar soni', mine?.due === passed, `due ${mine?.due}, o'tgan vaqtlar ${passed}`);
        ok('«og\'riqda» — jadvalsiz', asNeeded?.perDay === null && (asNeeded?.slots || []).length === 0 && asNeeded?.due === 0,
            JSON.stringify(asNeeded));

        /* Har o'tgan vaqt uchun bittadan belgi. «O'tkazib yuborildi» ham
           hamshiraning qarori — doza endi kutmaydi (ombor va hisobga tegmaydi). */
        for (let i = 0; i < passed; i++) {
            const mark = await call('POST', `/medication-orders/${med.data.id}/administer`,
                { status: 'Skipped', skipReason: 'sinov' }, admin);
            if (mark.status !== 200) { ok('doza belgilandi', false, `status ${mark.status}: ${JSON.stringify(mark.data).slice(0, 120)}`); break; }
        }
        inp = (await zones()).inpatient;
        ok('hammasi belgilangach — kutayotgani yo\'q', inp.medsDue === dueBase, `${inp.medsDue}, kutilgan ${dueBase}`);
    }

    const out = await call('POST', `/admissions/${adm.data.id}/discharge`, { confirmDebt: true }, admin);
    ok('bemor chiqarildi', out.status === 200, `status ${out.status}: ${JSON.stringify(out.data).slice(0, 120)}`);
    inp = (await zones()).inpatient;
    ok('koyka bo\'shadi (bemorsiz)', !bed()?.admissionId && bed()?.status !== 'Occupied', JSON.stringify(bed()));
    ok('band soni qaytdi', inp.beds.occupied === before.beds.occupied, `${inp.beds.occupied}`);
    ok('«bugun chiqdi» +1', inp.dischargedToday === before.dischargedToday + 1, `${before.dischargedToday} → ${inp.dischargedToday}`);
    ok('yig\'indi yana jamiga teng', inp.beds.occupied + inp.beds.free + inp.beds.cleaning + inp.beds.blocked === inp.beds.total,
        JSON.stringify(inp.beds));

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
