import { Modality, Patient, Appointment, Transaction, Expense, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, ServiceCategory, ICD10Code, PatientDiagnosis, DiagnosisKind, ReferralVisit, InventoryItem, InventoryLog, Lead, LeadApiKeyInfo, InstallmentPlan, MessageTemplate, AutomationRule, MessageLog, MessageChannel, BulkSendStatus, TriggerDescriptor, AudienceSegment, AudiencePreview, SegmentFieldDescriptor, SavedSegment, CashRegisterDay, CashMovement, CashAuditLog , Visit, VisitCharge, StockMovement, ServiceRecipeLine, ServiceCost, InventoryAlerts, ChargeSummary, PendingPatient, Department, EncounterTemplate, EncounterField, LabTest, LabTestParameter, LabOrder, LabOrderItem, DiagnosticStudy, Ward, Bed, Admission, InpatientRound, MedicationOrder, TodayZones, Prescription, PrescriptionItem, InventoryBatch, BackupConfig } from '../types';
import { medDue } from '../shared/medSchedule';
import { todayISO, dayKey } from '../utils/dateUtils';
import * as auth from './authStore';
import { tr } from '../context/LanguageContext';
import { emitDataChanged, resourceOf } from './dataBus';

/** Yagona hisoblash qatlamining javobi — `backend/snapshot.ts` bilan
 *  bir xil shakl. Bu tur o'zgarsa, ikkala tomon ham o'zgarishi shart. */
export interface Snapshot {
    range: { from: string; to: string };
    /** Ayni damdagi qarz — davrga bog'liq emas */
    debt: { amount: number; charges: number; patients: number };
    period: {
        charged: number; collected: number; due: number;
        visits: number; appointments: number; avgCheck: number;
    };
    patients: { total: number; active: number; newLast7Days: number };
}

export { auth };

// Demo rejimida kassa yopilishlari faqat sessiya davomida saqlanadi
const DEMO_CASH_REGISTER: CashRegisterDay[] = [];
const DEMO_CASH_MOVEMENTS: CashMovement[] = [];

export interface CashCloseInput {
    clinicId: string;
    date: string;
    shift?: number;
    shiftStart?: string;
    shiftEnd?: string;
    openingCash?: number;
    countedCash: number;
    expectedCash: number;
    countedCard?: number | null;
    expectedCard?: number | null;
    countedClick?: number | null;
    expectedClick?: number | null;
    note?: string;
}
import { DEMO_PATIENTS, DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_EXPENSES, DEMO_DOCTORS, DEMO_SERVICES, DEMO_CLINIC, DEMO_CLINICS, DEMO_PLAN, DEMO_INVENTORY, DEMO_INVENTORY_LOGS, DEMO_RECEPTIONISTS, DEMO_DIAGNOSES, DEMO_ICD10, DEMO_CATEGORIES, DEMO_LEADS, DEMO_INSTALLMENTS, DEMO_LAB_TECHNICIANS, DEMO_LAB_ORDERS, DEMO_MESSAGE_TEMPLATES, DEMO_AUTOMATION_RULES, DEMO_MESSAGE_LOGS, DEMO_TRIGGERS, DEMO_SEGMENT_FIELDS, saveDemoData } from './demoData';
import { demoAudience } from './demoAudience';

// XClinic offline rejimda ishlaydi — hech qanday bulut manzili yo'q.
// Backend shu kompyuterda turadi; uch xil kirish usuli qo'llab-quvvatlanadi.
const getBaseUrl = () => {
    // 1) Electron: bundle file:// orqali ochiladi. 3001-port band bo'lsa main.ts
    //    bo'sh portni tanlab, uni ?port= query orqali uzatadi.
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        const port = new URLSearchParams(window.location.search).get('port') || '3101';
        return `http://localhost:${port}/api`;
    }
    /* 2) HTTP orqali ochilgan — HAR DOIM shu manba.
          Uch holat ham shu yerga tushadi:
            • tarmoqdan brauzer (http://192.168.x.x:3001);
            • Electron (S1.3 dan keyin u `http://localhost:PORT` dan
              yuklanadi — cookie `file://` da ishlamagani uchun);
            • dev server (vite `/api` ni backendga proksilaydi).

          ILGARI bu yerda `hostname !== 'localhost'` sharti turardi va
          `localhost` esa quyidagi 3-holatga tushib, QAT'IY 3001-portga
          urilardi. Electron `pickBackendPort()` bilan BO'SH portni
          tanlaydi — 3001 band bo'lsa boshqasini. Ya'ni ilova o'zi
          ko'targan serverga emas, 3001-portdagi begona narsaga (yoki
          hech narsaga) so'rov yuborardi.

          Buni brauzer E2E sinovi topdi: server 3077-portda edi, front
          esa 3001 ga urilib «Tizimga kirishda xatolik» berardi. */
    if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
        return `${window.location.protocol}//${window.location.host}/api`;
    }

    // 3) Boshqa holatlar (SSR, sinov muhiti) — sozlamadan yoki standart port
    const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:3101';
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;
};
export const API_URL = getBaseUrl();

/** Saqlangan klinika id. Propdan olmaydigan ekranlar uchun. */
export function getStoredClinicId(): string {
    return auth.getSession()?.clinicId || '';
}

/** Kirish tokeni. Hodisalar oqimi (SSE) uchun kerak — u `fetchJson` dan
 *  o'tmaydi, lekin xuddi shu tokenni ishlatishi shart.
 *  Token XOTIRADA yashaydi, diskda emas (`services/authStore.ts`). */
export function getAuthToken(): string | null {
    return auth.getToken() ?? (auth.getSession()?.isDemo ? auth.getSession()!.token ?? null : null);
}
export const API_BASE_URL = API_URL.replace(/\/api$/, '');

/** Saqlangan token — fayl manzilida ishlatiladi.
 *  `<img src>` tegi `Authorization` sarlavhasini yubora olmaydi, shuning uchun
 *  himoyalangan fayl manziliga token query orqali qo'shiladi. Serverda u
 *  sarlavhaga ko'chiriladi va oddiy tekshiruvdan o'tadi (backend/files.ts). */
const readStoredToken = (): string => getAuthToken() || '';

export type FileKind = 'patient-photo' | 'study-file' | 'patient-avatar' | 'patient-portrait';

/** Himoyalangan fayl manzili.
 *
 *  Ilgari bu funksiya `/uploads/<nom>` yo'lini qaytarardi va papka
 *  autentifikatsiyasiz ochiq edi — fayl nomini bilgan har kim bemor fotosini
 *  ko'rardi. Endi manzil YOZUV id si bo'yicha yasaladi, server esa faylni
 *  berishdan oldin rol va klinikani tekshiradi.
 *
 *  `id` bo'sh bo'lsa (masalan, avatar yuklanmagan) bo'sh satr qaytadi —
 *  `<img src="">` rasm so'ramaydi. */
