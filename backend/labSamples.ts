/* ─────────────────────────────────────────────────────────────────────────────
   PROBIRKA YORLIG'I VA NATIJANI TASDIQLASH (2026-11-26, migratsiya 0045).

   Olti tomondan (laborant, ega, dizayn, arxitektura, klinik xavfsizlik,
   printer) ko'rib chiqilgan qaror:

   YORLIQ — hech narsani to'smaydi. Yorliqsiz ham «Olindi» avvalgidek
   ishlaydi. Kod — FAQAT RAQAM (YYMMDD + kunlik tartib, 10 xona): skaner
   klaviatura bo'lib yozadi va kirill/o'zbek tartibida harfni buzadi; juft
   raqamlar Code128-C da ixcham chiziladi. Kod bir marta beriladi va
   o'zgarmaydi (probani olganda yoki birinchi yorliq bosilganda).

   TASDIQLASH — klinika sozlamasi, dastlab O'CHIQ. Bitta laborantli klinikada
   ikkinchi imzo — so'ralmagan majburiy qadam; o'chiq bo'lsa hech narsa
   o'zgarmaydi. Yoqilganda:
     · natija Telegramga (qo'lda ham, o'zi ham) faqat tasdiqdan keyin ketadi;
     · laborant O'Z kiritgan natijasini tasdiqlay olmaydi; ega — har doim;
     · tasdiqlangan natija tuzatilsa, tasdiq bekor bo'ladi (multiprofile.ts);
     · holatlar zanjiri o'zgarmaydi: «Completed» = hamma qiymat kiritilgan,
       tasdiq — alohida belgi.
   ───────────────────────────────────────────────────────────────────────────── */

import { logAccess } from './compliance';
import { autoSendLabResult } from './patientDocSend';
export { awaitsVerification } from './labResultView';
import { loadLabResultView, staffKey } from './labResultView';

export const LABEL_SIZES = ['40x30', '58x40', '50x25', 'tape80'] as const;
export type LabelSize = typeof LABEL_SIZES[number];
export const DEFAULT_LABEL_SIZE: LabelSize = '40x30';

const TASHKENT_OFFSET_MS = 5 * 3600 * 1000;
const SEQ_DIGITS = 4;
const MAX_ATTEMPTS = 6;

/** YYMMDD — Toshkent kuni bo'yicha (server soati UTC bo'lishi mumkin) */
export function dayPrefix(at: Date = new Date()): string {
    const d = new Date(at.getTime() + TASHKENT_OFFSET_MS);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return `${p2(d.getUTCFullYear() % 100)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`;
}

/** Kunning keyingi kodi: shu kundagi eng katta koddan bitta keyin */
export function nextCode(prefix: string, lastCode: string | null | undefined): string {
    const last = lastCode && lastCode.startsWith(prefix) ? Number(lastCode.slice(prefix.length)) : 0;
    const seq = (Number.isFinite(last) ? last : 0) + 1;
    return `${prefix}${String(seq).padStart(SEQ_DIGITS, '0')}`;
}

/**
 * Buyurtmaga kod beradi (bor bo'lsa — o'shani qaytaradi). Ikki kompyuter bir
 * vaqtda kod olsa, UNIQUE indeks ikkinchisini rad etadi — u keyingi raqamni
 * oladi.
 */
export async function ensureSampleCode(prisma: any, clinicId: string, orderId: string): Promise<string | null> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const order = await prisma.labOrder.findUnique({ where: { id: orderId }, select: { clinicId: true, sampleCode: true } });
        if (!order || order.clinicId !== clinicId) return null;
        if (order.sampleCode) return order.sampleCode;

        const prefix = dayPrefix();
        const last = await prisma.labOrder.findFirst({
            where: { clinicId, sampleCode: { startsWith: prefix } },
            orderBy: { sampleCode: 'desc' },
            select: { sampleCode: true },
        });
        const code = nextCode(prefix, last?.sampleCode);
        try {
            /* `sampleCode: null` sharti — boshqa so'rov orada kod bergan
               bo'lsa, ustidan yozmaymiz: keyingi aylanishda o'shani olamiz */
            const r = await prisma.labOrder.updateMany({ where: { id: orderId, sampleCode: null }, data: { sampleCode: code } });
            if (r.count === 1) return code;
        } catch (e: any) {
            if (e?.code !== 'P2002') throw e;   // boshqa buyurtma shu kodni oldi — qayta
        }
    }
    throw new Error("Probirka kodini berib bo'lmadi");
}

