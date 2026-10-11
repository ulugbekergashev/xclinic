/* BEMOR KARTASI — BITTA ISH JOYI.
 *
 * Karta uch qismdan iborat: sarlavha (kim, nimaga e'tibor berish kerak, bugun
 * qayerda), tarix lentasi va qabul varag'i. Bu fayl aynan yangi tuzilmaning
 * VA'DALARINI tekshiradi:
 *
 *   1. varaqdagi matn «Saqlash» tugmasisiz saqlanadi va yozish davomida
 *      yo'qolmaydi;
 *   2. chegaradan tashqari ko'rsatkich saqlanmaydi va qabulni yopib bo'lmaydi;
 *   3. yo'llanma va to'lov sarlavhadagi marshrutga o'zi tushadi — sahifa qayta
 *      yuklanmasdan;
 *   4. daftarlar oynada ochiladi, kam ishlatiladigan amallar «⋯» ostida;
 *   5. registrator ko'rikni o'qiydi, lekin yozolmaydi; shifokor pul olmaydi.
 *
 * Qabul ochish, tashxis va tarix lentasi — `visitcard.spec.ts` da.
 */
import { test, expect, Page } from '@playwright/test';
import { login, go, uniq } from './helpers';

const sheet = (page: Page) => page.locator('section[aria-labelledby="visit-title"]');
const header = (page: Page) => page.locator('section[aria-labelledby="pt-name"]');
const history = (page: Page) => page.locator('section[aria-labelledby="hist-title"]');
const stops = (page: Page) => header(page).getByRole('list', { name: 'Marshrut' }).getByRole('listitem');
/** Varaq sarlavhasidagi «o'zi saqlanadi / saqlandi · 12:21» yozuvi */
const saveLabel = (page: Page) => sheet(page).getByRole('status').first();

/* Sahifa qayta yuklanmaganini isbotlash: qayta yuklash hamma narsani
   serverdan yangidan oladi va xatoni yashiradi. */
const mark = (page: Page) => page.evaluate(() => { (window as any).__sameDocument = true; });
const stillSamePage = async (page: Page) =>
    expect(await page.evaluate(() => (window as any).__sameDocument === true),
        'sahifa sinov davomida qayta yuklangan').toBe(true);

