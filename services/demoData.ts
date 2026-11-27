import { Patient, Appointment, Transaction, Expense, Doctor, Receptionist, Service, Clinic, SubscriptionPlan, InventoryItem, InventoryLog, ServiceCategory, PatientDiagnosis, Lead, InstallmentPlan, LabTechnician, LabOrder, MessageTemplate, AutomationRule, MessageLog, TriggerDescriptor, SegmentFieldDescriptor } from '../types';

/* --- SANALAR NISBIY (demo har doim "tirik" ko'rinishi uchun) ---
 *
 * Bu yerda sanalar 2026-yanvarga QOTIRILGAN edi. Ma'lumot o'sha paytda
 * to'g'ri ko'rinardi, lekin demo linki oylar davomida ochiq turadi: klient
 * uni avgustda ochsa, kalendar bo'sh, «bugungi qabullar» nol, oylik tushum
 * nol bo'lib chiqadi. Ya'ni dastur buzuq emas — ma'lumot eskirgan; ammo
 * ko'rgan odam buni farqlamaydi.
 *
 * Shuning uchun har bir sana BUGUNDAN nisbiy hisoblanadi. Asos sifatida
 * eski to'plamning "bugun"i olingan (2026-01-28) va qolgan sanalar undan
 * qancha uzoq bo'lsa, o'shancha siljish bilan yoziladi — o'zaro nisbatlar
 * saqlanadi (kecha kelgan bemor baribir kecha kelgan bo'lib qoladi). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` — bugundan `offset` kun narida. */
const dayISO = (offset: number) =>
    new Date(Date.now() + offset * DAY_MS).toISOString().split('T')[0];

/** To'liq ISO vaqt tamg'asi — bugundan `offset` kun narida. */
const dayFull = (offset: number) =>
    new Date(Date.now() + offset * DAY_MS).toISOString();

// --- PERSISTENCE HELPERS ---
const STORAGE_KEY = 'xclinic_demo_data';

/* DEMO MA'LUMOTI VERSIYASI.

   Demo ma'lumoti brauzerda saqlanadi — bu ataylab: klient bemor qo'shsa,
   sahifani yangilaganda yo'qolmasligi kerak. Lekin shu sabab yangi demo
   chiqarilganda ESKI nusxa qolib ketardi: bir marta kirgan odam keyin
   qancha marta ochmasin, o'sha eskirgan besh yozuvni ko'raverardi.

   Shuning uchun saqlangan nusxaga versiya qo'yiladi. Raqam o'zgarsa eski
   nusxa e'tiborsiz qoldiriladi va ro'yxatlar yangisidan yig'iladi.

   ⚠️ Demo to'plamiga yozuv qo'shsangiz yoki o'zgartirsangiz — SHU RAQAMNI
   OSHIRING, aks holda o'zgarish avval demoni ochgan odamga yetib bormaydi. */
const DEMO_DATA_VERSION = 14;
const VERSION_KEY = 'xclinic_demo_version';

export const loadDemoData = () => {
    try {
        const storedVersion = Number(localStorage.getItem(VERSION_KEY) || 0);
        if (storedVersion !== DEMO_DATA_VERSION) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.setItem(VERSION_KEY, String(DEMO_DATA_VERSION));
            return null;
        }
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('❌ Failed to load demo data', e);
    }
    return null;
};

// Load initial data
const savedData = loadDemoData();

export const saveDemoData = () => {
    try {
        const data = {
            patients: DEMO_PATIENTS,
            appointments: DEMO_APPOINTMENTS,
            transactions: DEMO_TRANSACTIONS,
            services: DEMO_SERVICES,
            doctors: DEMO_DOCTORS,
            receptionists: DEMO_RECEPTIONISTS,
            clinic: DEMO_CLINIC,
            clinics: DEMO_CLINICS,
            diagnoses: DEMO_DIAGNOSES,
            inventory: DEMO_INVENTORY,
            logs: DEMO_INVENTORY_LOGS,
            categories: DEMO_CATEGORIES,
            leads: DEMO_LEADS,
            installments: DEMO_INSTALLMENTS,
            labTechnicians: DEMO_LAB_TECHNICIANS,
            labOrders: DEMO_LAB_ORDERS,
            expenses: DEMO_EXPENSES,
            messageTemplates: DEMO_MESSAGE_TEMPLATES,
            automationRules: DEMO_AUTOMATION_RULES,
            messageLogs: DEMO_MESSAGE_LOGS
        };
        const stringified = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, stringified);
        localStorage.setItem(VERSION_KEY, String(DEMO_DATA_VERSION));
    } catch (e) {
        console.error('❌ Failed to save demo data', e);
        if (e instanceof Error && e.name === 'QuotaExceededError') {
            console.error('Critial: LocalStorage Quota Exceeded!');
        }
    }
};

// Demo Clinic
export let DEMO_CLINIC: Clinic = savedData?.clinic || {
    id: 'demo-clinic-1',
    name: 'Demo Klinika',
    adminName: 'Demo Admin',
    username: 'demoklinikaadmin',
    phone: '+998 90 123 45 67',
    status: 'Active',
    planId: 'pro',
    subscriptionStartDate: new Date('2024-01-01').toISOString(),
    expiryDate: new Date('2030-12-31').toISOString(),
    monthlyRevenue: 0,
    subscriptionType: 'Paid',
    /* Demoda bot ULANGAN ko'rinadi (haqiqiy token yo'q — rollarga boradigan
       niqob bilan bir xil). Ilgari bo'sh edi: Xabarlarda «Telegram ⚠» chiqib
       turgan holda yonida «14 ta — bepul (Telegram)» yozilardi. */
    botToken: '********',
    startHour: 8,
    endHour: 20
};

export let DEMO_CLINICS: Clinic[] = savedData?.clinics || [DEMO_CLINIC];

export let DEMO_RECEPTIONISTS: Receptionist[] = savedData?.receptionists || [];


export let DEMO_DIAGNOSES: PatientDiagnosis[] = savedData?.diagnoses || [];

/* MKB-10 katalogi namoyish uchun. Haqiqiy bazada u 12 mingdan ortiq kod —
   uni demoga solib bo'lmaydi, lekin QIDIRUV ishlashi shart: namoyishda
   tashxis qo'yolmaslik eng ko'zga tashlanadigan nuqson edi.
   Ro'yxat ko'p profilli: kardiologiya, endokrinologiya, stomatologiya,
   terapiya, LOR. Kodlar va nomlar JSST MKB-10 tasnifidan. */
