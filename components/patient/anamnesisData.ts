/* ─────────────────────────────────────────────────────────────────────────────
   TIBBIY TARIX (ANAMNEZ) — MA'LUMOT SHAKLI VA TAYYOR RO'YXATLAR.

   Uchta joyda saqlanadi, va bu ATAYLAB:
     · allergiya — `PatientAllergy` jadvalida (retseptdagi ogohlantirish
       shundan o'qiydi);
     · kasalliklar — `Patient.medicalHistory`, har satr bitta yozuv
       (klinikaning eski yozuvlari shu yerda, `conditions.ts` ga qarang);
     · qolgan hamma bo'lim — `Patient.anamnesis`, bitta JSON (migratsiya 0039).

   «YO'Q» VA «SO'RALMAGAN» — IKKI BOSHQA NARSA. Bo'sh ro'yxat «so'ralmagan»
   degani. «Yo'q» — `none` dagi aniq belgi: «allergiyasi yo'q» deb so'ralgan
   va javob olingan. Kartada so'ralmagan bo'limlar bitta sariq qatorga
   yig'iladi.
   ───────────────────────────────────────────────────────────────────────────── */

export type Lang = 'uz' | 'ru';
export interface Label { uz: string; ru: string }

/** «Yo'q» belgisi bo'ladigan bo'limlar (kasallikda u «Sog'lom» satri) */
export type NoneKey = 'allergies' | 'meds' | 'surgeries' | 'family' | 'infections';

export interface Surgery { name: string; year?: string }

