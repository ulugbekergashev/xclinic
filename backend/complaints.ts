/* ─────────────────────────────────────────────────────────────────────────────
   SHIKOYAT VA FIKRLAR (2026-11-26, migratsiya 0047).

   Qayerdan keladi:
     · bemor botda 1–3 yulduz qo'ysa — avtomatik (`recordRating`); bot
       «Nima yoqmadi?» deb so'raydi va keyingi xabari shikoyat matni bo'ladi;
     · registrator bemor kartasidan o'zi yozadi.
   Qayerda ko'rinadi: «Bugun» ekranida, «Qayta ko'rik» ro'yxati ostida — ega
   va «Shikoyatlar bilan ishlash» ruxsati berilgan xodimga (registratorda
   standart yoqiq). Alohida sahifa yo'q.

   Har shikoyatda: mas'ul (xodim yoki ega), «Bemorga qo'ng'iroq», «Hal qilindi
   deb yopish» — izoh SHART (nima qilingani kartada qoladi).
   Yulduzlar `Review` da qoladi — o'rtacha baho shu yerdan hisoblanadi.
   ───────────────────────────────────────────────────────────────────────────── */

const TASHKENT_OFFSET_MS = 5 * 3600 * 1000;
const LOW_RATING = 3;
const MAX_TEXT = 1000;

const clean = (v: unknown, max = MAX_TEXT): string =>
    String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);

const fullName = (p: any) => [p?.lastName, p?.firstName].filter(Boolean).join(' ').trim();

/** Oy boshi (Toshkent) — UTC Date */
function monthStartUtc(now = new Date()): Date {
    const t = new Date(now.getTime() + TASHKENT_OFFSET_MS);
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - TASHKENT_OFFSET_MS);
}

/**
 * Botdagi baho. Faqat 1..5 va faqat O'SHA bemorning chati bosgan bo'lsa.
 * 1–3 — shikoyat ochiladi (bir baho — bitta shikoyat, qayta baholansa ham).
 */
export async function recordRating(prisma: any, input: { appointmentId: string; chatId: string; rating: number }): Promise<
    { ok: false; reason: string } | { ok: true; clinicId: string; complaintId: string | null; patientName: string; doctorName: string | null; rating: number }
> {
    const rating = Math.round(Number(input.rating));
    if (!(rating >= 1 && rating <= 5)) return { ok: false, reason: 'rating' };
    const appt = await prisma.appointment.findUnique({
        where: { id: String(input.appointmentId) },
        include: { patient: true, doctor: true },
    });
    if (!appt?.patient) return { ok: false, reason: 'appointment' };
    if (!appt.patient.telegramChatId || String(appt.patient.telegramChatId) !== String(input.chatId)) {
        return { ok: false, reason: 'chat' };
    }
    const review = await prisma.review.upsert({
        where: { appointmentId: appt.id },
        update: { rating },
        create: { appointmentId: appt.id, rating },
    });
    const doctorName = appt.doctor ? fullName(appt.doctor) : null;
    let complaintId: string | null = null;
    if (rating <= LOW_RATING) {
        const existing = await prisma.complaint.findUnique({ where: { reviewId: review.id } });
        if (existing) complaintId = existing.id;
        else {
            try {
                const c = await prisma.complaint.create({
                    data: {
                        clinicId: appt.clinicId, patientId: appt.patientId, reviewId: review.id,
                        appointmentId: appt.id, doctorId: appt.doctorId || null, doctorName,
                        source: 'bot', status: 'open',
                    },
                });
                complaintId = c.id;
            } catch (e: any) {
                if (e?.code !== 'P2002') throw e;   // ikki bosish bir vaqtda — bittasi qoladi
                complaintId = (await prisma.complaint.findUnique({ where: { reviewId: review.id } }))?.id || null;
            }
        }
    }
    return { ok: true, clinicId: appt.clinicId, complaintId, patientName: fullName(appt.patient), doctorName, rating };
}

/** Bot «Nima yoqmadi?» javobini yozadi (faqat matni bo'sh bo'lsa) */
export async function attachComplaintText(prisma: any, complaintId: string, text: string): Promise<boolean> {
    const body = clean(text);
    if (!body) return false;
    const r = await prisma.complaint.updateMany({ where: { id: complaintId, text: null }, data: { text: body } });
    if (r.count) {
        const c = await prisma.complaint.findUnique({ where: { id: complaintId }, select: { reviewId: true } });
        if (c?.reviewId) await prisma.review.update({ where: { id: c.reviewId }, data: { comment: body } }).catch(() => null);
    }
    return r.count > 0;
}

type Deps = { prisma: any; authenticateToken: any; getScopedClinicId: (req: any) => string | null };

