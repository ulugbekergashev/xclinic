/* XABARLAR MODULI — menyuda va kanal sozlamasi ichida.
 *
 * IKKI KO'CHISH. Xabarlar menyudan olib tashlanib Sozlamalar ichiga
 * kiritilgan edi: «shablon oyiga bir-ikki marta kerak» degan hisob bilan.
 * Amalda u kundalik ish quroli bo'lib chiqdi — SMS balansi, yuborilgan
 * xabarlar tarixi, kanal sozlamasi. Endi u yana menyuda.
 *
 * Teskari yo'nalishda esa kanal sozlamasi («Faqat Telegram / Faqat SMS /
 * Ikkalasi ham») va Eskiz logini Sozlamalardan CHIQIB, shu modulga kirdi:
 * shablon yozayotgan odam xabar qaysi yo'l bilan ketishini shu yerda
 * bilishi kerak.
 *
 * NIMA TEKSHIRILADI:
 *   1. Menyuda «Xabarlar» bor;
 *   2. «Sozlamalar» vkladkasida kanal tanlovi va ESKIZ MAYDONLARI bor —
 *      Telegram rejimida ham (ilgari ular yashirin edi va foydalanuvchi
 *      «kiritadigan joy yo'q» deb o'ylardi);
 *   3. Bron to'lovi ham shu yerda;
 *   4. Sozlamalardan ular chiqib ketgan.
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Xabarlar moduli', () => {

    test('menyuda bor va ochiladi', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

        await login(page);
        await page.waitForTimeout(2000);
        await expect(page.getByRole('link', { name: 'Xabarlar' }).first()).toBeVisible({ timeout: 15000 });

        await go(page, '/messages');
        await page.waitForTimeout(2500);
        expect(errors, 'Xabarlar ekrani JS xatosisiz ochilishi kerak').toEqual([]);
    });

    test('Sozlamalar vkladkasida kanal va ESKIZ maydonlari bor', async ({ page }) => {
        await login(page);
        await go(page, '/messages');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await main.getByRole('button', { name: /^Sozlamalar$/ }).click();
        await page.waitForTimeout(2000);

        await expect(main).toContainText('Xabar yuborish kanali');
        await expect(main).toContainText('Faqat Telegram Bot');

        /* ENG MUHIMI: Eskiz maydonlari Telegram rejimida ham ko'rinadi.
           Ilgari ular faqat SMS tanlanganda chiqardi — ya'ni SMS ni
           oldindan ULASH mumkin emas edi. */
        await expect(main.getByLabel(/kabinet email/i)).toBeVisible();
        await expect(main).toContainText('Kabinet paroli');
    });

    test('bron to\'lovi ham shu yerda', async ({ page }) => {
        await login(page);
        await go(page, '/messages');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await main.getByRole('button', { name: /^Sozlamalar$/ }).click();
        await page.waitForTimeout(2000);
        await expect(main).toContainText("Bron uchun oldindan to'lov");
    });

    test('Sozlamalarda eski kartalar qolmagan', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(2500);

        const main = page.locator('main');
        await expect(main).not.toContainText('SMS va Xabar Yuborish Rejimi');
        await expect(main).not.toContainText("Oldindan To'lov (Bron uchun)");
    });

    /* DIZAYN (2026-11-25): tablar bitta qatorda, har kungi ish oldinda;
       sahifa «Avtomatik» da ochiladi; kanal holati tepada ko'rinadi. */
    test('tablar tartibi, sukut va kanal holati', async ({ page }) => {
        await login(page);
        await go(page, '/messages');
        const tabs = page.getByRole('group', { name: 'Xabarlar' }).getByRole('button');
        await expect(tabs).toHaveText([/Avtomatik/, /Qo'lda/, /Tarix/, /Shablonlar/, /^Sozlamalar$/], { timeout: 15000 });
        await expect(tabs.first()).toHaveAttribute('aria-pressed', 'true');

        // Kanal holati tepada; bosilsa Sozlamalar ochiladi va bot holati u yerda ham bor
        await page.locator('main').getByRole('button', { name: /^Telegram/ }).first().click();
        await expect(tabs.nth(4)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('main')).toContainText('Telegram bot');
    });

    /* VAQT HAMMA TRIGGER UCHUN SAQLANADI. Ilgari forma `hoursBefore` ni
       faqat «Qabuldan oldin» uchun yuborardi («48 soat keyin» jimgina 24
       bo'lib qolardi), server esa tahrirda «Darhol» (0) ni null qilardi. */
    test("qoida vaqti saqlanadi: «48 soat keyin» va «Darhol»", async ({ page }) => {
        await login(page);
        await go(page, '/messages');
        const tabs = page.getByRole('group', { name: 'Xabarlar' });
        const n = Date.now() % 1000000;
        const tplName = `E2E shablon ${n}`;
        const ruleName = `E2E qoida ${n}`;

        await tabs.getByRole('button', { name: /Shablonlar/ }).click();
        await page.getByRole('button', { name: /Yangi shablon/ }).click();
        await page.locator('#tpl-name').fill(tplName);
        await page.locator('#tpl-text').fill('Hurmatli {bemor_ismi}, rahmat!');
        await page.getByRole('button', { name: /^Saqlash$/ }).click();
        await expect(page.getByRole('heading', { name: tplName })).toBeVisible();

        await tabs.getByRole('button', { name: /Avtomatik/ }).click();
        await page.getByRole('button', { name: /Yangi qoida/ }).click();
        await page.locator('#rule-name').fill(ruleName);
        await page.locator('#rule-tpl').selectOption({ label: tplName });
        await page.locator('#rule-trigger').selectOption('after_appointment');
        await page.locator('#rule-offset').selectOption('48');
        await page.getByRole('button', { name: /^Saqlash$/ }).click();

        const row = () => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: ruleName }) });
        await expect(row()).toContainText('48 soat');

        await row().getByRole('button', { name: 'Tahrirlash' }).click();
        await expect(page.locator('#rule-offset')).toHaveValue('48');
        await page.locator('#rule-trigger').selectOption('payment_received');
        await page.locator('#rule-offset').selectOption('0');
        await page.getByRole('button', { name: /^Saqlash$/ }).click();
        await expect(row()).toContainText('Darhol');

        // Serverdan qayta o'qilganda ham «Darhol» — 0 null ga aylanmadi
        await page.reload();
        await expect(row()).toContainText('Darhol', { timeout: 15000 });
    });
});
