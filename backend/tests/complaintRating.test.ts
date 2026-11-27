/* Botdagi baho → shikoyat (`complaints.ts`, recordRating).
 *
 * Ilgari baho tugmasini istalgan chat istalgan son bilan bosa olardi. Endi:
 * faqat 1..5, faqat o'sha bemorning o'z chati; 1–3 — bitta shikoyat
 * (qayta baholansa ham ikkinchisi ochilmaydi); 4–5 — shikoyat yo'q.
 */
import { describe, it, expect } from 'vitest';
import { recordRating, attachComplaintText } from '../complaints';

function fakePrisma() {
    const reviews = new Map<string, any>();
    const complaints: any[] = [];
    const appt = {
        id: 'a1', clinicId: 'c1', patientId: 'p1', doctorId: 'd1',
        patient: { id: 'p1', firstName: 'Aziza', lastName: 'Rahimova', telegramChatId: '555' },
        doctor: { firstName: 'Nilufar', lastName: 'Tosheva' },
    };
    return {
        complaints,
        reviews,
        appointment: { findUnique: async ({ where }: any) => (where.id === 'a1' ? appt : null) },
        review: {
            upsert: async ({ where, update, create }: any) => {
                const cur = reviews.get(where.appointmentId);
                const row = cur ? { ...cur, ...update } : { id: `r-${where.appointmentId}`, ...create };
                reviews.set(where.appointmentId, row);
                return row;
            },
            update: async ({ where, data }: any) => {
                for (const [k, v] of reviews) if (v.id === where.id) reviews.set(k, { ...v, ...data });
            },
        },
        complaint: {
            findUnique: async ({ where }: any) => complaints.find(c => (where.reviewId ? c.reviewId === where.reviewId : c.id === where.id)) || null,
            create: async ({ data }: any) => { const c = { id: `cmp${complaints.length + 1}`, text: null, ...data }; complaints.push(c); return c; },
            updateMany: async ({ where, data }: any) => {
                const c = complaints.find(x => x.id === where.id && (where.text === null ? x.text === null : true));
                if (!c) return { count: 0 };
                Object.assign(c, data);
                return { count: 1 };
            },
        },
    };
}

describe('recordRating', () => {
    it('0 va 6 — rad etiladi', async () => {
        const db = fakePrisma();
        expect(await recordRating(db, { appointmentId: 'a1', chatId: '555', rating: 0 })).toEqual({ ok: false, reason: 'rating' });
        expect(await recordRating(db, { appointmentId: 'a1', chatId: '555', rating: 6 })).toEqual({ ok: false, reason: 'rating' });
        expect(db.reviews.size).toBe(0);
    });

    it('begona chat — rad etiladi, baho yozilmaydi', async () => {
        const db = fakePrisma();
        expect(await recordRating(db, { appointmentId: 'a1', chatId: '999', rating: 1 })).toEqual({ ok: false, reason: 'chat' });
        expect(db.reviews.size).toBe(0);
    });

    it('4–5 — baho yoziladi, shikoyat ochilmaydi', async () => {
        const db = fakePrisma();
        const r = await recordRating(db, { appointmentId: 'a1', chatId: '555', rating: 5 });
        expect(r.ok && r.complaintId).toBe(null);
        expect(db.complaints).toHaveLength(0);
    });

    it('past baho — bitta shikoyat, qayta baholansa ham bitta', async () => {
        const db = fakePrisma();
        const r1 = await recordRating(db, { appointmentId: 'a1', chatId: '555', rating: 2 });
        const r2 = await recordRating(db, { appointmentId: 'a1', chatId: '555', rating: 1 });
        expect(db.complaints).toHaveLength(1);
        expect(r1.ok && r2.ok && r1.complaintId === r2.complaintId).toBe(true);
        expect(db.complaints[0]).toMatchObject({ source: 'bot', status: 'open', doctorName: 'Tosheva Nilufar', clinicId: 'c1' });
    });

    it('«Nima yoqmadi?» javobi shikoyat matni va sharh bo\'ladi; ikkinchi javob ustidan yozmaydi', async () => {
        const db = fakePrisma();
        const r = await recordRating(db, { appointmentId: 'a1', chatId: '555', rating: 1 });
        const id = r.ok ? r.complaintId! : '';
        expect(await attachComplaintText(db, id, '  Uzoq kutdim\u0007  ')).toBe(true);
        expect(db.complaints[0].text).toBe('Uzoq kutdim');
        expect(db.reviews.get('a1').comment).toBe('Uzoq kutdim');
        expect(await attachComplaintText(db, id, 'boshqa')).toBe(false);
        expect(db.complaints[0].text).toBe('Uzoq kutdim');
    });
});
