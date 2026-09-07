/* STATSIONAR: RO'YXATLARGA QO'SHIB BO'LADIMI.
 *
 * Foydalanuvchining aniq shikoyati: «когда я зайду, например, в какой-то
 * лекарственное, вот этот список, тут нет вот этого добавить».
 *
 * Uchta joy tekshiriladi:
 *   · kunlik dori varag'ida «Dori tayinlash» tugmasi bormi (ilgari faqat
 *     «Berildi» bor edi, bo'sh holat esa BOSHQA ekranga yuborardi);
 *   · palatani tahrirlash va unga koyka qo'shish mumkinmi (ilgari koyka
 *     faqat palata yaratilganda, `bedCount` orqali paydo bo'lardi);
 *   · koykani ta'mirga chiqarish mumkinmi (`Blocked` sxemada bor edi,
 *     lekin unga o'tadigan yo'l yo'q edi).
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Statsionar — ro\'yxatlarga qo\'shish', () => {

    test('kunlik dori varag\'ida «Dori tayinlash» bor', async ({ page }) => {
        await login(page);
        await go(page, '/inpatient');
        await page.waitForTimeout(3000);

        await page.getByRole('button', { name: /Dori varag/ }).click();
        await page.waitForTimeout(2000);

        const assign = page.getByRole('button', { name: /^Dori tayinlash$/ });
        await expect(assign).toBeVisible();

        // Oyna ochiladi va bemorni tanlash mumkin
        await assign.click();
        await page.waitForTimeout(1000);
        await expect(page.getByText(/Bemorni tanlang/).first()).toBeVisible();
    });

    test('palataga koyka qo\'shiladi', async ({ page }) => {
        await login(page);
        await go(page, '/inpatient');
        await page.waitForTimeout(3000);

        const addBed = page.getByRole('button', { name: /^Koyka$/ }).first();
        test.skip(await addBed.count() === 0, 'Palata yo\'q');

        const before = await page.getByText(/-koyka/).count();
        await addBed.click();
        await page.waitForTimeout(3000);

        await expect(async () => {
            const after = await page.getByText(/-koyka/).count();
            expect(after).toBeGreaterThan(before);
        }).toPass({ timeout: 15_000 });
    });

    test('palatani tahrirlash oynasi ochiladi', async ({ page }) => {
        await login(page);
        await go(page, '/inpatient');
        await page.waitForTimeout(3000);

        const edit = page.getByRole('button', { name: /Palatani tahrirlash/ }).first();
        test.skip(await edit.count() === 0, 'Palata yo\'q');

        await edit.click();
        await page.waitForTimeout(1000);
        await expect(page.getByRole('heading', { name: /Palatani tahrirlash/ })).toBeVisible();
        /* Koyka soni maydoni tahrirlashda BO'LMASLIGI kerak: mavjud
           palatada koykalar alohida qo'shiladi. */
        await expect(page.getByText(/Koykalar soni/)).toHaveCount(0);
    });

    test('bo\'sh koykani ta\'mirga chiqarish mumkin', async ({ page }) => {
        await login(page);
        await go(page, '/inpatient');
        await page.waitForTimeout(3000);

        const block = page.getByRole('button', { name: /Ta'mirga chiqarish/ }).first();
        test.skip(await block.count() === 0, 'Bo\'sh koyka yo\'q');

        await block.click();
        await page.waitForTimeout(3000);
        await expect(page.getByRole('button', { name: /Ishga qaytarish/ }).first()).toBeVisible();
    });
});
