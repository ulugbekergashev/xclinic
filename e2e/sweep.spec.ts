/* HAMMA SAHIFANI OCHIB KO'RISH.
 *
 * NIMA UCHUN KERAK. Loyihada 25 ta sahifa bor, `smoke.spec.ts` esa
 * ularning uchtasiga kiradi. Bir kunda bitta ekranda (Kalendar) OLTITA
 * haqiqiy xato topildi — kunlik ko'rinishda ustunlar umuman yo'q edi,
 * Moliya bo'limi ochilmasdi — va ularning HAMMASIDAN o'sha paytdagi
 * sinovlar o'tib ketgan edi. Ya'ni qolgan 22 sahifaning holati haqida
 * hech narsa bilinmaydi.
 *
 * Bu sinov chuqur tekshirmaydi. U bitta savolga javob beradi:
 * «sahifa ochiladimi yoki yiqiladimi?» Uch belgi qaraladi:
 *   1. JS istisnosi (`pageerror`) — komponent yiqilgani
 *   2. Xato chegarasi ekrani («bo'limida xatolik»)
 *   3. Sahifa umuman bo'sh qolgani
 *
 * Bularning har biri foydalanuvchi uchun «ishlamaydi» degani.
 *
 * Ishga tushirish: npx playwright test e2e/sweep.spec.ts
 */
import { test, expect } from '@playwright/test';
import { login, go } from './helpers';

/* Parametrsiz marshrutlar. `:id` talab qiladiganlar (visit, doctors/:id,
   patients/:id) bu yerda yo'q — ular uchun haqiqiy yozuv kerak va ular
   `smoke.spec.ts` da alohida qaralgan. */
const ROUTES: { path: string; name: string }[] = [
    { path: '/', name: 'Boshqaruv paneli' },
    { path: '/today', name: 'Bugun' },
    /* Eski manzillar — «Bugun» ga yo'naltiriladi. Ular ham ochilishi
       kerak: talonlarda va xatcho'plarda o'shalar qolgan. */
    { path: '/reception', name: 'Registratura (eski manzil)' },
    { path: '/myqueue', name: 'Mening navbatim (eski manzil)' },
    { path: '/leads', name: 'Lidlar' },
    { path: '/patients', name: 'Bemorlar' },
    { path: '/calendar', name: 'Kalendar' },
    { path: '/finance', name: 'Moliya' },
    { path: '/cashbook', name: 'Kassa daftari' },
    { path: '/cashier', name: 'Kassir' },
    { path: '/doctors', name: 'Shifokorlar' },
    { path: '/inventory', name: 'Ombor' },
    { path: '/board', name: 'Navbat tablosi' },
    { path: '/lab', name: 'Laboratoriya' },
    { path: '/diagnostics', name: 'Diagnostika' },
    { path: '/inpatient', name: 'Statsionar' },
    { path: '/messages', name: 'Xabarlar' },
    { path: '/settings', name: 'Sozlamalar' },
];

test.describe('Hamma sahifa ochiladimi', () => {
    for (const r of ROUTES) {
        test(`${r.name} (${r.path})`, async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', e => errors.push(e.message.split('\n')[0].slice(0, 200)));

            await login(page);
            await go(page, r.path);

            /* Sahifalar ma'lumotni o'zi yuklaydi — birinchi render bo'sh
               bo'lishi normal. Yiqilish esa odatda ma'lumot kelgandan
               keyin sodir bo'ladi, shuning uchun kutish kerak. */
            await page.waitForTimeout(3500);

            const boundary = await page.getByText(/bo'limida xatolik/).count();
            const bodyText = (await page.locator('main, body').first().innerText()).trim();

            const problems: string[] = [];
            if (errors.length) problems.push('JS istisnosi: ' + errors.join(' | '));
            if (boundary > 0) problems.push('xato chegarasi ekrani chiqdi');
            if (bodyText.length < 120) problems.push(`sahifa deyarli bo'sh (${bodyText.length} belgi)`);

            if (problems.length) {
                await page.screenshot({ path: `test-results/sweep-${r.path.replace(/\//g, '_')}.png` });
            }

            expect(problems, `${r.name}: ${problems.join('; ')}`).toEqual([]);
        });
    }
});