export const DEMO_ICD10: { code: string; name: string; nameRu?: string }[] = [
   // ── Kardiologiya (I00–I99)
   { code: 'I10', name: 'Essensial (birlamchi) gipertenziya', nameRu: 'Эссенциальная (первичная) гипертензия' },
   { code: 'I11.9', name: "Yurak zararlanishi ustun gipertoniya kasalligi, yurak yetishmovchiligisiz", nameRu: 'Гипертензивная болезнь с преимущественным поражением сердца без сердечной недостаточности' },
   { code: 'I20.8', name: 'Stenokardiyaning boshqa shakllari (zo\'riqish stenokardiyasi)', nameRu: 'Другие формы стенокардии' },
   { code: 'I20.0', name: 'Nostabil stenokardiya', nameRu: 'Нестабильная стенокардия' },
   { code: 'I21.9', name: "O'tkir miokard infarkti, aniqlanmagan", nameRu: 'Острый инфаркт миокарда неуточнённый' },
   { code: 'I25.1', name: 'Aterosklerotik yurak kasalligi', nameRu: 'Атеросклеротическая болезнь сердца' },
   { code: 'I25.2', name: "O'tkazilgan miokard infarkti", nameRu: 'Перенесённый в прошлом инфаркт миокарда' },
   { code: 'I25.9', name: 'Surunkali yurak ishemik kasalligi', nameRu: 'Хроническая ишемическая болезнь сердца' },
   { code: 'I34.0', name: 'Mitral qopqoq yetishmovchiligi', nameRu: 'Митральная (клапанная) недостаточность' },
   { code: 'I42.0', name: 'Dilatatsion kardiomiopatiya', nameRu: 'Дилатационная кардиомиопатия' },
   { code: 'I47.1', name: 'Supraventrikulyar taxikardiya', nameRu: 'Наджелудочковая тахикардия' },
   { code: 'I48.9', name: "Bo'lmachalar fibrillyatsiyasi va titrashi", nameRu: 'Фибрилляция и трепетание предсердий неуточнённые' },
   { code: 'I49.9', name: 'Yurak ritmi buzilishi, aniqlanmagan', nameRu: 'Нарушение сердечного ритма неуточнённое' },
   { code: 'I50.0', name: 'Dimlanishli yurak yetishmovchiligi', nameRu: 'Застойная сердечная недостаточность' },
   { code: 'I50.9', name: 'Yurak yetishmovchiligi, aniqlanmagan', nameRu: 'Сердечная недостаточность неуточнённая' },
   { code: 'I63.9', name: 'Miya infarkti (ishemik insult)', nameRu: 'Инфаркт мозга неуточнённый' },
   { code: 'I70.2', name: "Oyoq arteriyalari aterosklerozi", nameRu: 'Атеросклероз артерий конечностей' },
   { code: 'I83.9', name: "Oyoq venalarining varikoz kengayishi", nameRu: 'Варикозное расширение вен нижних конечностей' },
   { code: 'I95.9', name: 'Gipotenziya, aniqlanmagan', nameRu: 'Гипотензия неуточнённая' },
   { code: 'R00.0', name: 'Taxikardiya, aniqlanmagan', nameRu: 'Тахикардия неуточнённая' },
   { code: 'R07.4', name: "Ko'krak qafasidagi og'riq, aniqlanmagan", nameRu: 'Боль в груди неуточнённая' },
   // ── Endokrinologiya (E00–E90)
   { code: 'E01.0', name: "Yod tanqisligi bilan bog'liq diffuz bo'qoq", nameRu: 'Диффузный (эндемический) зоб, связанный с йодной недостаточностью' },
   { code: 'E04.1', name: "Toksik bo'lmagan bir tugunli bo'qoq", nameRu: 'Нетоксический одноузловой зоб' },
   { code: 'E04.2', name: "Toksik bo'lmagan ko'p tugunli bo'qoq", nameRu: 'Нетоксический многоузловой зоб' },
   { code: 'E05.0', name: "Diffuz toksik bo'qoq (Greyvs kasalligi)", nameRu: 'Тиреотоксикоз с диффузным зобом' },
   { code: 'E03.9', name: 'Gipotireoz', nameRu: 'Гипотиреоз' },
   { code: 'E06.3', name: 'Autoimmun tireoidit (Xashimoto)', nameRu: 'Аутоиммунный тиреоидит' },
   { code: 'E10.9', name: 'Qandli diabet, 1-tur, asoratsiz', nameRu: 'Сахарный диабет 1 типа без осложнений' },
   { code: 'E11.9', name: 'Qandli diabet, 2-tur', nameRu: 'Сахарный диабет 2 типа' },
   { code: 'E11.4', name: 'Qandli diabet, 2-tur, nevrologik asoratlar bilan (neyropatiya)', nameRu: 'Сахарный диабет 2 типа с неврологическими осложнениями' },
   { code: 'E11.5', name: "Qandli diabet, 2-tur, periferik qon aylanishi buzilishi bilan (diabetik oyoq)", nameRu: 'Сахарный диабет 2 типа с нарушениями периферического кровообращения' },
   { code: 'E11.3', name: "Qandli diabet, 2-tur, ko'z asoratlari bilan (retinopatiya)", nameRu: 'Сахарный диабет 2 типа с поражением глаз' },
   { code: 'E11.2', name: 'Qandli diabet, 2-tur, buyrak asoratlari bilan (nefropatiya)', nameRu: 'Сахарный диабет 2 типа с поражением почек' },
   { code: 'R73.0', name: 'Glyukozaga tolerantlikning buzilishi (prediabet)', nameRu: 'Отклонения результатов нормы теста на толерантность к глюкозе' },
   { code: 'E21.0', name: 'Birlamchi giperparatireoz', nameRu: 'Первичный гиперпаратиреоз' },
   { code: 'E27.1', name: 'Buyrak usti bezi birlamchi yetishmovchiligi', nameRu: 'Первичная недостаточность коры надпочечников' },
   { code: 'E28.2', name: 'Polikistoz tuxumdon sindromi', nameRu: 'Синдром поликистоза яичников' },
   { code: 'E55.9', name: 'D vitamini tanqisligi', nameRu: 'Недостаточность витамина D неуточнённая' },
   { code: 'E66.0', name: "Ortiqcha energiya bilan bog'liq semizlik", nameRu: 'Ожирение, обусловленное избыточным поступлением энергетических ресурсов' },
   { code: 'E66.9', name: 'Semizlik, aniqlanmagan', nameRu: 'Ожирение неуточнённое' },
   { code: 'E78.0', name: 'Sof giperxolesterinemiya', nameRu: 'Чистая гиперхолестеринемия' },
   { code: 'E78.5', name: 'Giperlipidemiya, aniqlanmagan', nameRu: 'Гиперлипидемия неуточнённая' },
   { code: 'J06.9', name: "Yuqori nafas yo'llarining o'tkir infeksiyasi", nameRu: 'Острая инфекция верхних дыхательных путей' },
   { code: 'J35.0', name: 'Surunkali tonzillit', nameRu: 'Хронический тонзиллит' },
   { code: 'J45.9', name: 'Bronxial astma', nameRu: 'Бронхиальная астма' },
   { code: 'K29.5', name: 'Surunkali gastrit', nameRu: 'Хронический гастрит' },
   { code: 'K21.0', name: 'Gastroezofageal reflyuks ezofagit bilan', nameRu: 'Гастроэзофагеальный рефлюкс с эзофагитом' },
   { code: 'N39.0', name: "Siydik yo'llari infeksiyasi", nameRu: 'Инфекция мочевыводящих путей' },
   { code: 'M54.5', name: "Bel og'rig'i", nameRu: 'Боль внизу спины' },
   { code: 'M17.9', name: 'Gonartroz', nameRu: 'Гонартроз' },
   { code: 'D50.9', name: 'Temir tanqisligi anemiyasi', nameRu: 'Железодефицитная анемия' },
   { code: 'G43.9', name: 'Migren', nameRu: 'Мигрень' },
   { code: 'H52.1', name: 'Miopiya', nameRu: 'Миопия' },
   { code: 'Z00.0', name: "Umumiy tibbiy ko'rik", nameRu: 'Общий медицинский осмотр' },
   { code: 'Z34.9', name: 'Normal homiladorlikni kuzatish', nameRu: 'Наблюдение за нормальной беременностью' },
   // ── Stomatologiya (K00–K14)
   { code: 'K00.6', name: 'Tish chiqishining buzilishi', nameRu: 'Нарушение прорезывания зубов' },
   { code: 'K01.1', name: 'Retinirlangan tishlar (aql tishi)', nameRu: 'Ретинированные зубы' },
   { code: 'K02.0', name: 'Emal kariyesi', nameRu: 'Кариес эмали' },
   { code: 'K02.1', name: 'Dentin kariyesi', nameRu: 'Кариес дентина' },
   { code: 'K02.2', name: 'Sement kariyesi', nameRu: 'Кариес цемента' },
   { code: 'K03.6', name: 'Tish toshlari (tish karashi)', nameRu: 'Отложения (наросты) на зубах' },
   { code: 'K04.0', name: 'Pulpit', nameRu: 'Пульпит' },
   { code: 'K04.5', name: 'Surunkali apikal periodontit', nameRu: 'Хронический апикальный периодонтит' },
   { code: 'K05.1', name: 'Surunkali gingivit', nameRu: 'Хронический гингивит' },
   { code: 'K05.3', name: 'Surunkali periodontit', nameRu: 'Хронический пародонтит' },
   { code: 'K07.2', name: "Tish qatorlari munosabatining anomaliyasi (prikus)", nameRu: 'Аномалии соотношения зубных дуг' },
   { code: 'K07.3', name: 'Tishlar joylashuvining anomaliyasi', nameRu: 'Аномалии положения зубов' },
   { code: 'K08.1', name: "Tishlarning yo'qolishi (adentiya)", nameRu: 'Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни' },
   { code: 'K12.0', name: 'Qaytalanuvchi og\'iz aftalari (stomatit)', nameRu: 'Рецидивирующие афты полости рта' },
];


// Demo Doctors
export let DEMO_DOCTORS: Doctor[] = savedData?.doctors || [
    {
        id: 'demo-doctor-1',
        firstName: 'Kamola',
        lastName: 'Ahmedova',
        specialty: 'Umumiy Stomatolog',
        phone: '+998 90 111 22 33',
        status: 'Active',
        clinicId: 'demo-clinic-1',
        percentage: 40,
        /* Bo'lim SHART: registraturadagi «Keldi» tugmasi qabulni shu
           bo'limga ochadi. Busiz «bo'lim aniqlanmadi» xatosi chiqadi. */
        departmentId: 'demo-ter',
        username: 'kamola',
        color: '#3B82F6', // Blue
    },
    {
        id: 'demo-doctor-2',
        firstName: 'Jamshid',
        lastName: 'Karimov',
        specialty: 'Ortodont',
        phone: '+998 90 444 55 66',
        status: 'Active',
        clinicId: 'demo-clinic-1',
        percentage: 50,
        departmentId: 'demo-ter',
        username: 'jamshid',
        color: '#10B981', // Emerald
    },
];

