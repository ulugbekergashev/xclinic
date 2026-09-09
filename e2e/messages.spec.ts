/* XABARLAR MODULI — menyuda va kanal sozlamasi ichida.
 *
 * IKKI KO'CHISH. Xabarlar menyudan olib tashlanib Sozlamalar ichiga
 * kiritilgan edi: «shablon oyiga bir-ikki marta kerak» degan hisob bilan.
 * Amalda u kundalik ish quroli bo'lib chiqdi — SMS balansi, yuborilgan
 * xabarlar tarixi, kanal sozlamasi. Endi u yana menyuda.
 *
 * Teskari yo'nalishda esa kanal sozlamasi («Faqat Telegram / Faqat SMS /
 * Ikkalasi ham») va Eskiz logini Sozlamalardan CHIQIB, shu modulga kirdi:
 * shablon yozayotgan odam xabar qaysi yo'l bilan ketishini shu yerda
 * bilishi kerak.
 *
 * NIMA TEKSHIRILADI:
 *   1. Menyuda «Xabarlar» bor;
 *   2. «Sozlamalar» vkladkasida kanal tanlovi va ESKIZ MAYDONLARI bor —
 *      Telegram rejimida ham (ilgari ular yashirin edi va foydalanuvchi
 *      «kiritadigan joy yo'q» deb o'ylardi);
 *   3. Bron to'lovi ham shu yerda;
 *   4. Sozlamalardan ular chiqib ketgan.
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Xabarlar moduli', () => {

    test('menyuda bor va ochiladi', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

        await login(page);
        await page.waitForTimeout(2000);
        await expect(page.getByRole('link', { name: 'Xabarlar' }).first()).toBeVisible({ timeout: 15000 });

        await go(page, '/messages');
        await page.waitForTimeout(2500);
        expect(errors, 'Xabarlar ekrani JS xatosisiz ochilishi kerak').toEqual([]);
    });

    test('Sozlamalar vkladkasida kanal va ESKIZ maydonlari bor', async ({ page }) => {
        await login(page);
        await go(page, '/messages');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await main.getByRole('button', { name: /^Sozlamalar$/ }).click();
        await page.waitForTimeout(2000);

        await expect(main).toContainText('Xabar yuborish kanali');
        await expect(main).toContainText('Faqat Telegram Bot');

        /* ENG MUHIMI: Eskiz maydonlari Telegram rejimida ham ko'rinadi.
           Ilgari ular faqat SMS tanlanganda chiqardi — ya'ni SMS ni
           oldindan ULASH mumkin emas edi. */
        await expect(main.getByLabel(/kabinet email/i)).toBeVisible();
        await expect(main).toContainText('Kabinet paroli');
    });

    test('bron to\'lovi ham shu yerda', async ({ page }) => {
        await login(page);
        await go(page, '/messages');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await main.getByRole('button', { name: /^Sozlamalar$/ }).click();
        await page.waitForTimeout(2000);
        await expect(main).toContainText("Bron uchun oldindan to'lov");
    });

    test('Sozlamalarda eski kartalar qolmagan', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await expect(main).not.toContainText('SMS va Xabar Yuborish Rejimi');
        await expect(main).not.toContainText("Oldindan To'lov (Bron uchun)");
    });
});
