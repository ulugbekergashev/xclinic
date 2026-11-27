/* ─────────────────────────────────────────────────────────────────────────────
   DIAGNOSTIKA VA LABORATORIYA NAVBATI (2026-11-27, migratsiya 0049).

   Ega so'radi: «bularda hech qanday navbat degan narsalar bo'lmaydimi?».
   Olti tomon (kod xaritasi, UZI/laborant, ega, bozor, soddalik tanqidchisi,
   arxitektura) muhokamasidan keyingi qaror:

   · YANGI RAQAM YO'Q. Bemor qabulda olgan talon (masalan T-05) bilan UZI ga
     ham, qon olishga ham boradi. Alohida «U-01» raqami bemor qo'lida ikkita
     raqam va tablo bilan kelishmaydigan son bo'lardi. Talon qabulning
     (Visit) raqami va bo'lim kodidan — tablodagi bilan AYNAN bir xil.
   · «KUTMOQDA» YANGI QADAM EMAS. Yo'llanma yozilgan va hali boshlanmagan
     bo'lsa — navbatda. «Keldi» tugmasi yo'q.
   · «CHAQIRISH» IXTIYORIY. Bosilsa vaqti yoziladi va tablo ovoz bilan
     «T-05, UZI xonasiga» deydi; qayta bosish — qayta e'lon. Bosmasdan
     to'g'ridan-to'g'ri «Boshlash» yoki «Olindi» ham ishlaydi.
   · QABULGA TEGILMAYDI. `Visit.status = Called` qilinsa bemor shifokor
     navbatiga qaytib tushardi — chaqiruv faqat tekshiruv/buyurtmada.
   · Talonsiz yo'llanma (qabulsiz to'g'ridan-to'g'ri yozilgan) ham
     chaqiriladi, lekin tabloga chiqmaydi: tablo login'siz ochiladi va
     ism ko'rsatmaydi, raqamsiz e'lon esa ma'nosiz.
   ───────────────────────────────────────────────────────────────────────────── */

import { tashkentDateStr, tashkentDayBounds } from './tashkentTime';

/** Tekshiruv turi → xona nomi (tablo va ovoz uchun) */
export const MODALITY_ROOM: Record<string, string> = {
    UZI: 'UZI',
    EKG: 'EKG',
    RENTGEN: 'Rentgen',
    ENDOSKOPIYA: 'Endoskopiya',
    MRT: 'MRT',
    KT: 'KT',
};
export const LAB_ROOM = 'Laboratoriya';

type TicketVisit = { queueNumber?: number | null; date?: string | null; department?: { code?: string | null } | null } | null | undefined;

/** Talon yorlig'i — tablodagi bilan bitta qoida: «K-02», kod bo'lmasa «2».
 *  `date` berilgan bo'lsa — faqat BUGUNGI qabul: kechagi T-05 bugun boshqa
 *  bemorniki bo'lishi mumkin, eski raqam e'lon qilinmasin (kod sharhi). */
export function ticketOf(v: TicketVisit): string | null {
    if (!v || v.queueNumber == null) return null;
    if (v.date != null && v.date !== tashkentDateStr()) return null;
    return v.department?.code
        ? `${v.department.code}-${String(v.queueNumber).padStart(2, '0')}`
        : String(v.queueNumber);
}

/** Qatorlarga bemorning bugungi talonini qo'shadi (`visitId` bo'yicha) */
export async function withTickets<T extends { visitId?: string | null; clinicId?: string }>(prisma: any, rows: T[]): Promise<(T & { ticket: string | null })[]> {
    const ids = [...new Set(rows.map(r => r.visitId).filter(Boolean) as string[])];
    if (!ids.length) return rows.map(r => ({ ...r, ticket: null }));
    const clinicId = rows[0]?.clinicId;
    const visits = await prisma.visit.findMany({
        where: { id: { in: ids }, date: tashkentDateStr(), ...(clinicId ? { clinicId } : {}) },
        select: { id: true, queueNumber: true, date: true, department: { select: { code: true } } },
    });
    const byId = new Map<string, string | null>(visits.map((v: any) => [v.id, ticketOf(v)]));
    return rows.map(r => ({ ...r, ticket: (r.visitId && byId.get(r.visitId)) || null }));
}

