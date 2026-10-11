import { Visit, LabOrder, DiagnosticStudy } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   BEMOR TARIXI — BITTA LENTA.

   Kartada tarix o'n bitta alohida bo'lim edi (qabullar, tahlillar, to'lovlar
   …) va har biri sahifaning pastida ochilardi. Shifokorning savoli esa
   bitta: «bu bemor bilan avval nima bo'lgan?» — va javob vaqt bo'yicha
   o'qiladi, tur bo'yicha emas.

   Bu fayl turli ro'yxatlarni bitta vaqt o'qiga teradi. Yangi so'rov yo'q:
   qabul bilan birga uning tahlili va tekshiruvi allaqachon keladi
   (`GET /api/visits?patientId=`). Matn va rang bu yerda emas — ekranda.

   TO'LOVLAR LENTADA YO'Q. Ular «To'lovlar» daftarida turadi (qarz, cheklar,
   to'lov qabul qilish) — bitta narsa ikki joyda ko'rinmasin. Lenta — tibbiy
   tarix: har tashrifga bittadan chek qo'shilsa, u qabullarni bosib ketadi.

   BEKOR QILINGAN QABUL LENTADA QOLADI (belgisi bilan): u ham bo'lgan voqea,
   va kartadan izsiz yo'qolsa «kecha nimaga ochilgan edi?» degan savolga
   javob qolmaydi. Bekor qilingan yo'llanma esa ko'rsatilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

export type TimelineKind = 'visit' | 'lab' | 'study' | 'stay';
export type TimelineFilter = 'all' | 'visit' | 'lab' | 'study';

export interface TimelineStay {
    id: string;
    admittedAt: string;
    dischargedAt?: string | null;
    status?: string | null;
    diagnosis?: string | null;
}

export type TimelineEntry = { id: string; at: string } & (
    | { kind: 'visit'; visit: Visit }
    | { kind: 'lab'; order: LabOrder }
    | { kind: 'study'; study: DiagnosticStudy }
    | { kind: 'stay'; stay: TimelineStay }
);

export interface TimelineSource {
    visits: Visit[];
    admissions?: TimelineStay[];
    /* Qabulga BOG'LANMAGAN yo'llanmalar — Laboratoriya yoki Diagnostika
       ekranining o'zida yozilganlari. Ular qabul ichida kelmaydi; kelmasa
       lentada umuman ko'rinmasdi. Qabul orqali kelgani bilan takrorlansa —
       bittasi qoladi. */
    looseLabs?: LabOrder[];
    looseStudies?: DiagnosticStudy[];
}

/** Bir kunda bir nechta yozuv bo'lsa — shu tartibda (vaqti teng bo'lganda) */
const KIND_ORDER: TimelineKind[] = ['visit', 'stay', 'lab', 'study'];

const timeOf = (at: string): number => {
    const ms = new Date(at).getTime();
    return Number.isFinite(ms) ? ms : 0;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Yozuvning KUNI — klinikadagi (mahalliy) sana bo'yicha.
 *
 *  Vaqtlar bazada UTC da turadi. Satrning boshini kesib olsak, yarim tundan
 *  ertalab soat beshgacha bo'lgan voqea (tungi navbat, statsionar) kechagi
 *  kun ostiga tushardi va «Bugun» yorlig'ini olmasdi. Sof sana (`2026-09-12`)
 *  esa o'zgarishsiz qaytadi. */
export const dayOf = (at: string): string => {
    const text = String(at);
    if (text.length <= 10) return text;
    const d = new Date(text);
    if (!Number.isFinite(d.getTime())) return text.slice(0, 10);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function buildTimeline({ visits, admissions = [], looseLabs = [], looseStudies = [] }: TimelineSource): TimelineEntry[] {
    const byId = new Map<string, TimelineEntry>();
    const add = (e: TimelineEntry) => { if (e.at) byId.set(e.id, e); };
    const addLab = (o: LabOrder) => {
        if (o.status !== 'Cancelled') add({ id: `lab-${o.id}`, kind: 'lab', at: o.completedAt || o.orderedAt, order: o });
    };
    const addStudy = (s: DiagnosticStudy) => {
        if (s.status !== 'Cancelled') add({ id: `study-${s.id}`, kind: 'study', at: s.performedAt || s.orderedAt, study: s });
    };

    // Avval bog'lanmaganlari: qabul ichida ham kelsa, to'liqroq nusxa ustiga yoziladi
    looseLabs.forEach(addLab);
    looseStudies.forEach(addStudy);

    for (const v of visits) {
        add({ id: `visit-${v.id}`, kind: 'visit', at: v.checkInTime || v.date, visit: v });
        (v.labOrders || []).forEach(addLab);
        (v.studies || []).forEach(addStudy);
    }
    for (const a of admissions) {
        add({ id: `stay-${a.id}`, kind: 'stay', at: a.admittedAt, stay: a });
    }

    return [...byId.values()].sort((a, b) =>
        timeOf(b.at) - timeOf(a.at) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** Statsionar yotish ham qabul: «Qabul» filtri ikkalasini ko'rsatadi. */
export function filterTimeline(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
    if (filter === 'all') return entries;
    if (filter === 'visit') return entries.filter(e => e.kind === 'visit' || e.kind === 'stay');
    return entries.filter(e => e.kind === filter);
}
