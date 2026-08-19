// To'lov usullarining yagona manbasi.
// Ilgari har bir sahifada `type === 'Cash' ? 'Naqd' : ...` zanjiri takrorlanardi — yangi usul
// qo'shilganda ular jimgina noto'g'ri yorliq ko'rsatardi. Endi barcha ro'yxat/yorliq shu yerdan.

export type PaymentMethod = 'Cash' | 'Card' | 'Click' | 'Transfer' | 'Insurance' | 'Balance';

export interface PaymentMethodMeta {
    key: PaymentMethod;
    label: string;
    /** Diagramma o'qi va tor ustunlar uchun qisqa nom */
    short: string;
    /** Kassaga haqiqiy pul kiradimi (naqd yashik yoki hisob raqam) */
    isMoneyIn: boolean;
    /** Naqd yashikka tushadimi — "Kassada qoldi" shu asosda hisoblanadi */
    isCashDrawer: boolean;
    /** Diagramma va nishonlar rangi */
    color: string;
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
    { key: 'Cash', label: 'Naqd', short: 'Naqd', isMoneyIn: true, isCashDrawer: true, color: '#10B981' },
    { key: 'Card', label: 'Karta (terminal)', short: 'Karta', isMoneyIn: true, isCashDrawer: false, color: '#3B82F6' },
    { key: 'Click', label: 'Click / Payme', short: 'Click', isMoneyIn: true, isCashDrawer: false, color: '#06B6D4' },
    { key: 'Transfer', label: "O'tkazma", short: "O'tkazma", isMoneyIn: true, isCashDrawer: false, color: '#6366F1' },
    { key: 'Insurance', label: "Sug'urta", short: "Sug'urta", isMoneyIn: true, isCashDrawer: false, color: '#8B5CF6' },
    // Avansdan yechish — bemor pulni ilgari to'lagan, bugun kassaga yangi pul kirmaydi.
    { key: 'Balance', label: 'Hisobdan (Avans)', short: 'Avans', isMoneyIn: false, isCashDrawer: false, color: '#F59E0B' },
];

const META_BY_KEY = new Map<string, PaymentMethodMeta>(PAYMENT_METHODS.map(m => [m.key, m]));

/** To'lov qabul qilishda tanlash mumkin bo'lgan usullar (Balans alohida boshqariladi) */
export const INCOMING_PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Click', 'Transfer', 'Insurance'];

/** Xarajat qilishda ishlatiladigan usullar — kassadan naqd yoki hisobdan */
export const EXPENSE_PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card', 'Click', 'Transfer'];

/** Noma'lum qiymat kelsa ham hech qachon bo'sh qaytarmaydi */
export function getPaymentMethodLabel(method?: string | null): string {
    if (!method) return '-';
    return META_BY_KEY.get(method)?.label ?? method;
}

export function getPaymentMethodColor(method?: string | null): string {
    if (!method) return '#9CA3AF';
    return META_BY_KEY.get(method)?.color ?? '#9CA3AF';
}

/**
 * Tranzaksiya kassaga haqiqiy pul olib keldimi.
 * 'Balance' — yo'q: pul avans sifatida ilgari tushgan, ikki marta sanalmasligi kerak.
 */
export function isMoneyInMethod(method?: string | null): boolean {
    if (!method) return true; // usuli ko'rsatilmagan eski yozuvlar — naqd deb qabul qilinadi
    return META_BY_KEY.get(method)?.isMoneyIn ?? true;
}

/**
 * Naqd yashikka ta'sir qiladimi. Usuli bo'sh bo'lgan eski yozuvlar naqd deb hisoblanadi —
 * tizimda sukut bo'yicha 'Cash' tanlangan, shuning uchun bu xavfsiz taxmin.
 */
export function isCashDrawerMethod(method?: string | null): boolean {
    if (!method) return true;
    return META_BY_KEY.get(method)?.isCashDrawer ?? false;
}

/** Naqd bo'lmagan, lekin pul olib kelgan usullar — hisobot ustunlari uchun */
export const NON_CASH_INCOMING: PaymentMethod[] = ['Card', 'Click', 'Transfer', 'Insurance'];