export const getFileUrl = (kind: FileKind, id: string | null | undefined) => {
    if (!id) return '';
    const token = readStoredToken();
    const q = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/api/files/${kind}/${id}${q}`;
};


export const isDemoMode = () => auth.getSession()?.isDemo === true;

/* ─── Demo rejim himoyasi ─────────────────────────────────────────────────────
   Demo hisobi (`demoklinikaadmin`) tokeni soxta — 'demo-token'. U bilan serverga
   borilsa 401 keladi, 401 esa sessiyani tozalab, foydalanuvchini login sahifasiga
   uloqtiradi. Shuning uchun demo rejimda yangi modullar serverga UMUMAN bormaydi:
   o'qish bo'sh ro'yxat qaytaradi, yozish esa tushunarli xato beradi.          */
/** O'QISH uchun: serverga bormaydi, bo'sh/neytral qiymat qaytaradi */
const demoRead = <T,>(value: T): Promise<T> => Promise.resolve(value);

/* ── DEMO RAQAMLARI ──────────────────────────────────────────────────────
   Bosh sahifa va «Yagona hisoblash qatlami» ilgari demoda QAT'IY NOL
   qaytarardi ("Demo rejimda hisobot bo'sh ko'rinadi — xato emas"). Bu
   ishlab chiqishda to'g'ri edi, lekin namoyish nusxasida birinchi ochilgan
   ekran butunlay nollardan iborat bo'lib qoladi — ko'rgan odam dasturni
   emas, bo'sh jadvalni ko'radi.

   Shuning uchun raqamlar demo ma'lumotining O'ZIDAN sanaladi. Natijada
   klient yangi bemor qo'shsa yoki to'lov kiritsa, bosh sahifadagi son ham
   o'zgaradi — ya'ni demo tirik ko'rinadi va haqiqiy dastur qanday
   ishlashini ko'rsatadi. */

/** Sana `from..to` oralig'idami? Chegaralar berilmasa — hamma narsa mos. */
const inRange = (iso: string | undefined, from?: string, to?: string): boolean => {
    if (!iso) return false;
    const day = iso.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
};

/* Demoda allergiya ro'yxati SESSIYA davomida saqlanadi (kassa yopilishlari
   kabi). Bemor kartasida allergiya qo'shish — ko'rsatishga arziydigan
   qadam, shuning uchun qo'shilgani darhol ro'yxatda paydo bo'lishi kerak. */
const DEMO_ALLERGIES: { id: string; patientId: string; substance: string; reaction: string; severity: string }[] = [
    { id: 'demo-allergy-1', patientId: 'demo-patient-2', substance: 'Penitsillin', reaction: 'Toshma', severity: 'Severe' },
];

/** Tibbiy tarixni kim va qachon o'zgartirgani — demoda kirgan foydalanuvchi */
const demoAnamnesisStamp = () => ({ anamnesisUpdatedAt: new Date().toISOString(), anamnesisUpdatedBy: 'Demo Admin' });
const demoStampPatient = (patientId: string) => {
    const p = DEMO_PATIENTS.find(x => x.id === patientId);
    if (p) { Object.assign(p, demoAnamnesisStamp()); saveDemoData(); }
};

/** Bemor kartasidagi klinik xulosa — demo ma'lumotidan yig'iladi. */
const demoClinicalSummary = (patientId: string) => {
    const pending = DEMO_TRANSACTIONS.filter(
        t => (t as any).patientId === patientId && t.status !== 'Paid'
    );
    const recentVisits = DEMO_APPOINTMENTS
        .filter(a => a.patientId === patientId && a.status === 'Completed')
        .slice(0, 5)
        .map(a => ({
            id: a.id,
            date: a.date,
            doctorName: a.doctorName,
            complaint: a.type,
            diagnosis: (a as any).notes || '',
        }));

    /* Me'yordan chiqqan natijalar — tayyor yo'llanmalardan (server ham shunday
       yig'adi). Ilgari bu yerda bo'sh ro'yxat turardi. */
    const abnormalResults = DEMO_LAB_ORDERS
        .filter(o => o.patientId === patientId && o.status === 'Completed')
        .flatMap(o => demoLabResults(o.id).items.flatMap(i => i.parameters.map(r => ({ ...r, at: o.completedAt || null }))))
        .filter(r => r.flag === 'High' || r.flag === 'Low')
        .map(r => ({ name: r.name, value: r.value, unit: r.unit, flag: r.flag, refLow: r.refLow, refHigh: r.refHigh, at: r.at }));

    const p = DEMO_PATIENTS.find(x => x.id === patientId);
    return {
        patient: p ? { anamnesisUpdatedAt: p.anamnesisUpdatedAt ?? null, anamnesisUpdatedBy: p.anamnesisUpdatedBy ?? null } : undefined,
        allergies: DEMO_ALLERGIES.filter(a => a.patientId === patientId),
        /* FAQAT surunkali tashxislar va serverdagi shaklda (`name` bilan).
           Ilgari bemorning HAMMA tashxisi qaytardi va nomi yo'q edi. */
        chronic: DEMO_DIAGNOSES
            .filter(d => d.patientId === patientId && (d.isChronic || d.status === 'Chronic'))
            .map(d => ({ id: d.id, code: d.code, name: d.icd10?.name || d.code, date: d.date })),
        recentVisits,
        abnormalResults,
        activeMedications: DEMO_PRESCRIPTIONS
            .filter(p => p.patientId === patientId && p.status === 'Active')
            .flatMap(p => (p.items || []).map(i => ({ name: i.name || '', dosage: i.dosage || null, frequency: i.frequency || null, date: p.date }))),
        admissions: DEMO_ADMISSIONS
            .filter(a => a.patientId === patientId)
            .map(a => ({ id: a.id, admittedAt: a.admittedAt, dischargedAt: a.dischargedAt || null, status: a.status, diagnosis: a.diagnosis || null })),
        due: pending.reduce((s, t) => s + (t.amount || 0), 0),
    };
};

const demoSnapshot = (from?: string, to?: string): Snapshot => {
    const tx = DEMO_TRANSACTIONS.filter(t => inRange(t.date as any, from, to));
    const paid = tx.filter(t => t.status === 'Paid');
    const pending = tx.filter(t => t.status !== 'Paid');

    const charged = tx.reduce((s, t) => s + (t.amount || 0), 0);
    const collected = paid.reduce((s, t) => s + (t.amount || 0), 0);

    // Qarz — davrga bog'liq EMAS, ayni damdagi holat (Snapshot shartnomasi)
    const allPending = DEMO_TRANSACTIONS.filter(t => t.status !== 'Paid');
    const debtAmount = allPending.reduce((s, t) => s + (t.amount || 0), 0);
    const debtPatients = new Set(allPending.map(t => (t as any).patientId || t.patientName)).size;

    const appts = DEMO_APPOINTMENTS.filter(a => inRange(a.date, from, to));
    const visits = appts.filter(a => a.status === 'Completed').length;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    return {
        range: { from: from || '', to: to || '' },
        debt: { amount: debtAmount, charges: allPending.length, patients: debtPatients },
        period: {
            charged, collected,
            due: charged - collected,
            visits,
            appointments: appts.length,
            avgCheck: visits > 0 ? Math.round(collected / visits) : 0,
        },
        patients: {
            total: DEMO_PATIENTS.length,
            active: DEMO_PATIENTS.filter(p => p.status === 'Active').length,
            /* Server kabi — ro'yxatdan o'tgan sana bo'yicha (`snapshot.ts`), `lastVisit` emas */
            newLast7Days: DEMO_PATIENTS.filter(p => String(p.createdAt || '').slice(0, 10) >= weekAgo).length,
        },
    };
};
/* HISOBOT (reports.summary) — demo to'plamidan, server shaklida.
   Tannarx demoda yo'q (xizmat retseptlari to'ldirilmagan) — 0. */
const demoReportSummary = (from?: string, to?: string) => {
    const tx = DEMO_TRANSACTIONS.filter(t => inRange(t.date as any, from, to));
    const exps = DEMO_EXPENSES.filter(e => inRange(e.date as any, from, to));
    const deptOfDoctor = (doctorId?: string) =>
        DEMO_DOCTORS.find(d => d.id === doctorId)?.departmentId || null;

    const byDept = new Map<string, any>();
    const byDoctor = new Map<string, any>();
    const daily = new Map<string, { date: string; revenue: number; collected: number }>();
    let revenue = 0, collected = 0;

    for (const t of tx) {
        const total = t.amount || 0;
        const paid = t.status === 'Paid' ? total : 0;
        revenue += total; collected += paid;

        const dId = deptOfDoctor((t as any).doctorId);
        const dKey = dId || 'none';
        if (!byDept.has(dKey)) byDept.set(dKey, {
            departmentId: dId,
            name: dId ? (DEMO_DEPARTMENTS.find(d => d.id === dId)?.name || "Noma'lum") : "Bo'limsiz",
            revenue: 0, collected: 0, due: 0, cost: 0, count: 0,
        });
        const d = byDept.get(dKey);
        d.revenue += total; d.collected += paid; d.due += total - paid; d.count++;

        if (t.doctorName) {
            if (!byDoctor.has(t.doctorName)) byDoctor.set(t.doctorName, { doctorName: t.doctorName, revenue: 0, count: 0 });
            const dr = byDoctor.get(t.doctorName);
            dr.revenue += total; dr.count++;
        }

        const day = String(t.date).slice(0, 10);
        if (!daily.has(day)) daily.set(day, { date: day, revenue: 0, collected: 0 });
        const dd = daily.get(day)!;
        dd.revenue += total; dd.collected += paid;
    }

    let doctorShare = 0, otherExpenses = 0, legacyLabExpense = 0;
    const expenseByCategory = new Map<string, number>();
    for (const e of exps) {
        const amt = e.amount || 0;
        if (e.category === 'DoctorShare') { doctorShare += amt; continue; }
        if (e.category === 'Lab') { legacyLabExpense += amt; continue; }
        otherExpenses += amt;
        expenseByCategory.set(e.category, (expenseByCategory.get(e.category) || 0) + amt);
    }

    return {
        period: { from: from || '', to: to || '' },
        openDebt: demoSnapshot(from, to).debt,
        totals: {
            revenue, collected, due: revenue - collected, materialCost: 0,
            grossProfit: revenue, doctorShare, otherExpenses,
            netProfit: revenue - doctorShare - otherExpenses, legacyLabExpense,
        },
        byDepartment: Array.from(byDept.values())
            .map(d => ({ ...d, margin: d.revenue, marginPercent: d.revenue > 0 ? 100 : 0 }))
            .sort((a, b) => b.revenue - a.revenue),
        bySource: tx.length ? [{ source: 'Visit', label: 'Qabul', revenue, count: tx.length }] : [],
        byDoctor: Array.from(byDoctor.values()).sort((a, b) => b.revenue - a.revenue),
        expenseByCategory: Array.from(expenseByCategory.entries())
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount),
        daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
};

/* QARZDORLAR — DEMO TO'PLAMIDAN, BEMOR KESIMIDA.

   Bitta joyda, chunki uni IKKI joy o'qiydi: `reports.dashboard` (Qarz
   kartasi ostidagi «N ta bemor») va `reports.attention` («to'lov
   kutmoqda» qatori). Ilgari birinchisida qo'lda `0` yozilgan edi va
   ekranda «3 200 000 so'm · 0 ta bemor» degan o'zaro zid juft chiqardi.

   Qoida serverникi bilan bir xil: qoldiq bo'yicha, bemor kesimida
   (bitta odamning uchta to'lanmagan qatori — bitta qarzdor). */
const demoDebtors = () => {
    const today = todayISO();
    const daysBetween = (from: string, to: string) =>
        Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));

    const byPatient = new Map<string, { due: number; oldest: string }>();
    for (const t of DEMO_TRANSACTIONS) {
        if (t.status === 'Paid') continue;
        const key = (t as any).patientId || `name:${t.patientName}`;
        const d = String(t.date).slice(0, 10);
        const g = byPatient.get(key) || { due: 0, oldest: d };
        g.due += t.amount || 0;
        if (d < g.oldest) g.oldest = d;
        byPatient.set(key, g);
    }
    const all = Array.from(byPatient.values()).filter(g => g.due > 0);
    return {
        today,
        daysBetween,
        all,
        overdue: all.filter(g => daysBetween(g.oldest, today) >= 30),
        waiting: all.filter(g => daysBetween(g.oldest, today) < 30),
    };
};

/* `demoWrite()` va `demoMissing()` OLIB TASHLANDI.
 *
 * Ular har qanday yozishni «Demo rejimda saqlab bo'lmaydi» xatosi bilan rad
 * etardi va o'ttiz bitta yozish amalini o'lik qilib qo'ygan edi: ombor kirimi,
 * kassa to'lovi, tahlil natijasi, bo'lim qo'shish. Namoyish nusxasida bu
 * eng yomon holat — ko'rgan odam dasturning o'zini buzuq deb hisoblaydi.
 *
 * Endi har bir amal demo to'plamining O'ZIGA yoziladi (`demoDone` ga
 * qarang). Yangi amal qo'shsangiz ham shu yo'ldan boring — serverga
 * yuborish demoda ishlamaydi: token soxta va 401 sessiyani uzadi. */

/** BITTA YOZUV so'ralgan, lekin u demo to'plamida yo'q — serverdagi 404 ning
 *  o'rnini bosadi. Bu `demoWrite` dan farq qiladi: bu yerda amal emas,
 *  YOZUVNING O'ZI yo'q, ya'ni xato o'rinli. */
const demoMissing = <T,>(what: string): Promise<T> =>
    Promise.reject(new Error(`Demo rejimda ${what} mavjud emas.`));

/** Demo rejimda ko'rsatiladigan bo'limlar — faqat menyu tirik ko'rinishi uchun */
const DEMO_DEPARTMENTS: Department[] = [
    /* Ko'p profilli klinika: stomatologiya, kardiologiya, endokrinologiya.
       `demo-ter` id si eski — unga ko'p joy bog'langan, nomi o'zgardi xolos. */
    { id: 'demo-ter', clinicId: 'demo-clinic-1', name: 'Stomatologiya', code: 'STM', type: 'CLINICAL', color: '#2563EB', sortOrder: 1, isActive: true },
    { id: 'demo-kard', clinicId: 'demo-clinic-1', name: 'Kardiologiya', code: 'KAR', type: 'CLINICAL', color: '#DC2626', sortOrder: 2, isActive: true },
    { id: 'demo-endo', clinicId: 'demo-clinic-1', name: 'Endokrinologiya', code: 'END', type: 'CLINICAL', color: '#D97706', sortOrder: 3, isActive: true },
    { id: 'demo-lab', clinicId: 'demo-clinic-1', name: 'Laboratoriya', code: 'LAB', type: 'LAB', color: '#0D9488', sortOrder: 4, isActive: true },
    { id: 'demo-diag', clinicId: 'demo-clinic-1', name: 'Diagnostika', code: 'DIAG', type: 'DIAGNOSTIC', color: '#4F46E5', sortOrder: 5, isActive: true },
    /* Statsionar bo'limi — `Inpatient.tsx` yangi bemorni yotqizishda
       `departments.find(d => d.type === 'INPATIENT')` ni qidiradi. Busiz
       demoda yotqizish oynasi bo'limsiz qolardi. */
    { id: 'demo-inp', clinicId: 'demo-clinic-1', name: 'Statsionar', code: 'INP', type: 'INPATIENT', color: '#DB2777', sortOrder: 6, isActive: true },
];

/* ── DEMO: STATSIONAR ────────────────────────────────────────────────────
   Palatalar, koykalar va yotqizilgan bemorlar. Ilgari bu yerda bo'sh
   massiv turardi (`wards.getAll` → []), ya'ni demoda Statsionar ochilsa
   «palata yo'q» degan bo'sh ekran chiqardi — modul buzuq emas, lekin
   ko'rsatishga hech narsa yo'q edi.

   Ma'lumot SESSIYA davomida o'zgaradi: bemor yotqizilsa koyka band
   bo'ladi, chiqarilsa bo'shaydi. Ya'ni namoyishda haqiqiy oqimni
   boshidan oxirigacha ko'rsatish mumkin. */
const DEMO_BEDS: Bed[] = [
    { id: 'demo-bed-1', wardId: 'demo-ward-1', label: '1-koyka', status: 'Occupied' },
    { id: 'demo-bed-2', wardId: 'demo-ward-1', label: '2-koyka', status: 'Occupied' },
    { id: 'demo-bed-3', wardId: 'demo-ward-1', label: '3-koyka', status: 'Free' },
    { id: 'demo-bed-4', wardId: 'demo-ward-1', label: '4-koyka', status: 'Free' },
    { id: 'demo-bed-5', wardId: 'demo-ward-2', label: '1-koyka', status: 'Occupied' },
    { id: 'demo-bed-6', wardId: 'demo-ward-2', label: '2-koyka', status: 'Cleaning' },
];

const DEMO_WARDS: Ward[] = [
    {
        id: 'demo-ward-1', clinicId: 'demo-clinic-1', departmentId: 'demo-inp',
        name: '1-palata (umumiy)', floor: '2', kind: 'Umumiy',
        dailyRate: 150000, isActive: true,
        get beds() { return DEMO_BEDS.filter(b => b.wardId === 'demo-ward-1'); },
    },
    {
        id: 'demo-ward-2', clinicId: 'demo-clinic-1', departmentId: 'demo-inp',
        name: '2-palata (lyuks)', floor: '3', kind: 'Lyuks',
        dailyRate: 400000, isActive: true,
        get beds() { return DEMO_BEDS.filter(b => b.wardId === 'demo-ward-2'); },
    },
];

const dayShift = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString();

const DEMO_ADMISSIONS: Admission[] = [
    {
        id: 'demo-adm-1', clinicId: 'demo-clinic-1',
        patientId: 'demo-patient-1', patientName: 'Aziza Rahimova',
        departmentId: 'demo-inp', doctorId: 'demo-doctor-1', doctorName: 'Dr. Kamola Ahmedova',
        bedId: 'demo-bed-1', admittedAt: dayShift(-3), dischargedAt: null, status: 'Active',
        reason: 'Yuqori harorat, holsizlik', diagnosis: 'O\'tkir respirator infeksiya',
        dailyRate: 150000, totalCharges: 450000,
    },
    {
        id: 'demo-adm-2', clinicId: 'demo-clinic-1',
        patientId: 'demo-patient-2', patientName: 'Bobur Aliyev',
        departmentId: 'demo-inp', doctorId: 'demo-doctor-2', doctorName: 'Dr. Jamshid Karimov',
        bedId: 'demo-bed-2', admittedAt: dayShift(-1), dischargedAt: null, status: 'Active',
        reason: 'Operatsiyadan keyingi kuzatuv', diagnosis: 'Tish implantatsiyasidan keyin',
        dailyRate: 150000, totalCharges: 150000,
    },
    {
        id: 'demo-adm-3', clinicId: 'demo-clinic-1',
        patientId: 'demo-patient-3', patientName: 'Dilnoza Karimova',
        departmentId: 'demo-inp', doctorId: 'demo-doctor-1', doctorName: 'Dr. Kamola Ahmedova',
        bedId: 'demo-bed-5', admittedAt: dayShift(-6), dischargedAt: null, status: 'Active',
        reason: 'Rejali davolash', diagnosis: 'Surunkali periodontit',
        dailyRate: 400000, totalCharges: 2400000,
    },
    {
        id: 'demo-adm-4', clinicId: 'demo-clinic-1',
        patientId: 'demo-patient-4', patientName: 'Eldor Toshmatov',
        departmentId: 'demo-inp', doctorId: 'demo-doctor-2', doctorName: 'Dr. Jamshid Karimov',
        bedId: null, admittedAt: dayShift(-14), dischargedAt: dayShift(-9), status: 'Discharged',
        reason: 'Jarrohlik amaliyoti', diagnosis: 'Aql tishi retensiyasi',
        dischargeSummary: 'Holati qoniqarli, ambulator kuzatuvga o\'tkazildi.',
        dailyRate: 150000, totalCharges: 750000,
    },
];

const DEMO_MED_ORDERS: MedicationOrder[] = [
    { id: 'demo-med-1', admissionId: 'demo-adm-1', name: 'Paratsetamol', dosage: '500 mg', route: 'Ichga', frequency: 'Kuniga 3 marta', startDate: dayShift(-3), status: 'Active' },
    { id: 'demo-med-2', admissionId: 'demo-adm-1', name: 'Amoksitsillin', dosage: '875 mg', route: 'Ichga', frequency: 'Kuniga 2 marta', startDate: dayShift(-2), status: 'Active' },
    { id: 'demo-med-3', admissionId: 'demo-adm-3', name: 'Ketorol', dosage: '10 mg', route: 'Mushak ichiga', frequency: "Og'riqda", startDate: dayShift(-5), status: 'Active' },
];

const DEMO_ROUNDS: InpatientRound[] = [
    { id: 'demo-round-1', admissionId: 'demo-adm-1', date: dayShift(-2), doctorId: 'demo-doctor-1', doctorName: 'Dr. Kamola Ahmedova', vitalSigns: 'T 37.8, AB 120/80, P 84', notes: 'Harorat pasaymoqda', plan: 'Davolashni davom ettirish' },
    { id: 'demo-round-2', admissionId: 'demo-adm-1', date: dayShift(-1), doctorId: 'demo-doctor-1', doctorName: 'Dr. Kamola Ahmedova', vitalSigns: 'T 36.9, AB 118/75, P 76', notes: 'Ahvoli yaxshilandi', plan: 'Ertaga chiqarishni ko\'rib chiqish' },
];

/** Dori berilgani (hamshira belgisi) va palatadan palataga o'tkazishlar. */
const DEMO_ADMINISTRATIONS: { id: string; orderId: string; at: string; note: string }[] = [
    { id: 'demo-adm-give-1', orderId: 'demo-med-1', at: dayShift(-1), note: 'Berildi' },
];
const DEMO_TRANSFERS: any[] = [];

/* ── DEMO: QABULLAR VA HISOB QATORLARI ───────────────────────────────────
   Bu ikkalasi bo'sh qaytardi va natijada namoyishning yarmi bo'm-bo'sh
   ko'rinardi: «Mening navbatim» — «Navbat bo'sh», registratura — hech kim,
   kassada — to'lanmagan qator yo'q. Dastur ishlayotgani ko'rinmasdi.

   Navbat BUGUNGI sanaga quriladi va holatlar aralash: kutayotgan,
   chaqirilgan, qabulda, natija kutayotgan va yakunlangan. Shunda klient
   bitta ekranda butun zanjirni ko'radi. */
const demoName = (id: string) => {
    const p = DEMO_PATIENTS.find(x => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : 'Bemor';
};

/* Bugungi navbat UCH bo'limda: stomatologiya (1, 2, 4-shifokor),
   kardiologiya (3) va endokrinologiya (5). Qabul shifokorning bo'limiga
   ochiladi — shunda kartadagi xizmatlar ro'yxati ham o'sha bo'limniki.
   Yangi qator faqat OXIRIGA qo'shilsin: qabul id si tartib raqamidan. */
const DEMO_VISIT_PLAN: { pid: number; status: Visit['status']; doc: number; dept: string; waited: number; complaint: string; plan?: string }[] = [
    { pid: 6, status: 'In Progress', doc: 1, dept: 'demo-ter', waited: 35, complaint: "Tish og'rig'i, o'ng past tomonda" },
    { pid: 7, status: 'Called', doc: 2, dept: 'demo-ter', waited: 28, complaint: 'Breket sozlash' },
    { pid: 8, status: 'Waiting', doc: 1, dept: 'demo-ter', waited: 22, complaint: "Profilaktik ko'rik" },
    { pid: 9, status: 'Waiting', doc: 3, dept: 'demo-kard', waited: 17, complaint: "Ko'krak qafasida siquvchi og'riq, zinadan chiqqanda hansirash" },
    { pid: 10, status: 'Waiting', doc: 4, dept: 'demo-ter', waited: 12, complaint: "Aql tishi olib tashlash bo'yicha maslahat" },
    { pid: 11, status: 'AwaitingResults', doc: 5, dept: 'demo-endo', waited: 45, complaint: "Chanqoq, tez-tez siyish, oriqlash; qand tahlili topshirdi" },
    { pid: 12, status: 'Completed', doc: 2, dept: 'demo-ter', waited: 150, complaint: 'Plomba almashtirish' },
    { pid: 13, status: 'Completed', doc: 1, dept: 'demo-ter', waited: 190, complaint: 'Tish toshini olish' },
    { pid: 14, status: 'Completed', doc: 4, dept: 'demo-ter', waited: 95, complaint: "Jarrohlikdan keyingi ko'rik" },
    { pid: 1,  status: 'Waiting', doc: 3, dept: 'demo-kard', waited: 8, complaint: "Bosh og'rig'i, qon bosimi 160/100 gacha ko'tariladi",
      plan: "Arterial gipertenziya II daraja, nazoratsiz. Lizinopril dozasi 20 mg gacha oshirildi (ertalab). " +
        "Kuniga 2 mahal bosimni o'lchab, kundalikka yozib borish. Tuz kuniga 5 g dan oshmasin, haftada 5 kun 30 daqiqa piyoda yurish. " +
        "EKG va qon tahlili natijasi bilan 2 haftadan keyin qayta ko'rik. Bosim 180/110 dan oshsa yoki ko'krakda og'riq bo'lsa — darhol murojaat." },
    { pid: 4,  status: 'In Progress', doc: 5, dept: 'demo-endo', waited: 30, complaint: "Qandli diabet nazorati, oyoqlarda uvishish" },
    { pid: 3,  status: 'Waiting', doc: 5, dept: 'demo-endo', waited: 14, complaint: "Bo'yinda shish, holsizlik, sochlar to'kilishi" },
    { pid: 5,  status: 'Completed', doc: 3, dept: 'demo-kard', waited: 120, complaint: "Yurak urishi tezlashishi, bosh aylanishi" },
];

const DEMO_VISITS: Visit[] = DEMO_VISIT_PLAN.map((v, i) => {
    const patientId = `demo-patient-${v.pid}`;
    const doctorId = `demo-doctor-${v.doc}`;
    const doc = DEMO_DOCTORS.find(d => d.id === doctorId);
    /* Vaqtlar HOZIRGI paytdan orqaga hisoblanadi, qat'iy soatdan emas.
       Ilgari `setHours(9)` turardi va demo kechqurun ochilsa navbatdagi
       bemor «665 daqiqa kutmoqda» bo'lib chiqardi — ishonarli emas. */
    const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
    return {
        id: `demo-visit-${i + 1}`,
        patientId,
        date: todayISO(),
        checkInTime: minsAgo(v.waited),
        checkOutTime: v.status === 'Completed' ? minsAgo(Math.max(0, v.waited - 40)) : undefined,
        status: v.status,
        complaints: v.complaint,
        treatmentPlan: v.plan,
        clinicId: 'demo-clinic-1',
        departmentId: v.dept,
        doctorId,
        doctorName: doc ? `Dr. ${doc.firstName} ${doc.lastName}` : undefined,
        queueNumber: i + 1,
        calledAt: v.status === 'Waiting' ? null : minsAgo(Math.max(0, v.waited - 10)),
        // «Bugun klinikada» xaritasidagi taymer shundan sanaydi
        startedAt: v.status === 'In Progress' ? minsAgo(Math.max(0, v.waited - 20)) : null,
        awaitingSince: v.status === 'AwaitingResults' ? minsAgo(Math.max(0, v.waited - 15)) : null,
        patient: DEMO_PATIENTS.find(p => p.id === patientId),
    } as Visit;
});

/* Hisob qatorlari qabullardan chiqadi: har bir qabulda 1-2 xizmat.
   Uchdan biri to'lanmagan — kassada ish bo'lsin. */
/** Qabulga mos tahlil nomi — kardiologga lipid, endokrinologga HbA1c. */
const DEMO_DEPT_LAB: Record<string, string> = {
    'demo-kard': 'Lipid profili',
    'demo-endo': 'Glikirlangan gemoglobin (HbA1c)',
};
const DEMO_CHARGES: VisitCharge[] = DEMO_VISITS.flatMap((v, i) => {
    /* Xizmat qabulning O'Z bo'limidan: kardiologga «Tish plombalash»
       yozilib qolmasin. */
    const pool = DEMO_SERVICES.filter(s => s.departmentId === v.departmentId);
    const svc = pool.length ? pool[i % pool.length] : DEMO_SERVICES[i % DEMO_SERVICES.length];
    const unpaid = i % 3 !== 0;
    const rows: VisitCharge[] = [{
        id: `demo-charge-${i + 1}`,
        clinicId: 'demo-clinic-1',
        visitId: v.id,
        patientId: v.patientId,
        patientName: demoName(v.patientId),
        source: 'Service',
        sourceId: String(svc.id),
        name: svc.name,
        quantity: 1,
        unitPrice: svc.price,
        discount: 0,
        total: svc.price,
        status: unpaid ? 'Unpaid' : 'Paid',
        paidAmount: unpaid ? 0 : svc.price,
        paidAt: unpaid ? null : v.checkInTime,
        createdAt: v.checkInTime,
        createdByName: 'Registratura',
        visit: { id: v.id, date: v.date, queueNumber: v.queueNumber, departmentId: v.departmentId },
    }];
    if (i % 4 === 1) {
        rows.push({
            ...rows[0],
            id: `demo-charge-${i + 1}b`,
            source: 'Lab',
            sourceId: null,
            name: `Tahlil: ${DEMO_DEPT_LAB[v.departmentId || ''] || 'Umumiy qon tahlili'}`,
            unitPrice: 90000, total: 90000,
            status: 'Unpaid', paidAmount: 0, paidAt: null,
        });
    }
    return rows;
});

/* ── DEMO: LABORATORIYA, DIAGNOSTIKA, DORIXONA, OMBOR ─────────────────────
   Bularning hammasi bo'sh massiv qaytarardi. Turi aniq bo'lgani uchun
   shakl xatosi bo'lishi mumkin emas — TypeScript tekshiradi. */

const DEMO_LAB_TESTS: LabTest[] = [
    { id: 'demo-lt-1', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Umumiy qon tahlili', code: 'UQT', sampleType: 'Qon', price: 45000, cost: 18000, turnaroundHours: 4, isActive: true, sortOrder: 1 },
    { id: 'demo-lt-2', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Qandli diabet (glyukoza)', code: 'GLU', sampleType: 'Qon', price: 30000, cost: 11000, turnaroundHours: 2, isActive: true, sortOrder: 2 },
    { id: 'demo-lt-3', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Umumiy siydik tahlili', code: 'UST', sampleType: 'Siydik', price: 35000, cost: 12000, turnaroundHours: 3, isActive: true, sortOrder: 3 },
    { id: 'demo-lt-4', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Biokimyoviy tahlil', code: 'BIO', sampleType: 'Qon', price: 120000, cost: 55000, turnaroundHours: 24, isActive: true, sortOrder: 4 },
    { id: 'demo-lt-5', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Qon ivishi (koagulogramma)', code: 'KOA', sampleType: 'Qon', price: 95000, cost: 40000, turnaroundHours: 8, isActive: true, sortOrder: 5 },
    { id: 'demo-lt-6', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Gormonlar (TTG)', code: 'TTG', sampleType: 'Qon', price: 110000, cost: 48000, turnaroundHours: 48, isActive: true, sortOrder: 6 },
    { id: 'demo-lt-7', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Gepatit B markerlari', code: 'HBS', sampleType: 'Qon', price: 85000, cost: 36000, turnaroundHours: 24, isActive: true, sortOrder: 7 },
    { id: 'demo-lt-8', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Mikroreaksiya', code: 'RW', sampleType: 'Qon', price: 40000, cost: 15000, turnaroundHours: 6, isActive: false, sortOrder: 8 },
    // Kardiologiya va endokrinologiya uchun
    { id: 'demo-lt-9', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Lipid profili', code: 'LIP', sampleType: 'Qon', price: 95000, cost: 40000, turnaroundHours: 24, isActive: true, sortOrder: 9 },
    { id: 'demo-lt-10', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Glikirlangan gemoglobin (HbA1c)', code: 'HBA1C', sampleType: 'Qon', price: 90000, cost: 38000, turnaroundHours: 24, isActive: true, sortOrder: 10 },
    { id: 'demo-lt-11', clinicId: 'demo-clinic-1', departmentId: 'demo-lab', name: 'Erkin T4', code: 'FT4', sampleType: 'Qon', price: 85000, cost: 35000, turnaroundHours: 48, isActive: true, sortOrder: 11 },
];

/* Tahlil PARAMETRLARI — natija kiritish oynasi aynan shulardan qatorlar
   yasaydi. Ular bo'lmagani uchun demoda «Natijani kiritish» oynasi BO'SH
   ochilardi va «Saqlash» tugmasi hech narsa qilmasdi: ekranning butun
   ma'nosi shu ro'yxatda. Normalar haqiqiy klinik oraliqlardan olindi. */
const DEMO_LAB_PARAMS: Record<string, { name: string; unit?: string; refLow?: number; refHigh?: number }[]> = {
    'demo-lt-1': [
        { name: 'Gemoglobin', unit: 'g/l', refLow: 120, refHigh: 160 },
        { name: 'Eritrotsitlar', unit: '10¹²/l', refLow: 3.9, refHigh: 5.2 },
        { name: 'Leykotsitlar', unit: '10⁹/l', refLow: 4, refHigh: 9 },
        { name: 'Trombotsitlar', unit: '10⁹/l', refLow: 180, refHigh: 320 },
        { name: 'EChT', unit: 'mm/soat', refLow: 2, refHigh: 15 },
    ],
    'demo-lt-2': [{ name: 'Glyukoza', unit: 'mmol/l', refLow: 3.9, refHigh: 6.1 }],
    'demo-lt-3': [
        { name: 'Zichlik', refLow: 1010, refHigh: 1025 },
        { name: 'Oqsil', unit: 'g/l', refLow: 0, refHigh: 0.033 },
        { name: 'Leykotsitlar (k/m)', refLow: 0, refHigh: 5 },
    ],
    'demo-lt-4': [
        { name: 'Umumiy bilirubin', unit: 'µmol/l', refLow: 3.4, refHigh: 20.5 },
        { name: 'ALT', unit: 'U/l', refLow: 0, refHigh: 41 },
        { name: 'AST', unit: 'U/l', refLow: 0, refHigh: 40 },
        { name: 'Kreatinin', unit: 'µmol/l', refLow: 62, refHigh: 106 },
    ],
    'demo-lt-5': [
        { name: 'Protrombin indeksi', unit: '%', refLow: 80, refHigh: 105 },
        { name: 'Fibrinogen', unit: 'g/l', refLow: 2, refHigh: 4 },
    ],
    'demo-lt-6': [{ name: 'TTG', unit: 'mMe/l', refLow: 0.4, refHigh: 4 }],
    'demo-lt-7': [{ name: 'HBsAg', refText: 'Manfiy' } as any],
    'demo-lt-9': [
        { name: 'Umumiy xolesterin', unit: 'mmol/l', refLow: 0, refHigh: 5.2 },
        { name: 'LPNP (yomon xolesterin)', unit: 'mmol/l', refLow: 0, refHigh: 3.0 },
        { name: 'LPYuP (yaxshi xolesterin)', unit: 'mmol/l', refLow: 1.0, refHigh: 2.2 },
        { name: 'Triglitseridlar', unit: 'mmol/l', refLow: 0, refHigh: 1.7 },
    ],
    'demo-lt-10': [{ name: 'HbA1c', unit: '%', refLow: 4, refHigh: 6 }],
    'demo-lt-11': [{ name: 'Erkin T4', unit: 'pmol/l', refLow: 10, refHigh: 22 }],
};

/* Tekshiruv turlari `types.ts` dagi `Modality` bilan BIR XIL bo'lishi shart.
   Ilgari bu yerda `['XRay','Ultrasound','CT','MRI']` turardi va `as any`
   bilan o'tkazib yuborilardi. Ekran esa `MODALITY_LABELS[s.modality]` ni
   qidiradi — kalit topilmagach xom inglizcha so'zni chizardi, ya'ni
   o'zbekcha interfeysda «Ultrasound» ko'rinardi (audit XC-32). */
/* Tekshiruvlar klinika bo'limlariga mos: stomatologiya, kardiologiya,
   endokrinologiya. Har biri O'SHA bo'lim bemoriga yoziladi — tish
   bemoriga yurak UZI chiqmasin (audit XC-33). 9-bemor kardiolog
   navbatida, 11-bemor endokrinolog navbatida natija kutmoqda. */
const STUDY_PLAN: { pid: number; name: string; modality: Modality }[] = [
    { pid: 6, name: 'Panoramik rentgen (OPG)', modality: 'RENTGEN' },
    { pid: 7, name: 'Tish rentgeni (pritsel)', modality: 'RENTGEN' },
    { pid: 8, name: '3D konus-nurli tomografiya', modality: 'KT' },
    { pid: 9, name: 'Elektrokardiogramma (EKG)', modality: 'EKG' },
    { pid: 5, name: 'Exokardiografiya (yurak UZI)', modality: 'UZI' },
    { pid: 11, name: 'Qalqonsimon bez UZI', modality: 'UZI' },
];
const STUDY_NAMES = STUDY_PLAN.map(s => s.name);

const DEMO_STUDIES: DiagnosticStudy[] = STUDY_NAMES.map((name, i) => {
    const patientId = `demo-patient-${STUDY_PLAN[i].pid}`;
    const p = DEMO_PATIENTS.find(x => x.id === patientId);
    /* «Natija kutilmoqda» holatidagi bugungi qabul — tekshiruv O'SHA
       qabulga bog'lanadi va hali tayyor emas. Ilgari bog'lanmagan edi:
       kartada «Natija kutilmoqda» deb turib, kutilayotgan narsa ko'rinmasdi. */
    const awaiting = DEMO_VISITS.find(v => v.patientId === patientId && v.status === 'AwaitingResults');
    const st = awaiting ? 'InProgress' : (['Completed', 'Completed', 'InProgress', 'Ordered'] as const)[i % 4];
    return {
        id: `demo-study-${i + 1}`,
        ...(awaiting ? { visitId: awaiting.id } : {}),
        clinicId: 'demo-clinic-1',
        patientId,
        patientName: p ? `${p.firstName} ${p.lastName}` : 'Bemor',
        departmentId: 'demo-diag',
        modality: STUDY_PLAN[i].modality,
        name,
        status: st,
        orderedByName: 'Dr. Kamola Ahmedova',
        performedByName: st === 'Ordered' ? null : 'Laborant Zuhra',
        orderedAt: dayShift(-(i + 1)),
        performedAt: st === 'Ordered' ? null : dayShift(-i),
        price: [180000, 60000, 350000, 80000, 250000, 150000][i % 6],
    } as DiagnosticStudy;
});

const DEMO_PRESCRIPTIONS: Prescription[] = [0, 1, 2, 3, 4].map(i => {
    const patientId = `demo-patient-${i + 6}`;
    const p = DEMO_PATIENTS.find(x => x.id === patientId);
    return {
        id: `demo-rx-${i + 1}`,
        clinicId: 'demo-clinic-1',
        patientId,
        patientName: p ? `${p.firstName} ${p.lastName}` : 'Bemor',
        doctorId: 'demo-doctor-1',
        doctorName: 'Dr. Kamola Ahmedova',
        date: dayShift(-i),
        status: i % 2 ? 'Issued' : 'Draft',
        notes: i % 2 ? 'Ovqatdan keyin qabul qilinsin' : null,
    } as Prescription;
});

const DEMO_STOCK_MOVES: StockMovement[] = Array.from({ length: 10 }, (_, i) => {
    const item = DEMO_INVENTORY[i % DEMO_INVENTORY.length];
    const type = (['In', 'Out', 'Out', 'Writeoff', 'Adjust'] as const)[i % 5];
    return {
        id: `demo-move-${i + 1}`,
        clinicId: 'demo-clinic-1',
        itemId: item?.id ?? 'demo-inv-1',
        type,
        quantity: type === 'In' ? 50 : -(i % 4 + 1),
        reason: { In: 'Yetkazib berish', Out: 'Qabulda ishlatildi', Writeoff: "Muddati o'tgan", Adjust: 'Inventarizatsiya' }[type],
        userName: 'Registratura',
        createdAt: dayShift(-i),
        item: item ? { name: item.name, unit: (item as any).unit || 'dona' } : undefined,
    } as StockMovement;
});

const DEMO_BATCHES: InventoryBatch[] = Array.from({ length: 6 }, (_, i) => {
    const item = DEMO_INVENTORY[i % DEMO_INVENTORY.length];
    return {
        id: `demo-batch-${i + 1}`,
        itemId: item?.id ?? 'demo-inv-1',
        batchNumber: `P-2026-${100 + i}`,
        expiryDate: dayShift((i - 1) * 30).slice(0, 10),
        quantity: 20 + i * 5,
        cost: 12000 + i * 1500,
        receivedAt: dayShift(-(30 + i)),
        expired: i === 0,
    } as InventoryBatch;
});

/* ── DEMO: YOZISH AMALLARI ───────────────────────────────────────────────
   Ilgari bu yerdagi har bir amal `demoWrite()` ga borardi — ya'ni tugma
   bosilganda «Demo rejimda saqlab bo'lmaydi» degan xato chiqardi. Namoyish
   nusxasida bu o'ttiz bitta yozish amalini o'lik qilib qo'ygan edi: ombor kirimi,
   kassa to'lovi, tahlil natijasi, bo'lim qo'shish — hech biri ishlamasdi.
   Ko'rgan odam esa dasturni buzuq deb hisoblaydi.

   Endi yozish YUQORIDAGI massivlarning O'ZIGA bajariladi. Ular sessiya
   davomida yashaydi (sahifa yangilansa boshlang'ich holatga qaytadi) —
   `DEMO_CASH_REGISTER` bilan bir xil qoida. Bemor, qabul va to'lov kabi
   `demoData.ts` dagi to'plamlar esa avvalgidek `saveDemoData()` orqali
   brauzerda saqlanadi. */

/** Demo yozuvi uchun noyob id. */
const demoId = (prefix: string) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const demoNow = () => new Date().toISOString();

/** `YYYY-MM-DD` — brauzerning mahalliy kuni (demo koyka kunlari uchun) */
const demoLocalDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* Yotishga bog'langan hisob qatori — demo. Server (`backend/inpatient.ts`)
   bilan bir xil: bemor va shifokor yotishning o'zidan olinadi, qator
   `DEMO_CHARGES` ga tushadi — ya'ni kassaning «to'lanmagan» ro'yxatida ham,
   statsionar hisobida ham bir xil ko'rinadi. */
const demoAdmissionCharge = (a: Admission, x: {
    source: VisitCharge['source']; sourceId?: string | null; name: string; amount: number;
}): VisitCharge => ({
    id: demoId('demo-charge'), clinicId: 'demo-clinic-1', visitId: null,
    patientId: a.patientId, patientName: a.patientName,
    source: x.source, sourceId: x.sourceId ?? null, name: x.name,
    quantity: 1, unitPrice: x.amount, discount: 0, total: x.amount,
    status: 'Unpaid', paidAmount: 0, paidAt: null,
    createdAt: demoNow(), createdByName: 'Demo Admin',
    doctorId: a.doctorId ?? null, doctorName: a.doctorName ?? null, admissionId: a.id,
});

/** Nomi bo'yicha ombor mahsuloti — jurnal qatoriga nom yozish uchun. */
const demoItem = (itemId: string) => DEMO_INVENTORY.find(i => i.id === itemId);

/** Ombor harakati + qoldiqni o'zgartirish + jurnal qatori.
 *  `delta` musbat — kirim, manfiy — chiqim. `Transfer` da nol beriladi:
 *  tovar klinika ichida qoladi, umumiy qoldiq o'zgarmaydi. */
const demoStockMove = (
    type: StockMovement['type'], itemId: string, delta: number,
    reason: string, extra?: { note?: string; userName?: string; patientId?: string; visitId?: string },
): StockMovement => {
    const item = demoItem(itemId);
    if (item && delta !== 0) item.quantity = Math.max(0, (item.quantity || 0) + delta);
    const move: StockMovement = {
        id: demoId('demo-move'),
        clinicId: 'demo-clinic-1',
        itemId,
        type,
        quantity: delta,
        reason,
        note: extra?.note ?? null,
        userName: extra?.userName || 'Demo Admin',
        visitId: extra?.visitId ?? null,
        createdAt: demoNow(),
        item: item ? { name: item.name, unit: item.unit || 'dona' } : undefined,
    };
    DEMO_STOCK_MOVES.unshift(move);
    /* Ombor ekranidagi «Harakatlar» va bemor kartasidagi «Sarflangan
       material» IKKI XIL ro'yxatdan o'qiydi (`stock.movements` va
       `inventory.getLogs`). Ikkalasiga ham yozamiz, aks holda kirim
       qilingan tovar bir ekranda ko'rinib, ikkinchisida ko'rinmaydi. */
    if (delta !== 0) {
        DEMO_INVENTORY_LOGS.unshift({
            id: demoId('demo-log'),
            itemId,
            change: delta,
            type: delta > 0 ? 'IN' : 'OUT',
            note: extra?.note || reason,
            date: demoNow(),
            userName: extra?.userName || 'Demo Admin',
            patientId: extra?.patientId,
            patientName: extra?.patientId ? demoName(extra.patientId) : undefined,
            item: item ? { name: item.name, unit: item.unit || 'dona' } : undefined,
        } as InventoryLog);
    }
    saveDemoData();
    return move;
};

/* Xizmat retseptlari — «bitta plombaga qancha material ketadi». Demoda
   bo'sh boshlanadi va foydalanuvchi o'zi to'ldiradi; shuning uchun
   `let` emas, doimiy massiv yetarli. */
const DEMO_RECIPES: ServiceRecipeLine[] = [];

/** Retsept qatoriga ombor mahsulotini biriktirish — ekran `item.name` va
 *  `item.price` ni kutadi, ularsiz jadval bo'sh ustun ko'rsatadi. */
const demoRecipeLine = (serviceId: number, l: { itemId: string; quantity: number; note?: string }): ServiceRecipeLine => {
    const item = demoItem(l.itemId);
    return {
        id: demoId('demo-recipe'), serviceId, itemId: l.itemId,
        quantity: l.quantity, note: l.note ?? null,
        item: item ? { id: item.id, name: item.name, unit: item.unit || 'dona', price: item.price || 0 } : undefined,
    };
};

/* ── DEMO: LABORATORIYA NATIJALARI ───────────────────────────────────────
   Yo'llanmaga tegishli tahlillar va kiritilgan qiymatlar. `demo-order-*`
   yozuvlarida `items` yo'q, shuning uchun ular BIRINCHI OCHILGANDA
   yasaladi va shu yerda saqlanadi — aks holda oyna har safar boshqacha
   ro'yxat ko'rsatib, kiritilgan natija yo'qolardi. */
const DEMO_ORDER_ITEMS: Record<string, { id: string; testId: string }[]> = {};
/** `"<orderItemId>:<parameterId>"` → kiritilgan qiymat. */
const DEMO_RESULT_VALUES: Record<string, { value: string; note?: string }> = {};

/** Norma chegarasiga qarab bayroq — server `flag` maydonini shunday to'ldiradi. */
const demoFlag = (value: string, refLow?: number, refHigh?: number): 'Low' | 'High' | 'Normal' | null => {
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n) || (refLow == null && refHigh == null)) return null;
    if (refLow != null && n < refLow) return 'Low';
    if (refHigh != null && n > refHigh) return 'High';
    return 'Normal';
};

/** Yo'llanmaning to'liq ko'rinishi — natija oynasi shu shaklni kutadi. */
const demoLabResults = (orderId: string) => {
    const order = DEMO_LAB_ORDERS.find(o => o.id === orderId);
    if (!DEMO_ORDER_ITEMS[orderId] && order?.items?.length) {
        // Yo'llanma tahlillari bilan yozilgan (kartadan, registraturadan) — o'shalar
        DEMO_ORDER_ITEMS[orderId] = order.items.map(i => ({ id: i.id, testId: i.testId }));
    }
    if (!DEMO_ORDER_ITEMS[orderId]) {
        /* Yo'llanmada tahlil ro'yxati yo'q — katalogdan ikkitasi
           BARQAROR tanlanadi (id dan hisoblanadi, tasodifiy emas). */
        const active = DEMO_LAB_TESTS.filter(t => t.isActive);
        const seed = Array.from(orderId).reduce((s, ch) => s + ch.charCodeAt(0), 0);
        const picked = active.length
            ? [active[seed % active.length], active[(seed + 3) % active.length]]
                .filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)
            : [];
        DEMO_ORDER_ITEMS[orderId] = picked.map((t, i) => ({ id: `${orderId}-item-${i + 1}`, testId: t.id }));
    }
    const items = DEMO_ORDER_ITEMS[orderId].map(it => {
        const test = DEMO_LAB_TESTS.find(t => t.id === it.testId);
        const params = DEMO_LAB_PARAMS[it.testId] || [{ name: test?.name || 'Natija' }];
        const rows = params.map((p, i) => {
            const parameterId = `${it.testId}-p${i + 1}`;
            const saved = DEMO_RESULT_VALUES[`${it.id}:${parameterId}`];
            return {
                parameterId, name: p.name, unit: p.unit ?? null,
                refLow: p.refLow ?? null, refHigh: p.refHigh ?? null,
                refText: (p as any).refText ?? null,
                value: saved?.value || '',
                valueNum: saved ? Number(String(saved.value).replace(',', '.')) || null : null,
                flag: saved ? demoFlag(saved.value, p.refLow, p.refHigh) : null,
                note: saved?.note ?? null,
            };
        });
        return {
            id: it.id, orderId, testId: it.testId,
            testName: test?.name || 'Tahlil', price: test?.price || 0,
            status: rows.every(r => r.value) ? 'Completed' : 'Pending',
            parameters: rows,
        };
    });
    return {
        ...(order || { id: orderId }),
        id: orderId, items,
        /* Yosh va jins normalarni tanlash uchun kerak; demoda bemor
           kartasidan olinadi, topilmasa null — ekran shunga tayyor. */
        patientAge: null as number | null,
        patientSex: null as string | null,
    };
};

/** Hisob qatorlarining yig'indisi — server `ChargeSummary` bilan bir xil. */
const demoSummarize = (rows: VisitCharge[]): ChargeSummary => {
    const total = rows.reduce((s, c) => s + (c.total || 0), 0);
    const paid = rows.reduce((s, c) => s + (c.paidAmount || 0), 0);
    return { total, paid, due: Math.max(0, total - paid), unpaidCount: rows.filter(c => c.status !== 'Paid').length };
};

/* ── DEMO: HISOBOTLAR VA JURNALLAR ───────────────────────────────────────
   Bularning turi `any`, ya'ni TypeScript shaklni tekshirmaydi — shuning
   uchun har biri ekran KUTGAN maydonlar bo'yicha qo'lda yig'ildi.
   («Ulush» vkladkasi aynan shu sababdan yiqilgan edi.) */

/** Natijasi tayyor, lekin shifokor ko'rmagan qabullar. */
const demoPendingResults = () => DEMO_VISITS
    .filter(v => v.status === 'AwaitingResults' || v.status === 'In Progress')
    .map((v, i) => ({
        visitId: v.id,
        patientId: v.patientId,
        patientName: demoName(v.patientId),
        department: DEMO_DEPARTMENTS.find(d => d.id === v.departmentId)?.name || '',
        date: v.date,
        unseenCount: i === 0 ? 2 : 0,
        stillPending: i === 0 ? 0 : 1,
    }));

/** Ko'rsatkich dinamikasi — shu bemorning o'z demo natijalaridan
 *  (server `/patients/:id/lab-dynamics` bilan bir xil shakl). Natija
 *  yo'q bo'lsa bo'sh: hamma bemorda bir xil soxta raqam chiqmasin. */
const demoLabDynamics = (patientId: string) => {
    const byParam = new Map<string, any>();
    const orders = DEMO_LAB_ORDERS
        .filter(o => o.patientId === patientId && o.status === 'Completed'
            && (DEMO_ORDER_ITEMS[o.id] || o.items?.length))
        .sort((a, b) => String(a.completedAt || a.orderedAt || '').localeCompare(String(b.completedAt || b.orderedAt || '')));
    for (const o of orders) {
        const full = demoLabResults(o.id);
        for (const it of full.items) {
            for (const p of it.parameters) {
                if (p.valueNum == null) continue;
                if (!byParam.has(p.parameterId)) {
                    byParam.set(p.parameterId, {
                        parameterId: p.parameterId, name: p.name, unit: p.unit,
                        refLow: p.refLow, refHigh: p.refHigh, testName: it.testName,
                        points: [] as { at: string; value: number; flag: string | null }[],
                    });
                }
                byParam.get(p.parameterId).points.push({
                    at: o.completedAt || o.orderedAt, value: p.valueNum, flag: p.flag,
                });
            }
        }
    }
    const series = Array.from(byParam.values()).map((s: any) => {
        const pts = s.points;
        const last = pts[pts.length - 1];
        const prev = pts.length > 1 ? pts[pts.length - 2] : null;
        return {
            ...s, count: pts.length,
            last: last?.value ?? null, lastAt: last?.at ?? null, lastFlag: last?.flag ?? null,
            delta: prev ? Math.round((last.value - prev.value) * 100) / 100 : null,
        };
    });
    // Server tartibi: normadan chetdagilar tepada, keyin o'lchovi ko'plar
    const bad = (s: any) => (s.lastFlag && s.lastFlag !== 'Normal' ? 1 : 0);
    return series.sort((a, b) => bad(b) - bad(a) || b.count - a.count);
};

/** `/api/reports/services` javobi (`backend/serviceReport.ts`) */
export interface ServiceReportRow {
    key: string;
    serviceId: number | null;
    name: string;
    /** Service | Lab | Study | Medication | Bed | Other */
    source: string;
    departmentId: string | null;
    count: number;
    revenue: number;
    discount: number;
    listPrice: number | null;
    /** null — material (retsept) kiritilmagan */
    materialCost: number | null;
    prevRevenue: number;
    prevCount: number;
}
export interface ServiceReport {
    range: { from: string; to: string };
    previous: { from: string; to: string } | null;
    totals: { revenue: number; discount: number; prevRevenue: number };
    /** Bo'lim id (yoki 'none') → o'tgan davrning HAMMA xizmatlari summasi */
    prevByDepartment: Record<string, number>;
    departments: { id: string; name: string; color: string | null }[];
    services: ServiceReportRow[];
    unsold: { serviceId: number; name: string; departmentId: string | null; listPrice: number }[];
}

/** `/api/reports/patients` javobi (`backend/patientVisits.ts`) */
export interface PatientReport {
    range: { from: string; to: string };
    previous: { from: string; to: string };
    current: { visited: number; new: number; returning: number };
    prev: { visited: number; new: number; returning: number };
    lost: {
        months: number; total: number; withTelegram: number;
        patients: { patientId: string; patientName: string; phone: string | null; lastVisit: string; lastDoctor: string | null; nextAppointment: string | null }[];
    };
    newByDoctor: { doctorId: string | null; doctorName: string; newPatients: number; cameBack: number }[];
}

/** Solishtirish davri — `backend/period.ts` ning nusxasi. Umumiy va Bemorlar
    tabi bitta qoidadan: «1–26 noyabr» ↔ «1–26 oktyabr». */
const demoPreviousPeriod = (from: string, to: string): { from: string; to: string } => {
    const len = Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1);
    const fromT = Date.parse(`${from}T00:00:00Z`);
    let prevTo = new Date(fromT - 864e5).toISOString().slice(0, 10);
    let prevFrom = new Date(fromT - len * 864e5).toISOString().slice(0, 10);
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    if (fd === 1 && fy === ty && fm === tm) {
        const py = fm === 1 ? fy - 1 : fy;
        const pm = fm === 1 ? 12 : fm - 1;
        const lastPrev = new Date(Date.UTC(py, pm, 0)).getUTCDate();
        const pad = (n: number) => String(n).padStart(2, '0');
        prevFrom = `${py}-${pad(pm)}-01`;
        const lastCur = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
        prevTo = `${py}-${pad(pm)}-${pad(td >= lastCur ? lastPrev : Math.min(td, lastPrev))}`;
    }
    return { from: prevFrom, to: prevTo };
};

/** Bemorlar hisoboti — server qoidasi bilan (`backend/patientVisits.ts`).
    Demoda «qabul» — to'lov qatori (`DEMO_TRANSACTIONS`) va bugungi navbat
    (`DEMO_VISITS`); «yo'qolgan» — `lastVisit` bo'yicha, Xabarlardagi
    «6 oydan beri kelmagan» segmenti (`demoAudience`) bilan bir xil. */
const demoPatientReport = (from: string, to: string): PatientReport => {
    const today = todayISO();
    const { from: prevFrom, to: prevTo } = demoPreviousPeriod(from, to);

    const visits = [
        ...DEMO_TRANSACTIONS.map(t => ({ patientId: (t as any).patientId as string, date: String(t.date).slice(0, 10), doctorId: (t as any).doctorId || null, doctorName: t.doctorName || null })),
        ...DEMO_VISITS.map(v => ({ patientId: v.patientId, date: String(v.date).slice(0, 10), doctorId: v.doctorId || null, doctorName: v.doctorName || null })),
    ].filter(v => v.patientId).sort((a, b) => a.date.localeCompare(b.date));
    const createdDay = (id: string) => String((DEMO_PATIENTS.find(p => p.id === id) as any)?.createdAt || '2025-01-01').slice(0, 10);

    const counts = (a: string, b: string) => {
        const inP = visits.filter(v => v.date >= a && v.date <= b);
        const ids = [...new Set(inP.map(v => v.patientId))];
        const newIds = ids.filter(id => createdDay(id) >= a && !visits.some(v => v.patientId === id && v.date < a));
        return { inP, newIds, c: { visited: ids.length, new: newIds.length, returning: ids.length - newIds.length } };
    };
    const cur = counts(from, to);
    const prev = counts(prevFrom, prevTo);

    const byDoc = new Map<string, PatientReport['newByDoctor'][number]>();
    for (const id of cur.newIds) {
        const first = cur.inP.find(v => v.patientId === id)!;
        const key = first.doctorId || 'none';
        const row = byDoc.get(key) || { doctorId: first.doctorId, doctorName: (first.doctorName || "Belgilanmagan").replace(/^Dr\.\s*/, ''), newPatients: 0, cameBack: 0 };
        row.newPatients++;
        if (new Set(visits.filter(v => v.patientId === id).map(v => v.date)).size >= 2) row.cameBack++;
        byDoc.set(key, row);
    }

    const [cy, cm, cd] = today.split('-').map(Number);
    const cut = new Date(Date.UTC(cy, cm - 1, cd));
    cut.setUTCMonth(cut.getUTCMonth() - 6);
    const cutoff = cut.toISOString().slice(0, 10);
    const lost = DEMO_PATIENTS
        .filter(p => p.status === 'Active' && /^\d{4}-\d{2}-\d{2}/.test(p.lastVisit || '') && p.lastVisit.slice(0, 10) <= cutoff)
        .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
    const lastDoctor = (id: string) => {
        const own = [...visits].reverse().find(v => v.patientId === id)?.doctorName;
        if (own) return own.replace(/^Dr\.\s*/, '');
        const d = DEMO_DOCTORS.find(x => x.id === (DEMO_PATIENTS.find(p => p.id === id) as any)?.doctorId);
        return d ? `${d.firstName} ${d.lastName}` : null;
    };
    const nextAppt = (id: string) => DEMO_APPOINTMENTS.filter(a => a.patientId === id && a.date > today && a.status !== 'Cancelled')
        .sort((a, b) => a.date.localeCompare(b.date))[0]?.date || null;

    return {
        range: { from, to },
        previous: { from: prevFrom, to: prevTo },
        current: cur.c,
        prev: prev.c,
        lost: {
            months: 6,
            total: lost.length,
            withTelegram: lost.filter(p => !!p.telegramChatId).length,
            patients: lost.map(p => ({
                patientId: p.id, patientName: `${p.firstName} ${p.lastName}`, phone: p.phone || null,
                lastVisit: p.lastVisit.slice(0, 10), lastDoctor: lastDoctor(p.id), nextAppointment: nextAppt(p.id),
            })),
        },
        newByDoctor: [...byDoc.values()].sort((a, b) => b.newPatients - a.newPatients),
    };
};

/** Davomat hisoboti — server shaklida (`backend/reports.ts` → /reports/attendance).

    2026-11-26: ilgari bu yerda davrga qaramaydigan o'n to'rt kunlik qolip
    turardi va shakli serverniki emas edi: `doctorName` o'rniga `name`,
    hafta kunida `weekday`/`days`/`noShow` yo'q, `range` yo'q. Natijada
    namoyishda shifokorlar grafigi bo'sh, jadval nollar, sarlavhada
    «— · kunda yozuv bor». Endi har kun sanadan barqaror hisoblanadi. */
const demoAttendance = (from: string, to: string) => {
    const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
    const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const end = to > todayISO() ? todayISO() : to;
    const WD_BASE = [3, 9, 8, 10, 7, 11, 6]; // yakshanba … shanba
    const WD_NAMES = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

    const byDay: { date: string; booked: number; arrived: number; noShow: number; cancelled: number; revenue: number; visits: number }[] = [];
    for (let d = parse(from), n = 0; isoOf(d) <= end && n < 400; d.setDate(d.getDate() + 1), n++) {
        const key = Math.floor(d.getTime() / 864e5);
        const booked = WD_BASE[d.getDay()] + (key % 3);
        const noShow = booked > 3 ? (key % 4 === 0 ? 2 : 1) : 0;
        const cancelled = key % 5 === 0 ? 1 : 0;
        const arrived = Math.max(0, booked - noShow - cancelled);
        byDay.push({ date: isoOf(d), booked, arrived, noShow, cancelled, revenue: 0, visits: arrived });
    }
    const sum = (k: 'booked' | 'arrived' | 'noShow' | 'cancelled') => byDay.reduce((a, d) => a + d[k], 0);
    const booked = sum('booked'), arrived = sum('arrived'), noShow = sum('noShow'), cancelled = sum('cancelled');

    const byWeekday = [1, 2, 3, 4, 5, 6, 0].map(w => {
        const rows = byDay.filter(d => parse(d.date).getDay() === w);
        const a = rows.reduce((s, d) => s + d.arrived, 0);
        return {
            weekday: w, name: WD_NAMES[w], days: rows.length,
            booked: rows.reduce((s, d) => s + d.booked, 0), arrived: a,
            noShow: rows.reduce((s, d) => s + d.noShow, 0),
            avgVisits: rows.length ? Math.round((a / rows.length) * 10) / 10 : 0, avgRevenue: 0,
        };
    });
    const ranked = byWeekday.filter(w => w.days > 0).sort((a, b) => b.avgVisits - a.avgVisits);

    const HOUR_W = [7, 9, 11, 8, 4, 6, 10, 8, 5, 2];
    const wSum = HOUR_W.reduce((a, b) => a + b, 0);
    const byHour = HOUR_W.map((w, i) => {
        const b = Math.round((booked * w) / wSum);
        return { hour: 9 + i, booked: b, arrived: Math.round((arrived * w) / wSum) };
    });
    const DOC_W = [0.34, 0.28, 0.22, 0.16];
    const byDoctor = DEMO_DOCTORS.slice(0, DOC_W.length).map((d, i) => {
        const b = Math.round(booked * DOC_W[i]);
        const ns = Math.round(noShow * [0.2, 0.25, 0.15, 0.4][i]);
        return { doctorId: d.id, doctorName: `${d.firstName} ${d.lastName}`, booked: b, arrived: Math.max(0, b - ns - (i === 0 ? 1 : 0)), noShow: ns };
    });

    return {
        range: { from, to, days: byDay.length },
        totals: {
            booked, arrived, noShow, cancelled, revenue: 0,
            arrivalRate: booked ? Math.round((arrived / booked) * 100) : 0,
            noShowRate: booked ? Math.round((noShow / booked) * 100) : 0,
        },
        byDay, byWeekday, byHour, byDoctor,
        best: ranked[0] || null, worst: ranked[ranked.length - 1] || null,
    };
};

/** Hisobot → Ombor isrofi (server shaklida: sabab kalitlari `Expired`,
    `Service` …). Ilgari sabab `Out` edi — ekran uni isrof deb qizil
    yozardi; pozitsiyalarda esa «0 ampula — 120 000» kabi soxta qator
    turardi. Endi pozitsiyalar yig'indisi plitkalar bilan bir xil. */
const demoWriteoffs = () => {
    const items = DEMO_INVENTORY.slice(0, 6).map((it, i) => ({
        itemId: it.id, name: it.name, unit: (it as any).unit || 'dona',
        qty: [12, 10, 8, 6, 4, 3][i], cost: [520000, 430000, 380000, 290000, 240000, 340000][i],
    }));
    const totalCost = items.reduce((s, i) => s + i.cost, 0);
    const wasteCost = 340000;
    return {
        wasteCost,
        serviceCost: totalCost - wasteCost,
        totalCost,
        movementCount: 12,
        byReason: [
            { reason: 'Service', label: 'Xizmatga ishlatilgan', count: 9, cost: totalCost - wasteCost },
            { reason: 'Expired', label: "Muddati o'tgan", count: 3, cost: wasteCost },
        ],
        byItem: items.sort((a, b) => b.cost - a.cost),
    };
};

/** Hisobot → Bo'limlar.
    Umumiy tab bilan BITTA manba — `demoReportSummary` (2026-11-23, Moliya
    rejasi 5-vazifa). Ilgari bu yerda o'ylab topilgan raqamlar turardi:
    Umumiy «Xizmatlar 3,1 mln», Bo'limlar yig'indisi «12,6 mln». */
const demoDepartmentsReport = (from?: string, to?: string) => {
    const summary = demoReportSummary(from, to);
    const rows = new Map<string, any>();
    const ensure = (id: string | null) => {
        const key = id || 'none';
        if (!rows.has(key)) {
            const d = DEMO_DEPARTMENTS.find(x => x.id === id);
            rows.set(key, {
                departmentId: id, name: d?.name || "Bo'limsiz", color: d?.color || null,
                revenue: 0, paid: 0, expense: 0, profit: 0, patients: 0, checks: 0, avgCheck: 0,
            });
        }
        return rows.get(key);
    };
    for (const d of summary.byDepartment) {
        const r = ensure(d.departmentId || null);
        r.revenue += d.revenue; r.paid += d.collected;
    }
    for (const e of DEMO_EXPENSES.filter(x => inRange(x.date as any, from, to) && x.category !== 'Lab')) {
        const r = ensure((e as any).departmentId || null);
        r.expense += e.amount || 0;
    }
    /* Bemorlar va o'rtacha chek — server qoidasi: demoda bitta to'lov qatori = bitta chek */
    const allPatients = new Set<string>();
    const perDept = new Map<string, Set<string>>();
    for (const t of DEMO_TRANSACTIONS.filter(x => inRange(x.date as any, from, to))) {
        const dep = demoDeptOfDoctor((t as any).doctorId);
        const r = ensure(dep);
        r.checks += 1;
        const pid = (t as any).patientId || t.patientName;
        allPatients.add(pid);
        const set = perDept.get(dep || 'none') || new Set<string>();
        set.add(pid);
        perDept.set(dep || 'none', set);
    }
    for (const [k, r] of rows) {
        r.profit = r.revenue - r.expense;
        r.patients = perDept.get(k)?.size || 0;
        r.avgCheck = r.checks > 0 ? Math.round(r.revenue / r.checks) : 0;
    }
    /* Koyka-kun statsionar qatorida ham — ilgari plitka «34 koyka-kun»
       derdi, ustun esa butunlay «—» edi. */
    const inp = rows.get('demo-inp');
    if (inp) inp.bedDays = 34;
    return {
        departments: Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue),
        totals: {
            revenue: Array.from(rows.values()).reduce((a, r) => a + r.revenue, 0),
            paid: Array.from(rows.values()).reduce((a, r) => a + r.paid, 0),
            expense: Array.from(rows.values()).reduce((a, r) => a + r.expense, 0),
            profit: Array.from(rows.values()).reduce((a, r) => a + r.profit, 0),
            occupancy: 62,
            bedDays: 34,
            bedCount: DEMO_BEDS.length,
            patients: allPatients.size,
        },
    };
};

const demoDeptOfDoctor = (doctorId?: string) => DEMO_DOCTORS.find(d => d.id === doctorId)?.departmentId || null;

/** Hisobot → Xizmatlar — server qoidasi bilan (`backend/serviceReport.ts`).
    Demoda «xizmat qatori» — to'lov qatori; bo'lim — shifokorning bo'limi
    (Umumiy va Bo'limlar ham shunday), material — demo retseptlaridan
    (Sozlamalarda to'ldirilsa shu yerda ko'rinadi). */
const demoServiceReport = (from: string, to: string): ServiceReport => {
    const prev = demoPreviousPeriod(from, to);
    const byName = new Map(DEMO_SERVICES.map(sv => [sv.name.trim().toLowerCase(), sv]));
    const recipeCost = new Map<number, number>();
    for (const r of DEMO_RECIPES) recipeCost.set(r.serviceId, (recipeCost.get(r.serviceId) || 0) + (demoItem(r.itemId)?.price || 0) * r.quantity);
    const rows = new Map<string, ServiceReportRow & { list: number }>();
    const keyOf = (t: Transaction) => {
        const svc = byName.get(String(t.service || '').trim().toLowerCase());
        return { svc, key: `${svc ? `svc:${svc.id}` : `name:${t.service}`}|${demoDeptOfDoctor((t as any).doctorId) || ''}` };
    };
    for (const t of DEMO_TRANSACTIONS.filter(x => inRange(x.date as any, from, to))) {
        const { svc, key } = keyOf(t);
        let r = rows.get(key);
        if (!r) {
            r = {
                key, serviceId: svc?.id ?? null, name: svc?.name || t.service || '—', source: 'Service',
                departmentId: demoDeptOfDoctor((t as any).doctorId), count: 0, revenue: 0, discount: 0,
                listPrice: svc?.price ?? null, materialCost: svc && recipeCost.has(svc.id as number) ? 0 : null,
                prevRevenue: 0, prevCount: 0, list: 0,
            };
            rows.set(key, r);
        }
        r.count += 1;
        r.revenue += t.amount || 0;
        r.list += (t.amount || 0) + ((t as any).discountAmount || 0);
        if (r.materialCost != null && svc) r.materialCost += recipeCost.get(svc.id as number) || 0;
    }
    const prevByDepartment: Record<string, number> = {};
    for (const t of DEMO_TRANSACTIONS.filter(x => inRange(x.date as any, prev.from, prev.to))) {
        const dk = demoDeptOfDoctor((t as any).doctorId) || 'none';
        prevByDepartment[dk] = (prevByDepartment[dk] || 0) + (t.amount || 0);
        const r = rows.get(keyOf(t).key);
        if (!r) continue;
        r.prevRevenue += t.amount || 0;
        r.prevCount += 1;
    }
    const services = Array.from(rows.values())
        .map(({ list, ...r }) => ({ ...r, discount: Math.max(0, list - r.revenue) }))
        .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
    const sold = new Set(services.map(r => r.serviceId));
    return {
        range: { from, to },
        previous: prev,
        totals: {
            revenue: services.reduce((a, r) => a + r.revenue, 0),
            discount: services.reduce((a, r) => a + r.discount, 0),
            prevRevenue: Object.values(prevByDepartment).reduce((a, v) => a + v, 0),
        },
        prevByDepartment,
        departments: DEMO_DEPARTMENTS.map(d => ({ id: d.id, name: d.name, color: d.color || null })),
        services,
        unsold: DEMO_SERVICES.filter(sv => sv.id != null && !sold.has(sv.id))
            .map(sv => ({ serviceId: sv.id as number, name: sv.name, departmentId: sv.departmentId || null, listPrice: sv.price }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    };
};
/** Kirish jurnali — kim, qachon, nimaga qaradi. */
const demoAccessLog = () => {
    const actions = ['VIEW', 'CREATE', 'UPDATE', 'PRINT', 'EXPORT'];
    const entities = ['Patient', 'Visit', 'Charge', 'LabOrder', 'Prescription'];
    const users = [
        { userName: 'Demo Admin', userRole: 'CLINIC_ADMIN' },
        { userName: 'Kamola Ahmedova', userRole: 'DOCTOR' },
        { userName: 'Registratura', userRole: 'RECEPTIONIST' },
    ];
    const items = Array.from({ length: 12 }, (_, i) => ({
        id: `demo-log-${i + 1}`,
        at: dayShift(-(i / 3)),
        ...users[i % users.length],
        action: actions[i % actions.length],
        entityType: entities[i % entities.length],
        patientName: demoName(`demo-patient-${(i % 9) + 6}`),
    }));
    return { items, total: items.length, truncated: false, retentionMonths: 24 };
};

/** Zaxira nusxalar ro'yxati — Sozlamalar → Ekspluatatsiya. */
const DEMO_BACKUPS = Array.from({ length: 5 }, (_, i) => ({
    file: `xclinic-${dayShift(-i).slice(0, 10).replace(/-/g, '')}-0300.db`,
    sizeBytes: 1_100_000 + i * 45_000,
    createdAt: dayShift(-i),
    hasUploads: i % 2 === 0,
    note: i === 0 ? 'Avtomatik (kunlik)' : null,
}));

/** Qabul bayoni shablonlari — bo'limga qarab tanlanadi. */
const DEMO_ENCOUNTER_TEMPLATES: EncounterTemplate[] = [
    {
        id: 'demo-tpl-1', clinicId: 'demo-clinic-1', departmentId: 'demo-ter',
        name: 'Terapevtik ko’rik', isDefault: false, gender: null, minAge: null, maxAge: null,
        fields: [
            { key: 'history', label: 'Kasallik tarixi', type: 'text', group: 'Anamnez' },
            { key: 'temperature', label: 'Harorat', type: 'number', unit: '°C', group: 'Ko’rik' },
            { key: 'bp', label: 'Qon bosimi', type: 'text', unit: 'mm sim.ust.', group: 'Ko’rik' },
            { key: 'conclusion', label: 'Xulosa', type: 'text', group: 'Yakun' },
        ],
    },
    {
        id: 'demo-tpl-2', clinicId: 'demo-clinic-1', departmentId: 'demo-ter',
        name: 'Stomatologik ko’rik', isDefault: true, gender: null, minAge: null, maxAge: null,
        fields: [
            { key: 'tooth', label: 'Tish raqami', type: 'text', group: 'Ko’rik' },
            { key: 'caries', label: 'Karies darajasi', type: 'select', options: ['Yo’q', 'Boshlang’ich', 'O’rta', 'Chuqur'], group: 'Ko’rik' },
            { key: 'plan', label: 'Davolash rejasi', type: 'text', group: 'Yakun' },
        ],
    },
    {
        id: 'demo-tpl-3', clinicId: 'demo-clinic-1', departmentId: 'demo-inp',
        name: 'Statsionar kunlik ko’rik', isDefault: false, gender: null, minAge: null, maxAge: null,
        fields: [
            { key: 'state', label: 'Umumiy holati', type: 'select', options: ['Qoniqarli', 'O’rta og’ir', 'Og’ir'], group: 'Ko’rik' },
            { key: 'temperature', label: 'Harorat', type: 'number', unit: '°C', group: 'Ko’rik' },
            { key: 'plan', label: 'Tayinlov', type: 'text', group: 'Yakun' },
        ],
    },
    {
        id: 'demo-tpl-4', clinicId: 'demo-clinic-1', departmentId: 'demo-kard',
        name: 'Kardiologik ko’rik', isDefault: true, gender: null, minAge: null, maxAge: null,
        fields: [
            { key: 'bp', label: 'Qon bosimi', type: 'text', unit: 'mm sim.ust.', group: 'Ko’rik' },
            { key: 'pulse', label: 'Puls', type: 'number', unit: 'urish/daq', group: 'Ko’rik' },
            { key: 'heart', label: 'Yurak tonlari', type: 'select', options: ['Aniq, ritmik', 'Bo’g’iq', 'Aritmik'], group: 'Ko’rik' },
            { key: 'edema', label: 'Shishlar', type: 'select', options: ['Yo’q', 'Oyoqlarda', 'Umumiy'], group: 'Ko’rik' },
            { key: 'conclusion', label: 'Xulosa', type: 'text', group: 'Yakun' },
        ],
    },
    {
        id: 'demo-tpl-5', clinicId: 'demo-clinic-1', departmentId: 'demo-endo',
        name: 'Endokrinologik ko’rik', isDefault: true, gender: null, minAge: null, maxAge: null,
        fields: [
            { key: 'weight', label: 'Vazn', type: 'number', unit: 'kg', group: 'Ko’rik' },
            { key: 'height', label: 'Bo’y', type: 'number', unit: 'sm', group: 'Ko’rik' },
            { key: 'glucose', label: 'Qand (glyukometr)', type: 'number', unit: 'mmol/l', group: 'Ko’rik' },
            { key: 'thyroid', label: 'Qalqonsimon bez', type: 'select', options: ['O’zgarishsiz', 'Kattalashgan', 'Tugun bor'], group: 'Ko’rik' },
            { key: 'conclusion', label: 'Xulosa', type: 'text', group: 'Yakun' },
        ],
    },
];

/** Kassa ekrani: to'lanmagan qatorlar bemor bo'yicha guruhlanadi. */
const demoPendingPatients = (): PendingPatient[] => {
    const byPatient = new Map<string, PendingPatient>();
    DEMO_CHARGES.filter(c => c.status === 'Unpaid').forEach(c => {
        const key = c.patientId || c.patientName;
        if (!byPatient.has(key)) {
            byPatient.set(key, { patientId: c.patientId, patientName: c.patientName, due: 0, items: [] });
        }
        const g = byPatient.get(key)!;
        g.due += c.total - c.paidAmount;
        g.items.push(c);
    });
    return [...byPatient.values()];
};

/** Bitta qabulning hisob qatorlari va yakuni. */
const demoVisitCharges = (visitId: string) => {
    /* Server xizmat qatorining `sourceId` siga muolaja id sini yozadi. Demoda
       muolaja alohida saqlanmaydi — qatorning o'zi muolaja (`demoVisitFull`),
       shuning uchun varaq ularni bir-biriga bog'lay olishi uchun id bir xil. */
    const charges = DEMO_CHARGES.filter(c => c.visitId === visitId)
        .map(c => (c.source === 'Service' ? { ...c, sourceId: c.id } : c));
    const total = charges.reduce((s, c) => s + c.total, 0);
    const paid = charges.reduce((s, c) => s + c.paidAmount, 0);
    return {
        charges,
        summary: {
            total, paid, due: total - paid,
            unpaidCount: charges.filter(c => c.status === 'Unpaid').length,
        } as ChargeSummary,
    };
};

/* ── DEMO: QABUL — ICHIDAGILARI BILAN ────────────────────────────────────
   Server qabulni tashxis, xizmat, yo'llanma va retseptlari bilan qaytaradi
   (`include`). Demoda ular alohida to'plamlarda yotadi; shu yerda
   bog'lanmasa bemor kartasidagi varaqda yozilgan narsa ko'rinmasdi:
   «tahlil buyurdim — hech narsa o'zgarmadi». Har safar YANGI obyekt
   qaytadi, ya'ni ekran o'zgarishni ko'radi. */
const demoVisitFull = (v: Visit): Visit => ({
    ...v,
    department: DEMO_DEPARTMENTS.find(d => d.id === v.departmentId),
    diagnoses: DEMO_DIAGNOSES.filter(d => d.visitId === v.id),
    procedures: DEMO_CHARGES
        .filter(c => c.visitId === v.id && c.source === 'Service' && c.status !== 'Cancelled')
        .map(c => ({ id: c.id, visitId: v.id, procedureName: c.name, finalPrice: c.total }) as NonNullable<Visit['procedures']>[number]),
    labOrders: DEMO_LAB_ORDERS.filter(o => o.visitId === v.id),
    studies: DEMO_STUDIES.filter(s => s.visitId === v.id),
    prescriptions: DEMO_PRESCRIPTIONS.filter(p => p.visitId === v.id),
    /* Yo'naltirishning ikki tomoni — serverdagi `REFERRAL_VISIT_SELECT` shakli */
    referredFrom: v.referredFromVisitId ? demoReferralVisit(DEMO_VISITS.find(x => x.id === v.referredFromVisitId)) : null,
    referredVisits: DEMO_VISITS.filter(x => x.referredFromVisitId === v.id).map(x => demoReferralVisit(x)!),
});

/** Demo: serverdagi `resolveReferral` — kim yuborgani yuboruvchi qabuldan olinadi */
function demoReferral(data: Partial<Visit>): Partial<Visit> {
    if (data.referralSource === 'External') {
        return { referralSource: 'External', referredByName: data.referredByName || null, referralReason: data.referralReason || null };
    }
    if (data.referralSource !== 'Internal') return {};
    const from = DEMO_VISITS.find(v => v.id === data.referredFromVisitId);
    if (!from) return {};
    const dep = DEMO_DEPARTMENTS.find(d => d.id === from.departmentId);
    return {
        referralSource: 'Internal', referredFromVisitId: from.id,
        referredByName: [from.doctorName, dep ? `(${dep.name})` : ''].filter(Boolean).join(' ') || null,
        referralReason: data.referralReason || null,
    };
}

function demoReferralVisit(v?: Visit): ReferralVisit | null {
    if (!v) return null;
    const dep = DEMO_DEPARTMENTS.find(d => d.id === v.departmentId);
    return {
        id: v.id, date: v.date, status: v.status, doctorName: v.doctorName, treatmentPlan: v.treatmentPlan,
        department: dep ? { id: dep.id, name: dep.name } : null,
        diagnoses: DEMO_DIAGNOSES.filter(d => d.visitId === v.id)
            .map(d => ({ id: d.id, code: d.code, kind: d.kind, icd10: d.icd10 ? { name: d.icd10.name } : null })),
    };
}

/* ── DEMO: SHU FAYLDAGI TO'PLAMLARNI SAQLASH ─────────────────────────────
   `demoData.ts` dagi ro'yxatlar (bemor, qabul, chek, ombor) brauzerda
   saqlanadi — `saveDemoData()`. Shu fayldagilar esa saqlanmasdi va sahifa
   yangilanganda boshlang'ich holatga qaytardi.

   Bu ZIDDIYAT tug'dirardi, chunki ikkala to'plam BOG'LIQ. Misol: kassada
   90 000 so'm qabul qilinadi — chek `DEMO_TRANSACTIONS` ga tushib saqlanadi,
   hisob qatorining «to'landi» belgisi esa shu yerda qolib, yangilashda
   yo'qolardi. Natijada pul ham olingan, qarz ham joyida ko'rinardi.
   Xuddi shu narsa omborda: qoldiq oshgan, lekin «Harakatlar» ro'yxatida
   o'sha kirim yo'q.

   Shuning uchun bu to'plamlar ham saqlanadi — alohida kalit ostida, chunki
   ular `demoData.ts` ga ko'rinmaydi. Xatolik (kvota, xususiy oyna) butun
   ilovani yiqitmasligi kerak: hamma amal `try` ichida. */
const DEMO_STATE_KEY = 'xclinic_demo_state';
const DEMO_STATE_VERSION = 1;

/** O'rnida almashtirish: massivlar boshqa joylarda havola bo'yicha
 *  ishlatiladi, shuning uchun yangisini tayinlab bo'lmaydi. */
const replaceAll = <T,>(target: T[], next: unknown) => {
    if (!Array.isArray(next)) return;
    target.splice(0, target.length, ...(next as T[]));
};

/* `demoData.ts` dagi to'plam versiyasi. Ikkala saqlanma BIR BUTUN: bu
   yerdagi hisob qatorlari o'sha yerdagi qabul va bemorlarga id bo'yicha
   bog'langan. Demo to'plami yangilanib, u yerdagi nusxa tashlansa, bu
   yerdagisi ham tashlanishi kerak — aks holda mavjud bo'lmagan bemorga
   tegishli qarz qatorlari qolib ketadi. */
const demoDataVersion = () => {
    try { return localStorage.getItem('xclinic_demo_version') || ''; } catch { return ''; }
};

const saveDemoState = () => {
    if (!isDemoMode()) return;
    try {
        localStorage.setItem(DEMO_STATE_KEY, JSON.stringify({
            v: DEMO_STATE_VERSION,
            dataV: demoDataVersion(),
            charges: DEMO_CHARGES, departments: DEMO_DEPARTMENTS,
            stockMoves: DEMO_STOCK_MOVES, batches: DEMO_BATCHES,
            studies: DEMO_STUDIES, prescriptions: DEMO_PRESCRIPTIONS,
            labTests: DEMO_LAB_TESTS, templates: DEMO_ENCOUNTER_TEMPLATES,
            recipes: DEMO_RECIPES, orderItems: DEMO_ORDER_ITEMS,
            resultValues: DEMO_RESULT_VALUES,
        }));
    } catch { /* saqlanmasa ham sessiya davomida ishlayveradi */ }
};

/** Saqlangan holatni tiklash — modul yuklanganda BIR MARTA. */
(function restoreDemoState() {
    try {
        const raw = typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_STATE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        /* Versiya mos kelmasa — tashlab yuboramiz. Yangi demo chiqarilganda
           eski shakldagi yozuv ekranni buzmasin (`demoData.ts` dagi bilan
           bir xil qoida). */
        if (s?.v !== DEMO_STATE_VERSION || s?.dataV !== demoDataVersion()) {
            localStorage.removeItem(DEMO_STATE_KEY); return;
        }
        replaceAll(DEMO_CHARGES, s.charges);
        replaceAll(DEMO_DEPARTMENTS, s.departments);
        replaceAll(DEMO_STOCK_MOVES, s.stockMoves);
        replaceAll(DEMO_BATCHES, s.batches);
        replaceAll(DEMO_STUDIES, s.studies);
        replaceAll(DEMO_PRESCRIPTIONS, s.prescriptions);
        replaceAll(DEMO_LAB_TESTS, s.labTests);
        replaceAll(DEMO_ENCOUNTER_TEMPLATES, s.templates);
        /* «Shikoyatlar» maydoni varaqning o'z «Shikoyat» maydonini takrorlardi
           (2026-11-20 da shablondan olib tashlandi). Brauzerda saqlangan eski
           nusxada u qolib ketmasin. */
        DEMO_ENCOUNTER_TEMPLATES.forEach(tpl => {
            if (tpl.id === 'demo-tpl-1') tpl.fields = (tpl.fields || []).filter(f => f.key !== 'complaints');
        });
        replaceAll(DEMO_RECIPES, s.recipes);
        if (s.orderItems) Object.assign(DEMO_ORDER_ITEMS, s.orderItems);
        if (s.resultValues) Object.assign(DEMO_RESULT_VALUES, s.resultValues);
    } catch { try { localStorage.removeItem(DEMO_STATE_KEY); } catch { /* ignore */ } }
})();

/* ── DEMO: BITTA BEMORNING TO'LIQ KARTASI ────────────────────────────────
   Namoyishda bemor kartasi birinchi ochiladigan ekranlardan. Qabullar faqat
   bugungi sana bilan yasalgani uchun u deyarli bo'sh ko'rinardi: tarix yo'q,
   natija yo'q, marshrut yo'q — karta nimaga yarashi ko'rinmasdi.

   Shu sababli birinchi bemorga to'liq hikoya beriladi: bugun tahlil
   topshirgan (natija tayyor, ikkitasi me'yordan chetda), rentgenga
   yo'llangan (hali to'lanmagan), surunkali kasalligi, allergiyasi va oldingi
   tashriflari bor.

   Tiklashdan KEYIN ishlaydi. Yo'llanma va tekshiruv har yuklanishda yangidan
   yoziladi (qabullar ham shunday — vaqtlar «hozir»dan sanaladi); hisob
   qatori, tashxis va retsept esa faqat bo'lmasa qo'shiladi — foydalanuvchi
   namoyishda to'lagan pul qaytib «to'lanmagan» bo'lib qolmasin. */
(function seedDemoPatientCard() {
    const patientId = 'demo-patient-1';
    const visit = DEMO_VISITS.find(v => v.patientId === patientId);
    if (!visit) return;

    const clinicId = 'demo-clinic-1';
    const patientName = demoName(patientId);
    const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
    const put = <T extends { id: string }>(list: T[], row: T) => {
        const i = list.findIndex(x => x.id === row.id);
        if (i === -1) list.push(row); else list[i] = row;
    };
    const addOnce = <T extends { id: string }>(list: T[], row: T) => {
        if (!list.some(x => x.id === row.id)) list.push(row);
    };

    // ── Bugun: tahlil natijasi tayyor
    const orderId = 'demo-order-card-1';
    put(DEMO_LAB_ORDERS, {
        id: orderId, clinicId, patientId, patientName, visitId: visit.id,
        doctorName: visit.doctorName || '', status: 'Completed', priority: 'Normal',
        orderedAt: minsAgo(70), sampleCollectedAt: minsAgo(62), completedAt: minsAgo(24),
        totalPrice: 75000,
        items: [
            { id: `${orderId}-i1`, orderId, testId: 'demo-lt-1', testName: 'Umumiy qon tahlili', price: 45000, status: 'Completed' },
            { id: `${orderId}-i2`, orderId, testId: 'demo-lt-2', testName: 'Qandli diabet (glyukoza)', price: 30000, status: 'Completed' },
        ],
    } as LabOrder);
    DEMO_ORDER_ITEMS[orderId] = [{ id: `${orderId}-i1`, testId: 'demo-lt-1' }, { id: `${orderId}-i2`, testId: 'demo-lt-2' }];
    Object.assign(DEMO_RESULT_VALUES, {
        [`${orderId}-i1:demo-lt-1-p1`]: { value: '108' },   // gemoglobin — past
        [`${orderId}-i1:demo-lt-1-p2`]: { value: '4.1' },
        [`${orderId}-i1:demo-lt-1-p3`]: { value: '6.2' },
        [`${orderId}-i1:demo-lt-1-p4`]: { value: '250' },
        [`${orderId}-i1:demo-lt-1-p5`]: { value: '12' },
        [`${orderId}-i2:demo-lt-2-p1`]: { value: '7.8' },   // glyukoza — baland
    });

    // ── Bugun: EKG ga yo'llangan, hali bajarilmagan (kardiolog qabuli)
    put(DEMO_STUDIES, {
        id: 'demo-study-card-1', clinicId, patientId, patientName, visitId: visit.id,
        departmentId: 'demo-diag', modality: 'EKG', name: 'Elektrokardiogramma (EKG)',
        status: 'Ordered', orderedByName: visit.doctorName || null, performedByName: null,
        orderedAt: minsAgo(8), performedAt: null, price: 80000,
    } as DiagnosticStudy);

    const charge = (id: string, source: VisitCharge['source'], sourceId: string, name: string, total: number, paid: boolean): VisitCharge => ({
        id, clinicId, visitId: visit.id, patientId, patientName, source, sourceId, name,
        quantity: 1, unitPrice: total, discount: 0, total,
        status: paid ? 'Paid' : 'Unpaid', paidAmount: paid ? total : 0, paidAt: paid ? minsAgo(68) : null,
        createdAt: minsAgo(70), createdByName: 'Registratura',
        visit: { id: visit.id, date: visit.date, queueNumber: visit.queueNumber, departmentId: visit.departmentId },
    });
    /* Shu qabulga avtomatik yasalgan «Tahlil: …» qatori hech qaysi yo'llanmaga
       bog'lanmagan (`sourceId` yo'q): hisobda bor, varaqda esa ko'rinmaydi —
       jami bilan qatorlar yig'indisi mos kelmay qolardi. Uning o'rnida
       haqiqiy yo'llanmaning qatori turadi. */
    for (let i = DEMO_CHARGES.length - 1; i >= 0; i--) {
        const c = DEMO_CHARGES[i];
        if (c.visitId === visit.id && c.source === 'Lab' && !c.sourceId) DEMO_CHARGES.splice(i, 1);
    }
    addOnce(DEMO_CHARGES, charge('demo-charge-card-lab', 'Lab', orderId, 'Umumiy qon tahlili, glyukoza', 75000, true));
    addOnce(DEMO_CHARGES, charge('demo-charge-card-study', 'Study', 'demo-study-card-1', 'Elektrokardiogramma (EKG)', 80000, false));

    // ── Doimiy holat: surunkali kasallik, uning dorisi, allergiya
    addOnce(DEMO_DIAGNOSES, {
        id: 'demo-dx-card-chronic', patientId, clinicId, code: 'I10', date: dayShift(-400).slice(0, 10),
        notes: '', status: 'Chronic', isChronic: true, icd10: DEMO_ICD10.find(c => c.code === 'I10'),
    } as PatientDiagnosis);
    addOnce(DEMO_PRESCRIPTIONS, {
        id: 'demo-rx-card-1', clinicId, patientId, patientName, doctorName: visit.doctorName || null,
        date: dayShift(-120).slice(0, 10), status: 'Active',
        items: [{ id: 'demo-rx-card-1-i1', prescriptionId: 'demo-rx-card-1', name: 'Lizinopril', dosage: '10 mg', frequency: 'kuniga 1 mahal' }],
    } as Prescription);
    addOnce(DEMO_ALLERGIES, { id: 'demo-allergy-card-1', patientId, substance: 'Lidokain', reaction: 'Toshma, qichishish', severity: 'Severe' });

    // ── Oldingi tashriflar (qabullar har yuklanishda yasaladi — bular ham)
    const past = [
        { id: 'demo-visit-card-1', days: 34, complaint: "Yo'tal, tomoq og'rig'i, harorat 37,6", code: 'J06.9' },
        { id: 'demo-visit-card-2', days: 120, complaint: "Bosh og'rig'i, qon bosimi ko'tarilishi", code: 'I10' },
        { id: 'demo-visit-card-3', days: 300, complaint: "Ovqatdan keyin oshqozonda og'riq", code: 'K29.5' },
    ];
    for (const p of past) {
        const at = dayShift(-p.days);
        put(DEMO_VISITS, {
            ...visit, id: p.id, date: at.slice(0, 10), checkInTime: at, checkOutTime: at,
            status: 'Completed', complaints: p.complaint, queueNumber: null,
            calledAt: at, startedAt: at, awaitingSince: null,
        } as Visit);
        addOnce(DEMO_DIAGNOSES, {
            id: `demo-dx-${p.id}`, patientId, clinicId, visitId: p.id, code: p.code, date: at.slice(0, 10),
            notes: '', status: 'Active', icd10: DEMO_ICD10.find(c => c.code === p.code),
        } as PatientDiagnosis);
    }
})();

/* ── DEMO: KARDIOLOG VA ENDOKRINOLOG BEMORLARIGA MKB-10 TASHXISLARI ──────
   Bugungi qabulga qo'yilgan va surunkali tashxislar: kartada «Bugun
   qo'shilganlar» va «Kasalliklari» ro'yxatlari kod bilan ko'rinsin.
   Faqat bo'lmasa qo'shiladi — namoyishda o'chirilgani qaytib chiqmasin. */
(function seedSpecialistDiagnoses() {
    const clinicId = 'demo-clinic-1';
    const today = todayISO();
    const plan: { pid: number; code: string; chronic?: boolean; daysAgo?: number }[] = [
        { pid: 4, code: 'E11.4' },
        { pid: 4, code: 'E78.5', chronic: true, daysAgo: 400 },
        { pid: 5, code: 'I47.1' },
        { pid: 11, code: 'R73.0', chronic: true, daysAgo: 200 },
        { pid: 9, code: 'I10', chronic: true, daysAgo: 600 },
        { pid: 3, code: 'E55.9', chronic: true, daysAgo: 150 },
    ];
    for (const p of plan) {
        const patientId = `demo-patient-${p.pid}`;
        const visit = p.chronic ? undefined : DEMO_VISITS.find(v => v.patientId === patientId && v.date === today);
        const id = `demo-dx-spec-${p.pid}-${p.code}`;
        if (DEMO_DIAGNOSES.some(d => d.id === id)) continue;
        DEMO_DIAGNOSES.push({
            id, patientId, clinicId, code: p.code,
            ...(visit ? { visitId: visit.id } : {}),
            date: p.daysAgo ? dayShift(-p.daysAgo).slice(0, 10) : today,
            notes: '', status: p.chronic ? 'Chronic' : 'Active', isChronic: !!p.chronic,
            icd10: DEMO_ICD10.find(c => c.code === p.code),
        } as PatientDiagnosis);
    }
})();

/* NAVBAT TABLOSI — demo ma'lumotining O'ZIDAN.

   Ilgari `QueueBoard.tsx` ichida beshta qator qo'lda yozib qo'yilgan edi va
   u hech qanday qabulga bog'lanmagan: raqamlari («T-12», «X-14») navbatdagi
   bemorlarning raqamlari bilan mos kelmasdi, ranglar kodda turardi, va
   ro'yxatda «Jarrohlik» degan MAVJUD BO'LMAGAN bo'lim ko'rinardi — u
   xizmat kategoriyasi, bo'lim emas (audit XC-01, XC-03).

   Shakli `backend/multiprofile.ts` dagi `queue-board` javobi bilan bir xil:
   talon = bo'lim kodi + ikki xonali navbat raqami. */
export const demoQueueBoard = () => DEMO_VISITS
    .filter(v => ['Waiting', 'Called', 'In Progress'].includes(v.status))
    .sort((a, b) => (a.status.localeCompare(b.status)) || ((a.queueNumber ?? 0) - (b.queueNumber ?? 0)))
    .map(v => {
        const dep = DEMO_DEPARTMENTS.find(d => d.id === v.departmentId);
        return {
            queueNumber: v.queueNumber ?? null,
            ticket: dep?.code
                ? `${dep.code}-${String(v.queueNumber ?? 0).padStart(2, '0')}`
                : (v.queueNumber != null ? String(v.queueNumber) : null),
            status: v.status as 'Waiting' | 'Called' | 'In Progress',
            calledAt: v.calledAt ?? null,
            department: dep?.name ?? null,
            color: dep?.color ?? null,
        };
    });

/** Demo YOZUVINING yakuni: holatni saqlaydi va natijani qaytaradi.
 *  Har bir o'zgartiruvchi amal shu orqali tugaydi — saqlashni bitta joyda
 *  ushlab turish uchun (unutilgan chaqiruv = yo'qolgan o'zgarish). */
/* Demoda server yo'q, ya'ni `fetchJson` dagi e'lon ishlamaydi. Yozuv shu
   yerdan e'lon qilinadi: aks holda namoyishda qo'shilgan bo'lim yoki
   ochilgan qabul boshqa ekranda ko'rinmasdi. */
const demoDone = <T,>(value: T): Promise<T> => { saveDemoState(); emitDataChanged('demo'); return Promise.resolve(value); };
/** Xuddi shu e'lon, lekin holatni saqlamaydi — sessiya ichida yashaydigan
 *  demo yozuvlari uchun (qabul, yo'llanma). */
const demoWrote = <T,>(value: T): Promise<T> => { emitDataChanged('demo'); return Promise.resolve(value); };

/* AI provayderlari — Sozlamalar > «AI yordamchi» ro'yxati. Nomlar
   `backend/aiSettings.ts` dagi `AI_PROVIDER_INFO` bilan bir xil bo'lishi
   kerak, aks holda demo va haqiqiy o'rnatma ikki xil ro'yxat ko'rsatadi. */
const DEMO_AI_PROVIDERS = [
    { name: 'gemini' as const, label: 'Google Gemini', envName: 'GEMINI_API_KEY',
      hint: 'Google AI Studio da bepul kalit beriladi.', url: 'https://aistudio.google.com/apikey' },
    { name: 'groq' as const, label: 'Groq', envName: 'GROQ_API_KEY',
      hint: 'Eng tez javob beradi, bepul limiti bor.', url: 'https://console.groq.com/keys' },
    { name: 'openrouter' as const, label: 'OpenRouter', envName: 'OPENROUTER_API_KEY',
      hint: "Bitta kalit bilan ko'p model. Bepul modellari ham bor.", url: 'https://openrouter.ai/keys' },
];

/** Bemor hujjatlari (rozilik, shartnoma) — sessiya davomida saqlanadi. */
const DEMO_DOCUMENTS: any[] = [];

/** Yo'llanmalar (laboratoriya, diagnostika, kassa). */
const DEMO_REFERRALS: any[] = [];

/** Yo'llanma + bemor va bo'lim — server `include` qilgan shakl */
const demoReferralView = (r: any) => {
    const p = DEMO_PATIENTS.find(x => x.id === r.patientId);
    const dep = r.targetDepartmentId ? DEMO_DEPARTMENTS.find(d => d.id === r.targetDepartmentId) : undefined;
    return {
        ...r,
        patient: p ? {
            firstName: p.firstName, lastName: p.lastName, phone: p.phone,
            dob: p.dob, gender: p.gender, cardNumber: (p as any).cardNumber,
        } : null,
        targetDepartment: dep ? { name: dep.name } : null,
    };
};

/* Zaxira nusxa holati. Demoda HAQIQIY nusxa yo'q — bulutda baza ham yo'q.
   Shuning uchun raqamlar o'ylab topilmaydi: ekran «nusxa hali olinmagan»
   holatini ko'rsatadi. Bu yolg'on emas va interfeys qanday ishlashini
   baribir ko'rsatadi. */
/* Namoyishda ham o'zgartirib ko'rsatish mumkin bo'lsin — jadval
   sozlamasi saqlanadigan qiymat. */
let DEMO_BACKUP_CONFIG: any = {
    enabled: true, hour: 23, minute: 30, keepDaily: 14, keepMonthly: 12, extraDir: null,
};

const DEMO_BACKUP_STATUS = {
    get config() { return DEMO_BACKUP_CONFIG; },
    lastBackup: DEMO_BACKUPS[0],
    ageDays: 0,
    stale: false,
    count: DEMO_BACKUPS.length,
    totalBytes: DEMO_BACKUPS.reduce((s, b) => s + b.sizeBytes, 0),
    scheduler: { running: true, lastRunAt: DEMO_BACKUPS[0].createdAt, lastFile: DEMO_BACKUPS[0].file, lastError: null, lastDeleted: 1 },
};

/** Tasdiqlangan oylik vedomostlari — sessiya davomida. */
const DEMO_PAYROLL_RUNS: any[] = [];

/* Oylik hisobi: shifokorning ULUSHI davr ichida to'langan summadan
   foizi bo'yicha. Demoda ham xuddi shu mantiq — raqam o'ylab topilmaydi,
   demo tranzaksiyalaridan sanaladi. */
/* Shifokor ulushi. Interfeys KUTGAN shakl aniq: `Payroll.tsx` har qatordan
   `staffName`, `paidBase`, `items[]` va `accrued` ni o'qiydi, `FinanceReport`
   esa boshqa — `{ doctors, totals }` — shaklni kutadi. Ilgari bu yerda bitta
   umumiy javob qaytarardi va u ikkalasiga ham to'g'ri kelmasdi: «Ulush»
   vkladkasi `l.items.length` da yiqilardi (items YO'Q edi).

   Hisob mantiqi haqiqiysi bilan bir xil: ulush faqat TO'LANGAN xizmatdan
   va faqat shifokor ko'rsatilgan qatordan hisoblanadi. */
const demoDoctorLines = (from: string, to: string) => {
    const paid = DEMO_TRANSACTIONS.filter(t => t.status === 'Paid' && inRange(t.date as any, from, to));
    return DEMO_DOCTORS.map(d => {
        const own = paid.filter(t => (t as any).doctorId === d.id);
        const percent = d.percentage || 0;
        const items = own.map(t => ({
            name: t.service || 'Xizmat',
            paid: t.amount || 0,
            percent,
            basis: 'xizmat',
            share: Math.round((t.amount || 0) * percent / 100),
        }));
        const paidBase = items.reduce((s, i) => s + i.paid, 0);
        return {
            doctorId: d.id,
            staffName: `${d.firstName} ${d.lastName}`,
            paidBase,
            refunded: 0,
            items,
            accrued: items.reduce((s, i) => s + i.share, 0),
            patientCount: new Set(own.map(t => (t as any).patientId)).size,
        };
    }).filter(l => l.items.length > 0);
};

/** `payroll.preview` shakli. */
const demoPayrollPreview = (from: string, to: string) => {
    const lines = demoDoctorLines(from, to);
    /* `stats` shakli SERVERDAGI bilan bir xil: ekran davr bo'sh
       bo'lganda aynan shu raqamlarga qarab sababni aytadi. Demoda
       tashlab ketiladigan qator yo'q — hamma chekda shifokor bor. */
    const paid = DEMO_TRANSACTIONS.filter(t => t.status === 'Paid' && inRange(t.date as any, from, to));
    return {
        periodFrom: from, periodTo: to,
        lines,
        stats: { payments: paid.length, skippedNoDoctor: 0, skippedNoDoctorSum: 0, skippedCancelled: 0 },
        lastPaymentAt: [...DEMO_TRANSACTIONS]
            .filter(t => t.status === 'Paid')
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date ?? null,
        total: lines.reduce((s, l) => s + l.accrued, 0),
    };
};

/** Vedomost qatorlari — `openRun.lines` shakli (`detail` ichida tafsilot). */
const demoRunLines = (from: string, to: string) =>
    demoDoctorLines(from, to).map(l => ({
        id: `demo-line-${l.doctorId}`,
        doctorId: l.doctorId,
        staffName: l.staffName,
        accrued: l.accrued,
        paid: 0,
        detail: { paidBase: l.paidBase, refunded: l.refunded, items: l.items },
    }));

/** `reports.doctors` shakli — `FinanceReport` uchun. */
const demoDoctorsReport = (from: string, to: string) => {
    const charged = DEMO_TRANSACTIONS.filter(t => inRange(t.date as any, from, to));
    const doctors = demoDoctorLines(from, to).map(l => {
        const all = charged.filter(t => (t as any).doctorId === l.doctorId);
        const revenue = all.reduce((s, t) => s + (t.amount || 0), 0);
        return {
            doctorId: l.doctorId,
            name: l.staffName,
            revenue,
            paid: l.paidBase,
            due: revenue - l.paidBase,
            patientCount: l.patientCount,
            avgCheck: l.patientCount ? Math.round(l.paidBase / l.patientCount) : 0,
            accrued: l.accrued,
        };
    });
    /* Shifokorsiz qatorlar (statsionar, ulushsiz shifokorlar) — server kabi
       «Belgilanmagan» qatori. Ilgari ular tushib qolardi va Shifokorlar
       «Xizmatlar 4 650 000» Umumiydagi 6 450 000 bilan to'qnashardi. */
    const restTx = charged.filter(t => !doctors.some(d => d.doctorId === (t as any).doctorId));
    const restRevenue = restTx.reduce((s, t) => s + (t.amount || 0), 0);
    if (restRevenue > 0) {
        const restPaid = restTx.filter(t => t.status === 'Paid').reduce((s, t) => s + (t.amount || 0), 0);
        const restPatients = new Set(restTx.map(t => (t as any).patientId || t.patientName)).size;
        doctors.push({
            doctorId: null as any, name: 'Belgilanmagan', revenue: restRevenue, paid: restPaid, due: restRevenue - restPaid,
            patientCount: restPatients, avgCheck: restPatients ? Math.round(restPaid / restPatients) : 0, accrued: 0,
        });
    }
    return {
        doctors,
        totals: {
            revenue: doctors.reduce((s, d) => s + d.revenue, 0),
            paid: doctors.reduce((s, d) => s + d.paid, 0),
            due: doctors.reduce((s, d) => s + d.due, 0),
            accrued: doctors.reduce((s, d) => s + d.accrued, 0),
        },
    };
};

/* ─── XODIMLAR MODULI: DEMO ──────────────────────────────────────────────────

   Demo namoyish uchun, shuning uchun raqamlar HAQIQIY demo ma'lumotidan
   sanaladi — o'ylab topilgan sonlar qo'yilsa, namoyishda modul ishlayotgandek
   ko'rinadi-yu, ichida hech narsa bo'lmaydi. */
const DEMO_HR_ADJUSTMENTS: any[] = [];
const DEMO_HR_PAYMENTS: any[] = [];
const DEMO_HR_ATTENDANCE: any[] = [];

/** Demo xodimlari — hamma rol bitta ro'yxatda, rol nomi bilan. */
const demoStaffAll = () => ([
    ...DEMO_DOCTORS.map((r: any) => ({ ...r, role: 'DOCTOR' })),
    ...DEMO_RECEPTIONISTS.map((r: any) => ({ ...r, role: 'RECEPTIONIST' })),
    ...DEMO_LAB_TECHNICIANS.map((r: any) => ({ ...r, role: 'LAB_TECHNICIAN' })),
    ...DEMO_NURSES.map((r: any) => ({ ...r, role: 'NURSE' })),
]);

const demoWeekBounds = () => {
    const now = new Date();
    const dow = now.getDay() === 0 ? 7 : now.getDay();
    const mon = new Date(now.getTime() - (dow - 1) * 864e5);
    const sun = new Date(mon.getTime() + 6 * 864e5);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { from: iso(mon), to: iso(sun) };
};

const demoHrWorkload = () => {
    const week = demoWeekBounds();
    const appts = DEMO_APPOINTMENTS.filter((a: any) =>
        a.date >= week.from && a.date <= week.to && a.status !== 'Cancelled');
    return {
        week,
        rows: DEMO_DOCTORS.map((d: any) => {
            const own = appts.filter((a: any) => a.doctorId === d.id);
            const minutes = own.reduce((s: number, a: any) => s + (a.duration || 30), 0);
            /* Sig'im ish grafigidan. Demo shifokorlarida grafik bo'lmasa
               foiz KO'RSATILMAYDI — haqiqiy serverdagi qoida bilan bir xil. */
            const days = String(d.workDays || '').split(',').filter(Boolean).length;
            const cap = days && d.startHour != null && d.endHour != null && d.endHour > d.startHour
                ? days * (d.endHour - d.startHour) * 60 : null;
            return {
                doctorId: d.id, appointments: own.length, minutes,
                capacityMinutes: cap,
                percent: cap ? Math.min(200, Math.round((minutes / cap) * 100)) : null,
            };
        }),
    };
};

const demoHrSummary = () => {
    const all = demoStaffAll();
    const active = all.filter((r: any) => r.status === 'Active');
    const load = demoHrWorkload();
    const known = load.rows.filter((r: any) => r.percent != null).map((r: any) => r.percent);
    return {
        total: active.length,
        archived: all.length - active.length,
        byRole: {
            DOCTOR: DEMO_DOCTORS.filter((r: any) => r.status === 'Active').length,
            RECEPTIONIST: DEMO_RECEPTIONISTS.filter((r: any) => r.status === 'Active').length,
            LAB_TECHNICIAN: DEMO_LAB_TECHNICIANS.filter((r: any) => r.status === 'Active').length,
            NURSE: DEMO_NURSES.filter((r: any) => r.status === 'Active').length,
        },
        working: load.rows.filter((r: any) => r.appointments > 0).length,
        doctors: DEMO_DOCTORS.length,
        avgLoad: known.length ? Math.round(known.reduce((s: number, v: number) => s + v, 0) / known.length) : null,
        loadKnownFor: known.length,
        salaryFund: active.reduce((s: number, r: any) => s + (Number(r.fixedSalary) || 0), 0),
        noSalary: active.filter((r: any) => !(Number(r.fixedSalary) > 0)).length,
    };
};

const demoHrMonth = (role: string, id: string, period: string) => {
    const staff = demoStaffAll().find((r: any) => r.role === role && r.id === id);
    const adj = DEMO_HR_ADJUSTMENTS.filter(a => a.staffRole === role && a.staffId === id && a.period === period);
    const bonus = adj.filter(a => a.type === 'Bonus').reduce((s, a) => s + (a.amount || 0), 0);
    const penalty = adj.filter(a => a.type === 'Penalty').reduce((s, a) => s + (a.amount || 0), 0);
    const base = role === 'DOCTOR' ? 0 : Number(staff?.fixedSalary) || 0;
    const payment = DEMO_HR_PAYMENTS.find(p => p.staffRole === role && p.staffId === id && p.period === period);
    return {
        period,
        staff: {
            id, role, name: staff ? `${staff.lastName} ${staff.firstName}` : '',
            fixedSalary: Number(staff?.fixedSalary) || 0,
            salaryType: staff?.salaryType || null,
            percentage: staff?.percentage ?? null,
            workDays: String(staff?.workDays || '').split(',').filter(Boolean).map(Number),
        },
        base, bonus, penalty, due: base + bonus - penalty,
        adjustments: adj,
        payment: payment ? { ...payment, amount: base + bonus - penalty } : null,
        share: role === 'DOCTOR' ? { accrued: 0, paid: 0, runs: [] } : null,
        attendance: { present: 0, absent: 0, excused: 0, late: 0 },
    };
};

const DEMO_NURSES: any[] = [
    { id: 'demo-nurse-1', clinicId: 'demo-clinic-1', firstName: 'Nilufar', lastName: 'Yo\'ldosheva', phone: '+998 90 555 66 77', departmentId: 'demo-inp', username: 'nilufar', status: 'Active' },
    { id: 'demo-nurse-2', clinicId: 'demo-clinic-1', firstName: 'Zuhra', lastName: 'Ismoilova', phone: '+998 91 222 33 44', departmentId: 'demo-inp', username: 'zuhra', status: 'Active' },
];

/** Harorat varag'i — ko'rsatkichlar vaqt qatori. */
const DEMO_VITALS: any[] = [
    { id: 'demo-vital-1', patientId: 'demo-patient-1', admissionId: 'demo-adm-1', kind: 'Temperature', value: 38.4, unit: '°C', measuredAt: dayShift(-3) },
    { id: 'demo-vital-2', patientId: 'demo-patient-1', admissionId: 'demo-adm-1', kind: 'Temperature', value: 37.8, unit: '°C', measuredAt: dayShift(-2) },
    { id: 'demo-vital-3', patientId: 'demo-patient-1', admissionId: 'demo-adm-1', kind: 'Temperature', value: 36.9, unit: '°C', measuredAt: dayShift(-1) },
    { id: 'demo-vital-4', patientId: 'demo-patient-1', admissionId: 'demo-adm-1', kind: 'Pulse', value: 84, unit: "zarb/daq", measuredAt: dayShift(-2) },
    { id: 'demo-vital-5', patientId: 'demo-patient-1', admissionId: 'demo-adm-1', kind: 'Pulse', value: 76, unit: "zarb/daq", measuredAt: dayShift(-1) },
];

/* ─── Demo: dori varag'i ───────────────────────────────────────────────────
   Belgilar va jadval serverdagi shaklda: `status` + `givenAt`, tayinlovda
   `perDay / slots / due / nextAt` (`backend/inpatient.ts`, `scheduleOf`).
   Qoida ikkalasida bitta — `shared/medSchedule.ts`. */
const demoMedMarks = (orderId: string, day: string) => DEMO_ADMINISTRATIONS
    .filter(x => x.orderId === orderId && dayKey(x.at) === day)
    .map(x => ({ ...x, status: (x as any).status || 'Given', givenAt: x.at }));

const demoMedSchedule = (order: { frequency?: string | null; status?: string }, marks: { givenAt: string }[], day: string) => {
    const live = day === todayISO() && order.status !== 'Stopped';
    const now = new Date();
    const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const last = marks.length ? new Date(Math.max(...marks.map(m => +new Date(m.givenAt)))) : null;
    const s = medDue(order.frequency, marks.length, live ? minOf(now) : -1, last ? minOf(last) : null);
    return { perDay: s.perDay, slots: s.slots, due: live ? s.due : 0, nextAt: live ? s.nextAt : null };
};

const demoMedRows = (day: string) => DEMO_ADMISSIONS.filter(a => a.status === 'Active').map(a => {
    const bed = DEMO_BEDS.find(b => b.id === a.bedId);
    return {
        admissionId: a.id,
        patientName: a.patientName,
        ward: DEMO_WARDS.find(w => w.id === bed?.wardId)?.name || null,
        bed: bed?.label || null,
        orders: DEMO_MED_ORDERS.filter(m => m.admissionId === a.id).map(m => {
            const marks = demoMedMarks(m.id, day);
            return {
                id: m.id, name: m.name, dosage: m.dosage, route: m.route, frequency: m.frequency,
                marks,
                ...demoMedSchedule(m, marks, day),
            };
        }),
    };
});

/** Koyka holatini yotqizilganlar ro'yxatiga qarab qayta hisoblaydi. */
const demoSyncBeds = () => {
    const busy = new Set(DEMO_ADMISSIONS.filter(a => a.status === 'Active').map(a => a.bedId));
    DEMO_BEDS.forEach(b => {
        if (busy.has(b.id)) b.status = 'Occupied';
        else if (b.status === 'Occupied') b.status = 'Free';
    });
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES, backoff = INITIAL_BACKOFF): Promise<Response> {
    try {
        const response = await fetch(url, options);

        /* QAYTA URINISH — FAQAT O'TKINCHI XATOLARDA (S3.3).

           Ilgari shart `status >= 500` edi, ya'ni HAR QANDAY server
           xatosi uch marta qayta urinilardi. Audit shuni ko'rgan:
           tashqi integratsiya so'rovi 500 qaytarganda front uch marta
           urilib, ~7 soniya kutgan va shundan keyingina xabar chiqqan
           (B-06).

           500 va 501 ni qayta urinishning ma'nosi yo'q:
             500 — dasturdagi xato yoki sozlanmagan holat; ikkinchi
                   urinish ham xuddi shu javobni beradi;
             501 — funksiya umuman sozlanmagan (integratsiya kaliti
                   yo'q) — bu doimiy holat.
           Bazadagi qulf kabi haqiqiy o'tkinchi holatlar serverning
           o'zida `withRetry` bilan qayta uriladi.

           Qolgani o'tkinchi: 502/504 — proksi, 503 — vaqtincha band,
           408 — kechikish, 429 — chastota chegarasi. */
        const TRANSIENT = [502, 503, 504, 408, 429];
        if (!response.ok && TRANSIENT.includes(response.status)) {
            const method = options.method || 'GET';
            if (retries > 0 && method === 'GET') {
                console.warn(`Request to ${url} failed with status ${response.status}.Retrying in ${backoff}ms... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                return fetchWithRetry(url, options, retries - 1, backoff * 2);
            }
        }

        return response;
    } catch (error) {
        // Network errors (fetch throws generic TypeError for network issues)
        const method = options.method || 'GET';
        if (retries > 0 && method === 'GET') {
            console.warn(`Network error for ${url}.Retrying in ${backoff}ms... (${retries} attempts left)`, error);
            await new Promise(resolve => setTimeout(resolve, backoff));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
    }
}

