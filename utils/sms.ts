/**
 * SMS matnini tahlil qilish: kodlash turi va nechta qismga bo'linishi.
 *
 * Nega kerak: operator har bir QISM uchun alohida pul oladi. Lotin alifbosida
 * 160 belgi bitta SMS, lekin matnda GSM-7 jadvalidan tashqari bitta belgi bo'lsa
 * (masalan kirill harfi yoki tipografik apostrof ’), butun xabar UCS-2 ga o'tadi
 * va bitta SMS atigi 70 belgi bo'lib qoladi. Ya'ni "o‘" dagi bitta noto'g'ri
 * apostrof 500 bemorlik rassilkani ikki barobar qimmatlashtiradi.
 */

// GSM 03.38 asosiy jadvali — bu belgilar 1 septet
const GSM7_BASIC =
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
    '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

// Kengaytma jadvali — bu belgilar 2 septet egallaydi
const GSM7_EXTENDED = '^{}\\[~]|€';

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export interface SmsInfo {
    /** Matn uzunligi (belgilarda) */
    length: number;
    encoding: SmsEncoding;
    /** Nechta SMS qismiga bo'linadi (= nechta marta pul yechiladi) */
    parts: number;
    /** Shu kodlashda bitta qismga sig'adigan belgi soni */
    perPart: number;
    /** Keyingi qism boshlanishiga qancha belgi qolgani */
    remaining: number;
    /** UCS-2 ga majburlagan belgilar (takrorlanmaydigan ro'yxat) */
    nonGsmChars: string[];
}

const isGsm7 = (ch: string) => GSM7_BASIC.includes(ch) || GSM7_EXTENDED.includes(ch);

export function analyzeSms(text: string): SmsInfo {
    const chars = [...(text || '')];
    const nonGsm = new Set<string>();
    let septets = 0;

    for (const ch of chars) {
        if (GSM7_BASIC.includes(ch)) septets += 1;
        else if (GSM7_EXTENDED.includes(ch)) septets += 2;
        else nonGsm.add(ch);
    }

    if (nonGsm.size === 0) {
        const perPart = septets <= 160 ? 160 : 153;
        const parts = septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153);
        return {
            length: septets,
            encoding: 'GSM-7',
            parts,
            perPart,
            remaining: parts === 0 ? 160 : parts * perPart - septets,
            nonGsmChars: [],
        };
    }

    // UCS-2: SMS UTF-16 birliklarini sanaydi (emoji = 2 birlik)
    const units = (text || '').length;
    const perPart = units <= 70 ? 70 : 67;
    const parts = units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67);
    return {
        length: units,
        encoding: 'UCS-2',
        parts,
        perPart,
        remaining: parts === 0 ? 70 : parts * perPart - units,
        nonGsmChars: [...nonGsm],
    };
}

/**
 * Tipografik apostrof (’ va ‘) GSM-7 da yo'q, oddiy ' esa bor.
 * O'zbek lotinida bu eng ko'p uchraydigan va eng qimmat xato.
 */
export const TYPOGRAPHIC_APOSTROPHES = ['‘', '’', 'ʻ', 'ʼ'];

export const hasTypographicApostrophe = (text: string): boolean =>
    TYPOGRAPHIC_APOSTROPHES.some(ch => (text || '').includes(ch));

/** Tipografik apostroflarni GSM-7 dagi oddiy ' ga almashtiradi */
export const fixApostrophes = (text: string): string =>
    TYPOGRAPHIC_APOSTROPHES.reduce((acc, ch) => acc.split(ch).join("'"), text || '');
