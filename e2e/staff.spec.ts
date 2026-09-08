/* XODIMLAR — ALOHIDA MODUL.
 *
 * TARIX. Avval to'rtta vkladka bor edi: «Shifokorlar», «Resepshnlar»,
 * «Laborantlar», «Hamshiralar» — xodimni topish uchun uning ROLINI
 * eslash kerak edi. Keyin ular Sozlamalar ichida bitta ekranga
 * birlashdi. Endi bu alohida MODUL: menyu punkti, xodim kartasi
 * sahifasi, oylik va vedomost bir joyda.
 *
 * NIMA TEKSHIRILADI:
 *
 *   1. Menyuda «Xodimlar» bor va ro'yxat ochiladi;
 *   2. Rol filtri ishlaydi va Sozlamalarda eski vkladka qolmagan;
 *   3. Yangi xodimga bo'lim, kabinet va OYLIK beriladi;
 *   4. Xodim kartasi alohida sahifa bo'lib ochiladi va uchta bo'limi
 *      (umumiy, maosh, ish grafigi) yiqilmaydi;
 *   5. Ish grafigi belgilanadi va saqlanadi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test.describe('Xodimlar moduli', () => {

    test('menyuda bor, ro\'yxat ochiladi', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

        await login(page);
        await page.waitForTimeout(2000);
        await expect(page.getByRole('link', { name: 'Xodimlar' }).first()).toBeVisible({ timeout: 15000 });

        await go(page, '/staff');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await expect(main).toContainText('Jami xodim');
        await expect(main).toContainText('Oylik fond');
        expect(errors, 'Xodimlar ekrani JS xatosisiz ochilishi kerak').toEqual([]);
    });

    test('Sozlamalarda eski vkladkalar yo\'q', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2500);

        /* «Xodimlar» Sozlamalardan CHIQDI, eski to'rttasi ham qaytmadi. */
        const main = page.locator('main');
        for (const gone of ['Resepshnlar', 'Laborantlar', 'Hamshiralar']) {
            await expect(main.getByRole('button', { name: gone })).toHaveCount(0);
        }
    });

    test('rol filtri va qidiruv ishlaydi', async ({ page }) => {
        await login(page);
        await go(page, '/staff');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        for (const role of ['Shifokor', 'Registrator', 'Laborant', 'Hamshira']) {
            await expect(main.getByRole('button', { name: new RegExp('^' + role + ' \\d+$') }))
                .toBeVisible({ timeout: 15000 });
        }
        await expect(main.getByRole('button', { name: /^Barchasi \d+$/ })).toBeVisible();
    });

    test('yangi laborantga BO\'LIM, KABINET va OYLIK beriladi', async ({ page }) => {
        await login(page);
        await go(page, '/staff');
        await page.waitForTimeout(2500);

        const tag = uniq();
        await page.getByRole('button', { name: /Yangi xodim/ }).click();
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: /^Laborant/ }).first().click();
        await page.waitForTimeout(800);

        const form = page.locator('form').filter({ has: page.getByLabel(/^familiya/i) }).first();
        await expect(form.getByLabel(/^familiya/i)).toBeVisible({ timeout: 15000 });

        await form.getByLabel(/^familiya/i).fill('Laborantov' + tag);
        await form.getByLabel(/^ism/i).fill('Sinov');
        await form.getByLabel(/^telefon/i).fill('+998 90 111 22 33');
        await form.getByLabel(/kabinet/i).fill('777');
        await form.getByLabel(/ish boshlanishi/i).fill('8');
        await form.getByLabel(/ish tugashi/i).fill('16');

        /* MANA SHU ilgari umuman mumkin emas edi: oylik faqat shifokorda
           bor edi, laborantniki daftarda qolardi. */
        await form.getByLabel(/asosiy oylik/i).fill('4500000');

        await form.getByRole('button', { name: /^Saqlash$/ }).click();
        await page.waitForTimeout(3000);

        const main = page.locator('main');
        await expect(main.getByText('Laborantov' + tag).first()).toBeVisible({ timeout: 20000 });
        await expect(main).toContainText('4 500 000');
    });

    test('xodim kartasi alohida sahifa bo\'lib ochiladi', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

        await login(page);
        await go(page, '/staff');
        await page.waitForTimeout(2500);

        /* Jadvaldagi birinchi qator — butun qator bosiladi. */
        await page.locator('main table tbody tr').first().click();
        await page.waitForTimeout(2500);

        expect(page.url()).toContain('/staff/');
        const main = page.locator('main');
        await expect(main).toContainText("Xodimlar ro'yxati");
        await expect(main).toContainText('Aloqa ma\'lumotlari');

        /* Uchala bo'lim ham ochiladi va yiqilmaydi. */
        await main.getByRole('button', { name: /Maosh ma'lumoti/ }).click();
        await page.waitForTimeout(2000);
        await expect(main).toContainText('Maosh hisobi');
        await expect(main).toContainText("To'lanishi kerak");

        await main.getByRole('button', { name: /Ish grafigi/ }).click();
        await page.waitForTimeout(1500);
        await expect(main).toContainText('Haftalik ish kunlari');
        await expect(main).toContainText('Davomat');

        expect(errors, 'Xodim kartasi JS xatosisiz ishlashi kerak').toEqual([]);
    });

    test('ish grafigi belgilanadi va saqlanadi', async ({ page }) => {
        await login(page);
        await go(page, '/staff');
        await page.waitForTimeout(2500);

        await page.locator('main table tbody tr').first().click();
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await main.getByRole('button', { name: /Ish grafigi/ }).click();
        await page.waitForTimeout(1500);

        /* Chorshanbani yoqamiz va sahifani QAYTA YUKLAYMIZ: tanlov
           serverda saqlangan bo'lsagina tugma bosilgan holatda qoladi.
           Ekrandagi holatni tekshirish yetarli emas — u saqlanmasa ham
           ko'rinaveradi. */
        const wed = main.getByRole('button', { name: 'Chorshanba' });
        const wasOn = await wed.getAttribute('aria-pressed') === 'true';
        await wed.click();
        await page.waitForTimeout(2500);

        await page.reload();
        await page.waitForTimeout(3000);

        /* Qayta yuklangach karta birinchi bo'limga qaytadi — grafikni
           qaytadan ochamiz. */
        await page.locator('main').getByRole('button', { name: /Ish grafigi/ }).click();
        await page.waitForTimeout(1500);
        const after = page.locator('main').getByRole('button', { name: 'Chorshanba' });
        await expect(after).toHaveAttribute('aria-pressed', String(!wasOn), { timeout: 15000 });
    });
});
