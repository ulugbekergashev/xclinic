/* SODDA TO'LOV VA CHEK.
 *
 * Klinikadan kelgan shikoyat: «Ambulator ukolga kelgan bemorga chek chiqarish
 * murakkab: avval bemor ma'lumotlari, keyin to'lov qismidan xizmatlar, keyin
 * to'lov. Kompyuterni yaxshi bilmaydigan hamshiralar qiynalyapti». Ikkinchisi:
 * «Yotgan bemorga berilgan dorilar summasini kiritish va ketayotgan kuni
 * shularni chek qilib chiqarish».
 *
 * Ikki sinov shu ikki yo'lni BOSHIDAN OXIRIGACHA yuradi:
 *   · «Bugun» ekranidan chiqmasdan: yangi bemor + xizmat + to'lov + chek;
 *   · statsionar: hisobga qator qo'shish va hisob cheki.
 *
 * Chek — alohida oyna. Sinov uning ICHIDAGI matnni tekshiradi: bemor qo'liga
 * tushadigan qog'ozda ism, xizmat va summa bo'lishi kerak.
 */
import { test, expect, Page } from '@playwright/test';
import { login, go, uniq, PASSWORD } from './helpers';

/** Chek oynasi `window.print()` ni chaqiradi — sinovda bosma oynasi ochilmasin */
const muteprint = (page: Page) =>
    page.context().addInitScript(() => { window.print = () => { /* sinov */ }; });

test('«Bugun» ekranidan: yangi bemor, xizmat, to\'lov va chek', async ({ page }) => {
    test.setTimeout(120_000);
    const surname = `Ukol${uniq()}`;
    await muteprint(page);
    await login(page);
    await go(page, '/reception');

    await page.getByRole('button', { name: /^To'lov qabul qilish$/ }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // ── Yangi bemor — shu oynaning o'zida, uchta maydon ────────────────
    await modal.getByRole('button', { name: /^Yangi bemor$/ }).click();
    await modal.getByPlaceholder('Familiya', { exact: true }).fill(surname);
    await modal.getByPlaceholder('Ism', { exact: true }).fill('Sinov');
    await modal.getByRole('button', { name: /^Erkak$/ }).click();

    // ── Xizmat — tugmani bosish bilan; ikkinchi bosish miqdorni oshiradi ─
    await modal.getByPlaceholder(/Xizmat nomini/).fill('konsultatsiya');
    const tile = modal.getByRole('button', { name: /konsultatsiya/i }).first();
    await expect(tile).toBeVisible();
    await tile.click();
    await modal.getByRole('button', { name: /^Ko'paytirish/ }).click();
    await expect(modal.getByText('×2')).toBeVisible();
    await modal.getByRole('button', { name: /^Kamaytirish/ }).click();
    await expect(modal.getByText('×2')).toHaveCount(0);
    await expect(modal.getByText('Jami')).toBeVisible();

    // ── To'lov: oyna yopilmaydi, chek shu yerda ────────────────────────
    await modal.getByRole('button', { name: /^To'lovni qabul qilish$/ }).click();
    await expect(modal.getByText("To'lov qabul qilindi")).toBeVisible({ timeout: 20_000 });
    await expect(modal.getByText(surname)).toBeVisible();

    const popupPromise = page.waitForEvent('popup');
    await modal.getByRole('button', { name: /^Chekni chiqarish$/ }).click();
    const receipt = await popupPromise;
    await expect(receipt.locator('body')).toContainText(surname);
    await expect(receipt.locator('body')).toContainText(/konsultatsiya/i);
    await expect(receipt.locator('body')).toContainText('Jami');
    await receipt.close();

    // ── «Yana to'lov»: forma toza, yaratilgan bemor esa bazada ─────────
    await modal.getByRole('button', { name: /^Yana to'lov$/ }).click();
    const search = modal.getByPlaceholder(/Ism, telefon yoki karta/);
    await expect(search).toBeVisible();
    await search.fill(surname);
    await expect(modal.getByRole('button', { name: new RegExp(surname) }).first()).toBeVisible({ timeout: 15_000 });
});

test('bemor tanlanmasa va xizmat belgilanmasa to\'lov tugmasi o\'chiq', async ({ page }) => {
    await login(page);
    await go(page, '/reception');
    await page.getByRole('button', { name: /^To'lov qabul qilish$/ }).click();
    const modal = page.getByRole('dialog');

    await expect(modal.getByRole('button', { name: /^To'lovni qabul qilish$/ })).toBeDisabled();
});

test('statsionar: hisobga qator qo\'shiladi va hisob cheki chiqadi', async ({ page, request, baseURL }) => {
    test.setTimeout(120_000);
    const surname = `Yotgan${uniq()}`;

    /* Yotish API orqali tayyorlanadi: sinov hisob blokini tekshiradi,
       yotqizish formasini emas (u `inpatient.spec.ts` da). */
    const auth = await request.post(`${baseURL}/api/auth/login`, { data: { username: 'admin', password: PASSWORD } });
    const token = (await auth.json())?.token;
    const headers = { Authorization: `Bearer ${token}` };
    const patient = await (await request.post(`${baseURL}/api/patients`, {
        headers, data: { firstName: 'Sinov', lastName: surname, gender: 'Female', force: true },
    })).json();
    const admission = await (await request.post(`${baseURL}/api/admissions`, {
        headers, data: { patientId: patient.id, patientName: `${surname} Sinov`, dailyRate: 0 },
    })).json();
    expect(admission?.id, 'yotish yaratildi').toBeTruthy();

    try {
        await muteprint(page);
        await login(page);
        await go(page, `/inpatient?admission=${admission.id}`);
        await expect(page.getByRole('heading', { name: new RegExp(surname) })).toBeVisible({ timeout: 30_000 });

        // ── Qator: «Dorilar» turi tanlangan, faqat summa yoziladi ──────
        await page.getByRole('button', { name: /^Hisobga qo'shish$/ }).click();
        await page.getByPlaceholder('Summa', { exact: true }).fill('150000');
        await page.getByRole('button', { name: /^Qo'shish$/ }).click();
        await expect(page.getByText(/Hisob qatorlari \(1\)/)).toBeVisible({ timeout: 15_000 });

        // ── Ikkinchi qator — nomi bilan ────────────────────────────────
        await page.getByRole('button', { name: /^Hisobga qo'shish$/ }).click();
        await page.getByRole('button', { name: /^Muolaja$/ }).click();
        await page.getByLabel('Nomi', { exact: true }).fill('Sistema');
        await page.getByPlaceholder('Summa', { exact: true }).fill('30000');
        await page.getByRole('button', { name: /^Qo'shish$/ }).click();
        await expect(page.getByText(/Hisob qatorlari \(2\)/)).toBeVisible({ timeout: 15_000 });

        // ── Chek: ikkala qator va jami 180 000 ─────────────────────────
        const popupPromise = page.waitForEvent('popup');
        await page.getByRole('button', { name: /^Hisob cheki$/ }).click();
        const bill = await popupPromise;
        const body = bill.locator('body');
        await expect(body).toContainText(surname);
        await expect(body).toContainText('Dorilar');
        await expect(body).toContainText('Sistema');
        await expect(body).toContainText(/180\s000/);
        await bill.close();
    } finally {
        // Koyka va «faol yotish» keyingi sinovlarga qolmasin
        await request.post(`${baseURL}/api/admissions/${admission.id}/discharge`, { headers, data: { confirmDebt: true } });
    }
});
