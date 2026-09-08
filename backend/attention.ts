/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — «BUGUN HAL QILINSIN».

   MUAMMO. Klinika egasi tizimga kirganda birinchi ko'radigan ekran —
   «Bugun», ya'ni REGISTRATORNING ish stoli. Eganing savoli esa boshqa:
   «bugun nimaga aralashishim kerak?»

   Hozir bu savolning javobi oltita ekranga tarqalgan: yopilmagan smena
   Kassada, muddati o'tgan dori Omborda, natijasi kiritilmagan tahlil
   Laboratoriyada, vedomost Xodimlarda. Ularning har biriga KIRIB
   ko'rmaguncha, muammo borligini bilib bo'lmaydi.

   BU MODUL bitta savolga javob beradi: hozir nima e'tibor kutmoqda.

   IKKITA QOIDA:

   1. FAQAT HAQIQIY ISH. Nol bo'lgan band ro'yxatga umuman tushmaydi.
      «0 ta muddati o'tgan dori» degan qator — bezak, va u orasida
      haqiqiy muammo ko'rinmay qoladi.

   2. HAR BAND MANZILGA OLIB BORADI. Raqamning o'zi hech narsani
      hal qilmaydi: qator bosilganda aynan o'sha ish bajariladigan
      ekran ochilishi kerak.

   Bandlar SHOSHILINCHLIK bo'yicha tartiblanadi: pul → ombor → ish.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { som } from './money';
import { tashkentDateStr, TASHKENT_OFFSET_MS } from './tashkentTime';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

export type AttentionLevel = 'high' | 'medium' | 'low';

export interface AttentionItem {
    key: string;
    level: AttentionLevel;
    /** Asosiy matn — raqam bilan */
    title: string;
    /** Tafsilot: qaysi mahsulot, qancha pul, eng eskisi qachon */
    hint?: string;
    count: number;
    /** Ilova ichidagi manzil */
    link: string;
}

/** Sana ayirmasi — kunlarda. Ikkalasi ham 'YYYY-MM-DD'. */
export function daysBetween(from: string, to: string): number {
    const a = Date.parse(`${from}T00:00:00Z`);
    const b = Date.parse(`${to}T00:00:00Z`);
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 864e5);
}

const shiftDay = (base: string, delta: number) =>
    new Date(Date.parse(`${base}T00:00:00Z`) + delta * 864e5).toISOString().slice(0, 10);