/** Mas'ul bo'la oladiganlar — faol xodimlar va ega */
async function assignees(prisma: any, clinicId: string, ownerName?: string | null) {
    const [docs, recs, labs, nurses, clinic] = await Promise.all([
        prisma.doctor.findMany({ where: { clinicId, status: 'Active' }, select: { id: true, firstName: true, lastName: true } }),
        prisma.receptionist.findMany({ where: { clinicId, status: 'Active' }, select: { id: true, firstName: true, lastName: true } }),
        prisma.labTechnician.findMany({ where: { clinicId, status: 'Active' }, select: { id: true, firstName: true, lastName: true } }),
        prisma.nurse.findMany({ where: { clinicId, status: 'Active' }, select: { id: true, firstName: true, lastName: true } }),
        prisma.clinic.findUnique({ where: { id: clinicId }, select: { adminName: true } }),
    ]);
    const row = (role: string, roleLabel: string) => (x: any) => ({ key: `${role}:${x.id}`, name: `${fullName(x)} (${roleLabel})` });
    return [
        { key: `CLINIC_ADMIN:${clinicId}`, name: `${clinic?.adminName || ownerName || 'Ega'} (ega)` },
        ...recs.map(row('RECEPTIONIST', 'registrator')),
        ...docs.map(row('DOCTOR', 'shifokor')),
        ...nurses.map(row('NURSE', 'hamshira')),
        ...labs.map(row('LAB_TECHNICIAN', 'laborant')),
    ];
}