const isOwner = (req: any) => req?.user?.role === 'CLINIC_ADMIN';

export function registerLabSampleRoutes(app: any, deps: { prisma: any; authenticateToken: any; getScopedClinicId: (req: any) => string | null }) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    /** Yorliq ma'lumoti. Kod yo'q bo'lsa — beriladi (shuning uchun POST).
     *  Har NAMUNA TURIGA bitta yorliq: qon va siydik — ikki probirka. */
    app.post('/api/lab-orders/:id/label', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            const code = await ensureSampleCode(prisma, clinicId, String(req.params.id));
            if (!code) return res.status(404).json({ error: 'Buyurtma topilmadi' });

            const [order, clinic] = await Promise.all([
                prisma.labOrder.findUnique({
                    where: { id: String(req.params.id) },
                    include: { patient: true, items: { include: { test: { select: { sampleType: true, code: true, name: true } } } } },
                }),
                prisma.clinic.findUnique({ where: { id: clinicId }, select: { labLabelSize: true } }),
            ]);
            const groups = new Map<string, string[]>();
            for (const it of order?.items || []) {
                const sample = it.test?.sampleType || 'Namuna';
                const short = it.test?.code || it.testName || it.test?.name || '';
                if (!groups.has(sample)) groups.set(sample, []);
                groups.get(sample)!.push(short);
            }
            res.json({
                code,
                patientName: order?.patient ? `${order.patient.lastName || ''} ${order.patient.firstName || ''}`.trim() : order?.patientName,
                dob: order?.patient?.dob || null,
                gender: order?.patient?.gender || null,
                at: order?.sampleCollectedAt || order?.orderedAt,
                groups: Array.from(groups.entries()).map(([sample, tests]) => ({ sample, tests })),
                size: (LABEL_SIZES as readonly string[]).includes(clinic?.labLabelSize || '') ? clinic!.labLabelSize : DEFAULT_LABEL_SIZE,
            });
        } catch (e: any) {
            console.error('[lab label]', e?.message || e);
            res.status(500).json({ error: "Yorliqni tayyorlab bo'lmadi" });
        }
    });

    /** Natijani tasdiqlash. Faqat klinika yoqqan bo'lsa ma'noga ega. */
    app.post('/api/lab-orders/:id/verify', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            const id = String(req.params.id);
            const [order, clinic] = await Promise.all([
                prisma.labOrder.findUnique({ where: { id }, include: { items: { include: { results: { select: { enteredBy: true, enteredById: true } } } } } }),
                prisma.clinic.findUnique({ where: { id: clinicId }, select: { labVerifyRequired: true } }),
            ]);
            if (!order || order.clinicId !== clinicId) return res.status(404).json({ error: 'Buyurtma topilmadi' });
            if (!clinic?.labVerifyRequired) return res.status(409).json({ error: "Tasdiqlash sozlamasi o'chiq", code: 'VERIFY_OFF' });
            /* «Completed» har tahlilda BITTA qiymat bo'lsa ham qo'yiladi — tasdiq
               esa HAMMA ko'rsatkichni talab qiladi (o'zi yuborish qoidasi bilan
               bir xil): chala varaq «tasdiqlangan» bo'lib qolmasin. */
            const view: any = await loadLabResultView(prisma, id, clinicId);
            const allFilled = !!view && view.items.length > 0 && view.items.every((it: any) =>
                it.parameters.length > 0 && it.parameters.every((p: any) => String(p.value ?? '').trim() !== ''));
            if (order.status !== 'Completed' || !allFilled) {
                return res.status(409).json({ error: 'Hamma natija kiritilmagan', code: 'NOT_COMPLETE' });
            }
            if (order.verifiedAt) return res.json({ success: true, verifiedAt: order.verifiedAt, verifiedByName: order.verifiedByName });

            /* O'zini o'zi tasdiqlash — ikkinchi ko'zning ma'nosi yo'qoladi.
               Ega bundan mustasno: kichik klinikada oxirgi so'z egada. */
            const me = String(req.user?.name || '').trim();
            const myKey = staffKey(req.user);
            if (!isOwner(req)) {
                /* Kim ekanini aniqlab bo'lmasa — tasdiq yo'q (yopiq tomonga) */
                if (!myKey) return res.status(409).json({ error: "Xodimni aniqlab bo'lmadi", code: 'SELF_VERIFY' });
                const mine = order.items.some((it: any) => it.results.some((r: any) =>
                    r.enteredById ? r.enteredById === myKey : (!!me && String(r.enteredBy || '').trim() === me)));
                if (mine) return res.status(409).json({ error: "O'zingiz kiritgan natijani tasdiqlay olmaysiz", code: 'SELF_VERIFY' });
            }

            const checkedAt = new Date();
            const verifiedByName = me || null;
            /* Faqat hali tasdiqlanmagan bo'lsa (ikki xodim bir vaqtda bosdi) */
            await prisma.labOrder.updateMany({
                where: { id, verifiedAt: null },
                data: { verifiedAt: checkedAt, verifiedByName, verifiedById: myKey },
            });
            /* Tekshiruv bilan yozuv orasida raqam o'zgargan bo'lsa — tasdiq
               eski raqamga tegishli: bekor qilamiz */
            const newer = await prisma.labResult.findFirst({
                where: { orderItem: { orderId: id }, enteredAt: { gt: checkedAt } }, select: { id: true },
            });
            if (newer) {
                await prisma.labOrder.update({ where: { id }, data: { verifiedAt: null, verifiedByName: null, verifiedById: null } });
                return res.status(409).json({ error: "Natija shu payt o'zgardi — qayta ko'rib tasdiqlang", code: 'CHANGED' });
            }
            const fresh = await prisma.labOrder.findUnique({ where: { id }, select: { verifiedAt: true, verifiedByName: true } });
            const verifiedAt = fresh?.verifiedAt || checkedAt;
            logAccess(prisma, req, { action: 'Update', entityType: 'LabResultVerify', entityId: id, patientId: order.patientId, clinicId });
            /* Klinika «natija o'zi yuborilsin» ni yoqqan bo'lsa — endi ketadi */
            void autoSendLabResult(prisma, clinicId, id);
            res.json({ success: true, verifiedAt, verifiedByName: fresh?.verifiedByName ?? verifiedByName });
        } catch (e: any) {
            console.error('[lab verify]', e?.message || e);
            res.status(500).json({ error: "Tasdiqlab bo'lmadi" });
        }
    });

    /** Laboratoriya sozlamalari: tasdiqlash, yorliq o'lchami, avtomatik yorliq */
    app.put('/api/clinics/:id/lab-settings', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId || clinicId !== req.params.id) return res.status(403).json({ error: "Ruxsat yo'q (boshqa klinika)" });
            const b = req.body || {};
            const data: Record<string, unknown> = {};
            if (b.labVerifyRequired !== undefined) data.labVerifyRequired = b.labVerifyRequired === true;
            if (b.labLabelAuto !== undefined) data.labLabelAuto = b.labLabelAuto === true;
            if (b.labLabelSize !== undefined) {
                if (!(LABEL_SIZES as readonly string[]).includes(String(b.labLabelSize))) {
                    return res.status(400).json({ error: "Noma'lum yorliq o'lchami" });
                }
                data.labLabelSize = String(b.labLabelSize);
            }
            const c = await prisma.clinic.update({
                where: { id: clinicId }, data,
                select: { labVerifyRequired: true, labLabelAuto: true, labLabelSize: true },
            });
            res.json({ success: true, ...c });
        } catch (e: any) {
            console.error('[lab-settings]', e?.message || e);
            res.status(500).json({ error: "Sozlamani saqlab bo'lmadi" });
        }
    });
}
