/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — boshlang'ich ma'lumotlar.

   Bu seed KLINIKA MA'LUMOTINI emas, SPRAVOCHNIKLARNI yaratadi: bo'limlar,
   qabul bayoni shablonlari, tahlillar katalogi va normalar. Bemor, qabul yoki
   to'lov yozuvlari yaratilmaydi — ular klinikaning o'z ma'lumoti.

   Qayta ishga tushirish xavfsiz: hamma narsa mavjudligi tekshirib yaratiladi.

   Ishga tushirish:  npx ts-node seed.ts
   ───────────────────────────────────────────────────────────────────────────── */

import { prisma } from './db';
import bcrypt from 'bcryptjs';

// ─── Bo'limlar ───────────────────────────────────────────────────────────────
// Umumiy ko'p profilli klinika uchun standart to'plam. Sozlamalarda tahrirlanadi.
const DEPARTMENTS = [
    { code: 'TER',  name: 'Terapiya',      type: 'CLINICAL',   color: '#2563EB', sortOrder: 1 },
    { code: 'KARD', name: 'Kardiologiya',  type: 'CLINICAL',   color: '#DC2626', sortOrder: 2 },
    { code: 'NEVR', name: 'Nevrologiya',   type: 'CLINICAL',   color: '#7C3AED', sortOrder: 3 },
    { code: 'GIN',  name: 'Ginekologiya',  type: 'CLINICAL',   color: '#DB2777', sortOrder: 4 },
    { code: 'PED',  name: 'Pediatriya',    type: 'CLINICAL',   color: '#0891B2', sortOrder: 5 },
    { code: 'XIR',  name: 'Xirurgiya',     type: 'CLINICAL',   color: '#059669', sortOrder: 6 },
    { code: 'LOR',  name: 'LOR',           type: 'CLINICAL',   color: '#D97706', sortOrder: 7 },
    { code: 'LAB',  name: 'Laboratoriya',  type: 'LAB',        color: '#0D9488', sortOrder: 8 },
    { code: 'DIAG', name: 'Diagnostika',   type: 'DIAGNOSTIC', color: '#4F46E5', sortOrder: 9 },
    { code: 'STAC', name: 'Statsionar',    type: 'INPATIENT',  color: '#B45309', sortOrder: 10 },
    { code: 'APT',  name: 'Dorixona',      type: 'PHARMACY',   color: '#65A30D', sortOrder: 11 },
];

// ─── Qabul bayoni shablonlari ────────────────────────────────────────────────
// Tish kartasining o'rnini shular egallaydi. `fields` JSON sifatida saqlanadi.
const VITALS = [
    { key: 'temperature', label: 'Harorat',      type: 'number', unit: '°C',     group: "Ko'rsatkichlar" },
    { key: 'bpSystolic',  label: 'AB sistolik',  type: 'number', unit: 'mm.sim', group: "Ko'rsatkichlar" },
    { key: 'bpDiastolic', label: 'AB diastolik', type: 'number', unit: 'mm.sim', group: "Ko'rsatkichlar" },
    { key: 'pulse',       label: 'Puls',         type: 'number', unit: "zarba/daq", group: "Ko'rsatkichlar" },
    { key: 'weight',      label: 'Vazn',         type: 'number', unit: 'kg',     group: "Ko'rsatkichlar" },
    { key: 'height',      label: "Bo'y",         type: 'number', unit: 'sm',     group: "Ko'rsatkichlar" },
];

const ANAMNESIS = [
    { key: 'anamnesis',  label: 'Kasallik anamnezi', type: 'textarea', group: 'Anamnez' },
    { key: 'allergies',  label: 'Allergiya',         type: 'text',     group: 'Anamnez' },
    { key: 'chronic',    label: 'Surunkali kasalliklar', type: 'text', group: 'Anamnez' },
];

