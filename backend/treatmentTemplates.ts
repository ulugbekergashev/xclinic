/* DAVOLASH TO'PLAMI (2026-11-26) — «O'RVI: shu 3 dori, ko'rik va qon tahlili».

   Olti maslahatchi bilan kelishilgan:
   • Shifokor to'plamni qabul ichidan yaratadi («Shu qabulni saqlash»):
     shu qabulning dorilari, xizmatlari, tahlillari va asosiy tashxisi.
     Alohida sozlash sahifasi YO'Q.
   • Shifokor yaratgani — o'ziniki (doctorId). Ega yaratgani — klinikaniki
     (doctorId NULL), hamma shifokorga ko'rinadi.
   • Qo'llash shu yerda EMAS: front mavjud yo'llardan (retsept, xizmat,
     tahlil) yozadi — narx, ruxsat va allergiya tekshiruvi bir joyda qoladi.
     Bu yerda faqat «ishlatildi» soni oshadi (tartib uchun). */
import type express from 'express';
import { actsAs } from './permissions';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

const MAX_ITEMS = 40;
const MEALS = new Set(['before', 'with', 'after']);

const str = (v: any, max = 200) => (v == null ? null : String(v).trim().slice(0, max) || null);

/** Kelgan tarkibni tozalaydi: noma'lum tur, bo'sh nom, ortiqcha maydon tashlanadi */
export function sanitizeItems(raw: any): any[] {
    const list = Array.isArray(raw) ? raw : [];
    const out: any[] = [];
    for (const it of list.slice(0, MAX_ITEMS)) {
        if (it?.kind === 'drug' && str(it.name)) {
            out.push({
                kind: 'drug', name: str(it.name), medicationId: str(it.medicationId, 64),
                dosage: str(it.dosage, 80), frequency: str(it.frequency, 80),
                durationDays: Number(it.durationDays) > 0 ? Math.min(365, Math.round(Number(it.durationDays))) : null,
                mealTiming: MEALS.has(it.mealTiming) ? it.mealTiming : null,
                instructions: str(it.instructions, 300),
            });
        } else if (it?.kind === 'service' && Number.isInteger(Number(it.serviceId))) {
            out.push({ kind: 'service', serviceId: Number(it.serviceId) });
        } else if (it?.kind === 'lab' && str(it.labTestId, 64)) {
            out.push({ kind: 'lab', labTestId: str(it.labTestId, 64) });
        }
    }
    return out;
}

const parse = (s: string | null, fallback: any) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

const toDto = (t: any) => ({
    id: t.id, name: t.name, doctorId: t.doctorId || null, shared: !t.doctorId,
    icdCodes: parse(t.icdCodes, []), items: parse(t.items, []),
    useCount: t.useCount, lastUsedAt: t.lastUsedAt, createdByName: t.createdByName,
});

export function registerTreatmentTemplateRoutes(app: express.Express, { prisma, authenticateToken, getScopedClinicId }: Deps) {
    const route = (method: 'get' | 'post' | 'delete', path: string,
        handler: (req: any, res: any, clinicId: string) => Promise<any>) => {
        app[method](path, authenticateToken, async (req: any, res: any) => {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'Klinika aniqlanmadi' });
            try { await handler(req, res, clinicId); }
            catch (e: any) {
                console.error(`[treatment-templates] ${method.toUpperCase()} ${path}:`, e?.message || e);
                res.status(500).json({ error: "To'plamni saqlab bo'lmadi" });
            }
        });
    };

    /** Ko'rinadigan to'plamlar: o'zimniki + klinikaniki; ko'p ishlatilgani birinchi */
    route('get', '/api/treatment-templates', async (req, res, clinicId) => {
        const me = req.user?.doctorId || null;
        const rows = await prisma.treatmentTemplate.findMany({
            where: { clinicId, isActive: true, OR: [{ doctorId: null }, ...(me ? [{ doctorId: me }] : [])] },
            orderBy: [{ useCount: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
            take: 300,
        });
        res.json(rows.map(toDto));
    });

    route('post', '/api/treatment-templates', async (req, res, clinicId) => {
        const name = str(req.body?.name, 120);
        const items = sanitizeItems(req.body?.items);
        const icdCodes = (Array.isArray(req.body?.icdCodes) ? req.body.icdCodes : [])
            .map((c: any) => str(c, 16)).filter(Boolean).slice(0, 10);
        if (!name) return res.status(400).json({ error: "To'plam nomi kerak" });
        if (items.length === 0) return res.status(400).json({ error: "To'plam bo'sh — avval dori, xizmat yoki tahlil yozing" });
        /* Shifokor yaratgani — o'ziniki. Ega (shifokor emas) — klinikaniki. */
        const doctorId = req.user?.doctorId || null;
        if (!doctorId && !actsAs(req, 'CLINIC_ADMIN')) return res.status(403).json({ error: "Ruxsat yo'q" });
        const row = await prisma.treatmentTemplate.create({
            data: {
                clinicId, doctorId, name, items: JSON.stringify(items),
                icdCodes: icdCodes.length ? JSON.stringify(icdCodes) : null,
                createdByName: req.user?.name || null,
            },
        });
        res.json(toDto(row));
    });

    /** Qo'llandi — tartib uchun son oshadi */
    route('post', '/api/treatment-templates/:id/use', async (req, res, clinicId) => {
        /* Faqat ko'rinadigan to'plam: o'ziniki yoki klinikaniki */
        const me = req.user?.doctorId || null;
        const n = await prisma.treatmentTemplate.updateMany({
            where: { id: req.params.id, clinicId, OR: [{ doctorId: null }, ...(me ? [{ doctorId: me }] : [])] },
            data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
        });
        if (n.count === 0) return res.status(404).json({ error: "To'plam topilmadi" });
        res.json({ success: true });
    });

    /** O'chirish — faqat o'ziniki; klinikanikini ega o'chiradi */
    route('delete', '/api/treatment-templates/:id', async (req, res, clinicId) => {
        const t = await prisma.treatmentTemplate.findUnique({ where: { id: req.params.id } });
        if (!t || t.clinicId !== clinicId) return res.status(404).json({ error: "To'plam topilmadi" });
        const mine = t.doctorId && t.doctorId === req.user?.doctorId;
        if (!mine && !actsAs(req, 'CLINIC_ADMIN')) return res.status(403).json({ error: "Faqat o'zingizning to'plamingizni o'chira olasiz" });
        await prisma.treatmentTemplate.update({ where: { id: t.id }, data: { isActive: false } });
        res.json({ success: true });
    });
}
