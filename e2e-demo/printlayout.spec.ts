/* NAMOYISH NUSXASIDA: BLANK CHEKKALARI, A4 VARAQ, OYLIK VARAQASI (2026-11-26).
 *
 *   · Sozlamalar → Umumiy → «Bosma blank»: shapka oldindan bosilgan,
 *     chekkalar mm da; «Namuna chop etish» saqlanmagan qiymat bilan bosadi.
 *   · To'lovdan keyin chek yonida «A4» — o'sha ma'lumot A4 varaqda.
 *   · Xodim kartasi → Maosh: «Oylik varaqasi».
 */
import { test, expect, Page } from '@playwright/test';
import { openVisitInCard } from '../e2e/helpers';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

/** Bosma oynasi `window.print()` ni chaqiradi — sinovda ochilmasin */
const mutePrint = (page: Page) =>
    page.context().addInitScript(() => { window.print = () => { /* sinov */ }; });

test('Demo: blank chekkalari — namuna saqlanmagan qiymat bilan bosiladi, keyin saqlanadi', async ({ page }) => {
    await mutePrint(page);
    await go(page, '/settings?tab=general');

    const hide = page.getByRole('checkbox', { name: /Qog'ozda shapka oldindan bosilgan/ });
    await expect(hide).toBeVisible({ timeout: 15_000 });
    await hide.check();
    await page.getByLabel('Yuqoridan').fill('50');
    await page.getByLabel('Yonlardan').fill('20');

    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Namuna chop etish/ }).click();
    const sample = await popup;
    await expect(sample.locator('body')).toContainText('Namuna varaq');
    await expect(sample.locator('body')).toContainText('tepa 50 mm');
    await expect(sample.locator('body')).toContainText('shapkasiz');
    /* Shapka o'chirilgan — klinika nomi bloki chiqmaydi */
    await expect(sample.locator('.head')).toHaveCount(0);
    const css = await sample.locator('style').first().textContent();
    expect(css).toContain('margin: 50mm 20mm 12mm 20mm');
    await sample.close();

    /* Umumiy tabda endi ikki karta bor (xarajat nazorati ham) — umumiy formaning tugmasi */
    await page.locator('form').filter({ has: page.getByLabel('Yuqoridan') }).getByRole('button', { name: /^Saqlash$/ }).click();
    await expect(page.getByText('Saqlandi!').first()).toBeVisible({ timeout: 10_000 });

    await go(page, '/settings?tab=general');
    await expect(page.getByLabel('Yuqoridan')).toHaveValue('50', { timeout: 15_000 });
    await expect(page.getByRole('checkbox', { name: /Qog'ozda shapka oldindan bosilgan/ })).toBeChecked();

    /* Saqlangan sozlama HAQIQIY retseptga ta'sir qiladimi */
    await go(page, '/patients/demo-patient-1');
    await page.waitForTimeout(1500);
    if (await page.getByRole('button', { name: /^Qabul ochish/ }).count()) {
        await openVisitInCard(page);
        await page.waitForTimeout(2500);
    }
    const s = page.locator('section[aria-labelledby="visit-title"]');
    await expect(s.getByRole('heading', { name: 'Tayinlovlar' })).toBeVisible({ timeout: 15_000 });
    await s.getByRole('button', { name: /^Dori$/ }).click();
    await s.getByLabel('Dori nomi').fill('Paratsetamol 500 mg');
    await s.getByRole('button', { name: /^Retseptni saqlash$/ }).click();
    await expect(page.getByText('Retsept yozildi').first()).toBeVisible({ timeout: 10_000 });

    const rxPopup = page.waitForEvent('popup');
    await s.getByRole('button', { name: 'Chop etish' }).last().click();
    const rx = await rxPopup;
    await expect(rx.locator('body')).toContainText('Paratsetamol 500 mg');
    await expect(rx.locator('.head')).toHaveCount(0);
    expect(await rx.locator('style').first().textContent()).toContain('margin: 50mm 20mm 12mm 20mm');
});

test("Demo: to'lovdan keyin chek yonida «A4» — o'sha ma'lumot A4 varaqda", async ({ page }) => {
    await mutePrint(page);
    await go(page, '/reception');

    await page.getByRole('button', { name: /^To'lov qo'shish$/ }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: /\d[\d\s]*$/ }).first().click();
    await modal.getByRole('button', { name: /^To'lovni qabul qilish$/ }).click();
    await expect(modal.getByText("To'lov qabul qilindi")).toBeVisible({ timeout: 15_000 });

    const popup = page.waitForEvent('popup');
    await modal.getByRole('button', { name: /^A4$/ }).click();
    const doc = await popup;
    await expect(doc.locator('table.grid')).toBeVisible();
    await expect(doc.locator('body')).toContainText('Jami');
    await expect(doc.locator('body')).toContainText('Kassir');
    await expect(doc.locator('body')).toContainText("To'lovchi");
    const css = await doc.locator('style').first().textContent();
    expect(css).toContain('size: A4');
});

test('Demo: xodim kartasi → Maosh → «Oylik varaqasi» chop etiladi', async ({ page }) => {
    await mutePrint(page);
    await go(page, '/staff/DOCTOR/demo-doctor-1');

    await page.getByRole('button', { name: /Maosh ma'lumoti/ }).or(page.getByRole('tab', { name: /Maosh ma'lumoti/ })).first().click();
    const btn = page.getByRole('button', { name: /^Oylik varaqasi$/ });
    await expect(btn).toBeVisible({ timeout: 15_000 });

    const popup = page.waitForEvent('popup');
    await btn.click();
    const slip = await popup;
    await expect(slip.locator('body')).toContainText('Oylik varaqasi');
    await expect(slip.locator('body')).toContainText("To'lanishi kerak");
    await expect(slip.locator('body')).toContainText('Xodim imzosi');
});
