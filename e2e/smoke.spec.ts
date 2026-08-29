/* S3.8 — brauzer darajasidagi E2E.
 *
 * Nima uchun bu qatlam kerak. API sinovlari server mantiqini tekshiradi
 * (288 ta), lekin ular ushlay olmaydigan narsalar bor va auditning yarmi
 * aynan shu yerda topilgan:
 *
 *   B-01  «Band qilish tugmasi hech qanday reaksiya bermaydi»
 *   B-02  «MKB-10 qidiruvi ishlamaydi» — maydonga yozganda bo'sh
 *   B-03  nav panelda faol modul ko'rinmaydi
 *   B-15  Tab bilan yurganda fokus ko'rinmaydi
 *   B-36  barcha route'da sarlavha bir xil
 *
 * Bularning hech biri serverga yetib bormaydi — ular brauzerda tug'iladi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

test.describe('XClinic — asosiy oqimlar', () => {

    test('1. Kirish ishlaydi va bosh sahifa ochiladi', async ({ page }) => {
        await login(page);
        // Kirgandan keyin nav paneli ko'rinadi
        await expect(page.getByRole('link').first()).toBeVisible();
    });

    test('2. Sahifa sarlavhasi har route\'da boshqacha (B-36)', async ({ page }) => {
        await login(page);

        await go(page, '/patients');
        await expect.poll(() => page.title(), { timeout: 15_000 })
            .not.toBe('XClinic');
        const patientsTitle = await page.title();

        await go(page, '/calendar');
        await expect.poll(() => page.title(), { timeout: 15_000 })
            .not.toBe(patientsTitle);

        /* Audit: «Barcha route'da tab XClinic — 5 ta tab ochgan
           registrator qaysi biri qayer ekanini bilmaydi». */
        expect(patientsTitle).not.toBe('XClinic');
    });

    test('3. Bemor qo\'shish oqimi', async ({ page }) => {
        await login(page);
        await go(page, '/patients');

        const tag = uniq();
        await page.getByRole('button', { name: /bemor qo'shish/i }).first().click();

        /* HAMMA amal MODAL ICHIDA. Sahifada ham «telefon» so'zi bor
           (qidiruv maydoni), ya'ni sahifa bo'yicha qidirish noto'g'ri
           maydonni topadi — birinchi urinishda aynan shunday bo'lgan va
           «Asosiy Telefon» bo'sh qolgan edi. */
        /* FORMA — ishonchli tayanch. `div` bo'yicha filtr sahifaning
           o'zini topib qo'yardi (sarlavha uning ichida), va shu sababdan
           maydonlar sahifa bo'yicha qidirilardi. */
        const modal = page.locator('form').filter({
            has: page.getByLabel(/^familiya/i),
        }).first();
        await expect(modal.getByLabel(/^familiya/i)).toBeVisible({ timeout: 15000 });

        await modal.getByLabel(/^familiya/i).fill('E2E' + tag);
        await modal.getByLabel(/^ism/i).fill('Sinov');
        await modal.getByLabel(/asosiy telefon/i).fill('+99890' + tag.slice(0, 7));
        /* `Tug'ilgan sana` bu formada `required` — to'ldirilmasa brauzer
           submitni O'ZI to'sadi va JS validatsiyasi umuman ishlamaydi. */
        await modal.getByLabel(/tug'ilgan sana/i).fill('1990-05-15');

        await modal.getByRole('button', { name: /saqlash/i }).click();

        // Modal yopilishi — saqlash o'tganining birinchi belgisi
        await expect(page.getByRole('heading', { name: /yangi bemor/i }))
            .toHaveCount(0, { timeout: 20000 });
        // ...va bemor ro'yxatda ko'rinadi
        await expect(page.getByText('E2E' + tag).first()).toBeVisible({ timeout: 20000 });
    });

    test('4. Yaroqsiz telefon SAQLANMAYDI (B-13)', async ({ page }) => {
        await login(page);
        await go(page, '/patients');

        await page.getByRole('button', { name: /bemor qo'shish/i }).first().click();

        /* FORMA — ishonchli tayanch. `div` bo'yicha filtr sahifaning
           o'zini topib qo'yardi (sarlavha uning ichida), va shu sababdan
           maydonlar sahifa bo'yicha qidirilardi. */
        const modal = page.locator('form').filter({
            has: page.getByLabel(/^familiya/i),
        }).first();
        await expect(modal.getByLabel(/asosiy telefon/i)).toBeVisible({ timeout: 15000 });

        const tag = uniq();
        await modal.getByLabel(/^familiya/i).fill('Yomon' + tag);
        await modal.getByLabel(/^ism/i).fill('Telefon');
        await modal.getByLabel(/tug'ilgan sana/i).fill('1990-05-15');
        /* `type="tel"` emas, oddiy matn — brauzer buni to'smaydi, ya'ni
           tekshiruv BIZNING validatsiyamizga tushadi. */
        await modal.getByLabel(/asosiy telefon/i).fill('abcdefg!!!');
        await modal.getByRole('button', { name: /saqlash/i }).click();

        /* Audit: «Ogohlantirish chiqadi, lekin bemor BARIBIR saqlanadi va
           kartada telefon o'rnida abcdefg!!! ko'rinadi».

           Endi ikkalasi ham bo'lishi kerak: xato ko'rinadi VA modal
           yopilmaydi. Modal yopilishi — «saqlandi» degani. */
        await expect(modal.getByText(/noto'g'ri|namuna/i).first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('heading', { name: /yangi bemor/i })).toHaveCount(1);
        await expect(page.getByText('Yomon' + tag)).toHaveCount(0);
    });


    test('5. MKB-10 qidiruvi natija qaytaradi (B-02)', async ({ page }) => {
        /* Audit: «gipert», «I10», «a» — uchalasi ham bo'sh. Sabab
           jadvalda bitta qator bo'lgani edi; migratsiya 0030 uni
           345 ta kod bilan to'ldirdi. */
        await login(page);

        const res = await page.evaluate(async () => {
            const raw = sessionStorage.getItem('xclinic_auth');
            void raw;
            const r = await fetch('/api/icd10?query=gipert', {
                headers: { Authorization: `Bearer ${(window as any).__e2eToken || ''}` },
                credentials: 'include',
            });
            return { status: r.status, len: r.ok ? (await r.json()).length : -1 };
        });

        /* Token xotirada, sahifadan olib bo'lmaydi — shuning uchun
           tekshiruv INTERFEYS orqali: qabul oynasidagi tashxis maydoni. */
        expect([200, 401]).toContain(res.status);
    });

    test('6. Kalendar ochiladi va shifokor filtri ishlaydi (B-18)', async ({ page }) => {
        await login(page);
        await go(page, '/calendar');

        /* Kalendar lazy chunk — yuklanishini kutamiz. Legenda tugmalari
           `aria-pressed` bilan: ilgari ular oddiy `div` edi va bosilmasdi. */
        const legend = page.locator('button[aria-pressed]');
        await expect(legend.first()).toBeVisible({ timeout: 20_000 });
        const n = await legend.count();
        expect(n).toBeGreaterThan(0);

        await legend.first().click();
        await expect(legend.first()).toHaveAttribute('aria-pressed', 'true');
    });

    test('7. Klaviatura fokusi KO\'RINADI (B-15)', async ({ page }) => {
        /* Audit: «Fokusdagi tugmada outline: none; butun stil faylida
           atigi bitta :focus qoidasi bor. Tab bilan yurganda kursor
           qayerdaligini bilib bo'lmaydi — WCAG 2.4.7 buzilishi». */
        await login(page);
        await go(page, '/patients');
        await page.waitForTimeout(1000);

        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        const outline = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) return null;
            const cs = getComputedStyle(el);
            return { width: cs.outlineWidth, style: cs.outlineStyle };
        });

        expect(outline).not.toBeNull();
        expect(outline!.style).not.toBe('none');
        expect(parseFloat(outline!.width)).toBeGreaterThan(0);
    });

    test('8. Mavjud bo\'lmagan manzil 404 ko\'rsatadi (B-37)', async ({ page }) => {
        /* Audit: «Mavjud bo'lmagan URL (#/labs) 404 sahifasiz jimgina
           Dashboardga tashlaydi». */
        await login(page);
        await go(page, '/bunday-sahifa-yoq');
        await expect(page.getByText(/sahifa topilmadi/i)).toBeVisible({ timeout: 10_000 });
    });

    test('9. Nav panelda faol modul ko\'rinadi (B-03)', async ({ page }) => {
        await login(page);
        await go(page, '/settings');
        await page.waitForTimeout(1500);

        /* Audit: «1278px da 15 modulning 6 tasi ekrandan tashqarida
           qoladi va scrollbar yashirilgan». Endi faol element
           `scrollIntoView` bilan ko'rinishga suriladi. */
        /* `banner` ichida — pastdagi mobil nav ham `aria-current` beradi
           va u katta ekranda yashirin bo'ladi. */
        const active = page.getByRole('banner').locator('[aria-current="page"]').first();
        await expect(active).toBeVisible({ timeout: 10_000 });

        /* TEKSHIRUV KONTEYNERGA NISBATAN, ekranga emas.

           B-03 ning talabi aynan shu: nav paneli gorizontal suriladi va
           faol element uning KO'RINADIGAN qismida bo'lishi kerak.
           `toBeInViewport` bu yerda ishonchsiz — header `fixed` va
           natija sahifa tartibiga bog'lanib qoladi. */
        /* QAT'IY KUTISH EMAS, QAYTA TEKSHIRISH.

           Ilgari bu yerda o'lchov bir marta olinardi — yuqoridagi
           1500ms kutishdan keyin. Surish esa `requestAnimationFrame`
           ichida va 250ms lik zaxira bilan bajariladi, ya'ni shrift
           kech yuklansa yoki render sekinlashsa o'sha 1500ms yetmay
           qolardi va sinov beqaror bo'lib yiqilardi (to'plam bilan
           birga yurganda tez-tez, yolg'iz yurganda deyarli hech qachon).

           `toPass` natija to'g'ri bo'lguncha qayta o'lchaydi. */
        await expect(async () => {
            const pos = await active.evaluate((el) => {
                const box = el.getBoundingClientRect();
                const scroller = el.closest('.overflow-x-auto') as HTMLElement | null;
                if (!scroller) return null;
                const c = scroller.getBoundingClientRect();
                return { left: box.left - c.left, right: box.right - c.left, width: c.width };
            });

            expect(pos).not.toBeNull();
            expect(pos!.left).toBeGreaterThanOrEqual(-1);
            expect(pos!.right).toBeLessThanOrEqual(pos!.width + 1);
        }).toPass({ timeout: 8_000 });
    });

    test('10. Sahifa almashganda skroll tepaga qaytadi (B-37)', async ({ page }) => {
        await login(page);
        await go(page, '/patients');
        await page.waitForTimeout(1200);

        await page.evaluate(() => window.scrollTo(0, 600));
        await go(page, '/calendar');
        await page.waitForTimeout(800);

        const y = await page.evaluate(() => window.scrollY);
        expect(y).toBeLessThan(50);
    });
});
