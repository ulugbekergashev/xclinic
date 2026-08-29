/* ─────────────────────────────────────────────────────────────────────────────
   UMUMIY VALIDATSIYA — bitta qoida, ikkala tomonda (S3.1).

   MUAMMO. Telefon, jins va hayotiy ko'rsatkichlar tekshiruvi har formada
   qo'lda yozilgan va bir xil emas edi. Natijasi auditda ko'rindi:

   - harorat 500 °C, puls −40, AD 9999 ogohlantirishsiz saqlanardi (B-10);
   - «abcdefg!!!» telefon sifatida saqlanardi (B-13);
   - `utils/phone.ts` da ochiq yozilgan: «bu mantiq backend/smsService.ts
     dagi `normalizeUzPhone` bilan bir xil bo'lishi SHART... biri o'zgarsa,
     ikkinchisi ham o'zgartirilsin» — ya'ni nusxa qo'lda ushlab turilardi.

   NIMA UCHUN ZOD EMAS. Reja zod ni nazarda tutgan edi. Amalda u ikkita
   `package.json` ga yangi bog'liqlik qo'shar va ishning asosiy qismini —
   QOIDANI BIR JOYGA YIG'ISHNI — bermas edi. Bu fayl bog'liqliksiz oddiy
   TypeScript: brauzerda ham, `ts-node` da ham, `ncc` bundle'ida ham
   qo'shimcha sozlamasiz ishlaydi. Loyihaning uslubi ham shunday —
   `cookie-parser` ham bitta cookie o'qish uchun qo'shilmagan edi.

   QAYERDA ISHLATILADI. Backend — yozishdan oldin (yagona haqiqiy
   qo'riqchi). Front — foydalanuvchiga darhol aytish uchun. Ikkalasi ham
   SHU fayldan o'qiydi, ya'ni endi ular hech qachon ajralib ketmaydi.
   ───────────────────────────────────────────────────────────────────────── */

/* ─── Natija turi ────────────────────────────────────────────────────────── */

export type Valid<T> = { ok: true; value: T };
export type Invalid = { ok: false; error: string };
export type Result<T> = Valid<T> | Invalid;

const ok = <T>(value: T): Valid<T> => ({ ok: true, value });
const bad = (error: string): Invalid => ({ ok: false, error });

/* ─── Telefon ────────────────────────────────────────────────────────────── */

/**
 * O'zbekiston raqamini Eskiz kutadigan `998XXXXXXXXX` ko'rinishiga keltiradi.
 * Tanib bo'lmasa `null`.
 *
 * Bu funksiya ilgari IKKI JOYDA nusxa bo'lib turardi: `utils/phone.ts` va
 * `backend/smsService.ts`. Endi ikkalasi ham shu yerdan oladi.
 */
export function normalizeUzPhone(phone?: string | null): string | null {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 12 && digits.startsWith('998')) return digits;
    if (digits.length === 13 && digits.startsWith('0998')) return digits.slice(1);
    if (digits.length === 9) return `998${digits}`;
    // Ichki formatlar: 0XX XXX XX XX yoki 8XX XXX XX XX
    if (digits.length === 10 && (digits.startsWith('0') || digits.startsWith('8'))) return `998${digits.slice(1)}`;
    return null;
}

/** SMS yuborish uchun yaroqli raqammi */
export const isSendablePhone = (phone?: string | null): boolean => normalizeUzPhone(phone) !== null;

/** Ko'rsatish uchun: `998901234567` → `+998 90 123 45 67` */
export function formatUzPhone(phone?: string | null): string {
    const n = normalizeUzPhone(phone);
    if (!n) return phone || '';
    return `+${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10, 12)}`;
}

/**
 * Telefonni TEKSHIRADI — normallashtirish emas, qabul qilish qarori.
 *
 * `required = false` bo'lsa bo'sh qiymat o'tadi: klinikaga telefonsiz
 * bemor ham keladi (keksa odam, hujjatsiz shoshilinch holat). Lekin
 * YOZILGAN raqam yaroqli bo'lishi shart — «abcdefg!!!» saqlanmasin.
 */
