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
        /* Lidlar, Shifokorlar analitikasi va Tablo menyudan chiqdi.
           «Bosh panel» va «Registratura» ham yo'q: ikkalasi bitta «Bugun»
           ekraniga birlashdi (2026-10-03), davr bo'yicha tahlil esa
           «Hisobot» nomini oldi. */
        /* «Xabarlar» bu ro'yxatdan CHIQARILDI: u menyuga qaytarildi
           (`utils/navigation.ts`, faqat egaga). Sinov eskirgan qarorni
           yozib turgan edi va shu sababdan yiqilardi. */
        for (const gone of ['Boshqaruv Paneli', 'Bosh panel', 'Registratura', 'Lidlar', 'Shifokorlar', 'Navbat tablosi']) {
            await expect(page.getByRole('link', { name: gone })).toHaveCount(0);
        }
        void nav;

        // Qolganlari joyida
        for (const stays of ['Bugun', 'Bemorlar', 'Kalendar', 'Moliya', 'Hisobot', 'Xodimlar', 'Sozlamalar']) {
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

    test("bosh sahifa egani «Bugun» ga yo'naltiradi", async ({ page }) => {
        /* Sinov ega (`admin`) bilan kiradi. Registrator va shifokor ham
           shu ekranga tushadi — `homeFor` (`utils/navigation.ts`). */
        await login(page);
        await go(page, '/');
        await page.waitForTimeout(2500);
        expect(page.url()).toContain('/reception');
        await expect(page.getByRole('heading', { name: 'Bugun', exact: true })).toBeVisible();
    });

    test("«Bugun» da ega uchun xarita, kassa qatori va «hal qilinsin» bitta ekranda", async ({ page }) => {
        /* Ilgari bular ikki sahifada edi: xarita ham Bosh panelda, ham
           Registraturada turardi. Endi bitta joyda, takrorsiz. */
        await login(page);
        await go(page, '/reception');
        await expect(page.getByRole('heading', { name: 'Bugun klinikada' })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('heading', { name: 'Bugun hal qilinsin' })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/Bugun kassaga/).first()).toBeVisible();
        // Qabul masterosi sahifada doim ochiq turmaydi — u «Yangi qabul» oynasida
        await expect(page.locator('#rc-dept')).toHaveCount(0);
        await page.getByRole('button', { name: 'Yangi qabul' }).click();
        await expect(page.getByRole('dialog', { name: 'Yangi qabul' })).toBeVisible();
        await expect(page.locator('#rc-dept')).toBeVisible();
        // Escape yopadi
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Yangi qabul' })).toHaveCount(0);

        /* F2 — boshqa sahifadan ham: «Bugun» ga olib keladi, oyna ochiq va
           fokus qidiruvda — registrator darhol ism yoza oladi. */
        await go(page, '/patients');
        await expect(page.getByRole('button', { name: /Bemor qo'shish/ }).first()).toBeVisible({ timeout: 15_000 });
        await page.keyboard.press('F2');
        const dialog = page.getByRole('dialog', { name: 'Yangi qabul' });
        await expect(dialog).toBeVisible();
        expect(page.url()).toContain('/reception');
        await expect(dialog.getByPlaceholder(/qidir|ism|telefon/i).first()).toBeFocused();
    });

    test("«Hisobot» — faqat davr: bugungi xarita u yerda takrorlanmaydi", async ({ page }) => {
        await login(page);
        await go(page, '/dashboard');
        await expect(page.getByRole('heading', { name: 'Hisobot', exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('tab', { name: /Davomat/ })).toBeVisible();
        await expect(page.getByRole('tab')).toHaveCount(2);
        await expect(page.getByRole('heading', { name: 'Bugun klinikada' })).toHaveCount(0);
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
