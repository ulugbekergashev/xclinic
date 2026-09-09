/* QABUL SAHNASI — BOSHIDAN OXIRIGACHA.
 *
 * Reja (PLAN-WORKFLOW.md, 7-bo'lim) dagi birinchi qabul stsenariysi:
 * bemor keldi → qabul ochildi → tashxis → tekshiruvga yuborildi →
 * qarz kassaga ko'rindi → qabul yakunlandi.
 *
 * Bu sinov alohida modullarni emas, ULARNING BOG'LANISHINI tekshiradi:
 * har bo'g'in o'z sinovida yashil turgan holda zanjir uzilishi mumkin,
 * va aynan shu klinikadagi namoyishda sezilgan edi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test('bemor keldi → tashxis → UZI → qarz kassada → yakunlandi', async ({ page }) => {
    test.setTimeout(120_000);
    const n = uniq();
    const surname = `Sahna${n}`;
    await login(page);

    // ── 1. Bemor yaratiladi ────────────────────────────────────────────
    await go(page, '/patients');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Bemor qo'shish/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('input[name="lastName"]').fill(surname);
    await page.locator('input[name="firstName"]').fill('Sinov');
    await page.locator('input[name="phone"]').fill(`+99890${n.slice(0, 7)}`);
    await page.locator('input[name="dob"]').fill('1980-06-15');
    await page.getByRole('button', { name: /^Saqlash$/ }).click();
    await page.waitForTimeout(2500);

    // ── 2. Kartasi ochiladi va qabul boshlanadi ────────────────────────
    await page.getByText(surname).first().click();
    await page.waitForTimeout(2500);
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
    await page.waitForTimeout(2500);
    await expect(page.getByText('Joriy qabul')).toBeVisible();

    // ── 3. Tashxis ─────────────────────────────────────────────────────
    await page.getByPlaceholder(/Kod yoki kasallik nomi/).fill('gipert');
    await page.waitForTimeout(1500);
    await page.locator('button', { hasText: /^I1\d/ }).first().click();
    await page.waitForTimeout(2000);

    // ── 4. Tekshiruvga yuborish — pul qatori yaratiladi ────────────────
    await page.getByRole('button', { name: /^Diagnostikaga$/ }).click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder(/Masalan: Qorin/).fill(`UZI ${n}`);
    await page.getByPlaceholder(/^Narx$/).fill('90000');
    await page.getByRole('button', { name: /^Diagnostikaga yuborish$/ }).click();
    await page.waitForTimeout(3000);

    /* Qarz DARHOL panelda ko'rinishi kerak: shifokor bemorni kassaga
       yuborishdan oldin summani biladi. */
    await expect(page.getByText(/to'lanmagan — bemorni kassaga/)).toBeVisible();

    // ── 5. O'SHA qarz kassada ham ko'rinadi ────────────────────────────
    /* Kassa endi qatorlar sonini cheklaydi (50 ta), shuning uchun sahifa
       ma'lumot hajmidan qat'i nazar tez ochiladi — uzun kutish kerak emas. */
    await go(page, '/finance');
    await expect(page.getByText(surname).first()).toBeVisible({ timeout: 15_000 });

    // ── 6. Qabulni yakunlash — qarz sababli ogohlantirish ──────────────
    await go(page, '/patients');
    await page.waitForTimeout(2000);
    await page.getByText(surname).first().click();
    await page.waitForTimeout(3000);

    await page.getByRole('button', { name: /Qabulni yakunlash/ }).click();

    /* Server qarzni ko'rib 409 qaytaradi va sabab ro'yxati chiqadi —
       TAQIQ EMAS, TANLOV. Oyna SERVER JAVOBIDAN keyin chiqadi, shuning
       uchun qat'iy kutish emas — elementning o'zini kutamiz. */
    await expect(page.getByText(/to'liq emas|To'lanmagan/i).first())
        .toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Baribir yakunlash/ }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByText('Yakunlangan').first()).toBeVisible();
});
