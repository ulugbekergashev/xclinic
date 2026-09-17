/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — ombor harakatlari va xizmat retsepti.

   Ikki qoida butun modulni belgilaydi:

   1. Qoldiq hech qachon qo'lda yozilmaydi. Har bir o'zgarish — StockMovement
      qatori, qoldiq esa shu qatorlarning yig'indisi. Shunda "kim oldi, qachon
      yo'qoldi" degan savolga har doim javob bor.

   2. Chiqim FEFO bo'yicha: muddati eng yaqin partiyadan boshlanadi. Aks holda
      omborda muddati o'tgan qoldiq yig'ilib qoladi.

   Dorixona (sotuv) rejadan chiqarilgan — bu modul faqat sarflanadigan
   materiallar uchun.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { qty, som } from './money';
import { tashkentDateStr, tashkentRangeBounds } from './tashkentTime';
import { createCharge } from './billing';
import { emitEvent } from './events';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

/* Ombor miqdori — uch xona (0.5 ampula, 2.5 ml real qiymatlar).
   Pul emas, shuning uchun `som` emas, `qty`. */
const round = qty;
const today = () => tashkentDateStr();

/* ─── Vaqtinchalik xatolarda qayta urinish ────────────────────────────────
   SQLite bitta yozuvchiga ruxsat beradi. O'lchov (`_t_locking.ts`, 12 ta
   parallel tranzaksiya) hozirgi sozlamada qulf xatosi bermadi, lekin ombor
   chiqimi ALOHIDA holat: `multiprofile.ts` xatoni ATAYLAB yutadi (xizmat
   qo'shish to'xtamasin), ya'ni rollback bo'lgan chiqim JIMGINA yo'qoladi.
   (`inpatient.ts` ham yutardi — endi dori yozuvi, chiqim va hisob bitta
   tranzaksiyada va xato hamshiraga qaytadi.)

   Shuning uchun bu yerda qayta urinish shart, ixtiyoriy emas: tranzaksiya
   atomar bo'lgani uchun qayta urinish xavfsiz — yarim bajarilgan holat
   qolmaydi.                                                              */
const TRANSIENT = /database is locked|SQLITE_BUSY|Timed out fetching|Transaction already closed|P2028|P2034/i;

export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: any;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn();
        } catch (e: any) {
            lastErr = e;
            const msg = String(e?.message || e);
            if (!TRANSIENT.test(msg) || i === attempts) throw e;
            // Qisqa kutish: to'qnashuv odatda millisekundlarda tarqaydi
            await new Promise((r) => setTimeout(r, 40 * i));
            console.warn(`${label}: ${i}-urinish muvaffaqiyatsiz (${msg.slice(0, 60)}), qayta urinilmoqda`);
        }
    }
    throw lastErr;
}

export type StockClient = any;   // prisma yoki tranzaksiya klienti

/**
 * FEFO chiqimining O'ZAGI. `db` — prisma yoki tranzaksiya klienti.
 *
 * ATAYLAB tranzaksiya OCHMAYDI: uni chaqiruvchi ochadi. Shunda retsept
 * bo'yicha bir necha modda chiqarilganda hammasi BITTA tranzaksiyaga tushadi
 * va yarim bajarilgan retsept qolmaydi.
 *
 * Qoldiq yetmasa ham chiqim yoziladi (manfiy qoldiqqa yo'l qo'yamiz) — chunki
 * xizmat allaqachon ko'rsatilgan va uni "material yetmadi" deb bekor qilib
 * bo'lmaydi. Farq inventarizatsiyada ko'rinadi.
 */