export function registerComplaintRoutes(app: any, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    const isOwner = (req: any) => req.user?.role === 'CLINIC_ADMIN';
    /* O'qish ham yopiq: shikoyat — bemor haqidagi nozik ma'lumot */
    const canWork = (req: any) => isOwner(req) || !!req.perms?.flag?.('patients', 'complaints');
    const canSeePhone = (req: any) => isOwner(req) || req.perms?.flag?.('patients', 'phone') !== false;

    const guard = (fn: (req: any, res: any, clinicId: string) => Promise<any>) => async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            if (!canWork(req)) return res.status(403).json({ error: "Ruxsat yo'q: shikoyatlar" });
            await fn(req, res, clinicId);
        } catch (e: any) {
            console.error('[complaints]', e?.message || e);
            res.status(500).json({ error: "Shikoyatni saqlab bo'lmadi" });
        }
    };

    const view = (c: any, phone: boolean) => ({
        id: c.id, source: c.source, text: c.text, status: c.status,
        createdAt: c.createdAt, resolvedAt: c.resolvedAt, resolvedByName: c.resolvedByName, resolution: c.resolution,
        assigneeKey: c.assigneeKey, assigneeName: c.assigneeName, createdByName: c.createdByName,
        doctorName: c.doctorName, visitDate: c.visitDate || null,
        rating: c.review?.rating ?? null,
        patientId: c.patientId, patientName: fullName(c.patient),
        phone: phone ? (c.patient?.phone || null) : null,
    });

    app.get('/api/complaints', auth, guard(async (req, res, clinicId) => {
        const since = monthStartUtc();
        const recent = new Date(Date.now() - 30 * 864e5);
        const [rows, reviews, open, resolvedMonth, people] = await Promise.all([
            prisma.complaint.findMany({
                where: { clinicId, OR: [{ status: 'open' }, { resolvedAt: { gte: recent } }] },
                include: { patient: { select: { firstName: true, lastName: true, phone: true } }, review: { select: { rating: true } } },
                orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
                take: 100,
            }),
            prisma.review.findMany({
                where: { createdAt: { gte: since }, appointment: { clinicId } },
                select: { rating: true },
            }),
            prisma.complaint.count({ where: { clinicId, status: 'open' } }),
            prisma.complaint.count({ where: { clinicId, status: 'resolved', resolvedAt: { gte: since } } }),
            assignees(prisma, clinicId, req.user?.name),
        ]);
        /* Qabul sanasi — shikoyat kartasida «24.11 qabuli» */
        const visitIds = rows.map((r: any) => r.visitId).filter(Boolean);
        const apptIds = rows.map((r: any) => r.appointmentId).filter(Boolean);
        const [visits, appts] = await Promise.all([
            visitIds.length ? prisma.visit.findMany({ where: { id: { in: visitIds } }, select: { id: true, date: true } }) : [],
            apptIds.length ? prisma.appointment.findMany({ where: { id: { in: apptIds } }, select: { id: true, date: true } }) : [],
        ]);
        const dateOf = new Map<string, string>([...visits, ...appts].map((x: any) => [x.id, x.date]));
        const phone = canSeePhone(req);
        const avg = reviews.length ? Math.round((reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length) * 10) / 10 : null;
        res.json({
            stats: { avgRating: avg, ratingCount: reviews.length, open, resolvedMonth },
            rows: rows.map((c: any) => view({ ...c, visitDate: dateOf.get(c.visitId) || dateOf.get(c.appointmentId) || null }, phone)),
            assignees: people,
        });
    }));

    const resolveAssignee = async (clinicId: string, key: unknown, ownerName?: string) => {
        if (key === null || key === undefined || key === '') return { assigneeKey: null, assigneeName: null };
        const hit = (await assignees(prisma, clinicId, ownerName)).find(a => a.key === String(key));
        if (!hit) return null;
        return { assigneeKey: hit.key, assigneeName: hit.name };
    };

    app.post('/api/complaints', auth, guard(async (req, res, clinicId) => {
        const text = clean(req.body?.text);
        if (text.length < 3) return res.status(400).json({ error: 'Shikoyat matni kamida 3 harf' });
        const patient = await prisma.patient.findFirst({ where: { id: String(req.body?.patientId || ''), clinicId } });
        if (!patient) return res.status(404).json({ error: 'Bemor topilmadi' });
        const who = await resolveAssignee(clinicId, req.body?.assigneeKey, req.user?.name);
        if (!who) return res.status(400).json({ error: "Mas'ul topilmadi" });
        /* Qaysi qabul — oxirgisi (shifokor nomi nusxa bo'lib saqlanadi) */
        const visit = await prisma.visit.findFirst({
            where: { clinicId, patientId: patient.id, status: { not: 'Cancelled' } },
            orderBy: [{ date: 'desc' }, { checkInTime: 'desc' }],
            include: { doctor: { select: { firstName: true, lastName: true } } },
        });
        const c = await prisma.complaint.create({
            data: {
                clinicId, patientId: patient.id, source: 'reception', text, status: 'open',
                visitId: visit?.id || null, doctorId: visit?.doctorId || null,
                doctorName: visit?.doctor ? fullName(visit.doctor) : (visit?.doctorName || null),
                createdByName: req.user?.name || null, ...who,
            },
        });
        res.json({ id: c.id });
    }));

    app.put('/api/complaints/:id', auth, guard(async (req, res, clinicId) => {
        const c = await prisma.complaint.findUnique({ where: { id: String(req.params.id) } });
        if (!c || c.clinicId !== clinicId) return res.status(404).json({ error: 'Shikoyat topilmadi' });
        const who = await resolveAssignee(clinicId, req.body?.assigneeKey, req.user?.name);
        if (!who) return res.status(400).json({ error: "Mas'ul topilmadi" });
        await prisma.complaint.update({ where: { id: c.id }, data: who });
        res.json({ success: true, ...who });
    }));

    app.post('/api/complaints/:id/resolve', auth, guard(async (req, res, clinicId) => {
        const resolution = clean(req.body?.resolution);
        if (resolution.length < 3) return res.status(400).json({ error: 'Nima qilinganini yozing (kamida 3 harf)' });
        const c = await prisma.complaint.findUnique({ where: { id: String(req.params.id) } });
        if (!c || c.clinicId !== clinicId) return res.status(404).json({ error: 'Shikoyat topilmadi' });
        const r = await prisma.complaint.updateMany({
            where: { id: c.id, status: 'open' },
            data: { status: 'resolved', resolution, resolvedAt: new Date(), resolvedByName: req.user?.name || null },
        });
        if (!r.count) return res.status(409).json({ error: 'Shikoyat allaqachon yopilgan', code: 'ALREADY_RESOLVED' });
        res.json({ success: true });
    }));

    app.post('/api/complaints/:id/reopen', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            if (!isOwner(req)) return res.status(403).json({ error: 'Faqat klinika egasi' });
            const c = await prisma.complaint.findUnique({ where: { id: String(req.params.id) } });
            if (!c || c.clinicId !== clinicId) return res.status(404).json({ error: 'Shikoyat topilmadi' });
            await prisma.complaint.update({ where: { id: c.id }, data: { status: 'open', resolvedAt: null, resolvedByName: null } });
            res.json({ success: true });
        } catch (e: any) {
            console.error('[complaint reopen]', e?.message || e);
            res.status(500).json({ error: "Qayta ochib bo'lmadi" });
        }
    });

    app.put('/api/clinics/:id/complaint-alert', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId || clinicId !== req.params.id) return res.status(403).json({ error: "Ruxsat yo'q (boshqa klinika)" });
            if (!isOwner(req)) return res.status(403).json({ error: 'Faqat klinika egasi' });
            const enabled = req.body?.enabled === true;
            await prisma.clinic.update({ where: { id: clinicId }, data: { complaintAlert: enabled } });
            res.json({ success: true, complaintAlert: enabled });
        } catch (e: any) {
            console.error('[complaint-alert]', e?.message || e);
            res.status(500).json({ error: "Sozlamani saqlab bo'lmadi" });
        }
    });
}
