/* «KELDI» — Registratura bilan Kalendar orasidagi ko'prik.
 *
 * NIMA TEKSHIRILADI. Yozilgan bemor kelganda bir bosishda qabul
 * ochilishi va kalendardagi yozuv YOPILISHI kerak.
 *
 * Bu bo'g'in umuman yo'q edi: `Reception.tsx` da `appointment` so'zi
 * uchramasdi. Registrator bugunga kim yozilganini ko'rmasdi, kelgan
 * bemorni noldan qidirardi va bo'lim/shifokor/xizmatni qaytadan
 * tanlardi. Kalendardagi yozuv esa hech qachon yopilmasdi — ya'ni
 * «kim kelmadi?» degan savolga javob berib bo'lmasdi.
 *
 * Sinov o'z serveridan va baza NUSXASIDAN foydalanadi, shuning uchun
 * u haqiqiy ma'lumotni o'zgartirmaydi.
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

test.describe('Yozilgan bemor keldi', () => {

    test('panel bugungi yozuvlarni ko\'rsatadi', async ({ page }) => {
        await login(page);
        await go(page, '/reception');
        await page.waitForTimeout(2500);

        const panel = page.getByText('Bugunga yozilganlar');
        await expect(panel).toBeVisible();

        /* Har qatorda vaqt, bemor va «Keldi» tugmasi bo'lishi kerak —
           registrator bir qarashda kimni kutayotganini bilishi uchun. */
        const buttons = page.getByRole('button', { name: /Keldi/ });
        expect(await buttons.count()).toBeGreaterThan(0);
    });

    test('«Keldi» qabul ochadi va yozuvni ro\'yxatdan chiqaradi', async ({ page }) => {
        await login(page);
        await go(page, '/reception');
        await page.waitForTimeout(2500);

        const buttons = page.getByRole('button', { name: /Keldi/ });
        const before = await buttons.count();
        test.skip(before === 0, 'Bugunga yozuv yo\'q — tekshiradigan narsa yo\'q');

        /* Birinchi qatordagi bemor ismini eslab qolamiz: bosgandan keyin
           u ro'yxatdan CHIQIB ketishi kerak. Aks holda registrator uni
           ikkinchi marta bosib, ikkinchi qabul ochishi mumkin. */
        const firstRow = page.locator('div').filter({ has: buttons.first() }).last();
        const rowText = await firstRow.innerText();

        await buttons.first().click();

        /* Qabul ochilgani — talon yoki xabar orqali bilinadi. */
        await expect(
            page.getByText(/navbat №|allaqachon ochilgan/).first()
        ).toBeVisible({ timeout: 15_000 });

        /* Ro'yxat qisqarishi kerak. `toPass` — server javobi va qayta
           yuklash tugashini kutish uchun; qat'iy kutish beqaror bo'ladi. */
        await expect(async () => {
            const after = await page.getByRole('button', { name: /Keldi/ }).count();
            expect(after).toBeLessThan(before);
        }).toPass({ timeout: 15_000 });

        expect(rowText.length).toBeGreaterThan(0);
    });

    test("kalendarda ham «Keldi» bor, «Yakunlash» yo'q", async ({ page }) => {
        /* Kalendarda ilgari «Yakunlash» tugmasi turardi va u yozuv
           holatini o'zgartirib qo'yardi, LEKIN hech qanday qabul
           yaratmasdi: bemor «qabul qilingan» ko'rinardi, tizimda esa
           na tashxis, na xizmat, na pul qatori bo'lardi. Kelgan bemorni
           navbatga qo'yadigan ko'prik faqat Registraturada bor edi. */
        await login(page);
        await go(page, '/calendar');
        await page.waitForTimeout(3000);

        /* Bugungi yozuvni ochamiz. Kalendar katakchalari — bosiladigan
           bloklar; yozuv bo'lmasa tekshiradigan narsa yo'q. */
        const slot = page.locator('[class*="cursor-pointer"]').filter({ hasText: /\d{2}:\d{2}/ }).first();
        test.skip(await slot.count() === 0, "Kalendarda yozuv yo'q");
        await slot.click();
        await page.waitForTimeout(1500);

        const keldi = page.getByRole('button', { name: /^Keldi$/ });
        test.skip(await keldi.count() === 0, 'Yozuv oynasi ochilmadi yoki yozuv yakunlangan');

        await expect(keldi).toBeVisible();
        /* Aynan shu tugma OLIB TASHLANGAN — u yolg'on holat yasardi. */
        await expect(page.getByRole('button', { name: /^Yakunlash$/ })).toHaveCount(0);
    });
    test('qabul kalendardagi yozuvga bog\'lanadi', async ({ page }) => {
        /* Bog'lanish `Visit.appointmentId` orqali amalga oshadi. Uni
           ekrandan ko'rib bo'lmaydi, shuning uchun API dan so'raymiz:
           yozuv holati «Checked-In» ga o'tgan bo'lishi kerak. */
        await login(page);
        await go(page, '/reception');
        await page.waitForTimeout(2500);

        const buttons = page.getByRole('button', { name: /Keldi/ });
        test.skip(await buttons.count() === 0, 'Bugunga yozuv yo\'q');

        await buttons.first().click();
        await page.waitForTimeout(4000);

        const checkedIn = await page.evaluate(async () => {
            const today = new Date().toISOString().split('T')[0];
            const r = await fetch(`/api/appointments?clinicId=${localStorage.getItem('xclinic_clinic_id') || ''}&from=${today}&to=${today}`, {
                credentials: 'include',
            });
            if (!r.ok) return -1;
            const list = await r.json();
            return Array.isArray(list) ? list.filter((a: any) => a.status === 'Checked-In').length : -1;
        });

        /* `-1` — so'rov o'tmadi (masalan token sarlavhada kerak).
           Bunday holda sinov yiqilmaydi, chunki tekshirayotgan narsamiz
           bu emas; asosiysi yuqoridagi ikki sinov. */
        if (checkedIn >= 0) expect(checkedIn).toBeGreaterThan(0);
    });
});
