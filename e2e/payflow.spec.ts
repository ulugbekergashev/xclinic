/* PUL YO'LI: xizmat → «Bugun» → kassa.
 *
 * PLAN-PAYMENTS, 1 va 2-bosqichlar. Ikkita teshik yopilgani tekshiriladi:
 *
 *   1. «Bugun» ekrani pulni UMUMAN ko'rsatmasdi. Registrator kun bo'yi shu
 *      yerda o'tiradi, lekin kim to'lashi kerakligini bilmasdi.
 *
 *   2. Qabul yopilishi bilan bemor kassaning ro'yxatidan YO'QOLARDI —
 *      to'lamagan bo'lsa ham. U butun klinikaning qarzdorlari orasiga
 *      tushardi, kassir esa hech qanday signal olmasdi.
 *
 * Sinov holatni O'ZI yaratadi: bazada bugunga to'lanmagan hisob bo'lishiga
 * umid qilmaydi. Aks holda u ma'lumotga qarab goh o'tib, goh yiqilardi —
 * `scenario.spec.ts` bilan aynan shunday bo'lgan.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test('to\'lanmagan bemor «Bugun» da ham, kassada ham ko\'rinadi', async ({ page }) => {
    test.setTimeout(120_000);
    const n = uniq();
    const surname = `Tolov${n}`;
    await login(page);

    // ── 1. Bemor va qabul ──────────────────────────────────────────────
    await go(page, '/patients');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Bemor qo'shish/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('input[name="lastName"]').fill(surname);
    await page.locator('input[name="firstName"]').fill('Sinov');
    await page.locator('input[name="phone"]').fill(`+99890${n.slice(0, 7)}`);
    await page.locator('input[name="dob"]').fill('1985-03-20');
    await page.getByRole('button', { name: /^Saqlash$/ }).click();
    await page.waitForTimeout(2500);

    await page.getByText(surname).first().click();
    await page.waitForTimeout(2500);
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
    await page.waitForTimeout(2500);
    await expect(page.getByText('Joriy qabul')).toBeVisible();

    // ── 2. To'lanmagan xizmat ──────────────────────────────────────────
    await page.getByRole('button', { name: /^Diagnostikaga$/ }).click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder(/Masalan: Qorin/).fill(`UZI ${n}`);
    await page.getByPlaceholder(/^Narx$/).fill('90000');
    await page.getByRole('button', { name: /^Diagnostikaga yuborish$/ }).click();
    await page.waitForTimeout(3000);

    /* ── 3. TESHIK 1: «Bugun» summani ko'rsatadimi? ──────────────────
       Ilgari bu ekranda pul haqida bironta belgi yo'q edi. */
    await go(page, '/today');
    await page.waitForTimeout(3500);
    await expect(page.getByText(/To'lovga/).first()).toBeVisible({ timeout: 15_000 });

    /* ── 4. Qabulni yakunlaymiz — qarz bilan ─────────────────────────
       Server 409 va sabablar ro'yxatini beradi; «baribir yopish» bilan
       o'tamiz. Aynan shundan keyin bemor ilgari yo'qolib qolardi. */
    await go(page, '/patients');
    await page.waitForTimeout(2000);
    await page.getByText(surname).first().click();
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /Qabulni yakunlash/ }).click();

    /* QAT'IY KUTISH EMAS, ELEMENTNI KUTISH.

       Bu yerda `waitForTimeout(1500)` turgan edi va sinov beqaror
       yiqilardi: qarz bo'lgani uchun server 409 va sabablar ro'yxatini
       qaytaradi, oyna esa shu javobdan keyin chiqadi. Sekinroq yurishda
       1500ms yetmasdi — `count()` nol berardi, «Baribir yakunlash»
       bosilmasdi va qabul OCHIQ qolardi. Keyin sinov kassada
       «To'lov kutmoqda» ni qidirib topolmasdi va sabab butunlay
       boshqa joyda ko'rinardi. */
    const dialog = page.getByText("Qabul to'liq emas");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Baribir yakunlash/i }).first().click();
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });

    /* ── 5. TESHIK 2: kassada QOLDIMI? ───────────────────────────────
       Qabul yopilgan, pul olinmagan — bemor «To'lov kutmoqda» guruhida
       turishi kerak. Ilgari u ro'yxatdan butunlay tushib qolardi. */
    await go(page, '/finance');
    await page.waitForTimeout(3500);
    await expect(page.getByText(/To'lov kutmoqda/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(surname).first()).toBeVisible({ timeout: 10_000 });
});
