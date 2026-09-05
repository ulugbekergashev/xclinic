/**
 * Formats a date object to YYYY-MM-DD using local timezone components
 * to avoid timezone shift issues.
 */
export const formatDateToISO = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Bugungi sana `YYYY-MM-DD` — KOMPYUTER vaqti bo'yicha (klinikada u Toshkent).
 *
 * Nima uchun alohida funksiya. Loyihada 28 joyda shunday yozilgan edi:
 *
 *     new Date().toISOString().split('T')[0]
 *
 * `toISOString()` UTC beradi, Toshkent esa UTC+5. Ya'ni mahalliy 00:00 dan
 * 05:00 gacha bu ifoda KECHAGI sanani qaytarardi: tunda ochilgan qabul kechagi
 * navbatga tushardi, tunda qabul qilingan to'lov yopilgan smenaga yozilardi.
 * Server tomonida ham shu tuzatildi (backend/tashkentTime.ts) — ikki tomon bir
 * xil kunni ko'rishi shart, aks holda filtr "bugun" bo'yicha hech narsa
 * topmaydi.
 */
export const todayISO = () => formatDateToISO(new Date());

/**
 * HAR QANDAY sana qiymatini `YYYY-MM-DD` kalitiga keltiradi.
 *
 * Nima uchun kerak. Ma'lumot ikki xil shaklda keladi: qabullarda sof sana
 * (`2026-09-04`), cheklarda esa to'liq vaqt tamg'asi
 * (`2026-09-04T15:46:18.857Z`). Guruhlash SATR bo'yicha ketgani uchun bitta
 * kun ikkita kalitga bo'linib qolardi va Bosh sahifadagi grafikda o'sha kun
 * ikki marta ko'rinardi (audit XC-20). Xuddi shu sabab moliyaviy raqamlar
 * ekrandan ekranga farq qilishiga olib kelardi.
 *
 * Sof sana QAYTA HISOBLANMAYDI: `new Date('2026-09-04')` UTC yarim tuni
 * sifatida o'qiladi va manfiy zonada bir kun orqaga siljib ketardi.
 * Vaqt tamg'asi esa MAHALLIY kunga keltiriladi — Toshkentda tunda
 * qabul qilingan to'lov o'sha kunga tushishi uchun.
 */
export const dayKey = (value?: string | Date | null): string => {
    if (!value) return '';
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : formatDateToISO(value);
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s.slice(0, 10) : formatDateToISO(d);
};

/**
 * Ekranga chiqariladigan sana — `DD.MM.YYYY`.
 *
 * Ilgari ba'zi joylarda xom qiymat chizilardi va foydalanuvchi
 * `2026-08-14T15:46:...` ko'rinishidagi vaqt tamg'asini ko'rardi
 * (audit XC-22). Ilovada uchta format aralashib ketgan edi.
 */
export const formatDay = (value?: string | Date | null): string => {
    const key = dayKey(value);
    if (!key) return '';
    const [y, m, d] = key.split('-');
    return `${d}.${m}.${y}`;
};

/**
 * 'YYYY-MM-DD' satrini 'DD.MM.YYYY' ko'rinishida qaytaradi.
 * new Date() ISHLATILMAYDI — UTC/lokal zona siljishi bo'lmaydi (tug'ilgan sana bug fix).
 */
export const formatDobDDMMYYYY = (dob?: string): string => {
    if (!dob) return '';
    const parts = dob.split('T')[0].split('-');
    if (parts.length !== 3) return dob;
    const [year, month, day] = parts;
    return `${day}.${month}.${year}`;
};

/**
 * Tug'ilgan sanadan yoshni hisoblaydi — faqat satr parchalari orqali (Date/UTC siljishisiz).
 */
export const calcAge = (dob?: string): number | null => {
    if (!dob) return null;
    const parts = dob.split('T')[0].split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const [year, month, day] = parts;
    const now = new Date();
    let age = now.getFullYear() - year;
    if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) {
        age -= 1;
    }
    return age;
};

/**
 * Returns the first day of the current month and today's date in YYYY-MM-DD format.
 */
export const getCurrentMonthRange = () => {
    const now = new Date();
    // Use local time to get the 1st of the month
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
        startDate: formatDateToISO(start),
        endDate: formatDateToISO(now)
    };
};
