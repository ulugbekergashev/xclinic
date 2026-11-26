/* ─────────────────────────────────────────────────────────────────────────────
   BEMOR TASHRIFI — «oxirgi tashrif» va Bemorlar hisoboti (2026-11-26).

   XATO TOPILDI. `Patient.lastVisit` faqat bemor yaratilganda «Never» deb
   yozilardi va qabul ochilganda hech qachon yangilanmasdi. Uni o'qiydiganlar:
     • Xabarlar → «6 oydan beri kelmagan» segmenti (`segmentFields.ts`) — 0 kishi;
     • avtomatika «Uzoq kelmaganlarni qaytarish» (`triggers.ts`) — jimgina hech
       kimga yubormasdi;
     • AI yordamchi — hamma bemorda «Never».
   Endi: qabul ochilganda `touchLastVisit`, eski bazada esa server ishga
   tushganda bir marta `backfillLastVisits` (qabul va kelgan yozuvlardan).

   «YO'QOLGAN» TA'RIFI BITTA — segmentdagi bilan aynan bir xil: faol bemor,
   oxirgi tashrifi 6 OY (kalendar oyi, kun emas) oldin yoki undan ham avval.
   Hisobotdagi son va Xabarlarda «Eslatma yuborish» bosilganda chiqadigan
   ro'yxat bir xil bo'lishi shart.
   ───────────────────────────────────────────────────────────────────────────── */

import { tashkentDateStr, tashkentRangeBounds } from './tashkentTime';
import { previousPeriod } from './period';

export const LOST_MONTHS = 6;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** «2026-11-26» yoki to'liq ISO → «2026-11-26»; «Never», bo'sh → null */
export const visitDay = (v?: string | null): string | null => {
    if (!v || !ISO_DAY.test(v)) return null;
    return v.slice(0, 10);
};

/** Bemorning oxirgi tashrifini oldinga suradi (orqaga hech qachon) */
export async function touchLastVisit(prisma: any, patientId: string, date: string): Promise<void> {
    const day = visitDay(date);
    /* Kelajak sanaga ochilgan qabul «oxirgi tashrif» emas — u hali bo'lmagan */
    if (!day || day > tashkentDateStr()) return;
    const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { lastVisit: true } });
    if (!p) return;
    const cur = visitDay(p.lastVisit);
    if (cur && cur >= day) return;
    await prisma.patient.update({ where: { id: patientId }, data: { lastVisit: day } });
}

/** Bitta bemorning haqiqiy oxirgi tashrifi — qabul va kelgan yozuvlardan */
const VISIT_WHERE = (today: string) => ({ status: { not: 'Cancelled' }, date: { lte: today } });
const APPT_WHERE = (today: string) => ({ status: { in: ['Completed', 'Checked-In'] }, date: { lte: today } });

/* Qabul bekor qilinganda: «oxirgi tashrif» qolgan qabullardan QAYTA
   hisoblanadi (orqaga ham ketishi mumkin). Hech narsa qolmasa — «Never». */
export async function recomputeLastVisit(prisma: any, patientId: string): Promise<void> {
    const today = tashkentDateStr();
    const [v, a] = await Promise.all([
        prisma.visit.findFirst({ where: { patientId, ...VISIT_WHERE(today) }, orderBy: { date: 'desc' }, select: { date: true } }),
        prisma.appointment.findFirst({ where: { patientId, ...APPT_WHERE(today) }, orderBy: { date: 'desc' }, select: { date: true } }),
    ]);
    const days = [visitDay(v?.date), visitDay(a?.date)].filter(Boolean) as string[];
    const latest = days.sort().pop() || 'Never';
    await prisma.patient.update({ where: { id: patientId }, data: { lastVisit: latest } });
}

/* Eski baza: qabul (bekor qilinmagan) va kelgan kalendar yozuvlaridan eng
   oxirgi sana. Takror ishga tushsa ham zararsiz — faqat oldinga suradi.
   Bo'lak-bo'lak (500 tadan) va har bo'lak bitta tranzaksiyada: katta bazada
   SQLite parametr chegarasiga urilmaydi va yozuv qulfini uzoq ushlamaydi. */
