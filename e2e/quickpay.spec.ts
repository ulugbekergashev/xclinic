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

    await page.getByRole('button', { name: /^To'lov qo'shish$/ }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    // ── Bemor ixtiyoriy: bo'lim «Bemorni ko'rsatish» ortida ────────────
    await modal.getByRole('button', { name: /Bemorni ko'rsatish/ }).click();
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
    await modal.getByRole('button', { name: /Bemorni ko'rsatish/ }).click();
    const search = modal.getByPlaceholder(/Ism, telefon yoki karta/);
    await expect(search).toBeVisible();
    await search.fill(surname);
    await expect(modal.getByRole('button', { name: new RegExp(surname) }).first()).toBeVisible({ timeout: 15_000 });
});

/* KLINIKA IKKINCHI MARTA SO'RAGANI: «Xizmat tanlanadi va to'lov qilinadi.
   Bemorning ma'lumotlari kerak emas». Oyna ochilgach IKKI bosish: xizmat va
   «To'lovni qabul qilish». Hech narsa yozilmaydi. */
test("bemorsiz: xizmat bosiladi, to'lov qabul qilinadi, chek chiqadi", async ({ page, request, baseURL }) => {
    test.setTimeout(120_000);
    await muteprint(page);
    await login(page);
    await go(page, '/reception');

    await page.getByRole('button', { name: /^To'lov qo'shish$/ }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    /* Bemor maydonlari ko'rinmaydi — ular faqat so'ralganda ochiladi */
    await expect(modal.getByPlaceholder('Familiya', { exact: true })).toHaveCount(0);
    await expect(modal.getByPlaceholder(/Ism, telefon yoki karta/)).toHaveCount(0);

    await modal.getByPlaceholder(/Xizmat nomini/).fill('konsultatsiya');
    await modal.getByRole('button', { name: /konsultatsiya/i }).first().click();
    await modal.getByRole('button', { name: /^To'lovni qabul qilish$/ }).click();
    await expect(modal.getByText("To'lov qabul qilindi")).toBeVisible({ timeout: 20_000 });

    const popupPromise = page.waitForEvent('popup');
    await modal.getByRole('button', { name: /^Chekni chiqarish$/ }).click();
    const receipt = await popupPromise;
    await expect(receipt.locator('body')).toContainText(/konsultatsiya/i);
    await expect(receipt.locator('body')).toContainText('Jami');
    await receipt.close();

    /* Pul kassaga tushgan: to'langan qatorlar orasida bemorsiz «Ismsiz» bor */
    const auth = await request.post(`${baseURL}/api/auth/login`, { data: { username: 'admin', password: PASSWORD } });
    const token = (await auth.json())?.token;
    const paid = await (await request.get(`${baseURL}/api/charges?status=Paid`, {
        headers: { Authorization: `Bearer ${token}` },
    })).json();
    const rows = Array.isArray(paid) ? paid : (paid?.charges || []);
    expect(rows.some((c: any) => c.patientName === 'Ismsiz' && !c.patientId), "bemorsiz to'langan qator").toBeTruthy();
});

test("xizmat belgilanmasa to'lov tugmasi o'chiq", async ({ page }) => {
    await login(page);
    await go(page, '/reception');
    await page.getByRole('button', { name: /^To'lov qo'shish$/ }).click();
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

        /* ── Chiqarish oynasi: summa SHU YERDA va shu yerda to'lanadi ───
           Klinika: «Bemorni chiqarganimda ham to'lov summasi chiqmayapti».
           Oyna ilgari faqat epikrizni so'rardi. */
        await page.getByRole('button', { name: /^Chiqarish$/ }).first().click();
        await expect(page.getByRole('heading', { name: 'Bemorni chiqarish' })).toBeVisible();
        const due = page.getByRole('region', { name: 'Statsionar hisobi' });
        await expect(due.getByText(/^180\s000 so'm$/)).toBeVisible({ timeout: 15_000 });
        await expect(due.getByText('Sistema')).toBeVisible();

        /* Kassadagi o'sha to'lov oynasi ochiladi (Moliya rejasi 9): qisman,
           bir necha usul, chek — hammasi shu yerda. Avval yarmi, keyin qolgani. */
        await due.getByRole('button', { name: /^To'lovni qabul qilish$/ }).click();
        let pay = page.getByRole('dialog', { name: new RegExp(`To'lov — .*${surname}`) });
        await expect(pay).toBeVisible();
        await pay.getByRole('button', { name: /^Yarmi$/ }).click();
        await pay.getByRole('button', { name: /^90\s000 qabul qilish$/ }).click();
        await expect(pay.getByText(/Qoldiq qarz: 90\s000/)).toBeVisible({ timeout: 20_000 });
        await pay.getByRole('button', { name: /^Yopish$/ }).last().click();
        await expect(due.getByText(/^90\s000 so'm$/)).toBeVisible({ timeout: 20_000 });

        await due.getByRole('button', { name: /^To'lovni qabul qilish$/ }).click();
        pay = page.getByRole('dialog', { name: new RegExp(`To'lov — .*${surname}`) });
        await pay.getByRole('button', { name: /^90\s000 qabul qilish$/ }).click();
        await pay.getByRole('button', { name: /^Yopish$/ }).last().click();
        await expect(due.getByText(/180\s000 so'm qabul qilindi/)).toBeVisible({ timeout: 20_000 });
        await expect(due.getByText(/^0 so'm$/)).toBeVisible();

        /* Pul serverda ham yozilgan: yotish hisobida qarz qolmagan */
        const after = await (await request.get(`${baseURL}/api/admissions/${admission.id}/billing`, { headers })).json();
        expect(Math.round(after.paid), "to'langan").toBe(180000);
        expect(Math.round(after.due), 'qarz').toBe(0);
    } finally {
        // Koyka va «faol yotish» keyingi sinovlarga qolmasin
        await request.post(`${baseURL}/api/admissions/${admission.id}/discharge`, { headers, data: { confirmDebt: true } });
    }
});