/* ─── SESSIYA TUGASHI ───────────────────────────────────────────────────────

   401 — token yo'q/yaroqsiz. 403 esa ikki xil bo'lishi mumkin: rol yetarli
   emas (sessiya joyida) yoki eski backend token uchun 403 qaytargan.
   Ikkinchisida ham sessiyani tugatish kerak, aks holda «Qayta yuklash» o'lik
   token bilan aylanaveradi. */
async function isTokenRejected(response: Response): Promise<boolean> {
    if (response.status === 401) return true;
    if (response.status !== 403) return false;
    const data = await response.clone().json().catch(() => ({} as any));
    return typeof data?.error === 'string' && data.error.includes('Token yaroqsiz');
}

/** Tarmoq xatosi — sessiya tugagani EMAS. `status: 0` bilan beriladi. */
function networkError(): Error {
    const err: any = new Error(tr('auth.networkError'));
    err.status = 0;
    err.network = true;
    return err;
}

/* Sessiyani BIR MARTA tugatish. Kirishdagi 18 ta parallel so'rov hammasi
   401 olsa, ilgari har biri alohida `logout` yuborardi va har biri
   `auth:unauthorized` hodisasini chiqarardi. Endi birinchisi tozalaydi,
   qolganlari sessiya yo'qligini ko'rib jim o'tadi. */
