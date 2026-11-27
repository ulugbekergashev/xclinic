/* NAMOYISH NUSXASIDA: QAYTA KO'RIK (2026-11-26).
 *
 *   · Shifokor qabul varag'ining pastida «3 hafta» ni bosadi — sana qo'yiladi
 *     (qabulni yopishga majburiy qadam qo'shilmadi).
 *   · Registratura «Bugun» ekranida ro'yxatni ko'radi; «Vaqtga yozish» bemor
 *     kartasini yozish oynasi ochiq holda ochadi.
 */
import { test, expect, Page } from '@playwright/test';
import { openVisitInCard } from '../e2e/helpers';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};
const sheet = (page: Page) => page.locator('section[aria-labelledby="visit-title"]');

test("Demo: shifokor qayta ko'rikni bir bosishda qo'yadi va olib tashlaydi", async ({ page }) => {
    await go(page, '/patients');
    await page.locator('tbody tr').nth(1).click();
    await page.waitForTimeout(2500);
    if (await page.getByRole('button', { name: /^Qabul ochish/ }).count()) {
        await openVisitInCard(page);
        await page.waitForTimeout(2500);
    }
    const s = sheet(page);
    await expect(s.getByText("Qayta ko'rik:")).toBeVisible({ timeout: 15_000 });

    await s.getByRole('button', { name: '3 hafta' }).click();
    await expect(s.getByText(/registraturaning ro'yxatida chiqadi/)).toBeVisible({ timeout: 10_000 });
    await expect(s.getByRole('button', { name: '1 hafta' })).toHaveCount(0);

    await s.getByRole('button', { name: "Qayta ko'rikni olib tashlash" }).click();
    await expect(s.getByRole('button', { name: '1 hafta' })).toBeVisible({ timeout: 10_000 });
});

test("Demo: «Bugun» da qayta ko'rik ro'yxati, «Vaqtga yozish» yozish oynasini ochadi", async ({ page }) => {
    await go(page, '/reception');
    const list = page.locator('section[aria-labelledby="fu-title"]');
    await expect(list.getByRole('heading', { name: /Qayta ko'rikka kelishi kerak/ })).toBeVisible({ timeout: 15_000 });
    await expect(list.getByText(/kun kechikdi/).first()).toBeVisible();
    await expect(list.getByText(/^Yozilgan: /).first()).toBeVisible();

    // Saralash: faqat yozilmaganlar
    await list.getByRole('button', { name: /^Yozilmagan/ }).click();
    await expect(list.getByText(/^Yozilgan: /)).toHaveCount(0);

    await list.getByRole('button', { name: 'Vaqtga yozish' }).first().click();
    await expect(page).toHaveURL(/#\/patients\//);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    /* Belgi URL dan olinadi — F5 oynani qayta ochmaydi */
    await expect(page).not.toHaveURL(/book=1/);
});
