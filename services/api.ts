import { Patient, Appointment, Transaction, Expense, Doctor, Receptionist, Clinic, SubscriptionPlan, Service, ServiceCategory, ICD10Code, PatientDiagnosis, InventoryItem, InventoryLog, Lead, LeadApiKeyInfo, InstallmentPlan, MessageTemplate, AutomationRule, MessageLog, MessageChannel, BulkSendStatus, TriggerDescriptor, AudienceSegment, AudiencePreview, SegmentFieldDescriptor, SavedSegment, CashRegisterDay, CashMovement, CashAuditLog , Visit, VisitCharge, StockMovement, ServiceRecipeLine, ServiceCost, InventoryAlerts, ChargeSummary, PendingPatient, Department, EncounterTemplate, EncounterField, LabTest, LabTestParameter, LabOrder, LabOrderItem, DiagnosticStudy, Ward, Admission, InpatientRound, MedicationOrder, Prescription, PrescriptionItem, InventoryBatch } from '../types';
import { todayISO } from '../utils/dateUtils';

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
import { DEMO_PATIENTS, DEMO_APPOINTMENTS, DEMO_TRANSACTIONS, DEMO_EXPENSES, DEMO_DOCTORS, DEMO_SERVICES, DEMO_CLINIC, DEMO_CLINICS, DEMO_PLAN, DEMO_INVENTORY, DEMO_INVENTORY_LOGS, DEMO_RECEPTIONISTS, DEMO_DIAGNOSES, DEMO_CATEGORIES, DEMO_LEADS, DEMO_INSTALLMENTS, DEMO_LAB_TECHNICIANS, DEMO_LAB_ORDERS, DEMO_MESSAGE_TEMPLATES, DEMO_AUTOMATION_RULES, DEMO_MESSAGE_LOGS, DEMO_TRIGGERS, DEMO_SEGMENT_FIELDS, saveDemoData } from './demoData';

// XClinic offline rejimda ishlaydi — hech qanday bulut manzili yo'q.
// Backend shu kompyuterda turadi; uch xil kirish usuli qo'llab-quvvatlanadi.
const getBaseUrl = () => {
    // 1) Electron: bundle file:// orqali ochiladi. 3001-port band bo'lsa main.ts
    //    bo'sh portni tanlab, uni ?port= query orqali uzatadi.
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        const port = new URLSearchParams(window.location.search).get('port') || '3001';
        return `http://localhost:${port}/api`;
    }
    // 2) Tarmoq orqali (shifokor/registrator brauzerdan http://192.168.x.x:3001)
    if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
        return `${window.location.protocol}//${window.location.host}/api`;
    }
    // 3) Dev: vite proxy 3001-portga yo'naltiradi
    const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;
};
export const API_URL = getBaseUrl();
export const API_BASE_URL = API_URL.replace(/\/api$/, '');

/** Saqlangan token — fayl manzilida ishlatiladi.
 *  `<img src>` tegi `Authorization` sarlavhasini yubora olmaydi, shuning uchun
 *  himoyalangan fayl manziliga token query orqali qo'shiladi. Serverda u
 *  sarlavhaga ko'chiriladi va oddiy tekshiruvdan o'tadi (backend/files.ts). */
const readStoredToken = (): string => {
    try {
        const raw = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
        if (!raw) return '';
        return JSON.parse(raw).token || '';
    } catch { return ''; }
};

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

console.log('🔌 XClinic API:', { hostname: window.location.hostname, API_URL });

export const isDemoMode = () => {
    try {
        const stored = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
        if (stored) {
            const parsed = JSON.parse(stored);
            return parsed.isDemo === true;
        }
    } catch (e) {
        return false;
    }
    return false;
};

/* ─── Demo rejim himoyasi ─────────────────────────────────────────────────────
   Demo hisobi (`demoklinikaadmin`) tokeni soxta — 'demo-token'. U bilan serverga
   borilsa 401 keladi, 401 esa sessiyani tozalab, foydalanuvchini login sahifasiga
   uloqtiradi. Shuning uchun demo rejimda yangi modullar serverga UMUMAN bormaydi:
   o'qish bo'sh ro'yxat qaytaradi, yozish esa tushunarli xato beradi.          */
/** O'QISH uchun: serverga bormaydi, bo'sh/neytral qiymat qaytaradi */
const demoRead = <T,>(value: T): Promise<T> => Promise.resolve(value);
/** YOZISH uchun: tushunarli xato beradi. O'qish amalida ISHLATMANG —
 *  aks holda oddiy ko'rish sahifasida "saqlab bo'lmaydi" degan mantiqsiz
 *  xabar chiqadi. */
const demoWrite = <T,>(): Promise<T> =>
    Promise.reject(new Error("Demo rejimda saqlab bo'lmaydi. Haqiqiy hisob bilan kiring."));
/** O'qish, lekin bo'sh qiymat ma'nosiz bo'lgan holat (bitta yozuvni ochish) */
const demoMissing = <T,>(what: string): Promise<T> =>
    Promise.reject(new Error(`Demo rejimda ${what} mavjud emas.`));

