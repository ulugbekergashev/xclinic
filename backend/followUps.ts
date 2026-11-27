/* QAYTA KO'RIK (2026-11-26) — «3 haftadan keyin keling».

   • Shifokor qabul varag'ida muddatni bosadi (ixtiyoriy, qabulni yopishga
     majburiy qadam QO'SHILMADI) → `Visit.followUpDate`.
   • Registratura «Bugun» ekranida ro'yxatni ko'radi: kimga qo'ng'iroq
     qilish kerak, kim allaqachon yozilgan.
   • Xabarlar → Avtomatik dagi «Qayta ko'rik» qoidasi yoqilsa, bemorga
     N kun oldin eslatma ketadi (`triggers.ts`, shu fayldagi `followUpRows`).

   «Keldimi» saqlanmaydi — hisoblanadi: shu bemorning keyingi (bekor
   qilinmagan) qabuli bo'lsa, u qaytib kelgan. Kelajakdagi kalendar yozuvi
   bo'lsa — «yozilgan». Ikki joyda bitta qoida (ro'yxat va eslatma). */
import type express from 'express';
import { actsAs } from './permissions';
import { tashkentDateStr } from './tashkentTime';

type Deps = { prisma: any; authenticateToken: any; getScopedClinicId: (req: any) => string | null };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Ro'yxat oynasi: shuncha kun kechikkan ham ko'rinadi */
export const OVERDUE_DAYS = 30;

export interface FollowUpRow {
    visitId: string;
    patientId: string;
    patientName: string;
    phone: string | null;
    hasTelegram: boolean;
    followUpDate: string;
    visitDate: string;
    doctorName: string | null;
    diagnosis: string | null;
    /** Kelajakdagi kalendar yozuvi bo'lsa */
    booked: { date: string; time: string } | null;
}

/**
 * Qayta ko'rik kutilayotgan qabullar: `from`..`to` oralig'ida, bemor hali
 * qaytib kelmagan. `opts.unbookedOnly` — eslatma uchun (yozilganga ketmaydi).
 */
export async function followUpRows(prisma: any, clinicId: string, from: string, to: string, opts: { doctorId?: string | null } = {}): Promise<FollowUpRow[]> {
    const visits = await prisma.visit.findMany({
        where: {
            clinicId, status: { not: 'Cancelled' },
            followUpDate: { gte: from, lte: to },
            ...(opts.doctorId ? { doctorId: opts.doctorId } : {}),
        },
        select: {
            id: true, patientId: true, date: true, followUpDate: true, doctorName: true,
            patient: { select: { id: true, firstName: true, lastName: true, phone: true, telegramChatId: true, status: true } },
            diagnoses: { select: { code: true, kind: true, icd10: { select: { name: true } } } },
        },
        orderBy: { followUpDate: 'asc' },
    });
    if (!visits.length) return [];
    const patientIds = Array.from(new Set(visits.map((v: any) => v.patientId)));
    const minDate = visits.reduce((m: string, v: any) => (v.date < m ? v.date : m), visits[0].date);
    const today = tashkentDateStr();
    const [later, appts] = await Promise.all([
        prisma.visit.findMany({
            where: { clinicId, patientId: { in: patientIds }, status: { not: 'Cancelled' }, date: { gt: minDate } },
            select: { patientId: true, date: true },
        }),
        prisma.appointment.findMany({
            where: { clinicId, patientId: { in: patientIds }, date: { gte: today }, status: { notIn: ['Cancelled', 'No-Show', 'Completed'] } },
            select: { patientId: true, date: true, time: true },
            orderBy: [{ date: 'asc' }, { time: 'asc' }],
        }),
    ]);
    /* Bir bemorning bir nechta belgisi (bir kunda ikki qabul ham) — BITTA
       qator: eng so'nggi qabulniki. Aks holda ro'yxatda ikki qator va
       eslatma ikki marta ketardi. */
    const latest = new Map<string, any>();
    for (const v of visits) {
        const cur = latest.get(v.patientId);
        if (!cur || v.date > cur.date || (v.date === cur.date && v.id > cur.id)) latest.set(v.patientId, v);
    }
    const out: FollowUpRow[] = [];
    for (const v of visits) {
        if (latest.get(v.patientId) !== v) continue;
        if (!v.patient || v.patient.status === 'Archived') continue;
        /* Keyin kelgan — ro'yxatdan chiqadi (shu kuni boshqa sabab bilan kelgani ham) */
        if (later.some((x: any) => x.patientId === v.patientId && x.date > v.date)) continue;
        const appt = appts.find((a: any) => a.patientId === v.patientId);
        const main = (v.diagnoses || []).find((d: any) => d.kind === 'Main') || v.diagnoses?.[0];
        out.push({
            visitId: v.id, patientId: v.patientId,
            patientName: `${v.patient.lastName || ''} ${v.patient.firstName || ''}`.trim(),
            phone: v.patient.phone || null, hasTelegram: !!v.patient.telegramChatId,
            followUpDate: v.followUpDate, visitDate: v.date, doctorName: v.doctorName || null,
            diagnosis: main ? (main.icd10?.name || main.code) : null,
            booked: appt ? { date: appt.date, time: appt.time } : null,
        });
    }
    return out;
}

