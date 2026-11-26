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
    const tile = page.locator('main [data-kpi="revenue"]');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const services = money(await tile.locator('[data-kpi-value]').innerText());

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
    // KPI qatori: «Xizmatlar» katagi (data-kpi), raqam — data-kpi-value
    const tile = page.locator('main [data-kpi="revenue"]');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const summaryServices = money(await tile.locator('[data-kpi-value]').innerText());
    expect(summaryServices).toBeGreaterThan(0);

    await page.getByRole('tab', { name: "Bo'limlar" }).click();
    const rows = page.getByRole('table').locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    let sum = 0;
    /* 0 — bo'lim, 1 — bemorlar, 2 — xizmatlar (2026-11-26) */
    for (const r of await rows.all()) sum += money(await r.locator('td').nth(2).innerText());
    expect(sum).toBe(summaryServices);
});

/* DIZAYN (2026-11-26): bitta davr hamma tab uchun, raqamlar tablar orasida
   mos. Ilgari Davomat o'z «30/90 kun» davrida edi («Tushum 19,1 mln»
   Umumiy «Olindi 4,4 mln» yonida), Shifokorlar jami Umumiydan 1,8 mln kam,
   har KPI yonida «(yangi)». */
test('Hisobot: Davomat umumiy davrga bo\'ysunadi, singan matn yo\'q', async ({ page }) => {
    await go(page, '/dashboard');
    await page.getByRole('tab', { name: 'Davomat' }).click();
    const booked = page.locator('main [data-kpi="booked"] [data-kpi-value]');
    await expect(booked).toBeVisible({ timeout: 15_000 });
    const month = money(await booked.innerText());

    // Davr qatori Davomatda ham bor; «Bugun» tanlansa son kamayadi
    await page.getByRole('group', { name: 'Tayyor davrlar' }).getByRole('button', { name: 'Bugun' }).click();
    await expect.poll(async () => money(await booked.innerText())).toBeLessThan(month);

    await expect(page.locator('main')).not.toContainText('— ·');
    await expect(page.locator('main')).not.toContainText('Tushum');
});

test('Hisobot: Shifokorlar jami = Umumiy «Xizmatlar»; «(yangi)» yo\'q', async ({ page }) => {
    await go(page, '/dashboard');
    const tile = page.locator('main [data-kpi="revenue"] [data-kpi-value]');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const services = money(await tile.innerText());
    await expect(page.locator('main')).not.toContainText('(yangi)');
    await expect(page.locator('section[aria-labelledby="rep-trend"]')).toBeVisible();

    await page.getByRole('tab', { name: 'Shifokorlar' }).click();
    const totalRow = page.getByRole('table').locator('tfoot tr');
    await expect(totalRow).toBeVisible({ timeout: 15_000 });
    expect(money(await totalRow.locator('td').nth(1).innerText())).toBe(services);
});

test('Hisobot: Ombor isrofi — pozitsiyalar yig\'indisi = «Jami chiqim»', async ({ page }) => {
    await go(page, '/dashboard');
    await page.getByRole('tab', { name: 'Ombor isrofi' }).click();
    const total = page.locator('main [data-kpi="total"] [data-kpi-value]');
    await expect(total).toBeVisible({ timeout: 15_000 });
    const items = page.locator('section[aria-labelledby="rep-wo-item"] li');
    let sum = 0;
    for (const li of await items.all()) sum += money(await li.locator('span').last().innerText());
    expect(sum).toBe(money(await total.innerText()));
});

/* BEMORLAR (2026-11-26): kelgan = yangi + qaytgan; «Eslatma yuborish»
   Xabarlarni o'sha «6 oydan beri kelmagan» ro'yxati bilan ochadi — son bir xil. */
test('Hisobot → Bemorlar: sonlar mos, eslatma Xabarlarda o\'sha ro\'yxatni ochadi', async ({ page }) => {
    await go(page, '/dashboard');
    await page.getByRole('tab', { name: 'Bemorlar' }).click();
    const kpi = (k: string) => page.locator(`main [data-kpi="${k}"] [data-kpi-value]`);
    await expect(kpi('visited')).toBeVisible({ timeout: 15_000 });
    const visited = money(await kpi('visited').innerText());
    const fresh = money(await kpi('new').innerText());
    const back = money(await kpi('returning').innerText());
    const lost = money(await kpi('lost').innerText());
    expect(visited).toBe(fresh + back);
    expect(fresh).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);

    const list = page.locator('section[aria-labelledby="rep-lost"]');
    await expect(list.locator('a[href^="tel:"]').first()).toBeVisible();

    await list.getByRole('link', { name: 'Eslatma yuborish' }).click();
    await expect(page).toHaveURL(/#\/messages\?audience=inactive6/);
    const total = page.locator('section[aria-labelledby="manual-what"]').getByText(/^\d+ bemor$/);
    await expect(total).toBeVisible({ timeout: 15_000 });
    expect(money(await total.innerText())).toBe(lost);
});

/* XIZMATLAR (2026-11-26): jami = Umumiy «Xizmatlar»; bo'lim tanlansa —
   Bo'limlar jadvalidagi o'sha bo'lim soni; Bo'limlarda bo'lim nomi bosilsa
   Xizmatlar shu bo'lim bilan ochiladi. */
test("Hisobot → Xizmatlar: jami Umumiy bilan, bo'lim Bo'limlar bilan bir xil", async ({ page }) => {
    await go(page, '/dashboard');
    const tile = page.locator('main [data-kpi="revenue"]');
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const summaryServices = money(await tile.locator('[data-kpi-value]').innerText());

    await page.getByRole('tab', { name: 'Xizmatlar' }).click();
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: "O'rtacha narx" })).toBeVisible({ timeout: 15_000 });
    const totalCell = table.locator('tfoot td').nth(2);
    /* Katakda summa ostida o'zgarish chipi ham bor — birinchi qator summa */
    expect(money((await totalCell.innerText()).split(/\n/)[0])).toBe(summaryServices);
    await expect(table.getByRole('columnheader', { name: 'Chegirma' })).toBeVisible();

    // Bo'limlar → Kardiologiya → Xizmatlar shu bo'lim bilan
    await page.getByRole('tab', { name: "Bo'limlar" }).click();
    const deptRow = page.getByRole('table').locator('tbody tr', { hasText: 'Kardiologiya' });
    await expect(deptRow).toBeVisible({ timeout: 15_000 });
    const deptServices = money(await deptRow.locator('td').nth(2).innerText());
    await deptRow.getByRole('button', { name: /Kardiologiya/ }).click();
    await expect(page.getByRole('tab', { name: 'Xizmatlar' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('group', { name: "Bo'lim" }).getByRole('button', { name: 'Kardiologiya' })).toHaveAttribute('aria-pressed', 'true');
    const deptTotal = page.getByRole('table').locator('tfoot td').nth(2);
    await expect(deptTotal).toBeVisible({ timeout: 15_000 });
    expect(money((await deptTotal.innerText()).split(/\n/)[0])).toBe(deptServices);
});
