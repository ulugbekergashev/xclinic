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
import { login, go, uniq, openVisitInCard, visitSheet, openOrder, orderStudy } from './helpers';

/* Vrach ish joyi (2026-11-23): tashxis qidiruvi varaqning o'zida, tahlil,
   diagnostika, dori, xizmat va yo'naltirish — «Tayinlovlar» sarlavhasidagi
   o'z tugmasi bilan (`helpers.ts`, `openOrder`). */


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
        await expect(page.getByText(/Bugun qabul ochilmagan/)).toBeVisible();

        const openBtn = page.getByRole('button', { name: /^Qabul ochish/ });
        await expect(openBtn).toBeVisible();
        // Bo'lim tanlanmaguncha tugma bosilmaydi
        await expect(openBtn).toBeDisabled();

        /* «Bugun» ekranidagi forma bilan bir xil: Bo'lim → Shifokor
           (2026-11-21, kartochkalardan qaytildi). Klinik bo'limda
           shifokorsiz qabul ochilmaydi — u hech kimning navbatida
           ko'rinmasdi. */
        const box = page.locator('section[aria-labelledby="visit-title"]');
        const deptSel = box.getByLabel("Bo'lim", { exact: true });
        const docSel = box.getByLabel(/^Shifokor/);
        await expect(deptSel.locator('option').nth(1)).toBeAttached({ timeout: 15_000 });
        const values = await deptSel.locator('option').evaluateAll(
            os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
        for (const v of values) {
            await deptSel.selectOption(v);
            if (await docSel.locator('option').count() > 1) break;
        }
        // Xizmat o'zi tanlanmaydi — so'ralmagan pul hisobga tushmasin
        expect(await box.getByLabel(/^Xizmat/).inputValue()).toBe('');

        if (await docSel.locator('option').count() > 2) {
            // Bir nechta shifokor: tanlanmaguncha tugma o'chiq
            expect(await docSel.inputValue()).toBe('');
            await expect(openBtn).toBeDisabled();
            await docSel.selectOption({ index: 1 });
        } else {
            // Yagona shifokor o'zi tanlanadi
            expect(await docSel.inputValue()).not.toBe('');
        }
        await expect(openBtn).toBeEnabled();
        await expect(openBtn).toHaveText(/^Qabul ochish — Dr\. /);
        await openBtn.click();
        await page.waitForTimeout(2500);

        // Qabul ochildi — panel sarlavhasi va holat chipi paydo bo'ladi
        await expect(page.getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible();

        /* QABUL TARTIBI (klinika egasi, 2026-11-21): boshlanmagan qabulni
           yakunlab bo'lmaydi. Avval «Qabulni boshlash», keyin «Yakunlash». */
        const startBtn = page.getByRole('button', { name: /^Qabulni boshlash$/ });
        const finishBtn = page.getByRole('button', { name: /Qabulni yakunlash/ });
        await expect(startBtn).toBeVisible();
        await expect(finishBtn).toHaveCount(0);
        await startBtn.click();
        await expect(finishBtn).toBeVisible({ timeout: 15_000 });
        await expect(startBtn).toHaveCount(0);
        await expect(page.getByText(/(^|· )Qabulda$/)).toBeVisible();
    });

    test('MKB-10 qidiruvi kartada natija beradi va tashxis qo\'shiladi', async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        /* Qabul ochish: Bo'lim → Shifokor → «Qabul ochish — Dr. …» */
        await openVisitInCard(page);
        await page.waitForTimeout(2500);

        /* Tashxis maydoni AYNAN KARTADA bo'lishi kerak — boshqa sahifaga
           o'tmasdan. Auditda topilgan nuqson shu edi. */
        // Qidiruv — «Tashxis» blokining o'zida, oyna ochilmaydi (2026-11-23)
        const sheet = visitSheet(page);
        const icd = sheet.getByPlaceholder(/Kod yoki kasallik nomi/);
        await expect(icd).toBeVisible();
        await icd.fill('gipert');

        /* Natija chiqmasa — qidiruv ishlamayapti. Bo'sh ro'yxat auditdagi
           B-02 nuqsonining aynan o'zi, shuning uchun bu YUMSHOQ tekshiruv
           emas: kamida bitta kod chiqishi SHART. */
        const firstHit = sheet.locator('button', { hasText: /^I1\d/ }).first();
        await expect(firstHit).toBeVisible({ timeout: 10_000 });
        const codeText = (await firstHit.innerText()).trim().split(/\s/)[0];

        await firstHit.click();

        /* Tashxis blok ro'yxatida qoladi — ya'ni server qabulga bog'lab
           saqladi va panel uni qayta o'qidi. Birinchisi — «Asosiy». */
        const row = sheet.getByRole('list', { name: 'Tashxis' }).getByRole('listitem').filter({ hasText: codeText });
        await expect(row).toBeVisible({ timeout: 15_000 });
        await expect(row.getByRole('button', { name: 'Asosiy' })).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('tekshiruvga yuborish paneli prayslistdan narx oladi', async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        /* Qabul ochish: Bo'lim → Shifokor → «Qabul ochish — Dr. …» */
        await openVisitInCard(page);
        await page.waitForTimeout(2500);

        await openOrder(page, 'Diagnostika');

        // Tanlov oynada; «Qaysi tekshiruv?» — guruhning nomi (sarlavhani oyna beradi)
        await expect(page.getByRole('dialog').getByRole('group', { name: 'Qaysi tekshiruv?' })).toBeVisible();
        /* Prayslist tugma bo'lib turadi — tanlash nom va narxni o'zi
           to'ldiradi. Qo'lda yozish esa prayslistda yo'q tekshiruv uchun
           qoladi va alohida bosib ochiladi. */
        const manual = page.getByRole('button', { name: /qo'lda yozish/ });
        if (await manual.isVisible()) await manual.click();
        await expect(page.getByPlaceholder(/Masalan: Qorin/)).toBeVisible();
    });

    test('tarix lentasida bugungi qabul «ochiq» belgisi bilan turadi va joyida ochiladi', async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        /* Qabul ochish: Bo'lim → Shifokor → «Qabul ochish — Dr. …» */
        await openVisitInCard(page);
        await page.waitForTimeout(2500);

        /* Tarix — alohida tab (2026-11-20), bitta lenta. «Qabul» filtri
           bosilganda hozirgina ochilgan qabul «ochiq» belgisi bilan turishi
           kerak — sahifa qayta yuklanmasdan. */
        await page.getByRole('tab', { name: /^Tarix/ }).click();
        const history = page.locator('section[aria-labelledby="hist-title"]');
        const feed = history.getByRole('list', { name: 'Tarix' });
        await history.getByRole('button', { name: /^Qabul$/ }).click();
        await expect(feed.getByText('ochiq')).toBeVisible();

        /* Yozuv JOYIDA ochiladi (ilgari bo'lim sahifaning eng pastida
           ochilardi) va varaqda aynan shu qabul turgani ko'rinadi. */
        await feed.getByRole('button').first().click();
        await expect(history.getByRole('button', { name: 'Qabulni ochish' })).toBeEnabled();

        /* Boshqa turdagi yozuv yo'q — lenta bo'sh ekanini aytadi, jim qolmaydi. */
        await history.getByRole('button', { name: /^Tahlil$/ }).click();
        await expect(history.getByText("Bu turdagi yozuv yo'q")).toBeVisible();
    });

    test("kartadagi to'lovlar kassa bilan BITTA manbadan o'qiydi", async ({ page }) => {
        await login(page);
        await openFreshPatientCard(page);

        /* Qabul ochish: Bo'lim → Shifokor → «Qabul ochish — Dr. …» */
        await openVisitInCard(page);
        await page.waitForTimeout(2500);

        /* Tekshiruv buyuramiz — server unga `VisitCharge` qatori yaratadi. */
        await orderStudy(page, 'Sinov UZI', '75000');

        /* Endi «To'lovlar» bo'limida O'SHA qator ko'rinishi kerak.
           Ilgari bu ro'yxat kalendar yozuvlaridan yasalardi va hisob
           qatorlarini umuman ko'rmasdi: shifokor kartada bir qarzni,
           kassir esa boshqasini ko'rardi. */
        await page.getByRole('tab', { name: /^To'lovlar/ }).click();
        /* «To'lovlar» — sarlavha ostidagi tab (2026-11-20 gacha oyna edi).
           Qatorni AYNAN SHU TABDAN qidiramiz: «Sinov UZI» varaqda ham bor. */
        const register = page.getByRole('tabpanel');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(register.getByText('Sinov UZI').first()).toBeVisible();

        /* To'lov oynasi — kassadagi bilan aynan bir xil komponent. */
        const pay = register.getByRole('button', { name: /To'lov qabul qilish/ });
        await expect(pay).toBeVisible();
        await pay.click();
        await expect(page.getByRole('dialog').last().getByText('Sinov UZI').first()).toBeVisible();
    });
    test("«Bugun» xaritasidan qabul ochiladi, eski havola ham ishlaydi", async ({ page }) => {
        /* Ikkita narsa birga tekshiriladi, chunki ikkinchisi birinchisining
           natijasiga tayanadi: navbatdagi tugma bemor kartasini ochishi va
           eski `/visit/:id` havolasi o'sha kartaga yo'naltirishi kerak.

           Sinov O'ZI qabul ochadi: ilgari u navbatda tayyor yozuv bo'lishiga
           umid qilardi va oldingi sinovlar navbatni bo'shatib qo'yganda
           jimgina o'tkazib yuborilardi — ya'ni hech narsa tekshirmasdi. */
        await login(page);
        const n = await openFreshPatientCard(page);

        /* Qabul ochish: Bo'lim → Shifokor → «Qabul ochish — Dr. …» */
        await openVisitInCard(page);
        await page.waitForTimeout(2500);
        await expect(page.getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible();

        /* Endi «Bugun» xaritasida o'sha bemor kutish zalida turishi kerak.
           Alohida navbat ro'yxati yo'q (u xaritani takrorlardi) — karta
           bemorning ismi bosilganda ochiladi. Navbat uzun bo'lsa bemor
           «+N» ortida turadi, shuning uchun qatorlar avval ochiladi. */
        await go(page, '/reception');
        await expect(page.getByRole('heading', { name: 'Bugun klinikada' })).toBeVisible({ timeout: 15_000 });
        const seat = page.getByRole('button', { name: new RegExp(`^Kartaviy${n}`) }).first();
        for (let i = 0; i < 12 && !(await seat.isVisible()); i++) {
            const more = page.getByRole('button', { name: /hammasini ko'rsatish/ }).first();
            if (!(await more.count())) { await page.waitForTimeout(500); continue; }
            await more.click();
        }
        await expect(seat).toBeVisible({ timeout: 15_000 });
        await seat.click();
        await page.waitForTimeout(3000);

        expect(page.url()).toContain('/patients/');
        expect(page.url()).not.toContain('undefined');
        expect(page.url()).toContain('visit=');
        await expect(page.getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible();

        /* Eski havola: `/visit/:id` bemor kartasiga yo'naltiradi —
           chop etilgan talonlar va xatcho'plar ishlashda davom etsin. */
        const visitId = new URL(page.url().replace('/#/', '/')).searchParams.get('visit')
            || page.url().split('visit=')[1];
        expect(visitId).toBeTruthy();
        await go(page, `/visit/${visitId}`);
        await page.waitForTimeout(3000);
        expect(page.url()).toContain('/patients/');
        await expect(page.getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible();
    });
});
