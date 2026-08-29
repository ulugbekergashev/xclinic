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
import { emitEvent } from './events';
import { som, splitProportionally } from './money';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

// Sana Toshkent bo'yicha: UTC ishlatilsa tunda kechagi kun yozilardi
const nowDate = () => tashkentDateStr();

/* Pul — BUTUN so'm, `money.ts` dagi yagona qoida bo'yicha. Ilgari bu yerda
   o'zining `Math.round(n*100)/100` i turardi va loyihada yana besh joyda
   xuddi shunday nusxalari bor edi. */
const round = som;

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
    /** Xizmat katalogidagi id. Shifokor ulushi xizmatga bog'lanadi — busiz
     *  har xizmatga o'z foizi ishlamaydi. Migratsiya 0021. */
    serviceId?: number | null;
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
            serviceId: input.serviceId ?? null,
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


/* ─── Tranzaksiya ichidan HTTP javob ──────────────────────────────────────
   Interaktiv tranzaksiya ichida `return res.status(400).json(...)` qilib
   bo'lmaydi: callback dan qaytish tranzaksiyani BEKOR QILMAYDI, ya'ni javob
   yuborilgan bo'lsa ham yozuvlar commit bo'lib ketaveradi.

   Shuning uchun ichkaridagi har bir tekshiruv xato TASHLAYDI — bu rollback
   ning yagona to'g'ri usuli — `route()` esa uni kerakli HTTP kodiga
   o'giradi. */
export class HttpError extends Error {
    constructor(public status: number, message: string, public payload?: Record<string, any>) {
        super(message);
        this.name = 'HttpError';
    }
}

/* ─── Avans balansining YAGONA formulasi ──────────────────────────────────
   Balansga uch xil hodisa ta'sir qiladi:
     1. 'Avans' xizmati bilan kirim       → oshadi
     2. `type: 'Balance'` bilan to'lov    → kamayadi
     3. avansga QAYTARISH                 → oshadi

   Uchinchisi chekda ko'rinmaydi (uning turi 'Refund'), usuli esa
   `CashMovement.method` da saqlanadi — shuning uchun alohida o'qiladi.

   Bu funksiya IKKI joyda ishlatiladi: balanslarni qayta hisoblashda va
   yaxlitlik tekshiruvida. Yagona manba bo'lgani uchun ular ayri ketolmaydi —
   aynan shu ayrilik 7.7-B dagi xatoning sababi edi. */
