/* ─────────────────────────────────────────────────────────────────────────────
   SAYTDAN QABULGA YOZILISH VA SO'ROVNI TASDIQLASH (2026-11-26, migratsiya 0046).

   Bemor: havola (masofaviy kirish manzili + /book) → shifokor → kun → bo'sh
   vaqt → ism va telefon → «Yozilish». So'rov oddiy `Appointment`, holati
   'Requested' — vaqt band turadi, lekin eslatma va «yozildi» xabari uni
   bilmaydi. Registrator Kalendarda «Saytdan kelgan so'rovlar» blokida
   tasdiqlaydi / boshqa vaqt beradi / rad etadi. «Avtomatik tasdiqlash»
   yoqilsa — registratorga ish qolmaydi.

   OCHIQ MARSHRUTLAR (kirishsiz) — faqat sozlama yoqilganda:
     · GET  /api/public/booking         — klinika nomi, shifokorlar (ism,
       mutaxassislik), 14 kunda kim qaysi kuni ishlaydi;
     · GET  /api/public/booking/slots   — FAQAT bo'sh vaqtlar ro'yxati;
     · POST /api/public/booking         — so'rov.
   Bemor ma'lumoti, yozuv id lari hech qachon qaytmaydi. Spamga qarshi: IP
   bo'yicha chegara, «website» tuzog'i, telefon bo'yicha ochiq so'rovlar
   chegarasi va klinikaga kuniga chegara.

   Sozlama dastlab O'CHIQ: sahifa 404, bot avvalgidek.
   ───────────────────────────────────────────────────────────────────────────── */

import { normalizeUzPhone } from '../shared/validation';

const TASHKENT_OFFSET_MS = 5 * 3600 * 1000;
const SLOT_MIN = 30;
const DAYS_AHEAD = 14;
const LIMITS = {
    slotsPerMin: Number(process.env.BOOKING_SLOTS_PER_MIN || 60),
    postsPerHour: Number(process.env.BOOKING_POSTS_PER_HOUR || 5),
    openPerPhone: 2,
    perClinicDay: Number(process.env.BOOKING_PER_CLINIC_DAY || 40),
};

const tashNow = () => new Date(Date.now() + TASHKENT_OFFSET_MS);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const todayTash = () => isoDay(tashNow());
const addDays = (iso: string, n: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5));
/** ISO kun → 1 (Du) .. 7 (Ya) */
const dowOf = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const toMin = (t: string) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function parseDays(v?: string | null): number[] {
    if (!v) return [];
    return String(v).split(',').map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 7);
}

/** Shifokor shu kuni ishlaydimi (ish kunlari belgilanmagan bo'lsa — har kuni) */
export function worksOn(doctor: { workDays?: string | null }, iso: string): boolean {
    const days = parseDays(doctor.workDays);
    return days.length === 0 || days.includes(dowOf(iso));
}

/**
 * Bo'sh vaqtlar — 30 daqiqalik qadam, shifokor (bo'lmasa klinika) soatlari,
 * ish kunlari, band yozuvlar va o'tib ketgan vaqt hisobga olinadi.
 * Sof funksiya — sinovda tekshiriladi.
 */
export function freeSlots(input: {
    doctor: { workDays?: string | null; startHour?: number | null; endHour?: number | null };
    clinic: { startHour?: number | null; endHour?: number | null };
    date: string;
    taken: { time: string; duration?: number | null }[];
    now?: Date;   // Toshkent vaqti (UTC maydonlarida)
}): string[] {
    const { doctor, clinic, date, taken } = input;
    if (!worksOn(doctor, date)) return [];
    const start = (doctor.startHour ?? clinic.startHour ?? 8) * 60;
    const end = (doctor.endHour ?? clinic.endHour ?? 20) * 60;
    const now = input.now || tashNow();
    const today = isoDay(now);
    if (date < today) return [];
    const nowMin = date === today ? now.getUTCHours() * 60 + now.getUTCMinutes() : -1;
    const busy = taken.map(a => [toMin(a.time), toMin(a.time) + (a.duration || SLOT_MIN)] as const);
    const out: string[] = [];
    for (let m = start; m + SLOT_MIN <= end; m += SLOT_MIN) {
        if (m <= nowMin) continue;
        if (busy.some(([s, e]) => m < e && m + SLOT_MIN > s)) continue;
        out.push(hhmm(m));
    }
    return out;
}

