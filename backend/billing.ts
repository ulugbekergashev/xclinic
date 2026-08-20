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
import { tashkentDateStr } from './tashkentTime';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

// Sana Toshkent bo'yicha: UTC ishlatilsa tunda kechagi kun yozilardi
const nowDate = () => tashkentDateStr();
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
    /* Qator KIMNING ishi. Chekka emas, qatorga yoziladi: bitta chek bir necha
       shifokorning xizmatini o'z ichiga oladi va uni bo'lish imkoni bo'lishi
       kerak (GAP-ANALYSIS, A17 va C11). */
    doctorId?: string | null;
    doctorName?: string | null;
    /** Statsionar yotishi: koyka haqi va dorilarda qabul yo'q. Migratsiya 0015. */
    admissionId?: string | null;
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
            doctorId: input.doctorId || null,
            doctorName: input.doctorName || null,
            admissionId: input.admissionId || null,
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


/** Kassa izi. Ilgari to'lov va qator bekor qilinishi jurnalga TUSHMASDI —
 *  bu kassa dasturidagi eng klassik teshik (GAP-ANALYSIS, A19). */
async function writeAuditFor(prisma: any, input: {
    clinicId: string; date: string; action: string; entityType: string;
    entityId?: string | null; summary: string; byName?: string | null;
}) {
    try {
        const closure = await prisma.cashRegisterDay.findFirst({
            where: { clinicId: input.clinicId, date: input.date },
        });
        await prisma.cashAuditLog.create({
            data: {
                clinicId: input.clinicId, date: input.date,
                action: input.action, entityType: input.entityType,
                entityId: input.entityId || null, summary: input.summary,
                afterClose: !!closure, byName: input.byName || null, byRole: null,
            },
        });
    } catch (e: any) {
        console.error("Kassa izini yozib bo'lmadi:", e?.message || e);
    }
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

    const writeAudit = (input: any) => writeAuditFor(prisma, input);

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
        /* ROL. Ilgari tekshiruv YO'Q edi: hisob qatorini istalgan kirgan
           foydalanuvchi qo'sha olardi — laborant ham, hamshira ham, ya'ni
           bemor hisobiga pul yozish huquqi hammada edi. Hamshiraning
           qatorlari `POST /medication-orders/:id/administer` orqali
           SERVER o'zi yaratadi, qo'lda kiritish kerak emas. */
        const user = (req as any).user;
        if (!['DOCTOR', 'RECEPTIONIST', 'CLINIC_ADMIN', 'SUPER_ADMIN'].includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }

        const { visitId, patientId, patientName, name, unitPrice, quantity, discount, source } = req.body;
        if (!name || !unitPrice) return res.status(400).json({ error: 'Nom va narx majburiy' });

        if (visitId) {
            const visit = await prisma.visit.findUnique({ where: { id: visitId } });
            if (!visit || visit.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        /* Bemor havolasi ham tekshiriladi. Ilgari yo'q bemor id si kelganda
           tashqi kalit buzilib 500 qaytardi — sabab ko'rinmas edi. */
        if (patientId) {
            const patient = await prisma.patient.findUnique({ where: { id: String(patientId) } });
            if (!patient || patient.clinicId !== clinicId) {
                return res.status(404).json({ error: 'Bemor topilmadi' });
            }
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

        /* Ilgari bekor qilish jurnalga TUSHMASDI: to'lanmagan xizmatni jimgina
           yo'q qilish mumkin edi va hech qanday iz qolmasdi (A19). */
        await writeAudit({
            clinicId, date: nowDate(), action: 'Cancel', entityType: 'VisitCharge',
            entityId: charge.id,
            summary: `${charge.patientName}, ${charge.name} — ${Math.round(charge.total)} bekor qilindi`,
            byName: (req as any).user?.name || null,
        });

        res.json({ success: true });
    });

    // ═══ TO'LOV ══════════════════════════════════════════════════════════════

    /**
     * Tanlangan qatorlarni to'laydi.
     *
     * O'ZGARISHLAR (reliz 3):
     *
     * 1. Har bir qatorga qancha ketgani `ChargePayment` ga yoziladi. Ilgari
     *    faqat yig'indi (`paidAmount`) saqlanardi va "bu chekdan bu qatorga
     *    qancha tushdi" degan savolga javob yo'q edi.
     *
     * 2. `perCharge` — qaysi qatorga QANCHA to'lashni mijoz aniq ko'rsata oladi.
     *    Ilgari summa faqat qator YOSHI bo'yicha taqsimlanardi, ya'ni "faqat
     *    UZI uchun to'layman" degan bemor konsultatsiyani to'lab qo'yardi.
     *
     * 3. `payments` — bitta chekni bir necha usulga bo'lish (naqd + karta).
     *    Har usul uchun alohida `Transaction` yoziladi, chunki kassa kitobi
     *    usullar bo'yicha yig'adi.
     *
     * Uchtasi ham IXTIYORIY: eski shakldagi so'rov ilgarigidek ishlaydi.
     */
    route('post', '/api/payments', async (req, res, clinicId) => {
        const { chargeIds, amount, method, receivedById, receivedByName,
                doctorId, doctorName, perCharge, payments } = req.body;
        if (!Array.isArray(chargeIds) || chargeIds.length === 0) {
            return res.status(400).json({ error: 'Kamida bitta qator tanlanishi kerak' });
        }

        const charges = await prisma.visitCharge.findMany({
            where: { id: { in: chargeIds }, clinicId, status: 'Unpaid' },
            orderBy: { createdAt: 'asc' },
        });
        if (charges.length === 0) return res.status(400).json({ error: "To'lanmagan qator topilmadi" });

        const remainingOf = (c: any) => round(c.total - (c.paidAmount || 0));
        const due = round(charges.reduce((s: number, c: any) => s + remainingOf(c), 0));

        /* ─── Qatorlar bo'yicha taqsimot ─────────────────────────────────────
           `perCharge` berilgan bo'lsa — aynan shunday, aks holda navbat
           bo'yicha (eski xatti-harakat). */
        const plan = new Map<string, number>();
        if (perCharge && typeof perCharge === 'object') {
            for (const c of charges) {
                const want = round(Number(perCharge[c.id] ?? 0));
                if (!(want > 0)) continue;
                if (want > remainingOf(c) + 0.001) {
                    return res.status(400).json({
                        error: `"${c.name}" uchun summa qarzdan ko'p (qarz: ${remainingOf(c)})`,
                    });
                }
                plan.set(c.id, want);
            }
            if (plan.size === 0) return res.status(400).json({ error: "Summa ko'rsatilmagan" });
        }

        const received = plan.size > 0
            ? round(Array.from(plan.values()).reduce((a, b) => a + b, 0))
            : (amount != null ? round(Number(amount)) : due);

        if (received <= 0) return res.status(400).json({ error: "Summa noto'g'ri" });
        if (received > due) return res.status(400).json({ error: `Summa qarzdan ko'p (qarz: ${due})` });

        if (plan.size === 0) {
            // Navbat bo'yicha: eng eski qatordan boshlab
            let left = received;
            for (const c of charges) {
                if (left <= 0) break;
                const pay = Math.min(left, remainingOf(c));
                if (pay > 0) plan.set(c.id, round(pay));
                left = round(left - pay);
            }
        }

        /* ─── To'lov usullari ────────────────────────────────────────────────
           `payments: [{ method, amount }]` berilsa — har usulga alohida chek.
           Berilmasa — bitta chek, bitta usul (eski xatti-harakat). */
        let methodSplit: { method: string; amount: number }[];
        if (Array.isArray(payments) && payments.length > 0) {
            methodSplit = payments.map((p: any) => ({
                method: String(p.method || 'Cash'),
                amount: round(Number(p.amount) || 0),
            })).filter((p) => p.amount > 0);
            const sum = round(methodSplit.reduce((s, p) => s + p.amount, 0));
            if (methodSplit.length === 0) return res.status(400).json({ error: "To'lov usuli ko'rsatilmagan" });
            if (Math.abs(sum - received) > 0.01) {
                return res.status(400).json({
                    error: `Usullar yig'indisi (${sum}) umumiy summaga (${received}) teng emas`,
                });
            }
        } else {
            methodSplit = [{ method: String(method || 'Cash'), amount: received }];
        }

        const first = charges[0];
        const paidAt = new Date();
        const chargeById = new Map(charges.map((c: any) => [c.id, c]));
        const serviceLabel = charges
            .filter((c: any) => plan.has(c.id))
            .map((c: any) => c.name).join(', ').slice(0, 200);

        /* Har usul uchun chek va uning ulushidagi ChargePayment qatorlari.
           Usul ulushi qatorlar bo'yicha proportsional taqsimlanadi — shunda
           kassa kitobidagi "naqd" va "karta" summalari to'g'ri chiqadi. */
        const createdTx: any[] = [];
        const paidPerCharge = new Map<string, number>();

        for (const ms of methodSplit) {
            const tx = await prisma.transaction.create({
                data: {
                    clinicId,
                    patientId: first.patientId || null,
                    patientName: first.patientName,
                    visitId: first.visitId || null,
                    date: nowDate(),
                    amount: ms.amount,
                    type: ms.method,
                    service: serviceLabel,
                    status: 'Paid',
                    doctorId: doctorId || null,
                    doctorName: doctorName || null,
                    receivedById: receivedById || null,
                    receivedByName: receivedByName || null,
                },
            });
            createdTx.push(tx);

            const share = received > 0 ? ms.amount / received : 0;
            for (const [chargeId, chargeAmount] of plan.entries()) {
                const part = round(chargeAmount * share);
                if (part <= 0) continue;
                await prisma.chargePayment.create({
                    data: {
                        clinicId, chargeId, transactionId: tx.id,
                        amount: part, kind: 'Payment',
                        createdByName: receivedByName || null,
                    },
                });
                paidPerCharge.set(chargeId, round((paidPerCharge.get(chargeId) || 0) + part));
            }
        }

        // Qator holatini yangilaymiz. `paidAmount` — kesh, haqiqiy manba
        // ChargePayment qatorlari.
        const lastTxId = createdTx[createdTx.length - 1]?.id || null;
        const updated: any[] = [];
        for (const [chargeId, part] of paidPerCharge.entries()) {
            const c: any = chargeById.get(chargeId);
            const newPaid = round((c.paidAmount || 0) + part);
            const fully = newPaid >= c.total - 0.001;
            updated.push(await prisma.visitCharge.update({
                where: { id: chargeId },
                data: {
                    paidAmount: newPaid,
                    status: fully ? 'Paid' : 'Unpaid',
                    ...(fully ? { paidAt, transactionId: lastTxId } : {}),
                },
            }));
        }

        // Kassa izi: ilgari to'lov jurnalga TUSHMASDI — GAP-ANALYSIS, A19.
        await writeAudit({
            clinicId, date: nowDate(), action: 'Payment', entityType: 'VisitCharge',
            entityId: updated.map((c) => c.id).join(','),
            summary: `${first.patientName}: ${Math.round(received)} (${methodSplit.map((m) => `${m.method} ${Math.round(m.amount)}`).join(' + ')}), ${updated.length} qator`,
            byName: receivedByName || null,
        });

        res.json({
            transaction: createdTx[0],
            transactions: createdTx,
            charges: updated,
            received,
            due: round(due - received),
        });
    });

    /**
     * Qator bo'yicha QAYTARISH.
     *
     * Ilgari qaytarish faqat `CashMovement` orqali yozilardi — shunchaki summa,
     * hech qanday qatorga bog'lanmagan. Natijada qator `Paid` bo'lib qolardi,
     * garchi pul qaytarilgan bo'lsa ham.
     *
     * Rol: FAQAT CLINIC_ADMIN. Chegirmadan farqi printsipial — chegirma
     * to'lovdan OLDIN hisobni kamaytiradi, qaytarish esa yashikdan naqd
     * chiqaradi. Bu klassik suiiste'mol nuqtasi.
     */
    route('post', '/api/charges/:id/refund', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (user?.role !== 'CLINIC_ADMIN' && user?.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: "Ruxsat yo'q — qaytarishni faqat klinika admini qiladi" });
        }

        const charge = await prisma.visitCharge.findUnique({ where: { id: req.params.id } });
        if (!charge || charge.clinicId !== clinicId) return res.status(404).json({ error: 'Qator topilmadi' });

        const { amount, method, reason } = req.body;
        const paid = round(charge.paidAmount || 0);
        const back = amount != null ? round(Number(amount)) : paid;
        if (!(back > 0)) return res.status(400).json({ error: "Summa noto'g'ri" });
        if (back > paid) return res.status(400).json({ error: `To'langan summadan ko'p (to'langan: ${paid})` });

        // Qaytarish ham chek: kassa kitobi pul harakatini ko'rishi kerak
        const tx = await prisma.transaction.create({
            data: {
                clinicId,
                patientId: charge.patientId || null,
                patientName: charge.patientName,
                visitId: charge.visitId || null,
                date: nowDate(),
                amount: back,
                /* Usul 'Refund' — bu chek TUSHUM emas. Yashikdan chiqishni
                   pastdagi `CashMovement` bajaradi (u haqiqiy usulni saqlaydi).
                   Ilgari bu yerda 'Cash' turardi va qaytarish bir vaqtda
                   tushum ham, chiqim ham bo'lib, natijada kassa hisobida
                   qaytarilgan pul "yo'qolmasdi". */
                type: 'Refund',
                service: `Qaytarish: ${charge.name}`.slice(0, 200),
                status: 'Paid',
                receivedByName: user?.name || null,
            },
        });

        await prisma.chargePayment.create({
            data: {
                clinicId, chargeId: charge.id, transactionId: tx.id,
                amount: -back, kind: 'Refund',
                createdByName: user?.name || null,
            },
        });

        const newPaid = round(paid - back);
        const updated = await prisma.visitCharge.update({
            where: { id: charge.id },
            data: {
                paidAmount: newPaid,
                // To'liq qaytarilsa qator yana to'lanmagan holatga qaytadi
                status: newPaid >= charge.total - 0.001 ? 'Paid' : 'Unpaid',
                ...(newPaid <= 0.001 ? { paidAt: null } : {}),
            },
        });

        // Kassa harakati: inkassatsiya/qaytarish xarajat EMAS, alohida hisob
        const movement = await prisma.cashMovement.create({
            data: {
                clinicId, date: nowDate(), type: 'Refund',
                amount: back, method: String(method || 'Cash'),
                note: reason ? String(reason).slice(0, 300) : `Qaytarish: ${charge.name}`,
                patientId: charge.patientId || null,
                transactionId: tx.id,
                createdByName: user?.name || null,
            },
        });

        await writeAudit({
            clinicId, date: nowDate(), action: 'Refund', entityType: 'VisitCharge',
            entityId: charge.id,
            summary: `${charge.patientName}: ${Math.round(back)} qaytarildi (${charge.name})${reason ? ' — ' + reason : ''}`,
            byName: user?.name || null,
        });

        res.json({ charge: updated, transaction: tx, movement });
    });

    /**
     * Qatorga chegirma.
     *
     * Rol: CLINIC_ADMIN va RECEPTIONIST (В18 qarori). Registrator kassada
     * o'tiradi va chegirma oddiy kassa amali; har nafaqaxo'r uchun adminni
     * chaqirish kerak bo'lsa, chegirma tizimdan TASHQARIDA beriladi.
     *
     * To'langan qatorga chegirma berilmaydi: pul allaqachon olingan, buni
     * faqat qaytarish bilan yechish mumkin.
     */
    route('put', '/api/charges/:id/discount', async (req, res, clinicId) => {
        const user = (req as any).user;
        const allowed = ['CLINIC_ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'];
        if (!allowed.includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }

        const charge = await prisma.visitCharge.findUnique({ where: { id: req.params.id } });
        if (!charge || charge.clinicId !== clinicId) return res.status(404).json({ error: 'Qator topilmadi' });
        if (charge.status === 'Paid') {
            return res.status(409).json({ error: "To'langan qatorga chegirma berilmaydi" });
        }
        if (charge.status === 'Cancelled') {
            return res.status(409).json({ error: 'Bekor qilingan qator' });
        }

        const discount = round(Number(req.body?.discount) || 0);
        if (discount < 0) return res.status(400).json({ error: "Chegirma noto'g'ri" });

        const gross = round(charge.unitPrice * (charge.quantity || 1));
        if (discount > gross) {
            return res.status(400).json({ error: `Chegirma narxdan ko'p (narx: ${gross})` });
        }
        const newTotal = round(gross - discount);
        if (newTotal < round(charge.paidAmount || 0)) {
            return res.status(400).json({ error: "Chegirmadan keyingi summa to'langandan kam bo'lib qoladi" });
        }

        const updated = await prisma.visitCharge.update({
            where: { id: charge.id },
            data: {
                discount, total: newTotal,
                status: newTotal <= round(charge.paidAmount || 0) + 0.001 ? 'Paid' : 'Unpaid',
            },
        });

        await writeAudit({
            clinicId, date: nowDate(), action: 'Discount', entityType: 'VisitCharge',
            entityId: charge.id,
            summary: `${charge.patientName}, ${charge.name}: chegirma ${Math.round(charge.discount || 0)} → ${Math.round(discount)}`,
            byName: user?.name || null,
        });

        res.json(updated);
    });

    console.log('✅ Kassa endpointlari ulandi');
}
