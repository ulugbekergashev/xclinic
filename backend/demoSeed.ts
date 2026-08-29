/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — NAMOYISH ma'lumoti.

   Nima uchun. `seed.ts` faqat spravochniklarni yaratadi (bo'limlar, shablonlar,
   tahlillar katalogi). Ya'ni yangi o'rnatmada dastur bo'sh ko'rinadi va uning
   imkoniyatlarini ko'rsatib bo'lmaydi. Bu skript esa har bir modulni
   ISHLAYOTGAN holatda to'ldiradi: xodimlar, bemorlar, qabullar, pul, ombor,
   laboratoriya, statsionar, ish haqi, marketing.

   NIMA UCHUN HTTP ORQALI, to'g'ridan-to'g'ri bazaga emas.

   Ombor FEFO bo'yicha chiqadi, to'lov qatorlarga proporsional taqsimlanadi,
   qoldiq harakatlar yig'indisiga teng bo'lishi kerak. Bu qoidalar SERVER
   kodida yashaydi. Bazaga to'g'ridan-to'g'ri yozsak, ma'lumot "chiroyli"
   ko'rinadi, lekin yaxlitlik tekshiruvi darhol buzilish ko'rsatadi — ya'ni
   namoyish dasturning o'zi haqida yolg'on gapirardi.

   Shuning uchun skript xuddi foydalanuvchi kabi ishlaydi: har bir yozuv
   haqiqiy endpoint orqali o'tadi.

   Token PAROLSIZ olinadi: `.env` dagi (yoki `jwt.key` faylidagi) o'sha
   kalitning o'zi bilan imzolanadi. Klinika paroli o'zgartirilmaydi.

   Ishga tushirish:
       cd backend && npm run seed:demo
       (server ishlab turishi shart)
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';

require('dotenv').config();
const { prisma, USER_DATA_PATH } = require('./db');

const BASE = process.env.DEMO_BASE || `http://localhost:${process.env.PORT || 3001}`;

/* ─── Takrorlanadigan tasodif ─────────────────────────────────────────────
   `Math.random` emas: skript ikki marta yurgizilsa natija bir xil bo'lsin,
   va "menda boshqacha chiqdi" degan holat bo'lmasin. */
let seed = 20260828;
const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;

const DAY = 86400000;
const today = new Date();
const dayStr = (offsetDays: number) =>
    new Date(today.getTime() - offsetDays * DAY).toISOString().slice(0, 10);

// ─── HTTP ────────────────────────────────────────────────────────────────────

let TOKEN = '';
let created = 0;
const failures: string[] = [];