export async function findBalanceMismatches(prisma: any, patientWhere: any) {
    const patients = await prisma.patient.findMany({
        where: patientWhere,
        select: { id: true, firstName: true, lastName: true, balance: true },
    });

    const diffs: {
        patientId: string; patientName: string;
        current: number; correct: number; diff: number;
    }[] = [];

    for (const patient of patients) {
        const [transactions, refunds] = await Promise.all([
            prisma.transaction.findMany({
                where: { patientId: patient.id, status: 'Paid' },
                select: { service: true, type: true, amount: true },
            }),
            /* Avansga qaytarish. `transactionId` shart: balansni FAQAT
               qaytarish oqimi oshiradi va u har doim chek bilan yoziladi.
               Qo'lda kiritilgan kassa harakati balansga tegmaydi. */
            prisma.cashMovement.findMany({
                where: {
                    patientId: patient.id, type: 'Refund', method: 'Balance',
                    transactionId: { not: null },
                },
                select: { amount: true },
            }),
        ]);

        let correct = 0;
        for (const t of transactions) {
            if (t.service === 'Avans') correct += t.amount;
            else if (t.type === 'Balance') correct -= t.amount;
        }
        for (const r of refunds) correct += r.amount;

        const current = patient.balance || 0;
        if (Math.abs(current - correct) > 0.001) {
            diffs.push({
                patientId: patient.id,
                patientName: `${patient.lastName} ${patient.firstName}`,
                current: Math.round(current),
                correct: Math.round(correct),
                diff: Math.round(correct - current),
            });
        }
    }
    return { checked: patients.length, diffs };
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
                // Tranzaksiya ichidan tashlangan tekshiruv xatosi — 500 emas
                if (e instanceof HttpError) {
                    return res.status(e.status).json({ error: e.message, ...(e.payload || {}) });
                }
                console.error(`[${method.toUpperCase()} ${path}]`, e.message);
                res.status(500).json({ error: e.message || 'Server xatoligi' });
            }
        });
    };

    /* Qatorlar to'plamining "barmoq izi": id, to'langan summa va jami.
       To'lovni tayyorlash paytida o'qilgan holat bilan tranzaksiya ichida
       o'qilgan holatni solishtirish uchun — farq bo'lsa, boshqa kassir
       oradan o'tgan degani. */
    const fingerprint = (rows: any[]): string =>
        rows.map((r) => `${r.id}:${round(r.paidAmount || 0)}:${round(r.total)}:${r.status}`)
            .sort().join('|');

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

    /**
     * Bemor bo'yicha guruhlangan qarz.
     *
     * `now=1` — FAQAT hozir klinikada bo'lgan bemorlar: bugun ochilgan va
     * yopilmagan qabuli borlar. Nima uchun kerak: kassir oynasida bemor
     * turadi, ro'yxatda esa butun klinikaning qarzi — o'tgan oyning
     * qarzdorlari ham (GAP-ANALYSIS, 1-sahna, 2-band). Kassir odamni
     * umumiy ro'yxatdan izlashi kerak edi.
     *
     * Sukut bo'yicha xatti-harakat O'ZGARMAYDI: parametr berilmasa
     * ilgarigidek butun qarz qaytadi.
     */
    route('get', '/api/charges/pending', async (req, res, clinicId) => {
        const onlyNow = req.query.now === '1' || req.query.now === 'true';

        const charges = await prisma.visitCharge.findMany({
            where: { clinicId, status: 'Unpaid' },
            include: {
                visit: {
                    select: {
                        id: true, date: true, queueNumber: true, status: true,
                        departmentId: true, doctorName: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        /* "Hozir klinikada" — bugungi va yopilmagan qabul. `AwaitingResults`
           ham kiradi: bemor tahlilga ketgan, lekin ketmagan — u qaytib
           keladi va kassaga o'sha yerda o'tadi. */
        const today = nowDate();
        const isHere = (c: any) => !!c.visit
            && c.visit.date === today
            && !['Completed', 'Cancelled'].includes(String(c.visit.status));

        const rows = onlyNow ? charges.filter(isHere) : charges;

        // Bemor bo'yicha yig'amiz — kassir "kim qancha qarz" ni bir qarashda ko'rsin
        const byPatient = new Map<string, any>();
        for (const c of rows) {
            const key = c.patientId || `noname:${c.patientName}`;
            if (!byPatient.has(key)) {
                byPatient.set(key, {
                    patientId: c.patientId, patientName: c.patientName,
                    due: 0, items: [] as any[],
                    // Kassir uchun: navbat raqami va bo'lim — bemorni tanish uchun
                    here: false, queueNumber: null as number | null,
                    department: null as string | null, visitId: null as string | null,
                });
            }
            const g = byPatient.get(key);
            g.due = round(g.due + (c.total - (c.paidAmount || 0)));
            g.items.push(c);
            if (isHere(c)) {
                g.here = true;
                g.queueNumber = g.queueNumber ?? c.visit.queueNumber;
                g.visitId = g.visitId || c.visit.id;
                g.department = g.department || c.visit.departmentId;
            }
        }

        /* Tartib: HOZIR turganlar tepada, keyin summa bo'yicha. Kassir
           ro'yxatning boshiga qaraydi va o'sha yerda oynadagi odamni ko'radi. */
        res.json(Array.from(byPatient.values()).sort((a, b) => {
            if (a.here !== b.here) return a.here ? -1 : 1;
            return b.due - a.due;
        }));
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
        if (!['DOCTOR', 'RECEPTIONIST', 'CLINIC_ADMIN'].includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }

        const { visitId, patientId, patientName, name, unitPrice, quantity, discount, source, serviceId } = req.body;
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
            serviceId: serviceId != null && serviceId !== '' ? Number(serviceId) : null,
        });
        res.json(charge);
    });

    route('delete', '/api/charges/:id', async (req, res, clinicId) => {
        const charge = await prisma.visitCharge.findUnique({ where: { id: req.params.id } });
        if (!charge || charge.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });
        if (charge.status === 'Paid') {
            return res.status(409).json({ error: "To'langan qatorni o'chirib bo'lmaydi" });
        }

        /* Shartli yangilash: o'qish bilan yozish orasida kassir qatorni to'lab
           qo'ygan bo'lishi mumkin — u holda `status` allaqachon 'Paid' va
           `updateMany` hech narsani o'zgartirmaydi.

           `status: { not: 'Paid' }` ATAYLAB: allaqachon bekor qilingan qator
           yana bekor qilinaveradi va javob muvaffaqiyatli bo'ladi. Ikki marta
           bosish yoki eskirgan ro'yxatdan o'chirish xato ko'rsatmasligi kerak —
           bu hozirgi xatti-harakat va u saqlanadi. */
        const cancelled = await prisma.visitCharge.updateMany({
            where: { id: req.params.id, clinicId, status: { not: 'Paid' } },
            data: { status: 'Cancelled' },
        });
        if (cancelled.count === 0) {
            return res.status(409).json({
                error: "Qator oradan to'landi — o'chirib bo'lmaydi. Ro'yxatni yangilang.",
                code: 'CHARGE_CHANGED',
            });
        }

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

        /* ─── NIMA UCHUN QATORLAR IKKI MARTA O'QILADI ────────────────────────

           BIRINCHI o'qish (shu yerda) — faqat O'ZGARISH ANIQLASH uchun.
           IKKINCHI o'qish tranzaksiya ichida bo'ladi va hamma hisob-kitob
           AYNAN o'sha yangi ma'lumotdan quriladi.

           Nima uchun shunday. Ilgari hamma narsa tranzaksiyadan tashqarida
           o'qilib, keyin alohida-alohida yozilardi. Ikki kassir bitta qatorni
           bir vaqtda to'lasa, ikkalasi ham o'tib ketardi.

           Lekin "tranzaksiya ichida qayta o'qish" ning O'ZI yetarli emas va
           yangi xato tug'diradi: to'lov summasi (`received`, `methodSplit`)
           tashqi o'qishga tayanadi, ichki o'qish esa qatorni topmasligi
           mumkin (boshqa kassir to'lab bo'lgan). U holda chek YARATILADI,
           `ChargePayment` esa yaratilmaydi — kassada UYDIRMA chek paydo
           bo'ladi. Hozirgi kodda bunday holat yo'q, ya'ni sodda tuzatish
           ahvolni yomonlashtirardi.

           Shuning uchun: holat o'zgargan bo'lsa umuman to'lamaymiz —
           409 qaytaramiz va kassir ro'yxatni yangilaydi. Bu to'g'ri javob,
           chunki kassir bemordan olgan summa eski qarzga hisoblangan edi. */
        const before = await prisma.visitCharge.findMany({
            where: { id: { in: chargeIds }, clinicId, status: 'Unpaid' },
            select: { id: true, paidAmount: true, total: true, status: true },
        });
        if (before.length === 0) return res.status(400).json({ error: "To'lanmagan qator topilmadi" });
        const beforeFp = fingerprint(before);

        const outcome = await prisma.$transaction(async (tx: any) => {

        const charges = await tx.visitCharge.findMany({
            where: { id: { in: chargeIds }, clinicId, status: 'Unpaid' },
            orderBy: { createdAt: 'asc' },
        });
        if (charges.length === 0 || fingerprint(charges) !== beforeFp) {
            throw new HttpError(409,
                "Bu qatorlar oradan o'zgardi — boshqa kassir to'lov qabul qilgan bo'lishi mumkin. "
                + "Ro'yxatni yangilab, qaytadan urinib ko'ring.",
                { code: 'CHARGES_CHANGED' });
        }

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
                    throw new HttpError(400, `"${c.name}" uchun summa qarzdan ko'p (qarz: ${remainingOf(c)})`);
                }
                plan.set(c.id, want);
            }
            if (plan.size === 0) throw new HttpError(400, "Summa ko'rsatilmagan");
        }

        const received = plan.size > 0
            ? round(Array.from(plan.values()).reduce((a, b) => a + b, 0))
            : (amount != null ? round(Number(amount)) : due);

        if (received <= 0) throw new HttpError(400, "Summa noto'g'ri");
        if (received > due) throw new HttpError(400, `Summa qarzdan ko'p (qarz: ${due})`);

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
            if (methodSplit.length === 0) throw new HttpError(400, "To'lov usuli ko'rsatilmagan");
            if (Math.abs(sum - received) > 0.01) {
                throw new HttpError(400, `Usullar yig'indisi (${sum}) umumiy summaga (${received}) teng emas`);
            }
        } else {
            methodSplit = [{ method: String(method || 'Cash'), amount: received }];
        }

        const first = charges[0];
        const paidAt = new Date();

        /* AVANSDAN TO'LASH.
           `POST /api/transactions` avans hisobini yuritadi: 'Avans' xizmati
           balansni oshiradi, `type: 'Balance'` esa kamaytiradi. Lekin BU
           endpoint cheklarni to'g'ridan-to'g'ri yaratadi va o'sha mantiqni
           chetlab o'tardi — ya'ni avansdan to'lov balansni KAMAYTIRMASDI va
           bemor bir xil avansni cheksiz sarflay olardi. Reliz 3 dagi o'z
           xatoim.

           Tekshiruv to'lovdan OLDIN: yetmagan avansni yozib qo'yib, keyin
           minusga tushirish — eng yomon variant. */
        const balanceSpend = round(
            methodSplit.filter((m) => m.method === 'Balance')
                .reduce((sum, m) => sum + m.amount, 0),
        );
        if (balanceSpend > 0) {
            if (!first.patientId) {
                throw new HttpError(400, "Avansdan to'lash uchun bemor ko'rsatilishi kerak");
            }
            const patient = await tx.patient.findUnique({
                where: { id: first.patientId },
                select: { balance: true, clinicId: true },
            });
            if (!patient || patient.clinicId !== clinicId) {
                throw new HttpError(404, 'Bemor topilmadi');
            }
            const have = round(patient.balance || 0);
            if (balanceSpend > have + 0.001) {
                throw new HttpError(400,
                    `Avans yetarli emas: hisobda ${Math.round(have)}, kerak ${Math.round(balanceSpend)}`);
            }
        }
        const chargeById = new Map(charges.map((c: any) => [c.id, c]));
        const serviceLabel = charges
            .filter((c: any) => plan.has(c.id))
            .map((c: any) => c.name).join(', ').slice(0, 200);

        /* Har usul uchun chek va uning ulushidagi ChargePayment qatorlari.
           Usul ulushi qatorlar bo'yicha proportsional taqsimlanadi — shunda
           kassa kitobidagi "naqd" va "karta" summalari to'g'ri chiqadi. */
        const createdTx: any[] = [];
        const paidPerCharge = new Map<string, number>();

        for (let mi = 0; mi < methodSplit.length; mi++) {
            const ms = methodSplit[mi];
            const receipt = await tx.transaction.create({
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
            createdTx.push(receipt);

            /* ── USUL ULUSHINI QATORLARGA TAQSIMLASH ────────────────────────
               Ilgari har qism alohida yaxlitlanardi: `round(chargeAmount * share)`.
               Butun so'mga o'tgach bu qismlar yig'indisini chekka teng
               qilmasdi — 100 000 ni uchga bo'lsak 33 333 × 3 = 99 999 va bitta
               so'm yo'qolardi. Yaxlitlik tekshiruvi (7.5) buni darhol
               "buzilish" deb ko'rsatardi.

               Ikki qavatli kafolat:
                 - qatorlar bo'yicha: `splitProportionally` (eng katta qoldiq)
                   yig'indini AYNAN `ms.amount` ga tenglashtiradi;
                 - usullar bo'yicha: OXIRGI usul qolgan summani oladi, ya'ni
                   har qator bo'yicha jami aynan `plan[chargeId]` bo'ladi. */
            const entries = Array.from(plan.entries());
            const isLastMethod = mi === methodSplit.length - 1;

            const parts = isLastMethod
                ? entries.map(([chargeId, chargeAmount]) =>
                    som(chargeAmount - (paidPerCharge.get(chargeId) || 0)))
                : splitProportionally(ms.amount, entries.map(([, amt]) => amt));

            for (let i = 0; i < entries.length; i++) {
                const [chargeId] = entries[i];
                const part = parts[i];
                if (part <= 0) continue;
                await tx.chargePayment.create({
                    data: {
                        clinicId, chargeId, transactionId: receipt.id,
                        amount: part, kind: 'Payment',
                        createdByName: receivedByName || null,
                    },
                });
                paidPerCharge.set(chargeId, som((paidPerCharge.get(chargeId) || 0) + part));
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
            updated.push(await tx.visitCharge.update({
                where: { id: chargeId },
                data: {
                    paidAmount: newPaid,
                    status: fully ? 'Paid' : 'Unpaid',
                    ...(fully ? { paidAt, transactionId: lastTxId } : {}),
                },
            }));
        }

        /* Avans sarflandi — hisobdan yechamiz. To'lov muvaffaqiyatli
           bo'lgandan KEYIN: qatorlar yangilanmasa avans ham sarflanmasligi
           kerak. */
        if (balanceSpend > 0 && first.patientId) {
            await tx.patient.update({
                where: { id: first.patientId },
                data: { balance: { decrement: balanceSpend } },
            });
        }

        return {
            payload: {
                transaction: createdTx[0],
                transactions: createdTx,
                charges: updated,
                received,
                due: round(due - received),
            },
            audit: {
                patientId: first.patientId || null,
                patientName: first.patientName,
                received,
                methods: methodSplit.map((m) => `${m.method} ${Math.round(m.amount)}`).join(' + '),
                chargeIds: updated.map((c: any) => c.id).join(','),
                rows: updated.length,
            },
        };

        /* Tranzaksiya CHEGARASI shu yerda. `timeout` — Prisma o'z taymeri;
           15 s klinika uchun juda ko'p, lekin sekin diskda ham yetadi. */
        }, { timeout: 15000, maxWait: 10000 });

        /* Kassa izi — tranzaksiyadan TASHQARIDA va commit dan KEYIN.
           Ikki sabab: (1) jurnal yozuvi to'lovni to'xtatmasligi kerak —
           `writeAuditFor` xatoni o'zi yutadi; (2) tranzaksiya ichida bo'lsa
           rollback jurnalni ham o'chirib yuborardi, holbuki bekor bo'lgan
           urinish ham iz qoldirishi mumkin edi. Bu yerda esa jurnal faqat
           HAQIQATAN bo'lgan to'lov uchun yoziladi. */
        const a = outcome.audit;
        await writeAudit({
            clinicId, date: nowDate(), action: 'Payment', entityType: 'VisitCharge',
            entityId: a.chargeIds,
            summary: `${a.patientName}: ${Math.round(a.received)} (${a.methods}), ${a.rows} qator`,
            byName: receivedByName || null,
        });

        emitEvent(clinicId, 'charge.paid', { patientId: outcome.audit.patientId || null });
        res.json(outcome.payload);
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
        if (user?.role !== 'CLINIC_ADMIN') {
            return res.status(403).json({ error: "Ruxsat yo'q — qaytarishni faqat klinika admini qiladi" });
        }

        const { amount, method, reason } = req.body;

        /* Beshta yozuv (chek, ChargePayment, balans, qator, kassa harakati) —
           BITTA tranzaksiyada. Qator ham tranzaksiya ICHIDA o'qiladi: aks
           holda `paidAmount` eskirgan bo'lib, bir vaqtda ikki marta qaytarish
           to'langanidan ko'p pul chiqarishi mumkin edi. */
        const outcome = await prisma.$transaction(async (dbtx: any) => {

        const charge = await dbtx.visitCharge.findUnique({ where: { id: req.params.id } });
        if (!charge || charge.clinicId !== clinicId) throw new HttpError(404, 'Qator topilmadi');

        const paid = round(charge.paidAmount || 0);
        const back = amount != null ? round(Number(amount)) : paid;
        if (!(back > 0)) throw new HttpError(400, "Summa noto'g'ri");
        if (back > paid) throw new HttpError(400, `To'langan summadan ko'p (to'langan: ${paid})`);

        // Qaytarish ham chek: kassa kitobi pul harakatini ko'rishi kerak
        const tx = await dbtx.transaction.create({
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

        await dbtx.chargePayment.create({
            data: {
                clinicId, chargeId: charge.id, transactionId: tx.id,
                amount: -back, kind: 'Refund',
                createdByName: user?.name || null,
            },
        });

        /* Avansga QAYTARISH. Usul 'Balance' bo'lsa pul yashikdan chiqmaydi —
           bemorning hisobiga qaytadi va keyingi xizmatga ishlatiladi.
           Buni yozmasa, qaytarish "hech qayerga" ketardi. */
        if (String(method) === 'Balance' && charge.patientId) {
            await dbtx.patient.update({
                where: { id: charge.patientId },
                data: { balance: { increment: back } },
            });
        }

        const newPaid = round(paid - back);
        const updated = await dbtx.visitCharge.update({
            where: { id: charge.id },
            data: {
                paidAmount: newPaid,
                // To'liq qaytarilsa qator yana to'lanmagan holatga qaytadi
                status: newPaid >= charge.total - 0.001 ? 'Paid' : 'Unpaid',
                ...(newPaid <= 0.001 ? { paidAt: null } : {}),
            },
        });

        // Kassa harakati: inkassatsiya/qaytarish xarajat EMAS, alohida hisob
        const movement = await dbtx.cashMovement.create({
            data: {
                clinicId, date: nowDate(), type: 'Refund',
                amount: back, method: String(method || 'Cash'),
                note: reason ? String(reason).slice(0, 300) : `Qaytarish: ${charge.name}`,
                patientId: charge.patientId || null,
                transactionId: tx.id,
                createdByName: user?.name || null,
            },
        });

        return {
            payload: { charge: updated, transaction: tx, movement },
            audit: { patientName: charge.patientName, back, name: charge.name, id: charge.id },
        };

        }, { timeout: 15000, maxWait: 10000 });

        // Jurnal — commit dan keyin, to'lovdagi bilan bir xil sabab bo'yicha
        const a = outcome.audit;
        await writeAudit({
            clinicId, date: nowDate(), action: 'Refund', entityType: 'VisitCharge',
            entityId: a.id,
            summary: `${a.patientName}: ${Math.round(a.back)} qaytarildi (${a.name})${reason ? ' — ' + reason : ''}`,
            byName: user?.name || null,
        });

        emitEvent(clinicId, 'charge.changed', { reason: 'refund' });
        res.json(outcome.payload);
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
        const allowed = ['CLINIC_ADMIN', 'RECEPTIONIST'];
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

        /* Shartli yangilash: chegirma `paidAmount` ga qarab hisoblangan
           (yuqoridagi "to'langandan kam bo'lib qoladi" tekshiruvi). O'qish
           bilan yozish orasida qisman to'lov o'tsa, o'sha tekshiruv eskirgan
           bo'lib qoladi — shuning uchun yozuv aynan o'sha holatga shartlanadi. */
        const changed = await prisma.visitCharge.updateMany({
            where: { id: charge.id, clinicId, status: charge.status, paidAmount: charge.paidAmount },
            data: {
                discount, total: newTotal,
                status: newTotal <= round(charge.paidAmount || 0) + 0.001 ? 'Paid' : 'Unpaid',
            },
        });
        if (changed.count === 0) {
            return res.status(409).json({
                error: "Qator oradan o'zgardi (to'lov qabul qilingan bo'lishi mumkin). "
                    + 'Ro\'yxatni yangilab, chegirmani qaytadan bering.',
                code: 'CHARGE_CHANGED',
            });
        }
        const updated = await prisma.visitCharge.findUnique({ where: { id: charge.id } });

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
