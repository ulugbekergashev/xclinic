/* NAMOYISH NUSXASIDA: SHIFOKORNING TEZ TUGMALARI.
 *
 * Qabul varag'ida shifokor ilgari har dori uchun to'rtta maydonni yozardi
 * va har tashxisni MKB-10 dan qaytadan qidirardi. Endi:
 *   · yozilgan dori «Oxirgi yozganlaringiz» ga tushadi va keyingi safar bir
 *     bosishda butun qatorni (nom, doza, mahal, kun) to'ldiradi;
 *   · mahal va kun tugma bilan tanlanadi;
 *   · qo'yilgan tashxis «Ko'p qo'yadiganlaringiz» ga tushadi;
 *   · xizmat ro'yxatdan emas, tugmadan qo'shiladi.
 *
 * Har sinov yangi brauzer kontekstida: `localStorage` bo'sh, demo ma'lumoti
 * boshlang'ich holatda.
 */
import { test, expect, Page } from '@playwright/test';

const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

/** Qabul varag'i (yoki uning o'rnidagi «Qabul ochish» formasi) */
const sheet = (page: Page) => page.locator('section[aria-labelledby="visit-title"]');

/** Bemorlar ro'yxatidagi n-chi bemorning qabul varag'ini ochadi */
const openVisitSheet = async (page: Page, row: number) => {
    await go(page, '/patients');
    await page.locator('tbody tr').nth(row).click();
    await page.waitForTimeout(2500);

    /* Bugun qabul yo'q bo'lsa — varaq o'rnida «Qabul ochish» formasi turadi.
       Bo'lim tanlovi AYNAN shu formadan olinadi: sahifadagi birinchi
       `select` — demo'ning rol almashtirgichi. */
    const openBtn = page.getByRole('button', { name: /^Qabul ochish$/ });
    if (await openBtn.count()) {
        await sheet(page).locator('select').first().selectOption({ index: 1 });
        await openBtn.click();
        await page.waitForTimeout(2500);
    }
    await expect(sheet(page).getByRole('button', { name: /^dori$/ })).toBeVisible({ timeout: 15_000 });
};

test('Demo: yozilgan dori keyingi safar bir bosishda butun qatorni to\'ldiradi', async ({ page }) => {
    await openVisitSheet(page, 1);
    const s = sheet(page);

    // ── 1. Birinchi marta: nom va doza yoziladi, mahal va kun — tugma ──
    await s.getByRole('button', { name: /^dori$/ }).click();
    await s.getByLabel('Dori nomi').fill('Paratsetamol');
    await s.getByLabel('Doza').fill('500 mg');
    await s.getByRole('button', { name: '2×' }).click();
    await s.getByRole('button', { name: /^5 kun$/ }).click();
    await expect(s.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true');
    await s.getByRole('button', { name: /^Retseptni saqlash$/ }).click();

    await expect(page.getByText('Retsept yozildi').first()).toBeVisible({ timeout: 10_000 });
    await expect(s.getByText('Kuniga 2 mahal').first()).toBeVisible();

    // ── 2. Ikkinchi marta: tugma bilan — klaviaturasiz ─────────────────
    await s.getByRole('button', { name: /^dori$/ }).click();
    await expect(s.getByText(/Oxirgi yozganlaringiz/)).toBeVisible();
    await s.getByRole('button', { name: /Paratsetamol/ }).click();

    await expect(s.getByLabel('Dori nomi')).toHaveValue('Paratsetamol');
    await expect(s.getByLabel('Doza')).toHaveValue('500 mg');
    await expect(s.getByLabel('Necha mahal')).toHaveValue('Kuniga 2 mahal');
    await expect(s.getByRole('spinbutton', { name: 'kun' })).toHaveValue('5');
});

test('Demo: qo\'yilgan tashxis qidirmasdan bir bosishda qayta qo\'yiladi', async ({ page }) => {
    await openVisitSheet(page, 2);
    const s = sheet(page);

    // Birinchi marta — MKB-10 qidiruvidan. Qabulda tashxis bo'lsa qidiruv yopiq turadi.
    const search = s.getByPlaceholder(/Kod yoki kasallik nomi/);
    if (!(await search.isVisible())) await s.getByRole('button', { name: /^tashxis$/ }).click();
    await search.fill('gipert');
    await page.waitForTimeout(1200);
    await s.locator('button', { hasText: /^I10/ }).first().click();
    await expect(page.getByText("Tashxis qo'shildi").first()).toBeVisible({ timeout: 10_000 });

    // Olib tashlanadi — qidiruv qutisi yana ochiladi
    await s.getByRole('button', { name: "O'chirish: I10" }).click();
    await page.getByRole('button', { name: /^O'chirish$/ }).last().click();
    await expect(page.getByText("Tashxis o'chirildi").first()).toBeVisible({ timeout: 10_000 });

    // Endi qidiruvsiz: «Ko'p qo'yadiganlaringiz» dagi tugma
    const quick = s.getByText("Ko'p qo'yadiganlaringiz");
    if (!(await quick.isVisible())) await s.getByRole('button', { name: /^tashxis$/ }).click();
    await expect(quick).toBeVisible();
    await s.getByRole('button', { name: /I10/ }).first().click();
    await expect(s.getByRole('button', { name: "O'chirish: I10" })).toBeVisible({ timeout: 10_000 });
});

test('Demo: xizmat ro\'yxatdan emas, tugmadan qo\'shiladi', async ({ page }) => {
    await openVisitSheet(page, 3);
    const s = sheet(page);

    await s.getByRole('button', { name: /^xizmat$/ }).click();
    const box = s.getByRole('group', { name: "Xizmat qo'shish" });
    await expect(box).toBeVisible();
    await expect(box.locator('select')).toHaveCount(0);

    /* Prayslist tugmasi — nomi va narxi bilan */
    const tile = box.getByRole('button', { name: /so'm$/ }).first();
    await expect(tile, "demo prayslistida shu bo'lim uchun xizmat bo'lishi kerak").toBeVisible();
    await tile.click();
    await expect(page.getByText("Xizmat qo'shildi").first()).toBeVisible({ timeout: 10_000 });
});
