/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — «BUGUN» EKRANIDAGI LABORATORIYA VA STATSIONAR ZONALARI.

   MUAMMO. «Bugun» xaritasi faqat shifokor qabulini ko'rsatadi: yo'l →
   kutish zali → kabinet. Ko'p profilli klinikada esa kunning yarmi boshqa
   joyda o'tadi: bemor tahlilga ketadi, kimdir palatada yotadi. «Laboratoriyada
   navbat bormi?», «bo'sh koyka qoldimi?» degan savolga javob olish uchun
   registrator ikki bo'limga kirib chiqishi kerak edi.

   BU MODUL ikkala bo'limning HOZIRGI holatini bitta so'rovda beradi. Ekranga
   faqat raqam va belgi chiqadi — ish o'sha bo'limlarning o'zida bajariladi
   (zona bosilganda o'sha ekran ochiladi).

   UCH QOIDA:

   1. RAQAM SERVERDA SANALADI. Yo'llanmalar ro'yxatini brauzerga to'liq
      yuklab sanash mumkin edi (`/api/lab-orders` hammasini beradi), lekin
      u yillar davomida o'sadi va «Bugun» har yangilanishda uni qayta tortardi.

   2. «BUGUN HAL QILINSIN» BILAN BIR XIL CHEGARA. Bir kundan ortiq proba
      kutayotgan yo'llanma — muammo (`attention.ts`), bugungisi — oddiy
      navbat. Shuning uchun `waiting` — oxirgi 24 soat, `stale` — undan
      eskisi: ikki ekran bir yo'llanmani ikki xil nomlamaydi.

   3. BO'LIM YO'Q BO'LSA — ZONA YO'Q. Laboratoriyasi yoki palatasi
      bo'lmagan klinikada tegishli maydon `null` qaytadi va ekranda bo'sh
      zona chizilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { tashkentDateStr, tashkentDayBounds, tashkentMinuteOfDay, tashkentMinuteOf } from './tashkentTime';
import { medDue } from '../shared/medSchedule';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

/** Zonada nomma-nom ko'rsatiladigan kutayotganlar — qolgani «+N» */
const WAITING_SHOWN = 6;
/** Zonada alohida belgi (probirka) bilan chiziladigan yo'llanmalar */
const WORKING_SHOWN = 24;

export interface TodayZones {
    date: string;
    lab: null | {
        /** Proba kutayotganlar: oxirgi 24 soatda buyurilgan, proba olinmagan. `count` — ODAM soni */
        waiting: { count: number; people: { patientId: string | null; patientName: string; urgent: boolean }[] };
        /** Bir kundan ortiq proba kutayotgan yo'llanmalar («Bugun hal qilinsin» dagi bilan bir xil son) */
        stale: number;
        /** Proba olingan, natija hali kiritilmagan. `overdue` — tahlil muddatidan o'tgani */
        working: { count: number; overdue: number; items: { overdue: boolean; urgent: boolean }[] };
        /** Bugun tayyor bo'lgan natijalar; `unseen` — shifokor hali ochmagani */
        ready: { count: number; unseen: number };
    };
    inpatient: null | {
        beds: { total: number; occupied: number; free: number; cleaning: number; blocked: number };
        wards: {
            id: string;
            name: string;
            beds: {
                id: string; label: string; status: string;
                admissionId: string | null; patientName: string | null;
                admittedToday: boolean; seenToday: boolean;
            }[];
        }[];
        admittedToday: number;
        dischargedToday: number;
        /** Bugun obxod yozilmagan faol yotishlar */
        notSeenToday: number;
        /** Vaqti kelgan, lekin belgilanmagan dori tayinlovlari (`shared/medSchedule.ts`) */
        medsDue: number;
    };
}

export function registerTodayZonesRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    /* Navbatni yuritadiganlarga — ega, registrator va hamshira: zonalar
       ularning «Bugun» ekranida turadi. Shifokor o'z bemorlarini o'z ekranida
       ko'radi. */
    app.get('/api/today/zones', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            if (!['CLINIC_ADMIN', 'RECEPTIONIST', 'NURSE'].includes(req.user?.role)) {
                return res.status(403).json({ error: "Ruxsat yo'q" });
            }

            const today = tashkentDateStr();
            const { start, end } = tashkentDayBounds(today);
            const nowMs = Date.now();
            const dayAgo = new Date(nowMs - 864e5);

            const [
                labDepts, waiting, stale, working, readyToday,
                wards, activeNoRound, dischargedToday, medOrders, medMarks,
            ] = await Promise.all([
                prisma.department.count({ where: { clinicId, type: 'LAB', isActive: true } }),
                /* Maydon nomi `orderedAt` — `createdAt` EMAS (`attention.ts`
                   dagi ogohlantirish shu jadval haqida). */
                prisma.labOrder.findMany({
                    where: { clinicId, status: 'Ordered', orderedAt: { gte: dayAgo } },
                    select: { patientId: true, patientName: true, priority: true },
                    orderBy: { orderedAt: 'asc' },
                }),
                prisma.labOrder.count({
                    where: { clinicId, status: 'Ordered', orderedAt: { lt: dayAgo } },
                }),
                prisma.labOrder.findMany({
                    where: { clinicId, status: { in: ['Collected', 'InProgress'] } },
                    select: {
                        priority: true, orderedAt: true, sampleCollectedAt: true,
                        items: { select: { test: { select: { turnaroundHours: true } } } },
                    },
                    orderBy: { orderedAt: 'asc' },
                }),
                prisma.labOrder.findMany({
                    where: { clinicId, status: 'Completed', completedAt: { gte: start, lte: end } },
                    select: { seenByDoctorAt: true },
                }),
                prisma.ward.findMany({
                    where: { clinicId, isActive: true },
                    select: {
                        id: true, name: true,
                        beds: {
                            orderBy: { label: 'asc' },
                            select: {
                                id: true, label: true, status: true,
                                admissions: {
                                    where: { status: 'Active' },
                                    select: {
                                        id: true, patientName: true, admittedAt: true,
                                        rounds: { where: { date: today }, select: { id: true }, take: 1 },
                                    },
                                    take: 1,
                                },
                            },
                        },
                    },
                    orderBy: { name: 'asc' },
                }),
                /* Obxod — yotgan HAR bemorga, koykasi bo'lmasa ham. Shuning
                   uchun palatalardan emas, yotishlarning o'zidan sanaladi. */
                prisma.admission.count({
                    where: { clinicId, status: 'Active', rounds: { none: { date: today } } },
                }),
                prisma.admission.count({
                    where: { clinicId, status: 'Discharged', dischargedAt: { gte: start, lte: end } },
                }),
                /* Bugun amal qiladigan tayinlovlar — statsionarning kunlik
                   ro'yxatidagi bilan bir xil shart (`inpatient.ts`), ustiga
                   to'xtatilmagani. */
                prisma.medicationOrder.findMany({
                    where: {
                        status: { not: 'Stopped' },
                        admission: { clinicId, status: 'Active' },
                        startDate: { lte: today },
                        OR: [{ endDate: null }, { endDate: { gte: today } }],
                    },
                    select: { id: true, frequency: true },
                }),
                prisma.medicationAdministration.findMany({
                    where: { clinicId, givenAt: { gte: start, lte: end } },
                    select: { orderId: true, givenAt: true },
                }),
            ]);

            /* ── Laboratoriya ─────────────────────────────────────────────
               «Kutmoqda» ODAM kesimida: bitta bemorga ikki yo'llanma yozilgan
               bo'lsa ham, proba olish xonasi oldida bitta odam turadi. */
            const people = new Map<string, { patientId: string | null; patientName: string; urgent: boolean }>();
            for (const o of waiting) {
                const key = o.patientId || `name:${o.patientName}`;
                const seen = people.get(key);
                const urgent = o.priority === 'Urgent';
                if (seen) seen.urgent = seen.urgent || urgent;
                else people.set(key, { patientId: o.patientId || null, patientName: o.patientName, urgent });
            }
            /* Muddat — yo'llanmadagi eng uzoq tahlilniki (`LabTest.turnaroundHours`),
               proba olingan paytdan sanaladi. `deadline` maydoni bor, lekin uni
               hech bir ekran to'ldirmaydi — unga tayanib bo'lmaydi. */
            const workingItems = working.map((o: any) => {
                const hours = Math.max(0, ...(o.items || []).map((i: any) => Number(i.test?.turnaroundHours) || 0)) || 24;
                const from = new Date(o.sampleCollectedAt || o.orderedAt).getTime();
                return { overdue: nowMs > from + hours * 3600e3, urgent: o.priority === 'Urgent' };
            });
            const hasLabWork = waiting.length + stale + working.length + readyToday.length > 0;
            const lab: TodayZones['lab'] = labDepts > 0 || hasLabWork ? {
                waiting: { count: people.size, people: [...people.values()].slice(0, WAITING_SHOWN) },
                stale,
                working: {
                    count: workingItems.length,
                    overdue: workingItems.filter((x: any) => x.overdue).length,
                    /* Kechikkanlar oldinda: zonada joy cheklangan, muhimi ko'rinsin */
                    items: [...workingItems].sort((a: any, b: any) => Number(b.overdue) - Number(a.overdue)).slice(0, WORKING_SHOWN),
                },
                ready: {
                    count: readyToday.length,
                    unseen: readyToday.filter((o: any) => !o.seenByDoctorAt).length,
                },
            } : null;

            /* ── Statsionar ──────────────────────────────────────────── */
            let admittedToday = 0;
            const zoneWards = wards.map((w: any) => ({
                id: w.id,
                name: w.name,
                beds: (w.beds || []).map((b: any) => {
                    const adm = (b.admissions || [])[0] || null;
                    const isToday = !!adm && new Date(adm.admittedAt) >= start && new Date(adm.admittedAt) <= end;
                    if (isToday) admittedToday++;
                    return {
                        id: b.id, label: b.label, status: b.status,
                        admissionId: adm?.id || null,
                        patientName: adm?.patientName || null,
                        admittedToday: isToday,
                        seenToday: !!adm && (adm.rounds || []).length > 0,
                    };
                }),
            }));
            /* Vaqti kelgan dorilar — TAYINLOV kesimida: bitta dorining ikki
               dozasi kechikkan bo'lsa ham, hamshira uchun bu bitta ish. */
            const handled = new Map<string, number>();
            const lastMark = new Map<string, number>();
            for (const m of medMarks) {
                handled.set(m.orderId, (handled.get(m.orderId) || 0) + 1);
                lastMark.set(m.orderId, Math.max(lastMark.get(m.orderId) || 0, +new Date(m.givenAt)));
            }
            const nowMin = tashkentMinuteOfDay();
            const medsDue = medOrders.filter((o: any) => medDue(
                o.frequency, handled.get(o.id) || 0, nowMin,
                lastMark.has(o.id) ? tashkentMinuteOf(new Date(lastMark.get(o.id)!)) : null,
            ).due > 0).length;

            const allBeds = zoneWards.flatMap((w: any) => w.beds);
            const count = (status: string) => allBeds.filter((b: any) => b.status === status).length;
            const inpatient: TodayZones['inpatient'] = zoneWards.length > 0 ? {
                beds: {
                    total: allBeds.length,
                    occupied: count('Occupied'),
                    free: count('Free'),
                    cleaning: count('Cleaning'),
                    blocked: count('Blocked'),
                },
                wards: zoneWards,
                admittedToday,
                dischargedToday,
                notSeenToday: activeNoRound,
                medsDue,
            } : null;

            const body: TodayZones = { date: today, lab, inpatient };
            res.json(body);
        } catch (error: any) {
            console.error('Today zones error:', error?.message || error);
            res.status(500).json({ error: 'Zonalar holatini olishda xatolik' });
        }
    });
}
