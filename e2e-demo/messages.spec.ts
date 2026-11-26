/* Xabarlar — demo (2026-11-25 dizayn).
   Namoyishda filtr haqiqatan ishlashi va Tarix toza ko'rinishi shart:
   ilgari «Ayollar» bosilsa ham son 14 qolardi, Tarixda esa ism o'rnida
   «-» va «SMS ()» chiqardi. */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

const tab = (page: Page, name: RegExp) =>
    page.getByRole('group', { name: 'Xabarlar' }).getByRole('button', { name });

test("Xabarlar → Qo'lda: tayyor filtr bemorlar sonini o'zgartiradi", async ({ page }) => {
    await go(page, '/messages');
    await tab(page, /Qo'lda/).click();

    const total = page.locator('section[aria-labelledby="manual-what"]').getByText(/^\d+ bemor$/);
    await expect(total).toBeVisible();
    const before = Number((await total.innerText()).match(/\d+/)![0]);

    await page.getByRole('button', { name: 'Ayollar', exact: true }).click();
    await expect(total).not.toHaveText(`${before} bemor`);
    const after = Number((await total.innerText()).match(/\d+/)![0]);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);

    // Segment sahifaning o'zida saqlanadi (Electron'da prompt() yo'q)
    await page.getByRole('button', { name: "Shu segmentni saqlab qo'yish" }).click();
    await page.getByRole('textbox', { name: 'Segment nomi' }).fill('Ayollar demo');
    await page.getByRole('button', { name: 'Saqlash', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ayollar demo', exact: true })).toBeVisible();
});

test('Xabarlar → Tarix: ism, kanal va manba toza; xato filtri ishlaydi', async ({ page }) => {
    await go(page, '/messages');
    await tab(page, /Tarix/).click();

    const list = page.locator('section[aria-label="Tarix"]');
    await expect(list.getByRole('listitem').first()).toBeVisible();
    await expect(list).not.toContainText('()');
    await expect(list.getByRole('link').first()).toBeVisible(); // ism — bemor kartasiga havola

    await page.getByRole('button', { name: /Xato$/ }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Telefon raqami mavjud emas');
});