const TEMPLATES: Record<string, { name: string; fields: any[] }> = {
    TER: {
        name: 'Terapevt ko\'rigi',
        fields: [
            ...VITALS, ...ANAMNESIS,
            { key: 'generalState', label: 'Umumiy holat', type: 'select', options: ['Qoniqarli', "O'rta og'ir", "Og'ir"], group: "Ob'ektiv ko'rik" },
            { key: 'skin',      label: 'Teri qoplamlari', type: 'text',     group: "Ob'ektiv ko'rik" },
            { key: 'lungs',     label: "O'pka (auskultatsiya)", type: 'textarea', group: "Ob'ektiv ko'rik" },
            { key: 'heart',     label: 'Yurak tonlari',   type: 'textarea', group: "Ob'ektiv ko'rik" },
            { key: 'abdomen',   label: 'Qorin palpatsiyasi', type: 'textarea', group: "Ob'ektiv ko'rik" },
        ],
    },
    KARD: {
        name: 'Kardiolog ko\'rigi',
        fields: [
            ...VITALS, ...ANAMNESIS,
            { key: 'bpRight',   label: "AB o'ng qo'l",  type: 'text', group: "Ob'ektiv ko'rik" },
            { key: 'bpLeft',    label: "AB chap qo'l",  type: 'text', group: "Ob'ektiv ko'rik" },
            { key: 'heartRhythm', label: 'Yurak ritmi', type: 'select', options: ["To'g'ri", "Aritmik"], group: "Ob'ektiv ko'rik" },
            { key: 'murmur',    label: 'Shovqinlar',    type: 'text',     group: "Ob'ektiv ko'rik" },
            { key: 'edema',     label: 'Shishlar',      type: 'select', options: ["Yo'q", 'Oyoqlarda', 'Umumiy'], group: "Ob'ektiv ko'rik" },
            { key: 'ecg',       label: 'EKG xulosasi',  type: 'textarea', group: 'Tekshiruv' },
        ],
    },
    NEVR: {
        name: 'Nevrolog ko\'rigi',
        fields: [
            ...VITALS, ...ANAMNESIS,
            { key: 'consciousness', label: 'Ong', type: 'select', options: ['Tiniq', 'Karaxt', 'Sopor', 'Koma'], group: 'Nevrologik status' },
            { key: 'cranialNerves', label: 'Bosh miya nervlari', type: 'textarea', group: 'Nevrologik status' },
            { key: 'reflexes',   label: 'Reflekslar',   type: 'textarea', group: 'Nevrologik status' },
            { key: 'sensitivity', label: 'Sezuvchanlik', type: 'textarea', group: 'Nevrologik status' },
            { key: 'coordination', label: 'Koordinatsiya', type: 'text',  group: 'Nevrologik status' },
        ],
    },
    GIN: {
        name: 'Ginekolog ko\'rigi',
        fields: [
            ...VITALS, ...ANAMNESIS,
            { key: 'menarche',     label: 'Menarxe (yosh)',      type: 'number', group: 'Ginekologik anamnez' },
            { key: 'cycle',        label: 'Sikl',                type: 'text',   group: 'Ginekologik anamnez' },
            { key: 'lastPeriod',   label: 'Oxirgi hayz sanasi',  type: 'text',   group: 'Ginekologik anamnez' },
            { key: 'pregnancies',  label: 'Homiladorlik soni',   type: 'number', group: 'Ginekologik anamnez' },
            { key: 'births',       label: "Tug'ruq soni",        type: 'number', group: 'Ginekologik anamnez' },
            { key: 'externalExam', label: "Tashqi ko'rik",       type: 'textarea', group: "Ko'rik" },
            { key: 'speculum',     label: "Ko'zgu yordamida",    type: 'textarea', group: "Ko'rik" },
            { key: 'bimanual',     label: 'Bimanual tekshiruv',  type: 'textarea', group: "Ko'rik" },
        ],
    },
    PED: {
        name: 'Pediatr ko\'rigi',
        fields: [
            ...VITALS,
            { key: 'birthWeight', label: "Tug'ilgandagi vazn", type: 'number', unit: 'g', group: 'Anamnez' },
            { key: 'feeding',   label: 'Ovqatlanish', type: 'select', options: ['Ko\'krak suti', 'Aralash', 'Sun\'iy'], group: 'Anamnez' },
            { key: 'vaccines',  label: 'Emlashlar',   type: 'select', options: ['Kalendar bo\'yicha', 'Kechikkan', 'Yo\'q'], group: 'Anamnez' },
            ...ANAMNESIS,
            { key: 'generalState', label: 'Umumiy holat', type: 'select', options: ['Qoniqarli', "O'rta og'ir", "Og'ir"], group: "Ob'ektiv ko'rik" },
            { key: 'throat',    label: "Tomoq",       type: 'textarea', group: "Ob'ektiv ko'rik" },
            { key: 'lungs',     label: "O'pka",       type: 'textarea', group: "Ob'ektiv ko'rik" },
            { key: 'abdomen',   label: 'Qorin',       type: 'textarea', group: "Ob'ektiv ko'rik" },
            { key: 'stool',     label: 'Najas',       type: 'text',     group: "Ob'ektiv ko'rik" },
        ],
    },
    XIR: {
        name: 'Xirurg ko\'rigi',
        fields: [
            ...VITALS, ...ANAMNESIS,
            { key: 'localStatus', label: 'Lokal status', type: 'textarea', group: "Ko'rik" },
            { key: 'woundState',  label: 'Yara holati',  type: 'textarea', group: "Ko'rik" },
            { key: 'palpation',   label: 'Palpatsiya',   type: 'textarea', group: "Ko'rik" },
        ],
    },
    LOR: {
        name: 'LOR ko\'rigi',
        fields: [
            ...VITALS, ...ANAMNESIS,
            { key: 'nose',   label: 'Burun',   type: 'textarea', group: "Ko'rik" },
            { key: 'throat', label: 'Tomoq',   type: 'textarea', group: "Ko'rik" },
            { key: 'ears',   label: "Quloqlar", type: 'textarea', group: "Ko'rik" },
            { key: 'hearing', label: "Eshitish", type: 'text',   group: "Ko'rik" },
        ],
    },
};

