/* E2E yordamchilari.
 *
 * QOIDA: sinovlar CSS sinflariga tayanmaydi. Sinf nomi dizayn
 * o'zgarganda o'zgaradi va sinov «yiqilib», lekin hech qanday xato
 * topmay qoladi. Tayanch nuqtalari — foydalanuvchi ko'radigan narsa:
 * matn, yorliq, rol.
 */
import { Page, expect } from '@playwright/test';

export const PASSWORD = 'testpass123';

/** Ilova HashRouter da — manzil `#/...` ko'rinishida. */
export const go = (page: Page, hash: string) => page.goto(`/#${hash}`);

/**
 * Kirish. Rol bo'yicha boshlang'ich sahifa har xil, shuning uchun
 * sinov aniq bir elementni kutadi, sahifani emas.
 */
export async function login(page: Page, username = 'admin', password = PASSWORD) {
    await page.goto('/');
    // Kirish formasi — ikkita maydon va bitta tugma
    const user = page.locator('input').first();
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /kirish|войти|sign in/i }).click();

    // Kirish tugagani — kirish formasi yo'qolgani bilan bilinadi
    await expect(page.locator('input[type="password"]')).toHaveCount(0, { timeout: 30_000 });
}

/* Noyob qo'shimcha — sinovlar bir-birining ma'lumotiga urilmasin.

   `Date.now()` ning O'ZI YETMAYDI: telefon undan yasaladi va ketma-ket
   ishga tushirishlarda birinchi raqamlar bir xil bo'lib qoladi. Server
   esa takror telefonni 409 bilan rad etadi (S3.4) va sinov beqaror
   yiqiladi. Tasodifiy qism oldinda turadi — u kesilganda ham noyob. */
let seq = 0;
export const uniq = () => {
    seq += 1;
    const rand = Math.floor(Math.random() * 900 + 100);   // 3 raqam
    const t = String(Date.now()).slice(-4);               // 4 raqam
    return `${rand}${t}${String(seq % 100).padStart(2, '0')}`;
};

/**
 * Toast xabari. Ular 4-8 soniyada yo'qoladi, shuning uchun tekshiruv
 * darhol bo'lishi kerak.
 */
export function toast(page: Page, text: RegExp) {
    return page.getByText(text).first();
}
