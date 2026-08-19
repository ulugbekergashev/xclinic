/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — hisob qatorlari va kassa.

   Klinikada bemor har bir yo'llanma bilan kassaga qaytadi: konsultatsiya uchun
   bir marta, tahlil uchun yana. Shuning uchun "to'landi" bayrog'i qabulga emas,
   HAR BIR XIZMAT QATORIGA tegishli.

   Qarz alohida saqlanmaydi — u to'lanmagan qatorlarning yig'indisi.
   `Patient.balance` esa avans (oldindan to'lov) uchun ishlatiladi va bu yerga
   aralashmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

const nowDate = () => new Date().toISOString().split('T')[0];
const round = (n: number) => Math.round(n * 100) / 100;

export type ChargeSource = 'Service' | 'Lab' | 'Study' | 'Medication' | 'Bed' | 'Other';

/**
 * Buyurtma berilganda hisob qatorini yaratadi.
 * Xizmat qo'shilganda, tahlilga yuborilganda va tekshiruv buyurilganda chaqiriladi —
 * shunda kassaga boradigan "qog'oz" o'z-o'zidan paydo bo'ladi.
 *
 * Narxi 0 bo'lgan buyurtma uchun qator yaratilmaydi: kassaga bo'sh qog'oz bilan
 * yubormaslik kerak.
 */
export async function createCharge(prisma: any, input: {
    clinicId: string;
    visitId?: string | null;
    patientId?: string | null;
    patientName: string;
    source: ChargeSource;
    sourceId?: string | null;
    name: string;
    quantity?: number;
    unitPrice: number;
    discount?: number;
    createdByName?: string | null;
}) {
    const qty = input.quantity ?? 1;
    const discount = input.discount ?? 0;
    const total = round(Math.max(0, input.unitPrice * qty - discount));
    if (total <= 0) return null;

    return prisma.visitCharge.create({
        data: {
            clinicId: input.clinicId,
            visitId: input.visitId || null,
            patientId: input.patientId || null,
            patientName: input.patientName,
            source: input.source,
            sourceId: input.sourceId || null,
            name: input.name,
            quantity: qty,
            unitPrice: input.unitPrice,
            discount,
            total,
            status: 'Unpaid',
            createdByName: input.createdByName || null,
        },
    });
}

/**
 * Manba yozuvi o'chirilganda uning qatorini bekor qiladi.
 * To'langan qator bekor qilinmaydi — pul allaqachon olingan, uni faqat
 * qaytarish operatsiyasi bilan yechish mumkin.
 */
export async function cancelChargesBySource(prisma: any, source: ChargeSource, sourceId: string) {
    return prisma.visitCharge.updateMany({
        where: { source, sourceId, status: 'Unpaid' },
        data: { status: 'Cancelled' },
    });
}

/** Qabulning pul holati — ish stoli va kassa shuni ko'rsatadi */
export function summarize(charges: any[]) {
    const active = charges.filter(c => c.status !== 'Cancelled');
    const total = round(active.reduce((s, c) => s + c.total, 0));
    const paid = round(active.reduce((s, c) => s + (c.paidAmount || 0), 0));
    return { total, paid, due: round(total - paid), unpaidCount: active.filter(c => c.status !== 'Paid').length };
}

export function registerBillingRoutes(app: express.Express, deps: Deps) {
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
                await handler(req, res, clinicId);
            } catch (e: any) {
                console.error(`[${method.toUpperCase()} ${path}]`, e.message);
                res.status(500).json({ error: e.message || 'Server xatoligi' });
            }
        });
    };

    // ═══ HISOB QATORLARI ═════════════════════════════════════════════════════

    /** Kassa ekrani shu ro'yxatni ko'rsatadi */
    route('get', '/api/charges', async (req, res, clinicId) => {
        const { status, patientId, visitId, date } = req.query;
        const charges = await prisma.visitCharge.findMany({
            where: {
                clinicId,
                ...(status ? { status: String(status) } : { status: { not: 'Cancelled' } }),
                ...(patientId ? { patientId: String(patientId) } : {}),
                ...(visitId ? { visitId: String(visitId) } : {}),
                ...(date ? { visit: { date: String(date) } } : {}),
            },
            include: { visit: { select: { id: true, date: true, queueNumber: true, departmentId: true } } },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        res.json(charges);
    });

    /** Bemor bo'yicha guruhlangan qarz — kassir bitta bemorni ochganda */
    route('get', '/api/charges/pending', async (req, res, clinicId) => {
        const charges = await prisma.visitCharge.findMany({
            where: { clinicId, status: 'Unpaid' },
            include: { visit: { select: { id: true, date: true, queueNumber: true } } },
            orderBy: { createdAt: 'asc' },
        });

        // Bemor bo'yicha yig'amiz — kassir "kim qancha qarz" ni bir qarashda ko'rsin
        const byPatient = new Map<string, any>();
        for (const c of charges) {
            const key = c.patientId || `noname:${c.patientName}`;
            if (!byPatient.has(key)) {
                byPatient.set(key, {
                    patientId: c.patientId, patientName: c.patientName,
                    due: 0, items: [] as any[],
                });
            }
            const g = byPatient.get(key);
            g.due = round(g.due + (c.total - (c.paidAmount || 0)));
            g.items.push(c);
        }
        res.json(Array.from(byPatient.values()).sort((a, b) => b.due - a.due));
    });

    route('get', '/api/visits/:id/charges', async (req, res, clinicId) => {
        const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
        if (!visit || visit.clinicId !== clinicId) return res.status(404).json({ error: 'Qabul topilmadi' });
        const charges = await prisma.visitCharge.findMany({
            where: { visitId: req.params.id },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ charges, summary: summarize(charges) });
    });

    /** Qo'lda qator qo'shish — ro'yxatda yo'q xizmat uchun */
    route('post', '/api/charges', async (req, res, clinicId) => {
        const { visitId, patientId, patientName, name, unitPrice, quantity, discount, source } = req.body;
        if (!name || !unitPrice) return res.status(400).json({ error: 'Nom va narx majburiy' });

        if (visitId) {
            const visit = await prisma.visit.findUnique({ where: { id: visitId } });
            if (!visit || visit.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const charge = await createCharge(prisma, {
            clinicId, visitId, patientId,
            patientName: patientName || '',
            source: (source as ChargeSource) || 'Other',
            name, unitPrice: Number(unitPrice),
            quantity: Number(quantity) || 1,
            discount: Number(discount) || 0,
        });
        res.json(charge);
    });

    route('delete', '/api/charges/:id', async (req, res, clinicId) => {
        const charge = await prisma.visitCharge.findUnique({ where: { id: req.params.id } });
        if (!charge || charge.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });
        if (charge.status === 'Paid') {
            return res.status(409).json({ error: "To'langan qatorni o'chirib bo'lmaydi" });
        }
        await prisma.visitCharge.update({ where: { id: req.params.id }, data: { status: 'Cancelled' } });
        res.json({ success: true });
    });

    // ═══ TO'LOV ══════════════════════════════════════════════════════════════

    /**
     * Tanlangan qatorlarni to'laydi.
     *
     * Summa qatorlar yig'indisidan kam bo'lsa — navbat bo'yicha taqsimlanadi:
     * to'liq qoplangani "Paid", oxirgisi qisman to'langan holda qoladi. Shunda
     * bemor "yarmini hozir, qolganini keyin" deb to'lay oladi va qolgan qarz
     * yo'qolib qolmaydi.
     */
    route('post', '/api/payments', async (req, res, clinicId) => {
        const { chargeIds, amount, method, receivedById, receivedByName, doctorId, doctorName } = req.body;
        if (!Array.isArray(chargeIds) || chargeIds.length === 0) {
            return res.status(400).json({ error: 'Kamida bitta qator tanlanishi kerak' });
        }

        const charges = await prisma.visitCharge.findMany({
            where: { id: { in: chargeIds }, clinicId, status: 'Unpaid' },
            orderBy: { createdAt: 'asc' },
        });
        if (charges.length === 0) return res.status(400).json({ error: "To'lanmagan qator topilmadi" });

        const due = round(charges.reduce((s: number, c: any) => s + (c.total - (c.paidAmount || 0)), 0));
        const received = amount != null ? round(Number(amount)) : due;
        if (received <= 0) return res.status(400).json({ error: "Summa noto'g'ri" });
        if (received > due) return res.status(400).json({ error: `Summa qarzdan ko'p (qarz: ${due})` });

        const first = charges[0];
        const paidAt = new Date();

        // Bitta chek — bitta Transaction
        const tx = await prisma.transaction.create({
            data: {
                clinicId,
                patientId: first.patientId || null,
                patientName: first.patientName,
                visitId: first.visitId || null,
                date: nowDate(),
                amount: received,
                type: method || 'Cash',
                service: charges.map((c: any) => c.name).join(', ').slice(0, 200),
                status: 'Paid',
                doctorId: doctorId || null,
                doctorName: doctorName || null,
                receivedById: receivedById || null,
                receivedByName: receivedByName || null,
            },
        });

        // Summani navbat bo'yicha taqsimlaymiz
        let left = received;
        const updated: any[] = [];
        for (const c of charges) {
            if (left <= 0) break;
            const remaining = round(c.total - (c.paidAmount || 0));
            const pay = Math.min(left, remaining);
            const newPaid = round((c.paidAmount || 0) + pay);
            const fully = newPaid >= c.total - 0.001;
            updated.push(await prisma.visitCharge.update({
                where: { id: c.id },
                data: {
                    paidAmount: newPaid,
                    status: fully ? 'Paid' : 'Unpaid',
                    ...(fully ? { paidAt, transactionId: tx.id } : {}),
                },
            }));
            left = round(left - pay);
        }

        res.json({ transaction: tx, charges: updated, received, due: round(due - received) });
    });

    console.log('✅ Kassa endpointlari ulandi');
}