const CHUNK = 500;
export async function backfillLastVisits(prisma: any): Promise<number> {
    const today = tashkentDateStr();
    const [visits, appts] = await Promise.all([
        prisma.visit.groupBy({ by: ['patientId'], where: VISIT_WHERE(today), _max: { date: true } }),
        prisma.appointment.groupBy({ by: ['patientId'], where: APPT_WHERE(today), _max: { date: true } }),
    ]);
    const latest = new Map<string, string>();
    for (const r of [...visits, ...appts]) {
        const d = visitDay(r._max?.date);
        if (!d || !r.patientId) continue;
        if (!latest.has(r.patientId) || latest.get(r.patientId)! < d) latest.set(r.patientId, d);
    }
    const ids = [...latest.keys()];
    let changed = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
        const part = ids.slice(i, i + CHUNK);
        const patients = await prisma.patient.findMany({ where: { id: { in: part } }, select: { id: true, lastVisit: true } });
        const updates = patients
            .filter((p: any) => { const cur = visitDay(p.lastVisit); return !cur || cur < latest.get(p.id)!; })
            .map((p: any) => prisma.patient.update({ where: { id: p.id }, data: { lastVisit: latest.get(p.id)! } }));
        if (updates.length) await prisma.$transaction(updates);
        changed += updates.length;
    }
    return changed;
}

/** Bugundan N kalendar oyi oldingi sana (segmentdagi `monthsAgoDate` bilan bir xil qoida) */
export const monthsAgoDay = (months: number, today = tashkentDateStr()): string => {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() - months);
    return dt.toISOString().slice(0, 10);
};

const shiftDay = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
};
const spanDays = (from: string, to: string) => {
    const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
    const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
    return Math.round((b - a) / 864e5) + 1;
};

type Counts = { visited: number; new: number; returning: number };

/* DAVR SONLARI. Kelgan = davrda qabul ochilgan har xil bemor. Yangi = kartasi
   HAM, birinchi qabuli HAM shu davrda (eski, ko'chirilgan bemor birinchi
   marta qabulga tushsa «yangi» bo'lib qolmasin). Qaytib kelgan = qolgani.
   Yangi bemorning shu davrdagi ikkinchi qabuli «qaytgan» SANALMAYDI. */
async function periodCounts(prisma: any, clinicId: string, from: string, to: string) {
    const visits = await prisma.visit.findMany({
        where: { clinicId, status: { not: 'Cancelled' }, date: { gte: from, lte: to } },
        select: { patientId: true, date: true, doctorId: true, doctorName: true },
        orderBy: { date: 'asc' },
    });
    const ids = [...new Set<string>(visits.map((v: any) => v.patientId))];
    if (ids.length === 0) return { counts: { visited: 0, new: 0, returning: 0 } as Counts, newIds: [] as string[], visits };
    const { start } = tashkentRangeBounds(from, to);
    const [patients, earlier] = await Promise.all([
        prisma.patient.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } }),
        prisma.visit.groupBy({ by: ['patientId'], where: { clinicId, patientId: { in: ids }, status: { not: 'Cancelled' }, date: { lt: from } }, _count: { _all: true } }),
    ]);
    const hadEarlier = new Set(earlier.map((r: any) => r.patientId));
    const createdBefore = new Set(patients.filter((p: any) => new Date(p.createdAt) < start).map((p: any) => p.id));
    const newIds = ids.filter(id => !hadEarlier.has(id) && !createdBefore.has(id));
    return { counts: { visited: ids.length, new: newIds.length, returning: ids.length - newIds.length }, newIds, visits };
}

