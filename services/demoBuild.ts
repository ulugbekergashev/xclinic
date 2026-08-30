/* DEMO BUILD — Vercelga chiqariladigan, BACKENDSIZ nusxa.
 *
 * Nima uchun alohida bayroq kerak: demo rejimining o'zi (`isDemoMode()`)
 * allaqachon bor va u sessiya ichidagi bayroqqa qaraydi. Lekin o'sha
 * sessiyaga TUSHISH yo'li `SignIn.tsx` da `localhost` bilan cheklangan edi —
 * ataylab, chunki klinikaning haqiqiy o'rnatmasida demo hisobiga tasodifan
 * kirib qolish mumkin bo'lmasligi kerak.
 *
 * Bu bayroq o'sha cheklovni OLIB TASHLAMAYDI, balki unga ikkinchi yo'l
 * qo'shadi: faqat `VITE_DEMO_BUILD=true` bilan qurilgan bundle'da demo
 * hisobi ochiq bo'ladi. Klinikaga tarqatiladigan build'da o'zgaruvchi
 * berilmaydi — ya'ni u yerda hech narsa o'zgarmaydi.
 *
 * Ishlatilishi:
 *   VITE_DEMO_BUILD=true npm run build     → Vercel uchun demo nusxa
 *   npm run build                          → odatdagi klinika build'i
 */
export const IS_DEMO_BUILD =
    typeof import.meta !== 'undefined'
    && (import.meta as any).env?.VITE_DEMO_BUILD === 'true';

/** Demo hisobining ma'lumotlari — `SignIn.tsx` shu qiymatlarni tekshiradi. */
export const DEMO_USERNAME = 'demoklinikaadmin';
export const DEMO_PASSWORD = 'demoklinikaparol';
