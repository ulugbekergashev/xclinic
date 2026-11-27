/* NAMOYISH NUSXASIDA: 8, 10, 11-BANDLAR (2026-11-26).
 *
 *   8.  Saytdan yozilish: bemor sahifasi (/book) → so'rov → Kalendarda
 *       «Saytdan kelgan so'rovlar» → «Tasdiqlash».
 *   10. «Bugun» → «Shikoyat va fikrlar»: ochiq shikoyatlar, qo'ng'iroq
 *       havolasi, izohsiz yopilmaydi, izoh kartada qoladi.
 *   11. Xarajat nazorati: ega chegara va byudjet qo'yadi → registrator katta
 *       xarajat yozadi (kassadan chiqmaydi) → ega Kassada tasdiqlaydi.
 */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};
const role = (page: Page, r: string) => page.locator('select[aria-label="Demo: rol"]').selectOption(r);
/* Rol almashganda ilova «Bugun» ga qaytadi — Kassa menyudan ochiladi */
const openKassa = async (page: Page) => {
    await page.getByRole('link', { name: /^Kassa$/ }).first().click();
    await page.waitForTimeout(1500);
};

test('Demo 8: bemor saytdan yoziladi, registrator Kalendarda tasdiqlaydi', async ({ page }) => {
    await go(page, '/book');
    await page.locator('label').filter({ has: page.locator('input[name="doctor"]') }).first().click();
    await page.getByRole('button', { pressed: false }).filter({ hasText: /^\D+\d+$/ }).nth(1).click();
    const slot = page.getByRole('button', { name: /^\d{2}:\d{2}$/ }).first();
    await expect(slot).toBeVisible({ timeout: 10_000 });
    await slot.click();
    await page.getByLabel('Ismingiz').fill('Sinov Bemor');
    await page.getByLabel('Telefon').fill('+998 90 123 45 67');
    await page.getByRole('button', { name: /^Yozilish — / }).click();
    await expect(page.getByRole('heading', { name: "So'rovingiz qabul qilindi" })).toBeVisible({ timeout: 10_000 });

    await go(page, '/calendar');
    const block = page.locator('section[aria-labelledby="booking-req-title"]');
    await expect(block).toBeVisible({ timeout: 15_000 });
    const title = block.getByRole('heading');
    const before = Number(/(\d+)\s*$/.exec((await title.textContent()) || '')?.[1] || 0);
    expect(before).toBeGreaterThanOrEqual(4);   // 3 namuna + bizniki
    await expect(block.getByText('Sinov Bemor')).toBeVisible();
    await block.getByRole('button', { name: /^Tasdiqlash$/ }).first().click();
    await expect(title).toHaveText(new RegExp(`— ${before - 1}$`), { timeout: 10_000 });
});

test('Demo 10: shikoyatlar «Bugun» ekranida — mas\'ul, qo\'ng\'iroq, izoh bilan yopish', async ({ page }) => {
    await go(page, '/reception');
    const box = page.locator('section[aria-labelledby="cmp-title"]');
    await expect(box).toBeVisible({ timeout: 15_000 });
    await expect(box.getByRole('tab', { name: /Ochiq · 2/ })).toBeVisible();
    await expect(box.getByRole('link', { name: /Bemorga qo'ng'iroq/ }).first()).toHaveAttribute('href', /^tel:/);

    await box.getByRole('button', { name: /Hal qilindi deb yopish/ }).first().click();
    const dialog = page.getByRole('dialog');
    const close = dialog.getByRole('button', { name: /Hal qilindi deb yopish/ });
    await expect(close).toBeDisabled();
    await dialog.getByRole('textbox').fill("Bemorga qo'ng'iroq qilindi, uzr so'raldi");
    await close.click();
    await expect(box.getByRole('tab', { name: /Ochiq · 1/ })).toBeVisible({ timeout: 10_000 });
    await box.getByRole('tab', { name: /Hal qilindi/ }).click();
    await expect(box.getByText(/uzr so'raldi/)).toBeVisible();
});

test('Demo 11: katta xarajat egaga boradi, ega Kassada tasdiqlaydi; byudjet chiqadi', async ({ page }) => {
    await go(page, '/settings?tab=general');
    await page.getByLabel('Shu summadan katta xarajat egaga tasdiqqa borsin').fill('1000000');
    const budget = page.getByRole('textbox', { name: /: Bo'limning oylik byudjeti$/ }).first();
    await expect(budget).toBeVisible({ timeout: 15_000 });
    await budget.fill('8000000');
    await page.getByRole('button', { name: /^Saqlash$/ }).first().click();
    await expect(page.getByText('Saqlandi').first()).toBeVisible({ timeout: 10_000 });

    await role(page, 'RECEPTIONIST');
    await page.waitForTimeout(1200);
    await openKassa(page);
    await page.getByRole('button', { name: /^Xarajat$/ }).first().click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel(/Nomi/).fill('Reagentlar');
    await modal.getByLabel(/Summa/).fill('2000000');
    await modal.getByRole('button', { name: /^Saqlash$/ }).click();
    await expect(page.getByText(/egaga tasdiqqa yuborildi/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Egaga yuborilgan xarajatlar')).toBeVisible();

    await role(page, 'CLINIC_ADMIN');
    await page.waitForTimeout(1200);
    await openKassa(page);
    const pending = page.locator('section[aria-labelledby="exp-pending-title"]');
    await expect(pending).toContainText(/Tasdiq kutayotgan xarajatlar — 1/, { timeout: 10_000 });
    await expect(page.locator('section[aria-labelledby="exp-budget-title"]')).toBeVisible();
    await pending.getByRole('button', { name: /^Tasdiqlash$/ }).click();
    await expect(page.getByText(/Tasdiqlandi — bugungi xarajat/).first()).toBeVisible({ timeout: 10_000 });
    await expect(pending).toHaveCount(0);
});
