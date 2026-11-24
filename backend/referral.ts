/* ─────────────────────────────────────────────────────────────────────────────
   YO'NALTIRISH — kim yubordi, nima uchun (migratsiya 0040).

   Uch holat:
     · o'zi keldi        — `referralSource` NULL (sukut);
     · ichki (Internal)  — klinikaning boshqa shifokori o'z qabulidan yubordi.
                           `referredFromVisitId` majburiy; kim yuborgani
                           (`referredByName`) SERVERDA o'sha qabuldan olinadi —
                           tanadan kelgan nomga ishonilmaydi;
     · tashqi (External) — boshqa klinika yoki shifokor. Nomi majburiy.

   Javob yuboruvchiga qaytadi: `GET /api/visits/:id` dagi `referredVisits`
   — shu qabuldan yuborilganlar, tashxisi va xulosasi bilan.
   ───────────────────────────────────────────────────────────────────────────── */

export const REFERRAL_SOURCES = ['Internal', 'External'] as const;

/** Yo'naltirishning ikki tomonida ko'rinadigan qabul ma'lumoti */
export const REFERRAL_VISIT_SELECT = {
    id: true, date: true, status: true, doctorName: true, treatmentPlan: true,
    department: { select: { id: true, name: true } },
    diagnoses: { select: { id: true, code: true, kind: true, icd10: { select: { name: true } } } },
} as const;

const clip = (v: unknown, n: number) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, n) : null;
};

type Resolved =
    | { data: Record<string, string | null> }
    | { error: string; status: number };

/** Tanadagi yo'naltirish maydonlarini tekshiradi va saqlanadigan shaklga keltiradi */
export async function resolveReferral(prisma: any, body: any, clinicId: string, patientId: string): Promise<Resolved> {
    const source = body?.referralSource;
    if (source === undefined || source === null || source === '') return { data: {} };
    if (!REFERRAL_SOURCES.includes(source)) {
        return { error: "Yo'naltirish manbai noto'g'ri", status: 400 };
    }
    const reason = clip(body.referralReason, 300);

    if (source === 'External') {
        const name = clip(body.referredByName, 120);
        if (!name) return { error: "Kim yo'naltirganini yozing", status: 400 };
        return { data: { referralSource: 'External', referredByName: name, referralReason: reason } };
    }

    const fromId = clip(body.referredFromVisitId, 64);
    if (!fromId) return { error: "Qaysi qabuldan yo'naltirilgani ko'rsatilmagan", status: 400 };
    const from = await prisma.visit.findUnique({
        where: { id: fromId },
        select: { id: true, clinicId: true, patientId: true, doctorName: true, department: { select: { name: true } } },
    });
    if (!from || from.clinicId !== clinicId || from.patientId !== patientId) {
        return { error: "Yo'naltirgan qabul topilmadi", status: 404 };
    }
    const by = [from.doctorName, from.department?.name ? `(${from.department.name})` : '']
        .filter(Boolean).join(' ') || null;
    return {
        data: {
            referralSource: 'Internal', referredFromVisitId: from.id,
            referredByName: by, referralReason: reason,
        },
    };
}
