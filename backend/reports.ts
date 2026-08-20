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
import { tashkentDateStr, tashkentMonthStart, tashkentRangeBounds, TASHKENT_OFFSET_MS } from './tashkentTime';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;
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

        res.json({
            period: { from, to },
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
        if (role !== 'CLINIC_ADMIN' && role !== 'SUPER_ADMIN') {
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

    console.log('✅ Hisobot endpointlari ulandi');
}