export function validatePhone(raw: unknown, required = false): Result<string | null> {
    const s = String(raw ?? '').trim();
    if (!s) return required ? bad('Telefon raqami kiritilishi shart') : ok(null);
    const n = normalizeUzPhone(s);
    if (!n) return bad("Telefon raqami noto'g'ri. Namuna: +998 90 123 45 67");
    return ok(n);
}

/* ─── Jins ───────────────────────────────────────────────────────────────── */

export type Gender = 'Male' | 'Female';

/**
 * Jins.
 *
 * Standart qiymat ATAYLAB yo'q. Ilgari forma «Erkak» bilan ochilardi va
 * shu sababdan «Lola Karimov» lidi bemorga aylantirilganda erkak bo'lib
 * qolgan edi (audit B-34). Tanlanmagan jins — xato, taxmin emas.
 */
export function validateGender(raw: unknown): Result<Gender> {
    const s = String(raw ?? '').trim();
    if (s === 'Male' || s === 'Female') return ok(s);
    return bad('Jinsni tanlang');
}

/* ─── Hayotiy ko'rsatkichlar ─────────────────────────────────────────────── */

export interface VitalRange {
    /** Fiziologik jihatdan mumkin bo'lgan eng past qiymat */
    min: number;
    /** ...va eng yuqori. Bulardan tashqarisi — kiritish xatosi. */
    max: number;
    /** Normal deb hisoblanadigan oraliq — undan chiqsa OGOHLANTIRILADI,
     *  lekin saqlanadi: kasal odamda ko'rsatkich normadan chiqadi. */
    normalMin?: number;
    normalMax?: number;
    unit: string;
    label: string;
}

/**
 * Chegaralar.
 *
 * IKKI XIL CHEGARA BOR va ularni ajratish muhim:
 *
 *   `min`/`max`   — FIZIOLOGIK imkoniyat. 500 °C harorat yoki −40 puls
 *                   odamda bo'lmaydi: bu kiritish xatosi, saqlanmaydi.
 *   `normalMin`/`normalMax` — NORMA. Undan chiqqan qiymat saqlanadi va
 *                   qizil ko'rsatiladi: kasal odamning harorati 39 bo'ladi
 *                   va uni yozib qo'yish kerak.
 *
 * Ilgari `backend/inpatient.ts:497` da faqat `isFinite(value)` turardi —
 * ya'ni har qanday son o'tardi.
 */
export const VITAL_RANGES: Record<string, VitalRange> = {
    Temp: { min: 30, max: 43, normalMin: 36.0, normalMax: 37.2, unit: '°C', label: 'Harorat' },
    Pulse: { min: 20, max: 250, normalMin: 60, normalMax: 100, unit: 'zarba/daq', label: 'Puls' },
    BpSys: { min: 40, max: 300, normalMin: 90, normalMax: 139, unit: 'mm sim.ust.', label: 'AD sistolik' },
    BpDia: { min: 20, max: 200, normalMin: 60, normalMax: 89, unit: 'mm sim.ust.', label: 'AD diastolik' },
    Weight: { min: 0.5, max: 400, unit: 'kg', label: 'Vazn' },
    Height: { min: 20, max: 250, unit: 'sm', label: "Bo'y" },
    SpO2: { min: 50, max: 100, normalMin: 95, normalMax: 100, unit: '%', label: 'SpO₂' },
};

export const VITAL_KINDS = Object.keys(VITAL_RANGES);

/**
 * Ko'rik shabloni maydonining kaliti → o'lchov turi.
 *
 * Statsionar `/api/vitals` ga `Temp`, `Pulse`... deb yuboradi, ko'rik
 * bayoni esa shablon maydonlarini ishlatadi: `temperature`, `bpSystolic`...
 * Ikkalasi ham BIR XIL chegaraga bo'ysunishi kerak, shuning uchun
 * moslik shu yerda — auditdagi 500 °C aynan ko'rik bayonidan kiritilgan
 * (B-10 takrorlash yo'li: «Ko'rik bayoni → KO'RSATKICHLAR»).
 */
