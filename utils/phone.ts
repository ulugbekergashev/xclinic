/**
 * O'zbekiston telefon raqamlari bilan ishlash.
 *
 * ⚠️ MUHIM: bu mantiq `backend/smsService.ts` dagi `normalizeUzPhone` bilan
 * bir xil bo'lishi shart. Backend alohida tsconfig/outDir bilan build bo'lgani
 * uchun umumiy fayl import qilib bo'lmaydi — biri o'zgarsa, ikkinchisi ham
 * o'zgartirilsin. Aks holda UI "26 ta bemor" deb ko'rsatib, backend ularning
 * bir qismini "noto'g'ri format" deb rad etadi.
 */

/**
 * Raqamni Eskiz kutadigan 998XXXXXXXXX ko'rinishiga keltiradi.
 * Tanib bo'lmasa null qaytaradi.
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
