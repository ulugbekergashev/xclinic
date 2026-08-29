/* ─────────────────────────────────────────────────────────────────────────────
   SANA VA RAQAM — bitta ko'rinish (S4.5, audit B-29).

   MUAMMO. Audit uchta alohida narsani topgan:

   1. «2026 M08 28, FRI» — bosh sahifa sarlavhasida. Bu formatlash xatosi
      emas, brauzerning javobi: `toLocaleDateString('uz-UZ', ...)`
      chaqirilgan, Chrome'da esa `uz` uchun ICU ma'lumoti to'liq emas —
      oy «M08», hafta kuni esa inglizcha qisqartma bo'lib qaytadi.

   2. Raqamlar bir sahifada ham probel, ham vergul bilan: Kassada
      «27 981 457», Hisobotda «32,873,500», Omborda «1,100». Sabab —
      lokalsiz `toLocaleString()`: u BRAUZER tiliga qarab formatlaydi,
      ya'ni bir kompyuterda vergul, boshqasida probel chiqadi.

   3. Shifokor ulushi «2 560 680,5» — tiyingacha kasr. Pul butun so'mda
      (`backend/money.ts`), demak ko'rsatishda ham kasr bo'lmasligi kerak.

   YECHIM. Brauzer lokaliga UMUMAN tayanmaymiz: oy va hafta kuni nomlari
   shu yerda yozilgan, raqam guruhlash ham qo'lda. Shunda natija har
   kompyuterda bir xil bo'ladi — bu offline dastur uchun ayniqsa muhim,
   chunki klinikadagi mashinaning tili noma'lum.
   ───────────────────────────────────────────────────────────────────────── */

const MONTHS_UZ = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const MONTHS_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const WEEKDAYS_UZ = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const WEEKDAYS_RU = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export type Lang = 'uz' | 'ru';

/** `Date` yoki `YYYY-MM-DD` — ikkalasini ham qabul qiladi. */
function toDate(v: Date | string | number | null | undefined): Date | null {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/* ─── Sana ───────────────────────────────────────────────────────────────── */

/** `28.08.2026` — jadval, ro'yxat va forma uchun asosiy ko'rinish. */
export function formatDate(v: Date | string | null | undefined): string {
    const d = toDate(v);
    if (!d) return '';
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** `28.08.2026 14:30` */
export function formatDateTime(v: Date | string | null | undefined): string {
    const d = toDate(v);
    if (!d) return '';
    return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `14:30` */
export function formatTime(v: Date | string | null | undefined): string {
    const d = toDate(v);
    if (!d) return '';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * `28 avgust 2026, juma` — sarlavhalar uchun.
 *
 * Aynan shu yerda «2026 M08 28, FRI» chiqardi. Nomlar yuqorida
 * yozilgani uchun brauzer lokali ahamiyatsiz.
 */
export function formatDateLong(v: Date | string | null | undefined, lang: Lang = 'uz'): string {
    const d = toDate(v);
    if (!d) return '';
    if (lang === 'ru') {
        return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()} г., ${WEEKDAYS_RU[d.getDay()]}`;
    }
    return `${d.getDate()} ${MONTHS_UZ[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS_UZ[d.getDay()]}`;
}

/** `28 avg` — diagramma o'qi va tor ustunlar uchun. */
export function formatDateShort(v: Date | string | null | undefined, lang: Lang = 'uz'): string {
    const d = toDate(v);
    if (!d) return '';
    const m = (lang === 'ru' ? MONTHS_RU : MONTHS_UZ)[d.getMonth()];
    return `${d.getDate()} ${m.slice(0, 3)}`;
}

/* ─── Raqam ──────────────────────────────────────────────────────────────── */

/**
 * `1 234 567` — minglar oddiy probel bilan.
 *
 * `Intl` ATAYLAB ishlatilmadi: `ru-RU` uzluksiz tor probel (U+202F)
 * qo'yadi, u ba'zi shriftlarda ko'rinmaydi va nusxa olganda muammo
 * beradi. Oddiy probel har joyda bir xil.
 */
export function formatNumber(n: number | null | undefined, decimals = 0): string {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '0';
    const value = Number(n);
    const neg = value < 0;
    const fixed = Math.abs(value).toFixed(decimals);
    const [intPart, decPart] = fixed.split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${neg ? '−' : ''}${grouped}${decPart ? ',' + decPart : ''}`;
}

/**
 * Pul — HAR DOIM butun so'm.
 *
 * `backend/money.ts` pulni butun so'mda saqlaydi, ya'ni kasr bo'lsa u
 * hisoblash xatosi. Auditdagi «2 560 680,5» aynan shu — ko'rsatishda
 * yaxlitlanadi, lekin sabab hisobda.
 */
export function formatMoney(n: number | null | undefined): string {
    return formatNumber(Math.round(Number(n) || 0), 0);
}

/** `1 234 567 so'm` */
export function formatSom(n: number | null | undefined): string {
    return `${formatMoney(n)} so'm`;
}

/** `12,5%` */
export function formatPercent(n: number | null | undefined, decimals = 1): string {
    return `${formatNumber(n, decimals)}%`;
}

/* ─── Ism ────────────────────────────────────────────────────────────────────

   MUAMMO (S4.8, audit B-31). Bitta odam tizimda TO'RT XIL ko'rinishda
   uchraydi: bemor profilida «Sinov Testov», ro'yxatda «Testov Sinov»,
   moliya jadvalida «ERGASHEV BAHODIR», kalendarda «Dr. Bahodir Ergashev».

   Sabab: ism har joyda qo'lda yig'ilardi — 34 ta joyda «Familiya Ism»,
   23 ta joyda «Ism Familiya». Bazada uch alohida maydon bor, lekin
   ko'rsatish qoidasi yo'q edi.

   QOIDA: rasmiy hujjatlardagidek — Familiya, keyin Ism, keyin otasining
   ismi. Katta harfga o'girish YO'Q: «ERGASHEV BAHODIR» o'qishni
   qiyinlashtiradi va baqirgandek ko'rinadi. */

export interface NamedPerson {
    firstName?: string | null;
    lastName?: string | null;
    middleName?: string | null;
}

/** `Ergashev Bahodir` — hamma ro'yxat, jadval va sarlavhalar uchun. */
export function formatFullName(p?: NamedPerson | null): string {
    if (!p) return '';
    return [p.lastName, p.firstName, p.middleName]
        .map(x => String(x || '').trim())
        .filter(Boolean)
        .join(' ');
}

/** `Ergashev B.` — tor ustunlar va kalendar bloklari uchun. */
export function formatShortName(p?: NamedPerson | null): string {
    if (!p) return '';
    const last = String(p.lastName || '').trim();
    const first = String(p.firstName || '').trim();
    if (!last) return first;
    return first ? `${last} ${first[0].toUpperCase()}.` : last;
}

/** `Dr. Ergashev Bahodir` — shifokorlar uchun; prefiks bitta joyda. */
export function formatDoctorName(p?: NamedPerson | null): string {
    const name = formatFullName(p);
    return name ? `Dr. ${name}` : '';
}
