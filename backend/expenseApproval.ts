/* ─────────────────────────────────────────────────────────────────────────────
   XARAJATNI TASDIQLASH VA BO'LIM BYUDJETI (2026-11-26, migratsiya 0048).

   QOIDA. Ega chegara qo'ysa (masalan 1 000 000), undan KATTA xarajatni egadan
   boshqa xodim yozganda u «Pending» bo'ladi:
     · kassadan pul chiqmaydi, hisobotga tushmaydi (`BOOKED_EXPENSE`);
     · ega «Tasdiqlash» bosganda — BUGUNGI xarajat bo'ladi (pul shu kuni
       yashikdan chiqadi; yopilgan kunning hisobi orqaga o'zgarmaydi);
     · «Rad etish» — yozuv qoladi, so'ragan odam javobni ko'radi.
   Kichik xarajat, egasi yozgani va avtomatik xarajatlar (oylik, ulush,
   ombor) — avvalgidek darhol. Chegara yo'q (dastlab) — hech narsa o'zgarmaydi.

   BYUDJET. Bo'limning oylik byudjeti; «sarflandi» — Hisobot → Bo'limlar bilan
   bitta funksiya (`reports.ts`, departmentExpenseTotals). Byudjet yo'q — blok
   ko'rinmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import { som } from './money';

const TASHKENT_OFFSET_MS = 5 * 3600 * 1000;
const todayTashkent = () => new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
const MAX_BUDGET = 1e12;

/** Bu xarajat egaga borishi kerakmi: ega emas, chegara bor va summa undan katta */
export async function needsApproval(prisma: any, clinicId: string, actor: any, amount: number): Promise<boolean> {
    if (!actor || actor.role === 'CLINIC_ADMIN' || !(amount > 0)) return false;
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { expenseApprovalThreshold: true } });
    const limit = Number(clinic?.expenseApprovalThreshold || 0);
    return limit > 0 && amount > limit;
}

/** Bo'sh — null (o'chiq / byudjet yo'q); aks holda 0 dan katta butun so'm */
function moneyOrNull(v: unknown): number | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || String(v).trim() === '') return null;
    const n = som(Number(String(v).replace(/\s/g, '')));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.min(n, MAX_BUDGET);
}

export function registerExpenseApprovalRoutes(app: any, deps: { prisma: any; authenticateToken: any; getScopedClinicId: (req: any) => string | null }) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    const decide = (status: 'Approved' | 'Rejected') => async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            if (req.user?.role !== 'CLINIC_ADMIN') return res.status(403).json({ error: 'Faqat klinika egasi' });
            const exp = await prisma.expense.findUnique({ where: { id: String(req.params.id) } });
            if (!exp || exp.clinicId !== clinicId) return res.status(404).json({ error: 'Xarajat topilmadi' });
            if (exp.status !== 'Pending') return res.status(409).json({ error: 'Bu xarajat tasdiq kutmayapti', code: 'NOT_PENDING' });
            /* Faqat hali kutayotgan bo'lsa — ikki marta bosish ikki qaror bermaydi */
            const r = await prisma.expense.updateMany({
                where: { id: exp.id, status: 'Pending' },
                data: {
                    status,
                    decidedByName: req.user?.name || null,
                    decidedAt: new Date(),
                    /* Tasdiqlangan pul BUGUN chiqadi — kassa kuni shu */
                    ...(status === 'Approved' ? { date: todayTashkent() } : {}),
                },
            });
            if (r.count !== 1) return res.status(409).json({ error: 'Bu xarajat tasdiq kutmayapti', code: 'NOT_PENDING' });
            res.json(await prisma.expense.findUnique({ where: { id: exp.id } }));
        } catch (e: any) {
            console.error('[expense decide]', e?.message || e);
            res.status(500).json({ error: "Qarorni saqlab bo'lmadi" });
        }
    };
    app.post('/api/expenses/:id/approve', auth, decide('Approved'));
    app.post('/api/expenses/:id/reject', auth, decide('Rejected'));

    /** Chegara va bo'lim byudjetlari — faqat ega */
    app.put('/api/clinics/:id/expense-settings', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId || clinicId !== req.params.id) return res.status(403).json({ error: "Ruxsat yo'q (boshqa klinika)" });
            if (req.user?.role !== 'CLINIC_ADMIN') return res.status(403).json({ error: 'Faqat klinika egasi' });
            const b = req.body || {};
            const threshold = moneyOrNull(b.expenseApprovalThreshold);
            if (threshold !== undefined) {
                await prisma.clinic.update({ where: { id: clinicId }, data: { expenseApprovalThreshold: threshold } });
            }
            if (Array.isArray(b.budgets)) {
                for (const row of b.budgets.slice(0, 200)) {
                    const budget = moneyOrNull(row?.monthlyBudget);
                    if (budget === undefined || !row?.departmentId) continue;
                    await prisma.department.updateMany({
                        where: { id: String(row.departmentId), clinicId },
                        data: { monthlyBudget: budget },
                    });
                }
            }
            const [clinic, departments] = await Promise.all([
                prisma.clinic.findUnique({ where: { id: clinicId }, select: { expenseApprovalThreshold: true } }),
                prisma.department.findMany({ where: { clinicId }, select: { id: true, monthlyBudget: true } }),
            ]);
            res.json({ success: true, expenseApprovalThreshold: clinic?.expenseApprovalThreshold ?? null, budgets: departments });
        } catch (e: any) {
            console.error('[expense-settings]', e?.message || e);
            res.status(500).json({ error: "Sozlamani saqlab bo'lmadi" });
        }
    });
}
