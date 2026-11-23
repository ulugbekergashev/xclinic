/* Hisobot — Moliya rejasi (docs/superpowers/plans/2026-11-23-moliya.md). */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
};
const money = (s: string) => Number(String(s).replace(/[^\d-]/g, '')) || 0;

/* 3-vazifa: Shifokorlar tabi — hisoblangan / to'langan / qoldiq ulush va
   «To'lash →» Xodimlar → Ulush ga olib boradi (pul bitta joydan chiqadi). */
test('Hisobot → Shifokorlar: ulush to\'landi va qoldiq, «To\'lash» Ulush ga olib boradi', async ({ page }) => {
    await go(page, '/dashboard');
    await page.getByRole('tab', { name: 'Shifokorlar' }).click();
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: /Ulush to'landi/ })).toBeVisible({ timeout: 15_000 });
    await expect(table.getByRole('columnheader', { name: /Ulush qoldig'i/ })).toBeVisible();

    // Birinchi qator: qoldiq = hisoblangan − to'landi
    const cells = table.locator('tbody tr').first().locator('td');
    const n = await cells.count();
    const accrued = money(await cells.nth(n - 4).innerText());
    const paid = money(await cells.nth(n - 3).innerText());
    const left = money(await cells.nth(n - 2).innerText());
    expect(left).toBe(Math.max(0, accrued - paid));

    await table.getByRole('link', { name: /To'lash/ }).first().click();
    await expect(page).toHaveURL(/#\/staff\?tab=payroll/);
});

/* 6-vazifa: Oylar bo'yicha — yopiq turadi, ochilsa joriy oy = Umumiy plitkasi */
test('Hisobot: «Oylar bo\'yicha» ochiladi, joriy oy Xizmatlar = plitka', async ({ page }) => {
    await go(page, '/dashboard');
    const tile = page.locator('main').getByText('Xizmatlar', { exact: true }).first().locator('xpath=../..');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const services = money(await tile.locator('p.text-xl').innerText());

    const toggle = page.getByRole('button', { name: /Oylar bo'yicha/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: /Yil jami/ })).toBeVisible({ timeout: 15_000 });
    // Joriy oy — jami qatoridan oldingi oxirgi qator
    const rows = table.locator('tbody tr');
    const n = await rows.count();
    expect(money(await rows.nth(n - 2).locator('td').nth(1).innerText())).toBe(services);
});

/* 7-vazifa: qarzdorga shu yerdan qo'ng'iroq */
test('Hisobot: qarzdorlar qatorida telefon — qo\'ng\'iroq havolasi', async ({ page }) => {
    await go(page, '/dashboard');
    const block = page.locator('main').getByRole('heading', { name: /Qarzdorlar/ }).locator('xpath=../..');
    await expect(block).toBeVisible({ timeout: 15_000 });
    await expect(block.locator('a[href^="tel:"]').first()).toBeVisible();
});

/* 5-vazifa: Bo'limlar Umumiy bilan bitta manbadan — «Xizmatlar» bir xil. */
test('Hisobot: Bo\'limlar «Xizmatlar» = Umumiy «Xizmatlar»', async ({ page }) => {
    await go(page, '/dashboard');
    // Plitka: [belgi + yorliq] ustida, raqam ostida — yorliqning bobosi
    const tile = page.locator('main').getByText('Xizmatlar', { exact: true }).first().locator('xpath=../..');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const summaryServices = money(await tile.locator('p.text-xl').innerText());
    expect(summaryServices).toBeGreaterThan(0);

    await page.getByRole('tab', { name: "Bo'limlar" }).click();
    const rows = page.getByRole('table').locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    let sum = 0;
    for (const r of await rows.all()) sum += money(await r.locator('td').nth(1).innerText());
    expect(sum).toBe(summaryServices);
});