// ─── Tahlillar katalogi va normalar ──────────────────────────────────────────
// Normalar kattalar uchun standart qiymatlar. sex: null = hammaga.
type Param = { name: string; unit?: string; refLow?: number; refHigh?: number; refText?: string; sex?: string };

const LAB_TESTS: { code: string; name: string; sampleType: string; price: number; turnaround: number; params: Param[] }[] = [
    {
        code: 'UQT', name: 'Umumiy qon tahlili', sampleType: 'Qon', price: 35000, turnaround: 4,
        params: [
            { name: 'Gemoglobin', unit: 'g/l', refLow: 130, refHigh: 160, sex: 'Male' },
            { name: 'Gemoglobin', unit: 'g/l', refLow: 120, refHigh: 150, sex: 'Female' },
            { name: 'Eritrotsitlar', unit: '×10¹²/l', refLow: 4.0, refHigh: 5.1, sex: 'Male' },
            { name: 'Eritrotsitlar', unit: '×10¹²/l', refLow: 3.7, refHigh: 4.7, sex: 'Female' },
            { name: 'Gematokrit', unit: '%', refLow: 40, refHigh: 48, sex: 'Male' },
            { name: 'Gematokrit', unit: '%', refLow: 36, refHigh: 42, sex: 'Female' },
            { name: 'Rangli ko\'rsatkich', refLow: 0.85, refHigh: 1.05 },
            { name: 'Leykotsitlar', unit: '×10⁹/l', refLow: 4.0, refHigh: 9.0 },
            { name: 'Trombotsitlar', unit: '×10⁹/l', refLow: 180, refHigh: 320 },
            { name: 'Tayoqcha yadroli', unit: '%', refLow: 1, refHigh: 6 },
            { name: 'Segment yadroli', unit: '%', refLow: 47, refHigh: 72 },
            { name: 'Eozinofillar', unit: '%', refLow: 0.5, refHigh: 5 },
            { name: 'Limfotsitlar', unit: '%', refLow: 19, refHigh: 37 },
            { name: 'Monotsitlar', unit: '%', refLow: 3, refHigh: 11 },
            { name: 'EChT', unit: 'mm/soat', refLow: 2, refHigh: 10, sex: 'Male' },
            { name: 'EChT', unit: 'mm/soat', refLow: 2, refHigh: 15, sex: 'Female' },
        ],
    },
    {
        code: 'UST', name: 'Umumiy siydik tahlili', sampleType: 'Siydik', price: 25000, turnaround: 4,
        params: [
            { name: 'Rang', refText: 'Somon-sariq' },
            { name: 'Tiniqlik', refText: 'Tiniq' },
            { name: 'Solishtirma og\'irlik', refLow: 1010, refHigh: 1025 },
            { name: 'pH', refLow: 5.0, refHigh: 7.0 },
            { name: 'Oqsil', unit: 'g/l', refText: 'Yo\'q' },
            { name: 'Glukoza', refText: 'Yo\'q' },
            { name: 'Leykotsitlar', unit: "ko'rish maydonida", refLow: 0, refHigh: 3, sex: 'Male' },
            { name: 'Leykotsitlar', unit: "ko'rish maydonida", refLow: 0, refHigh: 5, sex: 'Female' },
            { name: 'Eritrotsitlar', unit: "ko'rish maydonida", refLow: 0, refHigh: 1 },
            { name: 'Epiteliy', unit: "ko'rish maydonida", refLow: 0, refHigh: 5 },
        ],
    },
    {
        code: 'BIOX', name: 'Biokimyoviy qon tahlili', sampleType: 'Qon', price: 90000, turnaround: 8,
        params: [
            { name: 'Glukoza', unit: 'mmol/l', refLow: 3.3, refHigh: 5.5 },
            { name: 'Umumiy oqsil', unit: 'g/l', refLow: 65, refHigh: 85 },
            { name: 'Kreatinin', unit: 'µmol/l', refLow: 62, refHigh: 115, sex: 'Male' },
            { name: 'Kreatinin', unit: 'µmol/l', refLow: 53, refHigh: 97, sex: 'Female' },
            { name: 'Mochevina', unit: 'mmol/l', refLow: 2.5, refHigh: 8.3 },
            { name: 'ALT', unit: 'U/l', refLow: 0, refHigh: 41, sex: 'Male' },
            { name: 'ALT', unit: 'U/l', refLow: 0, refHigh: 33, sex: 'Female' },
            { name: 'AST', unit: 'U/l', refLow: 0, refHigh: 37, sex: 'Male' },
            { name: 'AST', unit: 'U/l', refLow: 0, refHigh: 31, sex: 'Female' },
            { name: 'Umumiy bilirubin', unit: 'µmol/l', refLow: 3.4, refHigh: 20.5 },
            { name: 'Umumiy xolesterin', unit: 'mmol/l', refLow: 0, refHigh: 5.2 },
        ],
    },
    {
        code: 'GORM', name: 'Qalqonsimon bez gormonlari', sampleType: 'Qon', price: 120000, turnaround: 24,
        params: [
            { name: 'TTG', unit: 'mkME/ml', refLow: 0.4, refHigh: 4.0 },
            { name: 'T4 erkin', unit: 'pmol/l', refLow: 9, refHigh: 22 },
            { name: 'T3 erkin', unit: 'pmol/l', refLow: 2.6, refHigh: 5.7 },
        ],
    },
    {
        code: 'KOAG', name: 'Koagulogramma', sampleType: 'Qon', price: 70000, turnaround: 8,
        params: [
            { name: 'PTI', unit: '%', refLow: 80, refHigh: 105 },
            { name: 'INR', refLow: 0.8, refHigh: 1.2 },
            { name: 'Fibrinogen', unit: 'g/l', refLow: 2, refHigh: 4 },
        ],
    },
    {
        code: 'QGR', name: 'Qon guruhi va Rh-faktor', sampleType: 'Qon', price: 30000, turnaround: 4,
        params: [
            { name: 'Qon guruhi', refText: 'I (0) / II (A) / III (B) / IV (AB)' },
            { name: 'Rh-faktor', refText: 'Musbat / Manfiy' },
        ],
    },
];