/** Yangi bemor va unga Terapiya bo'limida, shifokor bilan ochilgan qabul. */
async function newPatientWithVisit(page: Page, surname: string, n: string) {
    await go(page, '/patients');
    await page.getByRole('button', { name: /Bemor qo'shish/ }).first().click();
    await page.locator('input[name="lastName"]').fill(surname);
    await page.locator('input[name="firstName"]').fill('Sinov');
    await page.locator('input[name="phone"]').fill(`+99890${n.slice(0, 7)}`);
    const dob = page.locator('input[name="dob"]');
    if (await dob.count()) await dob.fill('1985-04-12');
    await page.getByRole('button', { name: /^Saqlash$/ }).click();

    await page.getByText(surname).first().click();
    await expect(page.locator('#pt-name')).toContainText(surname, { timeout: 15_000 });

    /* Terapiya: shablonida harorat va anamnez bor — sinovlar shularga tayanadi.
       Shifokor ham tanlanadi: marshrutda shifokor bekati shundan chiqadi. */
    const selects = sheet(page).locator('select');
    await selects.nth(0).selectOption({ label: 'Terapiya' });
    await selects.nth(1).selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
    await expect(sheet(page).getByRole('heading', { name: /Bugungi qabul/ })).toBeVisible({ timeout: 15_000 });
}

async function orderStudy(page: Page, name: string) {
    await sheet(page).getByRole('button', { name: /^Diagnostikaga$/ }).click();
    await page.getByPlaceholder(/Masalan: Qorin/).fill(name);
    await page.getByPlaceholder(/^Narx$/).fill('90000');
    await page.getByRole('button', { name: /^Diagnostikaga yuborish$/ }).click();
    await expect(sheet(page).getByText(name)).toBeVisible();
}

test.describe("Bemor kartasi — qabul varag'i", () => {

    test("shikoyat va ko'rik «Saqlash» tugmasisiz saqlanadi va yozish davomida yo'qolmaydi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Varaq${n}`, n);

        // Varaqda «Saqlash» tugmasi yo'q — unutib qoldiradigan narsa ham yo'q
        await expect(sheet(page).getByRole('button', { name: /^Saqlash$/ })).toHaveCount(0);
        await expect(saveLabel(page)).toContainText("o'zi saqlanadi");

        /* HARFMA-HARF VA SEKIN. Shu vaqt ichida forma bir necha marta o'zi
           saqlanadi va qabul serverdan qayta o'qiladi. Eskirgan javob
           yozilayotgan matnning o'rniga tushsa — harflar yo'qoladi. */
        const anamnesis = sheet(page).getByLabel('Kasallik anamnezi');
        const typed = `Bosh og'rig'i, uch kundan beri, kechga yaqin kuchayadi ${n}`;
        await anamnesis.pressSequentially(typed, { delay: 70 });
        await expect(anamnesis).toHaveValue(typed);

        const complaint = sheet(page).getByPlaceholder(/Bemor nimadan shikoyat/);
        await complaint.fill(`Holsizlik ${n}`);
        await anamnesis.click();   // shikoyatdan chiqildi — u ham ketadi
        await expect(saveLabel(page)).toContainText('saqlandi', { timeout: 15_000 });
        await expect(anamnesis).toHaveValue(typed);

        /* Ko'rik yozila boshladi — bemor endi kabinetda. Holat varaqda ham,
           sarlavhadagi soatda ham o'zi o'zgaradi. */
        await expect(sheet(page).getByText('Qabulda', { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(header(page).getByText(/qabulda · \d+ daq/)).toBeVisible();

        // Haqiqatan serverga yozilganmi — sahifani qayta yuklab ko'ramiz
        await page.reload();
        await expect(sheet(page).getByLabel('Kasallik anamnezi')).toHaveValue(typed, { timeout: 30_000 });
        await expect(sheet(page).getByPlaceholder(/Bemor nimadan shikoyat/)).toHaveValue(`Holsizlik ${n}`);
    });

    test("chegaradan tashqari ko'rsatkich saqlanmaydi va qabul yopilmaydi", async ({ page }) => {
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Chegara${n}`, n);

        /* Rol bilan: maydon yorlig'i ichidagi matn (masalan shikoyatga yozilgan so'z) bilan adashmasin */
        const temperature = sheet(page).getByRole('spinbutton', { name: /^Harorat/ });
        await temperature.fill('500');
        await expect(saveLabel(page)).toContainText('chegaradan tashqari');

        /* XATO RAQAMDAN KEYIN YOZILGANI YO'QOLMAYDI. Ilgari bitta noto'g'ri
           qiymat butun ko'rikni saqlashdan to'xtatardi: shifokor yozishda
           davom etardi va hammasi jimgina yo'qolardi. Endi xato maydon
           tashlab ketiladi, qolgani yoziladi. */
        const noted = `Yo'tal, ikki kundan beri ${n}`;
        await sheet(page).getByLabel('Kasallik anamnezi').fill(noted);

        /* TO'SIQNI AYLANIB O'TIB BO'LMAYDI. Shikoyat tahrirlansa yorliq
           «saqlandi» ga o'zgarardi va «Yakunlash» o'tib ketardi — xato
           qiymat bilan. Endi to'siq yorliqqa bog'liq emas. */
        const complaint = sheet(page).getByPlaceholder(/Bemor nimadan shikoyat/);
        await complaint.fill(`Isitma ${n}`);
        await temperature.focus();   // shikoyatdan chiqildi — u saqlanadi
        await page.waitForTimeout(3500);
        await expect(saveLabel(page)).toContainText('chegaradan tashqari');

        await sheet(page).getByRole('button', { name: /Qabulni yakunlash/ }).click();
        await expect(sheet(page).getByRole('button', { name: /Qabulni yakunlash/ })).toBeVisible();
        await expect(sheet(page).getByText('Yakunlangan')).toHaveCount(0);

        // Serverda: anamnez va shikoyat bor, 500 daraja — yo'q
        await page.reload();
        await expect(sheet(page).getByLabel('Kasallik anamnezi')).toHaveValue(noted, { timeout: 30_000 });
        await expect(sheet(page).getByPlaceholder(/Bemor nimadan shikoyat/)).toHaveValue(`Isitma ${n}`);
        await expect(sheet(page).getByRole('spinbutton', { name: /^Harorat/ })).toHaveValue('');

        await sheet(page).getByRole('spinbutton', { name: /^Harorat/ }).fill('36.6');
        await expect(saveLabel(page)).toContainText('saqlandi', { timeout: 15_000 });
    });

    test("allergiya yuklanmasa — «yo'q» deb emas, «yuklanmadi» deb aytiladi", async ({ page }) => {
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Xulosa${n}`, n);
        const cardUrl = page.url();

        /* Xulosa so'rovi yiqilsa (tarmoq uzildi, server band), kartada
           «Ma'lumot yo'q» degan yozuv turmasligi kerak: shifokor uni
           «allergiyasi yo'q» deb o'qiydi va dori yozadi. */
        await page.route('**/api/patients/*/summary', route => route.abort());
        await page.goto('about:blank');
        await page.goto(cardUrl);
        await expect(header(page).getByText("allergiya: ma'lumot yuklanmadi")).toBeVisible({ timeout: 30_000 });
        await expect(history(page).getByRole('alert')).toBeVisible();
        await expect(history(page).getByText("Ma'lumot yo'q")).toHaveCount(0);

        // Qayta urinish — sahifani yangilamasdan
        await page.unroute('**/api/patients/*/summary');
        await history(page).getByRole('button', { name: /Qayta urinish/i }).click();
        await expect(header(page).getByText("allergiya: ma'lumot yuklanmadi")).toHaveCount(0);
        await expect(history(page).getByText("Ma'lumot yo'q")).toBeVisible();
    });

    test("yakunlangan qabuldan keyin shu kartadan yangisi ochiladi; yopilgani tarixda qoladi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Yakun${n}`, n);

        await page.getByPlaceholder(/Kod yoki kasallik nomi/).fill('gipert');
        await sheet(page).locator('button', { hasText: /^I1\d/ }).first().click();
        await expect(sheet(page).getByRole('button', { name: /^tashxis$/ })).toBeVisible({ timeout: 15_000 });

        await sheet(page).getByRole('button', { name: /Qabulni yakunlash/ }).click();
        const anyway = page.getByRole('button', { name: /Baribir yakunlash/ });
        await expect(sheet(page).getByText('Yakunlangan').or(anyway)).toBeVisible({ timeout: 15_000 });
        if (await anyway.isVisible()) await anyway.click();
        await expect(sheet(page).getByText('Yakunlangan')).toBeVisible({ timeout: 15_000 });

        // Yopilgan varaqda yozadigan narsa yo'q
        await expect(sheet(page).getByPlaceholder(/Kod yoki kasallik nomi/)).toHaveCount(0);
        await expect(sheet(page).getByRole('button', { name: /^Tahlilga$/ })).toHaveCount(0);

        /* Ilgari yakunlangan qabul varaqda qolardi va sahifa qayta
           yuklanmaguncha yangisini ochishning iloji yo'q edi. */
        await sheet(page).getByRole('button', { name: /^Yangi qabul$/ }).click();
        await expect(page.getByRole('button', { name: /^Qabul ochish$/ })).toBeVisible();

        // Yopilgan qabul yo'qolmadi — tarixdan qayta ochiladi
        const feed = history(page).getByRole('list', { name: 'Tarix' });
        await feed.getByRole('button').first().click();
        await history(page).getByRole('button', { name: 'Varaqda ochish' }).click();
        await expect(sheet(page).getByText('Yakunlangan')).toBeVisible({ timeout: 15_000 });
    });

    test("yo'llanma va to'lov sarlavhadagi marshrutga o'zi tushadi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Marshrut${n}`, n);
        await mark(page);

        // Faqat shifokor — bitta bekat marshrut emas, yo'l chizilmaydi
        await expect(stops(page)).toHaveCount(0);

        await orderStudy(page, `UZI ${n}`);

        // tekshiruv → shifokor → kassa (qarz bor, shuning uchun oxirida)
        await expect(stops(page)).toHaveCount(3, { timeout: 15_000 });
        await expect(stops(page).nth(0)).toContainText('UZI');
        await expect(stops(page).nth(0)).toHaveAttribute('aria-current', 'step');
        await expect(stops(page).nth(2)).toContainText('Kassa');
        await expect(stops(page).nth(2)).toContainText("to'lanmagan");
        await expect(header(page).getByRole('button', { name: /^qarz:/ })).toBeVisible();
        await expect(sheet(page).getByText(/to'lanmagan — bemorni kassaga/)).toBeVisible();

        // To'lov — kartadan chiqmasdan, kassadagi bilan bir xil oynada
        await sheet(page).getByRole('button', { name: /^To'lov qabul qilish$/ }).click();
        await page.getByRole('dialog').getByRole('button', { name: /^\d[\d\s]* qabul qilish$/ }).click();

        // Endi kassa — birinchi va o'tilgan bekat; qarz hamma joydan yo'qoladi
        await expect(stops(page).nth(0)).toContainText('Kassa', { timeout: 15_000 });
        await expect(stops(page).nth(0)).toContainText("to'landi");
        await expect(header(page).getByText("qarzi yo'q")).toBeVisible();
        await expect(sheet(page).getByText("to'liq to'langan")).toBeVisible();
        await expect(sheet(page).getByText(/to'lanmagan — bemorni kassaga/)).toHaveCount(0);
        await stillSamePage(page);
    });

    test("daftar oynada ochiladi; kam ishlatiladigan amallar «⋯» ostida", async ({ page }) => {
        const n = uniq();
        const surname = `Daftar${n}`;
        await login(page);
        await newPatientWithVisit(page, surname, n);

        /* Ilgari bo'lim sahifaning eng pastida, qabul paneli ostida
           ochilardi. Endi — oynada, o'z nomi bilan. */
        await history(page).getByRole('button', { name: /^Tashxislar/ }).click();
        const register = page.getByRole('dialog', { name: 'Tashxislar' });
        await expect(register).toBeVisible();
        await expect(register.getByPlaceholder(/MKB|kasallik/i).first()).toBeVisible();
        await register.getByRole('button', { name: 'Yopish' }).click();
        await expect(register).toHaveCount(0);

        // Sarlavhada tahrirlash tugmasi yo'q — u menyuda
        await expect(header(page).getByRole('button', { name: /^Tahrirlash$/ })).toHaveCount(0);
        await header(page).getByRole('button', { name: 'Boshqa amallar' }).click();
        await page.getByRole('menuitem', { name: 'Tahrirlash' }).click();
        await expect(page.locator('input[name="lastName"]')).toHaveValue(surname);
    });

    test("registrator ko'rikni o'qiydi, lekin yozolmaydi; shifokor pul qabul qilmaydi", async ({ page, browser }) => {
        test.setTimeout(150_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Rol${n}`, n);

        const noted = `Anamnezda gipertoniya ${n}`;
        await sheet(page).getByLabel('Kasallik anamnezi').fill(noted);
        await expect(saveLabel(page)).toContainText('saqlandi', { timeout: 15_000 });
        await orderStudy(page, `UZI ${n}`);
        const cardUrl = page.url();

        // ── Registrator: boshqa kompyuterda
        const regCtx = await browser.newContext();
        const reg = await regCtx.newPage();
        await login(reg, 'zilola.reg');
        await reg.goto(cardUrl);
        await expect(sheet(reg).getByRole('heading', { name: /Bugungi qabul/ })).toBeVisible({ timeout: 30_000 });
        // yozilgani ko'rinadi, lekin maydon emas — matn
        await expect(sheet(reg).getByText(noted)).toBeVisible();
        await expect(sheet(reg).getByLabel('Kasallik anamnezi')).toHaveCount(0);
        await expect(sheet(reg).getByPlaceholder(/Kod yoki kasallik nomi/)).toHaveCount(0);
        // shikoyat qabulxonada ham yoziladi
        await expect(sheet(reg).getByPlaceholder(/Bemor nimadan shikoyat/)).toBeEnabled();
        // pul — registratorning ishi
        await expect(sheet(reg).getByRole('button', { name: /^To'lov qabul qilish$/ })).toBeVisible();
        await regCtx.close();

        // ── Boshqa shifokor: yozadi, lekin pul qabul qilmaydi
        const docCtx = await browser.newContext();
        const doc = await docCtx.newPage();
        await login(doc, 'malika.yusupova');
        await doc.goto(cardUrl);
        /* BEGONA QABUL O'Z-O'ZIDAN OCHILMAYDI. Bu qabul boshqa shifokorniki:
           varaq o'zi saqlanadi, ya'ni bitta harf begona qabulga yozilib,
           uni «Qabulda» holatiga o'tkazib qo'yardi. Kerak bo'lsa — tarixdan,
           ataylab. */
        await expect(doc.getByRole('button', { name: /^Qabul ochish$/ })).toBeVisible({ timeout: 30_000 });
        const feed = history(doc).getByRole('list', { name: 'Tarix' });
        await feed.getByRole('button').filter({ hasText: 'ochiq' }).click();
        await history(doc).getByRole('button', { name: 'Varaqda ochish' }).click();
        await expect(sheet(doc).getByRole('heading', { name: /Bugungi qabul/ })).toBeVisible({ timeout: 30_000 });
        await expect(sheet(doc).getByLabel('Kasallik anamnezi')).toHaveValue(noted);
        await expect(sheet(doc).getByText(/to'lanmagan — bemorni kassaga/)).toBeVisible();
        await expect(sheet(doc).getByRole('button', { name: /^To'lov qabul qilish$/ })).toHaveCount(0);
        await docCtx.close();
    });
});
