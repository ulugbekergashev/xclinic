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
const DEMO_DATA_VERSION = 3;
const VERSION_KEY = 'xclinic_demo_version';

export const loadDemoData = () => {
    try {
        const storedVersion = Number(localStorage.getItem(VERSION_KEY) || 0);
        if (storedVersion !== DEMO_DATA_VERSION) {
            console.log(`📦 Demo ma'lumoti eskirgan (v${storedVersion} → v${DEMO_DATA_VERSION}) — qaytadan yig'iladi`);
            localStorage.removeItem(STORAGE_KEY);
            localStorage.setItem(VERSION_KEY, String(DEMO_DATA_VERSION));
            return null;
        }
        const stored = localStorage.getItem(STORAGE_KEY);
        console.log('📦 Loading Demo Data from LS:', stored ? 'Found' : 'Not Found');
        if (stored) {
            const parsed = JSON.parse(stored);
            console.log('✅ Demo Data Parsed:', {
                patients: parsed.patients?.length,
                appointments: parsed.appointments?.length,
                transactions: parsed.transactions?.length
            });
            return parsed;
        }
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
        console.log('💾 Demo Data Saved to LS. Size:', Math.round(stringified.length / 1024), 'KB');
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
    name: 'Demo Stomatologiya',
    adminName: 'Demo Admin',
    username: 'demoklinikaadmin',
    phone: '+998 90 123 45 67',
    status: 'Active',
    planId: 'pro',
    subscriptionStartDate: new Date('2024-01-01').toISOString(),
    expiryDate: new Date('2030-12-31').toISOString(),
    monthlyRevenue: 0,
    subscriptionType: 'Paid',
    botToken: '',
    startHour: 8,
    endHour: 20
};

export let DEMO_CLINICS: Clinic[] = savedData?.clinics || [DEMO_CLINIC];

export let DEMO_RECEPTIONISTS: Receptionist[] = savedData?.receptionists || [];


export let DEMO_DIAGNOSES: PatientDiagnosis[] = savedData?.diagnoses || [];


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
];

// Demo Services
export let DEMO_SERVICES: Service[] = savedData?.services || [
    { id: 1, name: 'Konsultatsiya', price: 50000, categoryId: 'cat-1', duration: 30, clinicId: 'demo-clinic-1' },
    { id: 2, name: 'Tish tozalash', price: 200000, categoryId: 'cat-2', duration: 45, clinicId: 'demo-clinic-1' },
    { id: 3, name: 'Tish plombalash', price: 300000, categoryId: 'cat-3', duration: 60, clinicId: 'demo-clinic-1' },
    { id: 4, name: 'Tish olib tashlash', price: 150000, categoryId: 'cat-4', duration: 30, clinicId: 'demo-clinic-1' },
    { id: 5, name: 'Tish oqartirish', price: 800000, categoryId: 'cat-2', duration: 90, clinicId: 'demo-clinic-1' },
    { id: 6, name: 'Metall-keramika toj', price: 1200000, categoryId: 'cat-6', duration: 120, clinicId: 'demo-clinic-1' },
    { id: 7, name: 'Breket tizimi', price: 5000000, categoryId: 'cat-5', duration: 90, clinicId: 'demo-clinic-1' },
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
        medicalHistory: 'Yuqori qon bosimi',
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
        medicalHistory: 'Allergiya (penitsiliinga)',
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
        medicalHistory: 'Qandli diabet (2-tur)',
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
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        type: 'Konsultatsiya',
        date: dayISO(0),
        time: '10:00',
        duration: 30,
        status: 'Confirmed',
        notes: 'Tish og\'rig\'i tekshiruvi',
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
        amount: 300000,
        type: 'Cash',
        service: 'Tish plombalash',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
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
        amount: 200000,
        type: 'Cash',
        service: 'Tish tozalash',
        status: 'Pending',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        discountPercent: 0,
        discountAmount: 0
    },
    {
        id: 'demo-tx-4',
        patientId: 'demo-patient-4',
        patientName: 'Eldor Toshmatov',
        date: dayFull(-13),
        amount: 50000,
        type: 'Cash',
        service: 'Konsultatsiya',
        status: 'Paid',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
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
        method: 'Cash',
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
        id: 'demo-exp-3',
        date: dayISO(0),
        amount: 150000,
        category: 'DoctorShare',
        title: 'Shifokor ulushi',
        method: 'Cash',
        clinicId: 'demo-clinic-1',
        doctorId: 'demo-doctor-1',
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
    { id: 'before_appointment', label: 'Qabuldan oldin', respectCooldown: false, supportsDoctorFilter: true, offset: { label: 'Necha soat oldin', unit: 'hour', options: [1, 2, 3, 6, 12, 24], default: 2 } },
    { id: 'birthday', label: "Tug'ilgan kun", respectCooldown: true, supportsDoctorFilter: true },
    { id: 'no_show', label: 'Kelmagan bemor', respectCooldown: true, supportsDoctorFilter: true },
    { id: 'after_appointment', label: 'Qabuldan keyin', respectCooldown: true, supportsDoctorFilter: true, offset: { label: 'Necha soat keyin', unit: 'hour', options: [2, 4, 24, 48, 72], default: 24 } },
    { id: 'new_patient', label: "Yangi bemor ro'yxatdan o'tdi", respectCooldown: false, supportsDoctorFilter: true, offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 1 } },
    { id: 'payment_received', label: "To'lov qabul qilindi", respectCooldown: false, supportsDoctorFilter: false, offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 0 } },
    { id: 'recall', label: 'Uzoq kelmaganlarni qaytarish', respectCooldown: true, supportsDoctorFilter: true, offset: { label: 'Necha oydan beri kelmagan', unit: 'month', options: [3, 6, 9, 12], default: 6 } },
    { id: 'debt_reminder', label: 'Qarz eslatmasi', respectCooldown: true, supportsDoctorFilter: false, offset: { label: 'Qarz necha kundan beri', unit: 'day', options: [3, 7, 14, 30], default: 7 } },
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
        name: 'Liqidoqain',
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
            medicalHistory: i % 3 === 0 ? 'Surunkali gastrit' : '',
            clinicId: 'demo-clinic-1',
            lastVisit: dayISO(-(i + 2)),
            status: 'Active',
            gender,
        } as Patient);
    });
}