// Demo Categories
export let DEMO_CATEGORIES: ServiceCategory[] = savedData?.categories || [
    { id: 'cat-1', name: 'Konsultatsiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-2', name: 'Gigiena va Profilaktika', clinicId: 'demo-clinic-1' },
    { id: 'cat-3', name: 'Terapiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-4', name: 'Jarrohlik', clinicId: 'demo-clinic-1' },
    { id: 'cat-5', name: 'Ortodontiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-6', name: 'Protezlash', clinicId: 'demo-clinic-1' },
    { id: 'cat-7', name: 'Kardiologiya', clinicId: 'demo-clinic-1' },
    { id: 'cat-8', name: 'Endokrinologiya', clinicId: 'demo-clinic-1' },
];

// Demo Services
/* XIZMATLARDA `departmentId` BO'LISHI SHART.

   Registratura xizmatlarni bo'lim bo'yicha filtrlaydi. Bu maydon bu yerda
   to'ldirilmagani uchun demoda «Xizmat (qabul turi)» ro'yxati HAR DOIM
   bo'sh qolardi va qabul 0 so'm bilan ochilardi — ya'ni butun to'lov
   zanjiri birinchi qadamda uzilardi (audit XC-06).

   Bo'lim id lari `services/api.ts` dagi `DEMO_DEPARTMENTS` bilan bir xil.
   Diagnostika bo'limiga ham ikkita xizmat berilgan: aks holda u bo'lim
   tanlansa ro'yxat yana bo'sh bo'lardi. */
export let DEMO_SERVICES: Service[] = savedData?.services || [
    { id: 1, name: 'Konsultatsiya', price: 50000, categoryId: 'cat-1', duration: 30, clinicId: 'demo-clinic-1', departmentId: 'demo-ter' },
    { id: 2, name: 'Tish tozalash', price: 200000, categoryId: 'cat-2', duration: 45, clinicId: 'demo-clinic-1', departmentId: 'demo-ter' },
    { id: 3, name: 'Tish plombalash', price: 300000, categoryId: 'cat-3', duration: 60, clinicId: 'demo-clinic-1', departmentId: 'demo-ter' },
    { id: 4, name: 'Tish olib tashlash', price: 150000, categoryId: 'cat-4', duration: 30, clinicId: 'demo-clinic-1', departmentId: 'demo-ter' },
    { id: 5, name: 'Tish oqartirish', price: 800000, categoryId: 'cat-2', duration: 90, clinicId: 'demo-clinic-1', departmentId: 'demo-ter' },
    { id: 6, name: 'Metall-keramika toj', price: 1200000, categoryId: 'cat-6', duration: 120, clinicId: 'demo-clinic-1', departmentId: 'demo-ter' },
    { id: 7, name: 'Breket tizimi', price: 5000000, categoryId: 'cat-5', duration: 90, clinicId: 'demo-clinic-1', departmentId: 'demo-ter' },
    { id: 8, name: 'Panoramik rentgen (OPG)', price: 120000, categoryId: 'cat-1', duration: 15, clinicId: 'demo-clinic-1', departmentId: 'demo-diag' },
    { id: 9, name: '3D konus-nurli tomografiya', price: 350000, categoryId: 'cat-1', duration: 25, clinicId: 'demo-clinic-1', departmentId: 'demo-diag' },
    // Kardiologiya
    { id: 10, name: 'Kardiolog konsultatsiyasi', price: 150000, categoryId: 'cat-7', duration: 30, clinicId: 'demo-clinic-1', departmentId: 'demo-kard' },
    { id: 11, name: 'Kardiolog qayta ko\'rigi', price: 100000, categoryId: 'cat-7', duration: 20, clinicId: 'demo-clinic-1', departmentId: 'demo-kard' },
    { id: 12, name: 'Sutkalik qon bosimi monitoringi', price: 250000, categoryId: 'cat-7', duration: 20, clinicId: 'demo-clinic-1', departmentId: 'demo-kard' },
    { id: 13, name: 'Xolter monitoring (24 soat)', price: 350000, categoryId: 'cat-7', duration: 20, clinicId: 'demo-clinic-1', departmentId: 'demo-kard' },
    // Endokrinologiya
    { id: 14, name: 'Endokrinolog konsultatsiyasi', price: 150000, categoryId: 'cat-8', duration: 30, clinicId: 'demo-clinic-1', departmentId: 'demo-endo' },
    { id: 15, name: 'Endokrinolog qayta ko\'rigi', price: 100000, categoryId: 'cat-8', duration: 20, clinicId: 'demo-clinic-1', departmentId: 'demo-endo' },
    { id: 16, name: 'Glyukometriya (qand o\'lchash)', price: 20000, categoryId: 'cat-8', duration: 10, clinicId: 'demo-clinic-1', departmentId: 'demo-endo' },
    { id: 17, name: 'Diabet bo\'yicha maslahat (ovqatlanish rejasi)', price: 120000, categoryId: 'cat-8', duration: 40, clinicId: 'demo-clinic-1', departmentId: 'demo-endo' },
    // Diagnostika — yurak va qalqonsimon bez
    { id: 18, name: 'Elektrokardiogramma (EKG)', price: 80000, categoryId: 'cat-1', duration: 15, clinicId: 'demo-clinic-1', departmentId: 'demo-diag' },
    { id: 19, name: 'Exokardiografiya (yurak UZI)', price: 250000, categoryId: 'cat-1', duration: 30, clinicId: 'demo-clinic-1', departmentId: 'demo-diag' },
    { id: 20, name: 'Qalqonsimon bez UZI', price: 150000, categoryId: 'cat-1', duration: 20, clinicId: 'demo-clinic-1', departmentId: 'demo-diag' },
];

// Demo Patients
export let DEMO_PATIENTS: Patient[] = savedData?.patients || [
    {
        id: 'demo-patient-1',
        firstName: 'Aziza',
        lastName: 'Rahimova',
        phone: '+998 90 123 11 11',
        dob: '1990-05-15',
        address: 'Yunusobod tumani, 12-mavze',
        /* Gipertoniya «surunkali tashxis» sifatida (I10) turibdi — bu yerda
           yana yozilsa kartada ikki marta chiqardi. */
        medicalHistory: '',
        anamnesis: "{\"meds\":[\"Lizinopril 10 mg\",\"Aspirin 75 mg\"],\"surgeries\":[{\"name\":\"appendectomy\",\"year\":\"2015\"}],\"family\":[\"diabetes\",\"hypertension\"],\"smoking\":\"no\",\"alcohol\":\"no\",\"blood\":\"II\",\"rh\":\"+\",\"pregnancy\":\"no\"}",
        anamnesisUpdatedAt: dayFull(-2),
        anamnesisUpdatedBy: 'Dr. Nilufar Tosheva',
        clinicId: 'demo-clinic-1',
        lastVisit: dayISO(-1),
        status: 'Active',
        gender: 'Female',
        telegramChatId: '123456'
    },
    {
        id: 'demo-patient-2',
        firstName: 'Bobur',
        lastName: 'Aliyev',
        phone: '+998 91 234 22 22',
        dob: '1985-08-20',
        address: 'Chilonzor tumani, 5-kvartal',
        // Penitsillin allergiyasi allergiya ro'yxatida (services/api.ts, DEMO_ALLERGIES)
        medicalHistory: '',
        clinicId: 'demo-clinic-1',
        lastVisit: dayISO(-8),
        status: 'Active',
        gender: 'Male',
        telegramChatId: '123457'
    },
    {
        id: 'demo-patient-3',
        firstName: 'Dilnoza',
        lastName: 'Karimova',
        phone: '+998 93 345 33 33',
        dob: '1995-03-10',
        address: 'Mirzo Ulug\'bek tumani, Ziyolilar ko\'chasi',
        medicalHistory: '',
        clinicId: 'demo-clinic-1',
        lastVisit: dayISO(-3),
        status: 'Active',
        gender: 'Female'
    },
    {
        id: 'demo-patient-4',
        firstName: 'Eldor',
        lastName: 'Toshmatov',
        phone: '+998 94 456 44 44',
        dob: '1988-11-25',
        address: 'Yashnobod tumani, Abdulla Qodiriy ko\'chasi',
        medicalHistory: 'QANDLI DIABET(SHAKAR)-E 11.9',
        anamnesis: "{\"none\":{\"allergies\":true,\"surgeries\":true},\"meds\":[\"Metformin 1000 mg\",\"Insulin\"],\"family\":[\"diabetes\"],\"smoking\":\"quit\",\"alcohol\":\"no\"}",
        anamnesisUpdatedAt: dayFull(-14),
        anamnesisUpdatedBy: 'Registratura',
        clinicId: 'demo-clinic-1',
        lastVisit: dayISO(-13),
        status: 'Active',
        gender: 'Male'
    },
    {
        id: 'demo-patient-5',
        firstName: 'Feruza',
        lastName: 'Shodiyeva',
        phone: '+998 95 567 55 55',
        dob: '1992-07-08',
        address: 'Sergeli tumani, Yangi hayot',
        medicalHistory: '',
        clinicId: 'demo-clinic-1',
        lastVisit: 'Never',
        status: 'Active',
        gender: 'Female'
    },
];

