/* ─────────────────────────────────────────────────────────────────────────────
   RETSEPT VA TAHLIL NATIJASINI BEMORNING TELEGRAMIGA PDF QILIB YUBORISH
   (2026-11-26).

   Qanday ishlaydi.
     · Printer tugmasi yonida — Telegram tugmasi. Bir bosish: o'sha bitta
       hujjat PDF bo'lib bemorning chatiga ketadi. Oyna yo'q, tasdiq yo'q.
     · Klinika sozlamasi `labResultAutoSend` yoqilgan bo'lsa, buyurtma BIRINCHI
       marta to'liq bajarilganda natija o'zi ketadi (bir buyurtma — bir PDF).

   Xavfsizlik (maslahatchilar bilan kelishilgan).
     · Hujjat ham, bemor ham har safar serverda, klinika bo'yicha QAYTA
       o'qiladi; mijozdan chat id yoki bemor id qabul qilinmaydi.
     · PDF ga faqat ruxsat etilgan maydonlar tushadi (patientPdf.ts).
     · Fayl nomida ism/telefon yo'q — Telegram uni bildirishnomada ko'rsatadi.
     · Jurnalga (TelegramLog) faqat qisqa yozuv, dorilar va raqamlar emas.
       Kim yuborgani — AccessLog ('Export').
     · Bir hujjat 60 soniya ichida ikki marta ketmaydi (ikki marta bosish).
   ───────────────────────────────────────────────────────────────────────────── */

import { renderPrescriptionPdf, renderLabResultPdf, labResultModel, fmtDate, PdfClinic } from './patientPdf';
import { loadLabResultView, awaitsVerification } from './labResultView';
import { logAccess } from './compliance';

type Kind = 'rx' | 'lab';

/** Sinovda soxta Telegram serveriga yo'naltirish uchun. Ishda — rasmiy manzil. */
const tgBase = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');

class SendError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** Telegram xatosini odam tiliga o'giradi */
function tgErrorText(status: number, description: string): string {
    const d = description.toLowerCase();
    if (d.includes('blocked')) return 'Bemor botni bloklagan — xabar yetib bormaydi';
    if (d.includes('chat not found') || d.includes('user not found')) return 'Bemorning Telegram chati topilmadi (botni qayta ishga tushirishi kerak)';
    if (d.includes('deactivated')) return 'Bemorning Telegram akkaunti o\'chirilgan';
    if (status === 401) return 'Bot tokeni yaroqsiz (Sozlamalar → Telegram)';
    return `Telegram xatosi: ${description.slice(0, 120) || status}`;
}

