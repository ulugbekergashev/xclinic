/* Tahlil natijasining me'yorga nisbatan o'rni — kichik yo'lakcha uchun.

   Shifokor qiymatni o'qimaydi, ko'radi: nuqta yashil yo'lak ichidami yoki
   undan chiqqanmi, qaysi tomonga va qancha. Me'yor oralig'i yo'lakning
   o'rtasida turadi (25 % … 75 %), ikki chetda — undan past va baland qism.

   Faqat bitta chegara berilgan ko'rsatkichlar ham bor («< 5,2», «> 1,0»):
   ularda yo'lak o'sha chegaradan chetgacha cho'ziladi. */

export interface RangeMark {
    /** Nuqtaning o'rni, foizda (chapdan) */
    pos: number;
    /** Me'yor yo'lagining chap va o'ng cheti, foizda */
    bandLeft: number;
    bandRight: number;
}

const BAND_LEFT = 25;
const BAND_RIGHT = 75;
/** Nuqta yo'lakchadan chiqib ketmasin */
const EDGE = 4;

const clamp = (x: number) => Math.min(100 - EDGE, Math.max(EDGE, x));

export function rangeMark(
    value: number | null | undefined, low: number | null | undefined, high: number | null | undefined,
): RangeMark | null {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    const hasLow = low !== null && low !== undefined && Number.isFinite(low);
    const hasHigh = high !== null && high !== undefined && Number.isFinite(high);

    if (hasLow && hasHigh && (high as number) > (low as number)) {
        const ratio = (value - (low as number)) / ((high as number) - (low as number));
        return { pos: clamp(BAND_LEFT + ratio * (BAND_RIGHT - BAND_LEFT)), bandLeft: BAND_LEFT, bandRight: BAND_RIGHT };
    }
    if (hasHigh && (high as number) > 0) {
        return { pos: clamp((value / (high as number)) * BAND_RIGHT), bandLeft: 0, bandRight: BAND_RIGHT };
    }
    if (hasLow && (low as number) > 0) {
        return { pos: clamp((value / (low as number)) * BAND_LEFT), bandLeft: BAND_LEFT, bandRight: 100 };
    }
    return null;
}
