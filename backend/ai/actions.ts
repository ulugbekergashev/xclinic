/* ─────────────────────────────────────────────────────────────────────────────
   AI AMALLARI — TASDIQ BILAN (2026-11-27, dentalocal'dan g'oya).

   Ega aytdi: «hammasini qilaver» (AI amallari, ovoz, ogohlantirish).

   QANDAY ISHLAYDI — AI HECH NARSANI O'ZI YOZMAYDI:
     1. Foydalanuvchi: «Aliyevni ertaga 10:00 ga Karimovga yoz».
     2. Model amal tool'ini chaqiradi → server FAQAT TAYYORLAYDI: bemor va
        shifokorni bazadan tekshiradi, odam o'qiydigan xulosa yozadi va
        so'rovni (usul + manzil + tana) imzolangan, 10 daqiqalik, bir
        martalik tokenga joylaydi. Model faqat «tayyorlandi» deb eshitadi.
     3. Ilova xulosani kartochkada ko'rsatadi: «Tasdiqlash / Bekor qilish».
     4. Tasdiqlanganda server so'rovni O'ZIGA, o'sha foydalanuvchining
        tokeni bilan yuboradi — ya'ni ilovadagi tugma bosilgandagi AYNAN o'sha
        yo'l: o'sha ruxsat jadvali, o'sha tekshiruvlar (to'qnashuv, xarajat
        chegarasi, kassa), o'sha tarix va shifokorga xabar. Biznes qoidasi
        ikki joyda yozilmaydi.

   dentalocal'ning amallar kodi (1700 qator) KO'CHIRILMADI: u yerdagi pul
   modeli boshqa. Bizda amal = mavjud API so'rovi.
   ───────────────────────────────────────────────────────────────────────────── */

import crypto from 'crypto';
import { tashkentDateStr } from '../tashkentTime';

export type ActionRequest = { method: 'POST' | 'PUT'; path: string; body?: any };
export type PreparedAction = {
    kind: string; summary: string; request: ActionRequest;
    /** To'lov: tayyorlangan paytdagi qarz — tasdiqda qayta tekshiriladi */
    guard?: { patientId: string; due: number };
};
type Ctx = { clinicId: string; role: string; userName?: string | null };

const ADMIN_DESK = ['CLINIC_ADMIN', 'RECEPTIONIST'];
const OWNER = ['CLINIC_ADMIN'];
const PAY_METHODS = ['Cash', 'Card', 'Click', 'Transfer'];
const PAY_LABEL: Record<string, string> = { Cash: 'naqd', Card: 'karta', Click: 'Click', Transfer: "o'tkazma" };
const EXPENSE_CATS = ['Rent', 'Utilities', 'Inventory', 'Lab', 'Other'];
const EXPENSE_LABEL: Record<string, string> = { Rent: 'ijara', Utilities: 'kommunal', Inventory: 'ombor', Lab: 'laboratoriya', Other: 'boshqa' };

/* Model yozgan matn (xabar, xarajat nomi, xizmat) — boshqaruv, bidi va nol
   kenglikdagi belgilar olib tashlanadi: kartochkada summa yoki ism «yashirin»
   siljitilmasin (xavfsizlik sharhi, 2026-11-27) */
export const cleanText = (v: unknown, max: number) => String(v ?? '')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
const MAX_SUM = 1_000_000_000;

const fmt = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const ddmm = (d: string) => String(d).slice(0, 10).split('-').reverse().join('.');
const full = (p: { firstName?: string | null; lastName?: string | null }) => `${p.lastName || ''} ${p.firstName || ''}`.trim();
/** Modelga — qisqartirilgan (maxfiylik, tools.ts dagi qoida) */
const masked = (p: { firstName?: string | null; lastName?: string | null }) =>
    p.lastName ? `${p.lastName} ${(p.firstName || '').charAt(0).toUpperCase()}.` : (p.firstName || 'Bemor');

// ─── Tool ta'riflari ─────────────────────────────────────────────────────────