function expireSession(): void {
    const hadSession = !!auth.getToken() || !!auth.getSession();
    if (!hadSession) return;
    void auth.clearSession(API_URL);
    window.dispatchEvent(new Event('auth:unauthorized'));
}

/**
 * `fetch` o'rniga — JSON bo'lmagan so'rovlar uchun (fayl yuklash, oqim).
 *
 * Ilgari bunday joylar (`AiAssistant`, `Diagnostics`, `PatientPhotos`)
 * `fetch` ni to'g'ridan-to'g'ri chaqirardi: token RENDER paytida olinardi va
 * 30 daqiqadan keyin eskirib qolardi, 401 esa yangilanmasdi. Endi token
 * so'rov paytida o'qiladi va 401 da bir marta yangilanib qayta yuboriladi.
 * Javob o'zi qaytadi — chaqiruvchi `ok`/`status` ni o'zi tekshiradi.
 */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
    if (isDemoMode()) throw new Error("Demo rejimida bu ma'lumot mavjud emas");

    const send = async () => {
        const headers = new Headers(options.headers || {});
        const token = auth.getToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
        let res: Response;
        try {
            res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
        } catch {
            throw networkError();
        }
        const refreshedToken = res.headers.get('X-Refreshed-Token');
        if (refreshedToken) auth.setToken(refreshedToken);
        return res;
    };

    let res = await send();
    if (!(await isTokenRejected(res))) return res;

    const outcome = await auth.refreshWithOutcome(API_URL);
    if (!outcome.ok && outcome.reason === 'network') throw networkError();
    if (outcome.ok) {
        res = await send();
        if (!(await isTokenRejected(res))) return res;
    }
    expireSession();
    throw new Error('Session expired');
}

async function fetchJson<T>(url: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    /* DEMO REJIMI. Demo tokeni ('demo-token') server uchun yaroqsiz, ya'ni
       har qanday so'rov 401 qaytaradi, 401 esa sessiyani tozalab, kirish
       sahifasiga uloqtiradi.

       Eski usullar buni har birida `isDemoMode()` bilan tekshirardi. Yangi
       modullarda (clinical, payroll, inpatient, compliance...) bu tekshiruv
       YO'Q edi — 45 ta chaqiruv. Ya'ni demo rejimida yangi ekranlarning
       istalgani foydalanuvchini chiqarib yuborardi.

       Har biriga qo'riqchi qo'yish o'rniga bitta joyda to'xtatamiz: yangi
       chaqiruvlar ham avtomatik himoyalangan bo'ladi. */
    if (isDemoMode()) {
        throw new Error("Demo rejimida bu ma'lumot mavjud emas");
    }

    const headers: HeadersInit = {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
    };

    /* Token XOTIRADAN olinadi, `localStorage` dan emas (S1.3) — u endi
       diskda saqlanmaydi. */
    const token = auth.getToken();
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

    const response = await fetchWithRetry(`${API_URL}${url}`, {
        ...options,
        headers,
        /* Yangilash cookie'si yuborilishi uchun shart. Cookie `httpOnly`,
           ya'ni uni JavaScript qo'shib qo'ya olmaydi — brauzer o'zi
           qo'shadi, lekin faqat shu bayroq bilan. */
        credentials: 'include',
    });

    // Backend tokenni yangilagan bo'lsa (muddati yaqinlashgan), uni jimgina
    // xotiraga olamiz. Foydalanuvchi faol ekan, sessiyasi tugamaydi.
    const refreshedToken = response.headers.get('X-Refreshed-Token');
    if (refreshedToken) auth.setToken(refreshedToken);

    if (await isTokenRejected(response)) {
        /* Kirish tokeni 30 daqiqa yashaydi, ya'ni uning eskirishi ODATIY
           hol — sessiya tugagani emas. Avval `httpOnly` cookie orqali
           yangisini so'raymiz va so'rovni BIR MARTA takrorlaymiz.

           `isRetry` qo'riqchi: yangilangan token bilan ham 401 kelsa,
           sessiya haqiqatan tugagan va cheksiz aylanish bo'lmasligi kerak. */
        if (!isRetry) {
            const outcome = await auth.refreshWithOutcome(API_URL);
            if (outcome.ok) return fetchJson<T>(url, options, true);
            /* Tarmoq yoki server vaqtincha ishlamayapti — sessiya TIRIK.
               Chiqarib yubormaymiz, faqat xato beramiz. */
            if (outcome.reason === 'network') throw networkError();
        }

        expireSession();
        // We throw an error to stop execution, but the event listener in App.tsx will handle the redirect/UI update
        throw new Error('Session expired');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const err: any = new Error(errorData.error || `API request failed: ${response.statusText}`);
        /* Javob TANASINI ham beramiz. Sabab: 409 ba'zan ma'lumot bilan
           keladi — masalan "qabul allaqachon ochilgan" javobida mavjud
           `visitId` bo'ladi, va interfeys "o'shani ochamizmi?" deb
           so'rashi kerak. Ilgari faqat matn qolib, id yo'qolardi.
           Eski chaqiruvchilar `e.message` ni o'qiydi — ular buzilmaydi. */
        err.status = response.status;
        err.data = errorData;
        throw err;
    }
    const data = await response.json();
    /* YOZUV MUVAFFAQIYATLI — ilovaga e'lon qilamiz (`services/dataBus.ts`).
       `App` shu bo'g'inga bog'liq umumiy ro'yxatlarni qayta o'qiydi. Ekran
       buni o'zi eslab qolishi shart emas: aynan unutilgan joylarda
       «qo'shdim, lekin boshqa ekranda yo'q» degan xato chiqardi. */
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') emitDataChanged(resourceOf(url));
    return data;
}

/** Sozlamalar oynasi uchun AI holati. Kalitlar oshkor qilinmaydi. */
export interface AiProviderStatus {
    name: 'gemini' | 'groq' | 'openrouter';
    label: string;
    hint: string;
    url: string;
    configured: boolean;
    /** «••••••••1234» ko’rinishida yoki null. */
    masked: string | null;
    /** 'settings' — sozlamalardan kiritilgan, 'env' — serverdagi .env dan. */
    source: 'settings' | 'env' | null;
    envName: string;
}

export interface AiSettingsResponse {
    success: boolean;
    preferred: 'gemini' | 'groq' | 'openrouter' | null;
    providers: AiProviderStatus[];
}