export function registerFollowUpRoutes(app: express.Express, { prisma, authenticateToken, getScopedClinicId }: Deps) {
    const route = (method: 'get' | 'post', path: string, handler: (req: any, res: any, clinicId: string) => Promise<any>) => {
        app[method](path, authenticateToken, async (req: any, res: any) => {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'Klinika aniqlanmadi' });
            try { await handler(req, res, clinicId); }
            catch (e: any) {
                console.error(`[follow-up] ${method.toUpperCase()} ${path}:`, e?.message || e);
                res.status(500).json({ error: "Qayta ko'rikni saqlab bo'lmadi" });
            }
        });
    };

    /** Shifokor belgilaydi yoki olib tashlaydi (`date: null`). Yopilgan qabulga
        ham — qaror ko'pincha yakunlashdan keyin aytiladi. */
    route('post', '/api/visits/:id/follow-up', async (req, res, clinicId) => {
        if (!actsAs(req, 'DOCTOR', 'CLINIC_ADMIN')) return res.status(403).json({ error: "Qayta ko'rikni shifokor belgilaydi" });
        const visit = await prisma.visit.findUnique({ where: { id: req.params.id }, select: { id: true, clinicId: true, date: true, status: true } });
        if (!visit || visit.clinicId !== clinicId) return res.status(404).json({ error: 'Qabul topilmadi' });
        if (visit.status === 'Cancelled') return res.status(409).json({ error: 'Qabul bekor qilingan' });
        const raw = req.body?.date;
        const date = raw == null || raw === '' ? null : String(raw);
        if (date !== null) {
            if (!ISO.test(date) || isNaN(Date.parse(`${date}T00:00:00Z`))) return res.status(400).json({ error: "Sana noto'g'ri" });
            if (date <= visit.date) return res.status(400).json({ error: "Qayta ko'rik qabuldan keyingi kunga bo'lishi kerak" });
        }
        const updated = await prisma.visit.update({ where: { id: visit.id }, data: { followUpDate: date }, select: { id: true, followUpDate: true } });
        res.json(updated);
    });

    /** Registratura ro'yxati: kechikkanlar (30 kungacha), bugun va yaqin kunlar */
    route('get', '/api/follow-ups', async (req, res, clinicId) => {
        const today = tashkentDateStr();
        const ahead = Math.min(14, Math.max(0, Number(req.query.ahead) || 3));
        const from = tashkentDateStr(-OVERDUE_DAYS);
        const to = tashkentDateStr(ahead);
        const rows = await followUpRows(prisma, clinicId, from, to);
        res.json({ today, rows });
    });
}