/** So'rov o'zi yaratgan karta belgisi — rad etilsa faqat shunday karta o'chadi */
const NEW_CARD_TAG = '[yangi karta]';

const cleanName = (v: unknown) => String(v ?? '').replace(/[\u0000-\u001F\u007F<>\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
    socketIp: (req: any) => string;
    sendUnified: (clinic: any, patient: any, message: string, opts: any) => Promise<any>;
    kickTrigger: (id: string) => void;
    emitEvent: (clinicId: string, type: any, payload?: any) => void;
    tunnelUrl: () => string | null;
    /** Tasdiqlangan yozuv — shifokorga Telegram xabari (ownerBot.ts, 0050) */
    onConfirmed?: (appt: any) => void;
    /** Saytdan yangi so'rov (tasdiq kutadi) — registratorga Telegram (0051) */
    onRequested?: (appt: any) => void;
};

/* Oddiy xotira chegarasi: kalit → [vaqtlar]. Har 10 daqiqada eskisi
   tozalanadi — qaytib kelmagan IP lar xotirada to'planib qolmasin. */
const hits = new Map<string, number[]>();
const HIT_TTL_MS = 3600_000;
setInterval(() => {
    const now = Date.now();
    for (const [k, list] of hits) {
        const fresh = list.filter(t => now - t < HIT_TTL_MS);
        if (fresh.length) hits.set(k, fresh); else hits.delete(k);
    }
}, 10 * 60_000).unref?.();
function tooMany(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (list.length >= max) { hits.set(key, list); return true; }
    list.push(now);
    hits.set(key, list);
    return false;
}

/** Tasdiqlangan qabul haqida bemorga xabar: «yozildi» qoidasi bo'lsa — o'sha,
 *  bo'lmasa qisqa matn (Telegram, bo'lmasa SMS). */
async function notifyConfirmed(deps: Deps, appt: any): Promise<'rule' | 'sent' | null> {
    const { prisma, sendUnified, kickTrigger } = deps;
    const hasRule = await prisma.automationRule.count({ where: { clinicId: appt.clinicId, trigger: 'appointment_booked', active: true } });
    if (hasRule) {
        await prisma.appointment.update({ where: { id: appt.id }, data: { bookedAt: new Date() } });
        kickTrigger('appointment_booked');
        return 'rule';
    }
    const [clinic, patient] = await Promise.all([
        prisma.clinic.findUnique({ where: { id: appt.clinicId } }),
        prisma.patient.findUnique({ where: { id: appt.patientId } }),
    ]);
    if (!clinic || !patient) return null;
    const msg = `✅ Qabulingiz tasdiqlandi.\n\n${clinic.name || 'Klinika'}\n👨‍⚕️ ${appt.doctorName}\n📅 ${appt.date}, ⏰ ${appt.time}`
        + (clinic.phone ? `\n\n📞 ${clinic.phone}` : '');
    const r = await sendUnified(clinic, patient, msg, { channel: 'telegram_first', source: 'booking', refId: appt.id, type: 'Booking' })
        .catch(() => ({ success: false }));
    return r?.success ? 'sent' : null;
}

export function registerOnlineBookingRoutes(app: any, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId, socketIp, emitEvent } = deps;

    /** Havola qaysi klinikaniki: bitta klinika — o'sha; bir nechta — ?c=id */
    const clinicFor = async (req: any) => {
        const id = String(req.query?.c || req.body?.c || '');
        const where: any = { onlineBookingEnabled: true, ...(id ? { id } : {}) };
        const list = await prisma.clinic.findMany({ where, take: 2, select: { id: true, name: true, phone: true, address: true, startHour: true, endHour: true, bookingAutoConfirm: true } });
        return !id && list.length > 1 ? null : list[0] || null;
    };

    const doctorsOf = (clinicId: string) => prisma.doctor.findMany({
        where: { clinicId, status: 'Active' },
        select: { id: true, firstName: true, lastName: true, specialty: true, workDays: true, startHour: true, endHour: true },
        orderBy: { lastName: 'asc' },
    });

    app.get('/api/public/booking', async (req: any, res: any) => {
        try {
            const clinic = await clinicFor(req);
            if (!clinic) return res.status(404).json({ error: 'Saytdan yozilish yoqilmagan' });
            const today = todayTash();
            const days = Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today, i));
            const doctors = await doctorsOf(clinic.id);
            res.json({
                clinic: { name: clinic.name, phone: clinic.phone || null, address: clinic.address || null },
                doctors: doctors.map((d: any) => ({
                    id: d.id, name: `${d.lastName || ''} ${d.firstName || ''}`.trim(), specialty: d.specialty || '',
                    days: days.filter(x => worksOn(d, x)),
                })),
            });
        } catch (e: any) {
            console.error('[booking info]', e?.message || e);
            res.status(500).json({ error: 'Xatolik' });
        }
    });

    app.get('/api/public/booking/slots', async (req: any, res: any) => {
        try {
            if (tooMany(`s:${socketIp(req)}`, LIMITS.slotsPerMin, 60_000)) return res.status(429).json({ error: "Juda ko'p so'rov. Birozdan keyin urinib ko'ring." });
            const clinic = await clinicFor(req);
            if (!clinic) return res.status(404).json({ error: 'Saytdan yozilish yoqilmagan' });
            const date = String(req.query.date || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Sana noto'g'ri" });
            const doctor = await prisma.doctor.findFirst({ where: { id: String(req.query.doctorId || ''), clinicId: clinic.id, status: 'Active' } });
            if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });
            if (date > addDays(todayTash(), DAYS_AHEAD)) return res.json({ times: [] });
            const taken = await prisma.appointment.findMany({
                where: { doctorId: doctor.id, date, status: { notIn: ['Cancelled'] } }, select: { time: true, duration: true },
            });
            res.json({ times: freeSlots({ doctor, clinic, date, taken }) });
        } catch (e: any) {
            console.error('[booking slots]', e?.message || e);
            res.status(500).json({ error: 'Xatolik' });
        }
    });

    app.post('/api/public/booking', async (req: any, res: any) => {
        try {
            const b = req.body || {};
            /* Tuzoq: odam ko'rmaydigan maydon to'ldirilgan — bot. Muvaffaqiyat
               deb javob beramiz, lekin hech narsa yozmaymiz. */
            if (b.website) return res.json({ ok: true, confirmed: false });
            if (tooMany(`p:${socketIp(req)}`, LIMITS.postsPerHour, 3600_000)) {
                return res.status(429).json({ error: "Juda ko'p urinish. Iltimos, klinikaga qo'ng'iroq qiling." });
            }
            const clinic = await clinicFor(req);
            if (!clinic) return res.status(404).json({ error: 'Saytdan yozilish yoqilmagan' });

            const name = cleanName(b.name);
            const phone = normalizeUzPhone(b.phone);
            const date = String(b.date || '');
            const time = String(b.time || '');
            if (name.length < 2) return res.status(400).json({ error: 'Ismingizni yozing' });
            if (!phone) return res.status(400).json({ error: "Telefon raqami noto'g'ri (+998 XX XXX XX XX)" });
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: "Kun yoki vaqt noto'g'ri" });
            const today = todayTash();
            /* Haqiqiy sana (2026-13-45 emas) va faqat yaqin ikki hafta */
            const parsed = new Date(`${date}T00:00:00Z`);
            if (Number.isNaN(parsed.getTime()) || isoDay(parsed) !== date || date < today || date > addDays(today, DAYS_AHEAD)) {
                return res.status(400).json({ error: "Bu kunga onlayn yozilib bo'lmaydi" });
            }

            const doctor = await prisma.doctor.findFirst({ where: { id: String(b.doctorId || ''), clinicId: clinic.id, status: 'Active' } });
            if (!doctor) return res.status(404).json({ error: 'Shifokor topilmadi' });

            /* Holatdan qat'i nazar: «avtomatik tasdiq» yoqilganda ham chegara ishlaydi */
            const createdToday = await prisma.appointment.count({
                where: { clinicId: clinic.id, source: 'site', notes: { contains: `[sayt:${today}]` } },
            });
            if (createdToday >= LIMITS.perClinicDay) return res.status(429).json({ error: "Bugun so'rovlar ko'p. Iltimos, klinikaga qo'ng'iroq qiling." });

            const result = await prisma.$transaction(async (tx: any) => {
                const taken = await tx.appointment.findMany({
                    where: { doctorId: doctor.id, date, status: { notIn: ['Cancelled'] } }, select: { time: true, duration: true },
                });
                if (!freeSlots({ doctor, clinic, date, taken }).includes(time)) return { error: 'taken' as const };

                /* Bemor: telefon bo'yicha; bo'lmasa qisqa karta (registrator
                   to'ldiradi). Javob ikkala holatda ham BIR XIL — begona odam
                   kim bemor ekanini bilib olmasin. */
                let patient = await tx.patient.findFirst({ where: { clinicId: clinic.id, phone } });
                let createdPatient = false;
                if (!patient) {
                    const [first, ...rest] = name.split(' ');
                    patient = await tx.patient.create({
                        data: {
                            firstName: first, lastName: rest.join(' ') || '', phone, clinicId: clinic.id,
                            dob: '', gender: '', medicalHistory: '', status: 'Active', lastVisit: 'Never',
                        },
                    });
                    createdPatient = true;
                }
                /* Bitta telefon — oldindagi saytdan yozilishlar (tasdiqlangan ham) */
                const open = await tx.appointment.count({
                    where: { patientId: patient.id, source: 'site', status: { in: ['Requested', 'Confirmed'] }, date: { gte: today } },
                });
                if (open >= LIMITS.openPerPhone) return { error: 'tooManyOpen' as const };

                const appt = await tx.appointment.create({
                    data: {
                        patientId: patient.id,
                        patientName: `${patient.firstName} ${patient.lastName}`.trim(),
                        doctorId: doctor.id,
                        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
                        clinicId: clinic.id,
                        departmentId: (doctor as any).departmentId || null,
                        date, time, duration: SLOT_MIN,
                        status: 'Requested', source: 'site', type: 'Konsultatsiya',
                        notes: `Saytdan yozildi [sayt:${today}]${createdPatient ? ` ${NEW_CARD_TAG}` : ` · yozgan ism: ${name}`}`,
                    },
                });
                return { appt, createdPatient };
            });
            if ('error' in result) {
                if (result.error === 'taken') return res.status(409).json({ error: "Bu vaqt band bo'lib qoldi. Boshqa vaqt tanlang." });
                return res.status(429).json({ error: "Sizda tasdiq kutayotgan so'rov bor. Klinika siz bilan bog'lanadi." });
            }
            emitEvent(clinic.id, 'data.changed', { resource: 'appointments' });

            let confirmed = false;
            if (!clinic.bookingAutoConfirm) deps.onRequested?.(result.appt);
            if (clinic.bookingAutoConfirm) {
                await prisma.appointment.update({ where: { id: result.appt.id }, data: { status: 'Confirmed' } });
                await notifyConfirmed(deps, result.appt).catch(() => null);
                deps.onConfirmed?.({ ...result.appt, status: 'Confirmed' });
                confirmed = true;
            }
            res.json({ ok: true, confirmed });
        } catch (e: any) {
            console.error('[booking create]', e?.message || e);
            res.status(500).json({ error: "So'rovni yuborib bo'lmadi" });
        }
    });

    /* ── Xodim: tasdiqlash / boshqa vaqt / rad etish ─────────────────────── */
    app.post('/api/appointments/:id/confirm', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            const appt = await prisma.appointment.findUnique({ where: { id: String(req.params.id) } });
            if (!appt || appt.clinicId !== clinicId) return res.status(404).json({ error: 'Yozuv topilmadi' });
            if (appt.status !== 'Requested') return res.status(409).json({ error: "Bu yozuv tasdiq kutmayapti", code: 'NOT_REQUESTED' });
            const date = req.body?.date ? String(req.body.date) : appt.date;
            const time = req.body?.time ? String(req.body.time) : appt.time;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: "Kun yoki vaqt noto'g'ri" });
            if (date !== appt.date || time !== appt.time) {
                const busy = await prisma.appointment.findMany({
                    where: { doctorId: appt.doctorId, date, status: { notIn: ['Cancelled'] }, id: { not: appt.id } },
                    select: { time: true, duration: true },
                });
                const m = toMin(time);
                if (busy.some((a: any) => m < toMin(a.time) + (a.duration || SLOT_MIN) && m + (appt.duration || SLOT_MIN) > toMin(a.time))) {
                    return res.status(409).json({ error: 'Bu vaqtda shifokor band', code: 'OVERLAP' });
                }
            }
            const r = await prisma.appointment.updateMany({ where: { id: appt.id, status: 'Requested' }, data: { status: 'Confirmed', date, time } });
            if (!r.count) return res.status(409).json({ error: "Bu yozuv tasdiq kutmayapti", code: 'NOT_REQUESTED' });
            const notified = await notifyConfirmed(deps, { ...appt, date, time }).catch(() => null);
            deps.onConfirmed?.({ ...appt, date, time, status: 'Confirmed' });
            emitEvent(appt.clinicId, 'data.changed', { resource: 'appointments' });
            res.json({ success: true, notified });
        } catch (e: any) {
            console.error('[booking confirm]', e?.message || e);
            res.status(500).json({ error: "Tasdiqlab bo'lmadi" });
        }
    });

    app.post('/api/appointments/:id/reject', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            const appt = await prisma.appointment.findUnique({ where: { id: String(req.params.id) } });
            if (!appt || appt.clinicId !== clinicId) return res.status(404).json({ error: 'Yozuv topilmadi' });
            if (appt.status !== 'Requested') return res.status(409).json({ error: "Bu yozuv tasdiq kutmayapti", code: 'NOT_REQUESTED' });
            /* Faqat hali so'rov bo'lsa — boshqa xodim shu payt tasdiqlagan bo'lishi mumkin */
            const r = await prisma.appointment.updateMany({ where: { id: appt.id, status: 'Requested' }, data: { status: 'Cancelled' } });
            if (!r.count) return res.status(409).json({ error: "Bu yozuv tasdiq kutmayapti", code: 'NOT_REQUESTED' });
            /* Karta faqat SHU so'rov yaratgan bo'lsa (belgi) va boshqa hech narsasi yo'q bo'lsa o'chadi */
            const p = String(appt.notes || '').includes(NEW_CARD_TAG) ? await prisma.patient.findUnique({
                where: { id: appt.patientId },
                include: { _count: { select: { appointments: true, visits: true, transactions: true, allergies: true } } },
            }) : null;
            if (p && p.lastVisit === 'Never' && !p.telegramChatId && p._count.appointments === 1
                && !p._count.visits && !p._count.transactions && !p._count.allergies) {
                await prisma.appointment.delete({ where: { id: appt.id } }).catch(() => null);
                await prisma.patient.delete({ where: { id: p.id } }).catch(() => null);
            }
            emitEvent(appt.clinicId, 'data.changed', { resource: 'appointments' });
            res.json({ success: true });
        } catch (e: any) {
            console.error('[booking reject]', e?.message || e);
            res.status(500).json({ error: "Rad etib bo'lmadi" });
        }
    });

    /* ── Sozlama (ega) ─────────────────────────────────────────────────── */
    app.get('/api/online-booking/settings', auth, async (req: any, res: any) => {
        const clinicId = getScopedClinicId(req);
        const c = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { onlineBookingEnabled: true, bookingAutoConfirm: true } });
        const base = deps.tunnelUrl();
        res.json({ enabled: !!c?.onlineBookingEnabled, autoConfirm: !!c?.bookingAutoConfirm, url: base ? `${base.replace(/\/$/, '')}/book` : null });
    });

    app.put('/api/online-booking/settings', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (req.user?.role !== 'CLINIC_ADMIN') return res.status(403).json({ error: 'Faqat klinika egasi' });
            const data: any = {};
            if (req.body?.enabled !== undefined) data.onlineBookingEnabled = req.body.enabled === true;
            if (req.body?.autoConfirm !== undefined) data.bookingAutoConfirm = req.body.autoConfirm === true;
            const c = await prisma.clinic.update({ where: { id: clinicId }, data, select: { onlineBookingEnabled: true, bookingAutoConfirm: true } });
            res.json({ success: true, enabled: c.onlineBookingEnabled, autoConfirm: c.bookingAutoConfirm });
        } catch (e: any) {
            console.error('[booking settings]', e?.message || e);
            res.status(500).json({ error: "Sozlamani saqlab bo'lmadi" });
        }
    });
}