export const api = {
    auth: {
        /* Majburiy parol almashtirish. Standart parol bilan kirilganda server
           CHEKLANGAN token beradi va u faqat shu endpointga yaraydi. */
        changePassword: (currentPassword: string, newPassword: string) => {
            /* Namoyishda parol o'zgarmaydi — baza yo'q. Lekin xato ham
               bermaydi: majburiy almashtirish oynasi ochilib qolsa,
               undan CHIQIB bo'lmasdi. */
            if (isDemoMode()) return demoDone({ success: true as const, token: 'demo-token' });
            return fetchJson<{ success: true; token: string }>('/auth/change-password', {
                method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
            });
        },
        login: async (username: string, password: string) => {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            return response.json();
        },
    },
    patients: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_PATIENTS);
            return fetchJson<Patient[]>(`/patients?clinicId=${clinicId}`);
        },
        /** Butun klinika bo'yicha ro'yxat. Shifokorga o'ziga biriktirilmagan
         *  bemorlar ham kerak: ko'p profilli klinikada bemor bir necha
         *  bo'limdan o'tadi. Parametrsiz `getAll` xatti-harakati o'zgarmadi. */
        getAllForClinic: (clinicId: string, limit?: number) => {
            if (isDemoMode()) return Promise.resolve(DEMO_PATIENTS);
            const q = `/patients?clinicId=${clinicId}&scope=clinic${limit ? `&limit=${limit}` : ''}`;
            return fetchJson<Patient[]>(q);
        },
        /** Bitta shifokorga biriktirilgan bemorlar — shifokor kartasi uchun.
         *  Chegarasiz: kesim kichik va karta to'liq ro'yxat uchun ochiladi. */
        getByDoctor: (clinicId: string, doctorId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_PATIENTS.filter(p => p.doctorId === doctorId));
            return fetchJson<Patient[]>(`/patients?clinicId=${clinicId}&scope=clinic&doctorId=${doctorId}`);
        },
        /** Ism, familiya, telefon yoki JSHSHIR bo'yicha qidiruv (kamida 2 belgi) */
        search: (q: string) => {
            if (isDemoMode()) {
                const s = q.toLowerCase();
                return Promise.resolve(DEMO_PATIENTS.filter(p =>
                    `${p.firstName} ${p.lastName} ${p.phone}`.toLowerCase().includes(s)));
            }
            return fetchJson<Patient[]>(`/patients/search?q=${encodeURIComponent(q)}`);
        },
        getById: (id: string) => {
            if (isDemoMode()) {
                const patient = DEMO_PATIENTS.find(p => p.id === id);
                return patient ? Promise.resolve(patient) : Promise.reject('Patient not found');
            }
            return fetchJson<Patient>(`/patients/${id}`);
        },
        create: (data: Omit<Patient, 'id'>) => {
            if (isDemoMode()) {
                /* TAKROR BEMOR — demoda ham. Server 409 va topilganlar
                   ro'yxatini qaytaradi, forma esa TANLOV beradi: mavjud
                   kartani ochish yoki baribir yangi yaratish. Demoda bu
                   tekshiruv yo'q edi va namoyishda eng muhim qadam
                   ko'rinmasdi. Qoida server bilan bir xil: telefonning
                   oxirgi 9 raqami yoki ism+familiya+tug'ilgan sana. */
                if (!(data as any).force) {
                    const digits = String(data.phone || '').replace(/\D/g, '');
                    const tail = digits.slice(-9);
                    const matches = DEMO_PATIENTS.filter(p => p.status !== 'Archived' && (
                        (tail.length === 9 && String(p.phone || '').replace(/\D/g, '').includes(tail))
                        || (!!data.dob && p.firstName === data.firstName
                            && p.lastName === data.lastName && p.dob === data.dob)
                    )).slice(0, 5);
                    if (matches.length) {
                        return Promise.reject(Object.assign(
                            new Error('Bunday bemor allaqachon bor'),
                            { status: 409, data: { code: 'DUPLICATE_PATIENT', matches } },
                        ));
                    }
                }
                const newPatient = { ...data, id: `demo-patient-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Patient;
                delete (newPatient as any).force;
                DEMO_PATIENTS.push(newPatient);
                saveDemoData();
                return Promise.resolve(newPatient);
            }
            return fetchJson<Patient>('/patients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Patient>) => {
            if (isDemoMode()) {
                const index = DEMO_PATIENTS.findIndex(p => p.id === id);
                if (index !== -1) {
                    /* Tibbiy tarix o'zgarsa — kim va qachon (server bilan bir xil) */
                    const stamp = data.medicalHistory !== undefined || data.anamnesis !== undefined
                        ? demoAnamnesisStamp() : {};
                    DEMO_PATIENTS[index] = { ...DEMO_PATIENTS[index], ...data, ...stamp };
                    saveDemoData();
                    return Promise.resolve(DEMO_PATIENTS[index]);
                }
                return Promise.reject('Patient not found');
            }
            return fetchJson<Patient>(`/patients/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_PATIENTS.findIndex(p => p.id === id);
                if (index !== -1) {
                    DEMO_PATIENTS.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/patients/${id}`, {
                method: 'DELETE',
            });
        },
        remindDebt: (id: string, amount?: number) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/patients/${id}/remind-debt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount }),
            });
        },
        sendMessage: (id: string, message: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/patients/${id}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });
        },
        /* Rasm yuklash demoda BRAUZER ICHIDA qoladi: server yo'q, shuning
           uchun fayl `blob:` manzil sifatida ko'rsatiladi. Sahifa
           yangilanguncha ishlaydi — namoyish uchun yetarli. */
        uploadAvatar: (id: string, file: File) => {
            if (isDemoMode()) return demoRead<{ success: true, url: string }>({ success: true, url: URL.createObjectURL(file) });
            const formData = new FormData();
            formData.append('photo', file);
            return fetchJson<{ success: true, url: string }>(`/patients/${id}/avatar`, {
                method: 'POST',
                body: formData,
            });
        },
        uploadPortrait: (id: string, file: File) => {
            if (isDemoMode()) return demoRead<{ success: true, url: string }>({ success: true, url: URL.createObjectURL(file) });
            const formData = new FormData();
            formData.append('photo', file);
            return fetchJson<{ success: true, url: string }>(`/patients/${id}/portrait`, {
                method: 'POST',
                body: formData,
            });
        },
        /* JSHSHIR bo'yicha qidiruv — DMED (davlat tizimi).

           Server FHIR javobini QANDAY BO'LSA shundayligicha uzatadi:
           `{ success, data: { name: [{ family, given: [] }], birthDate,
           gender: 'male', address: [{ text }] } }`.

           Interfeys esa yassi shaklni kutardi (`firstName`, `dob`...) —
           ikkala forma ham. Ya'ni tugma bosilardi, so'rov ketardi, javob
           kelardi va HECH BIR MAYDON to'lmasdi: hamma qiymat `prev` ga
           tushardi. Xato ham ko'rinmasdi, chunki `success: false` oddiy
           javob bo'lib qaytardi.

           O'girish SHU YERDA, bitta joyda: forma FHIR ni bilmasligi
           kerak. */
        lookupPinfl: async (pinfl: string): Promise<{
            firstName: string; lastName: string; dob: string;
            gender: 'Male' | 'Female' | ''; address: string;
        }> => {
            if (isDemoMode()) {
                return demoRead({
                    firstName: 'Eldor',
                    lastName: 'Abduqodirov',
                    dob: '1990-05-15',
                    gender: 'Male' as const,
                    address: 'Toshkent sh., Yunusobod tumani',
                });
            }
            const raw = await fetchJson<any>(`/patients/lookup/${pinfl}`);
            if (raw?.success === false) {
                throw new Error(raw.error || 'Bemor topilmadi');
            }
            const fhir = raw?.data ?? raw;
            const name = Array.isArray(fhir?.name) ? fhir.name[0] : null;
            const given = Array.isArray(name?.given) ? name.given.join(' ') : (name?.given || '');
            const addr = Array.isArray(fhir?.address) ? fhir.address[0] : null;
            const sex = String(fhir?.gender || '').toLowerCase();
            return {
                firstName: given || fhir?.firstName || '',
                lastName: name?.family || fhir?.lastName || '',
                dob: fhir?.birthDate || fhir?.dob || '',
                gender: sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : '',
                address: addr?.text || fhir?.address || '',
            };
        },
    },
    appointments: {
        /* `range` — kirishda butun tarixni tortmaslik uchun (FIX-PLAN 10).
           `patientId`/`doctorId` — bitta karta ochilganda: o'sha kesim
           SANA CHEGARASISIZ keladi, ya'ni karta 45 kunlik oynaga bog'liq
           emas. Parametrsiz chaqiruv ilgarigidek ishlaydi. */
        getAll: (clinicId: string, range?: { from?: string; to?: string; limit?: number; patientId?: string; doctorId?: string }) => {
            if (isDemoMode()) return Promise.resolve(DEMO_APPOINTMENTS);
            const q = new URLSearchParams({ clinicId });
            if (range?.from) q.set('from', range.from);
            if (range?.to) q.set('to', range.to);
            if (range?.limit) q.set('limit', String(range.limit));
            if (range?.patientId) q.set('patientId', range.patientId);
            if (range?.doctorId) q.set('doctorId', range.doctorId);
            return fetchJson<Appointment[]>(`/appointments?${q}`);
        },
        create: (data: Omit<Appointment, 'id'>) => {
            if (isDemoMode()) {
                const newAppt = { ...data, id: `demo-appt-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Appointment;
                DEMO_APPOINTMENTS.push(newAppt);
                saveDemoData();
                return Promise.resolve(newAppt);
            }
            return fetchJson<Appointment>('/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Appointment>) => {
            if (isDemoMode()) {
                const index = DEMO_APPOINTMENTS.findIndex(a => a.id === id);
                if (index !== -1) {
                    DEMO_APPOINTMENTS[index] = { ...DEMO_APPOINTMENTS[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_APPOINTMENTS[index]);
                }
                return Promise.reject('Appointment not found');
            }
            return fetchJson<Appointment>(`/appointments/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_APPOINTMENTS.findIndex(a => a.id === id);
                if (index !== -1) {
                    DEMO_APPOINTMENTS.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/appointments/${id}`, {
                method: 'DELETE',
            });
        },
        remind: (id: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/appointments/${id}/remind`, {
                method: 'POST',
            });
        },
    },
    /* BO'LIB TO'LASH — reja hisob qatorlari ustiga quriladi.
       To'lov `POST /installments/:id/pay` orqali ketadi va serverda
       kassadagi oddiy to'lov bilan AYNAN bir yo'ldan o'tadi. */
    installments: {
        getAll: (clinicId?: string, patientId?: string) => {
            if (isDemoMode()) {
                const dueOf = (planId: string) => DEMO_CHARGES
                    .filter(c => (c as any).installmentPlanId === planId && c.status !== 'Cancelled');
                return demoRead<any[]>(DEMO_INSTALLMENTS
                    .filter(p => (!patientId || p.patientId === patientId)
                        && (!clinicId || p.clinicId === clinicId))
                    .map(p => {
                        const rows = dueOf(p.id);
                        const due = rows.reduce(
                            (acc, c) => acc + Math.max(0, (c.total || 0) - (c.paidAmount || 0)), 0);
                        return { ...p, charges: rows, due, collected: (p.totalAmount || 0) - due };
                    }));
            }
            const query = new URLSearchParams();
            if (clinicId) query.append('clinicId', clinicId);
            if (patientId) query.append('patientId', patientId);
            return fetchJson<any[]>(`/installments?${query.toString()}`);
        },
        create: (data: { patientId: string; clinicId: string; chargeIds: string[]; months: number; startDate: string }) => {
            if (isDemoMode()) {
                const rows = DEMO_CHARGES.filter(c => data.chargeIds.includes(c.id));
                const total = Math.round(rows.reduce(
                    (acc, c) => acc + Math.max(0, c.total - (c.paidAmount || 0)), 0));
                const per = Math.round(total / data.months);
                const start = new Date(data.startDate);
                const items = Array.from({ length: data.months }, (_, i) => {
                    const d = new Date(start);
                    d.setMonth(start.getMonth() + i + 1);
                    return {
                        id: demoId('demo-item'),
                        expectedDate: d.toISOString().split('T')[0],
                        amount: i === data.months - 1 ? total - per * (data.months - 1) : per,
                        status: 'Pending' as const,
                    };
                });
                const plan: any = {
                    id: demoId('demo-ins'), clinicId: data.clinicId, patientId: data.patientId,
                    doctorId: rows[0]?.doctorId || null,
                    service: rows.map(c => c.name).join(', ').slice(0, 200),
                    totalAmount: total, totalPaid: 0,
                    startDate: data.startDate, endDate: items[items.length - 1].expectedDate,
                    status: 'Active', items,
                };
                DEMO_INSTALLMENTS.push(plan);
                rows.forEach(c => { (c as any).installmentPlanId = plan.id; });
                saveDemoData();
                return demoDone(plan);
            }
            return fetchJson<any>('/installments', { method: 'POST', body: JSON.stringify(data) });
        },
        pay: (itemId: string, paymentMethod: string, receivedByName?: string) => {
            if (isDemoMode()) {
                const plan: any = DEMO_INSTALLMENTS.find(p => p.items?.some((it: any) => it.id === itemId));
                const item: any = plan?.items?.find((it: any) => it.id === itemId);
                if (!plan || !item) return Promise.reject(new Error('Jadval qatori topilmadi'));

                /* Demo ham QATORLARGA to'laydi — aks holda namoyishda
                   kassa va bo'lib to'lash boshqa-boshqa raqam ko'rsatardi. */
                const rows = DEMO_CHARGES.filter(c => (c as any).installmentPlanId === plan.id
                    && c.status === 'Unpaid');
                if (rows.length === 0) {
                    plan.status = 'Completed';
                    saveDemoData();
                    return Promise.reject(Object.assign(
                        new Error("Qarz allaqachon to'langan — reja yopildi."),
                        { data: { code: 'ALREADY_PAID' } },
                    ));
                }
                let left = Math.min(item.amount, rows.reduce(
                    (acc, c) => acc + Math.max(0, c.total - (c.paidAmount || 0)), 0));
                for (const c of rows) {
                    if (left <= 0) break;
                    const part = Math.min(left, c.total - (c.paidAmount || 0));
                    c.paidAmount = (c.paidAmount || 0) + part;
                    if (c.paidAmount >= c.total - 0.001) { c.status = 'Paid'; c.paidAt = demoNow(); }
                    left -= part;
                }
                const patient = DEMO_PATIENTS.find(p => p.id === plan.patientId);
                const doctor = DEMO_DOCTORS.find(d => d.id === plan.doctorId);
                const tx: Transaction = {
                    id: demoId('demo-tx'),
                    patientId: plan.patientId,
                    patientName: patient ? `${patient.lastName} ${patient.firstName}` : 'Bemor',
                    clinicId: plan.clinicId,
                    doctorId: plan.doctorId,
                    doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : '',
                    amount: item.amount,
                    date: demoLocalDay(new Date()),
                    service: plan.service,
                    type: paymentMethod as any,
                    status: 'Paid',
                    receivedByName,
                } as Transaction;
                DEMO_TRANSACTIONS.unshift(tx);

                item.status = 'Paid';
                item.paidDate = demoLocalDay(new Date());
                item.transactionId = tx.id;
                plan.totalPaid += item.amount;
                if (plan.items.every((it: any) => it.status === 'Paid')) plan.status = 'Completed';
                saveDemoData();
                return demoDone({ success: true as const, transaction: tx });
            }
            return fetchJson<any>(`/installments/${itemId}/pay`, {
                method: 'POST',
                body: JSON.stringify({ paymentMethod, receivedByName }),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const idx = DEMO_INSTALLMENTS.findIndex(p => p.id === id);
                if (idx !== -1) {
                    // Qatorlar QOLADI — faqat rejadan uziladi
                    DEMO_CHARGES.forEach(c => {
                        if ((c as any).installmentPlanId === id) (c as any).installmentPlanId = null;
                    });
                    DEMO_INSTALLMENTS.splice(idx, 1);
                    saveDemoData();
                }
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/installments/${id}`, { method: 'DELETE' });
        }
    },
    transactions: {
        /* `range` — kirishda butun tarixni tortmaslik uchun (FIX-PLAN 10).
           Berilmasa xatti-harakat ILGARIGIDEK: hammasi qaytadi. */
        getAll: (clinicId: string, range?: { from?: string; to?: string; limit?: number; patientId?: string; doctorId?: string }) => {
            if (isDemoMode()) return Promise.resolve(DEMO_TRANSACTIONS);
            const q = new URLSearchParams({ clinicId });
            if (range?.from) q.set('from', range.from);
            if (range?.to) q.set('to', range.to);
            if (range?.limit) q.set('limit', String(range.limit));
            if (range?.patientId) q.set('patientId', range.patientId);
            if (range?.doctorId) q.set('doctorId', range.doctorId);
            return fetchJson<Transaction[]>(`/transactions?${q}`);
        },
        create: (data: Omit<Transaction, 'id'>) => {
            if (isDemoMode()) {
                // Prevent duplicates in demo mode
                const exists = DEMO_TRANSACTIONS.some(t =>
                    t.patientId === data.patientId &&
                    t.date === data.date &&
                    t.amount === data.amount &&
                    t.service === data.service
                );

                if (exists) {
                    return Promise.reject('Duplicate transaction');
                }

                const newTx = { ...data, id: `demo-tx-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Transaction;
                DEMO_TRANSACTIONS.push(newTx);
                saveDemoData();
                return Promise.resolve(newTx);
            }
            return fetchJson<Transaction>('/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Transaction>) => {
            if (isDemoMode()) {
                const index = DEMO_TRANSACTIONS.findIndex(t => t.id === id);
                if (index !== -1) {
                    DEMO_TRANSACTIONS[index] = { ...DEMO_TRANSACTIONS[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_TRANSACTIONS[index]);
                }
                return Promise.reject('Transaction not found');
            }
            const url = `/transactions/${id}`;
            return fetchJson<Transaction>(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_TRANSACTIONS.findIndex(t => t.id === id);
                if (index !== -1) {
                    DEMO_TRANSACTIONS.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/transactions/${id}`, { method: 'DELETE' });
        },
    },
    expenses: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_EXPENSES);
            return fetchJson<Expense[]>(`/expenses?clinicId=${clinicId}`);
        },
        create: (data: Omit<Expense, 'id'>) => {
            if (isDemoMode()) {
                const newExpense = { ...data, id: `demo-exp-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Expense;
                DEMO_EXPENSES.push(newExpense);
                saveDemoData();
                return Promise.resolve(newExpense);
            }
            return fetchJson<Expense>('/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Expense>) => {
            if (isDemoMode()) {
                const index = DEMO_EXPENSES.findIndex(e => e.id === id);
                if (index !== -1) {
                    DEMO_EXPENSES[index] = { ...DEMO_EXPENSES[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_EXPENSES[index]);
                }
                return Promise.reject('Expense not found');
            }
            return fetchJson<Expense>(`/expenses/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_EXPENSES.findIndex(e => e.id === id);
                if (index !== -1) {
                    DEMO_EXPENSES.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/expenses/${id}`, { method: 'DELETE' });
        },
    },
    cashRegister: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([...DEMO_CASH_REGISTER]);
            return fetchJson<CashRegisterDay[]>(`/cash-register?clinicId=${clinicId}`);
        },
        close: (data: CashCloseInput) => {
            if (isDemoMode()) {
                const shift = data.shift || 1;
                const closure: CashRegisterDay = {
                    id: `demo-close-${data.date}-${shift}`,
                    clinicId: data.clinicId,
                    date: data.date,
                    shift,
                    shiftStart: data.shiftStart || null,
                    shiftEnd: data.shiftEnd || null,
                    openingCash: data.openingCash || 0,
                    countedCash: data.countedCash,
                    expectedCash: data.expectedCash,
                    difference: data.countedCash - data.expectedCash,
                    countedCard: data.countedCard ?? null,
                    expectedCard: data.expectedCard ?? null,
                    countedClick: data.countedClick ?? null,
                    expectedClick: data.expectedClick ?? null,
                    note: data.note || null,
                    closedByName: 'Demo',
                    closedByRole: 'CLINIC_ADMIN',
                    closedAt: new Date().toISOString(),
                };
                const i = DEMO_CASH_REGISTER.findIndex(c => c.date === data.date && c.shift === shift);
                if (i !== -1) DEMO_CASH_REGISTER[i] = closure; else DEMO_CASH_REGISTER.push(closure);
                return Promise.resolve(closure);
            }
            return fetchJson<CashRegisterDay>('/cash-register/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        reopen: (date: string, shift?: number) => {
            if (isDemoMode()) {
                const i = DEMO_CASH_REGISTER.findIndex(c => c.date === date && (!shift || c.shift === shift));
                if (i !== -1) DEMO_CASH_REGISTER.splice(i, 1);
                return Promise.resolve({ success: true as const });
            }
            const q = shift ? `?shift=${shift}` : '';
            return fetchJson<{ success: true }>(`/cash-register/${date}${q}`, { method: 'DELETE' });
        },
    },
    cashMovements: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([...DEMO_CASH_MOVEMENTS]);
            return fetchJson<CashMovement[]>(`/cash-movements?clinicId=${clinicId}`);
        },
        create: (data: Omit<CashMovement, 'id' | 'createdAt' | 'createdByName'>) => {
            if (isDemoMode()) {
                const m = { ...data, id: `demo-mv-${Date.now()}`, createdAt: new Date().toISOString(), createdByName: 'Demo' } as CashMovement;
                DEMO_CASH_MOVEMENTS.push(m);
                return Promise.resolve(m);
            }
            return fetchJson<CashMovement>('/cash-movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_CASH_MOVEMENTS.findIndex(m => m.id === id);
                if (i !== -1) DEMO_CASH_MOVEMENTS.splice(i, 1);
                return Promise.resolve({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/cash-movements/${id}`, { method: 'DELETE' });
        },
    },
    cashAudit: {
        getAll: (clinicId: string, date?: string) => {
            if (isDemoMode()) return Promise.resolve([] as CashAuditLog[]);
            const q = date ? `&date=${date}` : '';
            return fetchJson<CashAuditLog[]>(`/cash-audit?clinicId=${clinicId}${q}`);
        },
    },
    /* HAMMA XODIM — BITTA RO'YXAT.

       «Klinikada kim ishlaydi?» degan savolga javob berish uchun TO'RTTA
       so'rov yuborish va natijani qo'lda birlashtirish kerak edi.
       Sozlamalarda ham shuning uchun to'rtta alohida vkladka turardi.

       Demoda ham xuddi shunday yig'iladi — namoyishda ekran bo'sh
       qolmasin. */
    staff: {
        getAll: () => {
            if (isDemoMode()) {
                const withRole = (rows: any[], role: string) => rows.map(r => ({ ...r, role }));
                return demoRead<any[]>([
                    ...withRole(DEMO_DOCTORS, 'DOCTOR'),
                    ...withRole(DEMO_RECEPTIONISTS, 'RECEPTIONIST'),
                    ...withRole(DEMO_LAB_TECHNICIANS, 'LAB_TECHNICIAN'),
                    ...withRole(DEMO_NURSES, 'NURSE'),
                ].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)));
            }
            return fetchJson<any[]>('/staff');
        },
    },
    doctors: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_DOCTORS);
            return fetchJson<Doctor[]>(`/doctors?clinicId=${clinicId}`);
        },
        create: (data: Omit<Doctor, 'id'>) => {
            if (isDemoMode()) {
                const newDoc = { ...data, id: `demo-doctor-${Date.now()}` } as Doctor;
                DEMO_DOCTORS.push(newDoc);
                saveDemoData();
                return Promise.resolve(newDoc);
            }
            return fetchJson<Doctor>('/doctors', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Doctor>) => {
            if (isDemoMode()) {
                const index = DEMO_DOCTORS.findIndex(d => d.id === id);
                if (index !== -1) {
                    DEMO_DOCTORS[index] = { ...DEMO_DOCTORS[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_DOCTORS[index]);
                }
                return Promise.reject('Doctor not found');
            }
            return fetchJson<Doctor>(`/doctors/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_DOCTORS.findIndex(d => d.id === id);
                if (index !== -1) {
                    DEMO_DOCTORS.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/doctors/${id}`, {
                method: 'DELETE',
            });
        },
    },
    receptionists: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_RECEPTIONISTS);
            return fetchJson<Receptionist[]>(`/receptionists?clinicId=${clinicId}`);
        },
        create: (data: Omit<Receptionist, 'id'>) => {
            if (isDemoMode()) {
                const newRec = { ...data, id: `demo-rec-${Date.now()}` } as Receptionist;
                DEMO_RECEPTIONISTS.push(newRec);
                saveDemoData();
                return Promise.resolve(newRec);
            }
            return fetchJson<Receptionist>('/receptionists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Receptionist>) => {
            if (isDemoMode()) {
                const index = DEMO_RECEPTIONISTS.findIndex(r => r.id === id);
                if (index !== -1) {
                    DEMO_RECEPTIONISTS[index] = { ...DEMO_RECEPTIONISTS[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_RECEPTIONISTS[index]);
                }
                return Promise.reject('Receptionist not found');
            }
            return fetchJson<Receptionist>(`/receptionists/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_RECEPTIONISTS.findIndex(r => r.id === id);
                if (index !== -1) {
                    DEMO_RECEPTIONISTS.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/receptionists/${id}`, {
                method: 'DELETE',
            });
        },
    },
    services: {
        /* `doctorId` berilsa — shifokor bo'limining xizmatlari (S2.4).
           Kardiologga «Ginekolog konsultatsiyasi» ni yozib qo'yish
           mumkin edi (audit B-19). Bo'limi ko'rsatilmagan shifokorda
           filtr qo'llanmaydi — hamma xizmat ko'rinadi. */
        getAll: (clinicId: string, doctorId?: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_SERVICES);
            const q = new URLSearchParams({ clinicId });
            if (doctorId) q.set('doctorId', doctorId);
            return fetchJson<Service[]>(`/services?${q.toString()}`);
        },
        create: (data: Omit<Service, 'id'>) => {
            if (isDemoMode()) {
                const newService: Service = { ...data, id: Date.now() + Math.floor(Math.random() * 1000) } as Service;
                DEMO_SERVICES.push(newService);
                saveDemoData();
                return Promise.resolve(newService);
            }
            return fetchJson<Service>('/services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: number, data: Partial<Service>) => {
            if (isDemoMode()) {
                const index = DEMO_SERVICES.findIndex(s => s.id === id);
                if (index !== -1) {
                    DEMO_SERVICES[index] = { ...DEMO_SERVICES[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_SERVICES[index]);
                }
                return Promise.reject('Service not found');
            }
            return fetchJson<Service>(`/services/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        remove: (id: number) => {
            if (isDemoMode()) {
                const index = DEMO_SERVICES.findIndex(s => s.id === id);
                if (index !== -1) { DEMO_SERVICES.splice(index, 1); saveDemoData(); }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/services/${id}`, { method: 'DELETE' });
        },
    },
    categories: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) {
                return Promise.resolve(DEMO_CATEGORIES);
            }
            return fetchJson<ServiceCategory[]>(`/categories?clinicId=${clinicId}`);
        },
        create: (data: Omit<ServiceCategory, 'id'>) => {
            if (isDemoMode()) {
                const newCat = { ...data, id: `demo-cat-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as ServiceCategory;
                DEMO_CATEGORIES.push(newCat);
                saveDemoData();
                return Promise.resolve(newCat);
            }
            return fetchJson<ServiceCategory>('/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<ServiceCategory>) => {
            if (isDemoMode()) {
                const index = DEMO_CATEGORIES.findIndex(c => c.id === id);
                if (index !== -1) {
                    DEMO_CATEGORIES[index] = { ...DEMO_CATEGORIES[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_CATEGORIES[index]);
                }
                return Promise.reject('Category not found');
            }
            return fetchJson<ServiceCategory>(`/categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_CATEGORIES.findIndex(c => c.id === id);
                if (index !== -1) {
                    DEMO_CATEGORIES.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/categories/${id}`, {
                method: 'DELETE',
            });
        },
    },
    /* AI kalitlari — Sozlamalar > «AI yordamchi».
       Kalitning O’ZI hech qachon qaytmaydi: server faqat «bormi, qayerdan
       kelgan va oxirgi 4 belgisi» ni beradi. Shuning uchun formada
       maydonlar bo’sh turadi — bo’sh qoldirilsa kalit o’zgarmaydi. */
    /* DEMO TO'SIG'I SHART. Demo tokeni soxta ('demo-token'), server esa
       unga 401 qaytaradi — 401 sozlamasi bo'yicha sessiya tozalanadi va
       odam kirish sahifasiga uloqtiriladi. Ya'ni to'siqsiz «AI yordamchi»
       vkladkasini ochishning O'ZI namoyish nusxasidan chiqarib yuborardi.

       AI ni demoda ishlatib bo'lmaydi va bu to'g'ri: kalit klinikaning
       o'z serverida turadi. Shuning uchun o'qish «sozlanmagan» holatini
       ko'rsatadi, yozish esa sababini tushuntiradi — `AiAssistant.tsx`
       dagi bilan bir xil ohangda. */
    ai: {
        getSettings: () => {
            if (isDemoMode()) return demoRead<AiSettingsResponse>({
                success: true, preferred: null,
                providers: DEMO_AI_PROVIDERS.map(p => ({ ...p, configured: false, masked: null, source: null })),
            });
            return fetchJson<AiSettingsResponse>('/ai/settings');
        },
        /* Bo’sh satr = O’CHIRISH, yuborilmagan maydon = tegilmaydi.
           Shu farq bo’lmasa kalitni olib tashlashning yo’li qolmasdi. */
        saveSettings: (payload: { keys?: Record<string, string>; preferred?: string | null }) => {
            if (isDemoMode()) return Promise.reject(new Error(
                'AI kaliti namoyish nusxasida saqlanmaydi — u klinikadagi serverda turadi.'));
            return fetchJson<AiSettingsResponse>('/ai/settings', {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
        },
        test: () => {
            if (isDemoMode()) return demoRead<{ success: boolean; message: string; sample?: string }>({
                success: false,
                message: 'Namoyish nusxasida server yo\'q — ulanishni klinikadagi o\'rnatmada sinash mumkin.',
            });
            return fetchJson<{ success: boolean; message: string; sample?: string }>('/ai/settings/test', {
                method: 'POST',
            });
        },
    },

    clinics: {
        getById: (id: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_CLINIC);
            return fetchJson<Clinic>(`/clinics/${id}`);
        },
        getAll: () => {
            if (isDemoMode()) return Promise.resolve(DEMO_CLINICS);
            return fetchJson<Clinic[]>('/clinics');
        },
        create: (data: Omit<Clinic, 'id'>) => {
            if (isDemoMode()) {
                const newClinic = { ...data, id: `demo-clinic-${Date.now()}` } as Clinic;
                DEMO_CLINICS.push(newClinic);
                saveDemoData();
                return Promise.resolve(newClinic);
            }
            return fetchJson<Clinic>('/clinics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Clinic>) => {
            if (isDemoMode()) {
                const index = DEMO_CLINICS.findIndex(c => c.id === id);
                if (index !== -1) {
                    DEMO_CLINICS[index] = { ...DEMO_CLINICS[index], ...data };
                    if (id === DEMO_CLINIC.id) {
                        Object.assign(DEMO_CLINIC, DEMO_CLINICS[index]);
                    }
                    saveDemoData();
                    return Promise.resolve(DEMO_CLINICS[index]);
                }
                throw new Error('Clinic not found');
            }
            return fetchJson<Clinic>(`/clinics/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        // Klinika admini o'z klinikasining umumiy sozlamalarini yangilashi uchun
        // (PUT /clinics/:id SUPER_ADMIN talab qiladi, bu endpoint CLINIC_ADMIN uchun ochiq)
        updateGeneral: (id: string, data: Partial<Clinic>) => {
            if (isDemoMode()) {
                const index = DEMO_CLINICS.findIndex(c => c.id === id);
                if (index !== -1) {
                    DEMO_CLINICS[index] = { ...DEMO_CLINICS[index], ...data };
                    if (id === DEMO_CLINIC.id) {
                        Object.assign(DEMO_CLINIC, DEMO_CLINICS[index]);
                    }
                    saveDemoData();
                    return Promise.resolve(DEMO_CLINICS[index]);
                }
                throw new Error('Clinic not found');
            }
            return fetchJson<Clinic>(`/clinics/${id}/general`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_CLINICS.findIndex(c => c.id === id);
                if (index !== -1) {
                    DEMO_CLINICS.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/clinics/${id}`, {
                method: 'DELETE',
            });
        },
        // Ruxsatlar (Sozlamalar → Ruxsatlar): rol bo'yicha modul/ma'lumot ko'rish huquqlari
        updateAccessControl: (id: string, accessControl: any) => {
            if (isDemoMode()) {
                (DEMO_CLINIC as any).accessControl = JSON.stringify(accessControl);
                saveDemoData();
                return Promise.resolve({ success: true as const, clinic: DEMO_CLINIC });
            }
            return fetchJson<{ success: true; clinic: Clinic }>(`/clinics/${id}/access-control`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessControl }),
            });
        },
        // Kassa sozlamalari (kuniga nechta smena)
        updateCashSettings: (id: string, cashShiftsPerDay: number) => {
            if (isDemoMode()) {
                (DEMO_CLINIC as any).cashShiftsPerDay = cashShiftsPerDay;
                saveDemoData();
                return Promise.resolve({ success: true as const, clinic: DEMO_CLINIC });
            }
            return fetchJson<{ success: true; clinic: Clinic }>(`/clinics/${id}/cash-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cashShiftsPerDay }),
            });
        },
        updateSettings: (id: string, data: { botToken?: string, ownerPhone?: string }) => {
            if (isDemoMode()) {
                if (data.botToken !== undefined) DEMO_CLINIC.botToken = data.botToken;
                if (data.ownerPhone !== undefined) DEMO_CLINIC.ownerPhone = data.ownerPhone;
                saveDemoData();
                return Promise.resolve({ success: true, clinic: DEMO_CLINIC });
            }
            return fetchJson<{ success: true; clinic: Clinic }>(`/clinics/${id}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        testDmed: (id: string, data: { dmedApiKey: string, dmedApiSecret: string }) => {
            if (isDemoMode()) return Promise.resolve({ valid: true });
            return fetchJson<{ valid: boolean; error?: string }>(`/clinics/${id}/dmed-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        updateDmedSettings: (id: string, data: any) => {
            if (isDemoMode()) {
                Object.assign(DEMO_CLINIC, data);
                saveDemoData();
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/clinics/${id}/dmed-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        getPrepaymentSettings: (id: string) => {
            if (isDemoMode()) return Promise.resolve({ prepaymentEnabled: false, prepaymentCardNumber: '', prepaymentAmount: 0 });
            return fetchJson<{ prepaymentEnabled: boolean; prepaymentCardNumber: string; prepaymentAmount: number }>(`/clinics/${id}/prepayment-settings`);
        },
        savePrepaymentSettings: (id: string, data: { prepaymentEnabled: boolean; prepaymentCardNumber: string; prepaymentAmount: number }) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{ success: true }>(`/clinics/${id}/prepayment-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
    },
    sms: {
        getSettings: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve({
                notificationMode: 'telegram_only',
                eskizEmail: '',
                hasPassword: false,
                isConnected: false,
                eskizTokenExpiry: null
            });
            return fetchJson<any>(`/clinics/${clinicId}/sms-settings`);
        },
        saveSettings: (clinicId: string, data: any) => {
            if (isDemoMode()) return Promise.resolve({ success: true });
            return fetchJson<{success: true}>(`/clinics/${clinicId}/sms-settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        getBalance: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve({ balance: 0 });
            return fetchJson<any>(`/clinics/${clinicId}/sms-balance`);
        },
        testSend: (clinicId: string, phone: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true, message: 'Test SMS (Demo)' });
            return fetchJson<{success: true, message: string}>(`/clinics/${clinicId}/sms-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
        }
    },
    /* `plans` OLIB TASHLANDI — tarif/obuna tushunchasi bilan birga.
       XClinic bitta o'rnatma = bitta klinika, sotilmaydi. Endpointlar ham
       serverdan olib tashlandi. */
    diagnoses: {
        /* NAMOYISH NUSXASIDA ISHLAYDI.

           Ilgari bu ikkalasi demo qo'riqchisisiz edi va `fetchJson` ga
           tushib «Demo rejimida bu ma'lumot mavjud emas» xatosini berardi.
           Ya'ni namoyishda TASHXIS QO'YIB BO'LMASDI — shifokorning eng
           asosiy amali. Bu klinikadagi namoyishda aynan shunday chiqdi. */
        searchCodes: (query: string) => {
            if (isDemoMode()) {
                const q = query.trim().toLowerCase();
                return Promise.resolve(DEMO_ICD10.filter(c =>
                    c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
                    || (c.nameRu || '').toLowerCase().includes(q)
                ).slice(0, 12));
            }
            return fetchJson<ICD10Code[]>(`/icd10?query=${query}`);
        },
        add: (data: Omit<PatientDiagnosis, 'id' | 'icd10'>) => {
            if (isDemoMode()) {
                /* Server bilan bir xil: qabulda birinchisi asosiy, keyingilari
                   yondosh; qabulsiz tashxisda tur yo'q (migratsiya 0040). */
                let kind: PatientDiagnosis['kind'] = null;
                if (data.visitId) {
                    const mains = DEMO_DIAGNOSES.filter(d => d.visitId === data.visitId && d.kind === 'Main');
                    kind = data.kind || (mains.length ? 'Concomitant' : 'Main');
                    if (kind === 'Main') mains.forEach(d => { d.kind = 'Concomitant'; });
                }
                const created = {
                    ...data,
                    kind,
                    id: demoId('demo-dx'),
                    icd10: DEMO_ICD10.find(c => c.code === data.code),
                } as PatientDiagnosis;
                DEMO_DIAGNOSES.unshift(created);
                saveDemoData();
                return demoDone(created);
            }
            return fetchJson<PatientDiagnosis>('/diagnoses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        /** Asosiy / yondosh / asorat. Qabulda asosiy bitta — eskisi yondoshga tushadi */
        setKind: (id: string, kind: DiagnosisKind) => {
            if (isDemoMode()) {
                const dx = DEMO_DIAGNOSES.find(d => d.id === id);
                if (!dx?.visitId) return Promise.reject(new Error("Qabulsiz tashxisda tur bo'lmaydi"));
                if (kind === 'Main') {
                    DEMO_DIAGNOSES.forEach(d => { if (d.visitId === dx.visitId && d.kind === 'Main' && d.id !== id) d.kind = 'Concomitant'; });
                }
                dx.kind = kind;
                saveDemoData();
                return demoDone({ ...dx });
            }
            return fetchJson<PatientDiagnosis>(`/diagnoses/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind }),
            });
        },
        getByPatient: (patientId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_DIAGNOSES.filter(d => d.patientId === patientId));
            return fetchJson<PatientDiagnosis[]>(`/diagnoses?patientId=${patientId}`);
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_DIAGNOSES.findIndex(d => d.id === id);
                if (index !== -1) {
                    DEMO_DIAGNOSES.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/diagnoses/${id}`, {
                method: 'DELETE',
            });
        },
    },
    // ─── Qabul (Visit) — barcha modullar shunga bog'lanadi ──────────────────
    visits: {
        getAll: (params?: { patientId?: string; date?: string; departmentId?: string; status?: string }) => {
            if (isDemoMode()) return demoRead<Visit[]>(DEMO_VISITS.filter(v =>
                (!params?.patientId || v.patientId === params.patientId)
                && (!params?.date || v.date === params.date)
                && (!params?.departmentId || v.departmentId === params.departmentId)
                && (!params?.status || v.status === params.status)
            ).sort((a, b) => b.date.localeCompare(a.date)).map(demoVisitFull));
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<Visit[]>(`/visits${qs ? `?${qs}` : ''}`);
        },
        getById: (id: string) =>
            isDemoMode()
                ? (DEMO_VISITS.find(v => v.id === id)
                    ? demoRead<Visit>(demoVisitFull(DEMO_VISITS.find(v => v.id === id)!))
                    : demoMissing<Visit>('bu qabul'))
                : fetchJson<Visit>(`/visits/${id}`),
        /** `force` — bugun shu bo'limda qabul ochilgan bo'lsa ham ataylab
         *  yangisini ochish (ertalab va kechqurun alohida murojaat).
         *  Bo'lmasa server 409 va mavjud `visitId` ni qaytaradi. */
        create: (data: Partial<Visit> & { force?: boolean }) => {
            /* Demoda ham HAQIQATAN ochiladi: registraturadagi «Keldi»
               tugmasi namoyishning asosiy oqimi — bosilganda navbatda
               yangi qator paydo bo'lishi kerak, xato emas. */
            if (isDemoMode()) {
                const visit: Visit = {
                    id: `demo-visit-${Date.now()}`,
                    patientId: data.patientId || '',
                    appointmentId: data.appointmentId,
                    date: data.date || todayISO(),
                    checkInTime: new Date().toISOString(),
                    /* Shifokor o'ziga ochsa — darhol «Qabulda» (server bilan bir xil) */
                    status: data.status === 'In Progress' ? 'In Progress' : 'Waiting',
                    ...(data.status === 'In Progress' ? { startedAt: new Date().toISOString() } : {}),
                    complaints: data.complaints,
                    clinicId: 'demo-clinic-1',
                    departmentId: data.departmentId || 'demo-ter',
                    doctorId: data.doctorId,
                    doctorName: data.doctorName,
                    queueNumber: DEMO_VISITS.filter(v => v.date === todayISO()).length + 1,
                    calledAt: null,
                    patient: DEMO_PATIENTS.find(p => p.id === data.patientId),
                    ...demoReferral(data),
                };
                DEMO_VISITS.push(visit);
                return demoWrote<Visit>(visit);
            }
            return fetchJson<Visit>('/visits', { method: 'POST', body: JSON.stringify(data) });
        },
        // Qabulga xizmat qo'shish — narx shu orqali kassaga tushadi
        addProcedure: (visitId: string, data: { serviceId?: number; procedureName?: string; price?: number; discount?: number; notes?: string; doctorId?: string; doctorName?: string }) =>
            isDemoMode() ? (() => {
                /* Qabulga xizmat qo'shilsa, hisob qatori ham paydo bo'ladi —
                   registraturadagi «Keldi» dan keyin kassada ish ko'rinishi
                   uchun. Aks holda zanjir yarim yo'lda uzilardi. */
                const svc = DEMO_SERVICES.find(x => Number(x.id) === Number(data.serviceId));
                const visit = DEMO_VISITS.find(v => v.id === visitId);
                const price = data.price ?? svc?.price ?? 0;
                const row: VisitCharge = {
                    id: `demo-charge-${Date.now()}`,
                    clinicId: 'demo-clinic-1',
                    visitId,
                    patientId: visit?.patientId ?? null,
                    patientName: visit ? demoName(visit.patientId) : '',
                    source: 'Service',
                    sourceId: data.serviceId != null ? String(data.serviceId) : null,
                    name: data.procedureName || svc?.name || 'Xizmat',
                    quantity: 1,
                    unitPrice: price,
                    discount: data.discount ?? 0,
                    total: price - (data.discount ?? 0),
                    status: 'Unpaid',
                    paidAmount: 0,
                    paidAt: null,
                    createdAt: new Date().toISOString(),
                    createdByName: 'Registratura',
                    visit: visit ? { id: visit.id, date: visit.date, queueNumber: visit.queueNumber, departmentId: visit.departmentId } : undefined,
                };
                DEMO_CHARGES.push(row);
                return demoWrote<any>(row);
            })() : fetchJson<any>(`/visits/${visitId}/procedures`, { method: 'POST', body: JSON.stringify(data) }),
        removeProcedure: (procedureId: string) => {
            if (isDemoMode()) {
                /* `addProcedure` hisob qatorini yaratadi — o'chirish ham
                   o'sha qatorni olib tashlashi kerak, aks holda qo'shilgan
                   xizmat kassada abadiy osilib qoladi. */
                const i = DEMO_CHARGES.findIndex(c => c.id === procedureId);
                if (i !== -1) {
                    if ((DEMO_CHARGES[i].paidAmount || 0) > 0) {
                        return Promise.reject(new Error("To'langan xizmatni o'chirib bo'lmaydi."));
                    }
                    DEMO_CHARGES.splice(i, 1);
                }
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/visit-procedures/${procedureId}`, { method: 'DELETE' });
        },
        /** `init.keepalive` — sahifa yopilayotganda ketadigan yozuv (o'zi
         *  saqlanadigan varaq): brauzer so'rovni oxiriga yetkazadi. */
        update: (id: string, data: Partial<Visit>, init?: Pick<RequestInit, 'keepalive'>) => {
            if (isDemoMode()) {
                const v = DEMO_VISITS.find(x => x.id === id);
                if (v) {
                    /* Serverdagi bilan bir xil (`PUT /api/visits/:id`): kabinetga
                       kirgan vaqt holat HAQIQATAN o'zgarganda yoziladi. */
                    if (data.status === 'In Progress' && v.status !== 'In Progress') v.startedAt = new Date().toISOString();
                    if (data.status === 'Waiting') v.startedAt = null;
                    Object.assign(v, data);
                    if (data.status === 'Completed' && !v.checkOutTime) v.checkOutTime = new Date().toISOString();
                }
                return demoWrote<Visit>(v as Visit);
            }
            return fetchJson<Visit>(`/visits/${id}`, { method: 'PUT', body: JSON.stringify(data), ...init });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_VISITS.findIndex(v => v.id === id);
                if (i === -1) return Promise.reject(new Error('Qabul topilmadi.'));
                /* To'lov o'tgan qabul o'chirilmaydi — pul qatorlari
                   egasiz qolib ketadi. Serverdagi bilan bir xil to'siq. */
                const paid = DEMO_CHARGES.some(c => c.visitId === id && (c.paidAmount || 0) > 0);
                if (paid) return Promise.reject(new Error("To'lov qilingan qabulni o'chirib bo'lmaydi."));
                DEMO_VISITS.splice(i, 1);
                for (let k = DEMO_CHARGES.length - 1; k >= 0; k--) {
                    if (DEMO_CHARGES[k].visitId === id) DEMO_CHARGES.splice(k, 1);
                }
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/visits/${id}`, { method: 'DELETE' });
        },
        // Navbatni chaqirish — tablo shu holatni ko'rsatadi
        call: (id: string) => {
            if (isDemoMode()) {
                const v = DEMO_VISITS.find(x => x.id === id);
                if (v) { v.status = 'Called'; v.calledAt = new Date().toISOString(); }
                return demoWrote<Visit>(v as Visit);
            }
            return fetchJson<Visit>(`/visits/${id}/call`, { method: 'POST' });
        },
    },

    // ─── Ombor: harakatlar, retsept, ogohlantirishlar ───────────────────────
    stock: {
        movements: (params?: { itemId?: string; visitId?: string; patientId?: string; from?: string; to?: string }) => {
            if (isDemoMode()) return demoRead<StockMovement[]>(DEMO_STOCK_MOVES);
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<StockMovement[]>(`/stock-movements${qs ? `?${qs}` : ''}`);
        },
        receive: (data: { itemId: string; quantity: number; cost?: number; batchNumber?: string; expiryDate?: string; note?: string; userName?: string }) => {
            if (isDemoMode()) {
                const move = demoStockMove('In', data.itemId, Math.abs(data.quantity), 'Yetkazib berish', data);
                /* Partiya raqami yoki muddat berilgan bo'lsa — «Partiya va
                   muddat» tabida ham ko'rinsin, aks holda kirim qilingan
                   dori u yerda paydo bo'lmaydi. */
                if (data.batchNumber || data.expiryDate) {
                    DEMO_BATCHES.unshift({
                        id: demoId('demo-batch'), itemId: data.itemId,
                        batchNumber: data.batchNumber || null,
                        expiryDate: data.expiryDate || null,
                        quantity: Math.abs(data.quantity),
                        cost: data.cost || 0,
                        receivedAt: demoNow(),
                        expired: !!data.expiryDate && data.expiryDate < todayISO(),
                    } as InventoryBatch);
                }
                return demoDone(move);
            }
            return fetchJson<any>('/stock-movements/in', { method: 'POST', body: JSON.stringify(data) });
        },
        /** Chiqim. `patientId` bilan — bemor kartasidan sarflangan material (0028). */
        /* `force: true` — muddati o'tgan partiyani ATAYLAB sarflash (S2.5).
           Serversiz to'sib bo'lmaydi: brauzerda partiyalar ro'yxati yo'q. */
        issue: (data: { itemId: string; quantity: number; reason?: string; note?: string; userName?: string; patientId?: string; visitId?: string; force?: boolean }) => {
            if (isDemoMode()) {
                const item = demoItem(data.itemId);
                const want = Math.abs(data.quantity);
                /* Qoldiqdan ko'p chiqim — serverdagi bilan bir xil rad javobi.
                   Demoda ham to'sib qo'yamiz: aks holda ekranda manfiy
                   qoldiq paydo bo'ladi va bu xato taassurot qoldiradi. */
                if (item && want > (item.quantity || 0)) {
                    return Promise.reject(new Error(
                        `Omborda yetarli emas: ${item.name} — qoldiq ${item.quantity} ${item.unit || 'dona'}.`));
                }
                return demoDone(demoStockMove('Out', data.itemId, -want, data.reason || 'Qabulda ishlatildi', data));
            }
            return fetchJson<any>('/stock-movements/out', { method: 'POST', body: JSON.stringify(data) });
        },
        /** Xato yozilgan chiqimni bekor qiladi — teskari harakat yoziladi, o'chirilmaydi. */
        reverse: (movementId: string, data?: { note?: string; userName?: string }) => {
            if (isDemoMode()) {
                const orig = DEMO_STOCK_MOVES.find(m => m.id === movementId);
                if (!orig) return Promise.reject(new Error('Harakat topilmadi.'));
                const back = demoStockMove('Adjust', orig.itemId, -orig.quantity,
                    'Bekor qilindi', { note: data?.note, userName: data?.userName });
                /* Asl qator TARIXDA qoladi, faqat belgilanadi — serverdagi
                   qoida (0028) bilan bir xil. */
                const log = DEMO_INVENTORY_LOGS.find(l => l.itemId === orig.itemId && l.change === orig.quantity);
                if (log) log.reversed = true;
                saveDemoData();
                return demoDone(back);
            }
            return fetchJson<any>(`/stock-movements/${movementId}/reverse`, { method: 'POST', body: JSON.stringify(data || {}) });
        },
        /** Bo'limlar orasida ko'chirish. Umumiy qoldiq O'ZGARMAYDI — tovar
         *  klinika ichida qoladi, faqat 'Transfer' qatori yoziladi. */
        transfer: (data: { itemId: string; quantity: number; fromDepartmentId?: string; toDepartmentId: string; note?: string; userName?: string }) => {
            if (isDemoMode()) {
                /* Umumiy qoldiq O'ZGARMAYDI — shuning uchun `delta` nol.
                   Faqat harakat qatori yoziladi. */
                const to = DEMO_DEPARTMENTS.find(d => d.id === data.toDepartmentId);
                return demoDone(demoStockMove('Adjust', data.itemId, 0,
                    `Ko'chirildi: ${to?.name || "bo'lim"}`, data));
            }
            return fetchJson<any>('/stock-movements/transfer', { method: 'POST', body: JSON.stringify(data) });
        },
        // Inventarizatsiya — haqiqiy qoldiqqa tenglashtirish
        adjust: (data: { itemId: string; actualQuantity: number; note?: string; userName?: string }) => {
            if (isDemoMode()) {
                const item = demoItem(data.itemId);
                const delta = data.actualQuantity - (item?.quantity || 0);
                return demoDone(demoStockMove('Adjust', data.itemId, delta, 'Inventarizatsiya', data));
            }
            return fetchJson<any>('/stock-movements/adjust', { method: 'POST', body: JSON.stringify(data) });
        },
        // Mahsulot xossalari (narx, sarflanadigan bayrog'i). Miqdor bu yerda o'zgarmaydi.
        updateItem: (id: string, data: { name?: string; unit?: string; minQuantity?: number; price?: number; isMedication?: boolean; isConsumable?: boolean; departmentId?: string | null }) => {
            if (isDemoMode()) {
                const idx = DEMO_INVENTORY.findIndex(i => i.id === id);
                if (idx === -1) return Promise.reject(new Error('Mahsulot topilmadi.'));
                DEMO_INVENTORY[idx] = { ...DEMO_INVENTORY[idx], ...data, updatedAt: demoNow() } as InventoryItem;
                saveDemoData();
                return demoDone(DEMO_INVENTORY[idx]);
            }
            return fetchJson<any>(`/inventory-items/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        alerts: (days = 60) => {
            if (isDemoMode()) {
                /* Ilgari bu yerda qat'iy bo'sh javob turardi va Ombor
                   ekranidagi «Ogohlantirishlar» bloki demoda HAR DOIM bo'sh
                   chiqardi — modulning eng ko'rsatishga arzigulik qismi
                   ko'rinmasdi. Endi ikkalasi ham demo ma'lumotidan sanaladi. */
                const limit = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                return demoRead<InventoryAlerts>({
                    expiring: DEMO_BATCHES.filter(b => b.expiryDate && b.expiryDate <= limit && b.quantity > 0),
                    lowStock: DEMO_INVENTORY
                        .filter(i => (i.quantity || 0) <= (i.minQuantity || 0))
                        .map(i => ({ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity, minQuantity: i.minQuantity })),
                });
            }
            return fetchJson<InventoryAlerts>(`/inventory-alerts?days=${days}`);
        },
    },
    recipes: {
        get: (serviceId?: number) =>
            isDemoMode()
                ? demoRead<ServiceRecipeLine[]>(serviceId ? DEMO_RECIPES.filter(r => r.serviceId === serviceId) : [...DEMO_RECIPES])
                : fetchJson<ServiceRecipeLine[]>(`/service-recipes${serviceId ? `?serviceId=${serviceId}` : ''}`),
        save: (serviceId: number, lines: { itemId: string; quantity: number; note?: string }[]) => {
            if (isDemoMode()) {
                /* Saqlash — ALMASHTIRISH, qo'shish emas: forma butun
                   ro'yxatni yuboradi, o'chirilgan qator ham shunda bilinadi. */
                for (let i = DEMO_RECIPES.length - 1; i >= 0; i--) {
                    if (DEMO_RECIPES[i].serviceId === serviceId) DEMO_RECIPES.splice(i, 1);
                }
                const saved = lines.map(l => demoRecipeLine(serviceId, l));
                DEMO_RECIPES.push(...saved);
                return demoDone(saved);
            }
            return fetchJson<ServiceRecipeLine[]>(`/service-recipes/${serviceId}`, { method: 'PUT', body: JSON.stringify({ lines }) });
        },
        cost: (serviceId: number) => {
            if (isDemoMode()) {
                /* Tannarx retseptdan sanaladi — nol qaytarilsa «Ulush»
                   ustuni har doim 0% ko'rsatadi va ekran ma'nosiz bo'ladi. */
                const lines = DEMO_RECIPES.filter(r => r.serviceId === serviceId);
                const price = DEMO_SERVICES.find(s => s.id === serviceId)?.price || 0;
                const cost = lines.reduce((s, l) => s + l.quantity * (l.item?.price || 0), 0);
                const margin = price - cost;
                return demoRead<ServiceCost>({
                    serviceId, price, cost, margin,
                    marginPercent: price > 0 ? Math.round((margin / price) * 100) : 0,
                    lines: lines.length,
                });
            }
            return fetchJson<ServiceCost>(`/service-recipes/${serviceId}/cost`);
        },
    },

    /* ─── Klinik kontur: bemor tarixi, allergiya, natija belgisi ────────────
       `summary` — shifokorning ish stolidagi "avval nima bo'lgan" paneli.
       Bitta so'rov: allergiya, surunkali, oldingi qabullar, tahlillar, dorilar. */
    /* Bemor kartasidagi klinik qatlam. Demo qoplamasi ALOHIDA muhim:
       sarlavha va anamnez (`Anamnesis`) bemor kartasining ICHIDA turadi, ya'ni bu
       yerdagi xato namoyishning eng asosiy oqimida — «bemor qo'shdim,
       kartasini ochdim» — ko'rinib qoladi. */
    clinical: {
        summary: (patientId: string) => {
            if (isDemoMode()) return demoRead<any>(demoClinicalSummary(patientId));
            return fetchJson<any>(`/patients/${patientId}/summary`);
        },
        allergies: (patientId: string) => {
            if (isDemoMode()) return demoRead<any[]>(DEMO_ALLERGIES.filter(a => a.patientId === patientId));
            return fetchJson<any[]>(`/patients/${patientId}/allergies`);
        },
        addAllergy: (patientId: string, data: { substance: string; reaction?: string; severity?: string }) => {
            if (isDemoMode()) {
                const created = {
                    id: `demo-allergy-${Date.now()}`,
                    patientId,
                    substance: data.substance,
                    reaction: data.reaction || '',
                    severity: data.severity || 'Unknown',
                };
                /* Bir modda ikki marta yozilmasin — server bilan bir xil qoida */
                const same = DEMO_ALLERGIES.find(a => a.patientId === patientId
                    && a.substance.trim().toLowerCase() === data.substance.trim().toLowerCase());
                if (same) Object.assign(same, { reaction: created.reaction, severity: created.severity });
                else DEMO_ALLERGIES.push(created);
                demoStampPatient(patientId);
                return demoRead<any>(same || created);
            }
            return fetchJson<any>(`/patients/${patientId}/allergies`, { method: 'POST', body: JSON.stringify(data) });
        },
        removeAllergy: (patientId: string, allergyId: string) => {
            if (isDemoMode()) {
                const i = DEMO_ALLERGIES.findIndex(a => a.id === allergyId);
                if (i > -1) DEMO_ALLERGIES.splice(i, 1);
                demoStampPatient(patientId);
                return demoRead<{ success: true }>({ success: true });
            }
            return fetchJson<{ success: true }>(`/patients/${patientId}/allergies/${allergyId}`, { method: 'DELETE' });
        },
        markLabSeen: (orderId: string) => {
            if (isDemoMode()) return demoRead<{ success: true }>({ success: true });
            return fetchJson<{ success: true }>(`/lab-orders/${orderId}/seen`, { method: 'POST' });
        },
        markStudySeen: (studyId: string) => {
            if (isDemoMode()) return demoRead<{ success: true }>({ success: true });
            return fetchJson<{ success: true }>(`/studies/${studyId}/seen`, { method: 'POST' });
        },
        /** Natijasi tayyor, lekin ko'rilmagan qabullar — SANA bilan cheklanmagan */
        pendingResults: () => {
            if (isDemoMode()) return demoRead<any[]>(demoPendingResults());
            return fetchJson<any[]>('/visits/pending-results');
        },
        /** Ko'rsatkich bo'yicha vaqt qatori: bitta qiymat emas, O'ZGARISH muhim */
        labDynamics: (patientId: string) => {
            if (isDemoMode()) return demoRead<any[]>(demoLabDynamics(patientId));
            return fetchJson<any[]>(`/patients/${patientId}/lab-dynamics`);
        },
        lockVisit: (visitId: string, disposition?: string) => {
            if (isDemoMode()) return demoRead<any>({ id: visitId, locked: true, disposition });
            return fetchJson<any>(`/visits/${visitId}/lock`, { method: 'POST', body: JSON.stringify({ disposition }) });
        },
    },

    // ─── Pul: hisob qatorlari va kassa ──────────────────────────────────────
    charges: {
        getAll: (params?: { status?: string; patientId?: string; visitId?: string; date?: string }) => {
            if (isDemoMode()) return demoRead<VisitCharge[]>(DEMO_CHARGES.filter(c =>
                (!params?.status || c.status === params.status)
                && (!params?.patientId || c.patientId === params.patientId)
                && (!params?.visitId || c.visitId === params.visitId)
            ));
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<VisitCharge[]>(`/charges${qs ? `?${qs}` : ''}`);
        },
        // Kassa ekrani: bemor bo'yicha guruhlangan qarz
        /** `now` — faqat hozir klinikada bo'lgan bemorlar (bugungi ochiq qabul).
         *  Kassir oynasidagi odamni umumiy qarz ro'yxatidan izlamasligi uchun. */
        pending: (now?: boolean) => isDemoMode()
            ? demoRead<PendingPatient[]>(demoPendingPatients())
            : fetchJson<PendingPatient[]>(`/charges/pending${now ? '?now=1' : ''}`),
        byVisit: (visitId: string) =>
            isDemoMode()
                ? demoRead<{ charges: VisitCharge[]; summary: ChargeSummary }>(demoVisitCharges(visitId))
                : fetchJson<{ charges: VisitCharge[]; summary: ChargeSummary }>(`/visits/${visitId}/charges`),
        create: (data: Partial<VisitCharge>) => {
            if (isDemoMode()) {
                const qty = data.quantity ?? 1;
                const unit = data.unitPrice ?? 0;
                const discount = data.discount ?? 0;
                const visit = DEMO_VISITS.find(v => v.id === data.visitId);
                const row: VisitCharge = {
                    id: demoId('demo-charge'),
                    clinicId: 'demo-clinic-1',
                    visitId: data.visitId ?? null,
                    patientId: data.patientId ?? visit?.patientId ?? null,
                    patientName: data.patientName || demoName(data.patientId || visit?.patientId || ''),
                    source: data.source || 'Service',
                    sourceId: data.sourceId ?? null,
                    name: data.name || 'Xizmat',
                    quantity: qty,
                    unitPrice: unit,
                    discount,
                    /* Yig'indini EKRAN emas, shu yer sanaydi — forma faqat
                       miqdor va narxni yuboradi. */
                    total: data.total ?? Math.max(0, qty * unit - discount),
                    status: 'Unpaid',
                    paidAmount: 0,
                    paidAt: null,
                    createdAt: demoNow(),
                    createdByName: 'Demo Admin',
                    visit: visit ? { id: visit.id, date: visit.date, queueNumber: visit.queueNumber, departmentId: visit.departmentId } : undefined,
                };
                DEMO_CHARGES.push(row);
                return demoDone(row);
            }
            return fetchJson<VisitCharge>('/charges', { method: 'POST', body: JSON.stringify(data) });
        },
        cancel: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_CHARGES.findIndex(c => c.id === id);
                if (i === -1) return Promise.reject(new Error('Qator topilmadi.'));
                /* To'langan qatorni bekor qilib bo'lmaydi — qaytarish
                   («Refund») orqali bo'ladi. Serverdagi qoida bilan bir xil. */
                if ((DEMO_CHARGES[i].paidAmount || 0) > 0) {
                    return Promise.reject(new Error("To'langan qatorni bekor qilib bo'lmaydi — qaytarishni ishlating."));
                }
                DEMO_CHARGES.splice(i, 1);
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/charges/${id}`, { method: 'DELETE' });
        },
    },
    payments: {
        /* AVANS TO'LDIRISH — xizmat uchun to'lov EMAS.

           Chek va bemor balansi bitta tranzaksiyada yoziladi. Ilgari bu
           `POST /api/transactions` orqali ketardi va balans alohida,
           chekdan keyin yangilanardi: yiqilsa pul kassada bor, bemor
           hisobida yo'q edi. */
        advance: (data: { patientId: string; amount: number; method?: string; receivedByName?: string; note?: string }) => {
            if (isDemoMode()) {
                const p = DEMO_PATIENTS.find(x => x.id === data.patientId);
                if (!p) return Promise.reject(new Error('Bemor topilmadi.'));
                if ((data.method || 'Cash') === 'Balance') {
                    return Promise.reject(new Error("Avansni avans hisobidan to'ldirib bo'lmaydi"));
                }
                const tx = {
                    id: demoId('demo-tx'), clinicId: 'demo-clinic-1',
                    patientId: p.id, patientName: `${p.lastName} ${p.firstName}`.trim(),
                    date: todayISO(), amount: data.amount, type: data.method || 'Cash',
                    service: 'Avans', status: 'Paid', createdAt: demoNow(),
                } as any;
                DEMO_TRANSACTIONS.unshift(tx);
                p.balance = (p.balance || 0) + data.amount;
                saveDemoData();
                return demoDone({ transaction: tx, balance: p.balance });
            }
            return fetchJson<{ transaction: Transaction; balance: number }>(
                '/payments/advance', { method: 'POST', body: JSON.stringify(data) });
        },

        /** `perCharge` — qaysi qatorga qancha (tanlab to'lash).
         *  `payments` — bir to'lovni naqd + karta deb bo'lish.
         *  Ikkisi ham ixtiyoriy: berilmasa eski xatti-harakat. */
        pay: (data: {
            chargeIds: string[]; amount?: number; method?: string;
            receivedByName?: string; doctorId?: string; doctorName?: string;
            perCharge?: Record<string, number>;
            payments?: { method: string; amount: number }[];
        }) => {
            if (isDemoMode()) {
                const rows = DEMO_CHARGES.filter(c => data.chargeIds.includes(c.id));
                if (!rows.length) return Promise.reject(new Error("To'lanadigan qator tanlanmadi."));
                let paidTotal = 0;
                for (const row of rows) {
                    const due = Math.max(0, (row.total || 0) - (row.paidAmount || 0));
                    /* Uch xil to'lash usuli qo'llab-quvvatlanadi va ustuvorligi
                       shu tartibda: qator bo'yicha summa → umumiy summa →
                       qoldiqni to'liq yopish. */
                    const want = data.perCharge?.[row.id] ?? (data.amount != null && rows.length === 1 ? data.amount : due);
                    const pay = Math.min(due, Math.max(0, want));
                    row.paidAmount = (row.paidAmount || 0) + pay;
                    /* «Qisman to'langan» degan HOLAT yo'q — server ham
                       shunday (backend/billing.ts): to'liq yopilmaguncha
                       qator `Unpaid` bo'lib qoladi, qancha to'langani
                       `paidAmount` da turadi. */
                    const fully = row.paidAmount >= (row.total || 0) - 0.001;
                    row.status = fully ? 'Paid' : 'Unpaid';
                    if (fully) row.paidAt = demoNow();
                    paidTotal += pay;
                }
                /* Chek MOLIYAGA ham tushadi. Busiz kassada to'lov ko'rinardi,
                   lekin bosh sahifadagi «bugungi tushum» qimirlamasdi —
                   demoni ko'rsatayotgan odam uchun bu buzuqlik belgisi. */
                const first = rows[0];
                const method = (data.payments?.[0]?.method || data.method || 'Cash') as Transaction['type'];
                const tx: Transaction = {
                    id: demoId('demo-tx'),
                    patientId: first.patientId || undefined,
                    patientName: first.patientName,
                    date: demoNow(),
                    amount: paidTotal,
                    type: method,
                    service: rows.map(r => r.name).join(', ').slice(0, 120),
                    status: 'Paid',
                    clinicId: 'demo-clinic-1',
                    /* Server bilan bir xil: so'rovda shifokor yo'q bo'lsa — qatorlarning
                       shifokori (hammasi bitta shifokorniki bo'lsa) */
                    ...(() => {
                        if (data.doctorId) return { doctorId: data.doctorId, doctorName: data.doctorName };
                        const ids = [...new Set(rows.map(r => r.doctorId).filter(Boolean))];
                        return ids.length === 1
                            ? { doctorId: ids[0] as string, doctorName: rows.find(r => r.doctorId === ids[0])?.doctorName || undefined }
                            : { doctorId: undefined, doctorName: undefined };
                    })(),
                    createdAt: demoNow(),
                    receivedByName: data.receivedByName || 'Demo Admin',
                    linkedToCharges: true,
                };
                /* BIR NECHA USUL — HAR BIRIGA O'Z CHEKI (server bilan bir xil).
                   Ilgari demo hammasini birinchi usulga yozardi: 500 000 naqd +
                   300 000 karta «Naqd 800 000» bo'lib tushar va yashik 300 000
                   ga ko'p ko'rsatilardi (kassir maslahatchi, 2026-11-22). */
                const split = (data.payments || []).filter(p => (p.amount || 0) > 0);
                const parts = split.length > 1 ? split : [{ method, amount: paidTotal }];
                const receipts = parts.map((p, i) => ({ ...tx, id: i === 0 ? tx.id : demoId('demo-tx'), amount: p.amount, type: p.method as Transaction['type'] }));
                DEMO_TRANSACTIONS.push(...receipts);
                /* Qator o'z chekini biladi — server ham shunday (`transactionId`).
                   Daftar to'lov usulini shu bog'lanishdan o'qiydi. */
                for (const row of rows) row.transactionId = tx.id;
                saveDemoData();
                return demoDone({ success: true, paid: paidTotal, transaction: receipts[0] });
            }
            return fetchJson<any>('/payments', { method: 'POST', body: JSON.stringify(data) });
        },
        /** Qator bo'yicha qaytarish — faqat klinika admini */
        refund: (chargeId: string, data: { amount?: number; method?: string; reason?: string }) => {
            if (isDemoMode()) {
                const row = DEMO_CHARGES.find(c => c.id === chargeId);
                if (!row) return Promise.reject(new Error('Qator topilmadi.'));
                const back = Math.min(row.paidAmount || 0, Math.max(0, data.amount ?? row.paidAmount ?? 0));
                if (back <= 0) return Promise.reject(new Error("Bu qator bo'yicha qaytariladigan summa yo'q."));
                row.paidAmount = (row.paidAmount || 0) - back;
                row.status = row.paidAmount >= (row.total || 0) - 0.001 ? 'Paid' : 'Unpaid';
                if (row.paidAmount <= 0.001) row.paidAt = null;
                /* Qaytarish MANFIY chek bo'lib yoziladi — kunlik hisobot
                   o'zi to'g'rilanadi, alohida tuzatish kerak emas. */
                DEMO_TRANSACTIONS.push({
                    id: demoId('demo-tx'),
                    patientId: row.patientId || undefined,
                    patientName: row.patientName,
                    date: demoNow(),
                    amount: -back,
                    type: (data.method || 'Cash') as Transaction['type'],
                    service: `Qaytarish: ${row.name}${data.reason ? ` — ${data.reason}` : ''}`,
                    status: 'Paid',
                    clinicId: 'demo-clinic-1',
                    createdAt: demoNow(),
                    linkedToCharges: true,
                });
                saveDemoData();
                return demoDone({ success: true, refunded: back });
            }
            return fetchJson<any>(`/charges/${chargeId}/refund`, { method: 'POST', body: JSON.stringify(data) });
        },
        /** Qatorga chegirma — admin va registrator */
        discount: (chargeId: string, discount: number) => {
            if (isDemoMode()) {
                const row = DEMO_CHARGES.find(c => c.id === chargeId);
                if (!row) return Promise.reject(new Error('Qator topilmadi.'));
                const gross = (row.quantity || 1) * (row.unitPrice || 0);
                const value = Math.min(Math.max(0, discount), gross);
                /* To'langan summadan past chegirma berib bo'lmaydi — server
                   ham buni rad etadi (billing.ts), aks holda qator
                   «ortiqcha to'langan» holatga tushadi. */
                if (gross - value < (row.paidAmount || 0) - 0.001) {
                    return Promise.reject(new Error("Chegirma to'langan summadan kam bo'lib qoladi."));
                }
                row.discount = value;
                row.total = gross - value;
                /* Chegirmadan keyin qator allaqachon to'liq to'langan bo'lib
                   qolishi mumkin — holatni qayta hisoblaymiz. */
                row.status = (row.paidAmount || 0) >= row.total - 0.001 ? 'Paid' : 'Unpaid';
                return demoDone(row);
            }
            return fetchJson<any>(`/charges/${chargeId}/discount`, { method: 'PUT', body: JSON.stringify({ discount }) });
        },
    },

    cashShift: {
        /** Kutilayotgan naqd — SERVER hisobi, tahrirlanmaydi */
        expected: (date: string) => {
            if (isDemoMode()) {
                /* Demo hisobi ham USUL bo‘yicha ajratiladi.

                   Ilgari bu yerda shu kunning HAMMA to‘lovi «naqd» deb
                   qaytarilardi va xarajatlar umuman hisobga olinmasdi.
                   Kassa ekranidagi «Kassada qoldi» endi aynan shu raqamni
                   ko‘rsatgani uchun demo yolg‘on son ko‘rsatib turardi. */
                const paidToday = DEMO_TRANSACTIONS.filter(
                    t => t.status === 'Paid' && dayKey(t.date) === date);
                const sumBy = (m: string) => paidToday
                    .filter(t => (t.type || 'Cash') === m)
                    .reduce((acc, t) => acc + (t.amount || 0), 0);
                const cashExpense = DEMO_EXPENSES
                    .filter(e => dayKey(e.date) === date && (e.method || 'Cash') === 'Cash')
                    .reduce((acc, e) => acc + (e.amount || 0), 0);
                const day = demoSnapshot(date, date);
                /* Kassa harakatlari ham (server bilan bir xil): inkassatsiya va
                   naqd qaytarish yashikdan chiqadi, kirim qo'shiladi. Ilgari demo
                   ularni 0 deb olardi va inkassatsiyadan keyin «Yashikda» raqami
                   o'zgarmasdi (kassir maslahatchi, 2026-11-22). */
                const moves = DEMO_CASH_MOVEMENTS.filter(m => dayKey(m.date) === date && (m.method || 'Cash') === 'Cash');
                const moveSum = (type: string) => moves.filter(m => m.type === type).reduce((acc, m) => acc + (m.amount || 0), 0);
                const encashment = moveSum('Encashment');
                const refundCash = moveSum('Refund');
                const cashIn = moveSum('CashIn');
                return demoRead({
                    date, openingCash: 0,
                    expectedCash: sumBy('Cash') + cashIn - cashExpense - encashment - refundCash,
                    expectedCard: sumBy('Card'), expectedClick: sumBy('Click'),
                    openCharges: { count: 0, patients: 0, due: day.period.due },
                    /* Server bilan bir xil qismlar — «Kunni yopish» dagi qatorlar jamiga teng chiqsin */
                    sources: {
                        cashPayments: sumBy('Cash'), cashIn, cashExpense,
                        encashment, refundCash, paymentCount: paidToday.length,
                    } as Record<string, any>,
                });
            }
            return fetchJson<{
                date: string; openingCash: number; expectedCash: number;
                expectedCard: number; expectedClick: number;
                /** Kunning YOPILMAGAN xizmat qatorlari — kassa sog' bo'lsa ham
                 *  bemorlarning yarmi to'lamasdan ketgan bo'lishi mumkin. */
                openCharges?: { count: number; patients: number; due: number };
                sources: Record<string, any>;
            }>(`/cash-register/expected?date=${date}`);
        },
        open: (data: { date: string; shift?: number; openingCash?: number }) => {
            if (isDemoMode()) return demoRead<any>({ ...data, id: `demo-shift-${Date.now()}`, status: 'Open' });
            return fetchJson<any>('/cash-register/open', { method: 'POST', body: JSON.stringify(data) });
        },
    },

    // ─── Moliyaviy hisobot ──────────────────────────────────────────────────
    // ─── Ekspluatatsiya: sxema versiyasi va zaxira nusxa ────────────────────
    // Faqat klinika administratori uchun — backend ham shu rolni talab qiladi.
    /* ─── TARMOQ VA MASOFAVIY KIRISH ────────────────────────────────────
       Server bu ma'lumotni ALLAQACHON beradi (`/api/network-info`,
       `server.ts` dagi izohda «Sozlamalar oynasi shu manzilni
       ko'rsatadi» deb yozilgan ham), lekin uni chaqiradigan bironta
       ekran yo'q edi: manzil faqat Electron oynasining sarlavhasida
       ko'rinardi. */
    network: {
        /* `stableUrl` — doimiy manzil (`k-<id>.xclinic.org`), `quickUrl` —
           zaxira (`trycloudflare.com`). Ikkalasi birga ishlaydi. `tunnelUrl`
           — eski maydon: doimiysi bo'lsa o'sha, bo'lmasa zaxira. */
        info: () => {
            type NetworkInfo = {
                ip: string; port: number; url: string;
                tunnelUrl: string | null; stableUrl: string | null; quickUrl: string | null;
            };
            if (isDemoMode()) {
                return demoRead<NetworkInfo>({
                    ip: '192.168.1.42', port: 3101, url: 'http://192.168.1.42:3101',
                    tunnelUrl: null, stableUrl: null, quickUrl: null,
                });
            }
            return fetchJson<NetworkInfo>('/network-info');
        },
        getRemoteAccess: () => {
            if (isDemoMode()) {
                return demoRead<{ enabled: boolean; defaultPasswordInUse: boolean; note: string }>({
                    enabled: false, defaultPasswordInUse: false,
                    note: "O'zgarish bir daqiqa ichida kuchga kiradi.",
                });
            }
            return fetchJson<{ enabled: boolean; defaultPasswordInUse: boolean; note: string }>('/admin/remote-access');
        },
        setRemoteAccess: (enabled: boolean) => {
            if (isDemoMode()) return demoDone({ enabled, restartRequired: false });
            return fetchJson<{ enabled: boolean; restartRequired: boolean }>(
                '/admin/remote-access', { method: 'PUT', body: JSON.stringify({ enabled }) });
        },
    },

    maintenance: {
        schemaStatus: () => isDemoMode() ? demoRead<any>({ current: null, baseline: true, appliedCount: 0, applied: [], pending: [], pendingCount: 0 }) : fetchJson<{
            current: string | null;
            baseline: boolean;
            appliedCount: number;
            applied: { version: string; appliedAt: string; durationMs: number | null; note: string | null }[];
            pending: string[];
            pendingCount: number;
        }>('/admin/schema-status'),

        backups: () => isDemoMode() ? demoRead<any>(DEMO_BACKUPS) : fetchJson<{
            file: string; sizeBytes: number; createdAt: string;
            hasUploads: boolean; note: string | null;
        }[]>('/admin/backups'),

        /* NAMOYISHDA HAM «ISHLAYDI». Uchala chaqiruv demo qo'riqchisisiz
           edi va «Demo rejimida bu ma'lumot mavjud emas» xatosini berardi:
           nusxalar ro'yxati soxta, tugmalar esa xato — namoyish qilib
           turgan odam uchun eng yomon ziddiyat. */
        createBackup: (note?: string) => {
            if (isDemoMode()) {
                const now = new Date();
                const st = (n: number) => String(n).padStart(2, '0');
                const file = `xclinic-${now.getFullYear()}${st(now.getMonth() + 1)}${st(now.getDate())}`
                    + `-${st(now.getHours())}${st(now.getMinutes())}${st(now.getSeconds())}.db`;
                const row = {
                    file, sizeBytes: 842_000, createdAt: now.toISOString(),
                    uploadsCount: 12, durationMs: 340, note: note || null, hasUploads: true,
                };
                DEMO_BACKUPS.unshift(row as any);
                return demoDone(row);
            }
            return fetchJson<{
                file: string; sizeBytes: number; createdAt: string;
                uploadsCount: number; durationMs: number;
            }>('/admin/backup', { method: 'POST', body: JSON.stringify({ note: note || '' }) });
        },

        // Tiklash DARHOL bajarilmaydi: server bazani ochiq tutadi. Bu chaqiruv
        // faqat belgi qo'yadi, almashtirish dastur qayta ishga tushganda bo'ladi.
        stageRestore: (file: string) => {
            if (isDemoMode()) return demoDone({ staged: true as const, restartRequired: true as const, file });
            return fetchJson<{ staged: true; restartRequired: true; file: string }>(
                '/admin/backup/restore', { method: 'POST', body: JSON.stringify({ file, confirm: true }) });
        },

        restoreState: () => isDemoMode() ? demoRead<any>({ staged: false }) : fetchJson<{
            staged: boolean; file?: string; stagedAt?: string; byName?: string | null;
        }>('/admin/backup/restore'),

        cancelRestore: () => {
            if (isDemoMode()) return demoDone({ success: true as const });
            return fetchJson<{ success: true }>('/admin/backup/restore', { method: 'DELETE' });
        },

        /* Avtomatik nusxa holati. `stale` — 3 kundan beri nusxa yo'q degani;
           interfeys shu bayroq bo'yicha qizil ogohlantirish ko'rsatadi. */
        backupStatus: () => isDemoMode() ? demoRead<any>(DEMO_BACKUP_STATUS) : fetchJson<{
            config: BackupConfig;
            lastBackup: { file: string; createdAt: string; sizeBytes: number } | null;
            ageDays: number | null;
            stale: boolean;
            count: number;
            totalBytes: number;
            scheduler: {
                running: boolean; lastRunAt: string | null; lastFile: string | null;
                lastError: string | null; lastDeleted: number;
            };
        }>('/admin/backup/status'),

        /* NAMOYISHDA ISHLAYDI. Ilgari bu chaqiruv demo qo'riqchisisiz edi
           va «Demo rejimida bu ma'lumot mavjud emas» xatosini berardi —
           ya'ni namoyishda zaxira jadvalini ko'rsatib bo'lmasdi. */
        saveBackupConfig: (cfg: Partial<BackupConfig>) => {
            if (isDemoMode()) {
                DEMO_BACKUP_CONFIG = { ...DEMO_BACKUP_CONFIG, ...cfg } as BackupConfig;
                return demoDone(DEMO_BACKUP_CONFIG);
            }
            return fetchJson<BackupConfig>('/admin/backup/config', { method: 'PUT', body: JSON.stringify(cfg) });
        },

        /** Kompyuterdagi bulut papkalari — Google Drive, OneDrive va h.k. */
        cloudFolders: () => {
            if (isDemoMode()) {
                return demoRead<{ folders: { path: string; label: string }[] }>({
                    folders: [{ path: 'C:\\Users\\Klinika\\Google Drive', label: 'Google Drive' }],
                });
            }
            return fetchJson<{ folders: { path: string; label: string }[] }>('/admin/backup/cloud-folders');
        },

        /* Yaxlitlik tekshiruvi. `severity`: 'error' — shubhasiz buzilish,
           'warn' — qarash kerak, 'info' — ma'lumot uchun (buzilish emas). */
        integrity: () => isDemoMode() ? demoRead<any>({ checkedAt: new Date().toISOString(), ok: true, errorCount: 0, warnCount: 0, checks: [] }) : fetchJson<{
            checkedAt: string;
            ok: boolean;
            errorCount: number;
            warnCount: number;
            checks: {
                key: string;
                title: string;
                severity: 'ok' | 'info' | 'warn' | 'error';
                count: number;
                scanned: number;
                sample: any[];
                note?: string;
            }[];
        }>('/admin/integrity'),

        /** Balanslarni qayta hisoblash. `confirm` bermasa — faqat farqni ko'rsatadi. */
        recalculateBalances: (confirm = false) => {
            if (isDemoMode()) {
                return demoDone({
                    dryRun: !confirm, patientsChecked: DEMO_PATIENTS.length,
                    mismatches: 0, patientsFixed: 0, sample: [],
                    message: "Farq topilmadi — hamma balans to'g'ri.",
                });
            }
            return fetchJson<{
                dryRun: boolean; patientsChecked: number;
                mismatches?: number; patientsFixed?: number;
                sample?: { patientName: string; current: number; correct: number; diff: number }[];
                message?: string;
            }>('/admin/recalculate-balances', { method: 'POST', body: JSON.stringify({ confirm }) });
        },
    },

    reports: {
        // Bo'lim, manba va tannarx kesimida — server tomonda hisoblanadi
        summary: (from?: string, to?: string) => {
            /* Demo: «Oldingi davrga nisbatan» kartasi (`compare`) bilan BIR XIL
               manbadan — `DEMO_TRANSACTIONS` va `DEMO_EXPENSES`. Ilgari bu yerda
               nollar qaytarilardi va bitta ekranda «Tushum 4 800 000» ostida
               «Tushum 0» turardi. Hisob `backend/reports.ts` dagi kabi. */
            if (isDemoMode()) return demoRead<any>(demoReportSummary(from, to));
            const q = new URLSearchParams();
            if (from) q.set('from', from);
            if (to) q.set('to', to);
            const qs = q.toString();
            return fetchJson<any>(`/reports/summary${qs ? `?${qs}` : ''}`);
        },
        /* YAGONA MANBA (S2.1). Qarz, tushum, tashriflar soni va o'rtacha
           chek — hammasi shu yerdan. Ekranda sanalgan har qanday son
           boshqa ekrandagi son bilan farq qilib qoladi: audit shunday
           to'rtta har xil qarz raqamini topgan edi. */
        snapshot: (from?: string, to?: string) => {
            if (isDemoMode()) return demoRead<Snapshot>(demoSnapshot(from, to));
            const q = new URLSearchParams();
            if (from) q.set('from', from);
            if (to) q.set('to', to);
            const qs = q.toString();
            return fetchJson<Snapshot>(`/reports/snapshot${qs ? `?${qs}` : ''}`);
        },

        /* Bosh sahifa raqamlari — serverda sanaladi. Ilgari brauzer butun
           tranzaksiyalar ro'yxatini olib o'zi sanardi. */
        dashboard: () => {
            if (isDemoMode()) {
                const today = todayISO();
                const monthStart = today.slice(0, 8) + '01';
                const day = demoSnapshot(today, today);
                const month = demoSnapshot(monthStart, today);
                const all = demoSnapshot();
                return demoRead({
                    date: today,
                    patients: all.patients,
                    today: {
                        appointments: day.period.appointments,
                        visits: day.period.visits,
                        revenue: day.period.charged,
                        /* `payments` — TO'LOVLAR SONI, summa emas. Bu yerda
                           `period.collected` (pul) turardi va ekranda
                           «50000 ta to'lov» degan bema'nilik chiqardi:
                           server `_count` qaytaradi, qopqoq esa summani. */
                        payments: DEMO_TRANSACTIONS.filter(
                            t => t.status === 'Paid' && dayKey(t.date) === today,
                        ).length,
                    },
                    month: { revenue: month.period.collected },
                    debt: all.debt,
                    debtors: (() => {
                        const d = demoDebtors();
                        return {
                            patients: d.all.length,
                            overdue30: d.overdue.length,
                            overdue30Sum: d.overdue.reduce((s, g) => s + g.due, 0),
                        };
                    })(),
                    period: month.period,
                });
            }
            return fetchJson<{
                date: string;
                patients: { total: number; active: number; newLast7Days: number };
                today: { appointments: number; visits: number; revenue: number; payments: number };
                month: { revenue: number };
                debt: Snapshot['debt'];
                debtors: { patients: number; overdue30: number; overdue30Sum: number };
                period: Snapshot['period'];
            }>('/reports/dashboard');
        },

        /* «Bugun hal qilinsin» — faqat egaga.

           DEMODA HAM TO'LOVLAR KO'RINADI. Ilgari bu yerda bo'sh ro'yxat
           qaytarilardi va izohda «o'ylab topilgan band qo'shilmaydi»
           deyilgan edi. Sabab to'g'ri, xulosa esa noto'g'ri: to'lanmagan
           hisoblar demo to'plamida HAQIQATAN bor (`demoSnapshot` qarzni
           aynan shulardan sanaydi). Ularni ko'rsatish — o'ylab topish
           emas, mavjud ma'lumotni o'qish. Natijada namoyish nusxasida
           ekranning eng muhim bloki har doim bo'sh turardi.

           Qoidalar `backend/attention.ts` dagi bilan bir xil: 30 kundan
           oshgani — `high`, qolgani — `medium`. */
        attention: () => {
            if (isDemoMode()) {
                const { today, daysBetween, overdue, waiting } = demoDebtors();
                const money = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
                const items: any[] = [];

                if (overdue.length) {
                    const oldest = overdue.reduce((a, b) => (a.oldest < b.oldest ? a : b));
                    items.push({
                        key: 'debt_overdue', level: 'high',
                        title: `${overdue.length} ta bemor 30+ kun to'lamagan`,
                        hint: `Jami ${money(overdue.reduce((s, g) => s + g.due, 0))} so'm`
                            + ` · eng eskisi ${daysBetween(oldest.oldest, today)} kun oldin`,
                        count: overdue.length, link: '/finance',
                    });
                }

                if (waiting.length) {
                    const oldest = waiting.reduce((a, b) => (a.oldest < b.oldest ? a : b));
                    const days = daysBetween(oldest.oldest, today);
                    items.push({
                        key: 'debt_fresh', level: 'medium',
                        title: `${waiting.length} ta bemor to'lov kutmoqda`,
                        hint: `Jami ${money(waiting.reduce((s, g) => s + g.due, 0))} so'm`
                            + (days > 0 ? ` · eng eskisi ${days} kun oldin` : ' · bugungi xizmatlar'),
                        count: waiting.length, link: '/finance',
                    });
                }

                return demoRead<any>({
                    date: today, total: items.length,
                    high: items.filter(i => i.level === 'high').length,
                    items,
                });
            }
            return fetchJson<{
                date: string; total: number; high: number;
                items: {
                    key: string; level: 'high' | 'medium' | 'low';
                    title: string; hint?: string; count: number; link: string;
                }[];
            }>('/reports/attention');
        },

        debtors: () => {
            if (isDemoMode()) {
                /* Server bilan bir xil: to'lanmagan qatorlar bemor bo'yicha, eng eski sanasi bilan */
                const byPatient = new Map<string, any>();
                for (const c of DEMO_CHARGES) {
                    if (c.status !== 'Unpaid') continue;
                    const key = c.patientId || `noname:${c.patientName}`;
                    const day = (c as any).visit?.date || dayKey(c.createdAt);
                    const g = byPatient.get(key) || { patientId: c.patientId, patientName: c.patientName, due: 0, count: 0, oldestDate: day };
                    g.due += c.total - (c.paidAmount || 0);
                    g.count += 1;
                    if (day < g.oldestDate) g.oldestDate = day;
                    byPatient.set(key, g);
                }
                /* O'tgan kunlarning to'lanmagan to'lovlari ham qarz (2026-11-26).
                   Busiz namoyishda hamma qarzdor «Bugun» edi va qarz yoshi
                   chizig'ida faqat «0–30 kun» bo'lardi. */
                const today = todayISO();
                for (const tx of DEMO_TRANSACTIONS) {
                    const day = String(tx.date).slice(0, 10);
                    if (tx.status === 'Paid' || day >= today) continue;
                    const key = (tx as any).patientId || `noname:${tx.patientName}`;
                    const g = byPatient.get(key) || { patientId: (tx as any).patientId, patientName: tx.patientName, due: 0, count: 0, oldestDate: day };
                    g.due += tx.amount || 0;
                    g.count += 1;
                    if (day < g.oldestDate) g.oldestDate = day;
                    byPatient.set(key, g);
                }
                const patients = [...byPatient.values()].filter(g => g.due > 0)
                    .map(g => ({ ...g, phone: DEMO_PATIENTS.find(p => p.id === g.patientId)?.phone || null }))
                    .sort((a, b) => b.due - a.due);
                return demoRead<any>({ total: patients.reduce((s, g) => s + g.due, 0), patients });
            }
            return fetchJson<any>('/reports/debtors');
        },

        /* Reliz 5: uch hisobot. Hammasi faqat klinika egasiga — server ham
           shu rolni talab qiladi. */
        writeoffs: (from: string, to: string) => {
            if (isDemoMode()) return demoRead<any>(demoWriteoffs());
            return fetchJson<any>(`/reports/writeoffs?from=${from}&to=${to}`);
        },
        doctors: (from: string, to: string) => {
            if (isDemoMode()) return demoRead<any>(demoDoctorsReport(from, to));
            return fetchJson<any>(`/reports/doctors?from=${from}&to=${to}`);
        },
        departmentsReport: (from: string, to: string) => {
            if (isDemoMode()) return demoRead<any>(demoDepartmentsReport(from, to));
            return fetchJson<any>(`/reports/departments?from=${from}&to=${to}`);
        },

        /** Oylar bo'yicha — bir yilning 12 oyi (Umumiy tab ostida) */
        months: (year: number) => {
            if (isDemoMode()) {
                /* Har oy — `compare` dagi demo `measure()` bilan bir xil manba:
                   xizmatlar va olindi `demoSnapshot`, xarajat `DEMO_EXPENSES`. */
                const months = Array.from({ length: 12 }, (_, i) => {
                    const m = `${year}-${String(i + 1).padStart(2, '0')}`;
                    const last = new Date(Date.UTC(year, i + 1, 0)).getUTCDate();
                    const a = `${m}-01`, b = `${m}-${String(last).padStart(2, '0')}`;
                    const snap = demoSnapshot(a, b);
                    const expense = DEMO_EXPENSES
                        .filter(e => inRange(e.date as any, a, b) && e.category !== 'Lab')
                        .reduce((s, e) => s + (e.amount || 0), 0);
                    return {
                        month: m, revenue: snap.period.charged, collected: snap.period.collected,
                        expense, profit: snap.period.charged - expense,
                    };
                });
                const sum = (k: 'revenue' | 'collected' | 'expense' | 'profit') => months.reduce((s, m) => s + m[k], 0);
                return demoRead<any>({
                    year, months,
                    totals: { revenue: sum('revenue'), collected: sum('collected'), expense: sum('expense'), profit: sum('profit') },
                });
            }
            return fetchJson<{
                year: number;
                months: { month: string; revenue: number; collected: number; expense: number; profit: number }[];
                totals: { revenue: number; collected: number; expense: number; profit: number };
            }>(`/reports/months?year=${year}`);
        },

        /** Oldingi SHU UZUNLIKDAGI davr bilan solishtirish */
        compare: (from: string, to: string) => {
            if (isDemoMode()) {
                /* ⚠️ SHAKL SERVERNIKI BILAN BIR XIL BO'LISHI SHART.

                   Bu yerda ilgari BOSHQA shakl qaytarilardi: `current` —
                   `Snapshot` (ya'ni raqamlar `period` ning ICHIDA), `delta`
                   kalitlari esa `charged / collected / visits / appointments`.
                   Ekran (`FinanceReport.tsx`) esa serverning tekis shaklini
                   va `revenue / collected / expense / profit / visits /
                   avgCheck` kalitlarini o'qiydi.

                   Natija: to'rtta kalit topilmay `d` `undefined` bo'lardi va
                   `d.abs` butun MOLIYA bo'limini yiqitardi — namoyish
                   nusxasida, ya'ni aynan begona odam ko'radigan joyda.
                   TypeScript ushlamadi: qaytish turi `any`.

                   Endi shakl `backend/reports.ts` dagi `measure()` ning
                   nusxasi. O'sha yerga maydon qo'shsangiz, BU YERGA HAM
                   qo'shing. */
                /* Oyning boshidan — o'tgan oyning o'sha kunlari (server bilan bir xil) */
                const { from: prevFrom, to: prevTo } = demoPreviousPeriod(from, to);

                const measure = (a: string, b: string) => {
                    const snap = demoSnapshot(a, b);
                    const days = Math.max(1, Math.round(
                        (new Date(b).getTime() - new Date(a).getTime()) / 86400000
                    ) + 1);
                    const expense = DEMO_EXPENSES
                        .filter(e => inRange(e.date as any, a, b) && e.category !== 'Lab')
                        .reduce((s, e) => s + (e.amount || 0), 0);
                    const patients = new Set(
                        DEMO_TRANSACTIONS
                            .filter(t => inRange(t.date as any, a, b))
                            .map(t => (t as any).patientId || t.patientName)
                    ).size;
                    return {
                        from: a, to: b, days,
                        revenue: snap.period.charged,
                        collected: snap.period.collected,
                        due: snap.period.due,
                        expense,
                        /* SOF FOYDA = TUSHUM − XARAJAT — serverdagi bilan bir xil */
                        profit: snap.period.charged - expense,
                        visits: snap.period.visits,
                        patients,
                        avgCheck: snap.period.avgCheck,
                    };
                };

                const current = measure(from, to);
                const previous = measure(prevFrom, prevTo);
                const delta: Record<string, { abs: number; pct: number | null }> = {};
                (['revenue', 'collected', 'due', 'expense', 'profit', 'visits', 'patients', 'avgCheck'] as const)
                    .forEach(k => {
                        const a = current[k], b = previous[k];
                        delta[k] = { abs: a - b, pct: b > 0 ? Math.round(((a - b) / b) * 100) : null };
                    });
                return demoRead({ current, previous, delta });
            }
            return fetchJson<{ current: any; previous: any; delta: Record<string, { abs: number; pct: number | null }> }>(
                `/reports/compare?from=${from}&to=${to}`);
        },

        /** Smena svodi: laboratoriya va diagnostika bo'yicha kunlik ish */
        labShift: (date: string) => {
            if (isDemoMode()) return demoRead<any>({ date, lab: [], studies: [], totals: { orders: 0, done: 0 } });
            return fetchJson<any>(`/reports/lab-shift?date=${date}`);
        },

        /** Davomat: qaysi kunlarda va soatlarda bemor ko'p keladi */
        attendance: (from: string, to: string) => {
            if (isDemoMode()) return demoRead<any>(demoAttendance(from, to));
            return fetchJson<any>(`/reports/attendance?from=${from}&to=${to}`);
        },

        /** Bemorlar: kelgan / yangi / qaytgan, yangi bemorlar qaytdimi, yo'qolganlar */
        patients: (from: string, to: string) => {
            if (isDemoMode()) return demoRead<PatientReport>(demoPatientReport(from, to));
            return fetchJson<PatientReport>(`/reports/patients?from=${from}&to=${to}`);
        },
        services: (from: string, to: string) => {
            if (isDemoMode()) return demoRead<ServiceReport>(demoServiceReport(from, to));
            return fetchJson<ServiceReport>(`/reports/services?from=${from}&to=${to}`);
        },
    },

    /* Huquqiy kontur (reliz 6): bemor hujjatlari va kirish jurnali.
       Jurnalga YOZISH endpointi yo'q — u serverda avtomatik yoziladi. */
    compliance: {
        documents: (params?: { patientId?: string; kind?: string }) => {
            if (isDemoMode()) return demoRead<any[]>(DEMO_DOCUMENTS.filter(d =>
                (!params?.patientId || d.patientId === params.patientId)
                && (!params?.kind || d.kind === params.kind)
            ));
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<any[]>(`/patient-documents${qs ? `?${qs}` : ''}`);
        },
        /** Bosma varaq uchun: klinika shapkasi, bemor ma'lumoti va sarlavha bilan */
        document: (id: string) => {
            if (isDemoMode()) {
                const d = DEMO_DOCUMENTS.find(x => x.id === id);
                return d ? demoRead<any>(d) : demoMissing<any>('bu hujjat');
            }
            return fetchJson<any>(`/patient-documents/${id}`);
        },
        createDocument: (data: {
            patientId: string; visitId?: string | null;
            kind: 'Consent' | 'Contract' | 'DataConsent' | 'Discharge' | 'Other';
            textSnapshot?: string;
        }) => {
            if (isDemoMode()) {
                const doc = {
                    id: `demo-doc-${Date.now()}`, ...data,
                    createdAt: new Date().toISOString(), patientSigned: false,
                };
                DEMO_DOCUMENTS.push(doc);
                return demoRead<any>(doc);
            }
            return fetchJson<any>('/patient-documents', { method: 'POST', body: JSON.stringify(data) });
        },
        sign: (id: string, data?: { patientSigned?: boolean }) => {
            if (isDemoMode()) {
                const d = DEMO_DOCUMENTS.find(x => x.id === id);
                if (d) d.patientSigned = data?.patientSigned !== false;
                return demoRead<any>(d);
            }
            return fetchJson<any>(`/patient-documents/${id}/sign`, { method: 'POST', body: JSON.stringify(data || {}) });
        },

        /** Faqat klinika egasi — server ham shu rolni talab qiladi */
        accessLog: (params?: { patientId?: string; from?: string; to?: string; action?: string; entityType?: string }) => {
            if (isDemoMode()) return demoRead(demoAccessLog());
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<{
                items: any[]; total: number; truncated: boolean; retentionMonths: number;
            }>(`/access-log${qs ? `?${qs}` : ''}`);
        },
    },

    /* Shifokor ulushi: stavkalar va vedomost (reliz 5).
       Stavka tanlash tartibi serverda: xizmat > bo'lim > umumiy > Doctor.percentage. */
    payroll: {
        rates: (doctorId?: string) => {
            if (isDemoMode()) return demoRead<any[]>(
                DEMO_DOCTORS.filter(d => !doctorId || d.id === doctorId)
                    .map(d => ({ id: `demo-rate-${d.id}`, doctorId: d.id, serviceId: null, departmentId: null, percent: d.percentage || 0, role: 'Asosiy' }))
            );
            return fetchJson<any[]>(`/doctor-rates${doctorId ? `?doctorId=${doctorId}` : ''}`);
        },
        /** Shifokorning BARCHA stavkalarini almashtiradi (qo'shmaydi) */
        saveRates: (doctorId: string, rates: { serviceId?: number | null; departmentId?: string | null; percent: number; role?: string }[]) => {
            if (isDemoMode()) {
                const d = DEMO_DOCTORS.find(x => x.id === doctorId);
                if (d && rates[0]) d.percentage = rates[0].percent;
                return demoRead<any[]>(rates as any[]);
            }
            return fetchJson<any[]>(`/doctor-rates/${doctorId}`, { method: 'PUT', body: JSON.stringify({ rates }) });
        },

        /** Bitta xodimning hisoblash va to'lash tarixi — karta uchun */
        staffHistory: (doctorId: string) => {
            if (isDemoMode()) {
                const lines = DEMO_PAYROLL_RUNS.flatMap((r: any) => (r.lines || [])
                    .filter((l: any) => l.doctorId === doctorId)
                    .map((l: any) => ({
                        id: l.id, periodFrom: r.periodFrom, periodTo: r.periodTo,
                        runStatus: r.status, accrued: l.accrued || 0, paid: l.paid || 0,
                    })));
                return demoRead<any>({
                    lines,
                    totals: {
                        accrued: lines.reduce((s: number, l: any) => s + l.accrued, 0),
                        paid: lines.reduce((s: number, l: any) => s + l.paid, 0),
                    },
                });
            }
            return fetchJson<{
                lines: { id: string; periodFrom: string; periodTo: string; runStatus: string; accrued: number; paid: number }[];
                totals: { accrued: number; paid: number };
            }>(`/payroll/staff/${doctorId}`);
        },

        /** Vedomost yaratmasdan raqamni ko'rish */
        preview: (from: string, to: string) => {
            if (isDemoMode()) return demoRead<any>(demoPayrollPreview(from, to));
            return fetchJson<any>(`/payroll/preview?from=${from}&to=${to}`);
        },
        runs: () => {
            if (isDemoMode()) return demoRead<any[]>(DEMO_PAYROLL_RUNS);
            return fetchJson<any[]>('/payroll/runs');
        },
        run: (id: string) => {
            if (isDemoMode()) {
                const r = DEMO_PAYROLL_RUNS.find(x => x.id === id);
                return r ? demoRead<any>(r) : demoMissing<any>('bu vedomost');
            }
            return fetchJson<any>(`/payroll/runs/${id}`);
        },
        createRun: (periodFrom: string, periodTo: string, note?: string) => {
            if (isDemoMode()) {
                const run = {
                    id: `demo-run-${Date.now()}`, note: note || '',
                    status: 'Draft', createdAt: new Date().toISOString(),
                    createdByName: 'Demo Admin',
                    periodFrom, periodTo,
                    lines: demoRunLines(periodFrom, periodTo),
                };
                DEMO_PAYROLL_RUNS.unshift(run);
                return demoRead<any>(run);
            }
            return fetchJson<any>('/payroll/runs', { method: 'POST', body: JSON.stringify({ periodFrom, periodTo, note }) });
        },
        approve: (id: string) => {
            if (isDemoMode()) {
                const r = DEMO_PAYROLL_RUNS.find(x => x.id === id);
                if (r) { r.status = 'Approved'; r.approvedAt = new Date().toISOString(); r.approvedByName = 'Demo Admin'; }
                return demoRead<any>(r);
            }
            return fetchJson<any>(`/payroll/runs/${id}/approve`, { method: 'POST' });
        },
        deleteRun: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_PAYROLL_RUNS.findIndex(x => x.id === id);
                if (i > -1) DEMO_PAYROLL_RUNS.splice(i, 1);
                return demoRead<{ success: true }>({ success: true });
            }
            return fetchJson<{ success: true }>(`/payroll/runs/${id}`, { method: 'DELETE' });
        },
        payLine: (lineId: string, data?: { amount?: number; method?: string }) => {
            if (isDemoMode()) {
                DEMO_PAYROLL_RUNS.forEach(r => (r.lines || []).forEach((l: any) => {
                    if (l.id === lineId) { l.paid = data?.amount ?? l.accrued; l.status = 'Paid'; }
                }));
                return demoRead<any>({ success: true });
            }
            return fetchJson<any>(`/payroll/lines/${lineId}/pay`, { method: 'POST', body: JSON.stringify(data || {}) });
        },
    },

    /* ─── XODIMLAR MODULI (HR) ────────────────────────────────────────────────

       Oylik hisobi, bonus/jarima, davomat va haftalik yuklama. Raqamlar
       HAMMASI serverdan keladi — ekranda hech narsa qayta sanalmaydi.
       Sabab MODUL-ISHLARI da yozilgan: proplardan sanalgan raqam ro'yxat
       qisqarganda jimgina yolg'on ko'rsatadi. */
    hr: {
        summary: () => {
            if (isDemoMode()) return demoRead<any>(demoHrSummary());
            return fetchJson<any>('/hr/summary');
        },
        workload: () => {
            if (isDemoMode()) return demoRead<any>(demoHrWorkload());
            return fetchJson<any>('/hr/workload');
        },
        /* Oylik ulush jadvali — «Ulush» vkladkasi. Vedomost o'rniga:
           oy tanlanadi, jadval chiqadi, to'lash bir bosish. */
        shares: (period: string) => {
            if (isDemoMode()) {
                /* Hisobotdagi «Shifokorlar» bilan BITTA manba — `demoDoctorLines`.
                   Ilgari bu yer doim nol qaytarardi: Hisobotda «Hisoblangan ulush
                   2 077 500», Xodimlar → Ulush da esa «0» (2026-11-22 audit). */
                const [y, m] = period.split('-').map(Number);
                const from = `${period}-01`;
                const to = `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
                const lines = demoDoctorLines(from, to);
                const paidShare = (id: string) => DEMO_EXPENSES
                    .filter(e => e.category === 'DoctorShare' && (e as any).doctorId === id && inRange(e.date as any, from, to))
                    .reduce((s, e) => s + (e.amount || 0), 0);
                const rows = DEMO_DOCTORS.map(d => {
                    const line = lines.find(l => l.doctorId === d.id);
                    const accrued = line?.accrued || 0;
                    const paid = paidShare(d.id);
                    return {
                        id: d.id, name: `${d.lastName} ${d.firstName}`.trim(), specialty: d.specialty || null,
                        accrued, paidViaRuns: 0, paid, paidAt: null,
                        payable: Math.max(0, accrued - paid), closed: paid > 0 && paid >= accrued,
                        itemCount: line?.items.length || 0,
                    };
                });
                return demoRead<any>({
                    period, from, to, rows,
                    totals: {
                        accrued: rows.reduce((s, r) => s + r.accrued, 0),
                        paid: rows.reduce((s, r) => s + r.paid, 0),
                        payable: rows.reduce((s, r) => s + r.payable, 0),
                    },
                    stats: demoPayrollPreview(from, to).stats,
                });
            }
            return fetchJson<any>(`/hr/shares?period=${period}`);
        },
        month: (role: string, id: string, period: string) => {
            if (isDemoMode()) return demoRead<any>(demoHrMonth(role, id, period));
            return fetchJson<any>(`/hr/staff/${role}/${id}/month?period=${period}`);
        },
        addAdjustment: (role: string, id: string, data: { period: string; type: 'Bonus' | 'Penalty'; reason: string; amount: number }) => {
            if (isDemoMode()) {
                const row = { id: demoId('demo-adj'), staffRole: role, staffId: id, ...data, createdAt: new Date().toISOString() };
                DEMO_HR_ADJUSTMENTS.push(row);
                return demoRead<any>(row);
            }
            return fetchJson<any>(`/hr/staff/${role}/${id}/adjustments`, {
                method: 'POST', body: JSON.stringify(data),
            });
        },
        deleteAdjustment: (adjustmentId: string) => {
            if (isDemoMode()) {
                const i = DEMO_HR_ADJUSTMENTS.findIndex(x => x.id === adjustmentId);
                if (i > -1) DEMO_HR_ADJUSTMENTS.splice(i, 1);
                return demoRead<{ success: true }>({ success: true });
            }
            return fetchJson<{ success: true }>(`/hr/adjustments/${adjustmentId}`, { method: 'DELETE' });
        },
        pay: (role: string, id: string, data: { period: string; method?: string }) => {
            if (isDemoMode()) {
                const row = { id: demoId('demo-salary'), staffRole: role, staffId: id, ...data, paidAt: new Date().toISOString() };
                DEMO_HR_PAYMENTS.push(row);
                return demoRead<any>({ payment: row });
            }
            return fetchJson<any>(`/hr/staff/${role}/${id}/pay`, {
                method: 'POST', body: JSON.stringify(data),
            });
        },
        attendanceSummary: (period: string) => {
            if (isDemoMode()) {
                return demoRead<any>({
                    period, staffTotal: 0, trackedStaff: 0, avgPercent: null,
                    best: null, markedDays: 0, rows: [],
                });
            }
            return fetchJson<any>(`/hr/attendance-summary?period=${period}`);
        },
        attendance: (role: string, id: string, period: string) => {
            if (isDemoMode()) {
                return demoRead<any>({
                    period, workDays: [1, 2, 3, 4, 5],
                    days: DEMO_HR_ATTENDANCE.filter(d => d.staffRole === role && d.staffId === id && d.date.startsWith(period)),
                });
            }
            return fetchJson<any>(`/hr/staff/${role}/${id}/attendance?period=${period}`);
        },
        markAttendance: (role: string, id: string, data: { date: string; status: string; note?: string }) => {
            if (isDemoMode()) {
                const i = DEMO_HR_ATTENDANCE.findIndex(d => d.staffRole === role && d.staffId === id && d.date === data.date);
                if (i > -1) DEMO_HR_ATTENDANCE.splice(i, 1);
                if (data.status) DEMO_HR_ATTENDANCE.push({ staffRole: role, staffId: id, ...data });
                return demoRead<any>({ success: true });
            }
            return fetchJson<any>(`/hr/staff/${role}/${id}/attendance`, {
                method: 'POST', body: JSON.stringify(data),
            });
        },
    },

    // ─── Bo'limlar ──────────────────────────────────────────────────────────
    departments: {
        getAll: () => isDemoMode() ? demoRead<Department[]>(DEMO_DEPARTMENTS) : fetchJson<Department[]>('/departments'),
        create: (data: Partial<Department>) => {
            if (isDemoMode()) {
                const dep = {
                    id: demoId('demo-dep'), clinicId: 'demo-clinic-1',
                    name: data.name || "Yangi bo'lim", code: data.code || '',
                    type: data.type || 'CLINICAL', color: data.color || '#64748B',
                    sortOrder: data.sortOrder ?? DEMO_DEPARTMENTS.length + 1,
                    isActive: true,
                    ...data,
                } as Department;
                DEMO_DEPARTMENTS.push(dep);
                return demoDone(dep);
            }
            return fetchJson<Department>('/departments', { method: 'POST', body: JSON.stringify(data) });
        },
        update: (id: string, data: Partial<Department>) => {
            if (isDemoMode()) {
                const i = DEMO_DEPARTMENTS.findIndex(d => d.id === id);
                if (i === -1) return Promise.reject(new Error("Bo'lim topilmadi."));
                DEMO_DEPARTMENTS[i] = { ...DEMO_DEPARTMENTS[i], ...data };
                return demoDone(DEMO_DEPARTMENTS[i]);
            }
            return fetchJson<Department>(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        // Bo'lim o'chirilmaydi — faolsizlantiriladi, chunki eski qabullar unga bog'langan
        deactivate: (id: string) => {
            if (isDemoMode()) {
                const dep = DEMO_DEPARTMENTS.find(d => d.id === id);
                if (!dep) return Promise.reject(new Error("Bo'lim topilmadi."));
                dep.isActive = false;
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/departments/${id}`, { method: 'DELETE' });
        },
    },

    // ─── Qabul bayoni shablonlari ───────────────────────────────────────────
    encounterTemplates: {
        /* `patientId` berilsa server bemorga MOS KELMAYDIGAN shablonlarni
           chiqarib tashlaydi (jins va yosh bo'yicha). Sozlamalarda esa
           hammasi kerak — shuning uchun ixtiyoriy. */
        getAll: (departmentId?: string, patientId?: string) => {
            if (isDemoMode()) return demoRead<EncounterTemplate[]>(DEMO_ENCOUNTER_TEMPLATES);
            const q = new URLSearchParams();
            if (departmentId) q.set('departmentId', departmentId);
            if (patientId) q.set('patientId', patientId);
            const qs = q.toString();
            return fetchJson<EncounterTemplate[]>(`/encounter-templates${qs ? `?${qs}` : ''}`);
        },
        create: (data: { departmentId: string; name: string; fields: EncounterField[]; isDefault?: boolean; gender?: string | null; minAge?: number | null; maxAge?: number | null }) => {
            if (isDemoMode()) {
                const tpl = { id: demoId('demo-tpl'), clinicId: 'demo-clinic-1', ...data } as EncounterTemplate;
                /* «Standart» bitta bo'ladi — yangisi shunday belgilansa
                   o'sha bo'limdagi eskisidan belgi olinadi. */
                if (data.isDefault) {
                    DEMO_ENCOUNTER_TEMPLATES.forEach(t => {
                        if (t.departmentId === data.departmentId) t.isDefault = false;
                    });
                }
                DEMO_ENCOUNTER_TEMPLATES.push(tpl);
                return demoDone(tpl);
            }
            return fetchJson<EncounterTemplate>('/encounter-templates', { method: 'POST', body: JSON.stringify(data) });
        },
        update: (id: string, data: { name?: string; fields?: EncounterField[]; isDefault?: boolean; gender?: string | null; minAge?: number | null; maxAge?: number | null }) => {
            if (isDemoMode()) {
                const i = DEMO_ENCOUNTER_TEMPLATES.findIndex(t => t.id === id);
                if (i === -1) return Promise.reject(new Error('Shablon topilmadi.'));
                if (data.isDefault) {
                    DEMO_ENCOUNTER_TEMPLATES.forEach(t => {
                        if (t.departmentId === DEMO_ENCOUNTER_TEMPLATES[i].departmentId) t.isDefault = false;
                    });
                }
                DEMO_ENCOUNTER_TEMPLATES[i] = { ...DEMO_ENCOUNTER_TEMPLATES[i], ...data } as EncounterTemplate;
                return demoDone(DEMO_ENCOUNTER_TEMPLATES[i]);
            }
            return fetchJson<EncounterTemplate>(`/encounter-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_ENCOUNTER_TEMPLATES.findIndex(t => t.id === id);
                if (i !== -1) DEMO_ENCOUNTER_TEMPLATES.splice(i, 1);
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/encounter-templates/${id}`, { method: 'DELETE' });
        },
    },

    // ─── Laboratoriya: katalog ──────────────────────────────────────────────
    labTests: {
        getAll: () => isDemoMode() ? demoRead<LabTest[]>(DEMO_LAB_TESTS) : fetchJson<LabTest[]>('/lab-tests'),
        create: (data: Partial<LabTest> & { parameters?: Partial<LabTestParameter>[] }) => {
            if (isDemoMode()) {
                const test = {
                    id: demoId('demo-lt'), clinicId: 'demo-clinic-1', departmentId: 'demo-lab',
                    isActive: true, sortOrder: DEMO_LAB_TESTS.length + 1,
                    ...data,
                } as LabTest;
                DEMO_LAB_TESTS.push(test);
                return demoDone(test);
            }
            return fetchJson<LabTest>('/lab-tests', { method: 'POST', body: JSON.stringify(data) });
        },
        update: (id: string, data: Partial<LabTest> & { parameters?: Partial<LabTestParameter>[] }) => {
            if (isDemoMode()) {
                const i = DEMO_LAB_TESTS.findIndex(t => t.id === id);
                if (i === -1) return Promise.reject(new Error('Tahlil topilmadi.'));
                DEMO_LAB_TESTS[i] = { ...DEMO_LAB_TESTS[i], ...data } as LabTest;
                return demoDone(DEMO_LAB_TESTS[i]);
            }
            return fetchJson<LabTest>(`/lab-tests/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const test = DEMO_LAB_TESTS.find(t => t.id === id);
                if (!test) return Promise.reject(new Error('Tahlil topilmadi.'));
                /* Buyurtmada ishlatilgan tahlil O'CHIRILMAYDI —
                   faolsizlantiriladi, aks holda eski buyurtmalar nomsiz
                   qoladi. Server ham shu javobni beradi. */
                const used = DEMO_LAB_ORDERS.some(o => (o as any).items?.some((it: any) => it.testId === id));
                if (used) { test.isActive = false; return demoDone({ success: true as const, deactivated: true }); }
                DEMO_LAB_TESTS.splice(DEMO_LAB_TESTS.indexOf(test), 1);
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true; deactivated?: boolean }>(`/lab-tests/${id}`, { method: 'DELETE' });
        },
    },

    // ─── Laboratoriya: natijalar ────────────────────────────────────────────
    labResults: {
        // Normalar bemorning jinsi/yoshiga moslab serverda tanlanadi
        get: (orderId: string) =>
            isDemoMode()
                ? demoRead<any>(demoLabResults(orderId))
                : fetchJson<LabOrder & { items: LabOrderItem[]; patientAge: number | null; patientSex: string | null }>(
                    `/lab-orders/${orderId}/results`),
        save: (orderId: string, results: { orderItemId: string; parameterId: string; value: string; note?: string }[], enteredBy?: string) => {
            if (isDemoMode()) {
                for (const r of results) {
                    DEMO_RESULT_VALUES[`${r.orderItemId}:${r.parameterId}`] = { value: r.value, note: r.note };
                }
                /* Hamma parametr to'lgan bo'lsa yo'llanma yopiladi — LabOrders
                   ro'yxatidagi holat ham shu bilan o'zgaradi. */
                const full = demoLabResults(orderId);
                const order = DEMO_LAB_ORDERS.find(o => o.id === orderId);
                if (order && full.items.length && full.items.every(i => i.status === 'Completed')) {
                    order.status = 'Completed' as LabOrder['status'];
                    order.completedAt = demoNow();
                    order.technicianName = enteredBy || order.technicianName;
                }
                saveDemoData();
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/lab-orders/${orderId}/results`, {
                method: 'POST',
                body: JSON.stringify({ results, enteredBy }),
            });
        },
    },

    // ─── Diagnostika ────────────────────────────────────────────────────────
    studies: {
        getAll: (params?: { patientId?: string; status?: string }) => {
            if (isDemoMode()) {
                /* Filtrlar demoda E'TIBORSIZ qolardi: bemor kartasi
                   klinikadagi HAMMA tekshiruvni ko'rsatardi. */
                const dueOf = (studyId: string) => DEMO_CHARGES
                    .filter(c => c.source === 'Study' && c.sourceId === studyId && c.status !== 'Cancelled');
                return demoRead<DiagnosticStudy[]>(DEMO_STUDIES.filter(s =>
                    (!params?.patientId || s.patientId === params.patientId)
                    && (!params?.status || s.status === params.status))
                    .map(s => {
                        /* Demo ham serverning shartnomasini bajaradi, aks
                           holda namoyishda «To'langan» yorlig'i umuman
                           ko'rinmasdi. */
                        const rows = dueOf(s.id);
                        if (rows.length === 0) return { ...s, paid: null, due: null };
                        return {
                            ...s,
                            paid: rows.every(c => c.status === 'Paid'),
                            due: rows.reduce((acc, c) => acc + Math.max(0, (c.total || 0) - (c.paidAmount || 0)), 0),
                        };
                    }));
            }
            const q = new URLSearchParams();
            if (params?.patientId) q.set('patientId', params.patientId);
            if (params?.status) q.set('status', params.status);
            const qs = q.toString();
            return fetchJson<DiagnosticStudy[]>(`/studies${qs ? `?${qs}` : ''}`);
        },
        create: (data: Partial<DiagnosticStudy>) => {
            if (isDemoMode()) {
                const study = {
                    id: demoId('demo-study'), clinicId: 'demo-clinic-1',
                    departmentId: 'demo-diag',
                    patientName: data.patientName || demoName(data.patientId || ''),
                    status: 'Ordered', orderedAt: demoNow(),
                    orderedByName: 'Demo Admin', performedByName: null, performedAt: null,
                    ...data,
                } as DiagnosticStudy;
                DEMO_STUDIES.unshift(study);
                /* Tekshiruv PULLIK — hisob qatori ham yaratiladi, aks holda
                   kassada u ko'rinmaydi va zanjir uzilib qoladi. */
                if (study.price) {
                    DEMO_CHARGES.push({
                        id: demoId('demo-charge'), clinicId: 'demo-clinic-1',
                        visitId: study.visitId || null, patientId: study.patientId || null,
                        patientName: study.patientName,
                        source: 'Study', sourceId: study.id, name: study.name,
                        quantity: 1, unitPrice: study.price, discount: 0, total: study.price,
                        status: 'Unpaid', paidAmount: 0, paidAt: null,
                        createdAt: demoNow(), createdByName: 'Demo Admin',
                    });
                }
                return demoDone(study);
            }
            return fetchJson<DiagnosticStudy>('/studies', { method: 'POST', body: JSON.stringify(data) });
        },
        update: (id: string, data: Partial<DiagnosticStudy>) => {
            if (isDemoMode()) {
                const i = DEMO_STUDIES.findIndex(s => s.id === id);
                if (i === -1) return Promise.reject(new Error('Tekshiruv topilmadi.'));
                /* Natija to'lovdan keyin — server bilan bir xil qoida
                   (402). Demoda ham shunday bo'lmasa, namoyishda
                   «to'lovsiz xulosa» ko'rsatib qo'yardik. */
                if (data.conclusion !== undefined || data.findings !== undefined || data.status === 'Completed') {
                    const unpaid = DEMO_CHARGES.find(c => c.source === 'Study' && c.sourceId === id && c.status === 'Unpaid');
                    if (unpaid) {
                        return Promise.reject(Object.assign(
                            new Error("Tekshiruv to'lanmagan. Bemorni kassaga yo'naltiring."),
                            { status: 402, due: (unpaid.total || 0) - (unpaid.paidAmount || 0) },
                        ));
                    }
                }
                DEMO_STUDIES[i] = { ...DEMO_STUDIES[i], ...data } as DiagnosticStudy;
                /* Xulosa yozilsa tekshiruv tugallangan hisoblanadi —
                   ro'yxatdagi holat o'zi o'zgarishi kerak. */
                if (data.conclusion || data.findings) {
                    DEMO_STUDIES[i].status = data.status || 'Completed';
                    DEMO_STUDIES[i].performedAt = DEMO_STUDIES[i].performedAt || demoNow();
                    DEMO_STUDIES[i].performedByName = DEMO_STUDIES[i].performedByName || 'Demo Admin';
                }
                return demoDone(DEMO_STUDIES[i]);
            }
            return fetchJson<DiagnosticStudy>(`/studies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_STUDIES.findIndex(s => s.id === id);
                if (i !== -1) DEMO_STUDIES.splice(i, 1);
                for (let k = DEMO_CHARGES.length - 1; k >= 0; k--) {
                    if (DEMO_CHARGES[k].source === 'Study' && DEMO_CHARGES[k].sourceId === id
                        && (DEMO_CHARGES[k].paidAmount || 0) === 0) DEMO_CHARGES.splice(k, 1);
                }
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/studies/${id}`, { method: 'DELETE' });
        },
    },

    // ─── Statsionar ─────────────────────────────────────────────────────────
    wards: {
        getAll: () => {
            if (isDemoMode()) { demoSyncBeds(); return demoRead<Ward[]>(DEMO_WARDS); }
            return fetchJson<Ward[]>('/wards');
        },
        create: (data: Partial<Ward> & { bedCount?: number }) => {
            if (isDemoMode()) {
                const id = `demo-ward-${Date.now()}`;
                const count = Number(data.bedCount) || 4;
                for (let i = 1; i <= count; i++) {
                    DEMO_BEDS.push({ id: `${id}-bed-${i}`, wardId: id, label: `${i}-koyka`, status: 'Free' });
                }
                const ward: Ward = {
                    id, clinicId: 'demo-clinic-1',
                    departmentId: data.departmentId ?? 'demo-inp',
                    name: data.name || 'Yangi palata',
                    floor: data.floor ?? null,
                    kind: data.kind || 'Umumiy',
                    dailyRate: Number(data.dailyRate) || 0,
                    isActive: true,
                    get beds() { return DEMO_BEDS.filter(b => b.wardId === id); },
                };
                DEMO_WARDS.push(ward);
                return demoRead<Ward>(ward);
            }
            return fetchJson<Ward>('/wards', { method: 'POST', body: JSON.stringify(data) });
        },
        update: (id: string, data: Partial<Ward>) => {
            if (isDemoMode()) {
                const w = DEMO_WARDS.find(x => x.id === id);
                /* `beds` — getter, unga yozib bo'lmaydi (qat'iy rejimda
                   TypeError). Kelgan ma'lumotdan uni ajratib tashlaymiz. */
                if (w) { const { beds, ...rest } = data; Object.assign(w, rest); }
                return demoRead<Ward>(w as Ward);
            }
            return fetchJson<Ward>(`/wards/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
    },
    admissions: {
        getAll: (params?: { status?: string; patientId?: string }) => {
            if (isDemoMode()) {
                demoSyncBeds();
                return demoRead<Admission[]>(DEMO_ADMISSIONS.filter(a =>
                    (!params?.status || a.status === params.status)
                    && (!params?.patientId || a.patientId === params.patientId)
                ).map(a => ({
                    ...a,
                    bed: DEMO_BEDS.find(b => b.id === a.bedId),
                    rounds: DEMO_ROUNDS.filter(r => r.admissionId === a.id),
                    medicationOrders: DEMO_MED_ORDERS.filter(m => m.admissionId === a.id),
                })));
            }
            const q = new URLSearchParams();
            if (params?.status) q.set('status', params.status);
            if (params?.patientId) q.set('patientId', params.patientId);
            const qs = q.toString();
            return fetchJson<Admission[]>(`/admissions${qs ? `?${qs}` : ''}`);
        },
        create: (data: Partial<Admission>) => {
            if (isDemoMode()) {
                const ward = DEMO_WARDS.find(w => DEMO_BEDS.some(b => b.wardId === w.id && b.id === data.bedId));
                const adm: Admission = {
                    id: `demo-adm-${Date.now()}`,
                    clinicId: 'demo-clinic-1',
                    patientId: data.patientId || '',
                    patientName: data.patientName || '',
                    departmentId: data.departmentId ?? 'demo-inp',
                    doctorId: data.doctorId ?? null,
                    doctorName: data.doctorName ?? null,
                    bedId: data.bedId ?? null,
                    admittedAt: new Date().toISOString(),
                    dischargedAt: null,
                    status: 'Active',
                    reason: data.reason ?? null,
                    diagnosis: data.diagnosis ?? null,
                    dailyRate: data.dailyRate ?? ward?.dailyRate ?? 0,
                    totalCharges: 0,
                };
                DEMO_ADMISSIONS.unshift(adm);
                demoSyncBeds();
                return demoRead<Admission>(adm);
            }
            return fetchJson<Admission>('/admissions', { method: 'POST', body: JSON.stringify(data) });
        },
        update: (id: string, data: Partial<Admission>) => {
            if (isDemoMode()) {
                const a = DEMO_ADMISSIONS.find(x => x.id === id);
                if (a) Object.assign(a, data);
                demoSyncBeds();
                return demoRead<Admission>(a as Admission);
            }
            return fetchJson<Admission>(`/admissions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        /** Epikrizning to'rt qismi (reliz 4). Eski shakl — bitta matn — ham ishlaydi. */
        /** `confirmDebt` — qarz bo'lsa ham chiqarish. Busiz server 409 va
         *  qarz summasini qaytaradi: bemorni ushlab turmaydi, lekin
         *  jimgina ham o'tkazmaydi. */
        discharge: (id: string, data?: string | {
            dischargeSummary?: string;
            admissionDiagnosis?: string;
            finalDiagnosis?: string;
            treatmentGiven?: string;
            recommendations?: string;
            confirmDebt?: boolean;
        }) =>
            isDemoMode() ? (() => {
                const a = DEMO_ADMISSIONS.find(x => x.id === id);
                if (a) {
                    a.status = 'Discharged';
                    a.dischargedAt = new Date().toISOString();
                    a.dischargeSummary = typeof data === 'string' ? data : (data?.dischargeSummary ?? null);
                    /* Epikriz qismlari ham saqlanadi — bosma varaq yozilganini ko'rsatsin */
                    if (data && typeof data === 'object') {
                        const ext = a as Admission & Record<string, unknown>;
                        if (data.admissionDiagnosis !== undefined) ext.admissionDiagnosis = data.admissionDiagnosis;
                        if (data.finalDiagnosis !== undefined) ext.finalDiagnosis = data.finalDiagnosis;
                        if (data.treatmentGiven !== undefined) ext.treatmentGiven = data.treatmentGiven;
                        if (data.recommendations !== undefined) ext.recommendations = data.recommendations;
                    }
                    a.bedId = null;
                }
                demoSyncBeds();
                return demoRead<Admission>(a as Admission);
            })() : fetchJson<Admission>(`/admissions/${id}/discharge`, {
                method: 'POST',
                body: JSON.stringify(typeof data === 'string' ? { dischargeSummary: data } : (data || {})),
            }),
        addRound: (id: string, data: Omit<Partial<InpatientRound>, 'vitalSigns'> & { vitalSigns?: any }) => {
            if (isDemoMode()) {
                const round: InpatientRound = {
                    id: `demo-round-${Date.now()}`,
                    admissionId: id,
                    date: new Date().toISOString(),
                    doctorId: data.doctorId ?? null,
                    doctorName: data.doctorName ?? null,
                    vitalSigns: typeof data.vitalSigns === 'string' ? data.vitalSigns : (data.vitalSigns ? JSON.stringify(data.vitalSigns) : null),
                    notes: data.notes ?? null,
                    plan: data.plan ?? null,
                };
                DEMO_ROUNDS.push(round);
                return demoRead<InpatientRound>(round);
            }
            return fetchJson<InpatientRound>(`/admissions/${id}/rounds`, { method: 'POST', body: JSON.stringify(data) });
        },
        addMedication: (id: string, data: Partial<MedicationOrder>) => {
            if (isDemoMode()) {
                const order: MedicationOrder = {
                    id: `demo-med-${Date.now()}`,
                    admissionId: id,
                    name: data.name || '',
                    dosage: data.dosage ?? null,
                    route: data.route ?? null,
                    frequency: data.frequency ?? null,
                    startDate: new Date().toISOString(),
                    status: 'Active',
                };
                DEMO_MED_ORDERS.push(order);
                return demoRead<MedicationOrder>(order);
            }
            return fetchJson<MedicationOrder>(`/admissions/${id}/medications`, { method: 'POST', body: JSON.stringify(data) });
        },

        /* ─── Reliz 4: statsionar ─────────────────────────────────────────
           Koyka haqi QUVIB YETUVCHI: har chaqiriqda yotgan kunlarni oxirigacha
           hisoblaydi va takroriy qator yaratmaydi. Shuning uchun uni ekran
           ochilganda chaqirish xavfsiz. */
        chargeBedDays: (id: string) => {
            if (isDemoMode()) {
                /* Server bilan bir xil: har kun — alohida qator (`sourceId`
                   = yotish:kun), bor kun qayta yozilmaydi. Ilgari demo bu yerda
                   SUMMANI «kun» deb qaytarardi («+450000 kun yozildi») va
                   qator yaratmasdi — hisob va chek soxta raqamdan chiqardi. */
                const a = DEMO_ADMISSIONS.find(x => x.id === id);
                if (!a || !(a.dailyRate > 0)) return demoRead({ charged: 0, from: null, to: null, total: 0 });
                const end = a.dischargedAt ? new Date(a.dischargedAt) : new Date();
                const day = new Date(a.admittedAt);
                day.setHours(0, 0, 0, 0);
                const days: string[] = [];
                let total = 0;
                for (let guard = 0; day <= end && guard < 400; guard++, day.setDate(day.getDate() + 1)) {
                    const d = demoLocalDay(day);
                    const sourceId = `${a.id}:${d}`;
                    if (DEMO_CHARGES.some(c => c.source === 'Bed' && c.sourceId === sourceId)) continue;
                    DEMO_CHARGES.push(demoAdmissionCharge(a, { source: 'Bed', sourceId, name: `Koyka (${d})`, amount: a.dailyRate }));
                    days.push(d);
                    total += a.dailyRate;
                }
                if (days.length === 0) return demoRead({ charged: 0, from: null, to: null, total: 0 });
                a.totalCharges = (a.totalCharges || 0) + total;
                return demoDone({ charged: days.length, from: days[0], to: days[days.length - 1], total });
            }
            return fetchJson<{
                charged: number; from: string | null; to: string | null; total: number; skipped?: string;
            }>(`/admissions/${id}/charge-bed-days`, { method: 'POST' });
        },

        /** Yotish hisobi: yozilgan, to'langan, qarz, avans (depozit) */
        billing: (id: string) => {
            if (isDemoMode()) {
                /* Hisob QATORLARDAN — server (`GET /admissions/:id/billing`)
                   bilan bir xil. Ilgari demo «to'langan = 60%» deb o'ylab
                   topardi va qo'shilgan dori hisobda ham, chekda ham chiqmasdi. */
                const a = DEMO_ADMISSIONS.find(x => x.id === id);
                if (!a) return Promise.reject(new Error('Yotish topilmadi'));
                const charges = DEMO_CHARGES.filter(c => c.admissionId === id && c.status !== 'Cancelled');
                const accrued = charges.reduce((s, c) => s + (c.total || 0), 0);
                const paid = charges.reduce((s, c) => s + (c.paidAmount || 0), 0);
                const bySource: Record<string, { count: number; total: number; paid: number }> = {};
                for (const c of charges) {
                    const k = String(c.source);
                    const cur = bySource[k] || { count: 0, total: 0, paid: 0 };
                    bySource[k] = { count: cur.count + 1, total: cur.total + (c.total || 0), paid: cur.paid + (c.paidAmount || 0) };
                }
                const patient = DEMO_PATIENTS.find(p => p.id === a.patientId);
                return demoRead({
                    accrued, paid, due: accrued - paid,
                    advance: Math.max(0, (patient as any)?.balance || 0),
                    bySource, charges,
                });
            }
            return fetchJson<{
                accrued: number; paid: number; due: number; advance: number;
                bySource: Record<string, { count: number; total: number; paid: number }>;
                charges: any[];
            }>(`/admissions/${id}/billing`);
        },

        /** Hisobga qo'lda qator: nom + summa (dori, muolaja, boshqa).
         *  Ombordan hech narsa yechilmaydi — bu faqat hisob. */
        addCharge: (id: string, data: { name: string; amount: number; source?: 'Medication' | 'Service' | 'Other' }) => {
            if (isDemoMode()) {
                /* Tekshiruvlar server bilan bir xil (`POST /admissions/:id/charges`) */
                const a = DEMO_ADMISSIONS.find(x => x.id === id);
                if (!a) return Promise.reject(new Error('Yotish topilmadi'));
                if (a.status === 'Discharged') return Promise.reject(new Error('Bemor chiqarilgan'));
                const name = String(data.name || '').trim().slice(0, 200);
                const amount = Math.round(Number(data.amount));
                if (!name) return Promise.reject(new Error('Nomini kiriting'));
                if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
                    return Promise.reject(new Error("Summa noto'g'ri"));
                }
                const source = (['Medication', 'Service', 'Other'] as const).includes(data.source as any)
                    ? data.source as VisitCharge['source'] : 'Other';
                const row = demoAdmissionCharge(a, { source, name, amount });
                DEMO_CHARGES.push(row);
                a.totalCharges = (a.totalCharges || 0) + amount;
                return demoDone(row);
            }
            return fetchJson<VisitCharge>(`/admissions/${id}/charges`, { method: 'POST', body: JSON.stringify(data) });
        },

        /** Kunlik dori varag'i: tayinlovlar + shu kundagi belgilar */
        mar: (id: string, date?: string) => {
            if (isDemoMode()) {
                const day = date || todayISO();
                const orders = DEMO_MED_ORDERS.filter(m => m.admissionId === id);
                return demoRead<any>({
                    date: day,
                    orders: orders.map(o => {
                        const marks = demoMedMarks(o.id, day);
                        return {
                            ...o,
                            administrations: marks,
                            givenToday: marks.filter(m => m.status === 'Given').length,
                            ...demoMedSchedule(o, marks, day),
                        };
                    }),
                });
            }
            return fetchJson<any>(`/admissions/${id}/mar${date ? `?date=${date}` : ''}`);
        },

        transfer: (id: string, data: { toBedId?: string | null; toDepartmentId?: string | null; reason?: string }) => {
            if (isDemoMode()) {
                const a = DEMO_ADMISSIONS.find(x => x.id === id);
                const from = a?.bedId ?? null;
                if (a && data.toBedId !== undefined) a.bedId = data.toBedId;
                if (a && data.toDepartmentId !== undefined) a.departmentId = data.toDepartmentId;
                const rec = {
                    id: `demo-transfer-${Date.now()}`, admissionId: id,
                    fromBedId: from, toBedId: data.toBedId ?? null,
                    reason: data.reason || '', at: new Date().toISOString(),
                };
                DEMO_TRANSFERS.push(rec);
                demoSyncBeds();
                return demoRead<any>(rec);
            }
            return fetchJson<any>(`/admissions/${id}/transfer`, { method: 'POST', body: JSON.stringify(data) });
        },

        transfers: (id: string) => {
            if (isDemoMode()) return demoRead<any[]>(DEMO_TRANSFERS.filter(t => t.admissionId === id));
            return fetchJson<any[]>(`/admissions/${id}/transfers`);
        },
    },

    /* «Bugun» ekranidagi laboratoriya va statsionar zonalari. Bitta so'rov,
       raqamlar serverda sanaladi (`backend/todayZones.ts`) — yo'llanmalar
       ro'yxatini to'liq yuklab brauzerda sanash yillar o'tib og'irlashardi. */
    today: {
        zones: () => {
            if (isDemoMode()) {
                /* Qoidalar serverdagi bilan bir xil: kutayotganlar — oxirgi
                   24 soat, eskisi — `stale`; muddat — proba olingandan 24 soat. */
                demoSyncBeds();
                const today = todayISO();
                const nowMs = Date.now();
                const dayAgo = nowMs - 864e5;
                const at = (iso?: string | null) => (iso ? Date.parse(iso) : 0);
                const status = (o: any) => String(o.status || '');
                const ordered = DEMO_LAB_ORDERS.filter(o => status(o) === 'Ordered');
                const waiting = ordered.filter(o => at(o.orderedAt) >= dayAgo);
                const people = new Map<string, { patientId: string | null; patientName: string; urgent: boolean }>();
                for (const o of waiting) {
                    const key = o.patientId || `name:${o.patientName}`;
                    const seen = people.get(key);
                    const urgent = o.priority === 'Urgent';
                    if (seen) seen.urgent = seen.urgent || urgent;
                    else people.set(key, { patientId: o.patientId || null, patientName: o.patientName, urgent });
                }
                const working = DEMO_LAB_ORDERS
                    .filter(o => ['Collected', 'InProgress', 'In-Progress'].includes(status(o)))
                    .map(o => ({
                        overdue: nowMs > at(o.sampleCollectedAt || o.orderedAt) + 24 * 3600e3,
                        urgent: o.priority === 'Urgent',
                    }))
                    .sort((a, b) => Number(b.overdue) - Number(a.overdue));
                const ready = DEMO_LAB_ORDERS.filter(o =>
                    status(o) === 'Completed' && dayKey(o.completedAt) === today);

                const active = DEMO_ADMISSIONS.filter(a => a.status === 'Active');
                const seenToday = (admissionId: string) => DEMO_ROUNDS.some(r =>
                    r.admissionId === admissionId && dayKey(r.date) === today);
                const wards = DEMO_WARDS.filter(w => w.isActive).map(w => ({
                    id: w.id,
                    name: w.name,
                    beds: (w.beds || []).map(b => {
                        const adm = active.find(a => a.bedId === b.id) || null;
                        return {
                            id: b.id, label: b.label, status: b.status,
                            admissionId: adm?.id || null,
                            patientName: adm?.patientName || null,
                            admittedToday: !!adm && dayKey(adm.admittedAt) === today,
                            seenToday: !!adm && seenToday(adm.id),
                        };
                    }),
                }));
                const beds = wards.flatMap(w => w.beds);
                const count = (st: string) => beds.filter(b => b.status === st).length;
                const medsDue = demoMedRows(today).flatMap(r => r.orders).filter(o => o.due > 0).length;
                return demoRead<TodayZones>({
                    date: today,
                    lab: {
                        waiting: { count: people.size, people: [...people.values()].slice(0, 6) },
                        stale: ordered.length - waiting.length,
                        working: { count: working.length, overdue: working.filter(x => x.overdue).length, items: working.slice(0, 24) },
                        ready: { count: ready.length, unseen: ready.filter(o => !o.seenByDoctorAt).length },
                    },
                    inpatient: wards.length ? {
                        beds: { total: beds.length, occupied: count('Occupied'), free: count('Free'), cleaning: count('Cleaning'), blocked: count('Blocked') },
                        wards,
                        admittedToday: beds.filter(b => b.admittedToday).length,
                        dischargedToday: DEMO_ADMISSIONS.filter(a =>
                            a.status === 'Discharged' && dayKey(a.dischargedAt) === today).length,
                        notSeenToday: active.filter(a => !seenToday(a.id)).length,
                        medsDue,
                    } : null,
                });
            }
            return fetchJson<TodayZones>('/today/zones');
        },
    },

    /* Statsionar: bo'lim bo'yicha kunlik ro'yxat, dori berilishi, o'lchovlar */
    inpatient: {
        medSchedule: (params?: { date?: string; departmentId?: string }) => {
            if (isDemoMode()) {
                /* SHAKL SERVERNIKI BILAN BIR XIL (`rows`). Bu yerda ilgari
                   `items` degan tekis ro'yxat qaytarilardi, ekran esa
                   `rows` ni o'qiydi — namoyishda «Dorilar» vkladkasi doim
                   bo'sh turardi. */
                const day = params?.date || todayISO();
                return demoRead<any>({ date: day, rows: demoMedRows(day) });
            }
            const q = new URLSearchParams();
            if (params?.date) q.set('date', params.date);
            if (params?.departmentId) q.set('departmentId', params.departmentId);
            const qs = q.toString();
            return fetchJson<any>(`/inpatient/med-schedule${qs ? `?${qs}` : ''}`);
        },
        /** Dori berilgani (yoki berilmagani) — fakt yoziladi, ombor va hisob o'zi yuriladi */
        administer: (orderId: string, data: {
            dose?: string; quantity?: number;
            status?: 'Given' | 'Skipped' | 'Refused';
            skipReason?: string; note?: string;
        }) => {
            if (isDemoMode()) {
                const rec = {
                    id: `demo-adm-give-${Date.now()}`, orderId,
                    at: new Date().toISOString(),
                    note: data.note || data.skipReason || (data.status === 'Given' ? 'Berildi' : data.status || 'Berildi'),
                };
                DEMO_ADMINISTRATIONS.push(rec);
                return demoRead<any>(rec);
            }
            return fetchJson<any>(`/medication-orders/${orderId}/administer`, { method: 'POST', body: JSON.stringify(data) });
        },

        vitals: (patientId: string, params?: { kind?: string; from?: string; to?: string; admissionId?: string }) => {
            if (isDemoMode()) {
                return demoRead<any[]>(DEMO_VITALS.filter(v =>
                    v.patientId === patientId && (!params?.kind || v.kind === params.kind)
                ));
            }
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<any[]>(`/patients/${patientId}/vitals${qs ? `?${qs}` : ''}`);
        },
        addVitals: (data: {
            patientId: string; admissionId?: string | null; visitId?: string | null;
            measuredAt?: string;
            measurements: { kind: string; value: number; unit?: string }[];
        }) => {
            if (isDemoMode()) {
                const at = data.measuredAt || new Date().toISOString();
                const added = data.measurements.map((m, i) => ({
                    id: `demo-vital-${Date.now()}-${i}`,
                    patientId: data.patientId, admissionId: data.admissionId ?? null,
                    kind: m.kind, value: m.value, unit: m.unit || '', measuredAt: at,
                }));
                DEMO_VITALS.push(...added);
                return demoRead<any[]>(added);
            }
            return fetchJson<any[]>('/vitals', { method: 'POST', body: JSON.stringify(data) });
        },

        /** Koyka tozalandi: Cleaning -> Free. Ilgari koyka abadiy tozalashda qolardi. */
        bedReady: (bedId: string) => {
            if (isDemoMode()) {
                const b = DEMO_BEDS.find(x => x.id === bedId);
                if (b && b.status === 'Cleaning') b.status = 'Free';
                return demoRead<any>(b);
            }
            return fetchJson<any>(`/beds/${bedId}/ready`, { method: 'POST' });
        },

        /* ─── KOYKA VA TAYINLOVNI BOSHQARISH ────────────────────────────
           Koykalar ilgari FAQAT palata yaratilganda, `bedCount` orqali
           paydo bo'lardi: bitta koyka qo'shish yoki uni ta'mirga
           chiqarish uchun palatani o'chirib qayta yaratish kerak edi. */
        addBed: (wardId: string, label?: string) => {
            if (isDemoMode()) {
                const n = DEMO_BEDS.filter(b => b.wardId === wardId).length + 1;
                const bed = { id: demoId('demo-bed'), wardId, label: label || `${n}-koyka`, status: 'Free' } as any;
                DEMO_BEDS.push(bed);
                return demoDone(bed);
            }
            return fetchJson<any>(`/wards/${wardId}/beds`, {
                method: 'POST', body: JSON.stringify({ label: label || undefined }),
            });
        },
        updateBed: (bedId: string, data: { label?: string; status?: string }) => {
            if (isDemoMode()) {
                const b = DEMO_BEDS.find(x => x.id === bedId);
                if (!b) return Promise.reject(new Error('Koyka topilmadi'));
                if (b.status === 'Occupied') return Promise.reject(new Error('Koyka band — bemor yotibdi'));
                Object.assign(b, data);
                return demoDone(b);
            }
            return fetchJson<any>(`/beds/${bedId}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        deleteBed: (bedId: string) => {
            if (isDemoMode()) {
                const i = DEMO_BEDS.findIndex(x => x.id === bedId);
                if (i !== -1) DEMO_BEDS.splice(i, 1);
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/beds/${bedId}`, { method: 'DELETE' });
        },
        /** Tayinlovni to'xtatish — kunlik varaqdan chiqadi */
        stopMedication: (orderId: string) => {
            if (isDemoMode()) {
                const o = DEMO_MED_ORDERS.find(x => x.id === orderId);
                if (o) { o.status = 'Stopped'; o.endDate = demoNow(); }
                return demoDone(o || { id: orderId, status: 'Stopped' });
            }
            return fetchJson<any>(`/medication-orders/${orderId}`, {
                method: 'PUT', body: JSON.stringify({ status: 'Stopped' }),
            });
        },
    },

    // ─── Retsept ────────────────────────────────────────────────────────────
    prescriptions: {
        /* `patientId` demoda E'TIBORSIZ qolardi — bemor kartasida BOSHQA
           bemorlarning retseptlari ko'rinardi. Server esa filtrlaydi. */
        getAll: (patientId?: string) =>
            isDemoMode()
                ? demoRead<Prescription[]>(patientId ? DEMO_PRESCRIPTIONS.filter(p => p.patientId === patientId) : [...DEMO_PRESCRIPTIONS])
                : fetchJson<Prescription[]>(`/prescriptions${patientId ? `?patientId=${patientId}` : ''}`),
        create: (data: Partial<Prescription> & { items: Partial<PrescriptionItem>[] }) => {
            if (isDemoMode()) {
                const rx = {
                    id: demoId('demo-rx'), clinicId: 'demo-clinic-1',
                    patientName: data.patientName || demoName(data.patientId || ''),
                    doctorName: data.doctorName || 'Dr. Kamola Ahmedova',
                    date: data.date || todayISO(),
                    status: data.status || 'Issued',
                    ...data,
                    items: (data.items || []).map((it, i) => ({ id: demoId(`demo-rxi-${i}`), ...it })),
                } as Prescription;
                DEMO_PRESCRIPTIONS.unshift(rx);
                return demoDone(rx);
            }
            return fetchJson<Prescription>('/prescriptions', { method: 'POST', body: JSON.stringify(data) });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_PRESCRIPTIONS.findIndex(p => p.id === id);
                if (i !== -1) DEMO_PRESCRIPTIONS.splice(i, 1);
                return demoDone({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/prescriptions/${id}`, { method: 'DELETE' });
        },
    },

    // ─── Ombor: partiya va muddat ───────────────────────────────────────────
    batches: {
        getAll: (itemId: string) =>
            isDemoMode() ? demoRead<InventoryBatch[]>(DEMO_BATCHES.filter(b => b.itemId === itemId)) : fetchJson<InventoryBatch[]>(`/inventory/${itemId}/batches`),
        create: (itemId: string, data: Partial<InventoryBatch>) => {
            if (isDemoMode()) {
                const batch = {
                    id: demoId('demo-batch'), itemId,
                    batchNumber: data.batchNumber || null,
                    expiryDate: data.expiryDate || null,
                    quantity: data.quantity || 0,
                    cost: data.cost || 0,
                    receivedAt: demoNow(),
                    expired: !!data.expiryDate && data.expiryDate < todayISO(),
                } as InventoryBatch;
                DEMO_BATCHES.unshift(batch);
                /* Partiya qo'shilishi — bu KIRIM. Qoldiq ham oshishi kerak,
                   aks holda «Partiya» tabida 40 dona, «Qoldiq» ustunida
                   eski son turadi va ikki ekran bir-biriga zid ko'rinadi. */
                if (batch.quantity > 0) {
                    demoStockMove('In', itemId, batch.quantity, 'Yangi partiya',
                        { note: batch.batchNumber || undefined });
                }
                return demoDone(batch);
            }
            return fetchJson<InventoryBatch>(`/inventory/${itemId}/batches`, { method: 'POST', body: JSON.stringify(data) });
        },
        // Muddati o'tgan/yaqinlashgan partiyalar — Ombor sahifasidagi ogohlantirish
        expiring: (days = 60) => {
            if (isDemoMode()) {
                /* Ilgari «birinchi uchtasi» qaytarilardi — muddati bilan
                   hech qanday aloqasi yo'q edi, ya'ni ro'yxat yolg'on. */
                const limit = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                return demoRead<InventoryBatch[]>(
                    DEMO_BATCHES.filter(b => b.expiryDate && b.expiryDate <= limit && b.quantity > 0));
            }
            return fetchJson<InventoryBatch[]>(`/inventory-expiring?days=${days}`);
        },
    },
    batch: {
        remindDebts: (clinicId: string, debtors: any[], message?: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true as const, count: 0, message: 'Demo rejim: xabarlar yuborilmadi' });
            return fetchJson<{ success: true; count: number; message?: string }>('/batch/remind-debts?clinicId=' + clinicId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, debtors, message }),
            });
        },
    },
    messageTemplates: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_MESSAGE_TEMPLATES);
            return fetchJson<MessageTemplate[]>(`/message-templates?clinicId=${clinicId}`);
        },
        create: (data: Omit<MessageTemplate, 'id'>) => {
            if (isDemoMode()) {
                const newTpl = { ...data, id: `demo-tpl-${Date.now()}`, createdAt: new Date().toISOString() } as MessageTemplate;
                DEMO_MESSAGE_TEMPLATES.unshift(newTpl);
                saveDemoData();
                return Promise.resolve(newTpl);
            }
            return fetchJson<MessageTemplate>('/message-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<MessageTemplate>) => {
            if (isDemoMode()) {
                const index = DEMO_MESSAGE_TEMPLATES.findIndex(t => t.id === id);
                if (index !== -1) {
                    DEMO_MESSAGE_TEMPLATES[index] = { ...DEMO_MESSAGE_TEMPLATES[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_MESSAGE_TEMPLATES[index]);
                }
                return Promise.reject('Template not found');
            }
            return fetchJson<MessageTemplate>(`/message-templates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_MESSAGE_TEMPLATES.findIndex(t => t.id === id);
                if (index !== -1) { DEMO_MESSAGE_TEMPLATES.splice(index, 1); saveDemoData(); }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/message-templates/${id}`, { method: 'DELETE' });
        },
        syncEskizStatus: (id: string) => {
            if (isDemoMode()) {
                const tpl = DEMO_MESSAGE_TEMPLATES.find(t => t.id === id);
                return Promise.resolve(tpl as MessageTemplate);
            }
            return fetchJson<MessageTemplate>(`/message-templates/${id}/sync-eskiz-status`, { method: 'POST' });
        },
    },
    automationTriggers: {
        getAll: () => {
            if (isDemoMode()) return Promise.resolve(DEMO_TRIGGERS);
            return fetchJson<TriggerDescriptor[]>('/automation-triggers');
        },
    },
    automationRules: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_AUTOMATION_RULES);
            return fetchJson<AutomationRule[]>(`/automation-rules?clinicId=${clinicId}`);
        },
        create: (data: Omit<AutomationRule, 'id'>) => {
            if (isDemoMode()) {
                const newRule = { ...data, id: `demo-rule-${Date.now()}`, createdAt: new Date().toISOString() } as AutomationRule;
                DEMO_AUTOMATION_RULES.unshift(newRule);
                saveDemoData();
                return Promise.resolve(newRule);
            }
            return fetchJson<AutomationRule>('/automation-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<AutomationRule>) => {
            if (isDemoMode()) {
                const index = DEMO_AUTOMATION_RULES.findIndex(r => r.id === id);
                if (index !== -1) {
                    DEMO_AUTOMATION_RULES[index] = { ...DEMO_AUTOMATION_RULES[index], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_AUTOMATION_RULES[index]);
                }
                return Promise.reject('Rule not found');
            }
            return fetchJson<AutomationRule>(`/automation-rules/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_AUTOMATION_RULES.findIndex(r => r.id === id);
                if (index !== -1) { DEMO_AUTOMATION_RULES.splice(index, 1); saveDemoData(); }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/automation-rules/${id}`, { method: 'DELETE' });
        },
    },
    messages: {
        // Yuborish serverda fonda bajariladi — javob darhol qaytadi, jarayonni
        // bulkStatus() orqali kuzatiladi, natija esa Tarix bo'limida ko'rinadi.
        sendBulk: (clinicId: string, patientIds: string[], message: string, channel: MessageChannel) => {
            if (isDemoMode()) {
                return Promise.resolve({ total: patientIds.length, queued: true });
            }
            return fetchJson<{ total: number; queued: boolean }>('/messages/send-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, patientIds, message, channel }),
            });
        },
        testSend: (clinicId: string, message: string, channel: 'sms' | 'telegram', phone?: string, patientId?: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true, sentText: message });
            return fetchJson<{ success: true; sentText: string }>('/messages/test-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, message, channel, phone, patientId }),
            });
        },
        // Segment qurish uchun mavjud maydonlar — forma shu ro'yxatdan quriladi
        segmentFields: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_SEGMENT_FIELDS);
            return fetchJson<SegmentFieldDescriptor[]>(`/messages/segment-fields?clinicId=${clinicId}`);
        },
        // Saqlangan segmentlar — bir marta yig'ilib, qayta ishlatiladi
        savedSegments: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([] as SavedSegment[]);
            return fetchJson<SavedSegment[]>(`/messages/saved-segments?clinicId=${clinicId}`);
        },
        saveSegment: (clinicId: string, name: string, segment: AudienceSegment) => {
            if (isDemoMode()) {
                return Promise.resolve({ id: `demo-${Date.now()}`, name, segment, createdAt: new Date().toISOString() } as SavedSegment);
            }
            return fetchJson<SavedSegment>('/messages/saved-segments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, name, segment }),
            });
        },
        deleteSegment: (clinicId: string, id: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true as const });
            return fetchJson<{ success: true }>(`/messages/saved-segments/${id}?clinicId=${clinicId}`, { method: 'DELETE' });
        },
        // Auditoriyani doim server hisoblaydi — "qarzdor" ta'rifi bitta bo'lsin
        audience: (clinicId: string, segment: AudienceSegment, channel: MessageChannel) => {
            if (isDemoMode()) {
                // Demoda filtr haqiqatan ishlaydi (services/demoAudience.ts)
                return Promise.resolve(demoAudience(DEMO_PATIENTS, segment, channel, !!DEMO_CLINIC.botToken));
            }
            return fetchJson<AudiencePreview>('/messages/audience', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, segment, channel }),
            });
        },
        bulkStatus: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve({ active: false } as BulkSendStatus);
            return fetchJson<BulkSendStatus>(`/messages/bulk-status?clinicId=${clinicId}`);
        },
        getLogs: (clinicId: string, status?: 'sent' | 'failed', limit = 200) => {
            if (isDemoMode()) {
                const all = DEMO_MESSAGE_LOGS;
                const sent = all.filter(l => l.status === 'Sent').length;
                const failed = all.filter(l => l.status === 'Failed').length;
                const logs = status === 'sent' ? all.filter(l => l.status === 'Sent')
                    : status === 'failed' ? all.filter(l => l.status === 'Failed')
                        : all;
                return Promise.resolve({ logs, stats: { total: all.length, sent, failed } });
            }
            const statusParam = status ? `&status=${status}` : '';
            return fetchJson<{ logs: MessageLog[]; stats: { total: number; sent: number; failed: number } }>(`/messages/logs?clinicId=${clinicId}&limit=${limit}${statusParam}`);
        },
        retry: (clinicId: string, logIds: string[]) => {
            if (isDemoMode()) return Promise.resolve({ retried: logIds.length, success: logIds.length, failed: 0, skipped: 0 });
            return fetchJson<{ retried: number; success: number; failed: number; skipped: number }>('/messages/retry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, logIds }),
            });
        },
    },
    inventory: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_INVENTORY);
            return fetchJson<InventoryItem[]>(`/inventory?clinicId=${clinicId}`);
        },
        /* TAHRIRLASH. Ilgari bu metod UMUMAN yo'q edi — na bu yerda, na
           serverda: mahsulotni yaratgandan keyin nomini ham, o'lchov
           birligini ham, tannarxini ham o'zgartirib bo'lmasdi. Qoldiqqa
           tegilmaydi: u harakatlar yig'indisi (0028). */
        update: (id: string, data: Partial<InventoryItem>) => {
            if (isDemoMode()) {
                const i = DEMO_INVENTORY.findIndex(x => x.id === id);
                if (i === -1) return Promise.reject(new Error('Mahsulot topilmadi'));
                DEMO_INVENTORY[i] = { ...DEMO_INVENTORY[i], ...data, quantity: DEMO_INVENTORY[i].quantity };
                saveDemoData();
                return demoDone(DEMO_INVENTORY[i]);
            }
            return fetchJson<InventoryItem>(`/inventory/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        create: (data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'> & { initialCost?: number }) => {
            if (isDemoMode()) {
                const { initialCost, ...rest } = data;
                const newItem = {
                    ...rest,
                    id: `demo-item-${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                } as InventoryItem;
                DEMO_INVENTORY.push(newItem);
                if (initialCost && initialCost > 0) {
                    DEMO_EXPENSES.push({
                        id: `demo-exp-${Date.now()}`,
                        date: todayISO(),
                        amount: initialCost,
                        category: 'Inventory',
                        title: `Ombor: ${newItem.name}`,
                        clinicId: newItem.clinicId,
                        inventoryItemId: newItem.id,
                    });
                }
                saveDemoData();
                return Promise.resolve(newItem);
            }
            return fetchJson<InventoryItem>('/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        /* `updateStock` OLIB TASHLANDI (0028).
           U `PUT /api/inventory/:id/stock` ni chaqirardi — qoldiqni qayta
           yozib, eski jurnalga tushardi va partiyalarga tegmasdi. Kirim va
           chiqim endi faqat `api.stock.*` orqali. */
        delete: (id: string) => {
            if (isDemoMode()) {
                const index = DEMO_INVENTORY.findIndex(i => i.id === id);
                if (index !== -1) {
                    DEMO_INVENTORY.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/inventory/${id}`, {
                method: 'DELETE',
            });
        },
        getLogs: (clinicId: string, patientId?: string) => {
            if (isDemoMode()) {
                if (patientId) {
                    return Promise.resolve(DEMO_INVENTORY_LOGS.filter(l => l.patientId === patientId));
                }
                return Promise.resolve(DEMO_INVENTORY_LOGS);
            }
            return fetchJson<InventoryLog[]>(`/inventory/logs?clinicId=${clinicId}${patientId ? `&patientId=${patientId}` : ''}`);
        },
        /* `deleteLog` OLIB TASHLANDI (0028) — jurnal qatori o'chirilmaydi.
           Xato yozilgan chiqim `api.stock.reverse()` bilan bekor qilinadi:
           teskari harakat yoziladi, ikkala qator ham tarixda qoladi. */
        getAnalytics: (clinicId: string, startDate?: string, endDate?: string) => {
            if (isDemoMode()) return Promise.resolve([]); // Simple empty analytics for demo
            return fetchJson<any[]>(`/inventory/analytics?clinicId=${clinicId}${startDate ? `&startDate=${startDate}` : ''}${endDate ? `&endDate=${endDate}` : ''}`);
        },
    },
    bot: {
        getLogs: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([]);
            return fetchJson<any[]>(`/clinics/${clinicId}/bot-logs`);
        }
    },
    reviews: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([]);
            return fetchJson<any[]>(`/clinics/${clinicId}/reviews`);
        }
    },
    leads: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([...DEMO_LEADS]);
            return fetchJson<Lead[]>(`/leads?clinicId=${clinicId}`);
        },
        create: (data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => {
            if (isDemoMode()) {
                const newLead: Lead = {
                    ...data,
                    id: `demo-lead-${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                } as Lead;
                DEMO_LEADS.push(newLead);
                saveDemoData();
                return Promise.resolve(newLead);
            }
            return fetchJson<Lead>('/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: Partial<Lead>) => {
            if (isDemoMode()) {
                const index = DEMO_LEADS.findIndex(l => l.id === id);
                if (index !== -1) {
                    DEMO_LEADS[index] = { ...DEMO_LEADS[index], ...data, updatedAt: new Date().toISOString() };
                    saveDemoData();
                    return Promise.resolve(DEMO_LEADS[index]);
                }
                return Promise.reject('Lead not found');
            }
            return fetchJson<Lead>(`/leads/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const idx = DEMO_LEADS.findIndex(l => l.id === id);
                if (idx !== -1) DEMO_LEADS.splice(idx, 1);
                saveDemoData();
                return Promise.resolve({ success: true as const });
            }
            return fetchJson<{ success: true }>(`/leads/${id}`, {
                method: 'DELETE',
            });
        },
        // Tashqi lid manbalari (yuboraman.uz va h.k.) uchun API kalit
        getApiKey: (clinicId: string) => {
            if (isDemoMode()) {
                return Promise.resolve({
                    apiKey: 'dk_live_demo0000000000000000000000000000',
                    createdAt: new Date().toISOString(),
                    endpoint: 'http://localhost:3101/api/public/leads'
                } as LeadApiKeyInfo);
            }
            return fetchJson<LeadApiKeyInfo>(`/leads/api-key?clinicId=${clinicId}`);
        },
        generateApiKey: (clinicId: string) => {
            if (isDemoMode()) {
                return Promise.resolve({
                    apiKey: `dk_live_demo${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    endpoint: 'http://localhost:3101/api/public/leads'
                } as LeadApiKeyInfo);
            }
            return fetchJson<LeadApiKeyInfo>('/leads/api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId }),
            });
        },
        revokeApiKey: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true as const });
            return fetchJson<{ success: true }>(`/leads/api-key?clinicId=${clinicId}`, {
                method: 'DELETE',
            });
        }
    },
    /* Yo'llanma — raqami va holati bor hujjat (reliz 4).
       `payload` da xizmatlar va summa BERILGAN paytdagi holatda saqlanadi:
       bemor qo'lidagi qog'oz bilan tizim bir xil bo'lishi kerak. */
    referrals: {
        getAll: (params?: { patientId?: string; status?: string; visitId?: string }) => {
            if (isDemoMode()) return demoRead<any[]>(DEMO_REFERRALS.filter(r =>
                (!params?.patientId || r.patientId === params.patientId)
                && (!params?.status || r.status === params.status)
                && (!params?.visitId || r.visitId === params.visitId)
            ).map(demoReferralView));
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<any[]>(`/referrals${qs ? `?${qs}` : ''}`);
        },
        /** Bosma varaq uchun: klinika shapkasi va yoyilgan payload bilan */
        get: (id: string) => {
            if (isDemoMode()) {
                const r = DEMO_REFERRALS.find(x => x.id === id);
                if (!r) return demoMissing<any>('bu yo\'llanma');
                // Server kabi: klinika shapkasi va yoyilgan payload bilan
                const { name, phone, address, licenseNumber, letterheadNote } = DEMO_CLINIC as any;
                return demoRead<any>({ ...demoReferralView(r), clinic: { name, phone, address, licenseNumber, letterheadNote } });
            }
            return fetchJson<any>(`/referrals/${id}`);
        },
        create: (data: {
            patientId: string; visitId?: string | null;
            kind: 'Lab' | 'Study' | 'Consult' | 'Cashier';
            targetDepartmentId?: string | null;
            items?: { name: string; price: number; quantity?: number }[];
        }) => {
            if (isDemoMode()) {
                /* Server bilan bir xil yozuv: raqam, kim bergan va payload
                   (berilgan paytdagi xizmatlar va summa). Ilgari bularsiz
                   bosma yo'llanma «—» bilan to'la chiqardi. */
                const clean = (data.items || [])
                    .map(it => ({
                        name: String(it?.name || '').trim().slice(0, 200),
                        price: Math.round(Number(it?.price) || 0),
                        quantity: Number(it?.quantity) > 0 ? Number(it.quantity) : 1,
                    }))
                    .filter(it => it.name);
                const total = clean.reduce((s, it) => s + it.price * it.quantity, 0);
                const visit = data.visitId ? DEMO_VISITS.find(v => v.id === data.visitId) : undefined;
                const year = new Date().getFullYear();
                const seq = DEMO_REFERRALS.filter(x => String(x.number || '').startsWith(`${year}-`)).length + 1;
                const now = demoNow();
                const r = {
                    id: demoId('demo-ref'), clinicId: 'demo-clinic-1',
                    patientId: data.patientId, visitId: data.visitId || null,
                    number: `${year}-${String(seq).padStart(4, '0')}`,
                    kind: data.kind,
                    targetDepartmentId: data.targetDepartmentId || null,
                    issuedByName: visit?.doctorName || auth.getSession()?.name || 'Demo Admin',
                    payload: clean.length ? { items: clean, total } : null,
                    status: 'Active', issuedAt: now, createdAt: now,
                };
                DEMO_REFERRALS.push(r);
                return demoRead<any>(demoReferralView(r));
            }
            return fetchJson<any>('/referrals', { method: 'POST', body: JSON.stringify(data) });
        },
        use: (id: string) => {
            if (isDemoMode()) {
                const r = DEMO_REFERRALS.find(x => x.id === id);
                if (r) r.status = 'Used';
                return demoRead<any>(r);
            }
            return fetchJson<any>(`/referrals/${id}/use`, { method: 'POST' });
        },
        cancel: (id: string) => {
            if (isDemoMode()) {
                const r = DEMO_REFERRALS.find(x => x.id === id);
                if (r) r.status = 'Cancelled';
                return demoRead<any>(r);
            }
            return fetchJson<any>(`/referrals/${id}/cancel`, { method: 'POST' });
        },
    },

    /* Hamshiralar (reliz 4, qaror В17). Boshqarish faqat klinika egasida —
       server ham shu rolni talab qiladi. */
    nurses: {
        getAll: () => {
            if (isDemoMode()) return demoRead<any[]>(DEMO_NURSES);
            return fetchJson<any[]>('/nurses');
        },
        create: (data: { firstName: string; lastName: string; phone?: string; departmentId?: string | null; username?: string; password?: string }) => {
            if (isDemoMode()) {
                const n = { id: `demo-nurse-${Date.now()}`, clinicId: 'demo-clinic-1', status: 'Active', ...data };
                DEMO_NURSES.push(n);
                return demoRead<any>(n);
            }
            return fetchJson<any>('/nurses', { method: 'POST', body: JSON.stringify(data) });
        },
        update: (id: string, data: Record<string, any>) => {
            if (isDemoMode()) {
                const n = DEMO_NURSES.find(x => x.id === id);
                if (n) Object.assign(n, data);
                return demoRead<any>(n);
            }
            return fetchJson<any>(`/nurses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
        },
        remove: (id: string) => {
            if (isDemoMode()) {
                const i = DEMO_NURSES.findIndex(x => x.id === id);
                if (i > -1) DEMO_NURSES.splice(i, 1);
                return demoRead<any>({ success: true });
            }
            return fetchJson<any>(`/nurses/${id}`, { method: 'DELETE' });
        },
    },

    labTechnicians: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([...DEMO_LAB_TECHNICIANS]);
            return fetchJson<any[]>(`/lab-technicians?clinicId=${clinicId}`);
        },
        create: (data: any) => {
            if (isDemoMode()) {
                const newTech = { ...data, id: `demo-tech-${Date.now()}`, status: 'Active' };
                DEMO_LAB_TECHNICIANS.push(newTech);
                saveDemoData();
                return Promise.resolve(newTech);
            }
            return fetchJson<any>('/lab-technicians', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: any) => {
            if (isDemoMode()) {
                const idx = DEMO_LAB_TECHNICIANS.findIndex(t => t.id === id);
                if (idx !== -1) {
                    DEMO_LAB_TECHNICIANS[idx] = { ...DEMO_LAB_TECHNICIANS[idx], ...data };
                    saveDemoData();
                    return Promise.resolve(DEMO_LAB_TECHNICIANS[idx]);
                }
                return Promise.reject('Technician not found');
            }
            return fetchJson<any>(`/lab-technicians/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const idx = DEMO_LAB_TECHNICIANS.findIndex(t => t.id === id);
                if (idx !== -1) {
                    DEMO_LAB_TECHNICIANS[idx].status = 'Deleted';
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/lab-technicians/${id}`, {
                method: 'DELETE',
            });
        },
    },
    labOrders: {
        /** Javobda `paid` va `due` ham keladi: laborant to'lovsiz natija
         *  bermaydi, shuning uchun holatni ro'yxatda ko'rishi kerak. */
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([...DEMO_LAB_ORDERS]);
            return fetchJson<any[]>(`/lab-orders?clinicId=${clinicId}`);
        },
        /** Proba olindi. To'lov yo'q bo'lsa ham bajariladi, lekin ogohlantiradi:
         *  qon olingan bo'lsa — olingan, faktni yozmaslik yomonroq. */
        collect: (id: string) => {
            if (isDemoMode()) {
                const order = DEMO_LAB_ORDERS.find(o => o.id === id);
                if (!order) return Promise.reject(new Error("Yo'llanma topilmadi."));
                order.status = 'In-Progress' as LabOrder['status'];
                order.sampleCollectedAt = demoNow();
                saveDemoData();
                /* To'lanmagan bo'lsa — OGOHLANTIRISH, to'siq emas: qon
                   olingan bo'lsa fakt yozilishi kerak (serverdagi qoida). */
                const due = DEMO_CHARGES
                    .filter(c => c.source === 'Lab' && c.patientId === order.patientId)
                    .reduce((s, c) => s + Math.max(0, (c.total || 0) - (c.paidAmount || 0)), 0);
                return demoDone({
                    order,
                    unpaidWarning: due > 0 ? `To'lanmagan qarz: ${due.toLocaleString('uz-UZ')} so'm` : null,
                });
            }
            return fetchJson<{ order: any; unpaidWarning: string | null }>(
                `/lab-orders/${id}/collect`, { method: 'POST' });
        },
        create: (data: any) => {
            if (isDemoMode()) {
                /* Server yo'llanmani TAHLILLARI bilan qaytaradi (`items`) va
                   holati `Ordered`. Bu yerda ikkalasi ham yo'q edi: holat
                   mavjud bo'lmagan `Pending`, tahlillar esa umuman yozilmasdi
                   — laboratoriya liniyasida va marshrutda bemor qatori
                   tahlil nomisiz («—») chiqardi. */
                const id = `demo-order-${Date.now()}`;
                const picked = DEMO_LAB_TESTS.filter(x => (data.testIds || []).includes(x.id));
                const newOrder = {
                    ...data,
                    id,
                    orderedAt: new Date().toISOString(),
                    status: 'Ordered',
                    priority: data.priority || 'Normal',
                    totalPrice: picked.reduce((n, x) => n + (x.price || 0), 0),
                    items: picked.map((x, i) => ({ id: `${id}-i${i}`, orderId: id, testId: x.id, testName: x.name, price: x.price, status: 'Pending' })),
                };
                DEMO_LAB_ORDERS.push(newOrder);
                /* Tahlil PULLIK — hisob qatori ham yaratiladi (server ham shunday
                   qiladi). Busiz kartadagi hisob va marshrutdagi kassa bekati
                   yangi yo'llanmani «ko'rmasdi». */
                if (newOrder.totalPrice) {
                    DEMO_CHARGES.push({
                        id: demoId('demo-charge'), clinicId: 'demo-clinic-1',
                        visitId: data.visitId || null, patientId: data.patientId || null,
                        patientName: data.patientName || '',
                        source: 'Lab', sourceId: id, name: picked.map(x => x.name).join(', '),
                        quantity: 1, unitPrice: newOrder.totalPrice, discount: 0, total: newOrder.totalPrice,
                        status: 'Unpaid', paidAmount: 0, paidAt: null,
                        createdAt: demoNow(), createdByName: 'Demo Admin',
                    });
                }
                saveDemoData();
                return demoDone(newOrder);
            }
            return fetchJson<any>('/lab-orders', {
                method: 'POST',
                body: JSON.stringify(data),
            });
        },
        update: (id: string, data: any) => {
            if (isDemoMode()) {
                const idx = DEMO_LAB_ORDERS.findIndex(o => o.id === id);
                if (idx !== -1) {
                    DEMO_LAB_ORDERS[idx] = { ...DEMO_LAB_ORDERS[idx], ...data };
                    saveDemoData();
                    return demoWrote(DEMO_LAB_ORDERS[idx]);
                }
                return Promise.reject('Order not found');
            }
            return fetchJson<any>(`/lab-orders/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        },
        delete: (id: string) => {
            if (isDemoMode()) {
                const idx = DEMO_LAB_ORDERS.findIndex(o => o.id === id);
                if (idx !== -1) {
                    DEMO_LAB_ORDERS.splice(idx, 1);
                    saveDemoData();
                }
                return demoWrote({ success: true });
            }
            return fetchJson<{ success: true }>(`/lab-orders/${id}`, {
                method: 'DELETE',
            });
        },
    },
    // Expose base URL for building direct URLs (e.g., TTS proxy)
    API_BASE_URL: API_URL.replace(/\/api$/, ''),
};
