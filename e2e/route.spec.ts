/* KO'P XIZMATLI MARSHRUT — «Yangi qabul» oynasidan.
 *
 * Bemor bitta kelishda bir necha joyga boradi: tahlil, tekshiruv, shifokor.
 * Ilgari registrator faqat shifokor qabulini ocha olardi; tahlilni shifokor
 * kartadan buyurishi yoki laborant «tashqi yo'llanma» yozishi kerak edi.
 *
 * NIMA TEKSHIRILADI:
 *   · oynada tahlil va tekshiruv tanlansa marshrut tuziladi — tartibni qoida
 *     qo'yadi (laboratoriya → diagnostika → shifokor), jami hammasidan;
 *   · hammasi BITTA qabulga bog'lanadi (bitta chek);
 *   · bemor xaritada yo'qolmaydi: shifokor qatorida «tekshiruvda · 0/3»;
 *   · shifokorsiz — faqat tahlil: qabul ochilmaydi, yo'llanma yoziladi.
 */
import { test, expect, Page } from '@playwright/test';
import { login, go, uniq, PASSWORD } from './helpers';

async function pickPatient(page: Page, surname: string) {
    await go(page, '/reception');
    await page.getByRole('button', { name: /^Yangi qabul$/ }).click();
    await expect(page.locator('#rc-dept')).toBeVisible();
    await page.getByRole('dialog').getByPlaceholder(/qidir|ism|telefon/i).first().fill(surname);
    await page.getByRole('button', { name: new RegExp(surname) }).first().click();
}

test.describe('Marshrut', () => {

    test("shifokor + tahlil + tekshiruv: bitta qabul, bitta hisob, xaritada «0/3»", async ({ page, request }) => {
        test.setTimeout(150_000);
        const auth = await (await request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };
        const n = uniq();
        const surname = `Yol${n}`;
        const patient = await (await request.post('/api/patients', {
            headers,
            data: { firstName: 'Sinov', lastName: surname, gender: 'Male', phone: `+99897${n.slice(0, 7)}`, force: true },
        })).json();

        await login(page, 'zilola.reg');
        await pickPatient(page, surname);

        const dept = page.locator('#rc-dept');
        const value = await dept.locator('option', { hasText: /^Terapiya$/ }).first().getAttribute('value');
        await dept.selectOption(value!);
        await page.locator('#rc-doctor').selectOption({ index: 1 });

        const tests = page.getByRole('group', { name: 'Tahlillar' });
        test.skip(await tests.count() === 0, "Tahlillar katalogi bo'sh");
        await tests.getByRole('button').first().click();
        const studies = page.getByRole('group', { name: 'Tekshiruvlar' });
        const withStudy = await studies.count() > 0;
        if (withStudy) await studies.getByRole('button').first().click();
        const stops = withStudy ? 3 : 2;

        // Marshrut: laboratoriya birinchi, shifokor oxirida
        const route = page.getByRole('list', { name: 'Marshrut' });
        await expect(route).toContainText(`Marshrut · ${stops} bekat`);
        const items = route.locator('li');
        await expect(items.nth(1)).toContainText('Laboratoriya');
        await expect(items.last()).toContainText(/Kabinet|Terapiya|[A-Z]/);

        await page.getByRole('button', { name: /^Qabulni ochish$/ }).click();
        await expect(page.getByText(/Qabul ochildi/).first()).toBeVisible({ timeout: 20_000 });

        // ── Serverda: hammasi bitta qabulga bog'langan ───────────────────
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        await expect(async () => {
            const visits: any[] = await (await request.get(`/api/visits?patientId=${patient.id}&date=${today}`, { headers })).json();
            expect(visits.length, 'bitta qabul').toBe(1);
            expect((visits[0].labOrders || []).length, 'tahlil qabulga bog\'langan').toBe(1);
            if (withStudy) expect((visits[0].studies || []).length, 'tekshiruv qabulga bog\'langan').toBe(1);
            const charges: any[] = await (await request.get(`/api/charges?patientId=${patient.id}&status=Unpaid`, { headers })).json();
            expect(charges.length, 'har xizmatga hisob qatori').toBeGreaterThanOrEqual(stops - 1);
            expect(charges.every(c => c.visitId === visits[0].id), 'hamma qator o\'sha qabulda').toBe(true);
        }).toPass({ timeout: 20_000 });

        // ── Xaritada: bemor yo'qolmadi — shifokor qatorida, marshrut bilan ─
        /* Shifokorda uchtadan ko'p bemor tekshiruvda bo'lsa, qolganlari «+N»
           ortida turadi — u tugma, bosilsa hammasi ochiladi. */
        const chip = page.getByRole('button', { name: new RegExp(`${surname}.*tekshiruvda · 0/${stops}`) }).first();
        const more = page.getByRole('button', { name: /yana \d+ kishi tekshiruvda$/ });
        await expect(async () => {
            /* Har bosishda tugma yo'qoladi — ro'yxat oldindan olinmaydi,
               har safar birinchisi bosiladi. */
            for (let i = 0; i < 12 && !(await chip.isVisible()) && await more.count() > 0; i++) await more.first().click();
            await expect(chip).toBeVisible({ timeout: 2_000 });
        }).toPass({ timeout: 25_000 });
    });

    test("shifokorsiz — faqat tahlil: qabul ochilmaydi, yo'llanma yoziladi", async ({ page, request }) => {
        test.setTimeout(120_000);
        const auth = await (await request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };
        const n = uniq();
        const surname = `Tahlilga${n}`;
        const patient = await (await request.post('/api/patients', {
            headers,
            data: { firstName: 'Sinov', lastName: surname, gender: 'Male', phone: `+99898${n.slice(0, 7)}`, force: true },
        })).json();

        await login(page, 'zilola.reg');
        await pickPatient(page, surname);

        // Hech narsa tanlanmagan — tugma o'chiq va sababi yozilgan
        await expect(page.getByRole('button', { name: /^Qabulni ochish$/ })).toBeDisabled();
        await expect(page.getByText(/Bo'limni tanlang yoki tahlil/)).toBeVisible();

        const tests = page.getByRole('group', { name: 'Tahlillar' });
        test.skip(await tests.count() === 0, "Tahlillar katalogi bo'sh");
        await tests.getByRole('button').first().click();
        await page.getByRole('button', { name: /^Yo'llanmani yozish$/ }).click();
        await expect(page.getByText(/Yo'llanma yozildi/).first()).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('dialog', { name: 'Yangi qabul' })).toHaveCount(0);

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const visits: any[] = await (await request.get(`/api/visits?patientId=${patient.id}&date=${today}`, { headers })).json();
        expect(visits.length, 'qabul ochilmagan').toBe(0);
        const orders: any[] = (await (await request.get(`/api/lab-orders?clinicId=${auth.clinicId}`, { headers })).json())
            .filter((o: any) => o.patientId === patient.id);
        expect(orders.length, "yo'llanma yozilgan").toBe(1);
        expect(orders[0].visitId ?? null, 'qabulga bog\'lanmagan').toBeNull();
    });
});
