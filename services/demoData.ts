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

export const loadDemoData = () => {
    try {
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
