/* NAMOYISH NUSXASIDA: DAVOLASH TO'PLAMI VA ALLERGIYA (2026-11-26).
 *
 *   · Tashxis qo'yilsa, uning qatorida odatdagi davolash tugmasi chiqadi —
 *     bir bosishda dorilar, xizmat va tahlil qo'shiladi; «Bekor qilish»
 *     qo'shilganlarni haqiqatan olib tashlaydi.
 *   · Bemorda penitsillin allergiyasi bor — amoksitsillin yozilsa ogohlantirish
 *     chiqadi, javob berilmaguncha retsept saqlanmaydi; «Baribir yozish» dan
 *     keyin saqlanadi.
 */
import { test, expect, Page } from '@playwright/test';
import { openVisitInCard } from '../e2e/helpers';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};
const sheet = (page: Page) => page.locator('section[aria-labelledby="visit-title"]');

const openSheetOf = async (page: Page, open: () => Promise<void>) => {
    await open();
    await page.waitForTimeout(2500);
    const openBtn = page.getByRole('button', { name: /^Qabul ochish/ });
    if (await openBtn.count()) {
        await openVisitInCard(page);
        await page.waitForTimeout(2500);
    }
    await expect(sheet(page).getByRole('heading', { name: 'Tayinlovlar' })).toBeVisible({ timeout: 15_000 });
};

test("Demo: tashxisdagi to'plam bir bosishda qo'shadi, «Bekor qilish» olib tashlaydi", async ({ page }) => {
    await openSheetOf(page, async () => {
        await go(page, '/patients');
        await page.locator('tbody tr').nth(2).click();
    });
    const s = sheet(page);

    await s.getByPlaceholder(/Kod yoki kasallik nomi/).fill('gipert');
    await page.waitForTimeout(1200);
    await s.locator('button', { hasText: /^I10/ }).first().click();
    await expect(page.getByText("Tashxis qo'shildi").first()).toBeVisible({ timeout: 10_000 });

    const bundle = s.getByRole('button', { name: /^Gipertoniya — nazorat/ });
    await expect(bundle).toBeVisible({ timeout: 10_000 });
    await bundle.click();

    const bar = s.getByRole('status').filter({ hasText: "qo'shildi" });
    await expect(bar).toBeVisible({ timeout: 10_000 });
    await expect(bar).toContainText('2 ta dori');
    await expect(s.getByText('Lizinopril 10 mg').first()).toBeVisible();

    await bar.getByRole('button', { name: 'Bekor qilish' }).click();
    await expect(page.getByText("Qo'shilganlar olib tashlandi").first()).toBeVisible({ timeout: 10_000 });
    await expect(s.getByText('Lizinopril 10 mg')).toHaveCount(0);
});

test('Demo: allergiyaga mos dori — ogohlantirish, javobsiz saqlanmaydi', async ({ page }) => {
    await openSheetOf(page, () => go(page, '/patients/demo-patient-2'));
    const s = sheet(page);

    // Varaq tepasida allergiya
    await expect(s.getByText(/Allergiya:/).first()).toBeVisible();

    await s.getByRole('button', { name: /^Dori$/ }).click();
    await s.getByLabel('Dori nomi').fill('Amoksitsillin 500 mg');
    const alert = s.getByRole('alert').filter({ hasText: 'Bemorda allergiya: Penitsillin' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('penitsillinlar guruhidan');

    const save = s.getByRole('button', { name: /^Retseptni saqlash$/ });
    await expect(save).toBeDisabled();

    await alert.getByRole('button', { name: 'Baribir yozish' }).click();
    await expect(save).toBeEnabled();
    await s.getByRole('button', { name: "Avval ichgan, reaksiya bo'lmagan" }).click();
    await save.click();
    await expect(page.getByText('Retsept yozildi').first()).toBeVisible({ timeout: 10_000 });
    await expect(s.getByText('Amoksitsillin 500 mg').first()).toBeVisible();
});
