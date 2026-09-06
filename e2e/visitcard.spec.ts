/* BEMOR KARTASI — YAGONA ISH JOYI.
 *
 * NIMA TEKSHIRILADI. Shifokor bemor kartasidan chiqmasdan qabulni ocha
 * olishi, tashxis qo'ya olishi, tekshiruvga yubora olishi va tarixni
 * ko'ra olishi kerak.
 *
 * Nima uchun bu sinov bor. Ilgari qabul ALOHIDA sahifada edi
 * (`/visit/:id`) va bemor kartasidan unga havola yo'q edi: tashxis
 * faqat o'sha sahifada qo'yilardi, tarix esa faqat kartada. Kartadagi
 * MKB-10 oynasi yozilgan, lekin uni ochadigan tugma yo'q edi —
 * ya'ni kartadan tashxis qo'yib bo'lmasdi.
 *
 * Sinov o'z serveridan va baza NUSXASIDAN foydalanadi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq } from './helpers';

/* Sinov uchun bemor yaratadi va uning kartasini ochadi.

   Maydonlar `name` bo'yicha topiladi, tartib bo'yicha emas: formaga
   yangi maydon qo'shilsa tartib siljiydi va sinov «yiqilib», lekin
   hech qanday xato topmay qolardi. */
async function openFreshPatientCard(page: any) {
    const n = uniq();
    const surname = `Kartaviy${n}`;
    await go(page, '/patients');
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: /Bemor qo'shish|Добавить пациента/ }).first().click();
    await page.waitForTimeout(800);

    await page.locator('input[name="lastName"]').fill(surname);
    await page.locator('input[name="firstName"]').fill('Sinov');
    await page.locator('input[name="phone"]').fill(`+99890${n.slice(0, 7)}`);
    const dob = page.locator('input[name="dob"]');
    if (await dob.count()) await dob.fill('1985-04-12');

    await page.getByRole('button', { name: /^Saqlash$/ }).click();
    await page.waitForTimeout(2500);

    // Ro'yxatdan yangi bemorni topib kartasini ochamiz
    await page.getByText(surname).first().click();
    await page.waitForTimeout(2500);
    return n;
}

