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
import { qty } from './money';
import { tashkentDateStr, tashkentRangeBounds } from './tashkentTime';

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
   chiqimi ALOHIDA holat: uning ikki chaqiruvchisi xatoni ATAYLAB yutadi —
   `inpatient.ts` (dori berish fakti ombor xatosi tufayli yo'qolmasin) va
   `multiprofile.ts` (xizmat qo'shish to'xtamasin). Ikkalasi ham to'g'ri
   qaror, lekin natijada rollback bo'lgan chiqim JIMGINA yo'qoladi.

   Shuning uchun bu yerda qayta urinish shart, ixtiyoriy emas: tranzaksiya
   atomar bo'lgani uchun qayta urinish xavfsiz — yarim bajarilgan holat
   qolmaydi.                                                              */
const TRANSIENT = /database is locked|SQLITE_BUSY|Timed out fetching|Transaction already closed|P2028|P2034/i;

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
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
async function writeOffCore(db: StockClient, input: {
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
    const expired = all.filter((b: any) => b.expiryDate && b.expiryDate < today);
    const batches = input.allowExpired ? all : all.filter((b: any) => !(b.expiryDate && b.expiryDate < today));

    if (!input.allowExpired && expired.length > 0) {
        const usable = batches.reduce((n: number, b: any) => n + b.quantity, 0);
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
    batches.sort((a: any, b: any) => {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
    });

    let left = quantity;
    const moves: any[] = [];

    for (const b of batches) {
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

    // Partiyalar yetmadi — qolganini partiyasiz chiqim qilamiz
    if (left > 0) {
        moves.push(await db.stockMovement.create({
            data: {
                clinicId, itemId, batchId: null,
                type: 'Out', quantity: -left,
                reason: input.reason,
                visitId: input.visitId || null,
                serviceId: input.serviceId || null,
                patientId: input.patientId || null,
                note: [input.note, 'partiyasiz (qoldiq yetmadi)'].filter(Boolean).join(' · '),
                userName: input.userName || null,
            },
        }));
    }

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
                    note: `Retsept: ${line.item?.name || ''}`,
                    userName: input.userName,
                });
                cost += (line.item?.price || 0) * line.quantity;
            }
            return { applied: lines.length, cost: round(cost) };
        }, { timeout: 20000, maxWait: 10000 }),
    );
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

        /* Uchta yozuv — bitta tranzaksiyada. Ilgari alohida edi: o'rtada
           uzilsa partiya yaratilib, qoldiq oshmay qolardi yoki teskarisi. */
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
                return { batch, move };
            }, { timeout: 15000, maxWait: 10000 }),
        );
        res.json({ batch, move });
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
        res.json({ moves });
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

        const result = await withRetry<any>('Chiqimni bekor qilish', () =>
            prisma.$transaction(async (tx: any) => {
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
                        note: note || 'Chiqim bekor qilindi',
                        userName: userName || req.user?.name || null,
                    },
                });
                return { code: 200, move: created };
            }, { timeout: 15000, maxWait: 10000 }),
        );

        if (result.code !== 200) {
            return res.status(result.code).json({ error: result.error || "Ruxsat yo'q" });
        }
        res.json({ move: result.move });
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

                const move = await tx.stockMovement.create({
                    data: {
                        clinicId, itemId, type: 'Adjust', quantity: diff, reason: 'Inventory',
                        note: note || `Inventarizatsiya: ${item.quantity} → ${actual}`,
                        userName: userName || null,
                    },
                });
                await tx.inventoryItem.update({ where: { id: itemId }, data: { quantity: actual } });
                return { changed: true, move, diff };
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