// ─── Diagnostika xizmatlari ──────────────────────────────────────────────────
const DIAGNOSTIC_SERVICES = [
    { name: 'Qorin bo\'shlig\'i UZI', price: 80000, duration: 20 },
    { name: 'Kichik tos a\'zolari UZI', price: 80000, duration: 20 },
    { name: 'Qalqonsimon bez UZI', price: 70000, duration: 15 },
    { name: 'Yurak UZI (EXOKG)', price: 150000, duration: 30 },
    { name: 'EKG', price: 40000, duration: 15 },
    { name: 'Ko\'krak qafasi rentgeni', price: 60000, duration: 15 },
];

const CLINICAL_SERVICES: Record<string, { name: string; price: number; duration: number }[]> = {
    TER:  [{ name: 'Terapevt konsultatsiyasi', price: 60000, duration: 30 }, { name: 'Takroriy qabul', price: 40000, duration: 20 }],
    KARD: [{ name: 'Kardiolog konsultatsiyasi', price: 90000, duration: 30 }],
    NEVR: [{ name: 'Nevrolog konsultatsiyasi', price: 80000, duration: 30 }],
    GIN:  [{ name: 'Ginekolog konsultatsiyasi', price: 80000, duration: 30 }],
    PED:  [{ name: 'Pediatr konsultatsiyasi', price: 60000, duration: 30 }],
    XIR:  [{ name: 'Xirurg konsultatsiyasi', price: 80000, duration: 30 }, { name: 'Bog\'lam qo\'yish', price: 35000, duration: 15 }],
    LOR:  [{ name: 'LOR konsultatsiyasi', price: 70000, duration: 30 }],
};

