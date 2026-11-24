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
import { login, go, uniq, openVisitInCard, addDiagnosis, orderStudy } from './helpers';


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
    /* Qabul ochish: Bo'lim → Shifokor → «Qabul ochish — Dr. …» */
    await openVisitInCard(page);
    await page.waitForTimeout(2500);
    await expect(page.getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible();

    // ── 3. Tashxis: qidiruv «Tashxis» blokining o'zida ─────────────────
    await addDiagnosis(page);

    // ── 4. Tekshiruvga yuborish — pul qatori yaratiladi ────────────────
    await orderStudy(page, `UZI ${n}`);

    /* Qarz DARHOL panelda ko'rinishi kerak: shifokor bemorni kassaga
       yuborishdan oldin summani biladi. */
    await expect(page.getByText(/so'm to'lanmagan/)).toBeVisible();

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
    {
        const startBtn = page.getByRole('button', { name: /^Qabulni boshlash$/ });
        const finishBtn = page.getByRole('button', { name: /Qabulni yakunlash/ });
        await expect(startBtn.or(finishBtn)).toBeVisible({ timeout: 15_000 });
        if (await startBtn.isVisible()) await startBtn.click();
        await expect(finishBtn).toBeVisible({ timeout: 15_000 });
    }

    await page.getByRole('button', { name: /Qabulni yakunlash/ }).click();

    /* Tashxis bor, faqat qarz qolgan — shifokorni TO'XTATMAYDI (2026-11-22):
       qabul yopiladi, qarz esa xabarda aytiladi. Qarz kassirning ishi. */
    await expect(page.getByText(/To'lanmagan/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Baribir yakunlash/ })).toHaveCount(0);
    await page.waitForTimeout(1500);

    await expect(page.getByText('Yakunlangan').first()).toBeVisible();
});