/** PDF ni Telegramga hujjat qilib yuboradi. Rad etilsa — XATO otadi. */
export async function sendTelegramDocument(token: string, chatId: string, bytes: Uint8Array, filename: string, caption: string): Promise<void> {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption.slice(0, 1000));
    form.append('document', new Blob([bytes as any], { type: 'application/pdf' }), filename);
    let r: Response;
    try {
        r = await fetch(`${tgBase()}/bot${token}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) });
    } catch (e: any) {
        throw new Error(e?.name === 'TimeoutError' ? 'Telegram javob bermadi (internet?)' : 'Telegramga ulanib bo\'lmadi (internet?)');
    }
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok || json?.ok === false) throw new Error(tgErrorText(r.status, String(json?.description || '')));
}

interface Prepared {
    clinic: any;
    patient: any;
    bytes: Uint8Array;
    filename: string;
    caption: string;
    label: string;
}

const refOf = (kind: Kind, id: string) => `${kind}:${id}`;

async function lastSent(prisma: any, clinicId: string, kind: Kind, id: string): Promise<Date | null> {
    const row = await prisma.telegramLog.findFirst({
        where: { clinicId, ruleId: null, refId: refOf(kind, id), status: 'Sent', type: 'Document' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
    });
    return row?.sentAt || null;
}

function pdfClinic(c: any): PdfClinic {
    return { name: c.name, phone: c.phone, address: c.address, licenseNumber: c.licenseNumber, letterheadNote: c.letterheadNote };
}

const fileDate = (iso: string) => fmtDate(iso).replace(/\./g, '-');

/** Hujjatni o'qiydi, tekshiradi, PDF yasaydi. Yuborishga tayyor narsa qaytaradi. */
async function prepare(prisma: any, clinicId: string, kind: Kind, id: string): Promise<Prepared> {
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) throw new SendError(404, 'Klinika topilmadi');
    if (!clinic.botToken) throw new SendError(409, 'Telegram bot ulanmagan (Sozlamalar → Telegram)', 'NO_BOT');

    const greet = (p: any) => `Assalomu alaykum${p?.firstName ? `, ${p.firstName}` : ''}!`;
    const tail = clinic.phone ? `\n\nSavol bo'lsa: ${clinic.phone}` : '';

    if (kind === 'rx') {
        const rx = await prisma.prescription.findFirst({ where: { id, clinicId }, include: { items: true } });
        if (!rx) throw new SendError(404, 'Retsept topilmadi');
        const patient = await prisma.patient.findFirst({ where: { id: rx.patientId, clinicId } });
        if (!patient) throw new SendError(404, 'Bemor topilmadi');
        if (!patient.telegramChatId) throw new SendError(409, 'Bemor botga ulanmagan', 'NO_TELEGRAM');
        const bytes = await renderPrescriptionPdf({ ...rx, patient }, pdfClinic(clinic));
        return {
            clinic, patient, bytes,
            filename: `Retsept_${fileDate(rx.date)}.pdf`,
            caption: `${greet(patient)}\n${clinic.name || 'Klinika'} — retseptingiz (${fmtDate(rx.date)}). Dorilarni ko'rsatilgan tartibda qabul qiling.${tail}`,
            label: 'Retsept PDF',
        };
    }

    const view: any = await loadLabResultView(prisma, id, clinicId);
    if (!view) throw new SendError(404, 'Buyurtma topilmadi');
    if (view.status === 'Cancelled') throw new SendError(409, 'Buyurtma bekor qilingan');
    if (!labResultModel(view).hasAnyValue) throw new SendError(409, 'Natija hali kiritilmagan', 'NO_RESULT');
    /* Klinika tasdiqlashni yoqqan — tasdiqlanmagan natija bemorga ketmaydi */
    if (awaitsVerification(clinic, view)) throw new SendError(409, 'Natija hali tasdiqlanmagan', 'NOT_VERIFIED');
    const patient = view.patientId ? await prisma.patient.findFirst({ where: { id: view.patientId, clinicId } }) : null;
    if (!patient) throw new SendError(404, 'Bemor topilmadi');
    if (!patient.telegramChatId) throw new SendError(409, 'Bemor botga ulanmagan', 'NO_TELEGRAM');

    /* Avval yuborilgan, keyin raqam o'zgargan — bemor buni bilishi shart */
    const prev = await lastSent(prisma, clinicId, 'lab', id);
    const latest = prev ? await prisma.labResult.findFirst({
        where: { orderItem: { orderId: id } },
        orderBy: { enteredAt: 'desc' },
        select: { enteredAt: true },
    }) : null;
    const corrected = !!prev && !!latest?.enteredAt && new Date(latest.enteredAt) > prev;

    const bytes = await renderLabResultPdf({ ...view, patient }, pdfClinic(clinic), { corrected });
    const day = view.completedAt ? new Date(view.completedAt).toISOString() : new Date().toISOString();
    return {
        clinic, patient, bytes,
        filename: `Tahlil_${fileDate(day)}.pdf`,
        caption: corrected
            ? `${greet(patient)}\nTahlil natijangiz TUZATILDI — yangilangan varaq ilova qilindi. Avvalgisini hisobga olmang.${tail}`
            : `${greet(patient)}\n${clinic.name || 'Klinika'} — tahlil natijangiz tayyor.${tail}`,
        label: corrected ? 'Tahlil natijasi PDF (tuzatilgan)' : 'Tahlil natijasi PDF',
    };
}

/* Ikki marta bosish va bir vaqtda ikki xodim — bitta PDF ketadi.
   Blok faqat AYNAN SHU hujjatga: laborant raqamni tuzatib darhol qayta
   yuborsa — bu yangi varaq, u to'silmaydi (`version` — oxirgi kiritish vaqti). */
const RECENT_MS = 60_000;
const recent = new Map<string, { at: number; version: string }>();

function claim(key: string, version: string): boolean {
    const now = Date.now();
    for (const [k, v] of recent) if (now - v.at > RECENT_MS) recent.delete(k);
    const cur = recent.get(key);
    if (cur && cur.version === version) return false;
    recent.set(key, { at: now, version });
    return true;
}

async function docVersion(prisma: any, kind: Kind, id: string): Promise<string> {
    if (kind === 'rx') return 'rx';
    const latest = await prisma.labResult.findFirst({
        where: { orderItem: { orderId: id } },
        orderBy: { enteredAt: 'desc' },
        select: { enteredAt: true },
    });
    return latest?.enteredAt ? new Date(latest.enteredAt).toISOString() : '-';
}

/** Bitta hujjatni yuboradi va jurnalga yozadi. */
async function deliver(prisma: any, req: any, clinicId: string, kind: Kind, id: string, source: 'manual' | 'lab_auto') {
    const key = `${clinicId}:${refOf(kind, id)}`;
    const version = await docVersion(prisma, kind, id);
    if (!claim(key, version)) {
        throw new SendError(429, 'Hozirgina yuborildi — bir daqiqadan keyin qayta urinib ko\'ring', 'RECENT');
    }
    let prepared: Prepared | null = null;
    try {
        prepared = await prepare(prisma, clinicId, kind, id);
        await sendTelegramDocument(prepared.clinic.botToken, prepared.patient.telegramChatId, prepared.bytes, prepared.filename, prepared.caption);
    } catch (e: any) {
        /* Faqat o'zimiz qo'ygan belgini olamiz — oraliqda yangi versiya
           yuborilayotgan bo'lsa, uning blokiga tegmaymiz */
        if (recent.get(key)?.version === version) recent.delete(key);
        if (prepared) {
            await prisma.telegramLog.create({
                data: {
                    clinicId, patientId: prepared.patient.id, type: 'Document', status: 'Failed',
                    message: prepared.label, error: String(e?.message || e).slice(0, 300),
                    channel: 'telegram', source, ruleId: null, refId: refOf(kind, id), recipient: prepared.patient.telegramChatId,
                },
            }).catch(() => { /* jurnal yozilmasa ham xato foydalanuvchiga qaytadi */ });
        }
        throw e;
    }
    const log = await prisma.telegramLog.create({
        data: {
            clinicId, patientId: prepared.patient.id, type: 'Document', status: 'Sent',
            message: prepared.label, channel: 'telegram', source, ruleId: null,
            refId: refOf(kind, id), recipient: prepared.patient.telegramChatId,
        },
    });
    logAccess(prisma, req, {
        action: 'Export', entityType: kind === 'rx' ? 'PrescriptionTelegram' : 'LabResultTelegram',
        entityId: id, patientId: prepared.patient.id, clinicId,
    });
    return { sentAt: log.sentAt as Date };
}

/**
 * Natija tayyor bo'lganda o'zi yuborish. Xato OTMAYDI — natijani saqlash
 * bunga bog'liq emas. Bir buyurtma faqat bir marta o'zi ketadi; tuzatilgan
 * natijani xodim tugma bilan qayta yuboradi.
 */
const autoInFlight = new Set<string>();

export async function autoSendLabResult(prisma: any, clinicId: string, orderId: string): Promise<void> {
    /* Ikki saqlash ketma-ket kelsa — ikkinchisi birinchisi tugaguncha kutmaydi,
       shunchaki o'tadi: bir buyurtmaga bir vaqtda bitta yuborish */
    const key = `${clinicId}:${orderId}`;
    if (autoInFlight.has(key)) return;
    autoInFlight.add(key);
    try {
        const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { labResultAutoSend: true, botToken: true, labVerifyRequired: true } });
        if (!clinic?.labResultAutoSend || !clinic.botToken) return;
        if (await lastSent(prisma, clinicId, 'lab', orderId)) return;
        const view: any = await loadLabResultView(prisma, orderId, clinicId);
        if (!view || view.status !== 'Completed' || !view.patient?.telegramChatId) return;   // ulanmagan — jim o'tamiz
        /* Tasdiq kutilyapti — tasdiqlash marshruti (`labSamples.ts`) shu
           funksiyani qayta chaqiradi va natija o'shanda ketadi */
        if (awaitsVerification(clinic, view)) return;
        /* CHALA natija o'zi ketmaydi: 10 ko'rsatkichdan bittasi kiritilgan
           bo'lsa ham buyurtma «bajarildi» bo'lib qoladi — bemorga bir qatorli
           varaq ketmasin. Qolganlari kiritilgach keyingi saqlashda ketadi. */
        const allFilled = view.items.length > 0 && view.items.every((it: any) =>
            it.parameters.length > 0 && it.parameters.every((p: any) => String(p.value ?? '').trim() !== ''));
        if (!allFilled) return;
        const systemReq = { user: { role: 'SYSTEM', name: 'Avtomatik yuborish', clinicId } };
        await deliver(prisma, systemReq, clinicId, 'lab', orderId, 'lab_auto');
    } catch (e: any) {
        console.warn('[LabAutoSend]', orderId, e?.message || e);
    } finally {
        autoInFlight.delete(key);
    }
}

