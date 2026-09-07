/* TARMOQ HAVOLASI VA BULUT PAPKASI.
 *
 * Foydalanuvchi dentalocal dan aynan shu ikkitasini so'ragan edi:
 * boshqa kompyuter va telefon ulanadigan havola, va Google Drive ga
 * zaxira.
 *
 * Server havolani ALLAQACHON berardi (`/api/network-info`, izohida
 * «Sozlamalar oynasi shu manzilni ko'rsatadi» deb yozilgan ham), lekin
 * uni chaqiradigan ekran yo'q edi: manzil faqat Electron oynasining
 * sarlavhasida ko'rinardi. `qrcode.react` ham o'rnatilgan, lekin
 * hech qayerda ishlatilmagan edi.
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Tarmoq va zaxira', () => {

    test('Sozlamalarda tarmoq havolasi va QR bor', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2500);

        await page.getByRole('button', { name: /Tarmoq va kirish/ }).click();
        await page.waitForTimeout(2500);

        await expect(page.getByText(/Klinika ichida/)).toBeVisible();

        /* Havola HAQIQIY manzil bo'lishi kerak, «localhost» emas: uni
           boshqa kompyuterga berish mumkin bo'lsin. */
        const link = page.locator('a[href^="http"]').filter({ hasText: /:\d+$/ }).first();
        await expect(link).toBeVisible();

        /* QR kod — telefon uchun. Tekshiruv MATN bo'yicha: `svg` selektori
           sahifadagi logotipga ham tushib, hech narsa tekshirmasdi. */
        await expect(page.getByText(/Telefon bilan skanerlang/)).toBeVisible();
        await expect(page.getByRole('button', { name: /Nusxa olish/ }).first()).toBeVisible();
    });

    test('zaxira sozlamasida bulut papkasi taklif qilinadi', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2500);

        await page.getByRole('button', { name: /Xizmat ko/ }).click();
        await page.waitForTimeout(3000);

        await expect(page.getByText(/Nusxa bulut papkasiga/)).toBeVisible();
        /* Papka topilsa tugma, topilmasa sabab — ikkalasi ham javob.
           Jimgina bo'sh joy qolmasligi kerak. */
        const hasButton = await page.getByRole('button', { name: /Google Drive|OneDrive|Dropbox|Yandex/ }).count();
        const hasHint = await page.getByText(/Google Drive topilmadi/).count();
        expect(hasButton + hasHint).toBeGreaterThan(0);
    });
});
