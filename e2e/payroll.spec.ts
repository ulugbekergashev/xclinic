/* SHIFOKOR ULUSHI — «Moliya → Ulush» ekrani.
 *
 * NIMA UCHUN KERAK. Ekran bo'sh chiqqanda ilgari bitta umumiy gap
 * ko'rsatilardi: «ulush faqat to'langan xizmatlardan hisoblanadi va
 * qatorda shifokor ko'rsatilgan bo'lishi kerak». U qoidani tushuntiradi,
 * lekin SABABNI aytmaydi — holbuki sabablar har xil:
 *
 *   · davrda umuman to'lov bo'lmagan (sanani o'zgartirish kerak);
 *   · to'lov bor, lekin shifokorsiz — bu xato, pul hech kimga tegishli emas;
 *   · qatorlar bekor qilingan.
 *
 * Haqiqiy klinika bazasida aynan birinchi holat kuzatildi: oxirgi to'lov
 * 29.08 da, davr esa 31.08 dan boshlanardi — ekran esa buni aytmasdi.
 * Ustiga davr boshi `toISOString()` tufayli bir kun orqaga siljigan edi
 * (Toshkent UTC+5).
 *
 * Bu sinov ikkalasini ham qo'riqlaydi.
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Shifokor ulushi', () => {

    test('Ulush vkladkasi ochiladi va yiqilmaydi', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

        await login(page);
        await go(page, '/finance');
        await page.getByRole('button', { name: 'Ulush' }).click();
        await page.waitForTimeout(2500);

        expect(errors, 'Ulush vkladkasi JS xatosisiz ochilishi kerak').toEqual([]);
        await expect(page.locator('main')).toContainText('Shifokor ulushi');
    });

    test("Davr boshi oyning BIRINCHI kuni (Toshkent vaqti bo'yicha)", async ({ page }) => {
        await login(page);
        await go(page, '/finance');
        await page.getByRole('button', { name: 'Ulush' }).click();
        await page.waitForTimeout(2000);

        /* `toISOString()` UTC beradi va Toshkentda (UTC+5) oy boshini
           OLDINGI oyning oxirgi kuniga siljitardi: 1-sentabr o'rniga
           31-avgust. Vedomost o'tgan oyning kunini ham qamrab olardi. */
        const from = await page.locator('input[type="date"]').first().inputValue();
        expect(from, `davr boshi oyning 1-kuni bo'lishi kerak, hozir: ${from}`).toMatch(/^\d{4}-\d{2}-01$/);
    });

    test('Bo\'sh davrda ekran SABABNI aytadi', async ({ page }) => {
        await login(page);
        await go(page, '/finance');
        await page.getByRole('button', { name: 'Ulush' }).click();
        await page.waitForTimeout(2000);

        /* Ataylab to'lov bo'lmagan davrni tanlaymiz — kelasi yil. */
        const dates = page.locator('input[type="date"]');
        await dates.nth(0).fill('2030-01-01');
        await dates.nth(1).fill('2030-01-31');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await expect(main).toContainText("Bu davrda hisoblanadigan ulush yo'q");
        /* Sabab AYTILISHI shart — «bironta to'lov bo'lmagan» yoki
           «N ta to'lovda shifokor ko'rsatilmagan». */
        await expect(main).toContainText(/bironta to.lov bo.lmagan|shifokor ko.rsatilmagan/);
    });
});
