/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — shifokor ulushi va oylik VEDOMOST.

   MUAMMO. Hozir shifokorning ulushi ikki joyda yashaydi:

   1. `Doctor.percentage` — bitta foiz HAMMA narsaga. Haqiqatda esa
      konsultatsiyadan 30%, operatsiyadan 15%, UZI dan 0% (apparat
      klinikaning) (GAP-ANALYSIS B85).

   2. To'lov — qo'lda yozilgan `Expense` (kategoriya `DoctorShare`). Ya'ni
      hisob-kitob Excel da qilinadi, xato o'sha yerda qoladi, "shu oy kimga
      qancha tegdi" degan hujjat yo'q (B87).

   BU MODUL: stavkalar jadvali + davr uchun vedomost.

   ASOSIY QOIDA: ulush TO'LANGAN summadan hisoblanadi, yozilgandan emas.
   Qarzga yozilgan xizmat uchun shifokorga pul berib bo'lmaydi — u pul
   klinikaga hali kirmagan. Bu Excel da eng ko'p uchraydigan xato.

   IKKINCHI QOIDA: tasdiqlangan vedomost QAYTA HISOBLANMAYDI. Aks holda
   o'tgan oyning vedomosti bugungi stavka bilan o'zgarib ketardi va
   "nega raqam boshqa" degan savolga javob bo'lmasdi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { som } from './money';
import { tashkentDateStr, tashkentMonthStart, tashkentRangeBounds } from './tashkentTime';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

/* Pul — BUTUN so'm, `money.ts` dagi yagona qoida. Ilgari bu yerda
   o'zining nusxasi turardi va modullar orasida aniqlik farq qilardi. */
const round = som;

/* ─── STAVKA TANLASH — YAGONA NUSXA ────────────────────────────────────────

   Aniqroq stavka umumiyroqni yengadi: xizmat > bo'lim > umumiy stavka >
   shifokorning kartasidagi foiz.

   NIMA UCHUN EKSPORT QILINADI. Bu tartib IKKI JOYDA kerak: vedomost
   (shu fayl) va «Shifokorlar» hisoboti (`reports.ts`). Ilgari ular
   alohida-alohida yozilgan edi — `pickRate` va `rateFor`, qatorma-qator
   nusxa. Bitta joyda tuzatilgan xato ikkinchisida qolib ketardi va ikki
   ekran bitta shifokor uchun boshqa-boshqa foiz ko'rsatishi mumkin edi.

   `basis` — qaysi qoida ishlagani. Vedomost uni foydalanuvchiga
   ko'rsatadi: "nega aynan bu foiz?" degan savol javobsiz qolmasin. */
export type RateBasis = 'xizmat' | "bo'lim" | 'umumiy stavka' | 'shifokor foizi';

export function pickRate(
    rates: any[], doctorId: string, serviceId: number | null,
    departmentId: string | null, fallback: number, role = 'Doctor',
): { percent: number; basis: RateBasis } {
    const mine = rates.filter(r => r.doctorId === doctorId && r.role === role);
    if (serviceId != null) {
        const s = mine.find(r => r.serviceId === serviceId);
        if (s) return { percent: s.percent, basis: 'xizmat' };
    }
    if (departmentId) {
        const d = mine.find(r => r.serviceId == null && r.departmentId === departmentId);
        if (d) return { percent: d.percent, basis: "bo'lim" };
    }
    const g = mine.find(r => r.serviceId == null && r.departmentId == null);
    if (g) return { percent: g.percent, basis: 'umumiy stavka' };
    return { percent: fallback, basis: 'shifokor foizi' };
}