export async function writeOffCore(db: StockClient, input: {
    clinicId: string;
    itemId: string;
    quantity: number;
    reason: string;
    visitId?: string | null;
    serviceId?: number | null;
    /** Bemor kartasidan sarflangan material — 0028 dan keyin shu yerda */
    patientId?: string | null;
    note?: string | null;
    userName?: string | null;
    /** Muddati o'tgan partiyani ATAYLAB sarflashga ruxsat (S2.5). */
    allowExpired?: boolean;
}) {
    const { clinicId, itemId, quantity } = input;
    if (!(quantity > 0)) return [];

    const all = await db.inventoryBatch.findMany({
        where: { itemId, quantity: { gt: 0 } },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });

    /* MUDDATI O'TGANLAR CHIQARIB TASHLANADI (S2.5, audit B-25).

       Bu yerda ilgari FEFO tartibi ishlardi — «muddati eng yaqini
       birinchi». Mantiq to'g'ri, lekin oqibati teskari edi: MUDDATI
       ALLAQACHON O'TGAN partiya ro'yxatning eng boshida turardi, ya'ni
       tizim yaroqsiz dorini BIRINCHI NAVBATDA sarflardi.

       Dev bazada 13 ta partiyaning muddati o'tgan va ularning hech biri
       hech narsani to'smasdi. */
    const today = tashkentDateStr();
    const isExpired = (b: any) => !!(b.expiryDate && b.expiryDate < today);
    const expired = all.filter(isExpired);
    const valid = all.filter((b: any) => !isExpired(b));

    /* PARTIYASIZ QOLDIQ ham yaroqli qoldiq. Mahsulot qoldig'i partiyalar
       yig'indisidan katta bo'lishi mumkin: 0028 dan oldingi boshlang'ich
       qoldiq, partiyasiz chiqimning bekor qilinishi. Ilgari tekshiruv faqat
       partiyalarni sanardi — omborda 50 dona tursa ham, bitta muddati o'tgan
       partiya bo'lgani uchun chiqim «qoldiq yetarli emas» deb to'xtardi. */
    const item = await db.inventoryItem.findUnique({ where: { id: itemId }, select: { quantity: true } });
    const inBatches = all.reduce((n: number, b: any) => n + b.quantity, 0);
    const unbatched = Math.max(0, round((item?.quantity || 0) - inBatches));

    if (!input.allowExpired && expired.length > 0) {
        const usable = round(valid.reduce((n: number, b: any) => n + b.quantity, 0) + unbatched);
        if (usable < quantity) {
            /* Jimgina partiyasiz chiqim qilib qo'ymaymiz: quyidagi
               `left > 0` shoxi aynan shuni qilardi va yaroqsiz dori
               «yo'q» bo'lib ko'rinardi. Sabab aniq aytiladi. */
            const err: any = new Error(
                `Yaroqli qoldiq yetarli emas: ${usable} bor, ${quantity} kerak. ` +
                `Muddati o'tgan ${expired.length} ta partiya hisobga olinmadi.`);
            err.code = 'EXPIRED_STOCK_BLOCKED';
            err.expired = expired.map((b: any) => ({
                id: b.id, batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: b.quantity,
            }));
            err.usable = usable;
            throw err;
        }
    }

    // Muddati ko'rsatilmaganlarni oxirga suramiz
    const fefo = (a: any, b: any) => {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
    };
    valid.sort(fefo);
    expired.sort(fefo);

    let left = quantity;
    const moves: any[] = [];

    const takeFrom = async (list: any[]) => {
        for (const b of list) {
            if (left <= 0) break;
            const take = Math.min(left, b.quantity);
            await db.inventoryBatch.update({
                where: { id: b.id },
                data: { quantity: round(b.quantity - take) },
            });
            moves.push(await db.stockMovement.create({
                data: {
                    clinicId, itemId, batchId: b.id,
                    type: 'Out', quantity: -take,
                    reason: input.reason,
                    visitId: input.visitId || null,
                    serviceId: input.serviceId || null,
                    patientId: input.patientId || null,
                    note: input.note || null,
                    userName: input.userName || null,
                },
            }));
            left = round(left - take);
        }
    };
    const takeUnbatched = async (amount: number, why: string) => {
        if (!(amount > 0)) return;
        moves.push(await db.stockMovement.create({
            data: {
                clinicId, itemId, batchId: null,
                type: 'Out', quantity: -amount,
                reason: input.reason,
                visitId: input.visitId || null,
                serviceId: input.serviceId || null,
                patientId: input.patientId || null,
                note: [input.note, why].filter(Boolean).join(' · '),
                userName: input.userName || null,
            },
        }));
        left = round(left - amount);
    };

    /* TARTIB: yaroqli partiyalar (FEFO) → partiyasiz qoldiq → muddati
       o'tganlar (faqat `allowExpired` bilan) → yetmagan qism.

       Ilgari `allowExpired` da hamma partiya bitta FEFO ro'yxatida edi va
       muddati o'tgan partiya ENG BOSHIDA turardi: «majburan» chiqimda
       yaroqli dori qutida qolib, yaroqsizi birinchi sarflanardi. Ruxsat
       yaroqsizni ISHLATISHGA, uni birinchi navbatga qo'yishga emas. */
    await takeFrom(valid);
    await takeUnbatched(Math.min(left, unbatched), 'partiyasiz qoldiqdan');
    if (input.allowExpired) await takeFrom(expired);
    // Hech narsa yetmadi — qolganini partiyasiz chiqim qilamiz (manfiy qoldiq)
    await takeUnbatched(left, 'partiyasiz (qoldiq yetmadi)');

    await db.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: { decrement: quantity } },
    });

    return moves;
}

/**
 * Bitta moddani chiqim qilish — TASHQI chaqiruvchilar uchun.
 * O'z tranzaksiyasini ochadi va vaqtinchalik xatoda qayta urinadi.
 */