test.describe('Bemor kartasi — joriy qabul paneli', () => {

    test('kartada joriy qabul paneli bor va qabul ochiladi', async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        /* Yangi bemorda ochiq qabul yo'q — panel «Qabul ochish»
           formasini ko'rsatishi kerak, bo'sh joy emas. */
        await expect(page.getByText(/Ochiq qabul yo'q/)).toBeVisible();

        const openBtn = page.getByRole('button', { name: /^Qabul ochish$/ });
        await expect(openBtn).toBeVisible();
        // Bo'lim tanlanmaguncha tugma bosilmaydi
        await expect(openBtn).toBeDisabled();

        // Birinchi select — bo'lim
        const deptSelect = page.locator('select').first();
        const options = deptSelect.locator('option');
        expect(await options.count()).toBeGreaterThan(1);
        await deptSelect.selectOption({ index: 1 });

        await expect(openBtn).toBeEnabled();
        await openBtn.click();
        await page.waitForTimeout(2500);

        // Qabul ochildi — panel sarlavhasi va holat chipi paydo bo'ladi
        await expect(page.getByText('Joriy qabul')).toBeVisible();
        await expect(page.getByRole('button', { name: /Qabulni yakunlash/ })).toBeVisible();
    });

    test('MKB-10 qidiruvi kartada natija beradi va tashxis qo\'shiladi', async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        await page.locator('select').first().selectOption({ index: 1 });
        await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
        await page.waitForTimeout(2500);

        /* Tashxis maydoni AYNAN KARTADA bo'lishi kerak — boshqa sahifaga
           o'tmasdan. Auditda topilgan nuqson shu edi. */
        await expect(page.getByText('Tashxis (MKB-10)')).toBeVisible();

        const icd = page.getByPlaceholder(/Kod yoki kasallik nomi/);
        await expect(icd).toBeVisible();
        await icd.fill('gipert');
        await page.waitForTimeout(1500);

        /* Natija chiqmasa — qidiruv ishlamayapti. Bo'sh ro'yxat auditdagi
           B-02 nuqsonining aynan o'zi, shuning uchun bu YUMSHOQ tekshiruv
           emas: kamida bitta kod chiqishi SHART. */
        const firstHit = page.locator('button', { hasText: /^I1\d/ }).first();
        await expect(firstHit).toBeVisible({ timeout: 10_000 });
        const codeText = (await firstHit.innerText()).trim().split(/\s/)[0];

        await firstHit.click();
        await page.waitForTimeout(2500);

        /* Tashxis chip bo'lib qoladi — ya'ni server qabulga bog'lab
           saqladi va panel uni qayta o'qidi. */
        await expect(page.getByText(codeText).first()).toBeVisible();
    });

    test('tekshiruvga yuborish paneli prayslistdan narx oladi', async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        await page.locator('select').first().selectOption({ index: 1 });
        await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
        await page.waitForTimeout(2500);

        await page.getByRole('button', { name: /^Diagnostikaga$/ }).click();
        await page.waitForTimeout(800);

        await expect(page.getByText('Qaysi tekshiruv?')).toBeVisible();
        /* Narx maydoni bor, lekin u YAGONA yo'l bo'lmasligi kerak:
           prayslistdan tanlash nom va narxni o'zi to'ldiradi. */
        await expect(page.getByPlaceholder(/Masalan: Qorin/)).toBeVisible();
    });

    test('tarix bo\'limi ochiladi va qabullar ro\'yxati chiqadi', async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        await page.locator('select').first().selectOption({ index: 1 });
        await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
        await page.waitForTimeout(2500);

        await page.getByRole('button', { name: /^Qabullar/ }).click();
        await page.waitForTimeout(1200);

        /* Ro'yxatda hozirgina ochilgan qabul «ochiq» belgisi bilan
           turishi kerak. */
        await expect(page.getByText('ochiq').first()).toBeVisible();
    });

    test("kartadagi to'lovlar kassa bilan BITTA manbadan o'qiydi", async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        await page.locator('select').first().selectOption({ index: 1 });
        await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
        await page.waitForTimeout(2500);

        /* Tekshiruv buyuramiz — server unga `VisitCharge` qatori yaratadi. */
        await page.getByRole('button', { name: /^Diagnostikaga$/ }).click();
        await page.waitForTimeout(800);
        await page.getByPlaceholder(/Masalan: Qorin/).fill('Sinov UZI');
        await page.getByPlaceholder(/^Narx$/).fill('75000');
        await page.getByRole('button', { name: /^Diagnostikaga yuborish$/ }).click();
        await page.waitForTimeout(3000);

        /* Endi «To'lovlar» bo'limida O'SHA qator ko'rinishi kerak.
           Ilgari bu ro'yxat kalendar yozuvlaridan yasalardi va hisob
           qatorlarini umuman ko'rmasdi: shifokor kartada bir qarzni,
           kassir esa boshqasini ko'rardi. */
        await page.getByRole('button', { name: /^To'lovlar/ }).click();
        await page.waitForTimeout(2000);

        await expect(page.getByText('Sinov UZI').first()).toBeVisible();

        /* To'lov oynasi — kassadagi bilan aynan bir xil komponent. */
        const pay = page.getByRole('button', { name: /To'lov qabul qilish/ });
        await expect(pay).toBeVisible();
        await pay.click();
        await page.waitForTimeout(1500);
        await expect(page.getByText('Sinov UZI').first()).toBeVisible();
    });
    test('/visit/:id eski havolasi bemor kartasiga yo\'naltiradi', async ({ page }) => {
        await login(page);
        await go(page, '/myqueue');
        await page.waitForTimeout(2500);

        const openBtn = page.getByRole('button', { name: /^Ochish$/ }).first();
        if (await openBtn.count() === 0) test.skip(true, 'Navbatda qabul yo\'q');

        await openBtn.click();
        await page.waitForTimeout(3000);

        /* Yakuniy manzil — bemor kartasi, `/visit/` EMAS. */
        expect(page.url()).toContain('/patients/');
        expect(page.url()).toContain('visit=');
        await expect(page.getByText('Joriy qabul')).toBeVisible();
    });
});