// Demo Appointments
export let DEMO_APPOINTMENTS: Appointment[] = savedData?.appointments || [
    {
        id: 'demo-appt-1',
        patientId: 'demo-patient-1',
        patientName: 'Aziza Rahimova',
        doctorId: 'demo-doctor-3',
        doctorName: 'Dr. Nilufar Tosheva',
        type: 'Kardiolog konsultatsiyasi',
        date: dayISO(0),
        time: '10:00',
        duration: 30,
        status: 'Confirmed',
        notes: 'Qon bosimi nazorati',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-2',
        patientId: 'demo-patient-2',
        patientName: 'Bobur Aliyev',
        doctorId: 'demo-doctor-2',
        doctorName: 'Dr. Jamshid Karimov',
        type: 'Breket tizimi',
        date: dayISO(0),
        time: '14:00',
        duration: 90,
        status: 'Confirmed',
        notes: 'Breket nazorati',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-3',
        patientId: 'demo-patient-3',
        patientName: 'Dilnoza Karimova',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        type: 'Tish tozalash',
        date: dayISO(1),
        time: '11:00',
        duration: 45,
        status: 'Confirmed',
        notes: 'Tish tozalash',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-4',
        patientId: 'demo-patient-4',
        patientName: 'Eldor Toshmatov',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        type: 'Tish plombalash',
        date: dayISO(-1),
        time: '15:00',
        duration: 60,
        status: 'Completed',
        notes: 'Plombalash',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-appt-5',
        patientId: 'demo-patient-5',
        patientName: 'Feruza Shodiyeva',
        doctorId: 'demo-doctor-2',
        doctorName: 'Dr. Jamshid Karimov',
        type: 'Konsultatsiya',
        date: dayISO(2),
        time: '09:00',
        duration: 30,
        status: 'Confirmed',
        notes: 'Konsultatsiya',
        clinicId: 'demo-clinic-1',
    },
];

// Demo Transactions
export let DEMO_TRANSACTIONS: Transaction[] = savedData?.transactions || [
    {
        id: 'demo-tx-1',
        patientId: 'demo-patient-1',
        patientName: 'Aziza Rahimova',
        date: dayFull(-1),
        // Aziza — kardiologiya bemori: to'lovi ham o'sha bo'limdan
        amount: 150000,
        type: 'Cash',
        service: 'Kardiolog konsultatsiyasi',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-3',
        doctorName: 'Dr. Nilufar Tosheva',
        discountPercent: 0,
        discountAmount: 0
    },
    {
        id: 'demo-tx-2',
        patientId: 'demo-patient-2',
        patientName: 'Bobur Aliyev',
        date: dayFull(-8),
        amount: 1500000,
        type: 'Card',
        service: 'Breket tizimi',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-2',
        doctorName: 'Dr. Jamshid Karimov',
        discountPercent: 0,
        discountAmount: 0
    },
    {
        id: 'demo-tx-3',
        patientId: 'demo-patient-3',
        patientName: 'Dilnoza Karimova',
        date: dayFull(-3),
        // Dilnoza va Eldor — endokrinologiya bemorlari
        amount: 150000,
        type: 'Cash',
        service: 'Endokrinolog konsultatsiyasi',
        status: 'Pending',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-5',
        doctorName: 'Dr. Shahnoza Rahmonova',
        discountPercent: 0,
        discountAmount: 0
    },
    {
        id: 'demo-tx-4',
        patientId: 'demo-patient-4',
        patientName: 'Eldor Toshmatov',
        date: dayFull(-13),
        amount: 150000,
        type: 'Cash',
        service: 'Endokrinolog konsultatsiyasi',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-5',
        doctorName: 'Dr. Shahnoza Rahmonova',
        discountPercent: 0,
        discountAmount: 0
    },
];

// Demo Expenses (Xarajatlar)
export let DEMO_EXPENSES: Expense[] = savedData?.expenses || [
    {
        id: 'demo-exp-1',
        date: dayISO(-23),
        amount: 2000000,
        category: 'Rent',
        title: 'Ijara (yanvar)',
        method: 'Transfer',
        clinicId: 'demo-clinic-1',
    },
    {
        id: 'demo-exp-2',
        date: dayISO(-18),
        amount: 350000,
        category: 'Utilities',
        title: 'Kommunal to\'lovlar',
        method: 'Card',
        clinicId: 'demo-clinic-1',
    },
    {
        /* Bugungi xarajat — kichik va oddiy. Ilgari bu 150 000 lik
           «Shifokor ulushi» edi: bugungi tushum 50 000 bo'lgani uchun demo
           kassada «Yashikda naqd: −100 000» chiqib turardi. */
        id: 'demo-exp-3',
        date: dayISO(0),
        amount: 30000,
        category: 'Other',
        title: 'Suv va choy',
        method: 'Cash',
        clinicId: 'demo-clinic-1',
    },
];

// Demo Xabarlar (Messages)
export let DEMO_MESSAGE_TEMPLATES: MessageTemplate[] = savedData?.messageTemplates || [
    {
        id: 'demo-tpl-1',
        clinicId: 'demo-clinic-1',
        name: 'Qabul eslatmasi',
        text: "Hurmatli {bemor_ismi}, qabulingiz {sana} kuni {vaqt} da. {klinika_nomi}",
        createdAt: dayFull(-18),
    },
];

export let DEMO_AUTOMATION_RULES: AutomationRule[] = savedData?.automationRules || [
    {
        id: 'demo-rule-1',
        clinicId: 'demo-clinic-1',
        name: 'Qabuldan 2 soat oldin eslatma',
        templateId: 'demo-tpl-1',
        trigger: 'before_appointment',
        hoursBefore: 2,
        channel: 'telegram',
        doctorId: null,
        active: true,
        createdAt: dayFull(-18),
    },
];

// Demo rejim uchun trigger tavsiflari — backend/triggers.ts bilan mos
export const DEMO_TRIGGERS: TriggerDescriptor[] = [
    { id: 'before_appointment', label: 'Qabuldan oldin', supportsDoctorFilter: true, offset: { label: 'Necha soat oldin', unit: 'hour', options: [1, 2, 3, 6, 12, 24], default: 2 } },
    { id: 'appointment_booked', label: 'Qabulga yozilganda', supportsDoctorFilter: true, sendWindow: { fromHour: 8, toHour: 22 } },
    { id: 'birthday', label: "Tug'ilgan kun", supportsDoctorFilter: true },
    { id: 'no_show', label: 'Kelmagan bemor', supportsDoctorFilter: true },
    { id: 'after_appointment', label: 'Qabuldan keyin', supportsDoctorFilter: true, offset: { label: 'Necha soat keyin', unit: 'hour', options: [2, 4, 24, 48, 72], default: 24 } },
    { id: 'new_patient', label: "Yangi bemor ro'yxatdan o'tdi", supportsDoctorFilter: true, offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 1 } },
    { id: 'payment_received', label: "To'lov qabul qilindi", supportsDoctorFilter: false, offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 0 } },
    { id: 'recall', label: 'Uzoq kelmaganlarni qaytarish', supportsDoctorFilter: true, offset: { label: 'Necha oydan beri kelmagan', unit: 'month', options: [3, 6, 9, 12], default: 6 } },
    { id: 'debt_reminder', label: 'Qarz eslatmasi', supportsDoctorFilter: false, offset: { label: 'Qarz necha kundan beri', unit: 'day', options: [3, 7, 14, 30], default: 7 } },
    { id: 'follow_up', label: "Qayta ko'rik", supportsDoctorFilter: true, offset: { label: 'Necha kun oldin', unit: 'day', options: [0, 1, 2, 3], default: 1 } },
];

// Demo rejim uchun segment maydonlari — backend/segmentFields.ts qisqartmasi
export const DEMO_SEGMENT_FIELDS: SegmentFieldDescriptor[] = [
    {
        id: 'status', label: 'Bemor holati', type: 'enum', group: "Bemor ma'lumotlari",
        operators: [{ id: 'eq', label: 'teng', arity: 1 }, { id: 'neq', label: 'teng emas', arity: 1 }],
        options: [{ value: 'Active', label: 'Faol' }, { value: 'Archived', label: 'Arxivlangan' }],
        defaultOp: 'eq', defaultValue: 'Active',
    },
    {
        id: 'gender', label: 'Jinsi', type: 'enum', group: "Bemor ma'lumotlari",
        operators: [{ id: 'eq', label: 'teng', arity: 1 }, { id: 'neq', label: 'teng emas', arity: 1 }],
        options: [{ value: 'Female', label: 'Ayol' }, { value: 'Male', label: 'Erkak' }],
        defaultOp: 'eq', defaultValue: 'Female',
    },
    {
        id: 'age', label: 'Yoshi', type: 'number', group: "Bemor ma'lumotlari",
        operators: [{ id: 'gte', label: 'kamida', arity: 1 }, { id: 'lte', label: "ko'pi bilan", arity: 1 }, { id: 'between', label: "oralig'ida", arity: 2 }],
        unit: 'yosh', defaultOp: 'between', defaultValue: [18, 45],
    },
    {
        id: 'hasDebt', label: 'Qarzi bor', type: 'bool', group: 'Moliya',
        operators: [{ id: 'is_true', label: 'ha', arity: 0 }, { id: 'is_false', label: "yo'q", arity: 0 }],
        defaultOp: 'is_true',
    },
    {
        id: 'hasTelegram', label: 'Telegram botga ulangan', type: 'bool', group: 'Aloqa',
        operators: [{ id: 'is_true', label: 'ha', arity: 0 }, { id: 'is_false', label: "yo'q", arity: 0 }],
        defaultOp: 'is_true',
    },
];