export async function writeOff(prisma: any, input: Parameters<typeof writeOffCore>[1]): Promise<any[]> {
    return withRetry<any[]>('Ombor chiqimi', () =>
        prisma.$transaction((tx: any) => writeOffCore(tx, input), { timeout: 15000, maxWait: 10000 }),
    );
}

/** Retsept chiqimi qaysi muolajaga tegishli — izohdagi yorliq. Sxemada
 *  alohida ustun yo'q; muolaja o'chirilganda aynan uning chiqimi shu
 *  yorliq bo'yicha topilib, omborga qaytariladi. */
export const procedureTag = (procedureId: string) => `muolaja:${procedureId}`;

/**
 * Xizmat retsepti bo'yicha materiallarni avtomatik chiqim qiladi.
 * Xizmat qabulga qo'shilganda chaqiriladi. Retsept yo'q bo'lsa hech narsa
 * qilmaydi — bu normal holat, hamma xizmatga retsept yozish shart emas.
 */
export async function applyServiceRecipe(prisma: any, input: {
    clinicId: string;
    serviceId: number;
    visitId?: string | null;
    userName?: string | null;
    /** Chiqimni muolajaga bog'lash — o'chirilganda qaytarish uchun */
    procedureId?: string | null;
}) {
    const lines = await prisma.serviceRecipe.findMany({
        where: { serviceId: input.serviceId, clinicId: input.clinicId },
        include: { item: true },
    });
    if (lines.length === 0) return { applied: 0, cost: 0 };

    /* HAMMA modda BITTA tranzaksiyada. Ilgari har modda uchun alohida
       `writeOff` chaqirilardi — ya'ni uchinchi moddada xato bo'lsa, birinchi
       ikkitasi ombordan yechilgan holda qolardi. Retsept bo'linmas: yo
       hammasi chiqadi, yo hech biri.

       Ichkarida `writeOffCore` TO'G'RIDAN-TO'G'RI chaqiriladi — `writeOff`
       o'z tranzaksiyasini ochadi va ichma-ich tranzaksiya bo'lardi. */
    return withRetry('Retsept bo\'yicha chiqim', () =>
        prisma.$transaction(async (tx: any) => {
            let cost = 0;
            for (const line of lines) {
                if (!line.item?.isConsumable) continue;
                await writeOffCore(tx, {
                    clinicId: input.clinicId,
                    itemId: line.itemId,
                    quantity: line.quantity,
                    reason: 'Service',
                    visitId: input.visitId,
                    serviceId: input.serviceId,
                    note: [`Retsept: ${line.item?.name || ''}`,
                        input.procedureId ? procedureTag(input.procedureId) : null]
                        .filter(Boolean).join(' · '),
                    userName: input.userName,
                });
                cost += (line.item?.price || 0) * line.quantity;
            }
            return { applied: lines.length, cost: round(cost) };
        }, { timeout: 20000, maxWait: 10000 }),
    );
}

/**
 * Bitta chiqimni bekor qilish — OCHIQ TRANZAKSIYA ichida (`tx`).
 *
 * Ikki chaqiruvchisi bor: `POST /api/stock-movements/:id/reverse` va
 * muolajani o'chirish (`multiprofile.ts`) — retsept bo'yicha chiqqan
 * material omborga qaytadi. Mantiq bitta joyda: ikki nusxa birinchi
 * o'zgarishdayoq ajralib ketardi.
 *
 * Xatoni TASHLAMAYDI, kod qaytaradi: chaqiruvchi o'zi hal qiladi.
 */
export async function reverseMovementTx(tx: any, clinicId: string, id: string, opts: {
    note?: string | null; userName?: string | null;
} = {}): Promise<
    | { code: 200; move: any; chargesCancelled: number; chargesAdjusted: number }
    | { code: 400 | 403 | 409; error?: string }