export interface AnamnesisData {
    none?: Partial<Record<NoneKey, boolean>>;
    /** Doimiy ichadigan dorilar: «Aspirin» yoki «Lizinopril 10 mg» */
    meds?: string[];
    /** `name` — `SURGERIES` dagi id yoki qo'lda yozilgan nom */
    surgeries?: Surgery[];
    /** `FAMILY` dagi id yoki qo'lda yozilgan matn */
    family?: string[];
    smoking?: 'no' | 'yes' | 'quit';
    alcohol?: 'no' | 'yes';
    blood?: 'I' | 'II' | 'III' | 'IV' | 'unknown';
    rh?: '+' | '-';
    pregnancy?: 'no' | 'yes' | 'breastfeeding';
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : undefined;
const strings = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : undefined;

/** Bazadagi matn → ma'lumot. Buzilgan yoki bo'sh matn — bo'sh anamnez.
 *  Har maydon alohida tekshiriladi: qo'lda yuborilgan `{"meds":"abc"}`
 *  kabi yozuv kartani yiqitmasin — noto'g'ri maydon shunchaki tashlanadi. */
export const parseAnamnesis = (raw?: string | null): AnamnesisData => {
    if (!raw) return {};
    let p: any;
    try { p = JSON.parse(raw); } catch { return {}; }
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    const none: AnamnesisData['none'] = {};
    if (p.none && typeof p.none === 'object') {
        for (const k of ['allergies', 'meds', 'surgeries', 'family', 'infections'] as const) {
            if (p.none[k] === true) none[k] = true;
        }
    }
    const surgeries = Array.isArray(p.surgeries)
        ? p.surgeries
            .filter((s: any) => s && typeof s.name === 'string' && s.name.trim())
            .map((s: any) => ({ name: s.name, ...(typeof s.year === 'string' && s.year ? { year: s.year } : {}) }))
        : undefined;
    return {
        none,
        meds: strings(p.meds),
        surgeries,
        family: strings(p.family),
        smoking: oneOf(p.smoking, ['no', 'yes', 'quit'] as const),
        alcohol: oneOf(p.alcohol, ['no', 'yes'] as const),
        blood: oneOf(p.blood, ['I', 'II', 'III', 'IV', 'unknown'] as const),
        rh: oneOf(p.rh, ['+', '-'] as const),
        pregnancy: oneOf(p.pregnancy, ['no', 'yes', 'breastfeeding'] as const),
    };
};

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const hasText = (list: string[] | undefined, text: string) => (list || []).some(x => sameText(x, text));
export const toggleText = (list: string[] | undefined, text: string): string[] =>
    hasText(list, text) ? (list || []).filter(x => !sameText(x, text)) : [...(list || []), text.trim()];

/** Ro'yxatga yozuv qo'shilsa, o'sha bo'limning «yo'q» belgisi o'chadi */
export const withoutNone = (data: AnamnesisData, key: NoneKey): AnamnesisData =>
    data.none?.[key] ? { ...data, none: { ...data.none, [key]: false } } : data;

// ── Tayyor ro'yxatlar ───────────────────────────────────────────────────────

/** Ko'p uchraydigan allergenlar — stomatologiya va umumiy amaliyot */
export const ALLERGENS = [
    'Lidokain', 'Novokain', 'Artikain', 'Penitsillin', 'Amoksitsillin', 'Seftriakson',
    'Aspirin', 'Analgin', 'Ibuprofen', 'Yod', 'Lateks', 'Sulfanilamidlar',
];

/** Doimiy ichiladigan dorilar. `thinner` — qonni suyultiradi (tish olishdan oldin muhim) */
export const MEDS: { name: string; thinner?: boolean }[] = [
    { name: 'Aspirin', thinner: true }, { name: 'Varfarin', thinner: true },
    { name: 'Klopidogrel', thinner: true }, { name: 'Rivaroksaban', thinner: true },
    { name: 'Insulin' }, { name: 'Metformin' }, { name: 'Lizinopril' }, { name: 'Amlodipin' },
    { name: 'Bisoprolol' }, { name: 'Atorvastatin' }, { name: 'L-tiroksin' }, { name: 'Omeprazol' },
];

const THINNERS = ['aspirin', 'kardiomagnil', 'varfarin', 'warfarin', 'klopidogrel', 'clopidogrel',
    'rivaroksaban', 'ksarelto', 'apiksaban', 'eliquis', 'dabigatran', 'pradaksa', 'geparin', 'аспирин', 'варфарин'];

/** Dori nomidan qonni suyultiradimi — qo'lda yozilganini ham taniydi */
export const isThinner = (med: string): boolean => {
    const low = med.toLowerCase();
    return THINNERS.some(t => low.includes(t));
};

export const SURGERIES: { id: string; label: Label }[] = [
    { id: 'appendectomy', label: { uz: 'Appenditsit operatsiyasi', ru: 'Аппендэктомия' } },
    { id: 'cesarean', label: { uz: 'Kesar kesish', ru: 'Кесарево сечение' } },
    { id: 'cholecystectomy', label: { uz: "O't pufagi olib tashlangan", ru: 'Удаление желчного пузыря' } },
    { id: 'hernia', label: { uz: 'Churra operatsiyasi', ru: 'Грыжесечение' } },
    { id: 'heart', label: { uz: 'Yurak operatsiyasi (stent, shunt)', ru: 'Операция на сердце (стент, шунт)' } },
    { id: 'thyroid', label: { uz: 'Qalqonsimon bez operatsiyasi', ru: 'Операция на щитовидной железе' } },
    { id: 'tonsillectomy', label: { uz: 'Bodomcha bezlari olib tashlangan', ru: 'Тонзиллэктомия' } },
];

export const FAMILY: { id: string; label: Label }[] = [
    { id: 'diabetes', label: { uz: 'Qandli diabet', ru: 'Сахарный диабет' } },
    { id: 'hypertension', label: { uz: 'Gipertoniya', ru: 'Гипертония' } },
    { id: 'heart', label: { uz: 'Yurak kasalligi', ru: 'Болезни сердца' } },
    { id: 'stroke', label: { uz: 'Insult', ru: 'Инсульт' } },
    { id: 'cancer', label: { uz: 'Onkologiya', ru: 'Онкология' } },
    { id: 'tb', label: { uz: 'Sil', ru: 'Туберкулёз' } },
    { id: 'bleeding', label: { uz: 'Qon ivishi buzilishi', ru: 'Нарушение свёртываемости крови' } },
    { id: 'mental', label: { uz: 'Ruhiy kasallik', ru: 'Психические заболевания' } },
];

/** Ro'yxatdagi id bo'lsa — tarjimasi, bo'lmasa yozilganidek */
export const catalogLabel = (list: { id: string; label: Label }[], value: string, lang: Lang): string =>
    list.find(x => x.id === value)?.label[lang] || value;

export const BLOOD_GROUPS: { value: NonNullable<AnamnesisData['blood']>; text: string }[] = [
    { value: 'I', text: 'I (0)' }, { value: 'II', text: 'II (A)' },
    { value: 'III', text: 'III (B)' }, { value: 'IV', text: 'IV (AB)' },
];