if (!savedData?.doctors) {
    DEMO_DOCTORS.push(
        {
            id: 'demo-doctor-3', firstName: 'Nilufar', lastName: 'Tosheva',
            specialty: 'Terapevt', phone: '+998 90 777 88 99', status: 'Active',
            clinicId: 'demo-clinic-1', percentage: 35, departmentId: 'demo-ter', username: 'nilufar_t', color: '#F59E0B',
        } as Doctor,
        {
            id: 'demo-doctor-4', firstName: 'Sardor', lastName: 'Mahmudov',
            specialty: 'Jarroh', phone: '+998 91 555 44 33', status: 'Active',
            clinicId: 'demo-clinic-1', percentage: 45, departmentId: 'demo-inp', username: 'sardor_m', color: '#8B5CF6',
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
    for (let i = 0; i < 12; i++) {
        const patientId = `demo-patient-${(i % 9) + 6}`;
        const doctorId = `demo-doctor-${(i % 4) + 1}`;
        const svc = i % SERVICE_NAMES.length;
        DEMO_TRANSACTIONS.push({
            id: `demo-tx-g${i + 1}`,
            patientId,
            patientName: pName(patientId),
            date: dayFull(-(i * 2)),
            amount: SERVICE_PRICES[svc],
            type: (['Cash', 'Card', 'Click'] as const)[i % 3],
            service: SERVICE_NAMES[svc],
            status: i % 3 === 2 ? 'Pending' : 'Paid',
            clinicId: 'demo-clinic-1',
            doctorId,
            doctorName: dName(doctorId),
            discountPercent: 0,
            discountAmount: 0,
        } as Transaction);
    }
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
    const EXP: [string, string, number][] = [
        ['Rent', 'Ijara — avgust', 6000000],
        ['Utilities', 'Elektr va suv', 850000],
        ['Inventory', 'Anesteziya sotib olindi', 1200000],
        ['Salary', 'Registratura oyligi', 3500000],
        ['Lab', 'Laboratoriya ishlari', 950000],
        ['Other', 'Reklama (Instagram)', 700000],
    ];
    EXP.forEach(([category, title, amount], i) => {
        DEMO_EXPENSES.push({
            id: `demo-exp-g${i + 1}`,
            date: dayISO(-(i * 3 + 1)),
            amount, category: category as any, title,
            method: 'Cash' as any,
            note: null,
            clinicId: 'demo-clinic-1',
            createdAt: dayFull(-(i * 3 + 1)),
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
    for (let i = 0; i < 8; i++) {
        const patientId = `demo-patient-${(i % 9) + 6}`;
        DEMO_MESSAGE_LOGS.push({
            id: `demo-msg-g${i + 1}`,
            clinicId: 'demo-clinic-1',
            patientId,
            type: ['Reminder', 'Birthday', 'DebtReminder', 'Followup'][i % 4],
            status: (i % 5 === 4 ? 'Failed' : 'Sent') as MessageLog['status'],
            message: 'Hurmatli bemor, ertangi qabulingizni eslatamiz.',
            error: i % 5 === 4 ? 'Telefon raqami mavjud emas' : null,
            sentAt: dayFull(-(i / 2)),
            channel: (i % 2 ? 'telegram' : 'sms') as MessageLog['channel'],
        } as MessageLog);
    }
}

if (!savedData?.labOrders) {
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
            price: 350000 + i * 120000,
            totalPrice: 350000 + i * 120000,
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
