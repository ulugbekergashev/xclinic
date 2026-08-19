/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — vaqt zonasi. Klinika Toshkentda, baza sanani MATN sifatida saqlaydi.

   MUAMMO. Loyihaning ko'p joyida "bugun" shunday hisoblanardi:

       new Date().toISOString().split('T')[0]

   `toISOString()` esa UTC beradi. Toshkent UTC+5, ya'ni mahalliy 00:00 dan
   05:00 gacha bu ifoda KECHAGI sanani qaytaradi. Natijada tunda ochilgan qabul
   kechagi navbat raqamini oladi, tunda qabul qilingan to'lov esa allaqachon
   yopilgan kechagi kassa smenasiga tushadi. Stasionar va shoshilinch qabul
   bo'lgan klinikada bu har kunlik xato.

   YECHIM. Bitta funksiya, bitta joyda. `triggers.ts` da bu allaqachon to'g'ri
   qilingan edi (`tashkentDateStr`) — takrorlamaslik uchun shu yerga ko'chirildi
   va `triggers.ts` endi shu moduldan oladi.

   Nima uchun Intl emas, balki qat'iy siljish. O'zbekiston 1992 yildan buyon
   UTC+5 da va yozgi vaqtga o'tmaydi. Qat'iy siljish `Intl` ga qaraganda
   arzon va oldindan aytib bo'ladigan; `Intl` bo'lmagan muhitda ham ishlaydi.
   Agar zona qachondir o'zgarsa — o'zgarish faqat shu faylda bo'ladi.
   ───────────────────────────────────────────────────────────────────────────── */

/** Toshkent UTC+5, yozgi vaqt yo'q */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Toshkent bo'yicha "hozir" — millisekundlarda (getUTC* bilan o'qish uchun) */
export const tashkentNowMs = (): number => Date.now() + TASHKENT_OFFSET_MS;

/**
 * Toshkent bo'yicha sana `YYYY-MM-DD`.
 * @param offsetDays 0 = bugun, 1 = ertaga, -1 = kecha
 */
export const tashkentDateStr = (offsetDays = 0): string =>
    new Date(Date.now() + TASHKENT_OFFSET_MS + offsetDays * 86400000)
        .toISOString().split('T')[0];

/** Toshkent bo'yicha soat (0-23) */
export const tashkentHour = (): number => new Date(tashkentNowMs()).getUTCHours();

/**
 * Toshkent kunining boshi va oxiri — UTC `Date` sifatida.
 *
 * Nima uchun kerak. Hisobotlarda shunday filtr bor edi:
 *
 *     createdAt: { gte: new Date(from), lte: new Date(to + 'T23:59:59') }
 *
 * ECMAScript qoidasi bo'yicha `new Date('2026-08-01')` — UTC yarim tuni,
 * `new Date('2026-08-01T23:59:59')` esa LOKAL vaqt. Ya'ni bir filtrning ikki
 * chegarasi turli zonalarda o'lchanadi va davr boshidagi 5 soat hisobotga
 * tushmaydi. Bu funksiya ikki chegarani ham bir xil qoida bilan beradi.
 */
export function tashkentDayBounds(dateStr: string): { start: Date; end: Date } {
    // '2026-08-01' → Toshkent 00:00:00 = UTC 2026-07-31T19:00:00
    const startUtcMs = Date.parse(`${dateStr}T00:00:00.000Z`) - TASHKENT_OFFSET_MS;
    return {
        start: new Date(startUtcMs),
        end: new Date(startUtcMs + 86400000 - 1),
    };
}

/** Davr chegaralari: `from` kunining boshidan `to` kunining oxirigacha */
export function tashkentRangeBounds(from: string, to: string): { start: Date; end: Date } {
    return {
        start: tashkentDayBounds(from).start,
        end: tashkentDayBounds(to).end,
    };
}

/** Joriy oyning birinchi kuni, Toshkent bo'yicha */
export function tashkentMonthStart(): string {
    const d = new Date(tashkentNowMs());
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
