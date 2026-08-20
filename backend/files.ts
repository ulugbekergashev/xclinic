/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — himoyalangan fayl berish.

   Nima uchun kerak. Ilgari `uploads/` papkasi `express.static` orqali BUTUNLAY
   ochiq edi: fayl nomini bilgan har kim bemor fotosini yoki UZI suratini
   yuklab olardi. Yagona "himoya" — nomning tasodifiyligi.

   Nima uchun oddiy `authenticateToken` yetmaydi. Rasmni brauzer `<img src>`
   tegi bilan oladi, teg esa `Authorization` sarlavhasini YUBORA OLMAYDI, token
   esa sessionStorage'da (cookie'da emas). Shu sababli token IKKI yo'l bilan
   qabul qilinadi: sarlavha (fetch, yuklab olish uchun) va `?token=` (rasm
   uchun). Manzildagi token jurnalga tushmasligi kerak — pastdagi `redactToken`
   shuning uchun bor va so'rov loglanganda ishlatilishi SHART.

   Egalikni fayl nomidan emas, YOZUVDAN aniqlaymiz: `PatientPhoto`,
   `DiagnosticFile` yoki `Patient.avatarUrl`. Ya'ni savol "bu fayl shu
   klinikaning bemoriga tegishlimi", "nomi to'g'rimi" emas.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import path from 'path';
import { logAccess } from './compliance';
import fs from 'fs';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
    uploadsDir: string;
};

/** Fayl turlari. Boshqa qiymat — 400. */
type Kind = 'patient-photo' | 'study-file' | 'patient-avatar' | 'patient-portrait';
const KINDS: Kind[] = ['patient-photo', 'study-file', 'patient-avatar', 'patient-portrait'];

/** Faylni ko'rishi mumkin bo'lgan rollar. Laborant va sotuvchi ro'yxatda YO'Q:
 *  laboratoriyada fayl bo'lmaydi, sotuvchi esa obuna bilan ishlaydi, bemor bilan emas. */
const ALLOWED_ROLES = ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'];

/** Manzildagi token qiymatini jurnal uchun yashiradi. */
export function redactToken(url: string): string {
    return url.replace(/([?&]token=)[^&]*/gi, '$1***');
}

const MIME: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
};

/** `/uploads/1234-567.jpg` dan faqat fayl nomini oladi. Papkadan chiqib
 *  ketishga urinish (`../`) shu yerda kesiladi. */
function safeBasename(storedUrl: string | null | undefined): string | null {
    if (!storedUrl) return null;
    const base = path.basename(String(storedUrl));
    if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) return null;
    return base;
}

export function registerFileRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId, uploadsDir } = deps;

    /* Token `?token=` da kelsa, uni sarlavhaga ko'chiramiz — shundan keyin
       o'zgarishsiz `authenticateToken` ishlaydi va tekshiruv mantig'i bitta
       joyda qoladi. */
    const acceptQueryToken = (req: any, _res: any, next: any) => {
        if (!req.headers['authorization'] && typeof req.query?.token === 'string' && req.query.token) {
            req.headers['authorization'] = `Bearer ${req.query.token}`;
        }
        next();
    };

    /**
     * GET /api/files/:kind/:id
     *
     * kind = patient-photo   → :id = PatientPhoto.id
     *        study-file      → :id = DiagnosticFile.id
     *        patient-avatar  → :id = Patient.id
     *        patient-portrait→ :id = Patient.id
     */
    app.get('/api/files/:kind/:id', acceptQueryToken, auth, async (req: any, res: any) => {
        try {
            const kind = String(req.params.kind) as Kind;
            if (!KINDS.includes(kind)) {
                return res.status(400).json({ error: 'Fayl turi noto\'g\'ri' });
            }

            const user = req.user;
            if (!ALLOWED_ROLES.includes(user?.role)) {
                return res.status(403).json({ error: 'Ruxsat yo\'q' });
            }

            const clinicId = getScopedClinicId(req);
            if (!clinicId && user?.role !== 'SUPER_ADMIN') {
                return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            }

            // ─── Yozuvni topamiz va egasini aniqlaymiz ───────────────────────
            let storedUrl: string | null = null;
            let ownerClinicId: string | null = null;
            // Jurnal uchun: fayl qaysi bemorga tegishli
            let ownerPatientId: string | null = null;

            if (kind === 'patient-photo') {
                const rec = await prisma.patientPhoto.findUnique({
                    where: { id: req.params.id },
                    include: { patient: { select: { clinicId: true } } },
                });
                if (!rec) return res.status(404).json({ error: 'Topilmadi' });
                storedUrl = rec.url;
                ownerClinicId = rec.patient?.clinicId || null;
                ownerPatientId = rec.patientId || null;
            } else if (kind === 'study-file') {
                const rec = await prisma.diagnosticFile.findUnique({
                    where: { id: req.params.id },
                    include: { study: { select: { clinicId: true } } },
                });
                if (!rec) return res.status(404).json({ error: 'Topilmadi' });
                storedUrl = rec.url;
                ownerClinicId = rec.study?.clinicId || null;
                ownerPatientId = rec.study?.patientId || null;
            } else {
                const rec = await prisma.patient.findUnique({
                    where: { id: req.params.id },
                    select: { clinicId: true, avatarUrl: true, portraitUrl: true },
                });
                if (!rec) return res.status(404).json({ error: 'Bemor topilmadi' });
                storedUrl = kind === 'patient-avatar' ? rec.avatarUrl : rec.portraitUrl;
                ownerClinicId = rec.clinicId;
                ownerPatientId = req.params.id;
            }

            if (user?.role !== 'SUPER_ADMIN' && ownerClinicId !== clinicId) {
                return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
            }

            /* Surat ham tibbiy ma'lumot: tish kartasining fotosi, UZI
               tasviri. Kim ko'rganini yozamiz (qaror В14). */
            logAccess(prisma, req, {
                action: 'View', entityType: kind === 'study-file' ? 'DiagnosticStudy' : 'PatientPhoto',
                entityId: req.params.id, patientId: ownerPatientId, clinicId: ownerClinicId,
            });

            const base = safeBasename(storedUrl);
            if (!base) return res.status(404).json({ error: 'Fayl biriktirilmagan' });

            const full = path.join(uploadsDir, base);
            if (!fs.existsSync(full)) {
                return res.status(404).json({ error: 'Fayl diskda topilmadi' });
            }

            const ext = path.extname(base).toLowerCase();
            res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
            // Bemor ma'lumoti — umumiy kesh (proxy) da yotmasligi kerak
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.sendFile(full);
        } catch (e: any) {
            console.error(`[GET /api/files] ${redactToken(req.originalUrl || '')}`, e?.message || e);
            res.status(500).json({ error: 'Faylni berishda xatolik' });
        }
    });

    console.log('✅ Fayl endpointi ulandi (himoyalangan)');
}
