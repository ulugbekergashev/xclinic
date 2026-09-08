/* XODIMLAR — BITTA EKRAN.
 *
 * Ilgari Sozlamalarda TO'RTTA vkladka turardi: «Shifokorlar»,
 * «Resepshnlar», «Laborantlar», «Hamshiralar». Xodimni topish uchun avval
 * uning ROLINI eslash kerak edi, va har vkladkaning o'z ro'yxati, o'z
 * formasi, o'z o'chirish oynasi bor edi — jami oltita oyna.
 *
 * Maydonlar ham tasodifan farq qilardi: bo'lim faqat shifokor va
 * hamshirada, kabinet va ish soatlari faqat shifokorda.
 *
 * NIMA TEKSHIRILADI: bitta ekran, rol filtri, va bo'lim/kabinet
 * maydonlari HAMMA rolda ishlashi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test.describe('Xodimlar ekrani', () => {

    test('bitta vkladka, eskilari yo\'q', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2000);

        const side = page.locator('nav, aside').last();
        await expect(page.getByRole('button', { name: 'Xodimlar' })).toBeVisible({ timeout: 15000 });

        /* Eski to'rtta vkladka qolmasligi kerak. */
        for (const gone of ['Resepshnlar', 'Laborantlar', 'Hamshiralar']) {
            await expect(page.getByRole('button', { name: gone })).toHaveCount(0);
        }
    });

    test('rol filtri va qidiruv ishlaydi', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.getByRole('button', { name: 'Xodimlar' }).click();
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        /* To'rt rol ham filtrda bor va sonlari ko'rsatilgan. */
        for (const role of ['Shifokor', 'Registrator', 'Laborant', 'Hamshira']) {
            await expect(main.getByRole('button', { name: new RegExp('^' + role + ' \\(\\d+\\)$') }))
                .toBeVisible({ timeout: 15000 });
        }
        await expect(main.getByRole('button', { name: /^Hammasi \(\d+\)$/ })).toBeVisible();
    });

    test('yangi laborantga BO\'LIM va KABINET beriladi', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.getByRole('button', { name: 'Xodimlar' }).click();
        await page.waitForTimeout(2500);

        const tag = uniq();
        // Har rol uchun alohida «qo'shish» tugmasi
        await page.getByRole('button', { name: /^Laborant$/ }).first().click();
        await page.waitForTimeout(800);

        const form = page.locator('form').filter({ has: page.getByLabel(/^familiya/i) }).first();
        await expect(form.getByLabel(/^familiya/i)).toBeVisible({ timeout: 15000 });

        await form.getByLabel(/^familiya/i).fill('Laborantov' + tag);
        await form.getByLabel(/^ism/i).fill('Sinov');
        await form.getByLabel(/^telefon/i).fill('+998 90 111 22 33');

        /* MANA SHU ilgari umuman mumkin emas edi: laborantda na bo'lim,
           na kabinet maydoni bor edi. */
        await form.getByLabel(/kabinet/i).fill('777');
        await form.getByLabel(/ish boshlanishi/i).fill('8');
        await form.getByLabel(/ish tugashi/i).fill('16');

        await form.getByRole('button', { name: /^Saqlash$/ }).click();
        await page.waitForTimeout(3000);

        // Ro'yxatda ko'rinadi — kabinet va soat bilan
        const row = page.getByText('Laborantov' + tag).first();
        await expect(row).toBeVisible({ timeout: 20000 });
        await expect(page.locator('main')).toContainText('777-kabinet');
        await expect(page.locator('main')).toContainText('8:00–16:00');
    });
});