export function registerPatientDocSendRoutes(app: any, deps: { prisma: any; authenticateToken: any; getScopedClinicId: (req: any) => string | null }) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    const handler = (kind: Kind) => async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            const { sentAt } = await deliver(prisma, req, clinicId, kind, String(req.params.id), 'manual');
            res.json({ success: true, sentAt });
        } catch (e: any) {
            if (e instanceof SendError) return res.status(e.status).json({ error: e.message, code: e.code });
            console.error(`[send-telegram ${kind}]`, e?.message || e);
            res.status(502).json({ error: e?.message || 'Yuborib bo\'lmadi', code: 'TELEGRAM' });
        }
    };

    app.post('/api/prescriptions/:id/send-telegram', auth, handler('rx'));
    app.post('/api/lab-orders/:id/send-telegram', auth, handler('lab'));

    /** Tugma holati: klinikada bot bormi, bemor ulanganmi, qaysi hujjat qachon
     *  yuborilgan — { bot, linked, sent: { "rx:<id>": iso, "lab:<id>": iso } }.
     *  Chat id QAYTARILMAYDI — faqat «ulangan/ulanmagan». */
    app.get('/api/patients/:id/sent-docs', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            const patientId = String(req.params.id);
            const [clinic, patient, rows] = await Promise.all([
                prisma.clinic.findUnique({ where: { id: clinicId }, select: { botToken: true } }),
                prisma.patient.findFirst({ where: { id: patientId, clinicId }, select: { telegramChatId: true } }),
                prisma.telegramLog.findMany({
                    where: { clinicId, patientId, type: 'Document', status: 'Sent' },
                    orderBy: { sentAt: 'asc' },
                    select: { refId: true, sentAt: true },
                    take: 500,
                }),
            ]);
            if (!patient) return res.status(404).json({ error: 'Bemor topilmadi' });
            const sent: Record<string, string> = {};
            for (const r of rows) if (r.refId) sent[r.refId] = new Date(r.sentAt).toISOString();
            res.json({ bot: !!clinic?.botToken, linked: !!patient.telegramChatId, sent });
        } catch (e: any) {
            console.error('[sent-docs]', e?.message || e);
            res.status(500).json({ error: 'Server xatoligi' });
        }
    });

    /** Klinika sozlamasi: natija tayyor bo'lganda o'zi yuborilsin */
    app.put('/api/clinics/:id/lab-auto-send', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId || clinicId !== req.params.id) return res.status(403).json({ error: 'Ruxsat yo\'q (boshqa klinika)' });
            const enabled = req.body?.enabled === true;
            await prisma.clinic.update({ where: { id: clinicId }, data: { labResultAutoSend: enabled } });
            res.json({ success: true, labResultAutoSend: enabled });
        } catch (e: any) {
            console.error('[lab-auto-send]', e?.message || e);
            res.status(500).json({ error: "Sozlamani saqlab bo'lmadi" });
        }
    });
}
