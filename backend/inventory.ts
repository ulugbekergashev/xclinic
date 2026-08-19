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
import { tashkentDateStr, tashkentRangeBounds } from './tashkentTime';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

const round = (n: number) => Math.round(n * 1000) / 1000;
const today = () => tashkentDateStr();

/**
 * FEFO bo'yicha chiqim: muddati eng yaqin partiyadan boshlab yechadi.
 * Muddati ko'rsatilmagan partiyalar oxirida qoladi.
 *
 * Qoldiq yetmasa ham chiqim yoziladi (manfiy qoldiqqa yo'l qo'yamiz) — chunki
 * xizmat allaqachon ko'rsatilgan va uni "material yetmadi" deb bekor qilib
 * bo'lmaydi. Farq inventarizatsiyada ko'rinadi.
 */
export async function writeOff(prisma: any, input: {
    clinicId: string;
    itemId: string;
    quantity: number;
    reason: string;
    visitId?: string | null;
    serviceId?: number | null;
    note?: string | null;
    userName?: string | null;
}) {
    const { clinicId, itemId, quantity } = input;
    if (!(quantity > 0)) return [];

    const batches = await prisma.inventoryBatch.findMany({
        where: { itemId, quantity: { gt: 0 } },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });

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
        await prisma.inventoryBatch.update({
            where: { id: b.id },
            data: { quantity: round(b.quantity - take) },
        });
        moves.push(await prisma.stockMovement.create({
            data: {
                clinicId, itemId, batchId: b.id,
                type: 'Out', quantity: -take,
                reason: input.reason,
                visitId: input.visitId || null,
                serviceId: input.serviceId || null,
                note: input.note || null,
                userName: input.userName || null,
            },
        }));
        left = round(left - take);
    }

    // Partiyalar yetmadi — qolganini partiyasiz chiqim qilamiz
    if (left > 0) {
        moves.push(await prisma.stockMovement.create({
            data: {
                clinicId, itemId, batchId: null,
                type: 'Out', quantity: -left,
                reason: input.reason,
                visitId: input.visitId || null,
                serviceId: input.serviceId || null,
                note: [input.note, 'partiyasiz (qoldiq yetmadi)'].filter(Boolean).join(' · '),
                userName: input.userName || null,
            },
        }));
    }

    await prisma.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: { decrement: quantity } },
    });

    return moves;
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

    let cost = 0;
    for (const line of lines) {
        if (!line.item?.isConsumable) continue;
        await writeOff(prisma, {
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
        const { itemId, visitId, from, to } = req.query;
        const items = await prisma.stockMovement.findMany({
            where: {
                clinicId,
                ...(itemId ? { itemId: String(itemId) } : {}),
                ...(visitId ? { visitId: String(visitId) } : {}),
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
            include: { item: { select: { name: true, unit: true } }, batch: { select: { batchNumber: true, expiryDate: true } } },
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

        const batch = await prisma.inventoryBatch.create({
            data: {
                itemId, quantity: qty, cost: Number(cost) || 0,
                batchNumber: batchNumber || null, expiryDate: expiryDate || null,
            },
        });
        const move = await prisma.stockMovement.create({
            data: {
                clinicId, itemId, batchId: batch.id,
                type: 'In', quantity: qty, reason: 'Purchase',
                note: note || null, userName: userName || null,
            },
        });
        await prisma.inventoryItem.update({ where: { id: itemId }, data: { quantity: { increment: qty } } });
        res.json({ batch, move });
    });

    /** Qo'lda chiqim — buzilgan, muddati o'tgan, yo'qolgan */
    route('post', '/api/stock-movements/out', async (req, res, clinicId) => {
        const { itemId, quantity, reason, note, userName } = req.body;
        const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item || item.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const qty = Number(quantity);
        if (!(qty > 0)) return res.status(400).json({ error: "Miqdor noto'g'ri" });

        const moves = await writeOff(prisma, {
            clinicId, itemId, quantity: qty,
            reason: reason || 'Manual', note, userName,
        });
        res.json({ moves });
    });

    /** Inventarizatsiya — haqiqiy qoldiqqa tenglashtirish */
    route('post', '/api/stock-movements/adjust', async (req, res, clinicId) => {
        const { itemId, actualQuantity, note, userName } = req.body;
        const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item || item.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const actual = Number(actualQuantity);
        if (isNaN(actual)) return res.status(400).json({ error: "Qoldiq noto'g'ri" });

        const diff = round(actual - item.quantity);
        if (diff === 0) return res.json({ changed: false });

        const move = await prisma.stockMovement.create({
            data: {
                clinicId, itemId, type: 'Adjust', quantity: diff, reason: 'Inventory',
                note: note || `Inventarizatsiya: ${item.quantity} → ${actual}`,
                userName: userName || null,
            },
        });
        await prisma.inventoryItem.update({ where: { id: itemId }, data: { quantity: actual } });
        res.json({ changed: true, move, diff });
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
