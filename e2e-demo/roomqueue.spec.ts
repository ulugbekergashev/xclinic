/* NAMOYISH NUSXASIDA: DIAGNOSTIKA VA LABORATORIYA NAVBATI (2026-11-27).
 *
 *   Ega so'radi: «bularda hech qanday navbat degan narsalar bo'lmaydimi?».
 *   · Diagnostika: jurnal tepasida «Navbat» — bugungi yo'llanmalar kelish
 *     tartibida, talon raqami bilan; «Chaqirish» tabloga «… UZI» bo'lib
 *     chiqadi; «Boshlash» qatorni «Hozir xonada» ga o'tkazadi.
 *   · Laboratoriya: «Proba olish navbati» da o'rin raqami va «Chaqirish».
 */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

test('Demo: Diagnostika navbati — chaqirish tabloga chiqadi, boshlash «Hozir xonada» ga o\'tkazadi', async ({ page }) => {
    await go(page, '/diagnostics');
    const queue = page.locator('section[aria-labelledby="diag-queue-title"]');
    await expect(queue).toBeVisible({ timeout: 15_000 });
    await expect(queue.getByRole('heading')).toContainText('Navbat');

    // Bugun yurak UZI ga yuborilgan bemor — navbatda, talon raqami bilan
    const row = queue.locator('li').filter({ hasText: 'Exokardiografiya' });
    await expect(row).toBeVisible();
    const ticket = (await row.locator('span.bg-ink').first().innerText()).trim();
    expect(ticket).toMatch(/^[A-Z]+-\d{2}$/);

    await row.getByRole('button', { name: /: Chaqirish$/ }).click();
    await expect(row).toContainText('chaqirildi', { timeout: 10_000 });

    // Tablo — o'sha talon, «UZI» xonasi
    await go(page, '/board');
    const called = page.locator('div').filter({ hasText: new RegExp(`^${ticket}UZI$`) });
    await expect(called.first()).toBeVisible({ timeout: 15_000 });

    // Boshlash — qator «Hozir xonada» ga o'tadi va «Xulosa» chiqadi
    await go(page, '/diagnostics');
    const q2 = page.locator('section[aria-labelledby="diag-queue-title"]');
    await q2.locator('li').filter({ hasText: 'Exokardiografiya' }).getByRole('button', { name: /: Boshlash$/ }).click();
    const now = q2.locator('li').filter({ hasText: 'Hozir xonada' }).filter({ hasText: 'Exokardiografiya' });
    await expect(now).toBeVisible({ timeout: 10_000 });
    await expect(now.getByRole('button', { name: /Xulosa/ })).toBeVisible();
});

test('Demo: Laboratoriya — «Proba olish navbati» da o\'rin raqami va chaqirish', async ({ page }) => {
    await go(page, '/lab');
    await expect(page.getByText(/Proba olish navbati/)).toBeVisible({ timeout: 15_000 });
    const first = page.getByLabel("Navbatda 1-o'rin");
    await expect(first).toBeVisible();
    const call = page.getByRole('button', { name: /: Chaqirish$/ }).first();
    await call.click();
    await expect(page.getByText(/chaqirildi \d{2}:\d{2}/).first()).toBeVisible({ timeout: 10_000 });
});