/** Demo rejimda ko'rsatiladigan bo'limlar — faqat menyu tirik ko'rinishi uchun */
const DEMO_DEPARTMENTS: Department[] = [
    { id: 'demo-ter', clinicId: 'demo-clinic-1', name: 'Terapiya', code: 'TER', type: 'CLINICAL', color: '#2563EB', sortOrder: 1, isActive: true },
    { id: 'demo-lab', clinicId: 'demo-clinic-1', name: 'Laboratoriya', code: 'LAB', type: 'LAB', color: '#0D9488', sortOrder: 2, isActive: true },
    { id: 'demo-diag', clinicId: 'demo-clinic-1', name: 'Diagnostika', code: 'DIAG', type: 'DIAGNOSTIC', color: '#4F46E5', sortOrder: 3, isActive: true },
];

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000; // 1 second

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES, backoff = INITIAL_BACKOFF): Promise<Response> {
    try {
        const response = await fetch(url, options);

        // Check if we should retry based on status
        // Retry on 5xx (Server Error), 408 (Timeout), 429 (Too Many Requests)
        // AND ONLY if it is a GET request (safe to retry)
        if (!response.ok && (response.status >= 500 || response.status === 408 || response.status === 429)) {
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

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
    };

    const storedAuth = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
    if (storedAuth) {
        try {
            const { token } = JSON.parse(storedAuth);
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        } catch (e) {
            // Ignore parse error
        }
    }

    const response = await fetchWithRetry(`${API_URL}${url}`, {
        ...options,
        headers,
    });

    // Backend tokenni yangilagan bo'lsa (muddati yaqinlashgan), uni jimgina saqlaymiz.
    // Foydalanuvchi faol ekan, sessiyasi hech qachon tugamaydi.
    const refreshedToken = response.headers.get('X-Refreshed-Token');
    if (refreshedToken) {
        try {
            // Sessiya qaysi omborda saqlangan bo'lsa, o'shanisini yangilaymiz
            const store = sessionStorage.getItem('xclinic_auth') ? sessionStorage : localStorage;
            const raw = store.getItem('xclinic_auth');
            if (raw) {
                const parsed = JSON.parse(raw);
                parsed.token = refreshedToken;
                store.setItem('xclinic_auth', JSON.stringify(parsed));
            }
        } catch (e) {
            // Saqlab bo'lmasa ham muammo yo'q — eski token muddati tugaguncha ishlaydi
        }
    }

    // 401 — token yo'q/yaroqsiz. 403 esa ikki xil bo'lishi mumkin: rol yetarli emas
    // (sessiya joyida) yoki eski backend token uchun 403 qaytargan. Ikkinchisida ham
    // sessiyani tugatish kerak, aks holda "Qayta yuklash" o'lik token bilan aylanaveradi.
    let isSessionExpired = response.status === 401;
    if (response.status === 403) {
        const data = await response.clone().json().catch(() => ({} as any));
        isSessionExpired = typeof data?.error === 'string' && data.error.includes('Token yaroqsiz');
    }

    if (isSessionExpired) {
        localStorage.removeItem('xclinic_auth');
        sessionStorage.removeItem('xclinic_auth');
        window.dispatchEvent(new Event('auth:unauthorized'));
        // We throw an error to stop execution, but the event listener in App.tsx will handle the redirect/UI update
        throw new Error('Session expired');
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API request failed: ${response.statusText}`);
    }
    return response.json();
}

export const api = {
    auth: {
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
        getAllForClinic: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_PATIENTS);
            return fetchJson<Patient[]>(`/patients?clinicId=${clinicId}&scope=clinic`);
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
                const newPatient = { ...data, id: `demo-patient-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Patient;
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
                    DEMO_PATIENTS[index] = { ...DEMO_PATIENTS[index], ...data };
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
        uploadAvatar: (id: string, file: File) => {
            const formData = new FormData();
            formData.append('photo', file);
            return fetchJson<{ success: true, url: string }>(`/patients/${id}/avatar`, {
                method: 'POST',
                body: formData,
            });
        },
        uploadPortrait: (id: string, file: File) => {
            const formData = new FormData();
            formData.append('photo', file);
            return fetchJson<{ success: true, url: string }>(`/patients/${id}/portrait`, {
                method: 'POST',
                body: formData,
            });
        },
        lookupPinfl: (pinfl: string) => {
            if (isDemoMode()) {
                // Mock DMED response for demo testing
                return Promise.resolve({
                    firstName: 'Eldor',
                    lastName: 'Abduqodirov',
                    dob: '1990-05-15',
                    gender: 'Male',
                    pinfl: pinfl,
                    address: 'Toshkent sh., Yunusobod tumani'
                });
            }
            return fetchJson<any>(`/patients/lookup/${pinfl}`);
        },
    },
    appointments: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_APPOINTMENTS);
            return fetchJson<Appointment[]>(`/appointments?clinicId=${clinicId}`);
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
    installments: {
        getAll: (clinicId?: string, patientId?: string) => {
            if (isDemoMode()) {
                 let results = [...DEMO_INSTALLMENTS];
                 if (patientId) results = results.filter(p => p.patientId === patientId);
                 if (clinicId) results = results.filter(p => p.clinicId === clinicId);
                 return Promise.resolve(results);
            }
            const query = new URLSearchParams();
            if (clinicId) query.append('clinicId', clinicId);
            if (patientId) query.append('patientId', patientId);
            return fetchJson<any[]>(`/installments?${query.toString()}`);
        },
        create: (data: any) => {
            if (isDemoMode()) {
                const newPlan = { 
                    ...data, 
                    id: `demo-ins-${Date.now()}`,
                    totalPaid: parseFloat(data.totalPaid || 0),
                    items: data.items.map((it: any, i: number) => ({ ...it, id: `demo-item-${Date.now()}-${i}` }))
                };
                DEMO_INSTALLMENTS.push(newPlan);
                saveDemoData();
                return Promise.resolve(newPlan);
            }
            return fetchJson<any>('/installments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        },
        pay: (itemId: string, date: string, paymentMethod: string) => {
            if (isDemoMode()) {
                let foundItem: any = null;
                let foundPlan: any = null;
                DEMO_INSTALLMENTS.forEach(p => {
                    const item = p.items?.find(it => it.id === itemId);
                    if (item) {
                        foundItem = item;
                        foundPlan = p;
                    }
                });
                
                if (foundItem && foundPlan) {
                    foundItem.status = 'Paid';
                    foundItem.paidDate = date;
                    foundPlan.totalPaid += foundItem.amount;
                    if (foundPlan.items.every((it: any) => it.status === 'Paid')) {
                        foundPlan.status = 'Completed';
                    }
                    
                    const patient = DEMO_PATIENTS.find(p => p.id === foundPlan.patientId);
                    const doctor = DEMO_DOCTORS.find(d => d.id === foundPlan.doctorId);

                    const newTx: Transaction = {
                        id: `demo-tx-${Date.now()}`,
                        patientId: foundPlan.patientId,
                        patientName: patient ? `${patient.lastName} ${patient.firstName}` : 'Bemor',
                        clinicId: foundPlan.clinicId,
                        doctorId: foundPlan.doctorId,
                        doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : '',
                        amount: foundItem.amount,
                        date: date,
                        service: `Bo'lib to'lash (${foundPlan.service})`,
                        type: paymentMethod as any,
                        status: 'Paid'
                    };
                    DEMO_TRANSACTIONS.push(newTx);
                    saveDemoData();
                    return Promise.resolve({ success: true, item: foundItem, transaction: newTx });
                }
                return Promise.reject("Item not found");
            }
            return fetchJson<any>(`/installments/${itemId}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, paymentMethod })
            });
        },
        delete: (id: string) => {
             if (isDemoMode()) {
                 const idx = DEMO_INSTALLMENTS.findIndex(p => p.id === id);
                 if (idx !== -1) {
                     DEMO_INSTALLMENTS.splice(idx, 1);
                     saveDemoData();
                 }
                 return Promise.resolve({ success: true });
             }
             return fetchJson<{ success: true }>(`/installments/${id}`, { method: 'DELETE' });
        }
    },
    transactions: {
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_TRANSACTIONS);
            return fetchJson<Transaction[]>(`/transactions?clinicId=${clinicId}`);
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
            console.log('Transaction update URL:', url, 'Data:', data);
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
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve(DEMO_SERVICES);
            return fetchJson<Service[]>(`/services?clinicId=${clinicId}`);
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
    plans: {
        getAll: () => {
            if (isDemoMode()) return Promise.resolve([DEMO_PLAN]);
            return fetchJson<SubscriptionPlan[]>('/plans');
        },
        update: (id: string, data: Partial<SubscriptionPlan>) => fetchJson<SubscriptionPlan>(`/plans/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    },
    sales: {
        getAll: () => {
            if (isDemoMode()) return Promise.resolve([]);
            return fetchJson<any[]>('/superadmin/sales');
        },
        create: (data: any) => {
            if (isDemoMode()) return Promise.resolve({ success: true, agent: { id: 'demo-agent-1', ...data } });
            return fetchJson<{ success: boolean; agent: any }>('/superadmin/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        myClinics: () => {
            if (isDemoMode()) return Promise.resolve([]);
            return fetchJson<any[]>('/sales/clinics');
        },
    },
    demoRequests: {
        getAll: () => {
            if (isDemoMode()) return Promise.resolve([]);
            return fetchJson<any[]>('/admin/demo-requests');
        },
        update: (id: string, data: { status?: string; notes?: string }) =>
            fetchJson<any>(`/admin/demo-requests/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            }),
        remove: (id: string) =>
            fetchJson<any>(`/admin/demo-requests/${id}`, { method: 'DELETE' }),
    },
    // Platforma (SuperAdmin) uchun tashqi lid manbasi kaliti (yuboraman.uz va h.k.).
    // Bu kalit bilan kelgan lidlar klinikaga emas, DemoRequest ro'yxatiga tushadi.
    adminLeads: {
        getApiKey: () => {
            if (isDemoMode()) {
                return Promise.resolve({ apiKey: null, createdAt: null, endpoint: 'http://localhost:3001/api/public/leads' } as LeadApiKeyInfo);
            }
            return fetchJson<LeadApiKeyInfo>('/admin/lead-api-key');
        },
        generateApiKey: () => {
            if (isDemoMode()) {
                return Promise.resolve({ apiKey: `dk_plat_demo${Date.now()}`, createdAt: new Date().toISOString(), endpoint: 'http://localhost:3001/api/public/leads' } as LeadApiKeyInfo);
            }
            return fetchJson<LeadApiKeyInfo>('/admin/lead-api-key', { method: 'POST' });
        },
        revokeApiKey: () => {
            if (isDemoMode()) return Promise.resolve({ success: true as const });
            return fetchJson<{ success: true }>('/admin/lead-api-key', { method: 'DELETE' });
        },
    },
    // Platforma (SuperAdmin) Facebook integratsiyasi — lidlar DemoRequest'ga tushadi
    adminFacebook: {
        status: () =>
            fetchJson<{ connected: boolean; pageName: string | null; hasUserToken: boolean }>('/admin/facebook/status'),
        getAuthUrl: () =>
            fetchJson<{ url: string }>('/admin/facebook/auth-url'),
        getPages: () =>
            fetchJson<any[]>('/admin/facebook/pages'),
        selectPage: (data: { pageId: string; pageAccessToken: string; pageName: string }) =>
            fetchJson<{ success: true }>('/admin/facebook/select-page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            }),
        disconnect: () =>
            fetchJson<{ success: true }>('/admin/facebook/disconnect', { method: 'POST' }),
    },
    diagnoses: {
        searchCodes: (query: string) => fetchJson<ICD10Code[]>(`/icd10?query=${query}`),
        add: (data: Omit<PatientDiagnosis, 'id' | 'icd10'>) => fetchJson<PatientDiagnosis>('/diagnoses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
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
            if (isDemoMode()) return demoRead<Visit[]>([]);
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<Visit[]>(`/visits${qs ? `?${qs}` : ''}`);
        },
        getById: (id: string) =>
            isDemoMode() ? demoMissing<Visit>('qabullar') : fetchJson<Visit>(`/visits/${id}`),
        create: (data: Partial<Visit>) =>
            isDemoMode() ? demoWrite<Visit>() : fetchJson<Visit>('/visits', { method: 'POST', body: JSON.stringify(data) }),
        // Qabulga xizmat qo'shish — narx shu orqali kassaga tushadi
        addProcedure: (visitId: string, data: { serviceId?: number; procedureName?: string; price?: number; discount?: number; notes?: string; doctorId?: string; doctorName?: string }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>(`/visits/${visitId}/procedures`, { method: 'POST', body: JSON.stringify(data) }),
        removeProcedure: (procedureId: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/visit-procedures/${procedureId}`, { method: 'DELETE' }),
        update: (id: string, data: Partial<Visit>) =>
            isDemoMode() ? demoWrite<Visit>() : fetchJson<Visit>(`/visits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/visits/${id}`, { method: 'DELETE' }),
        // Navbatni chaqirish — tablo shu holatni ko'rsatadi
        call: (id: string) =>
            isDemoMode() ? demoWrite<Visit>() : fetchJson<Visit>(`/visits/${id}/call`, { method: 'POST' }),
    },

    // ─── Ombor: harakatlar, retsept, ogohlantirishlar ───────────────────────
    stock: {
        movements: (params?: { itemId?: string; visitId?: string; from?: string; to?: string }) => {
            if (isDemoMode()) return demoRead<StockMovement[]>([]);
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<StockMovement[]>(`/stock-movements${qs ? `?${qs}` : ''}`);
        },
        receive: (data: { itemId: string; quantity: number; cost?: number; batchNumber?: string; expiryDate?: string; note?: string; userName?: string }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>('/stock-movements/in', { method: 'POST', body: JSON.stringify(data) }),
        issue: (data: { itemId: string; quantity: number; reason?: string; note?: string; userName?: string }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>('/stock-movements/out', { method: 'POST', body: JSON.stringify(data) }),
        /** Bo'limlar orasida ko'chirish. Umumiy qoldiq O'ZGARMAYDI — tovar
         *  klinika ichida qoladi, faqat 'Transfer' qatori yoziladi. */
        transfer: (data: { itemId: string; quantity: number; fromDepartmentId?: string; toDepartmentId: string; note?: string; userName?: string }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>('/stock-movements/transfer', { method: 'POST', body: JSON.stringify(data) }),
        // Inventarizatsiya — haqiqiy qoldiqqa tenglashtirish
        adjust: (data: { itemId: string; actualQuantity: number; note?: string; userName?: string }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>('/stock-movements/adjust', { method: 'POST', body: JSON.stringify(data) }),
        // Mahsulot xossalari (narx, sarflanadigan bayrog'i). Miqdor bu yerda o'zgarmaydi.
        updateItem: (id: string, data: { name?: string; unit?: string; minQuantity?: number; price?: number; isMedication?: boolean; isConsumable?: boolean; departmentId?: string | null }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>(`/inventory-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        alerts: (days = 60) =>
            isDemoMode() ? demoRead<InventoryAlerts>({ expiring: [], lowStock: [] })
                : fetchJson<InventoryAlerts>(`/inventory-alerts?days=${days}`),
    },
    recipes: {
        get: (serviceId?: number) =>
            isDemoMode() ? demoRead<ServiceRecipeLine[]>([])
                : fetchJson<ServiceRecipeLine[]>(`/service-recipes${serviceId ? `?serviceId=${serviceId}` : ''}`),
        save: (serviceId: number, lines: { itemId: string; quantity: number; note?: string }[]) =>
            isDemoMode() ? demoWrite<ServiceRecipeLine[]>()
                : fetchJson<ServiceRecipeLine[]>(`/service-recipes/${serviceId}`, { method: 'PUT', body: JSON.stringify({ lines }) }),
        cost: (serviceId: number) =>
            isDemoMode()
                ? demoRead<ServiceCost>({ serviceId, price: 0, cost: 0, margin: 0, marginPercent: 0, lines: 0 })
                : fetchJson<ServiceCost>(`/service-recipes/${serviceId}/cost`),
    },

    /* ─── Klinik kontur: bemor tarixi, allergiya, natija belgisi ────────────
       `summary` — shifokorning ish stolidagi "avval nima bo'lgan" paneli.
       Bitta so'rov: allergiya, surunkali, oldingi qabullar, tahlillar, dorilar. */
    clinical: {
        summary: (patientId: string) => fetchJson<any>(`/patients/${patientId}/summary`),
        allergies: (patientId: string) => fetchJson<any[]>(`/patients/${patientId}/allergies`),
        addAllergy: (patientId: string, data: { substance: string; reaction?: string; severity?: string }) =>
            fetchJson<any>(`/patients/${patientId}/allergies`, { method: 'POST', body: JSON.stringify(data) }),
        removeAllergy: (patientId: string, allergyId: string) =>
            fetchJson<{ success: true }>(`/patients/${patientId}/allergies/${allergyId}`, { method: 'DELETE' }),
        markLabSeen: (orderId: string) =>
            fetchJson<{ success: true }>(`/lab-orders/${orderId}/seen`, { method: 'POST' }),
        markStudySeen: (studyId: string) =>
            fetchJson<{ success: true }>(`/studies/${studyId}/seen`, { method: 'POST' }),
        /** Natijasi tayyor, lekin ko'rilmagan qabullar — SANA bilan cheklanmagan */
        pendingResults: () => fetchJson<any[]>('/visits/pending-results'),
        lockVisit: (visitId: string, disposition?: string) =>
            fetchJson<any>(`/visits/${visitId}/lock`, { method: 'POST', body: JSON.stringify({ disposition }) }),
    },

    // ─── Pul: hisob qatorlari va kassa ──────────────────────────────────────
    charges: {
        getAll: (params?: { status?: string; patientId?: string; visitId?: string; date?: string }) => {
            if (isDemoMode()) return demoRead<VisitCharge[]>([]);
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<VisitCharge[]>(`/charges${qs ? `?${qs}` : ''}`);
        },
        // Kassa ekrani: bemor bo'yicha guruhlangan qarz
        pending: () => isDemoMode() ? demoRead<PendingPatient[]>([]) : fetchJson<PendingPatient[]>('/charges/pending'),
        byVisit: (visitId: string) =>
            isDemoMode()
                ? demoRead<{ charges: VisitCharge[]; summary: ChargeSummary }>({ charges: [], summary: { total: 0, paid: 0, due: 0, unpaidCount: 0 } })
                : fetchJson<{ charges: VisitCharge[]; summary: ChargeSummary }>(`/visits/${visitId}/charges`),
        create: (data: Partial<VisitCharge>) =>
            isDemoMode() ? demoWrite<VisitCharge>() : fetchJson<VisitCharge>('/charges', { method: 'POST', body: JSON.stringify(data) }),
        cancel: (id: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/charges/${id}`, { method: 'DELETE' }),
    },
    payments: {
        /** `perCharge` — qaysi qatorga qancha (tanlab to'lash).
         *  `payments` — bir to'lovni naqd + karta deb bo'lish.
         *  Ikkisi ham ixtiyoriy: berilmasa eski xatti-harakat. */
        pay: (data: {
            chargeIds: string[]; amount?: number; method?: string;
            receivedByName?: string; doctorId?: string; doctorName?: string;
            perCharge?: Record<string, number>;
            payments?: { method: string; amount: number }[];
        }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>('/payments', { method: 'POST', body: JSON.stringify(data) }),
        /** Qator bo'yicha qaytarish — faqat klinika admini */
        refund: (chargeId: string, data: { amount?: number; method?: string; reason?: string }) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>(`/charges/${chargeId}/refund`, { method: 'POST', body: JSON.stringify(data) }),
        /** Qatorga chegirma — admin va registrator */
        discount: (chargeId: string, discount: number) =>
            isDemoMode() ? demoWrite<any>() : fetchJson<any>(`/charges/${chargeId}/discount`, { method: 'PUT', body: JSON.stringify({ discount }) }),
    },

    cashShift: {
        /** Kutilayotgan naqd — SERVER hisobi, tahrirlanmaydi */
        expected: (date: string) => fetchJson<{
            date: string; openingCash: number; expectedCash: number;
            expectedCard: number; expectedClick: number; sources: Record<string, any>;
        }>(`/cash-register/expected?date=${date}`),
        open: (data: { date: string; shift?: number; openingCash?: number }) =>
            fetchJson<any>('/cash-register/open', { method: 'POST', body: JSON.stringify(data) }),
    },

    // ─── Moliyaviy hisobot ──────────────────────────────────────────────────
    // ─── Ekspluatatsiya: sxema versiyasi va zaxira nusxa ────────────────────
    // Faqat klinika administratori uchun — backend ham shu rolni talab qiladi.
    maintenance: {
        schemaStatus: () => fetchJson<{
            current: string | null;
            baseline: boolean;
            appliedCount: number;
            applied: { version: string; appliedAt: string; durationMs: number | null; note: string | null }[];
            pending: string[];
            pendingCount: number;
        }>('/admin/schema-status'),

        backups: () => fetchJson<{
            file: string; sizeBytes: number; createdAt: string;
            hasUploads: boolean; note: string | null;
        }[]>('/admin/backups'),

        createBackup: (note?: string) => fetchJson<{
            file: string; sizeBytes: number; createdAt: string;
            uploadsCount: number; durationMs: number;
        }>('/admin/backup', { method: 'POST', body: JSON.stringify({ note: note || '' }) }),

        // Tiklash DARHOL bajarilmaydi: server bazani ochiq tutadi. Bu chaqiruv
        // faqat belgi qo'yadi, almashtirish dastur qayta ishga tushganda bo'ladi.
        stageRestore: (file: string) => fetchJson<{ staged: true; restartRequired: true; file: string }>(
            '/admin/backup/restore', { method: 'POST', body: JSON.stringify({ file, confirm: true }) }),

        restoreState: () => fetchJson<{
            staged: boolean; file?: string; stagedAt?: string; byName?: string | null;
        }>('/admin/backup/restore'),

        cancelRestore: () => fetchJson<{ success: true }>('/admin/backup/restore', { method: 'DELETE' }),
    },

    reports: {
        // Bo'lim, manba va tannarx kesimida — server tomonda hisoblanadi
        summary: (from?: string, to?: string) => {
            // Demo rejimda hisobot bo'sh ko'rinadi — xato emas
            if (isDemoMode()) return demoRead<any>({
                period: { from: from || '', to: to || '' },
                totals: {
                    revenue: 0, collected: 0, due: 0, materialCost: 0, grossProfit: 0,
                    doctorShare: 0, otherExpenses: 0, netProfit: 0, legacyLabExpense: 0,
                },
                byDepartment: [], bySource: [], byDoctor: [],
                expenseByCategory: [], daily: [],
            });
            const q = new URLSearchParams();
            if (from) q.set('from', from);
            if (to) q.set('to', to);
            const qs = q.toString();
            return fetchJson<any>(`/reports/summary${qs ? `?${qs}` : ''}`);
        },
        debtors: () => isDemoMode() ? demoRead<any>({ total: 0, patients: [] }) : fetchJson<any>('/reports/debtors'),
    },

    // ─── Bo'limlar ──────────────────────────────────────────────────────────
    departments: {
        getAll: () => isDemoMode() ? demoRead<Department[]>(DEMO_DEPARTMENTS) : fetchJson<Department[]>('/departments'),
        create: (data: Partial<Department>) =>
            isDemoMode() ? demoWrite<Department>() : fetchJson<Department>('/departments', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: Partial<Department>) =>
            isDemoMode() ? demoWrite<Department>() : fetchJson<Department>(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        // Bo'lim o'chirilmaydi — faolsizlantiriladi, chunki eski qabullar unga bog'langan
        deactivate: (id: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/departments/${id}`, { method: 'DELETE' }),
    },

    // ─── Qabul bayoni shablonlari ───────────────────────────────────────────
    encounterTemplates: {
        getAll: (departmentId?: string) =>
            isDemoMode() ? demoRead<EncounterTemplate[]>([])
                : fetchJson<EncounterTemplate[]>(`/encounter-templates${departmentId ? `?departmentId=${departmentId}` : ''}`),
        create: (data: { departmentId: string; name: string; fields: EncounterField[]; isDefault?: boolean }) =>
            isDemoMode() ? demoWrite<EncounterTemplate>() : fetchJson<EncounterTemplate>('/encounter-templates', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: { name?: string; fields?: EncounterField[]; isDefault?: boolean }) =>
            isDemoMode() ? demoWrite<EncounterTemplate>() : fetchJson<EncounterTemplate>(`/encounter-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/encounter-templates/${id}`, { method: 'DELETE' }),
    },

    // ─── Laboratoriya: katalog ──────────────────────────────────────────────
    labTests: {
        getAll: () => isDemoMode() ? demoRead<LabTest[]>([]) : fetchJson<LabTest[]>('/lab-tests'),
        create: (data: Partial<LabTest> & { parameters?: Partial<LabTestParameter>[] }) =>
            isDemoMode() ? demoWrite<LabTest>() : fetchJson<LabTest>('/lab-tests', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: Partial<LabTest> & { parameters?: Partial<LabTestParameter>[] }) =>
            isDemoMode() ? demoWrite<LabTest>() : fetchJson<LabTest>(`/lab-tests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: string) =>
            isDemoMode() ? demoWrite<{ success: true; deactivated?: boolean }>()
                : fetchJson<{ success: true; deactivated?: boolean }>(`/lab-tests/${id}`, { method: 'DELETE' }),
    },

    // ─── Laboratoriya: natijalar ────────────────────────────────────────────
    labResults: {
        // Normalar bemorning jinsi/yoshiga moslab serverda tanlanadi
        get: (orderId: string) =>
            isDemoMode()
                ? demoRead<any>({ id: orderId, items: [], patientAge: null, patientSex: null })
                : fetchJson<LabOrder & { items: LabOrderItem[]; patientAge: number | null; patientSex: string | null }>(
                    `/lab-orders/${orderId}/results`),
        save: (orderId: string, results: { orderItemId: string; parameterId: string; value: string; note?: string }[], enteredBy?: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/lab-orders/${orderId}/results`, {
                method: 'POST',
                body: JSON.stringify({ results, enteredBy }),
            }),
    },

    // ─── Diagnostika ────────────────────────────────────────────────────────
    studies: {
        getAll: (params?: { patientId?: string; status?: string }) => {
            if (isDemoMode()) return demoRead<DiagnosticStudy[]>([]);
            const q = new URLSearchParams();
            if (params?.patientId) q.set('patientId', params.patientId);
            if (params?.status) q.set('status', params.status);
            const qs = q.toString();
            return fetchJson<DiagnosticStudy[]>(`/studies${qs ? `?${qs}` : ''}`);
        },
        create: (data: Partial<DiagnosticStudy>) =>
            isDemoMode() ? demoWrite<DiagnosticStudy>() : fetchJson<DiagnosticStudy>('/studies', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: Partial<DiagnosticStudy>) =>
            isDemoMode() ? demoWrite<DiagnosticStudy>() : fetchJson<DiagnosticStudy>(`/studies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/studies/${id}`, { method: 'DELETE' }),
    },

    // ─── Statsionar ─────────────────────────────────────────────────────────
    wards: {
        getAll: () => isDemoMode() ? demoRead<Ward[]>([]) : fetchJson<Ward[]>('/wards'),
        create: (data: Partial<Ward> & { bedCount?: number }) =>
            isDemoMode() ? demoWrite<Ward>() : fetchJson<Ward>('/wards', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: Partial<Ward>) =>
            isDemoMode() ? demoWrite<Ward>() : fetchJson<Ward>(`/wards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    },
    admissions: {
        getAll: (params?: { status?: string; patientId?: string }) => {
            if (isDemoMode()) return demoRead<Admission[]>([]);
            const q = new URLSearchParams();
            if (params?.status) q.set('status', params.status);
            if (params?.patientId) q.set('patientId', params.patientId);
            const qs = q.toString();
            return fetchJson<Admission[]>(`/admissions${qs ? `?${qs}` : ''}`);
        },
        create: (data: Partial<Admission>) =>
            isDemoMode() ? demoWrite<Admission>() : fetchJson<Admission>('/admissions', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: Partial<Admission>) =>
            isDemoMode() ? demoWrite<Admission>() : fetchJson<Admission>(`/admissions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        discharge: (id: string, dischargeSummary?: string) =>
            isDemoMode() ? demoWrite<Admission>() : fetchJson<Admission>(`/admissions/${id}/discharge`, {
                method: 'POST', body: JSON.stringify({ dischargeSummary }),
            }),
        addRound: (id: string, data: Omit<Partial<InpatientRound>, 'vitalSigns'> & { vitalSigns?: any }) =>
            isDemoMode() ? demoWrite<InpatientRound>() : fetchJson<InpatientRound>(`/admissions/${id}/rounds`, { method: 'POST', body: JSON.stringify(data) }),
        addMedication: (id: string, data: Partial<MedicationOrder>) =>
            isDemoMode() ? demoWrite<MedicationOrder>() : fetchJson<MedicationOrder>(`/admissions/${id}/medications`, { method: 'POST', body: JSON.stringify(data) }),
    },

    // ─── Retsept ────────────────────────────────────────────────────────────
    prescriptions: {
        getAll: (patientId?: string) =>
            isDemoMode() ? demoRead<Prescription[]>([])
                : fetchJson<Prescription[]>(`/prescriptions${patientId ? `?patientId=${patientId}` : ''}`),
        create: (data: Partial<Prescription> & { items: Partial<PrescriptionItem>[] }) =>
            isDemoMode() ? demoWrite<Prescription>() : fetchJson<Prescription>('/prescriptions', { method: 'POST', body: JSON.stringify(data) }),
        delete: (id: string) =>
            isDemoMode() ? demoWrite<{ success: true }>() : fetchJson<{ success: true }>(`/prescriptions/${id}`, { method: 'DELETE' }),
    },

    // ─── Ombor: partiya va muddat ───────────────────────────────────────────
    batches: {
        getAll: (itemId: string) =>
            isDemoMode() ? demoRead<InventoryBatch[]>([]) : fetchJson<InventoryBatch[]>(`/inventory/${itemId}/batches`),
        create: (itemId: string, data: Partial<InventoryBatch>) =>
            isDemoMode() ? demoWrite<InventoryBatch>() : fetchJson<InventoryBatch>(`/inventory/${itemId}/batches`, { method: 'POST', body: JSON.stringify(data) }),
        // Muddati o'tgan/yaqinlashgan partiyalar — Ombor sahifasidagi ogohlantirish
        expiring: (days = 60) =>
            isDemoMode() ? demoRead<InventoryBatch[]>([]) : fetchJson<InventoryBatch[]>(`/inventory-expiring?days=${days}`),
    },
    batch: {
        remindAppointments: (clinicId: string, message?: string) => {
            if (isDemoMode()) return Promise.resolve({ success: true as const, message: 'Demo rejim: xabarlar yuborilmadi' });
            return fetchJson<{ success: true; message: string }>('/batch/remind-appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, message }),
            });
        },
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
        sendBulk: (clinicId: string, patientIds: string[], message: string, channel: MessageChannel, ignoreCooldown = false) => {
            if (isDemoMode()) {
                return Promise.resolve({ total: patientIds.length, queued: true });
            }
            return fetchJson<{ total: number; queued: boolean }>('/messages/send-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, patientIds, message, channel, ignoreCooldown }),
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
        getSettings: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve({ cooldownDays: 0 });
            return fetchJson<{ cooldownDays: number }>(`/messages/settings?clinicId=${clinicId}`);
        },
        saveSettings: (clinicId: string, cooldownDays: number) => {
            if (isDemoMode()) return Promise.resolve({ cooldownDays });
            return fetchJson<{ cooldownDays: number }>('/messages/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, cooldownDays }),
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
                const n = DEMO_PATIENTS.length;
                const preview: AudiencePreview = {
                    total: n,
                    matched: n,
                    unreachable: 0,
                    unreachableList: [],
                    clinicTotal: n,
                    conditionCounts: (segment.conditions || []).map(() => n),
                    conditions: segment.conditions || [],
                    recipients: DEMO_PATIENTS.map(p => ({
                        id: p.id, firstName: p.firstName, lastName: p.lastName,
                        phone: p.phone, channel: 'telegram' as const, debt: 0,
                    })),
                    recipientsTruncated: false,
                    viaTelegram: n,
                    viaSms: 0,
                    description: 'Demo',
                    patientIds: DEMO_PATIENTS.map(p => p.id),
                    sample: DEMO_PATIENTS.slice(0, 3).map(p => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, debt: 0 })),
                };
                return Promise.resolve(preview);
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
        updateStock: (id: string, data: { change: number; type: 'IN' | 'OUT'; note?: string; userName: string; patientId?: string; cost?: number }) => {
            if (isDemoMode()) {
                const index = DEMO_INVENTORY.findIndex(i => i.id === id);
                if (index !== -1) {
                    const item = DEMO_INVENTORY[index];
                    const changeAmount = data.type === 'IN' ? data.change : -data.change;
                    item.quantity += changeAmount;
                    item.updatedAt = new Date().toISOString();

                    // Create log
                    const log: InventoryLog = {
                        id: `demo-log-${Date.now()}`,
                        itemId: id,
                        change: data.change,
                        type: data.type,
                        note: data.note || '',
                        date: new Date().toISOString(),
                        userName: data.userName,
                        patientId: data.patientId
                    };
                    DEMO_INVENTORY_LOGS.push(log);
                    if (data.type === 'IN' && data.cost && data.cost > 0) {
                        DEMO_EXPENSES.push({
                            id: `demo-exp-${Date.now()}`,
                            date: todayISO(),
                            amount: data.cost,
                            category: 'Inventory',
                            title: `Ombor: ${item.name}`,
                            note: data.note || null,
                            clinicId: item.clinicId,
                            inventoryItemId: item.id,
                        });
                    }
                    saveDemoData();
                    return Promise.resolve(item);
                }
                return Promise.reject('Item not found');
            }
            return fetchJson<InventoryItem>(`/inventory/${id}/stock`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
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
        deleteLog: (logId: string) => {
            if (isDemoMode()) {
                const index = DEMO_INVENTORY_LOGS.findIndex(l => l.id === logId);
                if (index !== -1) {
                    const log = DEMO_INVENTORY_LOGS[index];
                    // Restore inventory quantity
                    const itemIndex = DEMO_INVENTORY.findIndex(i => i.id === log.itemId);
                    if (itemIndex !== -1) {
                        DEMO_INVENTORY[itemIndex].quantity += log.change; // change is negative for OUT, so adding restores
                    }
                    DEMO_INVENTORY_LOGS.splice(index, 1);
                    saveDemoData();
                }
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/inventory/logs/${logId}`, {
                method: 'DELETE',
            });
        },
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
                    endpoint: 'http://localhost:3001/api/public/leads'
                } as LeadApiKeyInfo);
            }
            return fetchJson<LeadApiKeyInfo>(`/leads/api-key?clinicId=${clinicId}`);
        },
        generateApiKey: (clinicId: string) => {
            if (isDemoMode()) {
                return Promise.resolve({
                    apiKey: `dk_live_demo${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    endpoint: 'http://localhost:3001/api/public/leads'
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
    facebook: {
        checkConfig: () => {
            return fetchJson<{ isConfigured: boolean, appId: string | null, redirectUri: string }>('/facebook/config-check');
        },
        saveConfig: (data: { appId: string, appSecret: string }) => {
            return fetchJson<{ success: true }>('/facebook/save-config', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },
        getAuthUrl: (clinicId: string) => {
            return fetchJson<{ url: string }>(`/facebook/auth-url?clinicId=${clinicId}`);
        },
        getPages: (clinicId: string) => {
            if (isDemoMode()) {
                return Promise.resolve([
                    { id: '1', name: 'Biznes Sahifa (Test)', access_token: 'dummy_token' },
                    { id: '2', name: 'Klinika Sahifasi (Test)', access_token: 'dummy_token_2' }
                ]);
            }
            return fetchJson<any[]>(`/facebook/pages?clinicId=${clinicId}`);
        },
        selectPage: (data: { clinicId: string, pageId: string, pageAccessToken: string, pageName: string }) => {
            if (isDemoMode()) {
                DEMO_CLINIC.facebookPageId = data.pageId;
                DEMO_CLINIC.facebookPageName = data.pageName;
                DEMO_CLINIC.facebookPageAccessToken = data.pageAccessToken;
                saveDemoData();
                return Promise.resolve({ success: true as const });
            }
            return fetchJson<{ success: true }>('/facebook/select-page', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },
        disconnect: (clinicId: string) => {
            if (isDemoMode()) {
                DEMO_CLINIC.facebookPageId = null as any;
                DEMO_CLINIC.facebookPageName = null as any;
                DEMO_CLINIC.facebookPageAccessToken = null as any;
                saveDemoData();
                return Promise.resolve({ success: true as const });
            }
            return fetchJson<{ success: true }>('/facebook/disconnect', {
                method: 'POST',
                body: JSON.stringify({ clinicId })
            });
        }
    },
    /* Yo'llanma — raqami va holati bor hujjat (reliz 4).
       `payload` da xizmatlar va summa BERILGAN paytdagi holatda saqlanadi:
       bemor qo'lidagi qog'oz bilan tizim bir xil bo'lishi kerak. */
    referrals: {
        getAll: (params?: { patientId?: string; status?: string; visitId?: string }) => {
            const q = new URLSearchParams();
            Object.entries(params || {}).forEach(([k, v]) => { if (v) q.set(k, String(v)); });
            const qs = q.toString();
            return fetchJson<any[]>(`/referrals${qs ? `?${qs}` : ''}`);
        },
        /** Bosma varaq uchun: klinika shapkasi va yoyilgan payload bilan */
        get: (id: string) => fetchJson<any>(`/referrals/${id}`),
        create: (data: {
            patientId: string; visitId?: string | null;
            kind: 'Lab' | 'Study' | 'Consult' | 'Cashier';
            targetDepartmentId?: string | null;
            items?: { name: string; price: number; quantity?: number }[];
        }) => fetchJson<any>('/referrals', { method: 'POST', body: JSON.stringify(data) }),
        use: (id: string) => fetchJson<any>(`/referrals/${id}/use`, { method: 'POST' }),
        cancel: (id: string) => fetchJson<any>(`/referrals/${id}/cancel`, { method: 'POST' }),
    },

    /* Hamshiralar (reliz 4, qaror В17). Boshqarish faqat klinika egasida —
       server ham shu rolni talab qiladi. */
    nurses: {
        getAll: () => fetchJson<any[]>('/nurses'),
        create: (data: { firstName: string; lastName: string; phone?: string; departmentId?: string | null; username?: string; password?: string }) =>
            fetchJson<any>('/nurses', { method: 'POST', body: JSON.stringify(data) }),
        update: (id: string, data: Record<string, any>) =>
            fetchJson<any>(`/nurses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        remove: (id: string) =>
            fetchJson<any>(`/nurses/${id}`, { method: 'DELETE' }),
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
        getAll: (clinicId: string) => {
            if (isDemoMode()) return Promise.resolve([...DEMO_LAB_ORDERS]);
            return fetchJson<any[]>(`/lab-orders?clinicId=${clinicId}`);
        },
        create: (data: any) => {
            if (isDemoMode()) {
                const newOrder = { 
                    ...data, 
                    id: `demo-order-${Date.now()}`, 
                    orderedAt: new Date().toISOString(), 
                    status: 'Pending' 
                };
                DEMO_LAB_ORDERS.push(newOrder);
                saveDemoData();
                return Promise.resolve(newOrder);
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
                    return Promise.resolve(DEMO_LAB_ORDERS[idx]);
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
                return Promise.resolve({ success: true });
            }
            return fetchJson<{ success: true }>(`/lab-orders/${id}`, {
                method: 'DELETE',
            });
        },
    },
    // Expose base URL for building direct URLs (e.g., TTS proxy)
    API_BASE_URL: API_URL.replace(/\/api$/, ''),
};