async function api(method: string, p: string, body?: any): Promise<any> {
    const r = await fetch(BASE + '/api' + p, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    if (!r.ok) {
        const msg = `${method} ${p} → ${r.status} ${JSON.stringify(data).slice(0, 160)}`;
        failures.push(msg);
        /* Xato DARHOL ko'rsatiladi — ilgari u faqat oxirgi xulosada
           chiqardi va skript o'rtada yiqilsa, sabab umuman ko'rinmasdi:
           «0 bemor» degan qator qolardi, nega ekani noma'lum.

           Birinchi 5 tasi — qolgani xulosada. */
        if (failures.length <= 5) console.error('   ⚠️ ' + msg);
        return null;
    }
    created++;
    return data;
}

/** Xatoni YUTMAYDIGAN variant — javob tanasi kerak bo'lganda (masalan 402 da
 *  qaysi hisob qatori to'lanmagani aytiladi). */
async function apiRaw(method: string, p: string, body?: any): Promise<{ status: number; data: any }> {
    const r = await fetch(BASE + '/api' + p, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    if (r.ok) created++;
    return { status: r.status, data };
}

/** Kalitni server bilan BIR XIL tartibda topadi: env, keyin `jwt.key`. */
function readJwtSecret(): string {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    const keyPath = path.join(USER_DATA_PATH, 'jwt.key');
    if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim();
    throw new Error(`JWT kaliti topilmadi: na .env da, na ${keyPath} da`);
}

// ─── Ma'lumot lug'atlari ─────────────────────────────────────────────────────

const MALE = ['Alisher', 'Bekzod', 'Doston', 'Eldor', 'Farrux', "G'ayrat", 'Jasur', 'Kamol',
    'Lutfulla', 'Murod', 'Nodir', 'Otabek', 'Rustam', 'Sardor', 'Temur', 'Ulug\'bek', 'Zafar', 'Shuhrat'];
const FEMALE = ['Aziza', 'Barno', 'Dilnoza', 'Feruza', 'Gulnora', 'Hulkar', 'Iroda', 'Kamola',
    'Lola', 'Malika', 'Nigora', 'Oysha', 'Rayhona', 'Sevara', 'Shahnoza', 'Umida', 'Zilola', 'Nilufar'];
const SURNAMES = ['Abdullayev', 'Bekmurodov', 'Rahimov', 'Yusupov', 'Karimov', 'Tursunov',
    'Xolmatov', 'Ergashev', 'Sattorov', 'Nazarov', 'Qodirov', 'Ismoilov', 'Mirzayev',
    'Sobirov', 'Jo\'rayev', 'Toshmatov', 'Umarov', 'Xasanov'];

const COMPLAINTS = [
    'Bosh og\'rig\'i, holsizlik', 'Yo\'tal, harorat 37.8', 'Qorin og\'rig\'i',
    'Bel og\'rig\'i, harakatda kuchayadi', 'Yurak sohasidagi noqulaylik',
    'Bosh aylanishi', 'Tomoq og\'rig\'i', 'Nafas qisishi', 'Ko\'ngil aynishi',
    'Bo\'g\'imlardagi og\'riq', 'Uyqusizlik va asabiylik', 'Terining qichishi',
];
const DIAGNOSES = [
    'O\'tkir respirator infeksiya', 'Gastrit, o\'rtacha og\'irlik', 'Osteoxondroz',
    'Arterial gipertenziya, 1-daraja', 'Vegetativ distoniya', 'O\'tkir faringit',
    'Temir tanqisligi anemiyasi', 'Surunkali bronxit, remissiya',
    'Migren', 'Allergik dermatit',
];
const PLANS = [
    'Simptomatik davolash, 7 kun. Nazorat — bir haftadan keyin.',
    'Parhez, dori terapiyasi. Takroriy ko\'rik 10 kundan keyin.',
    'Fizioterapiya kursi 10 seans. Og\'riq qoldiruvchi zarurat bo\'yicha.',
    'Kunlik AB nazorati, tuz cheklovi. Bir oydan keyin qayta ko\'rik.',
    'Antibiotik kursi 5 kun, ko\'p suyuqlik. Nazorat 3 kundan keyin.',
];

/* Kategoriya SERVER ro'yxatidan bo'lishi shart:
   DoctorShare | Salary | Rent | Utilities | Inventory | Lab | Other */
const EXPENSE_ITEMS: [string, string, number, number][] = [
    ['Rent',      'Bino ijarasi',           6000000, 6000000],
    ['Utilities', 'Elektr energiyasi',       380000,  920000],
    ['Utilities', 'Suv va kanalizatsiya',    120000,  260000],
    ['Utilities', 'Internet va telefon',     250000,  250000],
    ['Other',     'Tozalash vositalari',     180000,  640000],
    ['Other',     'Kanselyariya',             90000,  340000],
    ['Other',     'Instagram reklama',       500000, 1800000],
    ['Other',     'Asbob texnik xizmati',    400000, 1500000],
    ['Salary',    'Texnik xodimlar oyligi', 2400000, 3600000],
    ['Lab',       'Reaktivlar',              700000, 1900000],
    ['Inventory', 'Sarf materiallari',       900000, 2200000],
];

const LEAD_SOURCES = ['Instagram', 'Telegram', 'Tavsiya', 'Google', 'Ko\'chadan', 'Facebook'];
const LEAD_STATUSES = ['New', 'Contacted', 'Scheduled', 'Converted', 'Lost'];

const INVENTORY: [string, string, boolean, number, number][] = [
    // [nom, birlik, dorimi, narx, min qoldiq]
    ['Shprits 5 ml', 'dona', false, 1500, 200],
    ['Shprits 2 ml', 'dona', false, 1200, 200],
    ['Steril bint', 'dona', false, 4500, 50],
    ['Paxta 100 g', 'paket', false, 8000, 30],
    ['Spirt salfetka', 'dona', false, 700, 300],
    ['Qo\'lqop (M)', 'juft', false, 1100, 400],
    ['Niqob tibbiy', 'dona', false, 900, 500],
    ['Tizim (kapelnitsa)', 'dona', false, 6500, 80],
    ['Analgin 50% amp.', 'ampula', true, 3200, 60],
    ['Dimedrol amp.', 'ampula', true, 4100, 40],
    ['Ceftriakson 1 g', 'flakon', true, 18000, 50],
    ['Fizio eritma 200 ml', 'flakon', true, 9500, 60],
    ['Glyukoza 5% 200 ml', 'flakon', true, 11000, 40],
    ['Papaverin amp.', 'ampula', true, 3800, 40],
    ['Deksametazon amp.', 'ampula', true, 5200, 40],
    ['Omeprazol 20 mg', 'kapsula', true, 2400, 100],
    ['Paratsetamol 500 mg', 'tabletka', true, 900, 200],
    ['Yod eritmasi 20 ml', 'flakon', true, 7200, 20],
    ['Ekg qog\'ozi', 'rulon', false, 24000, 10],
    ['UZI geli 250 ml', 'flakon', false, 32000, 15],
];

// ─── Asosiy ──────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  XClinic — namoyish ma\'lumoti');
    console.log('═══════════════════════════════════════════════════\n');

    // ── Klinika va token ────────────────────────────────────────────────────
    const clinic = await prisma.clinic.findFirst();
    if (!clinic) throw new Error('Klinika topilmadi. Avval `npx ts-node seed.ts` bajaring.');

    TOKEN = jwt.sign(
        { role: 'CLINIC_ADMIN', name: clinic.adminName || 'Administrator', clinicId: clinic.id },
        readJwtSecret(),
        { expiresIn: '2h' },
    );

    const health = await fetch(BASE + '/health').catch(() => null);
    if (!health || !health.ok) {
        throw new Error(`Server javob bermayapti: ${BASE}. Avval serverni ishga tushiring.`);
    }
    console.log(`Klinika : ${clinic.name}`);
    console.log(`Server  : ${BASE}\n`);

    // ── Spravochniklar ──────────────────────────────────────────────────────
    const departments: any[] = (await api('GET', '/departments')) || [];
    const byCode = (c: string) => departments.find((d) => d.code === c);
    const clinicalDeps = departments.filter((d) => d.type === 'CLINICAL');
    if (clinicalDeps.length === 0) throw new Error('Bo\'limlar yo\'q. Avval `seed.ts` bajaring.');

    const services: any[] = (await api('GET', `/services?clinicId=${clinic.id}`)) || [];
    const labTests: any[] = (await api('GET', '/lab-tests')) || [];
    const wards: any[] = (await api('GET', '/wards')) || [];

    console.log(`Spravochnik: ${departments.length} bo'lim, ${services.length} xizmat, ${labTests.length} tahlil, ${wards.length} palata\n`);

    // ── 1. XODIMLAR ─────────────────────────────────────────────────────────
    console.log('1. Xodimlar');

    const DOCTORS: any[] = [
        ['Nodira', 'Rahimova', 'Terapevt', 'TER', 40, 'none', 0, '201'],
        ['Bahodir', 'Ergashev', 'Kardiolog', 'KARD', 45, 'fixed_kpi', 4000000, '202'],
        ['Malika', 'Yusupova', 'Nevrolog', 'NEVR', 40, 'none', 0, '203'],
        ['Sevara', 'Qodirova', 'Ginekolog', 'GIN', 45, 'none', 0, '204'],
        ['Jasur', 'Tursunov', 'Pediatr', 'PED', 35, 'fixed', 5000000, '205'],
        ['Farrux', 'Xolmatov', 'Xirurg', 'XIR', 50, 'none', 0, '206'],
    ].map((d) => d as any);

    const doctors: any[] = [];
    for (const [firstName, lastName, specialty, depCode, percentage, salaryType, fixedSalary, room] of DOCTORS) {
        const dep = byCode(depCode);
        const doc = await api('POST', '/doctors', {
            firstName, lastName, specialty, room,
            phone: `+9989${int(0, 9)}${String(int(1000000, 9999999))}`.slice(0, 13),
            email: `${firstName.toLowerCase()}@xclinic.uz`,
            status: 'Active',
            username: `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/'/g, ''),
            password: 'Shifokor2026!',
            percentage, salaryType, fixedSalary,
        });
        if (doc?.id) {
            // Bo'lim alohida yangilanadi: yaratishda bu maydon qabul qilinmaydi
            await prisma.doctor.update({ where: { id: doc.id }, data: { departmentId: dep?.id || null } });
            doctors.push({ ...doc, departmentId: dep?.id, depCode });
        }
    }
    /* QAYTA ISHGA TUSHIRISH (idempotentlik).

       Ilgari bu skript faqat BO'SH klinikada ishlardi: ikkinchi marta
       yuritilganda loginlar band bo'lib chiqar, ro'yxat bo'sh qolar va
       quyidagi `doctors[0]` da skript yiqilardi.

       Endi yaratib bo'lmaganlar o'rniga MAVJUDLARI olinadi — namoyish
       ma'lumoti to'ldirib boriladi, qaytadan qurilmaydi. */
    if (doctors.length === 0) {
        const existing: any[] = (await api('GET', '/doctors')) || [];
        for (const d of existing.filter((x: any) => x.status === 'Active')) {
            doctors.push({ ...d, departmentId: d.departmentId, depCode: null });
        }
        console.log(`   ${doctors.length} shifokor (mavjudlari olindi)`);
    } else {
        console.log(`   ${doctors.length} shifokor`);
    }

    for (const [f, l] of [['Zilola', 'Sattorova'], ['Kamola', 'Nazarova']]) {
        await api('POST', '/receptionists', {
            firstName: f, lastName: l,
            phone: `+99890${int(1000000, 9999999)}`,
            username: `${f.toLowerCase()}.reg`, password: 'Registrator2026!',
        });
    }
    console.log('   2 registrator');

    const labTechs: any[] = [];
    for (const [f, l] of [['Umida', 'Ismoilova'], ['Temur', 'Sobirov']]) {
        const t = await api('POST', '/lab-technicians', {
            firstName: f, lastName: l, specialty: 'Laborant',
            phone: `+99893${int(1000000, 9999999)}`,
            username: `${f.toLowerCase()}.lab`, password: 'Laborant2026!',
        });
        if (t?.id) labTechs.push(t);
    }
    console.log(`   ${labTechs.length} laborant`);

    const stacDep = byCode('STAC');
    const nurses: any[] = [];
    for (const [f, l] of [['Gulnora', 'Mirzayeva'], ['Iroda', 'Umarova'], ['Barno', 'Xasanova']]) {
        const n = await api('POST', '/nurses', {
            firstName: f, lastName: l,
            phone: `+99894${int(1000000, 9999999)}`,
            departmentId: stacDep?.id || null,
            username: `${f.toLowerCase()}.hamshira`, password: 'Hamshira2026!',
        });
        if (n?.id) nurses.push(n);
    }
    console.log(`   ${nurses.length} hamshira`);

    // ── 2. BEMORLAR ─────────────────────────────────────────────────────────
    console.log('\n2. Bemorlar');
    const patients: any[] = [];
    for (let i = 0; i < 60; i++) {
        const male = chance(0.48);
        const firstName = male ? pick(MALE) : pick(FEMALE);
        const lastName = pick(SURNAMES) + (male ? '' : 'a');
        const age = int(3, 78);
        const dob = new Date(today.getTime() - age * 365.25 * DAY).toISOString().slice(0, 10);
        const p = await api('POST', '/patients', {
            firstName, lastName,
            phone: `+9989${int(0, 9)}${String(int(1000000, 9999999))}`.slice(0, 13),
            dob, gender: male ? 'Male' : 'Female',
            medicalHistory: chance(0.3) ? pick(['Surunkali gastrit', 'Gipertoniya', 'Allergik anamnez', 'Operatsiya: appendektomiya 2019']) : '',
            address: `Toshkent sh., ${pick(['Chilonzor', 'Yunusobod', 'Mirzo Ulug\'bek', 'Sergeli', 'Yakkasaroy'])} tumani, ${int(1, 80)}-uy`,
            pinfl: chance(0.6) ? String(int(30000000000000, 39999999999999)) : undefined,
        });
        if (p?.id) patients.push(p);
    }
    if (patients.length === 0) {
        const existing: any[] = (await api('GET', '/patients?limit=80')) || [];
        patients.push(...(Array.isArray(existing) ? existing : (existing as any).items || []));
        console.log(`   ${patients.length} bemor (mavjudlari olindi)`);
    } else {
        console.log(`   ${patients.length} bemor`);
    }

    // Allergiya — har uchinchisida
    let allergies = 0;
    for (const p of patients) {
        if (!chance(0.3)) continue;
        const r = await api('POST', `/patients/${p.id}/allergies`, {
            substance: pick(['Penitsillin', 'Analgin', 'Novokain', 'Yod', 'Asal', 'Chang']),
            reaction: pick(['Toshma', 'Kvinke shishi', 'Nafas qisishi', 'Qichishish']),
            severity: pick(['Mild', 'Moderate', 'Severe']),
        });
        if (r) allergies++;
    }
    console.log(`   ${allergies} allergiya yozuvi`);

    // ── 3. QABULLAR, TASHRIFLAR VA PUL ──────────────────────────────────────
    console.log('\n3. Qabullar, tashriflar va to\'lovlar');

    const paidServices = services.filter((s) => s.price > 0);
    let visitCount = 0, chargeCount = 0, payCount = 0, debtCount = 0, apptCount = 0;

    for (const p of patients) {
        /* Zichlik muhim: 165 kunga yoyilgan 80 ta tashrif kuniga yarim
           bemor degani — hech bir ekran to'lgandek ko'rinmaydi. 75 kunlik
           oynada, oxirgi haftalarga og'ir taqsimot bilan yozamiz. */
        const visits = int(2, 6);
        for (let v = 0; v < visits; v++) {
            // Kvadratik taqsimot: yaqin kunlar zichroq
            const daysAgo = 1 + Math.floor(rnd() * rnd() * 74);
            const date = dayStr(daysAgo);
            const doc = pick(doctors);
            const svc = pick(paidServices.length ? paidServices : services);

            /* Yozuv va tashrif — ikkalasi ham yaratiladi: kalendar yozuvni
               ko'rsatadi, navbat va kassa esa tashrifni. */
            const appt = await api('POST', '/appointments', {
                patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
                doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                type: svc?.name || 'Konsultatsiya',
                date, time: `${String(int(8, 17)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}`,
                duration: 30,
                status: daysAgo > 2 ? (chance(0.08) ? 'Cancelled' : 'Completed') : pick(['Pending', 'Confirmed']),
                notes: chance(0.4) ? pick(COMPLAINTS) : '',
            });
            if (appt) apptCount++;
            if (appt?.status === 'Cancelled') continue;

            const visit = await api('POST', '/visits', {
                patientId: p.id, appointmentId: appt?.id || null, date,
                departmentId: doc.departmentId, doctorId: doc.id,
                doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                complaints: pick(COMPLAINTS),
                diagnosis: pick(DIAGNOSES),
                treatmentPlan: pick(PLANS),
                status: daysAgo > 2 ? 'Completed' : pick(['Waiting', 'In Progress']),
            });
            if (!visit?.id) continue;
            visitCount++;

            /* Hisob qatorlari QABUL ORQALI qo'shiladi — `POST /charges` emas.

               Sabab: `POST /charges` qatorga shifokorni yozmaydi, ish haqi
               vedomosti esa aynan `VisitCharge.doctorId` bo'yicha hisoblanadi.
               Interfeys ham shu yo'ldan yuradi (qabul ish stoli), ya'ni bu
               namoyish emas, haqiqiy oqim. Yon foyda: xizmat retsepti
               bo'lsa material AVTOMATIK ombordan chiqadi. */
            const lines = int(1, 3);
            for (let c = 0; c < lines; c++) {
                const s2 = pick(paidServices.length ? paidServices : services);
                await api('POST', `/visits/${visit.id}/procedures`, {
                    serviceId: s2.id,
                    procedureName: s2.name,
                    discount: chance(0.15) ? Math.round(s2.price * 0.1) : 0,
                    doctorId: doc.id,
                    doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                });
                chargeCount++;
            }

            const vCharges: any[] = (await api('GET', `/visits/${visit.id}/charges`)) || [];
            const rows: any[] = Array.isArray(vCharges) ? vCharges : (vCharges as any).charges || [];
            const chargeIds: string[] = rows.filter((r: any) => r.status !== 'Cancelled').map((r: any) => r.id);
            const total = rows.filter((r: any) => r.status !== 'Cancelled')
                .reduce((sum: number, r: any) => sum + (r.total || 0), 0);

            if (chargeIds.length === 0) continue;

            /* To'lov holatlari ataylab turlicha: to'liq, qisman (qarz) va
               to'lanmagan. Aks holda kassa va qarzdorlar ekrani bo'sh
               ko'rinardi. */
            if (daysAgo <= 2 && chance(0.5)) { debtCount++; continue; }   // hali to'lanmagan

            const partial = chance(0.22);
            const amount = partial ? Math.round(total * (0.3 + rnd() * 0.4)) : total;
            const split = chance(0.25) && amount > 50000;

            const pay = await api('POST', '/payments', {
                chargeIds,
                amount,
                ...(split
                    ? { payments: [
                        { method: 'Cash', amount: Math.round(amount / 2) },
                        { method: pick(['Card', 'Click']), amount: amount - Math.round(amount / 2) },
                    ] }
                    : { method: pick(['Cash', 'Cash', 'Card', 'Click', 'Transfer']) }),
                doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                receivedByName: 'Registrator',
            });
            if (pay) { payCount++; if (partial) debtCount++; }
        }
    }
    console.log(`   ${apptCount} yozuv, ${visitCount} tashrif`);
    console.log(`   ${chargeCount} hisob qatori, ${payCount} to'lov, ${debtCount} qarzli holat`);

    // Qaytarish — bittasida
    const anyCharge: any[] = (await api('GET', '/charges?status=Paid')) || [];
    if (anyCharge.length) {
        const c = anyCharge[0];
        await api('POST', `/charges/${c.id}/refund`, {
            amount: Math.round((c.paidAmount || c.total) / 2),
            method: 'Balance', reason: 'Bemor xizmatdan voz kechdi',
        });
        console.log('   1 qaytarish (balansga)');
    }

    /* ─── BUGUNGI NAVBAT ──────────────────────────────────────────────────
       Alohida blok, chunki Registratura, «Mening navbatim» va Navbat tablosi
       faqat BUGUNGI kunni ko'rsatadi. Tarixiy ma'lumot ularni to'ldirmaydi:
       ekran "bugun hech kim kelmagan" bo'lib turadi va namoyish puchga
       chiqadi. Shuning uchun bugungi kun qo'lda, holatlar bo'yicha teriladi. */
    console.log('\n3b. Bugungi navbat');
    const todayStr = dayStr(0);
    let queued = 0;
    const queuePlan: [string, number][] = [
        ['Waiting', 5], ['Called', 2], ['In Progress', 3], ['AwaitingResults', 2], ['Completed', 4],
    ];
    let qi = 0;
    for (const [state, count] of queuePlan) {
        for (let k = 0; k < count; k++) {
            const p = patients[(qi * 3 + 7) % patients.length];
            qi++;
            const doc = doctors[qi % doctors.length];
            const svc = pick(paidServices.length ? paidServices : services);

            await api('POST', '/appointments', {
                patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
                doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                type: svc?.name || 'Konsultatsiya', date: todayStr,
                time: `${String(8 + Math.floor(qi / 2)).padStart(2, '0')}:${qi % 2 ? '30' : '00'}`,
                duration: 30, status: state === 'Completed' ? 'Completed' : 'Confirmed',
                notes: pick(COMPLAINTS),
            });

            const visit = await api('POST', '/visits', {
                patientId: p.id, date: todayStr,
                departmentId: doc.departmentId, doctorId: doc.id,
                doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                complaints: pick(COMPLAINTS),
                status: 'Waiting',
            });
            if (!visit?.id) continue;
            queued++;

            // Navbat raqamini serverning o'zi beradi — qo'lda yozilmaydi
            if (state === 'Called' || state === 'In Progress') {
                await api('POST', `/visits/${visit.id}/call`, {});
            }
            if (state !== 'Waiting' && state !== 'Called') {
                await api('PUT', `/visits/${visit.id}`, {
                    status: state,
                    ...(state !== 'In Progress' ? {
                        diagnosis: pick(DIAGNOSES), treatmentPlan: pick(PLANS),
                    } : {}),
                });
            }
            // Yakunlanganlarga xizmat va to'lov — kassa bugungi kunni ko'rsatsin
            if (state === 'Completed') {
                await api('POST', `/visits/${visit.id}/procedures`, {
                    serviceId: svc.id, procedureName: svc.name,
                    doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                });
                const ch: any[] = (await api('GET', `/visits/${visit.id}/charges`)) || [];
                const rows2: any[] = Array.isArray(ch) ? ch : (ch as any).charges || [];
                const ids = rows2.filter((r: any) => r.status === 'Unpaid').map((r: any) => r.id);
                const due = rows2.filter((r: any) => r.status === 'Unpaid')
                    .reduce((a: number, r: any) => a + (r.total || 0), 0);
                if (ids.length && due > 0) {
                    await api('POST', '/payments', {
                        chargeIds: ids, amount: due, method: pick(['Cash', 'Card', 'Click']),
                        doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                        receivedByName: 'Registrator',
                    });
                }
            }
        }
    }
    console.log(`   ${queued} bemor bugungi navbatda (kutmoqda, chaqirilgan, qabulda, natija kutmoqda, yakunlangan)`);

    // Kelgusi kunlarga yozuvlar — kalendar bo'sh qolmasin
    let future = 0;
    for (let d = 1; d <= 10; d++) {
        for (let k = 0; k < int(1, 4); k++) {
            const p = pick(patients);
            const doc = pick(doctors);
            const r = await api('POST', '/appointments', {
                patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
                doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                type: pick(paidServices.length ? paidServices : services)?.name || 'Konsultatsiya',
                date: new Date(today.getTime() + d * DAY).toISOString().slice(0, 10),
                time: `${String(int(9, 17)).padStart(2, '0')}:${pick(['00', '30'])}`,
                duration: 30, status: 'Pending', notes: '',
            });
            if (r) future++;
        }
    }
    console.log(`   ${future} kelgusi yozuv (10 kunga)`);

    // ── 4. LABORATORIYA ─────────────────────────────────────────────────────
    console.log('\n4. Laboratoriya');
    let labOrders = 0, labFilled = 0, labPaid = 0;
    for (const p of patients.slice(0, 26)) {
        const doc = pick(doctors);
        const tech = labTechs.length ? pick(labTechs) : null;
        const tests = labTests.slice(0, int(1, Math.min(3, labTests.length)));
        if (!tests.length) break;

        const order = await api('POST', '/lab-orders', {
            patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
            doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
            technicianId: tech?.id, technicianName: tech ? `${tech.lastName} ${tech.firstName}` : undefined,
            testIds: tests.map((t: any) => t.id),
            priority: chance(0.2) ? 'Urgent' : 'Normal',
            clinicianNotes: chance(0.3) ? 'Ertalab och qoringa' : undefined,
        });
        if (!order?.id) continue;
        labOrders++;

        // Uchdan ikkisiga natija kiritamiz — qolgani "kutilmoqda" bo'lib qoladi
        if (!chance(0.66)) continue;

        const form: any = await api('GET', `/lab-orders/${order.id}/results`);
        const rows: any[] = [];
        for (const item of (form?.items || form || [])) {
            for (const par of (item.parameters || [])) {
                const lo = par.refLow ?? par.normalMin;
                const hi = par.refHigh ?? par.normalMax;
                const mid = lo != null && hi != null ? Number(lo) + rnd() * (Number(hi) - Number(lo)) : null;
                // Beshdan biri me'yordan tashqarida — dinamika ekrani shuni ko'rsatadi
                const value = mid == null ? pick(['Manfiy', 'Musbat', 'Norma'])
                    : (chance(0.2) ? mid * (chance(0.5) ? 1.4 : 0.6) : mid).toFixed(1);
                rows.push({
                    orderItemId: item.orderItemId || item.id,
                    parameterId: par.parameterId || par.id,
                    value: String(value),
                });
            }
        }
        if (!rows.length) continue;

        /* Natija kiritishdan OLDIN tahlil to'lanishi kerak — server 402 bilan
           "bemorni kassaga yo'naltiring" deydi va qaysi qator to'lanmaganini
           aytadi. Bu haqiqiy qoida, uni chetlab o'tmaymiz: xuddi kassir kabi
           to'laymiz va qaytadan urinamiz. */
        let r = await apiRaw('POST', `/lab-orders/${order.id}/results`, {
            results: rows, enteredBy: tech ? `${tech.lastName} ${tech.firstName}` : 'Laborant',
        });
        if (r.status === 402 && r.data?.chargeId) {
            await api('POST', '/payments', {
                chargeIds: [r.data.chargeId], amount: r.data.due,
                method: pick(['Cash', 'Card']), receivedByName: 'Registrator',
            });
            labPaid++;
            r = await apiRaw('POST', `/lab-orders/${order.id}/results`, {
                results: rows, enteredBy: tech ? `${tech.lastName} ${tech.firstName}` : 'Laborant',
            });
        }
        if (r.status < 300) labFilled++;
        else failures.push(`POST /lab-orders/${order.id}/results → ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
    }
    console.log(`   ${labOrders} buyurtma, ${labFilled} tasi natija bilan, ${labPaid} tasi kassadan o'tdi`);

    // ── 5. DIAGNOSTIKA ──────────────────────────────────────────────────────
    console.log('\n5. Diagnostika');
    const diagDep = byCode('DIAG');
    const MODALITIES: [string, string, number][] = [
        ['UZI', 'Qorin bo\'shlig\'i UZI', 120000],
        ['UZI', 'Qalqonsimon bez UZI', 90000],
        ['XRAY', 'Ko\'krak qafasi rentgeni', 80000],
        ['ECG', 'EKG', 60000],
        ['UZI', 'Yurak exokardiografiyasi', 200000],
    ];
    let studies = 0;
    for (const p of patients.slice(5, 25)) {
        const [modality, name, price] = pick(MODALITIES);
        const doc = pick(doctors);
        const st = await api('POST', '/studies', {
            patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
            departmentId: diagDep?.id, modality, name, price,
            orderedById: doc.id, orderedByName: `Dr. ${doc.firstName} ${doc.lastName}`,
        });
        if (!st?.id) continue;
        studies++;
        if (chance(0.7)) {
            await api('PUT', `/studies/${st.id}`, {
                status: 'Completed',
                findings: pick([
                    'Jigar o\'lchamlari normada, exostruktura bir xil.',
                    'O\'pka maydonlari toza, o\'choqli soyalar aniqlanmadi.',
                    'Sinus ritmi, ChSS 72. O\'zgarishlar aniqlanmadi.',
                    'Qalqonsimon bez hajmi biroz kattalashgan, tugunlar yo\'q.',
                ]),
                conclusion: pick(['Patologiya aniqlanmadi', 'Yosh me\'yori chegarasida',
                    'Kuzatuv tavsiya etiladi', 'Mutaxassis konsultatsiyasi kerak']),
                performedByName: 'Diagnostika bo\'limi', price,
            });
        }
    }
    console.log(`   ${studies} tekshiruv`);

    // ── 6. RETSEPT VA KO'RSATKICHLAR ────────────────────────────────────────
    console.log('\n6. Retseptlar va ko\'rsatkichlar');
    let rx = 0, vitals = 0;
    for (const p of patients.slice(0, 22)) {
        const doc = pick(doctors);
        const r = await api('POST', '/prescriptions', {
            patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
            doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
            notes: 'Ovqatdan keyin qabul qilinsin',
            items: [
                { name: pick(['Omeprazol 20 mg', 'Paratsetamol 500 mg', 'Amoksitsillin 500 mg']),
                  dosage: '1 tabletka', frequency: 'kuniga 2 mahal', duration: '7 kun' },
                { name: pick(['Vitamin D3', 'Magniy B6', 'Probiotik']),
                  dosage: '1 kapsula', frequency: 'kuniga 1 mahal', duration: '30 kun' },
            ],
        });
        if (r) rx++;

        const v = await api('POST', '/vitals', {
            patientId: p.id,
            /* MASSIV, obyekt emas: har o'lchov alohida qator bo'lib yoziladi
               (`kind` + `value`), shunda dinamika grafigi qurish mumkin. */
            measurements: [
                { kind: 'Temp', value: Number((36.4 + rnd() * 1.4).toFixed(1)) },
                { kind: 'BpSys', value: int(105, 155) },
                { kind: 'BpDia', value: int(65, 95) },
                { kind: 'Pulse', value: int(58, 96) },
                { kind: 'Weight', value: int(48, 98) },
                { kind: 'Height', value: int(150, 190) },
                { kind: 'SpO2', value: int(94, 99) },
            ],
        });
        if (v) vitals++;
    }
    console.log(`   ${rx} retsept, ${vitals} ko'rsatkich o'lchovi`);

    // ── 7. OMBOR ────────────────────────────────────────────────────────────
    console.log('\n7. Ombor');
    const items: any[] = [];
    for (const [name, unit, isMed, price, minQty] of INVENTORY) {
        const it = await api('POST', '/inventory', {
            name, unit, quantity: 0, minQuantity: minQty, price,
            isMedication: isMed, isConsumable: true,
            departmentId: isMed ? byCode('APT')?.id : null,
        });
        if (it?.id) items.push(it);
    }

    let batches = 0;
    for (const it of items) {
        // Ikki-uch partiya: biri muddati yaqin, biri normal
        const n = int(2, 3);
        for (let b = 0; b < n; b++) {
            const soon = b === 0 && chance(0.35);
            const expired = b === 0 && chance(0.12);
            const expiry = expired ? dayStr(int(5, 40))
                : soon ? new Date(today.getTime() + int(10, 45) * DAY).toISOString().slice(0, 10)
                : new Date(today.getTime() + int(200, 700) * DAY).toISOString().slice(0, 10);
            const qty = int(40, 400);
            const r = await api('POST', '/stock-movements/in', {
                itemId: it.id, quantity: qty,
                cost: Math.round(qty * (it.price || 1000) * 0.75),
                batchNumber: `P-${dayStr(int(10, 200)).replace(/-/g, '')}-${b + 1}`,
                expiryDate: expiry,
                note: 'Yetkazib beruvchidan qabul qilindi',
            });
            if (r) batches++;
        }
    }

    // Chiqim: bemor kartasidan material, qo'lda chiqim, inventarizatsiya
    let outs = 0;
    for (const p of patients.slice(0, 18)) {
        const it = pick(items);
        const r = await api('POST', '/stock-movements/out', {
            itemId: it.id, quantity: int(1, 6), reason: 'Manual',
            patientId: p.id, note: 'Muolaja paytida sarflandi',
        });
        if (r) outs++;
    }
    for (const it of items.slice(0, 6)) {
        await api('POST', '/stock-movements/out', {
            itemId: it.id, quantity: int(1, 4),
            reason: pick(['Damaged', 'Expired']), note: 'Yaroqsiz holga keldi',
        });
        outs++;
    }
    // Inventarizatsiya — ikkita mahsulotda
    for (const it of items.slice(0, 2)) {
        const cur: any[] = (await api('GET', `/inventory?clinicId=${clinic.id}`)) || [];
        const fresh = cur.find((x: any) => x.id === it.id);
        if (fresh) {
            await api('POST', '/stock-movements/adjust', {
                itemId: it.id, actualQuantity: Math.max(0, fresh.quantity - int(1, 3)),
                note: 'Oylik inventarizatsiya',
            });
        }
    }
    // Bo'limlar orasida ko'chirish
    if (clinicalDeps.length >= 2 && items.length) {
        await api('POST', '/stock-movements/transfer', {
            itemId: items[0].id, quantity: 10,
            fromDepartmentId: byCode('APT')?.id, toDepartmentId: clinicalDeps[0].id,
            note: 'Terapiya kabinetiga berildi',
        });
    }

    // Xizmat retsepti — materiallar avtomatik chiqishi uchun
    let recipes = 0;
    for (const s of paidServices.slice(0, 5)) {
        const r = await api('PUT', `/service-recipes/${s.id}`, {
            lines: [
                { itemId: items[0].id, quantity: 1 },
                { itemId: items[4].id, quantity: 2 },
            ],
        });
        if (r) recipes++;
    }
    console.log(`   ${items.length} mahsulot, ${batches} partiya, ${outs} chiqim, ${recipes} xizmat retsepti`);

    // ── 8. STATSIONAR ───────────────────────────────────────────────────────
    console.log('\n8. Statsionar');
    const beds: any[] = [];
    for (const w of wards) for (const b of (w.beds || [])) beds.push({ ...b, wardName: w.name });
    const freeBeds = beds.filter((b) => b.status !== 'Occupied');

    let admissions = 0, rounds = 0, meds = 0;
    for (let i = 0; i < Math.min(5, freeBeds.length); i++) {
        const p = patients[10 + i];
        const doc = pick(doctors);
        const adm = await api('POST', '/admissions', {
            patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
            departmentId: stacDep?.id, doctorId: doc.id,
            doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
            bedId: freeBeds[i].id,
            reason: pick(['Kuzatuv va infuzion terapiya', 'Operatsiyadan keyingi davr', 'Og\'riq sindromi']),
            diagnosis: pick(DIAGNOSES),
            dailyRate: pick([150000, 200000, 250000]),
        });
        if (!adm?.id) continue;
        admissions++;

        for (let r = 0; r < int(1, 3); r++) {
            const ok = await api('POST', `/admissions/${adm.id}/rounds`, {
                doctorId: doc.id, doctorName: `Dr. ${doc.firstName} ${doc.lastName}`,
                notes: pick(['Holati barqaror, shikoyat kamaydi.', 'Harorat normallashdi.', 'Dinamika ijobiy.']),
                plan: 'Davolash davom ettiriladi',
            });
            if (ok) rounds++;
        }
        const med = await api('POST', `/admissions/${adm.id}/medications`, {
            name: pick(['Ceftriakson 1 g', 'Fizio eritma 200 ml', 'Analgin 50%']),
            dosage: '1 flakon', route: 'v/i', frequency: 'kuniga 2 mahal',
            startDate: dayStr(int(0, 3)),
        });
        if (med) meds++;

        await api('POST', `/admissions/${adm.id}/charge-bed-days`, {});

        /* Ikkitasini chiqaramiz — statsionar tarixi ham bo'lsin.

           Chiqarishdan OLDIN hisob yopiladi: server to'lanmagan qarz bilan
           chiqarishni 409 bilan rad etadi va bu to'g'ri qoida — bemor ketib
           qolsa qarz osilib qoladi. Shuning uchun avval kassa. */
        if (i >= 3) {
            const bill: any = await api('GET', `/admissions/${adm.id}/billing`);
            const unpaid = (bill?.charges || []).filter((c: any) => (c.total - (c.paidAmount || 0)) > 0.5);
            if (unpaid.length && bill.due > 0) {
                await api('POST', '/payments', {
                    chargeIds: unpaid.map((c: any) => c.id),
                    amount: bill.due,
                    method: pick(['Cash', 'Card']),
                    receivedByName: 'Registrator',
                });
            }
            await api('POST', `/admissions/${adm.id}/discharge`, {
                epicrisis: 'Holati yaxshilandi, ambulator davolashga chiqarildi.',
                outcome: 'Improved',
            });
        }
    }
    console.log(`   ${admissions} yotqizish, ${rounds} ko'rik, ${meds} dori tayinlovi`);

    // ── 9. XARAJATLAR VA KASSA ──────────────────────────────────────────────
    console.log('\n9. Xarajatlar va kassa');
    let expenses = 0;
    /* Uch oy: tushum ham shu oynada yig'ilgan. Olti oylik xarajat va ikki
       oylik tushum yonma-yon turganda hisobot "zarar" ko'rsatardi — bu
       ma'lumotning xatosi, dasturning emas. */
    for (let m = 0; m < 3; m++) {
        for (const [category, title, min, max] of EXPENSE_ITEMS) {
            if (m > 0 && chance(0.35)) continue;
            const r = await api('POST', '/expenses', {
                date: dayStr(m * 30 + int(1, 25)),
                amount: min === max ? min : int(min, max),
                category, title,
                method: pick(['Cash', 'Card', 'Transfer']),
                departmentId: chance(0.3) ? pick(clinicalDeps).id : undefined,
            });
            if (r) expenses++;
        }
    }
    console.log(`   ${expenses} xarajat`);

    let moves = 0;
    for (let d = 0; d < 12; d++) {
        if (chance(0.5)) {
            const r = await api('POST', '/cash-movements', {
                date: dayStr(d), type: pick(['CashIn', 'Encashment']),
                amount: int(50000, 900000), method: 'Cash',
                note: pick(['Kassaga qo\'shimcha', 'Inkassatsiya', 'Xo\'jalik ehtiyoji', 'Avans qaytarildi']),
            });
            if (r) moves++;
        }
    }
    console.log(`   ${moves} kassa harakati`);

    // Smena yopilishi — oxirgi 8 kun
    let closures = 0;
    for (let d = 8; d >= 1; d--) {
        const date = dayStr(d);
        const exp: any = await api('GET', `/cash-register/expected?date=${date}&shift=1`);
        const expected = Number(exp?.expectedCash ?? exp?.cash ?? 0);
        // Ba'zi kunlarda kichik farq — kassa ekrani buni ko'rsatadi
        const counted = Math.max(0, expected + (chance(0.25) ? int(-30000, 30000) : 0));
        const r = await api('POST', '/cash-register/close', {
            date, shift: 1, countedCash: counted,
            note: counted === expected ? undefined : 'Farq tekshirilmoqda',
        });
        if (r) closures++;
    }
    console.log(`   ${closures} smena yopilishi`);

    // ── 10. BO'LIB TO'LASH ──────────────────────────────────────────────────
    console.log('\n10. Bo\'lib to\'lash');
    let plans = 0;
    for (const p of patients.slice(20, 26)) {
        const total = int(2, 8) * 1000000;
        const months = int(3, 6);
        const perMonth = Math.round(total / months);
        const items2 = Array.from({ length: months }, (_, i) => ({
            expectedDate: new Date(today.getTime() + (i + 1) * 30 * DAY).toISOString().slice(0, 10),
            amount: perMonth,
            status: i === 0 && chance(0.5) ? 'Paid' : 'Pending',
        }));
        const r = await api('POST', '/installments', {
            patientId: p.id, doctorId: pick(doctors).id,
            service: pick(['Kompleks davolash', 'Operatsiya', 'Statsionar davolash']),
            totalAmount: total,
            totalPaid: items2.filter((i) => i.status === 'Paid').reduce((s, i) => s + i.amount, 0),
            startDate: dayStr(0),
            endDate: new Date(today.getTime() + months * 30 * DAY).toISOString().slice(0, 10),
            status: 'Active', items: items2,
        });
        if (r) plans++;
    }
    console.log(`   ${plans} bo'lib to'lash rejasi`);

    // ── 11. MARKETING ───────────────────────────────────────────────────────
    console.log('\n11. Lidlar va xabarlar');
    let leads = 0;
    for (let i = 0; i < 28; i++) {
        const male = chance(0.5);
        const r = await api('POST', '/leads', {
            name: `${male ? pick(MALE) : pick(FEMALE)} ${pick(SURNAMES)}`,
            phone: `+9989${int(0, 9)}${String(int(1000000, 9999999))}`.slice(0, 13),
            source: pick(LEAD_SOURCES),
            status: pick(LEAD_STATUSES),
            note: pick(['Narx so\'radi', 'UZI ga yozilmoqchi', 'Konsultatsiya kerak', 'Qayta qo\'ng\'iroq qilish']),
        });
        if (r) leads++;
    }

    const templates: any[] = [];
    for (const [name, text] of [
        ['Qabul eslatmasi', 'Hurmatli {ism}! Sizning qabulingiz {sana} kuni soat {vaqt} da. XClinic'],
        ['Tug\'ilgan kun', 'Hurmatli {ism}, tug\'ilgan kuningiz bilan! XClinic jamoasi'],
        ['Natija tayyor', 'Hurmatli {ism}, tahlil natijangiz tayyor. Klinikaga murojaat qiling.'],
        ['Qarz eslatmasi', 'Hurmatli {ism}, {summa} so\'m qarzdorlik mavjud. XClinic'],
        ['Kelmagan bemor', 'Hurmatli {ism}, sizni kutdik. Qulay vaqtga yozilishingiz mumkin.'],
    ]) {
        const t = await api('POST', '/message-templates', { name, text });
        if (t?.id) templates.push(t);
    }

    let rules = 0;
    if (templates.length >= 3) {
        for (const [name, tpl, trigger, hours] of [
            ['Qabuldan 24 soat oldin', 0, 'before_appointment', 24],
            ['Tug\'ilgan kun tabrigi', 1, 'birthday', null],
            ['Kelmaganlarga follow-up', 4, 'no_show', null],
        ] as any[]) {
            const r = await api('POST', '/automation-rules', {
                name, templateId: templates[tpl].id, trigger,
                hoursBefore: hours, channel: 'telegram',
            });
            if (r) rules++;
        }
    }
    console.log(`   ${leads} lid, ${templates.length} shablon, ${rules} avtomatik qoida`);

    // ── 12. ISH HAQI ────────────────────────────────────────────────────────
    console.log('\n12. Ish haqi');
    for (const d of doctors) {
        await api('PUT', `/doctor-rates/${d.id}`, {
            rates: paidServices.slice(0, 4).map((s: any) => ({
                serviceId: s.id, percent: int(30, 55),
            })),
        });
    }
    /* Davr — JORIY oy. `computePayroll` to'lov qatorining YOZILGAN vaqti
       (`ChargePayment.createdAt`) bo'yicha yig'adi, tashrif sanasi bo'yicha
       emas. Namoyish to'lovlari bugun yozilgani uchun eski davrda vedomost
       bo'sh chiqardi. */
    const pFrom = dayStr(0).slice(0, 8) + '01';
    const pTo = dayStr(0);
    const run = await api('POST', '/payroll/runs', { periodFrom: pFrom, periodTo: pTo });
    if (run?.id) {
        await api('POST', `/payroll/runs/${run.id}/approve`, {});
        const full: any = await api('GET', `/payroll/runs/${run.id}`);
        for (const line of (full?.lines || []).slice(0, 3)) {
            await api('POST', `/payroll/lines/${line.id}/pay`, { amount: line.accrued, method: 'Cash' });
        }
        console.log(`   1 vedomost (${pFrom} … ${pTo}), ${(full?.lines || []).length} qator`);
    } else {
        console.log('   vedomost yaratilmadi (davr band bo\'lishi mumkin)');
    }

    // -- 13. VAQT BELGILARINI TARQATISH -------------------------------------
    /* MUAMMO (S5.8, audit B-38).

       Namoyish ma'lumoti API orqali yoziladi — bu ataylab, chunki shunda u
       serverning barcha qoidalaridan o'tadi va yaxlitlik buzilmaydi. Lekin
       `createdAt` server tomonda `now()` bo'ladi, ya'ni MINGTA to'lov ham
       bitta soniyaga tushadi.

       Audit buni ko'rgan: «286 to'lovning hammasi 17:03 da». Dev bazada
       o'lchandi — 495 ta `ChargePayment` aynan bitta vaqt belgisida.
       Kassa kitobi, kunlik oqim grafigi va smena hisoboti shunda ma'nosiz
       ko'rinadi: demo qilayotganda mijoz birinchi bo'lib shuni sezadi.

       TUZATISH — FAQAT VAQT BELGISI. Summalar, bog'lanishlar va holatlar
       tegilmaydi, ya'ni quyidagi yaxlitlik tekshiruvi buzilmaydi. Har yozuv
       o'zining BIZNES sanasiga ko'chiriladi va klinika ish vaqtiga
       taqsimlanadi.

       Toshkent = UTC+5, baza esa UTC saqlaydi: mahalliy 09:00-18:00 UTC da
       04:00-13:00 ga to'g'ri keladi. */
    console.log('\n13. Vaqt belgilarini tarqatish');

    const WORK_START_UTC = 4 * 3600;   // mahalliy 09:00
    const WORK_SPAN = 9 * 3600;        // 09:00 dan 18:00 gacha

    const randomWorkMs = `(${WORK_START_UTC} + ABS(RANDOM()) % ${WORK_SPAN}) * 1000`;

    const txUpdated: number = await prisma.$executeRawUnsafe(
        `UPDATE "Transaction"
            SET "createdAt" = CAST(strftime('%s', "date") AS INTEGER) * 1000 + ${randomWorkMs}
          WHERE "date" IS NOT NULL AND "date" != ''`);

    /* `ChargePayment` da o'z sanasi yo'q — u bog'langan qatorning tashrif
       sanasidan olinadi. Tashrifsiz qatorlar (koyka haqi, dori) tegilmaydi. */
    const payUpdated: number = await prisma.$executeRawUnsafe(
        `UPDATE "ChargePayment"
            SET "createdAt" = (
                SELECT CAST(strftime('%s', v."date") AS INTEGER) * 1000 + ${randomWorkMs}
                  FROM "VisitCharge" c
                  JOIN "Visit" v ON v."id" = c."visitId"
                 WHERE c."id" = "ChargePayment"."chargeId"
            )
          WHERE EXISTS (
                SELECT 1 FROM "VisitCharge" c
                  JOIN "Visit" v ON v."id" = c."visitId"
                 WHERE c."id" = "ChargePayment"."chargeId" AND v."date" IS NOT NULL
          )`);

    console.log(`   ${txUpdated} kassa yozuvi, ${payUpdated} hisob to'lovi kun bo'yicha taqsimlandi`);


    // ── YAKUN ───────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  Yaratildi: ${created} yozuv`);
    if (failures.length) {
        console.log(`  Xatolar  : ${failures.length}`);
        failures.slice(0, 12).forEach((f) => console.log('    ·', f));
        if (failures.length > 12) console.log(`    · ... yana ${failures.length - 12} ta`);
    } else {
        console.log('  Xatolar  : yo\'q');
    }

    /* Yaxlitlik tekshiruvi — namoyish ma'lumoti QOIDALARNI buzmaganini
       tasdiqlaydi. Bu shunchaki chiroyli raqam emas: agar seed bazaga
       to'g'ridan-to'g'ri yozganda edi, aynan shu yerda buzilish chiqardi. */
    const integ: any = await api('GET', '/admin/integrity');
    if (integ) {
        console.log(`  Yaxlitlik: ${integ.errorCount === 0 ? '✅ buzilish yo\'q' : `❌ ${integ.errorCount} buzilish`}`);
        if (integ.errorCount > 0) {
            (integ.checks || []).filter((c: any) => c.severity === 'error')
                .forEach((c: any) => console.log(`    · ${c.key}: ${c.count}`));
        }
    }
    console.log('═══════════════════════════════════════════════════\n');
}

main()
    .catch((e) => { console.error('\n❌ Xatolik:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
