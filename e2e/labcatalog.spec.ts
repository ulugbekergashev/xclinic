/* TAHLILLAR KATALOGI — EKRANI YO'Q EDI.
 *
 * Server to'liq tayyor turardi: `GET/POST/PUT/DELETE /api/lab-tests`
 * ko'rsatkichlari va normalari bilan, `api.ts` da metodlar ham bor —
 * faqat ularni chaqiradigan sahifa qurilmagan edi.
 *
 * Oqibati ko'zga tashlanadigan darajada edi: laboratoriya ekrani katalog
 * bo'sh bo'lganda «Sozlamalar → Laboratoriya» ga yuborardi, LEKIN bunday
 * vkladka mavjud emas edi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test.describe('Tahlillar katalogi', () => {

    test('vkladka bor va tahlil qo\'shiladi', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2500);

        await page.getByRole('button', { name: /Laboratoriya katalogi/ }).click();
        await page.waitForTimeout(2500);

        await expect(page.getByRole('heading', { name: /Tahlillar katalogi/ })).toBeVisible();

        const n = uniq().slice(0, 4);
        const name = `Sinov tahlili ${n}`;
        await page.getByRole('button', { name: /Tahlil qo'shish/ }).click();
        await page.waitForTimeout(1200);

        await page.getByLabel(/Tahlil nomi/).fill(name);
        await page.getByLabel(/^Kod$/).fill(`ST${n}`);
        await page.getByLabel(/^Narx$/).fill('45000');

        /* Ko'rsatkich va NORMA — katalogning butun ma'nosi shu:
           natijaga bahoni server aynan shu chegaralardan qo'yadi. */
        await page.getByPlaceholder(/Ko'rsatkich/).first().fill('Gemoglobin');
        await page.getByPlaceholder(/^dan$/).first().fill('120');
        await page.getByPlaceholder(/^gacha$/).first().fill('160');

        await page.getByRole('button', { name: /^Saqlash$/ }).last().click();
        await page.waitForTimeout(3000);

        await expect(page.getByText(name).first()).toBeVisible();
        await expect(page.getByText(`ST${n}`.toUpperCase()).first()).toBeVisible();
    });

    test('laboratoriya ekranidagi eslatma HAVOLA', async ({ page }) => {
        /* Ilgari bu matn mavjud bo'lmagan vkladkaga yuborardi. */
        await login(page);
        await go(page, '/lab');
        await page.waitForTimeout(2500);

        const hint = page.getByRole('button', { name: /Sozlamalar →/ });
        if (await hint.count() === 0) test.skip(true, 'Katalog bo\'sh emas — eslatma chiqmaydi');

        await hint.click();
        await page.waitForTimeout(2500);
        expect(page.url()).toContain('/settings');
    });
});