/** Tablo uchun: bugun chaqirilgan va hali tugamagan xona chaqiruvlari */
export async function roomBoardRows(prisma: any, clinicId: string) {
    const { start } = tashkentDayBounds(tashkentDateStr());
    const visitSel = { select: { queueNumber: true, date: true, department: { select: { code: true, color: true } } } };
    /* Faqat bugungi qabul taloni va o'sha klinika */
    const todayVisit = { visit: { date: tashkentDateStr(), clinicId } };
    const [studies, orders] = await Promise.all([
        prisma.diagnosticStudy.findMany({
            where: { clinicId, calledAt: { gte: start }, status: { in: ['Ordered', 'InProgress'] }, visitId: { not: null }, ...todayVisit },
            select: { modality: true, status: true, calledAt: true, visit: visitSel },
        }),
        prisma.labOrder.findMany({
            where: { clinicId, calledAt: { gte: start }, sampleCollectedAt: null, status: { notIn: ['Completed', 'Cancelled'] }, visitId: { not: null }, ...todayVisit },
            select: { calledAt: true, visit: visitSel },
        }),
    ]);
    const row = (visit: any, room: string, inProgress: boolean, calledAt: Date) => {
        const ticket = ticketOf(visit);
        if (!ticket) return null;
        return {
            queueNumber: visit.queueNumber,
            ticket,
            status: inProgress ? 'In Progress' : 'Called',
            calledAt,
            department: room,
            room,
            color: visit.department?.color || null,
        };
    };
    return [
        ...studies.map((s: any) => row(s.visit, MODALITY_ROOM[s.modality] || s.modality, s.status === 'InProgress', s.calledAt)),
        ...orders.map((o: any) => row(o.visit, LAB_ROOM, false, o.calledAt)),
    ].filter(Boolean);
}

export function registerRoomQueueRoutes(app: any, deps: {
    prisma: any; authenticateToken: any; getScopedClinicId: (req: any) => string | null;
}) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

    const handle = (fn: (req: any, res: any, clinicId: string) => Promise<any>) => async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            await fn(req, res, clinicId);
        } catch (e: any) {
            console.error('Navbat xatosi:', e?.message || e);
            res.status(500).json({ error: 'Navbatda xatolik' });
        }
    };

    /** UZI/EKG… xonasiga chaqirish. Qayta bosish — qayta e'lon. */
    app.post('/api/studies/:id/call', auth, handle(async (req, res, clinicId) => {
        const calledAt = new Date();
        const r = await prisma.diagnosticStudy.updateMany({
            where: { id: String(req.params.id), clinicId, status: { in: ['Ordered', 'InProgress'] } },
            data: { calledAt },
        });
        if (!r.count) return res.status(409).json({ error: "Tekshiruv navbatda emas", code: 'NOT_WAITING' });
        res.json({ id: req.params.id, calledAt });
    }));

    /** Tekshiruvni boshlash — «Bajarilmoqda». Ikki xodim bir vaqtda bossa,
     *  ikkinchisiga 409: shart bilan yangilanadi. */
    app.post('/api/studies/:id/start', auth, handle(async (req, res, clinicId) => {
        const r = await prisma.diagnosticStudy.updateMany({
            where: { id: String(req.params.id), clinicId, status: 'Ordered' },
            data: { status: 'InProgress' },
        });
        if (!r.count) return res.status(409).json({ error: "Tekshiruv allaqachon boshlangan yoki yopilgan", code: 'NOT_ORDERED' });
        res.json({ id: req.params.id, status: 'InProgress' });
    }));

    /** Qon olishga chaqirish. Proba olingan bo'lsa — navbatda emas. */
    app.post('/api/lab-orders/:id/call', auth, handle(async (req, res, clinicId) => {
        const calledAt = new Date();
        const r = await prisma.labOrder.updateMany({
            where: {
                id: String(req.params.id), clinicId, sampleCollectedAt: null,
                status: { notIn: ['Completed', 'Cancelled'] },
            },
            data: { calledAt },
        });
        if (!r.count) return res.status(409).json({ error: "Bu bemordan proba allaqachon olingan", code: 'NOT_WAITING' });
        res.json({ id: req.params.id, calledAt });
    }));
}
