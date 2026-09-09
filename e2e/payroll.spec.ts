/* SHIFOKOR ULUSHI — «Xodimlar → Ulush» ekrani.
 *
 * EKRAN IKKI MARTA KO'CHDI VA SODDALASHDI.
 *
 * Avval u Moliyada, kassa va foyda bilan bir qatorda turardi. Keyin
 * Xodimlar moduliga o'tdi. Endi esa VEDOMOST ish oqimidan chiqdi:
 *
 *   ilgari — davr tanlanadi, hujjat yaratiladi, tasdiqlanadi, keyin
 *            qatorma-qator to'lanadi (to'rt qadam);
 *   hozir  — oy tanlanadi, jadval chiqadi, to'lash bir bosish.
 *
 * NIMA TEKSHIRILADI:
 *
 *   1. Ekran ochiladi va JS xatosi bermaydi;
 *   2. Davr — OY (ilgari «oy boshidan bugungacha» edi va raqam yarim
 *      oylik chiqardi);
 *   3. Bo'sh oyda ekran SABABNI aytadi, «ulush yo'q» deb qo'ya qolmaydi;
 *   4. Eski vedomostlar arxivi ochiladi va yiqilmaydi.
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Shifokor ulushi', () => {

    test('Ulush ekrani ochiladi va yiqilmaydi', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

        await login(page);
        await go(page, '/staff');
        await page.waitForTimeout(2000);
        await page.getByRole('button', { name: /^Ulush$/ }).click();
        await page.waitForTimeout(2500);

        expect(errors, 'Ulush ekrani JS xatosisiz ochilishi kerak').toEqual([]);
        const main = page.locator('main');
        await expect(main).toContainText('Shifokor ulushi');
        await expect(main).toContainText('Hisoblangan');
        await expect(main).toContainText("To'lanadi");
    });

    test('Davr — OY, va oylar orasida yurish mumkin', async ({ page }) => {
        await login(page);
        await go(page, '/staff?tab=payroll');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        /* Oy nomi ko'rinadi: «Sen 2026» kabi. Ilgari bu yerda ikkita
           sana maydoni turardi va davr «oy boshidan bugungacha» edi —
           9-sentabrda ochilgan ekran 01.09–09.09 ni ko'rsatardi va
           raqam yarim oylik chiqardi. */
        const label = main.locator('span.tabular-nums').first();
        const before = (await label.innerText()).trim();
        expect(before, `oy nomi kutilgan, kelgani: ${before}`).toMatch(/^[A-Za-z]{3} \d{4}$/);

        /* Orqaga bitta oy — yozuv o'zgarishi kerak. */
        await main.getByRole('button', { name: 'Oldingi oy' }).click();
        await page.waitForTimeout(2000);
        const after = (await label.innerText()).trim();
        expect(after, `oy o'zgarishi kerak edi: ${before} → ${after}`).not.toBe(before);
    });

    test("Bo'sh oyda ekran SABABNI aytadi", async ({ page }) => {
        await login(page);
        await go(page, '/staff?tab=payroll');
        await page.waitForTimeout(2500);

        /* Ataylab to'lov bo'lmagan oyga o'tamiz — 24 oy oldinga. */
        const main = page.locator('main');
        const next = main.getByRole('button', { name: 'Keyingi oy' });
        for (let i = 0; i < 24; i++) {
            await next.click();
            await page.waitForTimeout(120);
        }
        await page.waitForTimeout(2500);

        /* Sabab AYTILISHI shart: «to'lov tushmagan» yoki «shifokor
           ko'rsatilmagan». Ikkinchisi — tuzatilishi kerak bo'lgan xato. */
        await expect(main).toContainText(/hisoblanadigan ulush yo.q/i);
        await expect(main).toContainText(/to.lov tushmagan|shifokor ko.rsatilmagan|ulushga kirmaydi/i);
    });

    test('Eski vedomostlar arxivi ochiladi', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

        await login(page);
        await go(page, '/staff?tab=payroll');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await main.getByRole('button', { name: /Eski vedomostlar/ }).click();
        await page.waitForTimeout(2500);

        /* Arxiv — eski ekranning o'zi. U yiqilmasligi kerak: unda
           to'langan pul bor va u yuqoridagi jadvalda ayriladi. */
        await expect(main).toContainText('Vedomost');
        expect(errors, 'Arxiv JS xatosisiz ochilishi kerak').toEqual([]);
    });
});
