/* OMBOR: POZITSIYANI TAHRIRLASH.
 *
 * Ilgari mahsulotni yaratgandan keyin unga TEGIB bo'lmasdi: `PUT` ni na
 * server, na `api.inventory` bilardi. Xato yozilgan nom bilan yashash
 * yoki mahsulotni O'CHIRIB, qaytadan yaratish kerak edi — harakatlar
 * tarixi bilan birga.
 *
 * QOLDIQ tahrirlanmaydi: u harakatlar yig'indisi (migratsiya 0028) va
 * faqat kirim, chiqim yoki inventarizatsiya orqali o'zgaradi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test('ombor: nomni tahrirlash mumkin, qoldiq tegilmaydi', async ({ page }) => {
    await login(page);
    await go(page, '/inventory');
    await page.waitForTimeout(3000);

    const editBtn = page.getByRole('button', { name: /^Tahrirlash$/ }).first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    await page.waitForTimeout(1200);

    /* Qoldiq maydoni oynada BO'LMASLIGI kerak — sabab ham yozilgan. */
    await expect(page.getByText(/Qoldiq bu yerda o'zgarmaydi/)).toBeVisible();

    const suffix = uniq().slice(0, 4);
    /* AYNAN oynadagi maydon: `input` ning birinchisi shapkadagi umumiy
       qidiruv bo'lib chiqadi va sinov nomni o'sha yerga yozib, hech
       narsa tekshirmay «o'tib» ketardi. */
    const nameInput = page.getByLabel('Nomi');
    const before = await nameInput.inputValue();
    await nameInput.fill(`${before.split(' [')[0]} [${suffix}]`);

    await page.getByRole('button', { name: /^Saqlash$/ }).last().click();
    await page.waitForTimeout(3000);

    await expect(page.getByText(`[${suffix}]`).first()).toBeVisible();
});
