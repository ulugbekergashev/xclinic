/**
 * Avtomatika triggerlari reyestri.
 *
 * Nega shunday: ilgari uchta trigger uchta alohida cron funksiyasi edi va
 * to'rtinchisini qo'shish uchun kod uch joyda o'zgarishi kerak edi. Endi har bir
 * trigger — shu ro'yxatdagi bitta yozuv: `findDue` mos hodisalarni topadi,
 * qolganini umumiy dvigatel bajaradi (dedupe, shablon, yuborish, log).
 *
 * MUHIM: bu fayl BAZA SXEMASINI O'ZGARTIRMAYDI.
 * - `AutomationRule.trigger` — oddiy String ustun, enum emas. Yangi qiymat
 *   qo'shish uchun migratsiya kerak emas.
 * - `AutomationRule.hoursBefore` — Int? ustuni. Har bir trigger uni o'z
 *   ma'nosida ishlatadi (soat oldin / soat keyin / kun / oy). Qaysi ma'noda
 *   ekani quyidagi `offset` tavsifida yozilgan.
 * - Takrorlanmaslik `TelegramLog.ruleId + refId` indeksi orqali — u ham mavjud.
 */

import { prisma } from './db';
import { resolveSegment } from './segments';
import { schedulePeriodKey } from './ruleExtras';

// Toshkent vaqti (UTC+5, DST yo'q)
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
export const tashkentNowMs = () => Date.now() + TASHKENT_OFFSET_MS;
export const tashkentDateStr = (offsetDays = 0) =>
    new Date(Date.now() + TASHKENT_OFFSET_MS + offsetDays * 86400000).toISOString().split('T')[0];

/** Bemor tug'ilgan kunini MM-DD ga keltirish (YYYY-MM-DD yoki DD.MM.YYYY) */
export function dobToMonthDay(dob: string): string {
    if (!dob) return '';
    if (dob.includes('-')) {
        const parts = dob.split('-');
        if (parts.length === 3) return `${parts[1]}-${parts[2]}`;
    } else if (dob.includes('.')) {
        const parts = dob.split('.');
        if (parts.length >= 2) return `${parts[1]}-${parts[0]}`;
    }
    return '';
}

/** Bitta yuboriladigan xabar nomzodi */
export interface DueItem {
    patient: any;
    /** Takrorlanmaslik kaliti (ruleId bilan birga unikal bo'lishi kerak) */
    refId: string;
    /** processTemplate uchun o'zgaruvchilar */
    vars: Record<string, any>;
    /** TelegramLog.type */
    type: string;
    replyMarkup?: any;
}

export interface TriggerDef {
    id: string;
    label: string;
    /** Chastota chegarasiga bo'ysunadimi. Transaksion xabarlar uchun false. */
    respectCooldown: boolean;
    /**
     * Tinch soatlar: trigger faqat shu oraliqda ishlaydi (Toshkent vaqti).
     * Dvigatel har 10 daqiqada aylangani uchun bu bo'lmasa tug'ilgan kun
     * tabrigi yarim tunda ketib qolardi. Ko'rsatilmasa — cheklovsiz.
     */
    sendWindow?: { fromHour: number; toHour: number };
    /** `hoursBefore` ustuni shu trigger uchun nimani anglatadi */
    offset?: {
        label: string;
        unit: 'hour' | 'day' | 'month';
        options: number[];
        default: number;
    };
    /** Shifokor filtri mantiqiymi */
    supportsDoctorFilter: boolean;
    /** To'liq auditoriya segmenti sozlanadimi (jadval bo'yicha kampaniyalar) */
    supportsSegment?: boolean;
    /** Yuborish jadvali sozlanadimi */
    supportsSchedule?: boolean;
    /**
     * Hozir yuborilishi kerak bo'lgan nomzodlarni qaytaradi.
     * `rule.extras` — segment va jadval (dvigatel to'ldiradi).
     */
    findDue: (rule: any, clinic: any) => Promise<DueItem[]>;
}

const patientName = (p: any) => ({
    patientName: `${p.firstName} ${p.lastName}`,
    firstName: p.firstName,
    lastName: p.lastName,
});

const doctorName = (d: any) => (d ? `${d.firstName} ${d.lastName}` : '');

// Sana+vaqtni Toshkent devor soati sifatida ms ga aylantiradi
const wallClockMs = (date: string, time?: string) =>
    Date.parse(`${date}T${time || '00:00'}:00Z`);