async function main() {
    console.log('🌱 XClinic — boshlang\'ich ma\'lumotlar\n');

    // ── Tarif (Clinic.planId majburiy FK) ───────────────────────────────────
    const plan = await prisma.subscriptionPlan.upsert({
        where: { id: 'local' },
        update: {},
        create: { id: 'local', name: 'Offline', price: 0, maxDoctors: 999, features: 'Offline litsenziya' },
    });

    // ── Klinika ─────────────────────────────────────────────────────────────
    let clinic = await prisma.clinic.findFirst();
    if (!clinic) {
        const today = new Date().toISOString().split('T')[0];
        const farFuture = new Date(Date.now() + 100 * 365 * 864e5).toISOString().split('T')[0];
        clinic = await prisma.clinic.create({
            data: {
                name: 'Klinika',
                adminName: 'Administrator',
                username: 'admin',
                password: await bcrypt.hash('admin', 10),
                phone: '+998 90 000 00 00',
                status: 'Active',
                planId: plan.id,
                subscriptionStartDate: today,
                expiryDate: farFuture,
                monthlyRevenue: 0,
                startHour: 8,
                endHour: 20,
            },
        });
        console.log('✅ Klinika yaratildi — login: admin / admin');
        console.log('   ⚠️  Sozlamalarda parolni ALBATTA o\'zgartiring\n');
    } else {
        console.log(`ℹ️  Mavjud klinika ishlatilmoqda: ${clinic.name}\n`);
    }

    const clinicId = clinic.id;

    // ── Bo'limlar ───────────────────────────────────────────────────────────
    const deptByCode: Record<string, string> = {};
    for (const d of DEPARTMENTS) {
        const dept = await prisma.department.upsert({
            where: { clinicId_code: { clinicId, code: d.code } },
            update: { name: d.name, type: d.type, color: d.color, sortOrder: d.sortOrder },
            create: { clinicId, ...d },
        });
        deptByCode[d.code] = dept.id;
    }
    console.log(`✅ Bo'limlar: ${DEPARTMENTS.length} ta`);

    // ── Qabul bayoni shablonlari ────────────────────────────────────────────
    let tplCount = 0;
    for (const [code, tpl] of Object.entries(TEMPLATES)) {
        const departmentId = deptByCode[code];
        if (!departmentId) continue;
        const exists = await prisma.encounterTemplate.findFirst({ where: { departmentId, name: tpl.name } });
        if (!exists) {
            await prisma.encounterTemplate.create({
                data: { clinicId, departmentId, name: tpl.name, fields: JSON.stringify(tpl.fields), isDefault: true },
            });
            tplCount++;
        }
    }
    console.log(`✅ Qabul shablonlari: ${tplCount} ta yangi`);

    // ── Xizmatlar ───────────────────────────────────────────────────────────
    let svcCount = 0;
    const ensureService = async (name: string, price: number, duration: number, departmentId: string, categoryId: string) => {
        const exists = await prisma.service.findFirst({ where: { clinicId, name } });
        if (exists) return;
        await prisma.service.create({ data: { clinicId, name, price, duration, departmentId, categoryId } });
        svcCount++;
    };

    for (const [code, services] of Object.entries(CLINICAL_SERVICES)) {
        const departmentId = deptByCode[code];
        if (!departmentId) continue;
        const dept = DEPARTMENTS.find(d => d.code === code)!;
        const cat = await prisma.serviceCategory.upsert({
            where: { clinicId_name: { clinicId, name: dept.name } },
            update: {},
            create: { clinicId, name: dept.name },
        });
        for (const svc of services) await ensureService(svc.name, svc.price, svc.duration, departmentId, cat.id);
    }

    const diagCat = await prisma.serviceCategory.upsert({
        where: { clinicId_name: { clinicId, name: 'Diagnostika' } },
        update: {},
        create: { clinicId, name: 'Diagnostika' },
    });
    for (const svc of DIAGNOSTIC_SERVICES) {
        await ensureService(svc.name, svc.price, svc.duration, deptByCode['DIAG'], diagCat.id);
    }
    console.log(`✅ Xizmatlar: ${svcCount} ta yangi`);

    // ── Tahlillar katalogi ──────────────────────────────────────────────────
    let testCount = 0, paramCount = 0;
    for (const t of LAB_TESTS) {
        const test = await prisma.labTest.upsert({
            where: { clinicId_code: { clinicId, code: t.code } },
            update: { name: t.name, sampleType: t.sampleType, price: t.price, turnaroundHours: t.turnaround },
            create: {
                clinicId, departmentId: deptByCode['LAB'], code: t.code, name: t.name,
                sampleType: t.sampleType, price: t.price, turnaroundHours: t.turnaround,
            },
        });
        testCount++;

        const existing = await prisma.labTestParameter.count({ where: { testId: test.id } });
        if (existing === 0) {
            for (let i = 0; i < t.params.length; i++) {
                const pm = t.params[i];
                await prisma.labTestParameter.create({
                    data: {
                        testId: test.id, name: pm.name, unit: pm.unit ?? null,
                        refLow: pm.refLow ?? null, refHigh: pm.refHigh ?? null,
                        refText: pm.refText ?? null, sex: pm.sex ?? null, sortOrder: i,
                    },
                });
                paramCount++;
            }
        }
    }
    console.log(`✅ Tahlillar: ${testCount} ta, ko'rsatkichlar: ${paramCount} ta yangi`);

    // ── Statsionar: namuna palatalar ────────────────────────────────────────
    const wardCount = await prisma.ward.count({ where: { clinicId } });
    if (wardCount === 0) {
        const wards = [
            { name: '1-palata', kind: 'Umumiy',      dailyRate: 150000, beds: 4 },
            { name: '2-palata', kind: 'Umumiy',      dailyRate: 150000, beds: 4 },
            { name: '3-palata', kind: 'Yarim lyuks', dailyRate: 300000, beds: 2 },
            { name: '4-palata', kind: 'Lyuks',       dailyRate: 500000, beds: 1 },
        ];
        for (const w of wards) {
            const ward = await prisma.ward.create({
                data: { clinicId, departmentId: deptByCode['STAC'], name: w.name, kind: w.kind, dailyRate: w.dailyRate, floor: '1' },
            });
            for (let i = 1; i <= w.beds; i++) {
                await prisma.bed.create({ data: { wardId: ward.id, label: `${i}-koyka` } });
            }
        }
        console.log(`✅ Statsionar: ${wards.length} palata, ${wards.reduce((s, w) => s + w.beds, 0)} koyka`);
    }

    console.log('\n🎉 Tayyor.');
}

main()
    .catch((e) => { console.error('❌ Seed xatoligi:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