export function registerAttentionRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    /* Faqat klinika egasi. Registratorga bu ro'yxat kerak emas: undagi
       bandlarning yarmi (vedomost, oylik, xarajat) unga yopiq. */
    app.get('/api/reports/attention', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            if (req.user?.role !== 'CLINIC_ADMIN') {
                return res.status(403).json({ error: "Ruxsat yo'q" });
            }

            const today = tashkentDateStr();
            const yesterday = shiftDay(today, -1);
            const monthStart = today.slice(0, 8) + '01';
            const dayAgo = new Date(Date.now() - 864e5);

            const [
                unpaidCharges, openDays, closedDays, batches, lowStock,
                labPending, studyPending, staleAppointments, runs, staffNoSalary,
            ] = await Promise.all([
                /* Qarz — eng eskisini topish uchun qabul sanasi bilan. */
                prisma.visitCharge.findMany({
                    where: { clinicId, status: 'Unpaid' },
                    select: {
                        patientId: true, patientName: true, total: true, paidAmount: true,
                        createdAt: true, visit: { select: { date: true } },
                    },
                }),
                /* Kassa harakati bo'lgan kunlar — smena yopilishi shu
                   kunlarga solishtiriladi. */
                prisma.transaction.findMany({
                    where: { clinicId, date: { lt: today, gte: shiftDay(today, -14) } },
                    select: { date: true },
                    distinct: ['date'],
                }),
                prisma.cashRegisterDay.findMany({
                    where: { clinicId, date: { lt: today, gte: shiftDay(today, -14) } },
                    select: { date: true },
                }),
                /* Muddati o'tgan va 30 kun ichida tugaydigan partiyalar. */
                /* `InventoryBatch` da `clinicId` YO'Q — u mahsulot orqali
                   bog'lanadi. To'g'ridan-to'g'ri filtrlash boshqa
                   klinikaning partiyalarini ham tortib kelardi. */
                prisma.inventoryBatch.findMany({
                    where: {
                        item: { clinicId },
                        quantity: { gt: 0 },
                        expiryDate: { not: null, lte: shiftDay(today, 30) },
                    },
                    select: { expiryDate: true, quantity: true, item: { select: { name: true } } },
                    orderBy: { expiryDate: 'asc' },
                }),
                prisma.$queryRawUnsafe(
                    `SELECT id, name FROM "InventoryItem"
                      WHERE clinicId = ? AND minQuantity > 0 AND quantity <= minQuantity`,
                    clinicId,
                ),
                /* Bir kundan ortiq natijasiz turgan yo'llanmalar. Bugun
                   buyurilgani hali muammo emas. */
                /* Maydon nomi `orderedAt` — `createdAt` EMAS. Ikkala
                   jadvalda ham shunday, va noto'g'ri nom Prisma da
                   tushunarsiz 500 beradi (BUILD-SPEC, 27 va 33-xatolar
                   aynan shu tur edi). */
                prisma.labOrder.count({
                    where: { clinicId, status: 'Ordered', orderedAt: { lt: dayAgo } },
                }),
                prisma.diagnosticStudy.count({
                    where: { clinicId, status: 'Ordered', orderedAt: { lt: dayAgo } },
                }),
                /* O'tib ketgan, lekin yopilmagan yozuvlar: bemor kelmadimi
                   yoki belgilanmadimi — ikkalasi ham qaror talab qiladi. */
                prisma.appointment.count({
                    where: { clinicId, date: { lt: today }, status: { in: ['Pending', 'Confirmed'] } },
                }),
                prisma.payrollRun.count({
                    where: { clinicId, periodFrom: { lte: today }, periodTo: { gte: monthStart } },
                }),
                /* Oyligi kiritilmagan xodimlar — to'rt jadval bo'ylab. */
                Promise.all([
                    prisma.doctor.count({ where: { clinicId, status: 'Active', fixedSalary: 0, salaryType: { in: ['fixed', 'fixed_kpi'] } } }),
                    prisma.receptionist.count({ where: { clinicId, status: 'Active', fixedSalary: 0 } }),
                    prisma.labTechnician.count({ where: { clinicId, status: 'Active', fixedSalary: 0 } }),
                    prisma.nurse.count({ where: { clinicId, status: 'Active', fixedSalary: 0 } }),
                ]).then((n: number[]) => n.reduce((s, v) => s + v, 0)),
            ]);

            const items: AttentionItem[] = [];

            /* ── 1. 30 kundan oshgan qarz ───────────────────────────────
               Bemor kesimida sanaladi: «107 ta qator» emas, «107 ta ODAM»
               — qo'ng'iroq qilinadigan narsa odam. */
            const byPatient = new Map<string, { due: number; oldest: string }>();
            for (const c of unpaidCharges) {
                const key = c.patientId || `noname:${c.patientName}`;
                const day = c.visit?.date
                    || new Date(c.createdAt.getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
                const g = byPatient.get(key) || { due: 0, oldest: day };
                g.due = som(g.due + (c.total - (c.paidAmount || 0)));
                if (day < g.oldest) g.oldest = day;
                byPatient.set(key, g);
            }
            const overdue = Array.from(byPatient.values())
                .filter(g => g.due > 0 && daysBetween(g.oldest, today) >= 30);
            if (overdue.length) {
                const sum = som(overdue.reduce((s, g) => s + g.due, 0));
                const oldest = overdue.reduce((a, b) => (a.oldest < b.oldest ? a : b));
                items.push({
                    key: 'debt_overdue',
                    level: 'high',
                    title: `${overdue.length} ta bemor 30+ kun to'lamagan`,
                    hint: `Jami ${sum.toLocaleString('ru-RU').replace(/,/g, ' ')} so'm · eng eskisi ${daysBetween(oldest.oldest, today)} kun oldin`,
                    count: overdue.length,
                    link: '/finance',
                });
            }

            /* ── 2. Yopilmagan smena ────────────────────────────────────
               Kassa harakati BO'LGAN, lekin yopilish yozuvi YO'Q kun. */
            const closed = new Set(closedDays.map((d: any) => d.date));
            const unclosed = openDays.map((d: any) => d.date).filter((d: string) => !closed.has(d)).sort();
            if (unclosed.length) {
                items.push({
                    key: 'cash_unclosed',
                    level: 'high',
                    title: unclosed.length === 1
                        ? `${unclosed[0]} kuni kassa smenasi yopilmagan`
                        : `${unclosed.length} kun kassa smenasi yopilmagan`,
                    hint: unclosed.length > 1 ? `eng eskisi ${unclosed[0]}` : undefined,
                    count: unclosed.length,
                    link: '/finance',
                });
            }

            /* ── 3. Muddat ──────────────────────────────────────────── */
            const expired = batches.filter((b: any) => b.expiryDate < today);
            const soon = batches.filter((b: any) => b.expiryDate >= today);
            if (expired.length) {
                items.push({
                    key: 'stock_expired',
                    level: 'high',
                    title: `${expired.length} ta partiya muddati o'tgan`,
                    hint: expired.slice(0, 3).map((b: any) => b.item?.name).filter(Boolean).join(', '),
                    count: expired.length,
                    link: '/inventory',
                });
            }
            if (soon.length) {
                items.push({
                    key: 'stock_expiring',
                    level: 'medium',
                    title: `${soon.length} ta partiya 30 kun ichida tugaydi`,
                    hint: soon.slice(0, 3).map((b: any) => b.item?.name).filter(Boolean).join(', '),
                    count: soon.length,
                    link: '/inventory',
                });
            }
            if (Array.isArray(lowStock) && lowStock.length) {
                items.push({
                    key: 'stock_low',
                    level: 'medium',
                    title: `${lowStock.length} ta mahsulot minimumdan past`,
                    hint: lowStock.slice(0, 3).map((r: any) => r.name).join(', '),
                    count: lowStock.length,
                    link: '/inventory',
                });
            }

            /* ── 4. Natijasi kiritilmagan yo'llanmalar ─────────────── */
            if (labPending > 0) {
                items.push({
                    key: 'lab_pending',
                    level: 'medium',
                    title: `${labPending} ta tahlil natijasi kiritilmagan`,
                    hint: 'bir kundan ortiq kutmoqda',
                    count: labPending,
                    link: '/lab',
                });
            }
            if (studyPending > 0) {
                items.push({
                    key: 'study_pending',
                    level: 'medium',
                    title: `${studyPending} ta diagnostika xulosasi yozilmagan`,
                    hint: 'bir kundan ortiq kutmoqda',
                    count: studyPending,
                    link: '/diagnostics',
                });
            }

            /* ── 5. Osilib qolgan yozuvlar ─────────────────────────── */
            if (staleAppointments > 0) {
                items.push({
                    key: 'appointments_stale',
                    level: 'medium',
                    title: `${staleAppointments} ta o'tgan yozuv yopilmagan`,
                    hint: 'bemor keldimi yoki kelmadimi — belgilanmagan',
                    count: staleAppointments,
                    link: '/calendar',
                });
            }

            /* ── 6. Ish haqi ───────────────────────────────────────── */
            if (runs === 0) {
                items.push({
                    key: 'payroll_missing',
                    level: 'low',
                    title: 'Bu oyga vedomost tuzilmagan',
                    hint: 'shifokor ulushi hisoblanmagan',
                    count: 1,
                    link: '/staff?tab=payroll',
                });
            }
            if (staffNoSalary > 0) {
                items.push({
                    key: 'staff_no_salary',
                    level: 'low',
                    title: `${staffNoSalary} ta xodimning oyligi kiritilmagan`,
                    hint: 'oylik fondi to\'liq emas',
                    count: staffNoSalary,
                    link: '/staff',
                });
            }

            const order: Record<AttentionLevel, number> = { high: 0, medium: 1, low: 2 };
            items.sort((a, b) => order[a.level] - order[b.level]);

            res.json({
                date: today,
                yesterday,
                total: items.length,
                high: items.filter(i => i.level === 'high').length,
                items,
            });
        } catch (e: any) {
            console.error('[GET /api/reports/attention]', e?.message || e);
            res.status(500).json({ error: e?.message || 'Server xatoligi' });
        }
    });

    console.log('✅ «Bugun hal qilinsin» endpointi ulandi');
}
