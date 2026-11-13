/* NAMOYISH NUSXASIDA: SODDA TO'LOV VA STATSIONAR HISOB CHEKI.
 *
 * `e2e/quickpay.spec.ts` xuddi shu yo'llarni HAQIQIY server bilan yuradi.
 * Bu yerda — Vercel'dagi nusxa: serversiz, hamma narsa `services/api.ts`
 * ning demo tarmog'ida. O'sha tarmoq backendli sinovda umuman yurmaydi va
 * statsionar hisobi aynan shu yerda soxta edi: «to'langan = 60%» deb o'ylab
 * topilardi, qo'shilgan dori esa hisobda ham, chekda ham chiqmasdi.
 */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

/** Chek oynasi `window.print()` ni chaqiradi — sinovda bosma oynasi ochilmasin */
const mutePrint = (page: Page) =>
    page.context().addInitScript(() => { window.print = () => { /* sinov */ }; });

test('Demo: «Bugun» dan yangi bemorga to\'lov va chek', async ({ page }) => {
    await mutePrint(page);
    await go(page, '/reception');

    await page.getByRole('button', { name: /^To'lov qabul qilish$/ }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: /^Yangi bemor$/ }).click();
    await modal.getByPlaceholder('Familiya', { exact: true }).fill('Demoukol');
    await modal.getByPlaceholder('Ism', { exact: true }).fill('Sinov');
    await modal.getByRole('button', { name: /^Ayol$/ }).click();

    /* Birinchi xizmat tugmasi — demo prayslistidagi har qanday xizmat */
    await modal.getByRole('button', { name: /\d[\d\s]*$/ }).first().click();
    await modal.getByRole('button', { name: /^To'lovni qabul qilish$/ }).click();
    await expect(modal.getByText("To'lov qabul qilindi")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Demo rejimda saqlab bo'lmaydi/)).toHaveCount(0);

    const popup = page.waitForEvent('popup');
    await modal.getByRole('button', { name: /^Chekni chiqarish$/ }).click();
    const receipt = await popup;
    await expect(receipt.locator('body')).toContainText('Demoukol');
    await expect(receipt.locator('body')).toContainText('Jami');
});

test('Demo: statsionar hisobiga dori qo\'shiladi va chekda chiqadi', async ({ page }) => {
    await mutePrint(page);
    await go(page, '/inpatient?admission=demo-adm-1');
    await expect(page.getByRole('heading', { name: /Aziza Rahimova/ })).toBeVisible({ timeout: 20_000 });

    /* Koyka kunlari — haqiqiy qatorlar, «60% to'langan» emas */
    await expect(page.getByText(/Hisob qatorlari \(\d+\)/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/To'langan:\s*0/)).toBeVisible();

    await page.getByRole('button', { name: /^Hisobga qo'shish$/ }).click();
    await page.getByPlaceholder('Summa', { exact: true }).fill('150000');
    await page.getByRole('button', { name: /^Qo'shish$/ }).click();
    await expect(page.getByText(/Dorilar:\s*150 000/)).toBeVisible({ timeout: 10_000 });

    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /^Hisob cheki$/ }).click();
    const bill = await popup;
    const body = bill.locator('body');
    await expect(body).toContainText('Aziza Rahimova');
    await expect(body).toContainText('Koyka');
    await expect(body).toContainText('Dorilar');
    await expect(body).toContainText("To'lash kerak");
});