export const TRIGGERS: TriggerDef[] = [
    // ── 0. Jadval bo'yicha kampaniya (segment + takrorlanuvchi vaqt) ────────
    // Ilgari imkonsiz bo'lgan narsa: "har dushanba qarzdorlarga",
    // "har oyning 1-kuni 6 oydan beri kelmaganlarga".
    {
        id: 'scheduled',
        label: 'Jadval bo\'yicha (segmentga)',
        respectCooldown: true,
        supportsDoctorFilter: false, // shifokor segment ichida tanlanadi
        supportsSegment: true,
        supportsSchedule: true,
        async findDue(rule, clinic) {
            const schedule = rule.extras?.schedule;
            if (!schedule) return [];

            const tashkentNow = new Date(tashkentNowMs());
            const period = schedulePeriodKey(schedule, tashkentNow);
            if (!period) return []; // hozir bu qoidaning vaqti emas

            const { patients, debtMap } = await resolveSegment(rule.clinicId, rule.extras?.segment);

            return patients.map((p: any) => ({
                patient: p,
                refId: `${p.id}:${period}`, // har davrda bir marta
                type: 'Campaign',
                vars: {
                    ...patientName(p),
                    date: tashkentDateStr(0),
                    clinicName: clinic.name,
                    amount: debtMap.get(p.id) || 0,
                },
            }));
        },
    },

    // ── 1. Qabuldan N soat oldin ────────────────────────────────────────────
    {
        id: 'before_appointment',
        label: 'Qabuldan oldin',
        // Transaksion: bemor o'z qabuli haqida bilishi shart
        respectCooldown: false,
        offset: { label: 'Necha soat oldin', unit: 'hour', options: [1, 2, 3, 6, 12, 24], default: 2 },
        supportsDoctorFilter: true,
        async findDue(rule, clinic) {
            const hours = rule.hoursBefore || 2;
            const nowMs = tashkentNowMs();
            const appointments = await prisma.appointment.findMany({
                where: {
                    clinicId: rule.clinicId,
                    date: { in: [tashkentDateStr(0), tashkentDateStr(1)] },
                    status: { in: ['Confirmed', 'Pending'] },
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
                include: { patient: true, doctor: true },
            });

            const due: DueItem[] = [];
            for (const appt of appointments) {
                const apptMs = wallClockMs(appt.date, appt.time);
                if (isNaN(apptMs)) continue;
                // Oyna: (qabul - N soat) dan qabul vaqtigacha
                if (nowMs < apptMs - hours * 3600000 || nowMs >= apptMs) continue;
                due.push({
                    patient: appt.patient,
                    refId: appt.id,
                    type: 'AutoReminder',
                    vars: {
                        ...patientName(appt.patient),
                        date: appt.date,
                        time: appt.time,
                        clinicName: clinic.name,
                        doctorName: doctorName(appt.doctor),
                    },
                });
            }
            return due;
        },
    },

    // ── 2. Tug'ilgan kun ────────────────────────────────────────────────────
    {
        id: 'birthday',
        label: "Tug'ilgan kun",
        respectCooldown: true,
        sendWindow: { fromHour: 9, toHour: 21 },
        supportsDoctorFilter: true,
        async findDue(rule, clinic) {
            const now = new Date(tashkentNowMs());
            const todayMonthDay = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
            const year = now.getUTCFullYear();

            const patients = await prisma.patient.findMany({
                where: {
                    clinicId: rule.clinicId,
                    status: 'Active',
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
            });

            return patients
                .filter((p: any) => dobToMonthDay(p.dob) === todayMonthDay)
                .map((p: any) => ({
                    patient: p,
                    refId: `${p.id}:${year}`, // yiliga bir marta
                    type: 'Birthday',
                    vars: { ...patientName(p), date: tashkentDateStr(0), clinicName: clinic.name },
                }));
        },
    },

    // ── 3. Kelmagan bemor ───────────────────────────────────────────────────
    {
        id: 'no_show',
        label: 'Kelmagan bemor',
        respectCooldown: true,
        sendWindow: { fromHour: 20, toHour: 22 },
        supportsDoctorFilter: true,
        async findDue(rule, clinic) {
            const appointments = await prisma.appointment.findMany({
                where: {
                    clinicId: rule.clinicId,
                    date: tashkentDateStr(0),
                    status: 'No-Show',
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
                include: { patient: true, doctor: true },
            });

            return appointments.map((appt: any) => ({
                patient: appt.patient,
                refId: appt.id,
                type: 'NoShow',
                replyMarkup: { inline_keyboard: [[{ text: '📅 Qabulga yozilish', callback_data: 'start_booking' }]] },
                vars: {
                    ...patientName(appt.patient),
                    date: appt.date,
                    time: appt.time,
                    clinicName: clinic.name,
                    doctorName: doctorName(appt.doctor),
                },
            }));
        },
    },

    // ── 4. Qabuldan N soat KEYIN (qanday his qilyapsiz / rahmat) ───────────
    {
        id: 'after_appointment',
        label: 'Qabuldan keyin',
        respectCooldown: true,
        sendWindow: { fromHour: 9, toHour: 21 },
        offset: { label: 'Necha soat keyin', unit: 'hour', options: [2, 4, 24, 48, 72], default: 24 },
        supportsDoctorFilter: true,
        async findDue(rule, clinic) {
            const hours = rule.hoursBefore || 24;
            const nowMs = tashkentNowMs();
            // Kerakli oynani qamrash uchun yetarli kun oralig'i
            const daysBack = Math.ceil(hours / 24) + 1;
            const dates: string[] = [];
            for (let i = 0; i <= daysBack; i++) dates.push(tashkentDateStr(-i));

            const appointments = await prisma.appointment.findMany({
                where: {
                    clinicId: rule.clinicId,
                    date: { in: dates },
                    status: 'Completed',
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
                include: { patient: true, doctor: true },
            });

            const due: DueItem[] = [];
            for (const appt of appointments) {
                const apptMs = wallClockMs(appt.date, appt.time);
                if (isNaN(apptMs)) continue;
                const sendFrom = apptMs + hours * 3600000;
                // Oyna: belgilangan vaqtdan keyingi 24 soat (kechikkanini ham yuboradi)
                if (nowMs < sendFrom || nowMs > sendFrom + 86400000) continue;
                due.push({
                    patient: appt.patient,
                    refId: appt.id,
                    type: 'AfterVisit',
                    vars: {
                        ...patientName(appt.patient),
                        date: appt.date,
                        time: appt.time,
                        clinicName: clinic.name,
                        doctorName: doctorName(appt.doctor),
                    },
                });
            }
            return due;
        },
    },

    // ── 5. Yangi bemor ro'yxatdan o'tgach ───────────────────────────────────
    {
        id: 'new_patient',
        label: "Yangi bemor ro'yxatdan o'tdi",
        respectCooldown: false, // birinchi salomlashuv — bir marta bo'ladi
        sendWindow: { fromHour: 9, toHour: 21 },
        offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 1 },
        supportsDoctorFilter: true,
        async findDue(rule, clinic) {
            const hours = rule.hoursBefore ?? 1;
            const nowMs = Date.now();
            const sendAfterMs = hours * 3600000;
            // Oyna: (hozir - offset - 24soat) dan (hozir - offset) gacha
            const from = new Date(nowMs - sendAfterMs - 86400000);
            const to = new Date(nowMs - sendAfterMs);

            const patients = await prisma.patient.findMany({
                where: {
                    clinicId: rule.clinicId,
                    createdAt: { gte: from, lte: to },
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
            });

            return patients.map((p: any) => ({
                patient: p,
                refId: p.id, // umrida bir marta
                type: 'Welcome',
                vars: { ...patientName(p), date: tashkentDateStr(0), clinicName: clinic.name },
            }));
        },
    },

    // ── 6. To'lov qabul qilingach (rahmat / kvitansiya) ─────────────────────
    {
        id: 'payment_received',
        label: "To'lov qabul qilindi",
        respectCooldown: false, // transaksion tasdiq
        sendWindow: { fromHour: 8, toHour: 22 },
        offset: { label: 'Necha soat keyin', unit: 'hour', options: [0, 1, 2, 24], default: 0 },
        supportsDoctorFilter: false,
        async findDue(rule, clinic) {
            const hours = rule.hoursBefore ?? 0;
            const nowMs = Date.now();
            const sendAfterMs = hours * 3600000;
            const from = new Date(nowMs - sendAfterMs - 86400000);
            const to = new Date(nowMs - sendAfterMs);

            const transactions = await prisma.transaction.findMany({
                where: {
                    clinicId: rule.clinicId,
                    status: 'Paid',
                    patientId: { not: null },
                    createdAt: { gte: from, lte: to },
                },
                include: { patient: true },
            });

            return transactions
                .filter((t: any) => t.patient)
                .map((t: any) => ({
                    patient: t.patient,
                    refId: t.id, // har to'lov uchun bir marta
                    type: 'PaymentThanks',
                    vars: {
                        ...patientName(t.patient),
                        date: t.date || tashkentDateStr(0),
                        clinicName: clinic.name,
                        amount: t.amount,
                    },
                }));
        },
    },

    // ── 7. Profilaktika: N oydan beri kelmagan bemorni qaytarish ────────────
    {
        id: 'recall',
        label: 'Uzoq kelmaganlarni qaytarish',
        respectCooldown: true,
        sendWindow: { fromHour: 10, toHour: 19 },
        offset: { label: 'Necha oydan beri kelmagan', unit: 'month', options: [3, 6, 9, 12], default: 6 },
        supportsDoctorFilter: true,
        async findDue(rule, clinic) {
            const months = rule.hoursBefore || 6;
            const cutoff = new Date();
            cutoff.setMonth(cutoff.getMonth() - months);
            const now = new Date(tashkentNowMs());
            const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

            const patients = await prisma.patient.findMany({
                where: {
                    clinicId: rule.clinicId,
                    status: 'Active',
                    ...(rule.doctorId ? { doctorId: rule.doctorId } : {}),
                },
            });

            return patients
                .filter((p: any) => {
                    // Hech qachon kelmaganlarga "sizni sog'indik" yuborilmaydi
                    if (!p.lastVisit) return false;
                    const last = new Date(p.lastVisit);
                    return !isNaN(last.getTime()) && last <= cutoff;
                })
                .map((p: any) => ({
                    patient: p,
                    refId: `${p.id}:${period}`, // oyiga ko'pi bilan bir marta
                    type: 'Recall',
                    vars: { ...patientName(p), date: tashkentDateStr(0), clinicName: clinic.name },
                }));
        },
    },

    // ── 8. Qarz eslatmasi ───────────────────────────────────────────────────
    {
        id: 'debt_reminder',
        label: 'Qarz eslatmasi',
        respectCooldown: true,
        sendWindow: { fromHour: 10, toHour: 19 },
        offset: { label: 'Qarz necha kundan beri', unit: 'day', options: [3, 7, 14, 30], default: 7 },
        supportsDoctorFilter: false,
        async findDue(rule, clinic) {
            const days = rule.hoursBefore || 7;
            const cutoff = new Date(Date.now() - days * 86400000);
            const now = new Date(tashkentNowMs());
            const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

            const pending = await prisma.transaction.findMany({
                where: {
                    clinicId: rule.clinicId,
                    status: 'Pending',
                    patientId: { not: null },
                    createdAt: { lte: cutoff },
                },
                include: { patient: true },
            });

            // Bemor bo'yicha jamlaymiz — bitta bemorga bitta xabar
            const byPatient = new Map<string, { patient: any; amount: number }>();
            for (const t of pending as any[]) {
                if (!t.patient) continue;
                const entry = byPatient.get(t.patientId) || { patient: t.patient, amount: 0 };
                entry.amount += t.amount;
                byPatient.set(t.patientId, entry);
            }

            return [...byPatient.values()].map(({ patient, amount }) => ({
                patient,
                refId: `${patient.id}:${period}`, // oyiga bir marta
                type: 'DebtReminder',
                vars: { ...patientName(patient), date: tashkentDateStr(0), clinicName: clinic.name, amount },
            }));
        },
    },
];

/** Hozir Toshkent bo'yicha soat nechada */
export const tashkentHour = () => new Date(tashkentNowMs()).getUTCHours();

/** Trigger hozir ishlashi mumkinmi (tinch soatlar tekshiruvi) */
export function isWithinSendWindow(def: TriggerDef): boolean {
    if (!def.sendWindow) return true;
    const h = tashkentHour();
    return h >= def.sendWindow.fromHour && h < def.sendWindow.toHour;
}

export const TRIGGER_IDS = TRIGGERS.map(t => t.id);
export const getTrigger = (id: string) => TRIGGERS.find(t => t.id === id);

/** Frontendga yuboriladigan tavsif (findDue funksiyasisiz) */
export const TRIGGER_DESCRIPTORS = TRIGGERS.map(
    ({ id, label, offset, supportsDoctorFilter, respectCooldown, sendWindow, supportsSegment, supportsSchedule }) => ({
        id, label, offset, supportsDoctorFilter, respectCooldown, sendWindow,
        supportsSegment: !!supportsSegment,
        supportsSchedule: !!supportsSchedule,
    })
);
