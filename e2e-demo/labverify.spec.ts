/* NAMOYISH NUSXASIDA: PROBIRKA YORLIG'I VA NATIJANI TASDIQLASH (2026-11-26).
 *
 *   · Sozlamalar → Laboratoriya katalogi: yorliq o'lchami, sinov yorlig'i,
 *     «natijani ikkinchi xodim tasdiqlasin» (dastlab o'chiq).
 *   · Laboratoriya: «Proba olish» qatorida shtrix-kod tugmasi — yorliq;
 *     «Olindi» — kod jurnalda; skaner kodni yozib Enter bosadi — natija ochiladi.
 *   · Tasdiq yoqilgan: hamma qiymat kiritilgach «Tasdiqlash», Telegram tugmasi
 *     tasdiqgacha yopiq.
 */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};
const mutePrint = (page: Page) =>
    page.context().addInitScript(() => { window.print = () => { /* sinov */ }; });

test('Demo: yorliq, skaner bilan ochish va natijani tasdiqlash', async ({ page }) => {
    await mutePrint(page);

    /* 1. Sozlama: dastlab o'chiq, yoqiladi; sinov yorlig'i chiqadi */
    await go(page, '/settings?tab=labCatalog');
    const verify = page.getByRole('checkbox', { name: /Natijani ikkinchi xodim tasdiqlasin/ });
    await expect(verify).toBeVisible({ timeout: 15_000 });
    await expect(verify).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: /«Olindi» bosilganda yorliq/ })).not.toBeChecked();
    await verify.check();
    await expect(page.getByText('Saqlandi').first()).toBeVisible({ timeout: 10_000 });

    const testPopup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Sinov yorlig'i/ }).click();
    const sample = await testPopup;
    await expect(sample.locator('svg')).toHaveCount(1);
    await expect(sample.locator('body')).toContainText('2611260001');
    expect(await sample.locator('style').first().textContent()).toContain('size: 40mm 30mm');
    await sample.close();

    /* 2. Laboratoriya: yorliq «Proba olish» qatoridan */
    await go(page, '/lab');
    const labelBtn = page.getByRole('button', { name: /: Probirka yorlig'i$/ }).first();
    await expect(labelBtn).toBeVisible({ timeout: 15_000 });
    const who = ((await labelBtn.getAttribute('aria-label')) || '').split(':')[0];

    const labelPopup = page.waitForEvent('popup');
    await labelBtn.click();
    const label = await labelPopup;
    const body = (await label.locator('body').textContent()) || '';
    const code = /\b(\d{10})\b/.exec(body)?.[1] || '';
    expect(code).toMatch(/^\d{10}$/);
    await expect(label.locator('svg').first()).toBeVisible();
    await label.close();

    await page.getByRole('button', { name: `${who}: Olindi` }).click();
    await expect(page.getByText(`№ ${code}`).first()).toBeVisible({ timeout: 10_000 });

    /* 3. Skaner: kod + Enter — aynan shu buyurtma ochiladi */
    const search = page.getByRole('textbox', { name: /probirka kodi/ });
    await search.fill(code);
    await search.press('Enter');
    const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Natijalarni saqlash' });
    await expect(modal.getByRole('heading', { name: who })).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText(`№ ${code}`)).toBeVisible();

    /* 4. Hamma qiymat → saqlash → «Tasdiqlash» */
    const inputs = modal.locator('tbody input');
    const n = await inputs.count();
    for (let i = 0; i < n; i++) await inputs.nth(i).fill('5');
    await modal.getByRole('button', { name: 'Natijalarni saqlash' }).click();
    const verifyBtn = modal.getByRole('button', { name: /^Tasdiqlash$/ });
    await expect(verifyBtn).toBeVisible({ timeout: 10_000 });
    await expect(modal.getByText(/Tasdiqlanmagan — bemorga hali ketmaydi/)).toBeVisible();
    await verifyBtn.click();
    await expect(modal.getByText(/Tasdiqladi: /)).toBeVisible({ timeout: 10_000 });
    await expect(verifyBtn).toHaveCount(0);
});
