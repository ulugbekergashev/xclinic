/* MENYU VA RUXSATLAR.
 *
 * NIMA TEKSHIRILADI. Menyuda ortiqcha punkt qolmasligi va «Ruxsatlar» da
 * yashirilgan modulni MANZIL ORQALI ham ocholmaslik.
 *
 * Nima uchun. Ruxsatlar filtri faqat MENYUGA qo'llanardi: modul
 * yashirilgan bo'lsa ham `#/inventory` ni qo'lda yozib kirish mumkin edi.
 * Ro'yxatning o'zi esa ikki joyda — yon panelda va telefondagi pastki
 * panelda — alohida yozilgan va ular ajralib ketgan edi.
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Menyu va ruxsatlar', () => {

    test('menyuda olib tashlangan bo\'limlar yo\'q', async ({ page }) => {
        await login(page);
        await page.waitForTimeout(2500);

        const nav = page.locator('nav').first();
        /* Boshqaruv paneli, Lidlar, Shifokorlar analitikasi, Tablo va
           Xabarlar menyudan chiqdi. */
        for (const gone of ['Boshqaruv Paneli', 'Lidlar', 'Shifokorlar', 'Navbat tablosi', 'Xabarlar']) {
            await expect(page.getByRole('link', { name: gone })).toHaveCount(0);
        }
        void nav;

        // Qolganlari joyida
        for (const stays of ['Bugun', 'Bemorlar', 'Kalendar', 'Moliya', 'Xodimlar', 'Sozlamalar']) {
            await expect(page.getByRole('link', { name: stays }).first()).toBeVisible();
        }
    });

    test('olib tashlangan sahifalar manzil orqali ham ochilmaydi', async ({ page }) => {
        await login(page);

        for (const dead of ['/leads', '/doctors']) {
            await go(page, dead);
            await page.waitForTimeout(2500);
            /* 404 sahifasi — jimgina bosh sahifaga tashlamaydi (B-37). */
            const notFound = await page.getByText(/topilmadi|не найдена|404/i).count();
            expect(notFound, `${dead} uchun 404 kutilgan`).toBeGreaterThan(0);
        }
    });

    test('bosh sahifa «Bugun» ga yo\'naltiradi', async ({ page }) => {
        await login(page);
        await go(page, '/');
        await page.waitForTimeout(2500);
        expect(page.url()).toContain('/today');
    });

    test('AI yordamchi sahifa USTIDA ochiladi', async ({ page }) => {
        /* Ilgari tugma `/?tab=ai` ga OLIB O'TARDI: savol berish uchun
           turgan ekranni tashlab ketish kerak edi. */
        await login(page);
        await go(page, '/patients');
        await page.waitForTimeout(2500);

        await page.getByRole('button', { name: /AI yordamchi/ }).first().click();
        await page.waitForTimeout(1500);

        // Manzil O'ZGARMAYDI — oyna ustidan ochiladi
        expect(page.url()).toContain('/patients');
        await expect(page.getByRole('dialog')).toBeVisible();

        // Escape yopadi va o'sha joyda qolamiz
        await page.keyboard.press('Escape');
        await page.waitForTimeout(800);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(page.url()).toContain('/patients');
    });
});