> {
    const move = await tx.stockMovement.findUnique({ where: { id } });
    if (!move || move.clinicId !== clinicId) return { code: 403 };
    if (move.type !== 'Out') return { code: 400, error: 'Faqat chiqimni bekor qilish mumkin' };

    const already = await tx.stockMovement.findFirst({ where: { reversalOfId: id } });
    if (already) return { code: 409, error: 'Bu chiqim allaqachon bekor qilingan' };

    const back = -move.quantity;   // chiqim manfiy edi → qaytish musbat

    if (move.batchId) {
        await tx.inventoryBatch.update({
            where: { id: move.batchId },
            data: { quantity: { increment: back } },
        });
    }
    await tx.inventoryItem.update({
        where: { id: move.itemId },
        data: { quantity: { increment: back } },
    });

    const created = await tx.stockMovement.create({
        data: {
            clinicId, itemId: move.itemId, batchId: move.batchId,
            type: 'In', quantity: back, reason: 'Manual',
            patientId: move.patientId, visitId: move.visitId,
            reversalOfId: id,
            note: opts.note || 'Chiqim bekor qilindi',
            userName: opts.userName || null,
        },
    });

    /* HISOB QATORI — QAYTARILGAN MIQDORGA PROPORSIONAL.

       Bemorga berilgan material bir necha partiyadan chiqsa, harakat ham
       bir nechta bo'ladi, qator esa BITTA (butun miqdorga). Ilgari qator
       faqat BIRINCHI harakatga bog'lanardi: ikkinchi partiyaning chiqimi
       bekor qilinsa pul joyida qolardi, birinchisiniki bekor qilinsa esa
       qator BUTUNLAY bekor bo'lib, qolgan material bepul ketardi.

       Endi qator hamma harakatga bog'langan (`sourceId` — id lar vergul
       bilan) va har bekor qilishda miqdori qaytgan qismga kamayadi. Nolga
       tushsa bekor qilinadi.

       PULI OLINGAN qatorga tegilmaydi — uni faqat kassadagi qaytarish
       yechadi (`billing.ts` dagi qoida bilan bir xil). */
    let chargesCancelled = 0;
    let chargesAdjusted = 0;
    const linked = await tx.visitCharge.findMany({
        where: {
            clinicId, source: 'Medication', status: 'Unpaid', paidAmount: { lt: 0.5 },
            sourceId: { contains: id },
        },
    });
    for (const c of linked) {
        // `contains` — faqat vergulli ro'yxatdagi ANIQ id (qism-satr emas)
        if (!String(c.sourceId || '').split(',').includes(id)) continue;
        const newQty = round((c.quantity || 0) - back);
        const newTotal = som(Math.max(0, c.unitPrice * newQty - (c.discount || 0)));
        const r = await tx.visitCharge.updateMany({
            where: { id: c.id, status: 'Unpaid', paidAmount: c.paidAmount, quantity: c.quantity },
            data: newQty <= 0.0005 || newTotal <= 0
                ? { status: 'Cancelled' }
                : { quantity: newQty, total: newTotal },
        });
        if (r.count === 0) continue;
        if (newQty <= 0.0005 || newTotal <= 0) chargesCancelled++; else chargesAdjusted++;
    }

    return { code: 200, move: created, chargesCancelled, chargesAdjusted };
}

