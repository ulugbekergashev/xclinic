/**
 * Segment uchun jamlanma ma'lumotlar (to'lovlar summasi, tashriflar soni ...).
 *
 * Bular bemor jadvalidagi oddiy ustun emas — boshqa jadvallardan hisoblanadi.
 * Shuning uchun ular alohida: FAQAT shartlarda ishlatilgan jamlanmalar
 * hisoblanadi. Agar foydalanuvchi "to'lovlar summasi" filtrini qo'ymagan bo'lsa,
 * tranzaksiyalar jadvaliga umuman murojaat qilinmaydi.
 *
 * MUHIM: BAZA SXEMASINI O'ZGARTIRMAYDI — faqat mavjud jadvallarni o'qiydi.
 */

import { prisma } from './db';

export type AggregateKey =
    | 'totalSpent'
    | 'visitCount'
    | 'noShowCount'
    | 'activeInstallment'
    | 'upcomingAppointment'
    | 'lastApptType'
    | 'procedures'
    | 'diagnoses'
    | 'lastRating';

/** Bemor qilgan bitta muolaja va uning sanasi */
export interface ProcedureRecord { name: string; at: Date | null; }

export interface Aggregates {
    /** Bemor bo'yicha to'langan summa (status: Paid) */
    totalSpent?: Map<string, number>;
    /** Tashriflar soni */
    visitCount?: Map<string, number>;
    /** Kelmagan qabullar soni */
    noShowCount?: Map<string, number>;
    /** Faol bo'lib to'lash rejasi bor bemorlar */
    activeInstallment?: Set<string>;
    /** Kelgusida qabuli bor bemorlar */
    upcomingAppointment?: Set<string>;
    /** Oxirgi qabul turi */
    lastApptType?: Map<string, string>;
    /** Bemor qilgan muolajalar (nomi + sanasi) */
    procedures?: Map<string, ProcedureRecord[]>;
    /** Bemorning tashxis kodlari */
    diagnoses?: Map<string, Set<string>>;
    /** Oxirgi qo'ygan bahosi */
    lastRating?: Map<string, number>;
}

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Kerakli jamlanmalarni hisoblaydi. Kerak bo'lmaganiga so'rov ketmaydi.
 */
