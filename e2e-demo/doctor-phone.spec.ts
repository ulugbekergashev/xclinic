/* NAMOYISH NUSXASIDA: SHIFOKOR TELEFONDA (2026-11-26).
 *
 *   · 390 px ekranda shifokorning «Mening kabinetim» xaritasi o'rniga bugungi
 *     bemorlar ro'yxati: holat belgisi (Kabinetda / Kutmoqda · N daq).
 *   · Pastda katta «Keyingisini chaqirish» — barmoq yetadigan joyda, pastki
 *     menyu ustida; bosilgach «Qabulni boshlash» bo'ladi.
 *   · Gorizontal aylantirish yo'q; qabul varag'ining pastki tugmalari pastki
 *     menyu ostida qolmaydi.
 */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

test('Demo: shifokor telefonda — ro\'yxat va «Keyingisini chaqirish»', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, '/reception');
    await page.locator('select[aria-label="Demo: rol"]').selectOption('DOCTOR');
    await page.waitForTimeout(1500);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);

    const list = page.getByRole('list', { name: 'Bugungi bemorlar' });
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^Bugun · \d+ bemor$/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const next = page.getByRole('button', { name: /Keyingisini chaqirish|Qabulni boshlash/ });
    if (await next.count()) {
        const box = await next.boundingBox();
        expect(box && box.y + box.height).toBeLessThanOrEqual(844 - 60);   // pastki menyu ustida
        const label = (await next.textContent()) || '';
        if (/Keyingisini chaqirish/.test(label)) {
            await next.click();
            await expect(page.getByText(/chaqirildi/).first()).toBeVisible({ timeout: 10_000 });
            await expect(page.getByRole('button', { name: /Qabulni boshlash/ })).toBeVisible({ timeout: 10_000 });
        }
    }
});
