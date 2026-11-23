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
import { login, go, uniq, openVisitInCard } from './helpers';

/* Qabul bloklari (2026-11-21): ko'rik, tashxis, retsept, xizmatlar va
   yo'llanma — hammasi bir ekranda. Yo'llanma turlari (tahlil, diagnostika,
   boshqa shifokor) «+ Yo'llanma» oynasida. */
/* «Bugungi qabul» (2026-11-21, DentaCRM namunasida): bitta «+ Qo'shish» —
   oynada nima qo'shilishi tepada tanlanadi: Xizmat · Tahlil · Diagnostika ·
   Dori · Tashxis · Boshqa shifokor. */
const openAdd = async (p: any, kind: string) => {
    /* Tashxis va xizmatdan keyin oyna ochiq qoladi — qayta ochilmaydi */
    if (!(await p.getByRole('dialog').count())) await p.locator('section[aria-labelledby="visit-title"]').getByRole('button', { name: /^Qo'shish$/ }).click();
    await p.getByRole('dialog').getByRole('button', { name: new RegExp(`^${kind}$`) }).click();
};
const openReferral = (p: any) => openAdd(p, 'Tahlil');


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
    /* Qabul ochish: Bo'lim → Shifokor → «Qabul ochish — Dr. …» */
    await openVisitInCard(page);
    await page.waitForTimeout(2500);
    await expect(page.getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible();

    // ── 2. To'lanmagan xizmat ──────────────────────────────────────────
    await openReferral(page);
    await page.getByRole('button', { name: /^Diagnostika$/ }).click();
    await page.waitForTimeout(800);
    /* Prayslist tugma bo'lib turadi; prayslistda yo'q tekshiruv — «qo'lda yozish» orqali */
    const manualStudy = page.getByRole('button', { name: /qo'lda yozish/ });
    if (await manualStudy.isVisible()) await manualStudy.click();
    await page.getByPlaceholder(/Masalan: Qorin/).fill(`UZI ${n}`);
    await page.getByPlaceholder(/^Narx$/).fill('90000');
    await page.getByRole('button', { name: /^Diagnostikaga yuborish$/ }).click();
    await page.waitForTimeout(3000);

    /* ── 3. TESHIK 1: Registratura summani ko'rsatadimi? ─────────────
       Ilgari bu ekranda pul haqida bironta belgi yo'q edi. */
    await go(page, '/reception');
    await page.waitForTimeout(3500);
    await expect(page.getByText(/To'lovga/).first()).toBeVisible({ timeout: 15_000 });

    /* ── 4. Qabulni yakunlaymiz — qarz bilan ─────────────────────────
       Server 409 va sabablar ro'yxatini beradi; «baribir yopish» bilan
       o'tamiz. Aynan shundan keyin bemor ilgari yo'qolib qolardi. */
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
    const queue = page.locator('section[aria-labelledby="pay-queue-title"]');
    await expect(queue.getByText(/To'lov kutmoqda/).first()).toBeVisible({ timeout: 15_000 });
    const row = queue.locator('li', { hasText: surname }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    // Qabul yopilgan — navbatdagi qator shuni aytadi: bemor ketishidan oldin
    await expect(row).toContainText(/qabul yopildi/);
});
