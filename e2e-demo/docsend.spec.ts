/* NAMOYISH NUSXASIDA: RETSEPTNI BEMORNING TELEGRAMIGA YUBORISH (2026-11-26).
 *
 *   · Shifokor retsept yozadi; retsept qatorida printer yonida «Telegramga
 *     yuborish» — bir bosish, oyna yo'q. Yuborilgach belgi yashil bo'ladi.
 *   · Botga ulanmagan bemor — tugma xira, bosilsa nima qilish aytiladi.
 *   · Xabarlar → Sozlamalar: «natija tayyor bo'lganda o'zi yuborilsin».
 */
import { test, expect, Page } from '@playwright/test';
import { openVisitInCard } from '../e2e/helpers';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};
const sheet = (page: Page) => page.locator('section[aria-labelledby="visit-title"]');

const openSheet = async (page: Page, patientId: string) => {
    await go(page, `/patients/${patientId}`);
    await page.waitForTimeout(1500);
    if (await page.getByRole('button', { name: /^Qabul ochish/ }).count()) {
        await openVisitInCard(page);
        await page.waitForTimeout(2500);
    }
    await expect(sheet(page).getByRole('heading', { name: 'Tayinlovlar' })).toBeVisible({ timeout: 15_000 });
};

const writeRx = async (page: Page, drug: string) => {
    const s = sheet(page);
    await s.getByRole('button', { name: /^Dori$/ }).click();
    await s.getByLabel('Dori nomi').fill(drug);
    await s.getByRole('button', { name: /^Retseptni saqlash$/ }).click();
    await expect(page.getByText('Retsept yozildi').first()).toBeVisible({ timeout: 10_000 });
};

test('Demo: retsept bir bosishda bemorning Telegramiga ketadi', async ({ page }) => {
    await openSheet(page, 'demo-patient-1');
    await writeRx(page, 'Paratsetamol 500 mg');

    const s = sheet(page);
    const send = s.getByRole('button', { name: 'Telegramga yuborish' }).last();
    await expect(send).toBeVisible({ timeout: 10_000 });
    await send.click();
    await expect(page.getByText(/Bemorning Telegramiga yuborildi/).first()).toBeVisible({ timeout: 10_000 });
    /* Belgi «yuborilgan» ga aylanadi — qayta bosish mumkin, lekin ko'rinib turadi */
    await expect(s.getByRole('button', { name: /^Yuborilgan: / }).first()).toBeVisible({ timeout: 10_000 });
});

test("Demo: botga ulanmagan bemor — tugma to'smaydi, nima qilish aytiladi", async ({ page }) => {
    await openSheet(page, 'demo-patient-3');
    await writeRx(page, 'Vitamin C 500 mg');

    const s = sheet(page);
    const send = s.getByRole('button', { name: 'Bemor botga ulanmagan' }).last();
    await expect(send).toBeVisible({ timeout: 10_000 });
    await send.click();
    await expect(page.getByText(/Telefon raqamni yuborish/).first()).toBeVisible({ timeout: 10_000 });
    /* Chop etish avvalgidek turadi */
    await expect(s.getByRole('button', { name: 'Chop etish' }).last()).toBeVisible();
});

test("Demo: Xabarlar sozlamasida «natija o'zi yuborilsin» — dastlab o'chiq, yoqiladi", async ({ page }) => {
    await go(page, '/messages');
    await page.getByRole('tab', { name: /Sozlamalar/ }).or(page.getByRole('button', { name: /^Sozlamalar$/ })).first().click();
    const box = page.getByRole('checkbox', { name: /Tahlil natijasi tayyor bo'lganda/ });
    await expect(box).not.toBeChecked({ timeout: 10_000 });
    await box.check({ force: true });
    await expect(page.getByText('Saqlandi').first()).toBeVisible({ timeout: 10_000 });
    await expect(box).toBeChecked();
});
