/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — moliyaviy hisobot.

   denta7 dagi hisobot stomatologiya uchun edi: bitta shifokorlar kesimi va
   laboratoriya XARAJAT sifatida (protezni tashqi laboratoriyaga yasatasiz).
   Ko'p profilli klinikada ikkalasi ham noto'g'ri:

   - Asosiy savol "qaysi bo'lim qancha keltirdi" — bo'lim o'lchovi shart.
   - Laboratoriya o'zimizniki, u DAROMAD keltiradi, xarajat emas.

   Daromad `VisitCharge` dan olinadi — bu haqiqiy tushum daftari: kim nima
   buyurdi, qancha, to'landimi. `Transaction` esa kassa harakati bo'lib qoladi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { som } from './money';
import { tashkentDateStr, tashkentMonthStart, tashkentRangeBounds, TASHKENT_OFFSET_MS } from './tashkentTime';
import { financialSnapshot } from './snapshot';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

/* Pul — BUTUN so'm, `money.ts` dagi yagona qoida. Ilgari bu yerda
   o'zining nusxasi turardi va modullar orasida aniqlik farq qilardi. */
const round = som;
const today = () => tashkentDateStr();

const monthStart = () => tashkentMonthStart();

/** `Date` ni Toshkent kunining `YYYY-MM-DD` ko'rinishiga o'giradi */
const toTashkentDay = (d: Date) =>
    new Date(d.getTime() + TASHKENT_OFFSET_MS).toISOString().split('T')[0];

/** Manba turlarining o'zbekcha nomi — hisobot sarlavhalarida ishlatiladi */
const SOURCE_LABELS: Record<string, string> = {
    Service: 'Xizmatlar',
    Lab: 'Laboratoriya',
    Study: 'Diagnostika',
    Medication: 'Dorilar',
    Bed: 'Statsionar',
    Other: 'Boshqa',
};

