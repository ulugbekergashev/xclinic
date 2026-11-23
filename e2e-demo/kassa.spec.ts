/* Kassa — Moliya rejasi (docs/superpowers/plans/2026-11-23-moliya.md).
   Har vazifaning demo sinovi shu yerda. */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

const mutePrint = (page: Page) =>
    page.context().addInitScript(() => { window.print = () => { /* sinov */ }; });

const queue = (page: Page) => page.locator('section[aria-labelledby="pay-queue-title"]');

/* 1-vazifa: kassir qarzdorni ism bilan topadi — bugungi navbatda ham,
   boshqa kunlardan qolgan qarzlarda ham. */
test('Kassa: ism bilan qidirsa — faqat o\'sha bemor qoladi', async ({ page }) => {
    await go(page, '/finance');
    const search = page.getByRole('searchbox', { name: 'Bemorni qidirish' });
    await expect(search).toBeVisible();
    await search.fill('xolmatov');
    await expect(queue(page).getByText('Rustam Xolmatov')).toBeVisible();
    await expect(queue(page).getByText('Malika Yusupova')).toHaveCount(0);
    await expect(queue(page).getByRole('button', { name: /^To'lash/ })).toHaveCount(1);

    // Topilmasa — tushunarli gap, bo'sh ro'yxat emas
    await search.fill('yoqbundayism');
    await expect(queue(page).getByText(/topilmadi/)).toBeVisible();
});

/* 2-vazifa: kun yopilishida «Rahbarga topshirildi». */
test('Kassa: kunni yopishda «Hammasini topshirdim» — kassada 0 qoladi', async ({ page }) => {
    await mutePrint(page);
    await go(page, '/finance');
    await page.getByRole('button', { name: /^Kunni yopish$/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(/sanalgan naqd/i).fill('20000');
    await dlg.getByRole('button', { name: /Hammasini topshirdim/ }).click();
    await expect(dlg.getByText(/Kassada qoladi: 0/)).toBeVisible();
    // Sanalganidan ko'p topshirib bo'lmaydi
    await dlg.getByLabel(/Rahbarga topshirildi/).fill('30000');
    await expect(dlg.getByText(/sanalgan puldan ko'p/i)).toBeVisible();
    await expect(dlg.getByRole('button', { name: /^Kunni yopish$/ })).toBeDisabled();
});
