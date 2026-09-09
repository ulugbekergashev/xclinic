/* PROTSEDURADAN OLDIN TO'LOV.
 *
 * Kassada ilgari «Avans to'ldirish» turardi: kassir summa kiritardi va pul
 * bemorning BALANSIGA tushardi — qanday xizmat uchun ekani noma'lum.
 * Shifokor ulushi hisoblanmasdi, hisobotda esa pul «Avans» degan qatorda
 * qolardi.
 *
 * Endi kassir XIZMATNI tanlaydi: qator shu yerda yaratilib darhol to'lanadi,
 * shifokor protsedurani keyin bajaradi.
 *
 * Sinov bemorni O'ZI yaratadi — bazadagi ma'lumotga bog'lanmaslik uchun.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test('kassir xizmat tanlab, protseduradan oldin to\'lovni qabul qiladi', async ({ page }) => {
    test.setTimeout(180_000);
    const n = uniq();
    const surname = `Oldin${n}`;
    await login(page);

    // ── Bemor ──────────────────────────────────────────────────────────
    await go(page, '/patients');
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Bemor qo'shish/ }).first().click();
    await page.waitForTimeout(800);
    await page.locator('input[name="lastName"]').fill(surname);
    await page.locator('input[name="firstName"]').fill('Sinov');
    await page.locator('input[name="phone"]').fill(`+99890${n.slice(0, 7)}`);
    await page.locator('input[name="dob"]').fill('1990-01-10');
    await page.getByRole('button', { name: /^Saqlash$/ }).click();
    await page.waitForTimeout(2500);

    // ── Kassa: to'lov oynasi ───────────────────────────────────────────
    await go(page, '/finance');
    await page.waitForTimeout(3000);
    /* Kassa sahifasi mingdan ortiq to'lov qatorini chizadi; tugmani
       topish ham shu hajmga bog'liq — shuning uchun uzoq kutish. */
    const openBtn = page.getByRole('button', { name: /To'lov qabul qilish/ }).first();
    await expect(openBtn).toBeVisible({ timeout: 30_000 });
    await openBtn.click();

    /* Bemor qidiruvi SERVERDA — javobni kutamiz, qat'iy pauza bilan emas. */
    /* Hamma qidiruv OYNA ICHIDA. Kassa sahifasi mingdan ortiq to'lov
       qatorini chizadi va butun sahifa bo'ylab qidirish o'sha hajmda
       ishonchsiz — sinov aynan shunda yiqilgan edi. */
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 15_000 });
    const patientBox = modal.getByPlaceholder(/Ism, telefon yoki karta/);
    await expect(patientBox).toBeVisible({ timeout: 10_000 });
    await patientBox.fill(surname);
    /* Nom bo'yicha — matn bo'yicha emas. Kassa sahifasi mingdan ortiq
       to'lov qatorini chizadi (yordamchi daraxt ~35 000 tugun), va butun
       DOM bo'ylab matn qidirish o'sha hajmda ishonchsiz. */
    const found = modal.getByRole('button', { name: new RegExp(surname) }).first();
    await expect(found).toBeVisible({ timeout: 15_000 });
    await found.click();

    // ── Xizmat tanlash ─────────────────────────────────────────────────
    const svcBox = modal.getByPlaceholder(/Xizmat nomini/);
    await expect(svcBox).toBeVisible({ timeout: 10_000 });
    await svcBox.fill('konsultatsiya');
    const svc = modal.getByRole('button', { name: /konsultatsiya/i }).first();
    await expect(svc).toBeVisible({ timeout: 10_000 });
    await svc.click();

    /* Tanlangan qator va jami ko'rinishi kerak */
    await expect(modal.getByText('Jami')).toBeVisible({ timeout: 10_000 });

    // ── To'lash ────────────────────────────────────────────────────────
    await modal.getByRole('button', { name: /^To'lovni qabul qilish$/ }).click();

    /* Oyna yopiladi — to'lov o'tgani shundan bilinadi. Xato bo'lsa oyna
       ochiq qoladi va matn ko'rinadi. */
    await expect(svcBox).toHaveCount(0, { timeout: 20_000 });

    /* Va pul kunlik ro'yxatda: bemor to'lovlar orasida turadi. Bu eng
       muhim tekshiruv — pul QATORGA bog'langan, balansda emas. */
    await page.reload();
    await expect(page.getByText(surname).first()).toBeVisible({ timeout: 30_000 });
});