export let DEMO_MESSAGE_LOGS: MessageLog[] = savedData?.messageLogs || [
    {
        id: 'demo-log-msg-1',
        clinicId: 'demo-clinic-1',
        patientId: 'demo-patient-1',
        type: 'Manual',
        status: 'Sent',
        message: 'Hurmatli Aziza, qabulingiz eslatmasi.',
        sentAt: dayFull(-1),
        channel: 'telegram',
        source: 'manual',
        recipient: '123456789',
        patient: { id: 'demo-patient-1', firstName: 'Aziza', lastName: 'Rahimova', phone: '+998901234567' },
    },
];

// Demo Subscription Plan
export const DEMO_PLAN: SubscriptionPlan = {
    id: 'pro',
    name: 'Pro',
    price: 0,
    features: ['Cheklanmagan shifokorlar', 'Cheklanmagan bemorlar', 'Ombor', 'Telegram Bot'],
    maxDoctors: 999,
};

// Demo credentials
export const DEMO_CREDENTIALS = {
    username: 'demoklinikaadmin',
    password: 'demoklinikaparol',
};

// Demo Inventory Items
export let DEMO_INVENTORY: InventoryItem[] = savedData?.inventory || [
    {
        id: 'demo-item-1',
        name: 'Lidokain',
        unit: 'ampula',
        quantity: 50,
        minQuantity: 10,
        clinicId: 'demo-clinic-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'demo-item-2',
        name: 'Paxta',
        unit: 'kg',
        quantity: 5,
        minQuantity: 2,
        clinicId: 'demo-clinic-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: 'demo-item-3',
        name: 'Shprits 2ml',
        unit: 'dona',
        quantity: 100,
        minQuantity: 20,
        clinicId: 'demo-clinic-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

// Demo Inventory Logs
export let DEMO_INVENTORY_LOGS: InventoryLog[] = savedData?.logs || [
    {
        id: 'demo-log-1',
        itemId: 'demo-item-1',
        change: 50,
        type: 'IN',
        note: 'Boshlang\'ich qoldiq',
        date: dayFull(-27),
        userName: 'Demo Admin',
    },
    {
        id: 'demo-log-2',
        itemId: 'demo-item-2',
        change: 5,
        type: 'IN',
        note: 'Xarid',
        date: dayFull(-23),
        userName: 'Demo Admin',
    }
];

// Demo Leads
export let DEMO_LEADS: Lead[] = savedData?.leads || [
    {
        id: 'demo-lead-1',
        name: 'Shahnoza Yusupova',
        phone: '+998 90 123 45 67',
        service: 'Implantatsiya',
        /* Manba REKLAMA KANALI, integratsiya emas: lid qo'lda kiritiladi.
           Facebook integratsiyasining o'zi olib tashlangan. */
        source: 'Instagram',
        notes: "Reklamani ko'rib qo'ng'iroq qildi, narx so'radi",
        status: 'New',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        clinicId: 'demo-clinic-1'
    }
];

// Demo Installments
export let DEMO_INSTALLMENTS: InstallmentPlan[] = savedData?.installments || [
    {
        id: 'demo-ins-1',
        patientId: 'demo-patient-1',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
        service: 'Breket tizimi',
        totalAmount: 5000000,
        totalPaid: 2000000,
        /* Bo'lib to'lash rejasi ham bugundan hisoblanadi. To'langan ikkita
           ulush O'TMISHDA, kutilayotgan uchtasi KELAJAKDA turishi shart —
           aks holda «to'langan, lekin muddati hali kelmagan» degan mantiqsiz
           qator chiqadi va reja buzuq ko'rinadi. */
        startDate: dayISO(-90),
        endDate: dayISO(60),
        status: 'Active',
        createdAt: new Date().toISOString(),
        items: [
            { id: 'item-1', planId: 'demo-ins-1', expectedDate: dayISO(-60), amount: 600000, status: 'Paid', paidDate: dayISO(-60) },
            { id: 'item-2', planId: 'demo-ins-1', expectedDate: dayISO(-30), amount: 600000, status: 'Paid', paidDate: dayISO(-29) },
            { id: 'item-3', planId: 'demo-ins-1', expectedDate: dayISO(0), amount: 600000, status: 'Pending' },
            { id: 'item-4', planId: 'demo-ins-1', expectedDate: dayISO(30), amount: 600000, status: 'Pending' },
            { id: 'item-5', planId: 'demo-ins-1', expectedDate: dayISO(60), amount: 600000, status: 'Pending' },
        ]
    }
];

// Demo Lab Technicians
export let DEMO_LAB_TECHNICIANS: LabTechnician[] = savedData?.labTechnicians || [
    {
        id: 'demo-tech-1',
        firstName: 'Farhod',
        lastName: 'Karimov',
        specialty: 'Metallkeramika',
        phone: '+998 90 999 88 77',
        status: 'Active',
        clinicId: 'demo-clinic-1'
    },
    {
        id: 'demo-tech-2',
        firstName: 'Zuhra',
        lastName: 'Nazarova',
        specialty: 'Veneer / E-max',
        phone: '+998 93 777 66 55',
        status: 'Active',
        clinicId: 'demo-clinic-1'
    }
];

// Demo Lab Orders
export let DEMO_LAB_ORDERS: LabOrder[] = savedData?.labOrders || [
    {
        id: 'demo-order-1',
        patientName: 'Aziza Rahimova',
        doctorName: 'Dr. Kamola Ahmedova',
        technicianId: 'demo-tech-1',
        technicianName: 'Karimov Farhod',
        clinicId: 'demo-clinic-1',
        orderType: 'Koronka',
        material: 'Metallkeramika',
        toothNumbers: '14, 15',
        notes: 'Rang A2 bo\'lsin',
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        price: 500000,
        /* `totalPrice` — ekran AYNAN shu maydonni chizadi (LabOrders.tsx:295).
           Faqat `price` berilgani uchun bu yo'llanma «0 so'm» bo'lib
           ko'rinardi va kassaga tushmasdi (audit XC-29). */
        totalPrice: 500000,
        priority: 'Normal',
        clinicianNotes: 'Tishlarni biroz yupqaroq qilish kerak',
        status: 'In-Progress',
        orderedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 'demo-order-2',
        patientName: 'Bobur Aliyev',
        doctorName: 'Dr. Jamshid Karimov',
        technicianId: 'demo-tech-2',
        technicianName: 'Nazarova Zuhra',
        clinicId: 'demo-clinic-1',
        orderType: 'Veneer',
        material: 'E-max (Litiy disilkat)',
        toothNumbers: '11, 12, 21, 22',
        notes: 'Bleach 2 rang, ultra tabiiy shakl',
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        price: 2400000,
        totalPrice: 2400000,
        priority: 'Urgent',
        clinicianNotes: 'Bemor juda talabchan, iltimos sifatiga e\'tibor bering',
        status: 'Pending',
        orderedAt: new Date().toISOString(),
    }
];

/* ─────────────────────────────────────────────────────────────────────────────
   RO'YXATLAR TO'LDIRILADI

   Yuqoridagi qo'lda yozilgan yozuvlar mantiqni ko'rsatish uchun yetarli edi,
   lekin NAMOYISH uchun emas: klient «Mening navbatim» ni ochib «Navbat bo'sh»
   ni ko'rsa, dastur ishlamayotgandek taassurot qoladi. Bo'sh ekran hech narsa
   sotmaydi.

   Shuning uchun har bir ro'yxat 5-15 yozuvgacha to'ldiriladi. Qo'lda yozilgan
   dastlabki yozuvlar O'ZGARMAYDI — ularga statsionar, bo'lib to'lash va
   laboratoriya yozuvlari id bo'yicha bog'langan. Qo'shimchalari shu yerda,
   generatsiya bilan qo'shiladi.

   `savedData` bo'lsa hech narsa qo'shilmaydi: klient demoda o'zi bemor
   qo'shgan bo'lsa, keyingi ochilishda ro'yxat qayta to'lib ketmasligi kerak. */

const UZ_NAMES: [string, string, 'Male' | 'Female'][] = [
    ['Nodira', 'Saidova', 'Female'],
    ['Rustam', 'Xolmatov', 'Male'],
    ['Malika', 'Yusupova', 'Female'],
    ['Sherzod', 'Ergashev', 'Male'],
    ['Gulnora', 'Abdullayeva', 'Female'],
    ['Otabek', 'Nazarov', 'Male'],
    ['Zilola', 'Mirzayeva', 'Female'],
    ['Doniyor', 'Qodirov', 'Male'],
    ['Sabina', 'Rustamova', 'Female'],
];

if (!savedData?.patients) {
    UZ_NAMES.forEach(([first, last, gender], i) => {
        const n = i + 6;                 // 1..5 qo'lda yozilgan
        DEMO_PATIENTS.push({
            id: `demo-patient-${n}`,
            firstName: first,
            lastName: last,
            phone: `+998 9${(i % 5) + 1} ${300 + n} ${10 + n} ${20 + n}`,
            dob: `19${70 + ((i * 7) % 30)}-0${(i % 9) + 1}-1${i % 9}`,
            address: ['Yunusobod', 'Chilonzor', 'Mirobod', 'Yakkasaroy', 'Sergeli'][i % 5] + ' tumani',
            medicalHistory: i % 3 === 0 ? 'SURUNKALI GASTRIT (K29.5)' : '',
            clinicId: 'demo-clinic-1',
            lastVisit: dayISO(-(i + 2)),
            status: 'Active',
            gender,
            /* BIRIKTIRILGAN SHIFOKOR. Bu maydon to'ldirilmagani uchun
               Bemorlar sahifasida 14 tasining 14 tasi ham
               «Biriktirilmagan» bo'lib turardi — registratura va
               kalendarda esa har birida aniq shifokor ko'rinardi
               (audit XC-26). To'rt shifokor bo'yicha aylantiriladi. */
            doctorId: `demo-doctor-${(i % 4) + 1}`,
            // Har uchinchisi botga ulanmagan — Xabarlarda «Telegram bepul / SMS pullik» farqi ko'rinsin
            telegramChatId: i % 3 === 2 ? undefined : String(5550000 + n),
        } as Patient);
    });
}

/* BEMORLAR HISOBOTI UCHUN (2026-11-26). Ilgari hamma bemor oxirgi ikki
   haftada kelgan, `createdAt` yo'q edi: Hisobot → Bemorlar da «yo'qolgan» 0,
   «yangi» ham deyarli 0 bo'lardi. Endi:
     • 6 ta YANGI — shu oy ro'yxatdan o'tgan, yarmi ikkinchi marta kelgan;
     • 10 ta YO'QOLGAN — 7–14 oydan beri kelmagan (Xabarlardagi
       «6 oydan beri kelmagan» segmenti ham aynan ularni topadi);
     • 2 ta QAYTGAN — uzoq tanaffusdan keyin shu oy kelgan.
   To'lov qatorlari pastda (`DEMO_ARCHIVE_VISITS`). */
const NEW_NAMES: [string, string, 'Male' | 'Female'][] = [
    ['Ozoda', 'Mirzayeva', 'Female'], ['Sherzod', 'Toshmatov', 'Male'], ['Madina', 'Ergasheva', 'Female'],
    ['Akmal', 'Yo\'ldoshev', 'Male'], ['Zarina', 'Karimova', 'Female'], ['Bobur', 'Hasanov', 'Male'],
];
const LOST_NAMES: [string, string, 'Male' | 'Female'][] = [
    ['Feruza', 'Nazarova', 'Female'], ['Ulug\'bek', 'Sobirov', 'Male'], ['Gavhar', 'Islomova', 'Female'],
    ['Jahongir', 'Rahimov', 'Male'], ['Dilfuza', 'Azimova', 'Female'], ['Sardor', 'Qosimov', 'Male'],
    ['Nargiza', 'Valiyeva', 'Female'], ['Otabek', 'Jo\'rayev', 'Male'], ['Lola', 'Umarova', 'Female'],
    ['Rustam', 'Murodov', 'Male'],
];
const BACK_NAMES: [string, string, 'Male' | 'Female'][] = [
    ['Shahlo', 'Abdurahmonova', 'Female'], ['Anvar', 'Saidov', 'Male'],
];
/** [bemor id, kun oldin] — har biri bitta to'lov qatori («qabul») bo'ladi */
const DEMO_ARCHIVE_VISITS: [string, number][] = [];

if (!savedData?.patients) {
    const mk = (n: number, [first, last, gender]: [string, string, 'Male' | 'Female'], createdAgo: number, lastAgo: number, i: number) => {
        DEMO_PATIENTS.push({
            id: `demo-patient-${n}`,
            firstName: first, lastName: last, gender,
            phone: `+998 9${(n % 5) + 1} ${400 + n} ${30 + (n % 60)} ${40 + (n % 50)}`,
            dob: `19${65 + ((n * 7) % 35)}-0${(n % 9) + 1}-2${n % 9}`,
            address: ['Yunusobod', 'Chilonzor', 'Mirobod', 'Yakkasaroy', 'Sergeli'][n % 5] + ' tumani',
            medicalHistory: '',
            clinicId: 'demo-clinic-1',
            lastVisit: dayISO(-lastAgo),
            status: 'Active',
            doctorId: `demo-doctor-${(i % 4) + 1}`,
            telegramChatId: n % 3 === 0 ? undefined : String(5560000 + n),
            createdAt: dayFull(-createdAgo),
        } as Patient);
    };
    NEW_NAMES.forEach((nm, k) => {
        const n = 15 + k, first = 2 + k * 3;            // 2 … 17 kun oldin
        const second = k % 2 === 0 ? Math.max(0, first - 6) : null;
        mk(n, nm, first, second ?? first, k);
        DEMO_ARCHIVE_VISITS.push([`demo-patient-${n}`, first]);
        if (second !== null) DEMO_ARCHIVE_VISITS.push([`demo-patient-${n}`, second]);
    });
    LOST_NAMES.forEach((nm, k) => {
        const n = 21 + k, last = 200 + k * 23;          // 200 … 407 kun oldin
        mk(n, nm, last + 180 + k * 15, last, k);
        DEMO_ARCHIVE_VISITS.push([`demo-patient-${n}`, last + 60], [`demo-patient-${n}`, last]);
    });
    BACK_NAMES.forEach((nm, k) => {
        const n = 31 + k;
        mk(n, nm, 420 + k * 30, 5 + k * 4, k + 1);
        DEMO_ARCHIVE_VISITS.push([`demo-patient-${n}`, 260 + k * 20], [`demo-patient-${n}`, 5 + k * 4]);
    });
}

/* Ro'yxatdan o'tgan sana — eski bemorlarda (1–14) yo'q edi. Ularning
   to'lovlari 57 kungacha orqaga ketadi, shuning uchun karta undan eski. */
DEMO_PATIENTS.forEach((p, i) => {
    if (!(p as any).createdAt) (p as any).createdAt = dayFull(-(90 + i * 41));
});

/* Qo'lda yozilgan birinchi besh bemorda ham shifokor bo'lsin — ular
   yuqorida alohida e'lon qilingan va generatorga tushmaydi. */
DEMO_PATIENTS.forEach((p, i) => {
    if (!p.doctorId) p.doctorId = `demo-doctor-${(i % 4) + 1}`;
});

/* Kardiolog va endokrinolog bemorlari — bugungi navbatdagi bo'lim bilan
   bir xil shifokorga biriktiriladi (`DEMO_VISIT_PLAN`, services/api.ts). */
const SPECIALIST: Record<string, string> = {
    'demo-patient-1': 'demo-doctor-3', 'demo-patient-5': 'demo-doctor-3', 'demo-patient-9': 'demo-doctor-3',
    'demo-patient-3': 'demo-doctor-5', 'demo-patient-4': 'demo-doctor-5', 'demo-patient-11': 'demo-doctor-5',
};
if (!savedData?.patients) {
    DEMO_PATIENTS.forEach(p => { if (SPECIALIST[p.id]) p.doctorId = SPECIALIST[p.id]; });
}

if (!savedData?.doctors) {
    DEMO_DOCTORS.push(
        {
            id: 'demo-doctor-3', firstName: 'Nilufar', lastName: 'Tosheva',
            specialty: 'Kardiolog', phone: '+998 90 777 88 99', status: 'Active',
            clinicId: 'demo-clinic-1', percentage: 35, departmentId: 'demo-kard', username: 'nilufar_t', color: '#EF4444',
        } as Doctor,
        {
            id: 'demo-doctor-4', firstName: 'Sardor', lastName: 'Mahmudov',
            specialty: 'Jarroh', phone: '+998 91 555 44 33', status: 'Active',
            clinicId: 'demo-clinic-1', percentage: 45, departmentId: 'demo-inp', username: 'sardor_m', color: '#8B5CF6',
        } as Doctor,
        {
            id: 'demo-doctor-5', firstName: 'Shahnoza', lastName: 'Rahmonova',
            specialty: 'Endokrinolog', phone: '+998 93 222 77 11', status: 'Active',
            clinicId: 'demo-clinic-1', percentage: 35, departmentId: 'demo-endo', username: 'shahnoza_r', color: '#F59E0B',
        } as Doctor,
    );
}

/** Bemor va shifokorni id bo'yicha topish — generatsiyada nom yozish uchun. */
const pName = (id: string) => {
    const p = DEMO_PATIENTS.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : '';
};
const dName = (id: string) => {
    const d = DEMO_DOCTORS.find(x => x.id === id);
    return d ? `Dr. ${d.firstName} ${d.lastName}` : '';
};

const SERVICE_NAMES = ['Konsultatsiya', 'Tish tozalash', 'Tish plombalash',
    'Tish olib tashlash', 'Tish oqartirish', 'Metall-keramika toj'];
const SERVICE_PRICES = [50000, 200000, 300000, 150000, 800000, 1200000];

if (!savedData?.appointments) {
    /* Qabullar bugundan -3 dan +4 kungacha tarqatiladi: kalendar ham,
       «bugungi qabullar» ham bo'sh qolmasin. */
    const offsets = [0, 0, 0, 0, 1, 1, 2, 3, 4, -1, -2, -3];
    offsets.forEach((off, i) => {
        const patientId = `demo-patient-${(i % 9) + 6}`;
        const doctorId = `demo-doctor-${(i % 4) + 1}`;
        DEMO_APPOINTMENTS.push({
            id: `demo-appt-g${i + 1}`,
            patientId,
            patientName: pName(patientId),
            doctorId,
            doctorName: dName(doctorId),
            type: SERVICE_NAMES[i % SERVICE_NAMES.length],
            date: dayISO(off),
            time: `${String(9 + (i % 8)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
            duration: [30, 45, 60][i % 3],
            status: off < 0 ? 'Completed' : (i % 3 === 0 ? 'Confirmed' : 'Pending'),
            notes: '',
            departmentId: 'demo-ter',
            clinicId: 'demo-clinic-1',
        } as Appointment);
    });
}

if (!savedData?.transactions) {
    /* To'lovlar oxirgi 25 kunga tarqatiladi — hisobot va ulush raqamlari
       jonli chiqishi uchun. Uchdan biri qarzda qoladi. */
    /* Xizmat bemorning O'Z bo'limidan: kardiologiya bemoriga «Tish
       plombalash» yozilib qolmasin. Mutaxassis bemori — o'z shifokori,
       qolganlar — stomatologlar (1, 2, 4). */
    /* Faqat stomatologlar: Sardor Mahmudov (4) — statsionar shifokori, unga
       «Tish plombalash» yozilsa Hisobot → Xizmatlar da «plomba — Statsionar»
       chiqardi (2026-11-26) */
    const DENTAL_DOCTORS = ['demo-doctor-1', 'demo-doctor-2'];
    for (let i = 0; i < 12; i++) {
        const patientId = `demo-patient-${(i % 9) + 6}`;
        const doctorId = SPECIALIST[patientId] || DENTAL_DOCTORS[i % DENTAL_DOCTORS.length];
        const dept = DEMO_DOCTORS.find(d => d.id === doctorId)?.departmentId;
        const pool = SPECIALIST[patientId]
            ? DEMO_SERVICES.filter(s => s.departmentId === dept)
            : [];
        const svcIdx = i % SERVICE_NAMES.length;
        const svc = pool.length
            ? { name: pool[i % pool.length].name, price: pool[i % pool.length].price }
            : { name: SERVICE_NAMES[svcIdx], price: SERVICE_PRICES[svcIdx] };
        /* Har to'rtinchisiga 10% chegirma — Hisobot → Xizmatlar dagi
           «Chegirma» ustuni demoda bo'sh turmasin (2026-11-26) */
        const disc = i % 4 === 1 ? Math.round(svc.price * 0.1) : 0;
        DEMO_TRANSACTIONS.push({
            id: `demo-tx-g${i + 1}`,
            patientId,
            patientName: pName(patientId),
            date: dayFull(-(i * 2)),
            amount: svc.price - disc,
            type: (['Cash', 'Card', 'Click'] as const)[i % 3],
            service: svc.name,
            status: i % 3 === 2 ? 'Pending' : 'Paid',
            clinicId: 'demo-clinic-1',
            doctorId,
            doctorName: dName(doctorId),
            discountPercent: disc ? 10 : 0,
            discountAmount: disc,
            /* PUL QABUL QILINGAN ANIQ VAQT. Busiz kassa jadvalidagi VAQT
               ustunida `—` turardi: kun yopilganda tafovut chiqsa, uni
               kimga va qachonga bog'lash imkoni yo'q edi — kassa
               auditining asosiy talabi buzilardi (audit XC-15). */
            createdAt: dayFull(-(i * 2)),
            receivedByName: 'Registratura',
        } as Transaction);
    }
}

if (!savedData?.transactions) {
    /* ARXIV: toq kunlar va O'TGAN OY (2026-11-26, Hisobot dizayni).
       Ilgari hamma pul oxirgi 25 kunda edi: Hisobotda har raqam yonida
       «+6 450 000 (yangi)» turardi (solishtiradigan oy bo'sh), qarzdorlar
       hammasi «Bugun», kunma-kun grafik esa har ikki kunda bitta nuqta.
       Eski qarzlar (har beshinchisi) — qarz yoshi chizig'i ham jonli. */
    const DENTAL = ['demo-doctor-1', 'demo-doctor-2'];
    const offsets = [
        ...Array.from({ length: 12 }, (_, k) => 2 * k + 1),   // 1, 3 … 23 — joriy oy zichligi
        ...Array.from({ length: 16 }, (_, k) => 27 + 2 * k),  // 27 … 57 — o'tgan oy
    ];
    offsets.forEach((off, k) => {
        const patientId = `demo-patient-${((k + 4) % 9) + 6}`;
        const doctorId = SPECIALIST[patientId] || DENTAL[k % DENTAL.length];
        const dept = DEMO_DOCTORS.find(d => d.id === doctorId)?.departmentId;
        const pool = SPECIALIST[patientId] ? DEMO_SERVICES.filter(s => s.departmentId === dept) : [];
        const idx = (k * 5 + 1) % SERVICE_NAMES.length;
        const svc = pool.length
            ? { name: pool[k % pool.length].name, price: pool[k % pool.length].price }
            : { name: SERVICE_NAMES[idx], price: SERVICE_PRICES[idx] };
        DEMO_TRANSACTIONS.push({
            id: `demo-tx-a${k + 1}`,
            patientId,
            patientName: pName(patientId),
            date: dayFull(-off),
            amount: svc.price,
            type: (['Cash', 'Card', 'Click'] as const)[k % 3],
            service: svc.name,
            status: off > 30 && k % 5 === 3 ? 'Pending' : 'Paid',
            clinicId: 'demo-clinic-1',
            doctorId,
            doctorName: dName(doctorId),
            discountPercent: 0,
            discountAmount: 0,
            createdAt: dayFull(-off),
            receivedByName: 'Registratura',
        } as Transaction);
    });

    /* Yangi, yo'qolgan va qaytgan bemorlarning qabullari (yuqoridagi
       `DEMO_ARCHIVE_VISITS`) — hammasi to'langan */
    DEMO_ARCHIVE_VISITS.forEach(([patientId, ago], k) => {
        const own = DEMO_PATIENTS.find(p => p.id === patientId)?.doctorId || 'demo-doctor-1';
        const idx = (k * 3 + 2) % SERVICE_NAMES.length;
        /* Mutaxassis bemoriga — o'z bo'limining xizmati (kardiologga plomba
           emas). Katalogda xizmati yo'q bo'lim (statsionar) shifokorining
           bemori — stomatologga: «plomba — Statsionar» chiqmasin. */
        const ownDept = DEMO_DOCTORS.find(d => d.id === own)?.departmentId;
        const ownPool = ownDept && ownDept !== 'demo-ter' ? DEMO_SERVICES.filter(s => s.departmentId === ownDept) : [];
        const doctorId = ownDept === 'demo-ter' || ownPool.length ? own : 'demo-doctor-1';
        const pool = doctorId === own ? ownPool : [];
        const svc = pool.length ? pool[k % pool.length] : { name: SERVICE_NAMES[idx], price: SERVICE_PRICES[idx] };
        DEMO_TRANSACTIONS.push({
            id: `demo-tx-v${k + 1}`,
            patientId,
            patientName: pName(patientId),
            date: dayFull(-ago),
            amount: svc.price,
            type: (['Cash', 'Card', 'Click'] as const)[k % 3],
            service: svc.name,
            status: 'Paid',
            clinicId: 'demo-clinic-1',
            doctorId,
            doctorName: dName(doctorId),
            discountPercent: 0,
            discountAmount: 0,
            createdAt: dayFull(-ago),
            receivedByName: 'Registratura',
        } as Transaction);
    });
}

if (!savedData?.leads) {
    const LEAD_ROWS: [string, string, string, Lead['status']][] = [
        ['Aziz Tursunov', 'Instagram', 'Implantatsiya', 'Contacted'],
        ['Mavluda Sattorova', 'Telegram', 'Breket tizimi', 'Thinking'],
        ['Jasur Ibragimov', 'Tavsiya', 'Tish oqartirish', 'Booked'],
        ['Kamola Nurmatova', 'Google', 'Konsultatsiya', 'New'],
        ["Ulug'bek Rasulov", "Ko'chadan", 'Tish tozalash', 'Contacted'],
        ['Diyora Ismoilova', 'Instagram', 'Metall-keramika toj', 'New'],
        ['Bekzod Alimov', 'Telegram', 'Tish olib tashlash', 'Cancelled'],
    ];
    LEAD_ROWS.forEach(([name, source, service, status], i) => {
        DEMO_LEADS.push({
            id: `demo-lead-g${i + 1}`,
            name, phone: `+998 9${i % 5} ${400 + i} ${11 + i} ${22 + i}`,
            service, source,
            notes: '',
            status,
            createdAt: dayFull(-(i + 1)),
            updatedAt: dayFull(-i),
            clinicId: 'demo-clinic-1',
        } as Lead);
    });
}

if (!savedData?.expenses) {
    /* Demo oyining xarajati tushumga mos (2026-11-22). Ilgari bu yerda ijara
       6 mln va oylik 3,5 mln ham turardi: oy xarajati 13,5 mln, tushum 5,2 mln —
       hisobot «sof foyda −8 mln» deb ko'rsatib, demo zarar ko'rgan klinikadek
       ko'rinardi. Ijara allaqachon yuqorida (`demo-exp-1`). */
    /* To'rtinchi ustun — necha kun oldin. Oxirgi to'rttasi O'TGAN OY
       (2026-11-26): busiz Hisobotda xarajat o'zgarishi «yangi» edi. */
    const EXP: [string, string, number, number][] = [
        ['Utilities', 'Elektr va suv', 300000, 1],
        ['Inventory', 'Anesteziya sotib olindi', 400000, 4],
        ['Inventory', 'Laboratoriya reagentlari', 300000, 7],
        ['Other', 'Reklama (Instagram)', 250000, 10],
        ['Rent', 'Ijara (o\'tgan oy)', 2000000, 53],
        ['Utilities', 'Kommunal (o\'tgan oy)', 600000, 46],
        ['Inventory', 'Sarf materiallari', 550000, 38],
        ['Other', 'Reklama (o\'tgan oy)', 200000, 33],
    ];
    EXP.forEach(([category, title, amount, ago], i) => {
        DEMO_EXPENSES.push({
            id: `demo-exp-g${i + 1}`,
            date: dayISO(-ago),
            amount, category: category as any, title,
            /* Katta xarajat (ijara, oylik) — bank o'tkazmasi bilan. Hammasi naqd
               bo'lsa demo kassada «Kassada qoldi» millionlab minusga tushardi. */
            method: (amount >= 1000000 ? 'Transfer' : 'Cash') as any,
            note: null,
            clinicId: 'demo-clinic-1',
            createdAt: dayFull(-ago),
        } as Expense);
    });
}

if (!savedData?.inventory) {
    const ITEMS: [string, string, number, number][] = [
        ['Bir martalik qo\'lqop', 'quti', 24, 5],
        ['Steril bint', 'dona', 120, 30],
        ['Kompozit plomba materiali', 'shprits', 18, 6],
        ['Anestetik (artikain)', 'ampula', 40, 12],
        ['Bir martalik shprits', 'dona', 200, 50],
        ['Dezinfeksiya eritmasi', 'litr', 9, 3],
        ['Ftorli lak', 'flakon', 7, 3],
    ];
    ITEMS.forEach(([name, unit, quantity, minQuantity], i) => {
        DEMO_INVENTORY.push({
            id: `demo-item-g${i + 1}`,
            name, unit, quantity, minQuantity,
            clinicId: 'demo-clinic-1',
            createdAt: dayFull(-40),
            updatedAt: dayFull(-i),
        } as InventoryItem);
    });
}

if (!savedData?.logs) {
    for (let i = 0; i < 8; i++) {
        const item = DEMO_INVENTORY[i % DEMO_INVENTORY.length];
        const isIn = i % 3 === 0;
        DEMO_INVENTORY_LOGS.push({
            id: `demo-log-g${i + 1}`,
            itemId: item.id,
            change: isIn ? 25 : -(i % 4 + 1),
            type: isIn ? 'IN' : 'OUT',
            note: isIn ? 'Yetkazib berish' : 'Qabulda ishlatildi',
            date: dayFull(-i),
            userName: isIn ? 'Ombor' : 'Registratura',
            item: { name: item.name, unit: item.unit },
        } as InventoryLog);
    }
}

if (!savedData?.messageLogs) {
    /* Bemor, manba va matn bilan — haqiqiy server ham `patient` ni qo'shib
       beradi. Ilgari bular yo'q edi va Tarixda ism o'rnida «-», kanal
       yonida «SMS ()» chiqardi. */
    const KINDS: [string, string, (name: string) => string][] = [
        ['Reminder', 'before_appointment', n => `Hurmatli ${n}, ertaga soat 10:00 da qabulingiz bor. Demo Klinika`],
        ['Birthday', 'birthday', n => `Hurmatli ${n}, tug'ilgan kuningiz bilan tabriklaymiz! Demo Klinika`],
        ['DebtReminder', 'debt_reminder', n => `Hurmatli ${n}, klinikamizdagi qarzingiz: 350 000 so'm. Demo Klinika`],
        ['Followup', 'after_appointment', n => `${n}, qabuldan keyin o'zingizni qanday his qilyapsiz? Demo Klinika`],
    ];
    for (let i = 0; i < 8; i++) {
        const patientId = `demo-patient-${(i % 9) + 6}`;
        const p = DEMO_PATIENTS.find(x => x.id === patientId);
        const [type, source, text] = KINDS[i % 4];
        const channel = (i % 2 ? 'telegram' : 'sms') as MessageLog['channel'];
        DEMO_MESSAGE_LOGS.push({
            id: `demo-msg-g${i + 1}`,
            clinicId: 'demo-clinic-1',
            patientId,
            type,
            source,
            status: (i % 5 === 4 ? 'Failed' : 'Sent') as MessageLog['status'],
            message: text(p?.firstName || 'bemor'),
            error: i % 5 === 4 ? 'Telefon raqami mavjud emas' : null,
            sentAt: dayFull(-(i / 2)),
            channel,
            recipient: p?.phone || '',
            patient: p ? { id: p.id, firstName: p.firstName, lastName: p.lastName, phone: p.phone } : undefined,
        } as MessageLog);
    }
}

if (!savedData?.labOrders) {
    /** Ish turi → narx. Bir xil ish bir xil turadi — bu tabiiy ko'rinadi. */
    const LAB_PRICE: Record<string, number> = {
        Koronka: 900000, Vinir: 1600000, Protez: 2200000, Kappa: 450000,
    };
    const ORDERS: [number, string, string, LabOrder['status']][] = [
        [6, 'Koronka', 'Sirkoniy', 'InProgress'],
        [7, 'Protez', 'Akril', 'Ordered'],
        [8, 'Vinir', 'Keramika', 'Completed'],
        [9, 'Koronka', 'Metallkeramika', 'Collected'],
        [10, 'Kappa', 'Silikon', 'InProgress'],
    ];
    ORDERS.forEach(([pid, orderType, material, status], i) => {
        const p = DEMO_PATIENTS.find(x => x.id === `demo-patient-${pid}`);
        DEMO_LAB_ORDERS.push({
            id: `demo-order-g${i + 1}`,
            clinicId: 'demo-clinic-1',
            patientId: `demo-patient-${pid}`,
            patientName: p ? `${p.firstName} ${p.lastName}` : 'Bemor',
            doctorName: 'Dr. Kamola Ahmedova',
            technicianId: 'demo-tech-1',
            technicianName: 'Karimov Farhod',
            orderType, material,
            toothNumbers: `${11 + i}, ${12 + i}`,
            notes: '',
            deadline: dayISO(i + 2),
            /* Narx ISH TURIGA qarab. Ilgari bu yerda `350000 + i * 120000`
               turardi: ro'yxatdagi har bir narx oldingisidan aynan 120 000
               ga ko'p bo'lib, seed generatordan chiqqani ko'rinib turardi
               (audit XC-29). Qiymatlar Toshkent bozoridagi odatiy
               narxlarga yaqinlashtirildi. */
            price: LAB_PRICE[orderType] ?? 400000,
            totalPrice: LAB_PRICE[orderType] ?? 400000,
            priority: i === 1 ? 'Urgent' : 'Normal',
            status,
            orderedAt: dayFull(-(i + 1)),
        } as LabOrder);
    });
}

if (!savedData?.receptionists) {
    ['Malika Norova', 'Sevara Qosimova', 'Dilshod Turayev'].forEach((full, i) => {
        const [firstName, lastName] = full.split(' ');
        DEMO_RECEPTIONISTS.push({
            id: `demo-rec-${i + 1}`,
            firstName, lastName,
            phone: `+998 9${i} 111 22 3${i}`,
            username: `rec${i + 1}`,
            status: 'Active',
            clinicId: 'demo-clinic-1',
        } as Receptionist);
    });
}
