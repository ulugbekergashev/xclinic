/* Kalendar sarlavhalari uchun sana matnlari.

   `toLocaleDateString('uz-UZ', …)` ISHLATILMAYDI: Chrome'da o'zbek locali
   uchun oy nomi yo'q («2026 M10 4» chiqadi), kalendarda esa ilgari umuman
   `'en-US'` turardi — «Sep 28 - Oct 4» ruscha va o'zbekcha interfeysda ham.
   O'zbekcha nomlar shuning uchun qo'lda, ruscha — brauzerniki. */

const UZ_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const UZ_DAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

export type CalLang = 'uz' | 'ru';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Oktabr 2026» / «Октябрь 2026» */
export function monthLabel(d: Date, lang: CalLang): string {
    if (lang === 'ru') return cap(d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.?$/, ''));
    return `${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** «4-oktabr, yakshanba» / «вс, 4 октября» */
export function dayLabel(d: Date, lang: CalLang): string {
    if (lang === 'ru') return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    return `${d.getDate()}-${UZ_MONTHS[d.getMonth()].toLowerCase()}, ${UZ_DAYS[d.getDay()]}`;
}

/** «28-sentabr – 4-oktabr» / «28 сентября – 4 октября»; bir oy ichida — «5 – 11-oktabr» */
export function weekLabel(from: Date, to: Date, lang: CalLang): string {
    const same = from.getMonth() === to.getMonth();
    if (lang === 'ru') {
        const full = (x: Date) => x.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        return same ? `${from.getDate()} – ${full(to)}` : `${full(from)} – ${full(to)}`;
    }
    const m = (x: Date) => UZ_MONTHS[x.getMonth()].toLowerCase();
    return same ? `${from.getDate()} – ${to.getDate()}-${m(to)}` : `${from.getDate()}-${m(from)} – ${to.getDate()}-${m(to)}`;
}