export const ENCOUNTER_FIELD_TO_VITAL: Record<string, string> = {
    temperature: 'Temp',
    temp: 'Temp',
    bpSystolic: 'BpSys',
    bpDiastolic: 'BpDia',
    pulse: 'Pulse',
    heartRate: 'Pulse',
    weight: 'Weight',
    height: 'Height',
    spo2: 'SpO2',
    saturation: 'SpO2',
};

/** Shablon maydoni uchun chegara — mos kelmasa `null`. */
export function rangeForField(fieldKey: string): VitalRange | null {
    const kind = ENCOUNTER_FIELD_TO_VITAL[fieldKey];
    return kind ? VITAL_RANGES[kind] ?? null : null;
}

/** Shablon maydonining qiymatini tekshiradi. Chegara yo'q bo'lsa — o'tadi. */
export function validateEncounterField(fieldKey: string, value: unknown): Result<number | null> {
    const kind = ENCOUNTER_FIELD_TO_VITAL[fieldKey];
    if (!kind) return ok(null);
    if (value === '' || value === null || value === undefined) return ok(null);
    const r = validateVital(kind, value);
    return r.ok === true ? ok((r as Valid<number>).value) : (r as Invalid);
}

/** O'lchov fiziologik chegaradami. Chegaradan tashqarisi — kiritish xatosi. */
export function validateVital(kind: string, value: unknown): Result<number> {
    const range = VITAL_RANGES[kind];
    if (!range) return bad(`Noma'lum o'lchov turi: ${kind}`);

    const n = Number(value);
    if (!Number.isFinite(n)) return bad(`${range.label}: son kiritilishi kerak`);
    if (n < range.min || n > range.max) {
        return bad(`${range.label} ${range.min}–${range.max} ${range.unit} oralig'ida bo'lishi kerak (kiritilgan: ${n})`);
    }
    return ok(n);
}

/** Qiymat NORMADAN chiqqanmi. Saqlashga to'sqinlik qilmaydi — belgilaydi. */
export function isVitalAbnormal(kind: string, value: number): boolean {
    const r = VITAL_RANGES[kind];
    if (!r || r.normalMin === undefined || r.normalMax === undefined) return false;
    return value < r.normalMin || value > r.normalMax;
}

/**
 * Tana massasi indeksi. Bo'y santimetrda, vazn kilogrammda.
 *
 * Audit: «Bo'y va vazndan VKI ham hisoblanmaydi» (B-10). Formula bitta
 * joyda tursin — u ikkala tomonda ham kerak.
 */
