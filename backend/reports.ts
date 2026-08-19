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

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toISOString().split('T')[0];

const monthStart = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

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

        const [charges, expenses, departments, services, recipes, doctors] = await Promise.all([
            prisma.visitCharge.findMany({
                where: {
                    clinicId,
                    status: { not: 'Cancelled' },
                    createdAt: { gte: new Date(from), lte: new Date(to + 'T23:59:59') },
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

            const day = (c.visit?.date) || c.createdAt.toISOString().split('T')[0];
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
                    due: 0, count: 0, oldestDate: c.visit?.date || c.createdAt.toISOString().split('T')[0],
                });
            }
            const g = byPatient.get(key);
            g.due = round(g.due + (c.total - (c.paidAmount || 0)));
            g.count++;
        }

        const list = Array.from(byPatient.values()).sort((a, b) => b.due - a.due);
        res.json({ total: round(list.reduce((s, g) => s + g.due, 0)), patients: list });
    });

    console.log('✅ Hisobot endpointlari ulandi');
}