export async function buildAggregates(clinicId: string, needed: Set<AggregateKey>): Promise<Aggregates> {
    const agg: Aggregates = {};
    const jobs: Promise<void>[] = [];

    if (needed.has('totalSpent')) {
        jobs.push((async () => {
            const rows = await prisma.transaction.groupBy({
                by: ['patientId'],
                where: { clinicId, status: 'Paid', patientId: { not: null } },
                _sum: { amount: true },
            });
            const m = new Map<string, number>();
            for (const r of rows as any[]) {
                if (r.patientId) m.set(r.patientId, r._sum.amount || 0);
            }
            agg.totalSpent = m;
        })());
    }

    if (needed.has('visitCount')) {
        jobs.push((async () => {
            const rows = await prisma.visit.groupBy({
                by: ['patientId'],
                where: { clinicId },
                _count: true,
            });
            const m = new Map<string, number>();
            for (const r of rows as any[]) m.set(r.patientId, r._count || 0);
            agg.visitCount = m;
        })());
    }

    if (needed.has('noShowCount')) {
        jobs.push((async () => {
            const rows = await prisma.appointment.groupBy({
                by: ['patientId'],
                where: { clinicId, status: 'No-Show' },
                _count: true,
            });
            const m = new Map<string, number>();
            for (const r of rows as any[]) m.set(r.patientId, r._count || 0);
            agg.noShowCount = m;
        })());
    }

    if (needed.has('activeInstallment')) {
        jobs.push((async () => {
            const rows = await prisma.installmentPlan.findMany({
                where: { clinicId, status: 'Active' },
                select: { patientId: true },
            });
            agg.activeInstallment = new Set((rows as any[]).map(r => r.patientId));
        })());
    }

    if (needed.has('upcomingAppointment')) {
        jobs.push((async () => {
            const rows = await prisma.appointment.findMany({
                where: { clinicId, date: { gte: todayStr() }, status: { in: ['Confirmed', 'Pending'] } },
                select: { patientId: true },
            });
            agg.upcomingAppointment = new Set((rows as any[]).map(r => r.patientId));
        })());
    }

    if (needed.has('lastApptType')) {
        jobs.push((async () => {
            // Eng oxirgi qabul turi: sana bo'yicha kamayish tartibida birinchi uchragani
            const rows = await prisma.appointment.findMany({
                where: { clinicId },
                select: { patientId: true, type: true, date: true },
                orderBy: [{ date: 'desc' }, { time: 'desc' }],
            });
            const m = new Map<string, string>();
            for (const r of rows as any[]) {
                if (!m.has(r.patientId)) m.set(r.patientId, r.type || '');
            }
            agg.lastApptType = m;
        })());
    }

    if (needed.has('procedures')) {
        jobs.push((async () => {
            // Muolajalar Visit orqali bemorga bog'lanadi
            const rows = await prisma.treatmentProcedure.findMany({
                where: { visit: { clinicId } },
                select: {
                    procedureName: true,
                    completedAt: true,
                    createdAt: true,
                    visit: { select: { patientId: true } },
                },
            });
            const m = new Map<string, ProcedureRecord[]>();
            for (const r of rows as any[]) {
                const pid = r.visit?.patientId;
                if (!pid) continue;
                if (!m.has(pid)) m.set(pid, []);
                m.get(pid)!.push({ name: r.procedureName || '', at: r.completedAt || r.createdAt || null });
            }
            agg.procedures = m;
        })());
    }

    if (needed.has('diagnoses')) {
        jobs.push((async () => {
            const rows = await prisma.patientDiagnosis.findMany({
                where: { clinicId },
                select: { patientId: true, code: true },
            });
            const m = new Map<string, Set<string>>();
            for (const r of rows as any[]) {
                if (!m.has(r.patientId)) m.set(r.patientId, new Set());
                m.get(r.patientId)!.add(r.code);
            }
            agg.diagnoses = m;
        })());
    }

    if (needed.has('lastRating')) {
        jobs.push((async () => {
            // Baho qabul orqali bemorga bog'lanadi
            const rows = await prisma.review.findMany({
                where: { appointment: { clinicId } },
                select: { rating: true, createdAt: true, appointment: { select: { patientId: true } } },
                orderBy: { createdAt: 'desc' },
            });
            const m = new Map<string, number>();
            for (const r of rows as any[]) {
                const pid = r.appointment?.patientId;
                if (pid && !m.has(pid)) m.set(pid, r.rating);
            }
            agg.lastRating = m;
        })());
    }

    await Promise.all(jobs);
    return agg;
}

/** Klinikada bajarilgan muolaja nomlari — filtr variantlari uchun */
export async function listProcedureNames(clinicId: string): Promise<string[]> {
    try {
        const rows = await prisma.treatmentProcedure.findMany({
            where: { visit: { clinicId } },
            select: { procedureName: true },
            distinct: ['procedureName'],
        });
        return (rows as any[]).map(r => r.procedureName).filter(Boolean).sort();
    } catch {
        return [];
    }
}

/** Klinikada qo'yilgan tashxis kodlari */
export async function listDiagnosisCodes(clinicId: string): Promise<{ code: string; name: string }[]> {
    try {
        const rows = await prisma.patientDiagnosis.findMany({
            where: { clinicId },
            select: { code: true, icd10: { select: { name: true } } },
            distinct: ['code'],
        });
        return (rows as any[])
            .map(r => ({ code: r.code, name: r.icd10?.name || r.code }))
            .sort((a, b) => a.code.localeCompare(b.code));
    } catch {
        return [];
    }
}

/** Qabul turlari ro'yxati — filtr variantlari uchun */
export async function listAppointmentTypes(clinicId: string): Promise<string[]> {
    try {
        const rows = await prisma.appointment.findMany({
            where: { clinicId },
            select: { type: true },
            distinct: ['type'],
        });
        return (rows as any[]).map(r => r.type).filter(Boolean).sort();
    } catch {
        return [];
    }
}