export function registerPayrollRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    const route = (
        method: 'get' | 'post' | 'put' | 'delete',
        path: string,
        handler: (req: any, res: any, clinicId: string) => Promise<any>,
    ) => {
        (app as any)[method](path, auth, async (req: any, res: any) => {
            try {
                const clinicId = getScopedClinicId(req);
                if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
                /* Pul taqsimlash — faqat klinika egasi. Shifokorning o'z
                   ulushini ko'rishi alohida masala va bu relizda yo'q:
                   avval raqamga ishonch kerak. */
                const role = (req as any).user?.role;
                if (role !== 'CLINIC_ADMIN') {
                    return res.status(403).json({ error: "Ruxsat yo'q" });
                }
                await handler(req, res, clinicId);
            } catch (e: any) {
                console.error(`[${method.toUpperCase()} ${path}]`, e?.message || e);
                res.status(500).json({ error: e?.message || 'Server xatoligi' });
            }
        });
    };

    // ═══ STAVKALAR ═══════════════════════════════════════════════════════════

    route('get', '/api/doctor-rates', async (req, res, clinicId) => {
        const { doctorId } = req.query;
        const rates = await prisma.doctorServiceRate.findMany({
            where: { clinicId, ...(doctorId ? { doctorId: String(doctorId) } : {}) },
            include: {
                service: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
            },
            orderBy: [{ doctorId: 'asc' }, { role: 'asc' }],
        });
        res.json(rates);
    });

    /**
     * Shifokorning BARCHA stavkalarini almashtiradi.
     *
     * Nima uchun to'liq almashtirish, qo'shish emas: interfeys stavkalar
     * jadvalini butun holda ko'rsatadi va saqlaydi. Qatorlarni bittalab
     * yuborish holatlar farqiga olib kelardi ("o'chirdim, lekin turibdi").
     */
    route('put', '/api/doctor-rates/:doctorId', async (req, res, clinicId) => {
        const doctorId = req.params.doctorId;
        const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
        if (!doctor || doctor.clinicId !== clinicId) {
            return res.status(404).json({ error: 'Shifokor topilmadi' });
        }

        const input = Array.isArray(req.body?.rates) ? req.body.rates : [];
        const clean: any[] = [];
        const seen = new Set<string>();

        for (const r of input) {
            const percent = Number(r?.percent);
            if (!isFinite(percent) || percent < 0 || percent > 100) {
                return res.status(400).json({ error: `Foiz 0 dan 100 gacha bo'lishi kerak (${r?.percent})` });
            }
            const role = r?.role === 'Assistant' ? 'Assistant' : 'Doctor';
            const serviceId = r?.serviceId != null && r.serviceId !== '' ? Number(r.serviceId) : null;
            const departmentId = r?.departmentId ? String(r.departmentId) : null;

            /* Unikal indeks NULL larni teng deb hisoblamaydi, ya'ni
               "hamma xizmatga" stavkasini ikki marta yozish MUMKIN.
               Shuning uchun takrorni shu yerda tutamiz. */
            const key = `${serviceId ?? 'all'}:${departmentId ?? 'all'}:${role}`;
            if (seen.has(key)) {
                return res.status(400).json({ error: 'Bir xil stavka ikki marta kiritilgan' });
            }
            seen.add(key);

            if (serviceId != null) {
                const svc = await prisma.service.findUnique({ where: { id: serviceId } });
                if (!svc || svc.clinicId !== clinicId) {
                    return res.status(404).json({ error: 'Xizmat topilmadi' });
                }
            }
            if (departmentId) {
                const dep = await prisma.department.findUnique({ where: { id: departmentId } });
                if (!dep || dep.clinicId !== clinicId) {
                    return res.status(404).json({ error: "Bo'lim topilmadi" });
                }
            }

            clean.push({ clinicId, doctorId, serviceId, departmentId, percent: round(percent), role });
        }

        await prisma.doctorServiceRate.deleteMany({ where: { clinicId, doctorId } });
        for (const row of clean) await prisma.doctorServiceRate.create({ data: row });

        res.json(await prisma.doctorServiceRate.findMany({
            where: { clinicId, doctorId },
            include: { service: { select: { id: true, name: true } } },
        }));
    });

    // ═══ VEDOMOST ════════════════════════════════════════════════════════════


    /**
     * Davr uchun hisob.
     *
     * MANBA — `ChargePayment`, ya'ni PUL KIRGAN paytdagi yozuvlar, hisob
     * qatorlarining o'zi emas. Nima uchun aynan shunday:
     *
     *   1. QISMAN to'lov. Qator bo'yicha hisoblaganda 1 mln lik operatsiyaning
     *      500 mingi to'langan bo'lsa, qator `paidAt` siz qoladi (u faqat
     *      to'liq to'langanda yoziladi) va davrga TUSHMAYDI. Ya'ni shifokor
     *      qisman to'langan ish uchun umuman ulush olmaydi — jimgina.
     *
     *   2. Boshqa oyda to'langan qarz. Yanvarda yozilgan, martda to'langan
     *      xizmat martda hisoblanishi kerak: pul o'sha oyda kirdi.
     *
     *   3. QAYTARISH. `ChargePayment` da qaytarish manfiy summa bilan yotadi,
     *      ya'ni ulush o'zi kamayadi. Qator bo'yicha hisoblaganda buni
     *      alohida tutish kerak bo'lardi.
     *
     * Migratsiya 0006 eski to'lovlarni haqiqiy sanasi bilan ko'chirgan
     * (`COALESCE(paidAt, createdAt)`), shuning uchun o'tgan davrlar ham
     * to'g'ri chiqadi.
     */
    async function computePayroll(clinicId: string, from: string, to: string) {
        const { start, end } = tashkentRangeBounds(from, to);

        const [payments, doctors, rates] = await Promise.all([
            prisma.chargePayment.findMany({
                where: { clinicId, createdAt: { gte: start, lte: end } },
                include: {
                    charge: {
                        select: {
                            doctorId: true, doctorName: true, serviceId: true,
                            name: true, source: true, status: true,
                            visit: { select: { departmentId: true } },
                        },
                    },
                },
            }),
            prisma.doctor.findMany({
                where: { clinicId },
                select: {
                    id: true, firstName: true, lastName: true, percentage: true,
                    departmentId: true, status: true,
                    // Fix maosh (0033 dan keyin vedomost buni O'QIYDI)
                    salaryType: true, fixedSalary: true,
                },
            }),
            prisma.doctorServiceRate.findMany({ where: { clinicId } }),
        ]);

        const byDoctor = new Map<string, any>();

        /* NEGA BO'SH — shu yerda sanaladi.
           Ilgari tashlab ketilgan qatorlar jimgina yo'qolardi va ekranda
           faqat «bu davrda ulush yo'q» degan umumiy gap qolardi. Klinika
           egasi uchun bu ikki xil holatni ajratmaydi: davrda umuman
           to'lov bo'lmaganmi, yoki to'lov bor-u shifokori ko'rsatilmaganmi.
           Ikkinchisi — pul biror kishiga tegishli emasligi, ya'ni
           tuzatilishi kerak bo'lgan xato. */
        let skippedNoDoctor = 0;
        let skippedNoDoctorSum = 0;
        let skippedCancelled = 0;

        for (const p of payments) {
            const c = p.charge;
            if (c?.status === 'Cancelled') { skippedCancelled++; continue; }
            // Shifokori ko'rsatilmagan qator (masalan avans) ulushga kirmaydi
            if (!c?.doctorId) {
                skippedNoDoctor++;
                skippedNoDoctorSum = round(skippedNoDoctorSum + (p.amount || 0));
                continue;
            }

            const doc = doctors.find((d: any) => d.id === c.doctorId);
            if (!byDoctor.has(c.doctorId)) {
                byDoctor.set(c.doctorId, {
                    doctorId: c.doctorId,
                    staffName: doc ? `${doc.lastName} ${doc.firstName}` : (c.doctorName || 'Belgilanmagan'),
                    paidBase: 0, accrued: 0, refunded: 0,
                    items: [] as any[],
                });
            }
            const g = byDoctor.get(c.doctorId);
            const amount = round(p.amount || 0);   // qaytarish manfiy
            const { percent, basis } = pickRate(
                rates, c.doctorId, c.serviceId ?? null,
                c.visit?.departmentId || doc?.departmentId || null,
                doc?.percentage ?? 0,
            );
            const share = round(amount * (percent / 100));

            g.paidBase = round(g.paidBase + amount);
            g.accrued = round(g.accrued + share);
            if (amount < 0) g.refunded = round(g.refunded + Math.abs(amount));
            g.items.push({
                name: c.name, paid: amount, percent, basis, share,
                source: c.source, kind: p.kind,
            });
        }

        /* ─── FIX MAOSH ───────────────────────────────────────

           `salaryType` va `fixedSalary` shifokor formasida ANCHADAN BERI
           tahrirlanardi, lekin hech qayerda O'QILMASDI: fix maoshli
           shifokor vedomostda faqat foizini ko'rardi va oylikni kassir
           qo'lda «Boshqa xarajat» bilan yozardi.

           Qoidalar:
             fixed      — faqat qat'iy summa, foiz yo'q;
             fixed_kpi  — qat'iy summa + foiz;
             kpi, none  — faqat foiz (bugungi xatti-harakat).

           `none` ATAYLAB foiz bo'lib qoladi: u standart qiymat va uni
           «hech narsa» deb talqin qilish ishlab turgan klinikalarning
           vedomostini birdan nolga tushirardi.

           Davr bir oydan qisqa yoki uzun bo'lishi mumkin, shuning uchun
           qat'iy summa KUNLAR bo'yicha taqsimlanadi: davr har bir
           kalendar oyi bilan kesishgan kunlar / o'sha oydagi kunlar
           soni. To'liq oy uchun bu aynan 1 beradi. */
        const monthlyFraction = (fromDay: string, toDay: string): number => {
            const a = new Date(`${fromDay}T00:00:00Z`);
            const b = new Date(`${toDay}T00:00:00Z`);
            if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return 0;
            let total = 0;
            let y = a.getUTCFullYear(), m = a.getUTCMonth();
            while (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth())) {
                const monthStart = Date.UTC(y, m, 1);
                const monthEnd = Date.UTC(y, m + 1, 0);
                const days = new Date(monthEnd).getUTCDate();
                const s = Math.max(monthStart, a.getTime());
                const e = Math.min(monthEnd, b.getTime());
                if (e >= s) total += ((e - s) / 864e5 + 1) / days;
                m++; if (m > 11) { m = 0; y++; }
            }
            return total;
        };
        /* Davr oxiri BUGUNGI kundan narida bo'lolmaydi.

           Aks holda kelasi oyga vedomost ochilsa, fix maoshli shifokorga
           hali ishlanmagan oy uchun pul hisoblanardi — brauzer sinovi
           aynan shuni topdi (kelasi yil tanlanganda ekran «bu davrda
           ulush yo'q» deyish o'rniga ikkita fix qator ko'rsatib turardi).

           To'lov ulushi bunday muammoga duch kelmaydi: to'lov o'tmishda
           bo'ladi, kelajakdagi davrda esa yo'q. */
        const todayStr = tashkentDateStr();
        const fraction = to < todayStr ? monthlyFraction(from, to)
            : from > todayStr ? 0
                : monthlyFraction(from, todayStr);

        for (const doc of doctors) {
            const type = String(doc.salaryType || 'none');
            const fixedMonthly = Number(doc.fixedSalary) || 0;
            if (!(type === 'fixed' || type === 'fixed_kpi') || fixedMonthly <= 0) continue;
            // Ishdan ketgan xodimga oylik hisoblanmaydi
            if (doc.status && doc.status !== 'Active') continue;

            const part = round(fixedMonthly * fraction);

            /* Davr hali boshlanmagan bo'lsa (`fraction` nol) va bu
               shifokorda to'lov ham bo'lmasa — QATOR OCHILMAYDI. Aks
               holda kelasi oyning vedomosti nol summali qatorlar bilan
               to'lib ketardi va ekran «bu davrda ulush yo'q» deyish
               o'rniga bo'sh ro'yxat ko'rsatardi. */
            if (part <= 0 && !byDoctor.has(doc.id)) continue;

            if (!byDoctor.has(doc.id)) {
                byDoctor.set(doc.id, {
                    doctorId: doc.id,
                    staffName: `${doc.lastName} ${doc.firstName}`,
                    paidBase: 0, accrued: 0, refunded: 0, fixed: 0,
                    items: [] as any[],
                });
            }
            const g = byDoctor.get(doc.id);

            /* `fixed` da foiz TO'LANMAYDI — shu paytgacha yig'ilgan
               ulushni bekor qilamiz, lekin qatorlar ko'rinib turadi:
               «nega hisobda yo'q» degan savolga javob kerak. */
            if (type === 'fixed') g.accrued = 0;

            if (part > 0) {
                g.fixed = round((g.fixed || 0) + part);
                g.accrued = round(g.accrued + part);
                g.items.push({
                    name: `Fix maosh (${Math.round(fraction * 100)}% davr)`,
                    paid: 0, percent: 0, basis: 'fix maosh', share: part,
                    source: 'Salary', kind: 'Fixed',
                });
            }
        }

        /* Manfiyga tushib ketgan ulush nolga tenglashtiriladi: qaytarish
           o'tgan oyning to'lovidan ko'p bo'lsa, shifokordan pul talab
           qilish — bu tizimning ishi emas. Raqam ko'rinib turadi. */
        const lines = Array.from(byDoctor.values())
            .map((g: any) => ({ ...g, fixed: g.fixed || 0, accrued: Math.max(0, g.accrued) }))
            .sort((a, b) => b.accrued - a.accrued);

        return {
            lines,
            stats: {
                /** Davr oynasiga tushgan to'lov yozuvlari — hammasi. */
                payments: payments.length,
                skippedNoDoctor, skippedNoDoctorSum, skippedCancelled,
            },
        };
    }

    /** Oldindan ko'rish: vedomost yaratmasdan raqamni ko'rish */
    route('get', '/api/payroll/preview', async (req, res, clinicId) => {
        const from = String(req.query.from || tashkentMonthStart());
        const to = String(req.query.to || tashkentDateStr());
        const { lines, stats } = await computePayroll(clinicId, from, to);

        /* Davr bo'sh bo'lsa — OXIRGI to'lov qachon bo'lganini aytamiz.
           Busiz ekran «ulush yo'q» deb turadi va foydalanuvchi sababini
           topish uchun sanalarni qo'lda paypaslashi kerak bo'ladi. */
        let lastPaymentAt: Date | null = null;
        if (stats.payments === 0) {
            const last = await prisma.chargePayment.findFirst({
                where: { clinicId },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
            });
            lastPaymentAt = last?.createdAt ?? null;
        }

        res.json({
            from, to, lines, stats, lastPaymentAt,
            total: round(lines.reduce((s: number, l: any) => s + l.accrued, 0)),
        });
    });

    route('get', '/api/payroll/runs', async (req, res, clinicId) => {
        res.json(await prisma.payrollRun.findMany({
            where: { clinicId },
            include: { lines: { select: { id: true, accrued: true, paid: true } } },
            orderBy: [{ periodFrom: 'desc' }, { createdAt: 'desc' }],
            take: 100,
        }));
    });

    route('get', '/api/payroll/runs/:id', async (req, res, clinicId) => {
        const run = await prisma.payrollRun.findUnique({
            where: { id: req.params.id },
            include: { lines: { orderBy: { accrued: 'desc' } } },
        });
        if (!run || run.clinicId !== clinicId) return res.status(404).json({ error: 'Vedomost topilmadi' });

        res.json({
            ...run,
            lines: run.lines.map((l: any) => {
                let detail: any = null;
                try { detail = l.detail ? JSON.parse(l.detail) : null; } catch { detail = null; }
                return { ...l, detail };
            }),
        });
    });

    route('post', '/api/payroll/runs', async (req, res, clinicId) => {
        const from = String(req.body?.periodFrom || '').slice(0, 10);
        const to = String(req.body?.periodTo || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return res.status(400).json({ error: "Davr YYYY-MM-DD ko'rinishida bo'lishi kerak" });
        }
        if (to < from) return res.status(400).json({ error: 'Davr oxiri boshidan oldin' });

        /* Bir davrga ikkinchi vedomost — deyarli har doim xato: raqam ikki
           marta to'lanadi. Qayta hisoblash kerak bo'lsa qoralamani o'chirib,
           yangisini yaratish kerak. */
        const dup = await prisma.payrollRun.findFirst({
            where: { clinicId, periodFrom: from, periodTo: to },
        });
        if (dup) {
            return res.status(409).json({
                error: `Bu davr uchun vedomost bor (${dup.status === 'Draft' ? 'qoralama' : 'tasdiqlangan'})`,
                runId: dup.id,
            });
        }

        const { lines } = await computePayroll(clinicId, from, to);
        const user = (req as any).user;

        const run = await prisma.payrollRun.create({
            data: {
                clinicId, periodFrom: from, periodTo: to,
                status: 'Draft',
                createdByName: user?.name || null,
                note: req.body?.note ? String(req.body.note).slice(0, 300) : null,
                lines: {
                    create: lines.map((l: any) => ({
                        doctorId: l.doctorId,
                        staffName: l.staffName,
                        accrued: l.accrued,
                        paid: 0,
                        // Hisob qanday chiqqani — keyin "nega bunday" degan savolga javob
                        detail: JSON.stringify({
                            paidBase: l.paidBase,
                            // Fix qismi alohida: «nega bunday» savoliga javob
                            fixed: l.fixed || 0,
                            items: l.items.slice(0, 200),
                        }),
                    })),
                },
            },
            include: { lines: true },
        });

        res.json(run);
    });

    route('post', '/api/payroll/runs/:id/approve', async (req, res, clinicId) => {
        const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
        if (!run || run.clinicId !== clinicId) return res.status(404).json({ error: 'Vedomost topilmadi' });
        if (run.status !== 'Draft') {
            return res.status(409).json({ error: 'Faqat qoralamani tasdiqlash mumkin' });
        }
        const user = (req as any).user;
        res.json(await prisma.payrollRun.update({
            where: { id: run.id },
            data: { status: 'Approved', approvedByName: user?.name || null, approvedAt: new Date() },
        }));
    });

    /**
     * Qatorni TO'LANGAN deb belgilash: kassadan chiqim yoziladi.
     *
     * Xarajat `DoctorShare` kategoriyasida — ilgari ham shunday yozilardi,
     * ya'ni kassa kitobi va hisobot o'zgarmaydi. Farqi shundaki, endi
     * xarajat vedomost qatoriga BOG'LANGAN va "bu pul nima uchun" savoliga
     * javob bor.
     */
    route('post', '/api/payroll/lines/:id/pay', async (req, res, clinicId) => {
        const line = await prisma.payrollLine.findUnique({
            where: { id: req.params.id },
            include: { run: true },
        });
        if (!line || line.run?.clinicId !== clinicId) return res.status(404).json({ error: 'Qator topilmadi' });
        if (line.run.status === 'Draft') {
            return res.status(409).json({ error: 'Avval vedomostni tasdiqlang' });
        }
        if (line.paid > 0) return res.status(409).json({ error: "Bu qator allaqachon to'langan" });

        const amount = req.body?.amount != null ? round(Number(req.body.amount)) : round(line.accrued);
        if (!(amount > 0)) return res.status(400).json({ error: "Summa noto'g'ri" });
        if (amount > line.accrued + 0.01) {
            return res.status(400).json({ error: `Hisoblangandan ko'p (${line.accrued})` });
        }

        const user = (req as any).user;
        const expense = await prisma.expense.create({
            data: {
                clinicId,
                date: tashkentDateStr(),
                amount,
                category: 'DoctorShare',
                title: `${line.staffName} — ulush (${line.run.periodFrom} .. ${line.run.periodTo})`,
                method: String(req.body?.method || 'Cash'),
                doctorId: line.doctorId || null,
            },
        });

        const updated = await prisma.payrollLine.update({
            where: { id: line.id },
            data: { paid: amount, expenseId: expense.id },
        });

        // Hamma qator to'langan bo'lsa — vedomost ham to'langan
        const rest = await prisma.payrollLine.count({
            where: { runId: line.runId, paid: 0, accrued: { gt: 0 } },
        });
        if (rest === 0) {
            await prisma.payrollRun.update({ where: { id: line.runId }, data: { status: 'Paid' } });
        }

        res.json({ line: updated, expense, runPaid: rest === 0 });
    });

    /* Qoralamani o'chirish. Tasdiqlangan vedomost o'chirilmaydi: u moliyaviy
       hujjat va unga xarajatlar bog'langan bo'lishi mumkin. */
    route('delete', '/api/payroll/runs/:id', async (req, res, clinicId) => {
        const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
        if (!run || run.clinicId !== clinicId) return res.status(404).json({ error: 'Vedomost topilmadi' });
        if (run.status !== 'Draft') {
            return res.status(409).json({ error: "Faqat qoralamani o'chirish mumkin" });
        }
        await prisma.payrollRun.delete({ where: { id: run.id } });
        res.json({ success: true });
    });

    console.log('✅ Ulush va vedomost endpointlari ulandi');
}