export async function patientReport(prisma: any, clinicId: string, from: string, to: string, opts: { listLimit?: number } = {}) {
    const today = tashkentDateStr();
    /* Solishtirish davri Umumiy bilan BIR XIL qoidadan (`period.ts`) */
    const days = Math.max(1, spanDays(from, to));
    const pp = previousPeriod(from, to);
    const prevTo = pp?.to ?? shiftDay(from, -1);
    const prevFrom = pp?.from ?? shiftDay(prevTo, -(days - 1));

    const [cur, prev] = await Promise.all([
        periodCounts(prisma, clinicId, from, to),
        periodCounts(prisma, clinicId, prevFrom, prevTo),
    ]);

    /* YANGI BEMORLAR QAYTDIMI — birinchi qabuldagi shifokor bo'yicha.
       Egasining savoli: «kimning yangi bemori ikkinchi marta keladi?» */
    const firstVisit = new Map<string, any>();
    const newSet = new Set(cur.newIds);
    for (const v of cur.visits) if (newSet.has(v.patientId) && !firstVisit.has(v.patientId)) firstVisit.set(v.patientId, v);
    const later = cur.newIds.length ? await prisma.visit.findMany({
        where: { clinicId, patientId: { in: cur.newIds }, status: { not: 'Cancelled' } },
        select: { patientId: true, date: true },
    }) : [];
    const visitCount = new Map<string, number>();
    for (const v of later) visitCount.set(v.patientId, (visitCount.get(v.patientId) || 0) + 1);
    const byDoc = new Map<string, { doctorId: string | null; doctorName: string; newPatients: number; cameBack: number }>();
    for (const [pid, v] of firstVisit) {
        const key = v.doctorId || 'none';
        const row = byDoc.get(key) || { doctorId: v.doctorId || null, doctorName: v.doctorName || 'Belgilanmagan', newPatients: 0, cameBack: 0 };
        row.newPatients++;
        if ((visitCount.get(pid) || 0) >= 2) row.cameBack++;
        byDoc.set(key, row);
    }

    /* YO'QOLGAN — bugungi holat (davrga bog'liq emas), segment bilan bir xil */
    const cutoff = monthsAgoDay(LOST_MONTHS, today);
    const active = await prisma.patient.findMany({
        where: { clinicId, status: 'Active' },
        select: { id: true, firstName: true, lastName: true, phone: true, lastVisit: true, telegramChatId: true },
    });
    const lostAll = active
        .map((p: any) => ({ ...p, day: visitDay(p.lastVisit) }))
        .filter((p: any) => p.day && p.day <= cutoff)
        .sort((a: any, b: any) => b.day.localeCompare(a.day));
    const shown = lostAll.slice(0, opts.listLimit ?? 200);
    const shownIds = shown.map((p: any) => p.id);
    const [lastDocs, upcoming] = shownIds.length ? await Promise.all([
        prisma.visit.findMany({
            where: { clinicId, patientId: { in: shownIds }, status: { not: 'Cancelled' } },
            select: { patientId: true, date: true, doctorName: true },
            orderBy: { date: 'desc' },
        }),
        prisma.appointment.findMany({
            where: { clinicId, patientId: { in: shownIds }, date: { gt: today }, status: { notIn: ['Cancelled', 'No-Show'] } },
            select: { patientId: true, date: true },
            orderBy: { date: 'asc' },
        }),
    ]) : [[], []];
    const docOf = new Map<string, string>();
    for (const v of lastDocs) if (!docOf.has(v.patientId) && v.doctorName) docOf.set(v.patientId, v.doctorName);
    const nextOf = new Map<string, string>();
    for (const a of upcoming) if (!nextOf.has(a.patientId)) nextOf.set(a.patientId, a.date);

    return {
        range: { from, to },
        previous: { from: prevFrom, to: prevTo },
        current: cur.counts,
        prev: prev.counts,
        lost: {
            months: LOST_MONTHS,
            total: lostAll.length,
            withTelegram: lostAll.filter((p: any) => !!p.telegramChatId).length,
            patients: shown.map((p: any) => ({
                patientId: p.id,
                patientName: `${p.firstName} ${p.lastName}`.trim(),
                phone: p.phone || null,
                lastVisit: p.day,
                lastDoctor: docOf.get(p.id) || null,
                nextAppointment: nextOf.get(p.id) || null,
            })),
        },
        newByDoctor: [...byDoc.values()].sort((a, b) => b.newPatients - a.newPatients),
    };
}