export function registerReportRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    const route = (method: 'get' | 'post', path: string,
        handler: (req: any, res: any, clinicId: string) => Promise<any>) => {
        (app as any)[method](path, auth, async (req: any, res: any) => {
            try {
                const clinicId = getScopedClinicId(req);
                if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
                await handler(req, res, clinicId);
            } catch (e: any) {
                console.error(`[${method.toUpperCase()} ${path}]`, e.message);
                res.status(500).json({ error: e.message || 'Server xatoligi' });
            }
        });
    };

    /**
     * Asosiy moliyaviy hisobot.
     *
     * Har bir hisob qatori qaysi bo'limga tegishli ekanini qabul orqali topamiz;
     * qabulsiz qatorlar (to'g'ridan-to'g'ri kelgan bemor) "Bo'limsiz" ga tushadi.
     */
    route('get', '/api/reports/summary', async (req, res, clinicId) => {
        const from = String(req.query.from || monthStart());
        const to = String(req.query.to || today());
        const { start: rangeStart, end: rangeEnd } = tashkentRangeBounds(from, to);

        const [charges, expenses, departments, services, recipes, doctors] = await Promise.all([
            prisma.visitCharge.findMany({
                where: {
                    clinicId,
                    status: { not: 'Cancelled' },
                    /* Ilgari shu yerda `new Date(from)` va `new Date(to + 'T23:59:59')`
                       edi. ECMAScript qoidasi bo'yicha birinchisi UTC, ikkinchisi
                       LOKAL vaqt deb o'qiladi — ya'ni bir filtrning ikki chegarasi
                       turli zonalarda o'lchanardi va davr boshidagi 5 soat
                       hisobotga tushmasdi. Endi ikkalasi ham Toshkent kuni. */
                    createdAt: { gte: rangeStart, lte: rangeEnd },
                },
                include: { visit: { select: { departmentId: true, doctorId: true, doctorName: true, date: true } } },
            }),
            prisma.expense.findMany({
                where: { clinicId, date: { gte: from, lte: to } },
            }),
            prisma.department.findMany({ where: { clinicId } }),
            prisma.service.findMany({ where: { clinicId } }),
            prisma.serviceRecipe.findMany({ where: { clinicId }, include: { item: true } }),
            prisma.doctor.findMany({ where: { clinicId } }),
        ]);

        // Xizmat tannarxi retseptdan — material narxlari yig'indisi
        const costByService = new Map<number, number>();
        for (const r of recipes) {
            const prev = costByService.get(r.serviceId) || 0;
            costByService.set(r.serviceId, round(prev + (r.item?.price || 0) * r.quantity));
        }

        // Qator qaysi xizmatga tegishli — nomi bo'yicha topamiz (sourceId muolaja id si)
        const serviceByName = new Map<string, any>();
        for (const s of services) serviceByName.set(s.name, s);

        const deptName = new Map<string, string>();
        for (const d of departments) deptName.set(d.id, d.name);

        // ─── Yig'indilar ────────────────────────────────────────────────────
        let revenue = 0, collected = 0, due = 0, materialCost = 0;

        const byDept = new Map<string, any>();
        const bySource = new Map<string, any>();
        const byDoctor = new Map<string, any>();
        const daily = new Map<string, { date: string; revenue: number; collected: number }>();

        for (const c of charges) {
            const total = c.total || 0;
            const paid = c.paidAmount || 0;
            revenue += total;
            collected += paid;
            due += total - paid;

            // Tannarx — faqat retsepti bor xizmatlarda
            const svc = serviceByName.get(c.name);
            const cost = svc ? (costByService.get(svc.id) || 0) : 0;
            materialCost += cost;

            const dKey = c.visit?.departmentId || 'none';
            if (!byDept.has(dKey)) {
                byDept.set(dKey, {
                    departmentId: dKey === 'none' ? null : dKey,
                    name: dKey === 'none' ? "Bo'limsiz" : (deptName.get(dKey) || "Noma'lum"),
                    revenue: 0, collected: 0, due: 0, cost: 0, count: 0,
                });
            }
            const d = byDept.get(dKey);
            d.revenue += total; d.collected += paid; d.due += total - paid; d.cost += cost; d.count++;

            const sKey = c.source || 'Other';
            if (!bySource.has(sKey)) {
                bySource.set(sKey, { source: sKey, label: SOURCE_LABELS[sKey] || sKey, revenue: 0, count: 0 });
            }
            const s = bySource.get(sKey);
            s.revenue += total; s.count++;

            const docName = c.visit?.doctorName || null;
            if (docName) {
                if (!byDoctor.has(docName)) byDoctor.set(docName, { doctorName: docName, revenue: 0, count: 0 });
                const dr = byDoctor.get(docName);
                dr.revenue += total; dr.count++;
            }

            // Qabul sanasi bo'lmasa — yozuv vaqtini TOSHKENT kuniga o'giramiz,
            // aks holda tunda kiritilgan qator kechagi kunga tushardi
            const day = (c.visit?.date) || toTashkentDay(c.createdAt);
            if (!daily.has(day)) daily.set(day, { date: day, revenue: 0, collected: 0 });
            const dd = daily.get(day)!;
            dd.revenue += total; dd.collected += paid;
        }

        // ─── Xarajatlar ─────────────────────────────────────────────────────
        // DIQQAT: 'Lab' kategoriyasi endi xarajat sifatida HISOBLANMAYDI.
        // denta7 da laboratoriya tashqi pudratchi edi; bu yerda u o'z bo'limimiz
        // va daromad keltiradi. Eski yozuvlar bo'lsa ular alohida ko'rsatiladi.
        let doctorShare = 0, otherExpenses = 0, legacyLabExpense = 0;
        const expenseByCategory = new Map<string, number>();

        for (const e of expenses) {
            const amt = e.amount || 0;
            if (e.category === 'DoctorShare') { doctorShare += amt; continue; }
            if (e.category === 'Lab') { legacyLabExpense += amt; continue; }
            otherExpenses += amt;
            expenseByCategory.set(e.category, round((expenseByCategory.get(e.category) || 0) + amt));
        }

        const grossProfit = round(revenue - materialCost);
        const netProfit = round(grossProfit - doctorShare - otherExpenses);

        const deptList = Array.from(byDept.values()).map(d => ({
            ...d,
            revenue: round(d.revenue), collected: round(d.collected),
            due: round(d.due), cost: round(d.cost),
            margin: round(d.revenue - d.cost),
            marginPercent: d.revenue > 0 ? Math.round(((d.revenue - d.cost) / d.revenue) * 100) : 0,
        })).sort((a, b) => b.revenue - a.revenue);

        /* `due` — DAVR ichida qolgan qarz, `openDebt` — ayni damdagi umumiy
           qarz. Audit ikkalasini bitta «QARZ» yorlig'i ostida ko'rib,
           «raqamlar mos kelmaydi» degan edi. Ular haqiqatan turli narsa;
           endi ikkalasi ham qaytadi va interfeys ularni ajratib yozadi.
           `openDebt` bosh sahifadagi raqam bilan AYNAN bir xil bo'ladi —
           ikkalasi ham `snapshot.ts` dan. */
        const snap = await financialSnapshot(prisma, clinicId, from, to);

        res.json({
            period: { from, to },
            openDebt: snap.debt,
            totals: {
                revenue: round(revenue),
                collected: round(collected),
                due: round(due),
                materialCost: round(materialCost),
                grossProfit,
                doctorShare: round(doctorShare),
                otherExpenses: round(otherExpenses),
                netProfit,
                legacyLabExpense: round(legacyLabExpense),
            },
            byDepartment: deptList,
            bySource: Array.from(bySource.values())
                .map(s => ({ ...s, revenue: round(s.revenue) }))
                .sort((a, b) => b.revenue - a.revenue),
            byDoctor: Array.from(byDoctor.values())
                .map(d => ({ ...d, revenue: round(d.revenue) }))
                .sort((a, b) => b.revenue - a.revenue),
            expenseByCategory: Array.from(expenseByCategory.entries())
                .map(([category, amount]) => ({ category, amount }))
                .sort((a, b) => b.amount - a.amount),
            daily: Array.from(daily.values())
                .map(d => ({ ...d, revenue: round(d.revenue), collected: round(d.collected) }))
                .sort((a, b) => a.date.localeCompare(b.date)),
            doctorCount: doctors.length,
        });
    });

    /** Qarzdorlar — bemor bo'yicha, davrga bog'liq emas */
    route('get', '/api/reports/debtors', async (req, res, clinicId) => {
        const charges = await prisma.visitCharge.findMany({
            where: { clinicId, status: 'Unpaid' },
            include: { visit: { select: { date: true, departmentId: true } } },
            orderBy: { createdAt: 'asc' },
        });

        const byPatient = new Map<string, any>();
        for (const c of charges) {
            const key = c.patientId || `noname:${c.patientName}`;
            if (!byPatient.has(key)) {
                byPatient.set(key, {
                    patientId: c.patientId, patientName: c.patientName,
                    due: 0, count: 0, oldestDate: c.visit?.date || toTashkentDay(c.createdAt),
                });
            }
            const g = byPatient.get(key);
            g.due = round(g.due + (c.total - (c.paidAmount || 0)));
            g.count++;
        }

        const list = Array.from(byPatient.values()).sort((a, b) => b.due - a.due);
        res.json({ total: round(list.reduce((s, g) => s + g.due, 0)), patients: list });
    });

    /* ═══ RELIZ 5: uch hisobot ════════════════════════════════════════════════

       Uchtasi ham bitta savolga javob beradi: PUL QAYERGA KETDI. Hozir
       hisobotda faqat umumiy tushum bor, ya'ni "nima uchun bu oy kam
       chiqdi" degan savolga javob yo'q. */

    /** Faqat klinika egasi ko'radigan hisobotlar */
    const ownerOnly = (req: any, res: any) => {
        const role = (req as any).user?.role;
        if (role !== 'CLINIC_ADMIN') {
            res.status(403).json({ error: "Ruxsat yo'q" });
            return false;
        }
        return true;
    };

    /** `from`/`to` — YYYY-MM-DD; berilmasa shu oy boshidan bugungacha */
    const period = (req: any) => {
        const from = String(req.query.from || monthStart());
        const to = String(req.query.to || today());
        return { from, to };
    };

    const WRITEOFF_REASONS: Record<string, string> = {
        Expired: 'Muddati o\'tgan',
        Damaged: 'Buzilgan',
        Inventory: 'Inventarizatsiya',
        Service: 'Xizmatga ishlatilgan',
        Manual: 'Qo\'lda',
        Purchase: 'Kirim',
    };

    /**
     * CHIQIMLAR: nima behuda ketdi.
     *
     * Nima uchun kerak. Ombor ekranida qoldiq ko'rinadi, lekin "oyda 4 mln
     * so'mlik dori muddati o'tib tashlandi" degan raqam hech qayerda yo'q
     * (GAP-ANALYSIS B71). Bu esa aynan boshqarish qarori chiqadigan raqam.
     *
     * Xizmatga ishlatilgan material ham ko'rsatiladi, lekin ALOHIDA: u
     * behuda ketmagan, u tushum keltirgan.
     */
    route('get', '/api/reports/writeoffs', async (req, res, clinicId) => {
        if (!ownerOnly(req, res)) return;
        const { from, to } = period(req);
        const { start, end } = tashkentRangeBounds(from, to);

        const moves = await prisma.stockMovement.findMany({
            where: {
                clinicId,
                quantity: { lt: 0 },
                createdAt: { gte: start, lte: end },
            },
            include: {
                item: { select: { id: true, name: true, unit: true, price: true } },
                batch: { select: { cost: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const byReason = new Map<string, { reason: string; label: string; qty: number; cost: number; count: number }>();
        const byItem = new Map<string, { itemId: string; name: string; unit: string | null; qty: number; cost: number }>();
        let totalCost = 0, serviceCost = 0, wasteCost = 0;

        for (const m of moves) {
            const qty = Math.abs(m.quantity || 0);
            /* Zarar TANNARXDA hisoblanadi, sotish narxida emas: yo'qolgan
               tovarning qiymati — uni sotib olishga ketgan pul. Partiya
               tannarxi bo'lmasa pozitsiya narxiga tushamiz. */
            const unit = m.batch?.cost ?? m.item?.price ?? 0;
            const cost = round(qty * unit);
            totalCost = round(totalCost + cost);
            if (m.reason === 'Service') serviceCost = round(serviceCost + cost);
            else wasteCost = round(wasteCost + cost);

            const rk = String(m.reason || 'Manual');
            if (!byReason.has(rk)) {
                byReason.set(rk, { reason: rk, label: WRITEOFF_REASONS[rk] || rk, qty: 0, cost: 0, count: 0 });
            }
            const r = byReason.get(rk)!;
            r.qty = round(r.qty + qty); r.cost = round(r.cost + cost); r.count++;

            const ik = m.itemId;
            if (!byItem.has(ik)) {
                byItem.set(ik, { itemId: ik, name: m.item?.name || '—', unit: m.item?.unit || null, qty: 0, cost: 0 });
            }
            const it = byItem.get(ik)!;
            it.qty = round(it.qty + qty); it.cost = round(it.cost + cost);
        }

        res.json({
            from, to,
            totalCost, serviceCost, wasteCost,
            byReason: Array.from(byReason.values()).sort((a, b) => b.cost - a.cost),
            byItem: Array.from(byItem.values()).sort((a, b) => b.cost - a.cost).slice(0, 50),
            movementCount: moves.length,
        });
    });

    /**
     * SHIFOKORLAR: kim qancha keltirdi.
     *
     * Daromad `VisitCharge` dan olinadi va qatorning O'Z shifokoriga yoziladi
     * (`doctorId`, migratsiya 0007). Ilgari to'lov chekka bog'langan edi va
     * bitta chekdagi bir necha shifokorning ishi bittasiga yozilardi (C11).
     *
     * "Hisoblangan ulush" — DoctorServiceRate bo'yicha, stavka yo'q bo'lsa
     * `Doctor.percentage`.
     */
    route('get', '/api/reports/doctors', async (req, res, clinicId) => {
        if (!ownerOnly(req, res)) return;
        const { from, to } = period(req);

        const bounds = tashkentRangeBounds(from, to);
        const [charges, doctors, rates, payments] = await Promise.all([
            prisma.visitCharge.findMany({
                where: {
                    clinicId,
                    status: { not: 'Cancelled' },
                    OR: [
                        { visit: { date: { gte: from, lte: to } } },
                        // Qabulsiz qatorlar (statsionar, to'g'ridan-to'g'ri xizmat)
                        { visitId: null, createdAt: { gte: bounds.start, lte: bounds.end } },
                    ],
                },
                select: {
                    doctorId: true, doctorName: true, serviceId: true, source: true,
                    total: true, paidAmount: true, patientId: true, visitId: true,
                },
            }),
            prisma.doctor.findMany({
                where: { clinicId, status: { not: 'Deleted' } },
                select: { id: true, firstName: true, lastName: true, percentage: true, departmentId: true },
            }),
            prisma.doctorServiceRate.findMany({ where: { clinicId } }),
            /* Hisoblangan ulush AYNAN vedomost bilan bir xil manbadan
               olinadi — `ChargePayment`, ya'ni pul kirgan payt (payroll.ts,
               computePayroll). Ilgari bu yerda `paidAmount` bo'yicha
               hisoblangan edi va ikki ekranda IKKI XIL raqam chiqishi
               mumkin edi: qisman to'lov va boshqa oyda to'langan qarz
               ikkisida boshqacha tushardi. */
            prisma.chargePayment.findMany({
                where: { clinicId, createdAt: { gte: bounds.start, lte: bounds.end } },
                include: {
                    charge: {
                        select: {
                            doctorId: true, serviceId: true, status: true,
                            visit: { select: { departmentId: true } },
                        },
                    },
                },
            }),
        ]);

        /* Stavkani tanlash tartibi ATAYLAB shunday: aniqroq stavka
           umumiyroqni yengadi. Xizmat > bo'lim > shifokorning umumiy foizi. */
        const rateFor = (doctorId: string, serviceId: number | null, departmentId: string | null, role = 'Doctor') => {
            const mine = rates.filter((r: any) => r.doctorId === doctorId && r.role === role);
            const byService = serviceId != null ? mine.find((r: any) => r.serviceId === serviceId) : null;
            if (byService) return { percent: byService.percent, from: 'service' };
            const byDept = departmentId ? mine.find((r: any) => r.serviceId == null && r.departmentId === departmentId) : null;
            if (byDept) return { percent: byDept.percent, from: 'department' };
            const general = mine.find((r: any) => r.serviceId == null && r.departmentId == null);
            if (general) return { percent: general.percent, from: 'general' };
            const doc = doctors.find((d: any) => d.id === doctorId);
            return { percent: doc?.percentage ?? 0, from: 'doctor' };
        };

        const rows = new Map<string, any>();
        const UNASSIGNED = 'unassigned';

        for (const c of charges) {
            const key = c.doctorId || UNASSIGNED;
            if (!rows.has(key)) {
                const doc = doctors.find((d: any) => d.id === c.doctorId);
                rows.set(key, {
                    doctorId: c.doctorId || null,
                    name: doc ? `${doc.lastName} ${doc.firstName}` : (c.doctorName || 'Belgilanmagan'),
                    departmentId: doc?.departmentId || null,
                    revenue: 0, paid: 0, due: 0, accrued: 0,
                    chargeCount: 0, patients: new Set<string>(),
                    bySource: {} as Record<string, number>,
                });
            }
            const r = rows.get(key);
            const paid = round(c.paidAmount || 0);
            r.revenue = round(r.revenue + c.total);
            r.paid = round(r.paid + paid);
            r.due = round(r.due + (c.total - paid));
            r.chargeCount++;
            if (c.patientId) r.patients.add(c.patientId);
            r.bySource[c.source] = round((r.bySource[c.source] || 0) + c.total);

        }

        /* Ulush — to'lovlar bo'yicha. Qaytarish manfiy summa bilan yotadi,
           ya'ni ulush o'zi kamayadi. */
        for (const p of payments) {
            const c = p.charge;
            if (!c?.doctorId || c.status === 'Cancelled') continue;
            if (!rows.has(c.doctorId)) {
                const doc = doctors.find((d: any) => d.id === c.doctorId);
                rows.set(c.doctorId, {
                    doctorId: c.doctorId,
                    name: doc ? `${doc.lastName} ${doc.firstName}` : 'Belgilanmagan',
                    departmentId: doc?.departmentId || null,
                    revenue: 0, paid: 0, due: 0, accrued: 0,
                    chargeCount: 0, patients: new Set<string>(),
                    bySource: {} as Record<string, number>,
                });
            }
            const r = rows.get(c.doctorId);
            const doc = doctors.find((d: any) => d.id === c.doctorId);
            const { percent } = rateFor(
                c.doctorId, c.serviceId ?? null,
                c.visit?.departmentId || doc?.departmentId || null,
            );
            r.accrued = round(r.accrued + (p.amount || 0) * (percent / 100));
        }
        // Manfiy ulush ko'rsatilmaydi — payroll bilan bir xil qoida
        for (const r of rows.values()) r.accrued = Math.max(0, round(r.accrued));

        const list = Array.from(rows.values())
            .map((r: any) => ({
                ...r,
                patientCount: r.patients.size,
                avgCheck: r.chargeCount > 0 ? round(r.revenue / r.chargeCount) : 0,
                patients: undefined,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        res.json({
            from, to,
            totals: {
                revenue: round(list.reduce((s, r) => s + r.revenue, 0)),
                paid: round(list.reduce((s, r) => s + r.paid, 0)),
                due: round(list.reduce((s, r) => s + r.due, 0)),
                accrued: round(list.reduce((s, r) => s + r.accrued, 0)),
            },
            doctors: list,
        });
    });

    /**
     * BO'LIMLAR: daromad, xarajat, foyda, koyka bandligi.
     *
     * Xarajat `Expense.departmentId` dan olinadi (migratsiya 0022). Bo'limsiz
     * xarajatlar ALOHIDA qatorda: ularni bo'limlarga taqsimlash — soxta
     * aniqlik, chunki taqsimlash qoidasini klinika o'zi belgilaydi.
     */
    route('get', '/api/reports/departments', async (req, res, clinicId) => {
        if (!ownerOnly(req, res)) return;
        const { from, to } = period(req);
        const { start, end } = tashkentRangeBounds(from, to);

        const [charges, expenses, departments, beds, admissions] = await Promise.all([
            prisma.visitCharge.findMany({
                where: {
                    clinicId,
                    status: { not: 'Cancelled' },
                    OR: [
                        { visit: { date: { gte: from, lte: to } } },
                        { visitId: null, createdAt: { gte: start, lte: end } },
                    ],
                },
                select: {
                    total: true, paidAmount: true, source: true,
                    visit: { select: { departmentId: true } },
                    admission: { select: { departmentId: true } },
                },
            }),
            prisma.expense.findMany({
                where: { clinicId, date: { gte: from, lte: to } },
                select: { amount: true, departmentId: true, category: true },
            }),
            prisma.department.findMany({
                where: { clinicId },
                select: { id: true, name: true, type: true, color: true, isActive: true },
            }),
            prisma.bed.count({ where: { ward: { clinicId } } }),
            prisma.admission.findMany({
                where: {
                    clinicId,
                    admittedAt: { lte: end },
                    OR: [{ dischargedAt: null }, { dischargedAt: { gte: start } }],
                },
                select: { departmentId: true, admittedAt: true, dischargedAt: true },
            }),
        ]);

        const rows = new Map<string, any>();
        const NONE = 'none';
        const ensure = (id: string | null) => {
            const key = id || NONE;
            if (!rows.has(key)) {
                const d = departments.find((x: any) => x.id === id);
                rows.set(key, {
                    departmentId: id, name: d?.name || "Bo'limsiz",
                    type: d?.type || null, color: d?.color || null,
                    revenue: 0, paid: 0, expense: 0, profit: 0, bedDays: 0,
                });
            }
            return rows.get(key);
        };

        for (const c of charges) {
            // Statsionar qatorlari yotish bo'limiga, qolganlari qabul bo'limiga
            const dep = c.admission?.departmentId || c.visit?.departmentId || null;
            const r = ensure(dep);
            r.revenue = round(r.revenue + c.total);
            r.paid = round(r.paid + (c.paidAmount || 0));
        }
        for (const e of expenses) {
            const r = ensure(e.departmentId || null);
            r.expense = round(r.expense + (e.amount || 0));
        }

        // Koyka-kunlar: davr ichida yotgan kunlar soni
        for (const a of admissions) {
            const s = Math.max(new Date(a.admittedAt).getTime(), start.getTime());
            const e = Math.min(a.dischargedAt ? new Date(a.dischargedAt).getTime() : end.getTime(), end.getTime());
            if (e < s) continue;
            const days = Math.max(1, Math.ceil((e - s) / 864e5));
            ensure(a.departmentId || null).bedDays += days;
        }

        for (const r of rows.values()) r.profit = round(r.revenue - r.expense);

        // Davrdagi kunlar soni — bandlikni foizda ko'rsatish uchun
        const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 864e5));
        const totalBedDays = Array.from(rows.values()).reduce((s, r) => s + r.bedDays, 0);

        res.json({
            from, to,
            totals: {
                revenue: round(Array.from(rows.values()).reduce((s, r) => s + r.revenue, 0)),
                paid: round(Array.from(rows.values()).reduce((s, r) => s + r.paid, 0)),
                expense: round(Array.from(rows.values()).reduce((s, r) => s + r.expense, 0)),
                profit: round(Array.from(rows.values()).reduce((s, r) => s + r.profit, 0)),
                bedDays: totalBedDays,
                bedCount: beds,
                /* Bandlik = yotilgan kunlar / (koyka soni × davr kunlari).
                   Koyka bo'lmasa foiz ham yo'q — nolga bo'lishdan himoya. */
                occupancy: beds > 0 ? round((totalBedDays / (beds * periodDays)) * 100) : null,
            },
            departments: Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue),
        });
    });

    /**
     * DAVRLARNI SOLISHTIRISH.
     *
     * Nima uchun. Hisobot bitta davrni ko'rsatadi: "shu oy 40 mln". Bu raqam
     * O'ZI hech narsa aytmaydi — ko'pmi yoki kammi? Javob faqat oldingi davr
     * bilan yonma-yon turganda paydo bo'ladi (GAP-ANALYSIS, 5-sahna, 7-band).
     *
     * Oldingi davr — SHU UZUNLIKDAGI oldingi oraliq, "o'tgan oy" emas:
     * foydalanuvchi 10 kunlik davrni tanlasa, oldingi 10 kun bilan
     * solishtiriladi. Aks holda 10 kun 30 kun bilan taqqoslanib, "tushum
     * uch marta kamaydi" degan bema'nilik chiqadi.
     *
     * Alohida endpoint: to'liq hisobot og'ir (retseptlar, tannarx), va uni
     * har safar ikki marta hisoblash kerak emas.
     */
    route('get', '/api/reports/compare', async (req, res, clinicId) => {
        if (!ownerOnly(req, res)) return;
        const { from, to } = period(req);

        /* Davr uzunligi KUNLARDA, ikkala chegara ham kiradi */
        const dayMs = 864e5;
        const fromT = new Date(`${from}T00:00:00.000Z`).getTime();
        const toT = new Date(`${to}T00:00:00.000Z`).getTime();
        if (!isFinite(fromT) || !isFinite(toT) || toT < fromT) {
            return res.status(400).json({ error: "Davr noto'g'ri" });
        }
        const days = Math.round((toT - fromT) / dayMs) + 1;
        const prevTo = new Date(fromT - dayMs).toISOString().slice(0, 10);
        const prevFrom = new Date(fromT - days * dayMs).toISOString().slice(0, 10);

        /** Bitta davrning asosiy raqamlari */
        const measure = async (a: string, b: string) => {
            const { start, end } = tashkentRangeBounds(a, b);
            const [charges, expenses, payments, visits] = await Promise.all([
                prisma.visitCharge.findMany({
                    where: {
                        clinicId,
                        status: { not: 'Cancelled' },
                        OR: [
                            { visit: { date: { gte: a, lte: b } } },
                            { visitId: null, createdAt: { gte: start, lte: end } },
                        ],
                    },
                    select: { total: true, paidAmount: true, patientId: true },
                }),
                prisma.expense.findMany({
                    where: { clinicId, date: { gte: a, lte: b } },
                    select: { amount: true },
                }),
                prisma.chargePayment.findMany({
                    where: { clinicId, createdAt: { gte: start, lte: end } },
                    select: { amount: true },
                }),
                prisma.visit.count({ where: { clinicId, date: { gte: a, lte: b } } }),
            ]);

            const revenue = round(charges.reduce((s: number, c: any) => s + c.total, 0));
            const collected = round(payments.reduce((s: number, p: any) => s + (p.amount || 0), 0));
            const expense = round(expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0));
            const patients = new Set(charges.map((c: any) => c.patientId).filter(Boolean)).size;

            return {
                from: a, to: b, days,
                revenue,
                collected,
                due: round(revenue - charges.reduce((s: number, c: any) => s + (c.paidAmount || 0), 0)),
                expense,
                profit: round(collected - expense),
                visits,
                patients,
                avgCheck: charges.length > 0 ? round(revenue / charges.length) : 0,
            };
        };

        const [current, previous] = await Promise.all([
            measure(from, to),
            measure(prevFrom, prevTo),
        ]);

        /* Foiz o'zgarish. Oldingi davr NOL bo'lsa foiz yo'q: "cheksiz o'sish"
           degan raqam ma'nosiz, ekranda "yangi" deb ko'rsatiladi. */
        const pct = (now: number, before: number) =>
            before > 0 ? round(((now - before) / before) * 100) : null;

        const keys = ['revenue', 'collected', 'due', 'expense', 'profit', 'visits', 'patients', 'avgCheck'] as const;
        const delta: Record<string, { abs: number; pct: number | null }> = {};
        for (const k of keys) {
            delta[k] = {
                abs: round((current as any)[k] - (previous as any)[k]),
                pct: pct((current as any)[k], (previous as any)[k]),
            };
        }

        res.json({ current, previous, delta });
    });

    /**
     * SMENA SVODI: laboratoriya va diagnostika.
     *
     * Nima uchun. Kun oxirida kassa yopiladi, lekin laboratoriya bo'yicha
     * hech qanday svod yo'q: necha proba olindi, nechtasi bajarildi, nechtasi
     * to'lanmagan (GAP-ANALYSIS, 4-sahna, 9 va 10-bandlar). Laborantning
     * kunlik ishi hech qayerda ko'rinmaydi.
     *
     * BRAK VA QAYTA BAJARISH bu yerda YO'Q va o'ylab topilmadi: sxemada
     * bunday tushuncha umuman yo'q. Uni qo'shish — alohida qaror (probani
     * bekor qilish sababi kerak), va soxta raqam ko'rsatishdan ko'ra
     * yo'qligini aytgan ma'qul.
     */
    route('get', '/api/reports/lab-shift', async (req, res, clinicId) => {
        if (!ownerOnly(req, res)) return;
        const date = String(req.query.date || today());
        const { start, end } = tashkentRangeBounds(date, date);

        const [orders, studies] = await Promise.all([
            prisma.labOrder.findMany({
                where: { clinicId, orderedAt: { gte: start, lte: end } },
                select: {
                    id: true, status: true, totalPrice: true, priority: true,
                    orderedAt: true, sampleCollectedAt: true, completedAt: true,
                    technicianName: true,
                },
            }),
            prisma.diagnosticStudy.findMany({
                where: { clinicId, orderedAt: { gte: start, lte: end } },
                select: { id: true, status: true, price: true, modality: true, performedByName: true },
            }),
        ]);

        /* To'lov holati hisob qatorlaridan olinadi — pul bitta joyda turadi */
        const ids = orders.map((o: any) => o.id);
        const studyIds = studies.map((s: any) => s.id);
        const charges = (ids.length + studyIds.length) > 0
            ? await prisma.visitCharge.findMany({
                where: {
                    clinicId,
                    OR: [
                        { source: 'Lab', sourceId: { in: ids } },
                        { source: 'Study', sourceId: { in: studyIds } },
                    ],
                    status: { not: 'Cancelled' },
                },
                select: { source: true, sourceId: true, total: true, paidAmount: true, status: true },
            })
            : [];

        const dueOf = (src: string, idList: string[]) => {
            const rows = charges.filter((c: any) => c.source === src && idList.includes(String(c.sourceId)));
            const unpaid = rows.filter((c: any) => c.status !== 'Paid');
            return {
                unpaidCount: unpaid.length,
                unpaidSum: round(unpaid.reduce((s: number, c: any) => s + (c.total - (c.paidAmount || 0)), 0)),
            };
        };

        const countBy = (rows: any[], field = 'status') => {
            const m: Record<string, number> = {};
            for (const r of rows) m[String(r[field])] = (m[String(r[field])] || 0) + 1;
            return m;
        };

        /* Bajarish vaqti: proba olishdan natijagacha. Laborantning tezligi —
           "kechikdi" degan shikoyatga javob beradigan yagona raqam. */
        const done = orders.filter((o: any) => o.status === 'Completed' && o.completedAt);
        const turnarounds = done
            .map((o: any) => {
                const from = o.sampleCollectedAt || o.orderedAt;
                return (new Date(o.completedAt).getTime() - new Date(from).getTime()) / 3600e3;
            })
            .filter((h: number) => isFinite(h) && h >= 0);
        const avgHours = turnarounds.length > 0
            ? round(turnarounds.reduce((a: number, b: number) => a + b, 0) / turnarounds.length)
            : null;

        res.json({
            date,
            lab: {
                total: orders.length,
                byStatus: countBy(orders),
                collected: orders.filter((o: any) => o.sampleCollectedAt).length,
                // Proba olinmagan — bemor kelmagan yoki unutilgan
                notCollected: orders.filter((o: any) => !o.sampleCollectedAt && o.status !== 'Cancelled').length,
                urgent: orders.filter((o: any) => o.priority === 'Urgent').length,
                revenue: round(orders.reduce((s: number, o: any) => s + (o.totalPrice || 0), 0)),
                avgTurnaroundHours: avgHours,
                byTechnician: countBy(orders.filter((o: any) => o.technicianName), 'technicianName'),
                ...dueOf('Lab', ids),
            },
            studies: {
                total: studies.length,
                byStatus: countBy(studies),
                byModality: countBy(studies, 'modality'),
                revenue: round(studies.reduce((s: number, x: any) => s + (x.price || 0), 0)),
                ...dueOf('Study', studyIds),
            },
            /* Ekranda aytiladi: brak hisobga olinmaydi, chunki sxemada yo'q */
            notTracked: ['brak', 'qayta bajarish'],
        });
    });


    /* ─── BOSH SAHIFA RAQAMLARI (FIX-PLAN 10.4) ───────────────────────────
       Ilgari bu raqamlarni brauzer sanardi — buning uchun unga BUTUN
       tranzaksiyalar va bemorlar ro'yxati kerak edi (o'lchov: 41 MB).

       Endi server sanaydi va bir necha yuz bayt qaytaradi. Bu 10.3 bilan
       BIRGA ketishi shart edi: ekranlarga to'liq ro'yxat berilmay qo'yilsa,
       brauzerdagi hisob avtomatik yolg'on bo'lardi. */
    /* YAGONA MANBA (S2.1).

       Bosh sahifa, Bemorlar KPI kartalari, Kassa va Hisobot — to'rttasi ham
       shu endpointdan o'qiydi. Ilgari har biri o'zi sanardi va natijada
       bitta qarz to'rt xil raqam bo'lib chiqardi (0 / 0 / 0 / 11 501 043).

       Yangi ko'rsatkich qo'shilsa u ham `snapshot.ts` ga qo'shiladi —
       ekranda sanalgan har qanday son jimgina yolg'on. */
    route('get', '/api/reports/snapshot', async (req, res, clinicId) => {
        const from = req.query.from ? String(req.query.from) : undefined;
        const to = req.query.to ? String(req.query.to) : undefined;
        res.json(await financialSnapshot(prisma, clinicId, from, to));
    });

    /* Eski manzil. Bosh sahifaning avvalgi javob SHAKLI saqlanadi, lekin
       raqamlar endi `snapshot.ts` dan keladi — ya'ni ikki ekran o'rtasidagi
       farq mumkin emas. */
    route('get', '/api/reports/dashboard', async (req, res, clinicId) => {
        const today = tashkentDateStr();
        const monthStart = today.slice(0, 8) + '01';

        /* Bemor sanog'i va qarz `snapshot.ts` dan keladi — bu yerda qayta
           sanalmaydi. Faqat BUGUNGI kassa harakati shu yerda qoladi: u
           `Transaction` dan o'qiladi (haqiqiy pul kirimi), snapshot esa
           `VisitCharge` dan (buyurilgan xizmat). Ikkisi turli savolga
           javob beradi va ataylab ajratilgan. */
        const [todayAppointments, todayVisits, todayPaid, monthPaid, snap] = await Promise.all([
            prisma.appointment.count({ where: { clinicId, date: today } }),
            prisma.visit.count({ where: { clinicId, date: today } }),
            prisma.transaction.aggregate({
                where: { clinicId, status: 'Paid', date: today, type: { not: 'Refund' } },
                _sum: { amount: true }, _count: { _all: true },
            }),
            prisma.transaction.aggregate({
                where: { clinicId, status: 'Paid', date: { gte: monthStart }, type: { not: 'Refund' } },
                _sum: { amount: true },
            }),
            financialSnapshot(prisma, clinicId, monthStart, today),
        ]);

        res.json({
            date: today,
            patients: {
                total: snap.patients.total,
                active: snap.patients.active,
                newLast7Days: snap.patients.newLast7Days,
            },
            today: {
                appointments: todayAppointments,
                visits: todayVisits,
                revenue: round(todayPaid._sum.amount || 0),
                payments: todayPaid._count._all,
            },
            month: { revenue: round(monthPaid._sum.amount || 0) },
            debt: snap.debt,
            period: snap.period,
        });
    });

    /* ─────────────────────────────────────────────────────────────────
       DAVOMAT VA KUNLAR HISOBOTI.

       Bu savolga javob beradi: «qaysi kunlarda mijoz yaxshi kelyapti?»
       Klinika uchun bu jadval tuzishning asosi — kam keladigan kunga
       ko'p shifokor qo'yish ham, gavjum kunga kam qo'yish ham zarar.

       Ilgari kalendar bo'yicha hech qanday statistika yig'ilmasdi:
       `/api/reports/dashboard` faqat BUGUNGI yozuvlar sonini berardi,
       tarix bo'yicha kesim umuman yo'q edi.

       Uch kesim beriladi:
         · hafta kuni — dushanbadan yakshanbagacha, kuniga o'rtacha
         · kun        — kunma-kun qator (grafik uchun)
         · soat       — kunning qaysi soatida gavjum

       KELDI / KELMADI — `Appointment.status` bo'yicha:
         Completed, Checked-In → keldi
         No-Show               → kelmadi
         Cancelled             → bekor qilingan; kelmaganga QO'SHILMAYDI,
                                 chunki oldindan ogohlantirgan bemor bilan
                                 shunchaki kelmagani bir xil emas
       Qolganlari (Pending, Confirmed) — hali hal bo'lmagan.

       TUSHUM tashrifning SANASIGA bog'lanadi (`visit.date`), yozuv
       yaratilgan vaqtga emas: kechqurun kiritilgan qator aks holda
       keyingi kunga tushib ketardi va kunlar kesimi buzilardi. */
    route('get', '/api/reports/attendance', async (req, res, clinicId) => {
        const from = String(req.query.from || monthStart());
        const to = String(req.query.to || today());

        const [appts, charges, visits] = await Promise.all([
            prisma.appointment.findMany({
                where: { clinicId, date: { gte: from, lte: to } },
                select: { date: true, time: true, status: true, doctorId: true, doctorName: true },
            }),
            prisma.visitCharge.findMany({
                where: { clinicId, status: { not: 'Cancelled' } },
                select: { total: true, visit: { select: { date: true } } },
            }),
            prisma.visit.findMany({
                where: { clinicId, date: { gte: from, lte: to } },
                select: { date: true },
            }),
        ]);

        const ARRIVED = new Set(['Completed', 'Checked-In']);

        type Cell = { booked: number; arrived: number; noShow: number; cancelled: number; revenue: number; visits: number };
        const cell = (): Cell => ({ booked: 0, arrived: 0, noShow: 0, cancelled: 0, revenue: 0, visits: 0 });

        const byDay: Record<string, Cell> = {};
        const dayOf = (d: string): Cell => {
            if (!byDay[d]) byDay[d] = cell();
            return byDay[d];
        };

        for (const a of appts) {
            const c = dayOf(a.date);
            c.booked++;
            if (ARRIVED.has(a.status)) c.arrived++;
            else if (a.status === 'No-Show') c.noShow++;
            else if (a.status === 'Cancelled') c.cancelled++;
        }
        for (const v of visits) dayOf(v.date).visits++;
        for (const ch of charges) {
            const d = ch.visit ? ch.visit.date : null;
            if (!d || d < from || d > to) continue;
            dayOf(d).revenue += ch.total || 0;
        }

        /* Hafta kuni. `new Date('2026-08-29T00:00:00Z')` — ATAYLAB UTC:
           sof `new Date('2026-08-29')` lokal zonada o'qilsa kun bir
           kunga surilib ketishi mumkin va butun kesim siljiydi. */
        const WD = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
        type WCell = Cell & { days: Set<string> };
        const wd: Record<number, WCell> = {};
        for (const date of Object.keys(byDay)) {
            const c = byDay[date];
            const k = new Date(date + 'T00:00:00Z').getUTCDay();
            if (!wd[k]) wd[k] = Object.assign(cell(), { days: new Set<string>() });
            const w = wd[k];
            w.booked += c.booked; w.arrived += c.arrived; w.noShow += c.noShow;
            w.cancelled += c.cancelled; w.revenue += c.revenue; w.visits += c.visits;
            w.days.add(date);
        }
        /* Dushanbadan boshlanadi — O'zbekistonda ish haftasi shunday. */
        const order = [1, 2, 3, 4, 5, 6, 0];
        const byWeekday = order.map(k => {
            const w = wd[k];
            const days = w ? w.days.size : 0;
            return {
                weekday: k,
                name: WD[k],
                days,
                booked: w ? w.booked : 0,
                arrived: w ? w.arrived : 0,
                noShow: w ? w.noShow : 0,
                cancelled: w ? w.cancelled : 0,
                visits: w ? w.visits : 0,
                revenue: round(w ? w.revenue : 0),
                avgVisits: days ? Math.round((w.visits / days) * 10) / 10 : 0,
                avgRevenue: days ? round(w.revenue / days) : 0,
            };
        });

        const hours: Record<number, { booked: number; arrived: number }> = {};
        for (const a of appts) {
            const h = Number(String(a.time).split(':')[0]);
            if (isNaN(h)) continue;
            if (!hours[h]) hours[h] = { booked: 0, arrived: 0 };
            hours[h].booked++;
            if (ARRIVED.has(a.status)) hours[h].arrived++;
        }
        const byHour: { hour: number; booked: number; arrived: number }[] = [];
        for (let h = 7; h <= 20; h++) {
            byHour.push({ hour: h, booked: hours[h] ? hours[h].booked : 0, arrived: hours[h] ? hours[h].arrived : 0 });
        }

        const docs: Record<string, { doctorId: string; doctorName: string; booked: number; arrived: number; noShow: number }> = {};
        for (const a of appts) {
            if (!docs[a.doctorId]) docs[a.doctorId] = { doctorId: a.doctorId, doctorName: a.doctorName, booked: 0, arrived: 0, noShow: 0 };
            const d = docs[a.doctorId];
            d.booked++;
            if (ARRIVED.has(a.status)) d.arrived++;
            else if (a.status === 'No-Show') d.noShow++;
        }
        const byDoctor = Object.keys(docs).map(k => docs[k])
            .map(d => ({ ...d, noShowRate: d.booked ? Math.round((d.noShow / d.booked) * 1000) / 10 : 0 }))
            .sort((a, b) => b.booked - a.booked);

        const tot = { booked: 0, arrived: 0, noShow: 0, cancelled: 0, revenue: 0, visits: 0 };
        for (const k of Object.keys(byDay)) {
            const c = byDay[k];
            tot.booked += c.booked; tot.arrived += c.arrived; tot.noShow += c.noShow;
            tot.cancelled += c.cancelled; tot.revenue += c.revenue; tot.visits += c.visits;
        }

        /* Eng gavjum va eng bo'sh kun hisobotning birinchi qatorida
           turadi — qaror aynan shu ikkitasidan boshlanadi. */
        const ranked = byWeekday.filter(w => w.days > 0).sort((a, b) => b.avgVisits - a.avgVisits);

        res.json({
            range: { from, to, days: Object.keys(byDay).length },
            totals: {
                booked: tot.booked,
                arrived: tot.arrived,
                noShow: tot.noShow,
                cancelled: tot.cancelled,
                visits: tot.visits,
                revenue: round(tot.revenue),
                arrivalRate: tot.booked ? Math.round((tot.arrived / tot.booked) * 1000) / 10 : 0,
                noShowRate: tot.booked ? Math.round((tot.noShow / tot.booked) * 1000) / 10 : 0,
            },
            best: ranked.length ? ranked[0] : null,
            worst: ranked.length > 1 ? ranked[ranked.length - 1] : null,
            byWeekday,
            byDay: Object.keys(byDay).map(date => {
                const c = byDay[date];
                return { date, ...c, revenue: round(c.revenue) };
            }).sort((a, b) => a.date.localeCompare(b.date)),
            byHour,
            byDoctor,
        });
    });

    console.log('✅ Hisobot endpointlari ulandi');
}
