/* KO'RIK BAYONI SHABLONLARI — KONSTRUKTOR.
 *
 * Shablonlar bazada bor edi, server ularni berardi va bemor kartasidagi
 * qabul paneli ularni ochardi. Lekin YARATADIGAN yoki TAHRIRLAYDIGAN
 * ekran yo'q edi: klinika o'rnatishda kelgan shablonlar bilan qolib
 * ketardi va bironta maydon qo'sha olmasdi.
 *
 * Ya'ni «terapevt uchun o'z bayonini tuzish» — tibbiy dasturning eng
 * asosiy sozlamalaridan biri — mutlaqo imkonsiz edi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test.describe("Ko'rik shablonlari", () => {

    test('vkladka bor va shablon yaratiladi', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2000);

        await page.getByRole('button', { name: "Ko'rik shablonlari" }).click();
        await page.waitForTimeout(2000);

        const tag = uniq();
        await page.getByRole('button', { name: /^Shablon$/ }).click();
        await page.waitForTimeout(800);

        const name = page.getByLabel(/shablon nomi/i);
        await expect(name).toBeVisible({ timeout: 15000 });
        await name.fill('Sinov bayoni ' + tag);

        /* TAYYOR O'LCHOV tugmasi kalitni TO'G'RI yozadi — fiziologik
           chegara tekshiruvi aynan kalitga ulanadi. */
        await page.getByRole('button', { name: '+ Harorat' }).click();
        await page.waitForTimeout(400);

        // Chegara ulangani ekranda AYTILADI
        await expect(page.locator('body')).toContainText(/Chegara tekshiruvi yoqildi/);

        await page.getByRole('button', { name: /^Saqlash$/ }).click();
        await page.waitForTimeout(2500);

        // Ro'yxatda ko'rinadi va maydon soni yozilgan
        await expect(page.getByText('Sinov bayoni ' + tag).first()).toBeVisible({ timeout: 20000 });
        await expect(page.locator('main')).toContainText('1 maydon');
    });

    test('kalit yorliqdan o\'zi yasaladi', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.getByRole('button', { name: "Ko'rik shablonlari" }).click();
        await page.waitForTimeout(2000);

        await page.getByRole('button', { name: /^Shablon$/ }).click();
        await page.waitForTimeout(800);

        await page.getByRole('button', { name: /^Maydon$/ }).click();
        await page.waitForTimeout(400);

        const label = page.getByPlaceholder(/Yorliq/);
        await label.fill('Qon bosimi');
        await page.waitForTimeout(300);

        /* Kalit qo'lda yozilmasa ham to'g'ri chiqadi: bayon qiymatlari
           aynan kalit bo'yicha saqlanadi va bo'sh kalit qiymatni
           yo'qotardi. */
        await expect(page.getByPlaceholder(/^kalit$/)).toHaveValue('qonBosimi');
    });
});