export function registerInventoryRoutes(app: express.Express, deps: Deps) {
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

    // ═══ HARAKATLAR ══════════════════════════════════════════════════════════

    route('get', '/api/stock-movements', async (req, res, clinicId) => {
        const { itemId, visitId, patientId, from, to } = req.query;
        const items = await prisma.stockMovement.findMany({
            where: {
                clinicId,
                ...(itemId ? { itemId: String(itemId) } : {}),
                ...(visitId ? { visitId: String(visitId) } : {}),
                ...(patientId ? { patientId: String(patientId) } : {}),
                /* Chegaralar Toshkent kuni bo'yicha. Ilgari `gte` UTC,
                   `lte` esa lokal vaqtda o'lchanardi (reports.ts dagi bilan
                   bir xil xato) va davr boshidagi harakatlar tushib qolardi. */
                ...(from || to ? {
                    createdAt: {
                        ...(from ? { gte: tashkentRangeBounds(String(from), String(from)).start } : {}),
                        ...(to ? { lte: tashkentRangeBounds(String(to), String(to)).end } : {}),
                    },
                } : {}),
            },
            include: {
                item: { select: { name: true, unit: true } },
                batch: { select: { batchNumber: true, expiryDate: true } },
                patient: { select: { firstName: true, lastName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 300,
        });
        res.json(items);
    });

    /** Kirim — partiya bilan */
    route('post', '/api/stock-movements/in', async (req, res, clinicId) => {
        const { itemId, quantity, cost, batchNumber, expiryDate, note, userName } = req.body;
        const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item || item.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const qty = Number(quantity);
        if (!(qty > 0)) return res.status(400).json({ error: "Miqdor noto'g'ri" });

        /* ─── KIRIM XARAJAT HAM YOZADI ──────────────────────────────────

           Ilgari kirim faqat partiya, harakat va qoldiqni yozardi. Ya'ni
           OMBORGA SARFLANGAN PUL foyda hisobiga UMUMAN tushmasdi: klinika
           dori sotib oladi, hisobotda esa xarajat yo'q. U faqat material
           SARFLANGANDA, tannarx sifatida ko'rinardi — sotib olingan, lekin
           hali ishlatilmagan tovar esa hech qayerda.

           Kassir buni qo'lda «Ombor» toifasidagi xarajat bilan
           qoplashi kerak edi va tabiiyki qoplamasdi.

           Narx berilmasa (0) xarajat yozilmaydi: bepul kelgan yoki narxi
           noma'lum tovar uchun nol summali qator faqat aralashtiradi. */
        const totalCost = som((Number(cost) || 0) * qty);

        const { batch, move } = await withRetry<any>('Ombor kirimi', () =>
            prisma.$transaction(async (tx: any) => {
                const batch = await tx.inventoryBatch.create({
                    data: {
                        itemId, quantity: qty, cost: Number(cost) || 0,
                        batchNumber: batchNumber || null, expiryDate: expiryDate || null,
                    },
                });
                const move = await tx.stockMovement.create({
                    data: {
                        clinicId, itemId, batchId: batch.id,
                        type: 'In', quantity: qty, reason: 'Purchase',
                        note: note || null, userName: userName || null,
                    },
                });
                await tx.inventoryItem.update({
                    where: { id: itemId }, data: { quantity: { increment: qty } },
                });
                if (totalCost > 0) {
                    await tx.expense.create({
                        data: {
                            clinicId,
                            date: tashkentDateStr(),
                            category: 'Inventory',
                            title: `Ombor: ${item.name}`,
                            amount: totalCost,
                            /* Usul ko'rsatilmasa kassa yashig'iga ta'sir
                               qilmaydi — ko'pincha tovar o'tkazma bilan
                               olinadi. Kassir naqd bergan bo'lsa, kassada
                               tuzatadi. */
                            method: String(req.body?.method || 'Transfer'),
                            note: note || null,
                            inventoryItemId: itemId,
                            /* Mahsulot bo'limga biriktirilgan bo'lsa xarajat ham
                               o'sha bo'limga tushadi — «qaysi bo'lim foydali»
                               hisoboti shundagina to'g'ri bo'ladi. */
                            departmentId: item.departmentId || null,
                        },
                    });
                }
                return { batch, move };
            }, { timeout: 15000, maxWait: 10000 }),
        );
        res.json({ batch, move, expenseAmount: totalCost });
    });

    /**
     * Qo'lda chiqim — buzilgan, muddati o'tgan, yo'qolgan, va BEMOR
     * KARTASIDAN sarflangan material (`patientId` bilan).
     *
     * Bemor materiali ilgari `PUT /api/inventory/:id/stock` orqali eski
     * jurnalga tushardi va partiyalarga tegmasdi — 0028 dan keyin u ham shu
     * yerdan, FEFO bo'yicha o'tadi.
     */
    route('post', '/api/stock-movements/out', async (req, res, clinicId) => {
        const { itemId, quantity, reason, note, userName, patientId, visitId } = req.body;
        const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item || item.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const qty = Number(quantity);
        if (!(qty > 0)) return res.status(400).json({ error: "Miqdor noto'g'ri" });

        // Bemor ham shu klinikadan bo'lishi shart — aks holda begona bemorga
        // material yozib, uni ko'rinmas qilib qo'yish mumkin bo'lardi
        if (patientId) {
            const p = await prisma.patient.findUnique({ where: { id: String(patientId) } });
            if (!p || p.clinicId !== clinicId) {
                return res.status(400).json({ error: 'Bemor topilmadi yoki boshqa klinikaga tegishli' });
            }
        }

        /* `force: true` — muddati o'tgan partiyani ATAYLAB sarflash.
           Server TO'SMAYDI, TANLOV beradi: loyihadagi mavjud naqsh
           (bemor dublikati, qabul to'qnashuvi). Sarflangani jurnalda
           ko'rinib turadi. */
        let moves;
        try {
            moves = await writeOff(prisma, {
                clinicId, itemId, quantity: qty,
                reason: reason || 'Manual', note,
                allowExpired: !!req.body.force,
            // Ism mijozdan kelmasa tokendan olinadi: jurnalda «kim» ustuni
            // bo'sh qolmasligi kerak
                userName: userName || req.user?.name || null,
                patientId: patientId || null,
                visitId: visitId || null,
            });
        } catch (e: any) {
            if (e?.code === 'EXPIRED_STOCK_BLOCKED') {
                return res.status(409).json({
                    error: e.message, code: e.code, expired: e.expired, usable: e.usable,
                });
            }
            throw e;
        }

        /* ─── BEMORGA BERILGAN MATERIAL KASSAGA HAM TUSHADI ─────────

           Statsionarda dori berilganda hisob qatori YARATILADI
           (`inpatient.ts`, `source: 'Medication'`). Bemor kartasidan
           berilganda esa — YO'Q edi: material omborda kamayardi, pul esa
           hech qayerda ko'rinmasdi. Ya'ni shifokor bemorga plomba
           materialini beradi, kassada hech narsa yo'q va bemor
           to'lamasdan ketadi.

           Farq mantiqiy emas edi — ikki ekran har xil vaqtda yozilgani
           uchun shunday chiqqan.

           Qoidalar:
             · faqat BEMORGA berilganda (`patientId` bor);
             · faqat narxi ko'rsatilgan materialda — narxsizga nol
               summali qator ochish kassani chalg'itadi;
             · `skipCharge: true` bilan chetlab o'tish mumkin: xizmat
               retseptiga kiruvchi material xizmat narxida allaqachon
               hisoblangan, uni ikkinchi marta yozib bo'lmaydi. */
        let charge = null;
        const unitPrice = Number(item.price) || 0;
        if (patientId && unitPrice > 0 && req.body?.skipCharge !== true) {
            const p = await prisma.patient.findUnique({
                where: { id: String(patientId) },
                select: { firstName: true, lastName: true },
            });
            charge = await createCharge(prisma, {
                clinicId,
                patientId: String(patientId),
                patientName: `${p?.lastName || ''} ${p?.firstName || ''}`.trim(),
                visitId: visitId || null,
                source: 'Medication',
                /* HAMMA harakat id si — material bir necha partiyadan chiqqan
                   bo'lishi mumkin va istalgan birining bekor qilinishi
                   qatorga yetib borishi kerak (`reverseMovementTx`). */
                sourceId: moves.map((m: any) => m.id).join(',') || null,
                name: item.name,
                unitPrice,
                quantity: qty,
                createdByName: userName || req.user?.name || null,
            });
        }

        res.json({ moves, charge });
    });

    /**
     * Chiqimni bekor qilish — material xato yozilgan bo'lsa.
     *
     * Harakat O'CHIRILMAYDI. Ilgari bemor kartasidagi «o'chirish» tugmasi
     * jurnal qatorini yo'q qilardi: qoldiq tiklanardi, lekin «kim, qachon,
     * nega» degan iz ham yo'qolardi. Endi teskari harakat yoziladi —
     * ikkala qator ham jurnalda qoladi.
     */
    route('post', '/api/stock-movements/:id/reverse', async (req, res, clinicId) => {
        const { note, userName } = req.body || {};
        const id = req.params.id;

        /* Chiqim bekor qilinsa, u tug'dirgan hisob qatori ham kamayadi yoki
           bekor bo'ladi — aks holda material qaytarilgan, pul esa kassaning
           «to'lanmagan» ro'yxatida abadiy qolardi. Mantiq `reverseMovementTx`
           da: muolajani o'chirish ham shuni ishlatadi. */
        const result = await withRetry<any>('Chiqimni bekor qilish', () =>
            prisma.$transaction(
                (tx: any) => reverseMovementTx(tx, clinicId, id, {
                    note, userName: userName || req.user?.name || null,
                }),
                { timeout: 15000, maxWait: 10000 },
            ),
        );

        if (result.code !== 200) {
            return res.status(result.code).json({ error: result.error || "Ruxsat yo'q" });
        }
        if (result.chargesCancelled > 0 || result.chargesAdjusted > 0) {
            emitEvent(clinicId, 'charge.changed', { reason: 'material-reversed' });
        }
        res.json({
            move: result.move,
            chargesCancelled: result.chargesCancelled,
            chargesAdjusted: result.chargesAdjusted,
        });
    });

    /**
     * Bo'limlar orasida ko'chirish.
     *
     * Nima uchun alohida amal. Ilgari ko'chirishni "chiqim + kirim" deb yozish
     * kerak edi, va bunda ikkita muammo bor: qoldiq oraliqda noto'g'ri
     * ko'rinadi, va "qayerdan qayerga" ma'lumoti hech qayerda saqlanmaydi.
     *
     * Umumiy qoldiq O'ZGARMAYDI: bu klinika ichidagi harakat, tovar hech
     * qayoqqa ketmaydi. Shuning uchun `InventoryItem.quantity` ga tegilmaydi —
     * faqat 'Transfer' turidagi qator yoziladi.
     */
    route('post', '/api/stock-movements/transfer', async (req, res, clinicId) => {
        const { itemId, quantity, fromDepartmentId, toDepartmentId, note, userName } = req.body;

        const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item || item.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const qty = Number(quantity);
        if (!(qty > 0)) return res.status(400).json({ error: "Miqdor noto'g'ri" });
        if (!toDepartmentId) return res.status(400).json({ error: "Qabul qiluvchi bo'lim majburiy" });
        if (fromDepartmentId && fromDepartmentId === toDepartmentId) {
            return res.status(400).json({ error: "Bir xil bo'lim ko'rsatilgan" });
        }
        if (qty > (item.quantity || 0)) {
            return res.status(409).json({ error: `Qoldiq yetarli emas (mavjud: ${item.quantity})` });
        }

        // Ikki bo'lim ham shu klinikadan bo'lishi shart
        for (const depId of [fromDepartmentId, toDepartmentId].filter(Boolean)) {
            const dep = await prisma.department.findUnique({ where: { id: depId } });
            if (!dep || dep.clinicId !== clinicId) {
                return res.status(400).json({ error: "Bo'lim topilmadi yoki boshqa klinikaga tegishli" });
            }
        }

        const move = await prisma.stockMovement.create({
            data: {
                clinicId, itemId,
                type: 'Transfer',
                // Umumiy qoldiq o'zgarmaydi — miqdor ma'lumot uchun musbat yoziladi
                quantity: qty,
                reason: 'Manual',
                fromDepartmentId: fromDepartmentId || null,
                toDepartmentId,
                note: note || null,
                userName: userName || null,
            },
        });
        res.json({ move });
    });

    /** Inventarizatsiya — haqiqiy qoldiqqa tenglashtirish */
    route('post', '/api/stock-movements/adjust', async (req, res, clinicId) => {
        const { itemId, actualQuantity, note, userName } = req.body;
        const actual = Number(actualQuantity);
        if (isNaN(actual)) return res.status(400).json({ error: "Qoldiq noto'g'ri" });

        /* Qoldiq tranzaksiya ICHIDA o'qiladi. Ilgari tashqarida o'qilardi va
           o'sha oraliqda chiqim o'tsa, `diff` eskirgan qoldiqdan hisoblanib,
           inventarizatsiya o'sha chiqimni O'CHIRIB tashlardi. */
        const result = await withRetry<any>('Inventarizatsiya', () =>
            prisma.$transaction(async (tx: any) => {
                const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
                if (!item || item.clinicId !== clinicId) return { forbidden: true };

                const diff = round(actual - item.quantity);
                if (diff === 0) return { changed: false };

                const baseNote = note || `Inventarizatsiya: ${item.quantity} → ${actual}`;

                /* PARTIYALAR HAM KAMAYADI. Ilgari faqat mahsulot qoldig'i
                   o'zgarardi: sanashda 10 ta kam chiqsa ham partiyalar
                   eskicha turardi va FEFO keyin YO'Q tovarni «partiyadan»
                   chiqarardi — qoldiq bilan partiyalar orasidagi farq shu
                   yerdan boshlanardi.

                   Kamomad avval partiyasiz qoldiqdan, keyin partiyalardan
                   yechiladi: muddati o'tganlar birinchi (ular odatda
                   tashlab yuborilgan), keyin muddati yaqinlari. Har partiya
                   o'z harakatini oladi — «partiya qoldig'i = uning
                   harakatlari yig'indisi» invarianti buzilmaydi. */
                const moves: any[] = [];
                let batchPart = 0;
                if (diff < 0) {
                    const batches = await tx.inventoryBatch.findMany({
                        where: { itemId, quantity: { gt: 0 } },
                    });
                    const inBatches = round(batches.reduce((n: number, b: any) => n + b.quantity, 0));
                    // Partiyalar haqiqiy qoldiqdan qanchaga oshib ketgan
                    let excess = round(Math.min(-diff, inBatches - Math.max(0, actual)));
                    const todayStr = tashkentDateStr();
                    const rank = (b: any) => (b.expiryDate && b.expiryDate < todayStr ? 0 : 1);
                    batches.sort((a: any, b: any) => rank(a) - rank(b)
                        || String(a.expiryDate || '9999').localeCompare(String(b.expiryDate || '9999')));
                    for (const b of batches) {
                        if (!(excess > 0)) break;
                        const take = round(Math.min(excess, b.quantity));
                        await tx.inventoryBatch.update({
                            where: { id: b.id }, data: { quantity: round(b.quantity - take) },
                        });
                        moves.push(await tx.stockMovement.create({
                            data: {
                                clinicId, itemId, batchId: b.id, type: 'Adjust', quantity: -take,
                                reason: 'Inventory', note: baseNote, userName: userName || null,
                            },
                        }));
                        batchPart = round(batchPart + take);
                        excess = round(excess - take);
                    }
                }

                const rest = round(diff + batchPart);   // partiyasiz qism
                if (rest !== 0) {
                    moves.push(await tx.stockMovement.create({
                        data: {
                            clinicId, itemId, type: 'Adjust', quantity: rest, reason: 'Inventory',
                            note: baseNote, userName: userName || null,
                        },
                    }));
                }
                await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: actual } });
                return { changed: true, move: moves[moves.length - 1], moves, diff };
            }, { timeout: 15000, maxWait: 10000 }),
        );
        if ((result as any).forbidden) return res.status(403).json({ error: "Ruxsat yo'q" });
        res.json(result);
    });

    /**
     * Mahsulot xossalarini tahrirlash.
     * Miqdor bu yerda O'ZGARMAYDI — u faqat harakatlar orqali o'zgaradi.
     */
    route('put', '/api/inventory-items/:id', async (req, res, clinicId) => {
        const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
        if (!item || item.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const { name, unit, minQuantity, price, isMedication, isConsumable,
                form, activeIngredient, departmentId } = req.body;

        const updated = await prisma.inventoryItem.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(unit !== undefined && { unit }),
                ...(minQuantity !== undefined && { minQuantity: Number(minQuantity) || 0 }),
                // Tannarx — xizmat retsepti shu narxdan hisoblanadi
                ...(price !== undefined && { price: Number(price) || 0 }),
                ...(isMedication !== undefined && { isMedication: !!isMedication }),
                ...(isConsumable !== undefined && { isConsumable: !!isConsumable }),
                ...(form !== undefined && { form }),
                ...(activeIngredient !== undefined && { activeIngredient }),
                ...(departmentId !== undefined && { departmentId }),
            },
        });
        res.json(updated);
    });

    // ═══ XIZMAT RETSEPTI ═════════════════════════════════════════════════════

    route('get', '/api/service-recipes', async (req, res, clinicId) => {
        const { serviceId } = req.query;
        const lines = await prisma.serviceRecipe.findMany({
            where: { clinicId, ...(serviceId ? { serviceId: Number(serviceId) } : {}) },
            include: { item: { select: { id: true, name: true, unit: true, price: true } } },
        });
        res.json(lines);
    });

    /** Retseptni to'liq almashtiradi */
    route('put', '/api/service-recipes/:serviceId', async (req, res, clinicId) => {
        const serviceId = Number(req.params.serviceId);
        const svc = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!svc || svc.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const { lines } = req.body as { lines: { itemId: string; quantity: number; note?: string }[] };
        if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines massiv bo\'lishi kerak' });

        await prisma.serviceRecipe.deleteMany({ where: { serviceId } });
        for (const l of lines) {
            if (!l.itemId || !(Number(l.quantity) > 0)) continue;
            await prisma.serviceRecipe.create({
                data: { clinicId, serviceId, itemId: l.itemId, quantity: Number(l.quantity), note: l.note || null },
            });
        }
        const saved = await prisma.serviceRecipe.findMany({
            where: { serviceId }, include: { item: { select: { id: true, name: true, unit: true, price: true } } },
        });
        res.json(saved);
    });

    /** Xizmat tannarxi — retsept bo'yicha */
    route('get', '/api/service-recipes/:serviceId/cost', async (req, res, clinicId) => {
        const serviceId = Number(req.params.serviceId);
        const svc = await prisma.service.findUnique({ where: { id: serviceId } });
        if (!svc || svc.clinicId !== clinicId) return res.status(404).json({ error: 'Xizmat topilmadi' });

        const lines = await prisma.serviceRecipe.findMany({
            where: { serviceId }, include: { item: true },
        });
        const cost = round(lines.reduce((s: number, l: any) => s + (l.item?.price || 0) * l.quantity, 0));
        res.json({
            serviceId, price: svc.price, cost,
            margin: round(svc.price - cost),
            marginPercent: svc.price > 0 ? Math.round(((svc.price - cost) / svc.price) * 100) : 0,
            lines: lines.length,
        });
    });

    // ═══ OGOHLANTIRISHLAR ════════════════════════════════════════════════════

    /** Muddati o'tgan/yaqinlashgan va minimal qoldiqdan tushganlar */
    route('get', '/api/inventory-alerts', async (req, res, clinicId) => {
        const days = Number(req.query.days) || 60;
        // Chegara ham Toshkent kuni bo'yicha
        const limit = tashkentDateStr(days);
        const now = today();

        const [batches, low] = await Promise.all([
            prisma.inventoryBatch.findMany({
                where: { quantity: { gt: 0 }, expiryDate: { not: null, lte: limit }, item: { clinicId } },
                include: { item: { select: { id: true, name: true, unit: true } } },
                orderBy: { expiryDate: 'asc' },
            }),
            prisma.$queryRawUnsafe(
                `SELECT id, name, unit, quantity, minQuantity FROM "InventoryItem"
                 WHERE clinicId = ? AND minQuantity > 0 AND quantity <= minQuantity`,
                clinicId,
            ),
        ]);

        res.json({
            expiring: batches.map((b: any) => ({ ...b, expired: !!b.expiryDate && b.expiryDate < now })),
            lowStock: low,
        });
    });

    console.log('✅ Ombor endpointlari ulandi');
}