export function calcBmi(heightCm?: number | null, weightKg?: number | null): number | null {
    if (!heightCm || !weightKg) return null;
    if (heightCm < 30 || weightKg <= 0) return null;
    const m = heightCm / 100;
    return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** VKI izohi — JSSV tasnifi bo'yicha */
export function bmiLabel(bmi: number | null): string {
    if (bmi === null) return '';
    if (bmi < 18.5) return 'Vazn yetishmovchiligi';
    if (bmi < 25) return 'Normal';
    if (bmi < 30) return 'Ortiqcha vazn';
    if (bmi < 35) return 'Semizlik I';
    if (bmi < 40) return 'Semizlik II';
    return 'Semizlik III';
}

/* ─── Bemor ──────────────────────────────────────────────────────────────── */

/** Ism va familiya — bo'sh bo'lmasin va raqamdan iborat bo'lmasin. */
export function validateName(raw: unknown, field: string): Result<string> {
    const s = String(raw ?? '').trim();
    if (!s) return bad(`${field} kiritilishi shart`);
    if (s.length < 2) return bad(`${field} juda qisqa`);
    if (s.length > 60) return bad(`${field} juda uzun`);
    if (/^\d+$/.test(s)) return bad(`${field} raqamdan iborat bo'lishi mumkin emas`);
    return ok(s);
}

/**
 * Tug'ilgan sana: `YYYY-MM-DD`, kelajakda emas, 130 yildan oshmasin.
 * Bo'sh — ruxsat: sanasi noma'lum bemor bo'ladi.
 */
export function validateDob(raw: unknown): Result<string | null> {
    const s = String(raw ?? '').trim();
    if (!s) return ok(null);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return bad("Tug'ilgan sana YYYY-MM-DD ko'rinishida bo'lsin");
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return bad("Tug'ilgan sana noto'g'ri");
    const now = Date.now();
    if (d.getTime() > now) return bad("Tug'ilgan sana kelajakda bo'lishi mumkin emas");
    if (now - d.getTime() > 130 * 365.25 * 864e5) return bad("Tug'ilgan sana juda uzoqda");
    return ok(`${m[1]}-${m[2]}-${m[3]}`);
}

/** JSHSHIR — 14 raqam. Bo'sh bo'lishi mumkin. */
export function validatePinfl(raw: unknown): Result<string | null> {
    const s = String(raw ?? '').trim();
    if (!s) return ok(null);
    const digits = s.replace(/\D/g, '');
    if (digits.length !== 14) return bad("JSHSHIR 14 ta raqamdan iborat bo'lishi kerak");
    return ok(digits);
}

export interface PatientInput {
    firstName?: unknown;
    lastName?: unknown;
    gender?: unknown;
    phone?: unknown;
    dob?: unknown;
    pinfl?: unknown;
}

export interface PatientClean {
    firstName: string;
    lastName: string;
    gender: Gender;
    phone: string | null;
    dob: string | null;
    pinfl: string | null;
}

/**
 * Bemorning to'liq tekshiruvi — bitta joyda.
 *
 * HAMMA xatoni yig'adi, birinchisida to'xtamaydi: forma bir vaqtda hamma
 * maydonni qizil qilib ko'rsatishi kerak, aks holda foydalanuvchi
 * xatolarni bittalab topib chiqadi.
 */
export function validatePatient(input: PatientInput): Result<PatientClean> & { errors?: Record<string, string> } {
    const errors: Record<string, string> = {};

    /* `.ok` bo'yicha turni toraytirishga TAYANMAYMIZ: ildizdagi
       `tsconfig.json` da `strict` yoqilmagan, ya'ni ajratuvchi birlashma
       (discriminated union) u yerda torayimaydi va `first.error` xato
       beradi. Yordamchi funksiya buni bir joyda hal qiladi. */
    const pick = <T>(r: Result<T>, field: string): T | undefined => {
        if (r.ok === true) return (r as Valid<T>).value;
        errors[field] = (r as Invalid).error;
        return undefined;
    };

    const firstName = pick(validateName(input.firstName, 'Ism'), 'firstName');
    const lastName = pick(validateName(input.lastName, 'Familiya'), 'lastName');
    const gender = pick(validateGender(input.gender), 'gender');
    const phone = pick(validatePhone(input.phone, false), 'phone');
    const dob = pick(validateDob(input.dob), 'dob');
    const pinfl = pick(validatePinfl(input.pinfl), 'pinfl');

    const keys = Object.keys(errors);
    if (keys.length) {
        /* Birinchi xato — qisqa xabar uchun; `errors` esa formaga har
           maydonni alohida qizil qilib ko'rsatish uchun. Foydalanuvchi
           xatolarni bittalab topib chiqmasin. */
        return { ok: false, error: errors[keys[0]], errors };
    }

    return {
        ok: true,
        value: {
            firstName: firstName as string,
            lastName: lastName as string,
            gender: gender as Gender,
            phone: phone === undefined ? null : phone,
            dob: dob === undefined ? null : dob,
            pinfl: pinfl === undefined ? null : pinfl,
        },
    };
}