export const ACTION_DEFS: { name: string; description: string; parameters: any; roles: string[] }[] = [
    {
        name: 'book_appointment',
        description: "Bemorni shifokor qabuliga yozishni TAYYORLAYDI (foydalanuvchi tasdiqlaydi). patientId — find_patient natijasidagi id, doctorId — get_doctors natijasidagi id.",
        parameters: {
            type: 'object',
            properties: {
                patientId: { type: 'string' }, doctorId: { type: 'string' },
                date: { type: 'string', description: 'YYYY-MM-DD' }, time: { type: 'string', description: 'HH:MM' },
                service: { type: 'string', description: 'Ixtiyoriy: xizmat yoki sabab' },
            },
            required: ['patientId', 'doctorId', 'date', 'time'],
        },
        roles: ADMIN_DESK,
    },
    {
        name: 'cancel_appointment',
        description: "Kalendardagi yozuvni bekor qilishni TAYYORLAYDI. appointmentId — get_appointments natijasidagi id.",
        parameters: { type: 'object', properties: { appointmentId: { type: 'string' } }, required: ['appointmentId'] },
        roles: ADMIN_DESK,
    },
    {
        name: 'send_reminder',
        description: "Bemorga qabul eslatmasini yuborishni TAYYORLAYDI. appointmentId — get_appointments natijasidagi id.",
        parameters: { type: 'object', properties: { appointmentId: { type: 'string' } }, required: ['appointmentId'] },
        roles: ADMIN_DESK,
    },
    {
        name: 'send_message',
        description: "Bitta bemorga Telegram (bo'lmasa SMS) xabar yuborishni TAYYORLAYDI. Matnni foydalanuvchi aytganidek yoz.",
        parameters: { type: 'object', properties: { patientId: { type: 'string' }, text: { type: 'string' } }, required: ['patientId', 'text'] },
        roles: ADMIN_DESK,
    },
    {
        name: 'record_payment',
        description: "Bemorning qarzi (to'lanmagan xizmatlari) uchun to'lovni qabul qilishni TAYYORLAYDI. method: Cash | Card | Click | Transfer.",
        parameters: {
            type: 'object',
            properties: { patientId: { type: 'string' }, amount: { type: 'number' }, method: { type: 'string', enum: PAY_METHODS } },
            required: ['patientId', 'amount', 'method'],
        },
        roles: ADMIN_DESK,
    },
    {
        name: 'create_expense',
        description: "Bugungi xarajatni yozishni TAYYORLAYDI. category: Rent | Utilities | Inventory | Lab | Other. title — qisqa nomi.",
        parameters: {
            type: 'object',
            properties: {
                amount: { type: 'number' }, category: { type: 'string', enum: EXPENSE_CATS }, title: { type: 'string' },
                method: { type: 'string', enum: PAY_METHODS },
            },
            required: ['amount', 'category', 'title'],
        },
        roles: OWNER,
    },
];

export const isActionTool = (name: string) => ACTION_DEFS.some(a => a.name === name);
export const actionToolsForRole = (role: string) => ACTION_DEFS
    .filter(a => a.roles.includes(role))
    .map(a => ({ type: 'function' as const, function: { name: a.name, description: a.description, parameters: a.parameters } }));

// ─── Tayyorlash ──────────────────────────────────────────────────────────────

type Prepared = { ok: true; action: PreparedAction; forModel: string } | { ok: false; error: string };
const fail = (error: string): Prepared => ({ ok: false, error });

export async function prepareAction(prisma: any, name: string, args: any, ctx: Ctx): Promise<Prepared> {
    const def = ACTION_DEFS.find(a => a.name === name);
    if (!def) return fail("Noma'lum amal");
    if (!def.roles.includes(ctx.role)) return fail("Bu amal sizning rolingizda yo'q");
    const a = args || {};
    const patientOf = async (id: any) => id ? prisma.patient.findFirst({ where: { id: String(id), clinicId: ctx.clinicId } }) : null;

    if (name === 'book_appointment') {
        const [p, d] = await Promise.all([
            patientOf(a.patientId),
            a.doctorId ? prisma.doctor.findFirst({ where: { id: String(a.doctorId), clinicId: ctx.clinicId, status: 'Active' } }) : null,
        ]);
        if (!p) return fail('Bemor topilmadi — avval find_patient bilan qidiring');
        if (!d) return fail('Shifokor topilmadi — get_doctors bilan tekshiring');
        const date = String(a.date || ''), time = String(a.time || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail("Sana yoki vaqt noto'g'ri (YYYY-MM-DD, HH:MM)");
        if (date < tashkentDateStr()) return fail("O'tgan kunga yozib bo'lmaydi");
        const service = cleanText(a.service, 80) || 'Konsultatsiya';
        const docName = `${d.firstName} ${d.lastName}`.trim();
        return {
            ok: true,
            action: {
                kind: name,
                summary: `Qabulga yozish: ${full(p)} → Dr. ${docName}, ${ddmm(date)} ${time} · «${service}»`,
                request: {
                    method: 'POST', path: '/api/appointments',
                    body: { patientId: p.id, patientName: `${p.firstName} ${p.lastName}`.trim(), doctorId: d.id, doctorName: docName, date, time, duration: 30, status: 'Confirmed', type: service },
                },
            },
            forModel: `${masked(p)} → Dr. ${docName}, ${ddmm(date)} ${time}`,
        };
    }

    if (name === 'cancel_appointment' || name === 'send_reminder') {
        const appt = a.appointmentId ? await prisma.appointment.findFirst({ where: { id: String(a.appointmentId), clinicId: ctx.clinicId } }) : null;
        if (!appt) return fail('Yozuv topilmadi — get_appointments bilan tekshiring');
        if (['Cancelled', 'Completed', 'No-Show'].includes(appt.status)) return fail('Bu yozuv allaqachon yopilgan');
        const what = `${appt.patientName} — Dr. ${appt.doctorName}, ${ddmm(appt.date)} ${appt.time}`;
        return name === 'cancel_appointment'
            ? { ok: true, action: { kind: name, summary: `Yozuvni bekor qilish: ${what}`, request: { method: 'PUT', path: `/api/appointments/${appt.id}`, body: { status: 'Cancelled' } } }, forModel: `${ddmm(appt.date)} ${appt.time} yozuvi` }
            : { ok: true, action: { kind: name, summary: `Eslatma yuborish: ${what}`, request: { method: 'POST', path: `/api/appointments/${appt.id}/remind` } }, forModel: `${ddmm(appt.date)} ${appt.time} yozuviga eslatma` };
    }

    if (name === 'send_message') {
        const p = await patientOf(a.patientId);
        if (!p) return fail('Bemor topilmadi');
        const text = cleanText(a.text, 1000);
        if (text.length < 2) return fail("Xabar matni bo'sh");
        return {
            ok: true,
            action: { kind: name, summary: `Xabar: ${full(p)} — «${text}»`, request: { method: 'POST', path: '/api/messages/send-bulk', body: { patientIds: [p.id], message: text, channel: 'telegram_first' } } },
            forModel: `${masked(p)} ga xabar`,
        };
    }

    if (name === 'record_payment') {
        const p = await patientOf(a.patientId);
        if (!p) return fail('Bemor topilmadi');
        const method = PAY_METHODS.includes(a.method) ? a.method : null;
        if (!method) return fail("To'lov usuli: Cash, Card, Click yoki Transfer");
        const amount = Math.round(Number(a.amount) || 0);
        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SUM) return fail("Summa noto'g'ri");
        const charges = await prisma.visitCharge.findMany({
            where: { clinicId: ctx.clinicId, patientId: p.id, status: 'Unpaid' },
            orderBy: { createdAt: 'asc' },
            select: { id: true, total: true, paidAmount: true },
        });
        const due = charges.reduce((s: number, c: any) => s + Math.max(0, (c.total || 0) - (c.paidAmount || 0)), 0);
        if (!charges.length || due <= 0) return fail("Bu bemorda to'lanmagan xizmat yo'q");
        if (amount > due) return fail(`Summa qarzdan katta: qarz ${fmt(due)} so'm. Ortig'i avans bo'ladi — buni Kassada qiling.`);
        /* Eng eski qatorlardan boshlab summani qoplaydigan qatorlar */
        const ids: string[] = [];
        let left = amount;
        for (const c of charges) {
            if (left <= 0) break;
            ids.push(c.id);
            left -= Math.max(0, (c.total || 0) - (c.paidAmount || 0));
        }
        return {
            ok: true,
            action: {
                kind: name,
                summary: `To'lov qabul qilish: ${full(p)} — ${fmt(amount)} so'm (${PAY_LABEL[method]}), qarz ${fmt(due)} so'm`,
                request: { method: 'POST', path: '/api/payments', body: { chargeIds: ids, amount, method } },
                guard: { patientId: p.id, due },
            },
            forModel: `${masked(p)}: ${fmt(amount)} so'm`,
        };
    }

    if (name === 'create_expense') {
        const amount = Math.round(Number(a.amount) || 0);
        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_SUM) return fail("Summa noto'g'ri");
        const category = EXPENSE_CATS.includes(a.category) ? a.category : null;
        if (!category) return fail('Toifa: Rent, Utilities, Inventory, Lab yoki Other');
        const title = cleanText(a.title, 120);
        if (!title) return fail('Xarajat nomi kerak');
        const method = PAY_METHODS.includes(a.method) ? a.method : 'Cash';
        return {
            ok: true,
            action: {
                kind: name,
                summary: `Xarajat: ${fmt(amount)} so'm (${EXPENSE_LABEL[category]}, ${PAY_LABEL[method]}), bugun · «${title}»`,
                request: { method: 'POST', path: '/api/expenses', body: { date: tashkentDateStr(), amount, category, title, method, note: 'AI yordamchi orqali' } },
            },
            forModel: `${title}: ${fmt(amount)} so'm`,
        };
    }
    return fail("Noma'lum amal");
}

// ─── Imzo: 10 daqiqa, bir marta, faqat o'sha foydalanuvchi ────────────────────

/** Kim: JWT da `id` yo'q — har rolning o'z kaliti bor (ega uchun klinika) */
export const callerKey = (user: any) =>
    `${user?.role || ''}:${user?.receptionistId || user?.doctorId || user?.nurseId || user?.technicianId || user?.clinicId || ''}`;
export const actionOwner = callerKey;

const TTL_MS = 10 * 60_000;
/** Server qayta ishga tushsa, ishlatilganlar ro'yxati yo'qoladi — shuning
 *  uchun undan OLDIN imzolangan token qabul qilinmaydi (bir martalik kafolat) */
const BOOT_MS = Date.now();
const used = new Map<string, number>();   // imzo → muddati

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
/* Domen prefiksi: JWT bilan bir kalit, lekin imzolar hech qachon almashmaydi */
const mac = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(`xclinic-ai-action:${data}`).digest('base64url');

export function signAction(action: PreparedAction, owner: string, clinicId: string, secret: string, now = Date.now()): string {
    const body = b64(JSON.stringify({ a: action, o: owner, c: clinicId, i: now, e: now + TTL_MS, n: crypto.randomBytes(6).toString('base64url') }));
    return `${body}.${mac(secret, body)}`;
}

/** Tekshiradi va ISHLATILDI deb belgilaydi. Xato — matn. */
export function consumeAction(token: string, owner: string, clinicId: string, secret: string, now = Date.now(), bootMs = BOOT_MS): PreparedAction | string {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return "Tasdiq noto'g'ri";
    const expected = mac(secret, body);
    const got = Buffer.from(sig), want = Buffer.from(expected);
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return "Tasdiq noto'g'ri";
    let p: any;
    try { p = JSON.parse(unb64(body)); } catch { return "Tasdiq noto'g'ri"; }
    if (p.o !== owner || p.c !== clinicId) return 'Bu amal boshqa foydalanuvchi uchun tayyorlangan';
    if (!(p.e > now)) return "Tasdiq muddati o'tdi — AI dan qayta so'rang";
    if (!(p.i >= bootMs)) return "Tasdiq eskirgan (dastur qayta ishga tushgan) — AI dan qayta so'rang";
    for (const [k, exp] of used) if (exp < now) used.delete(k);
    if (used.has(sig)) return 'Bu amal allaqachon bajarilgan';
    used.set(sig, p.e);
    const a = p.a as PreparedAction;
    /* Faqat ma'lum manzillar — token qalbakilashtirilmasa ham himoya */
    if (!/^\/api\/(appointments(\/[\w-]+(\/remind)?)?|messages\/send-bulk|payments|expenses)$/.test(a?.request?.path || '')) return "Noma'lum amal";
    return a;
}
