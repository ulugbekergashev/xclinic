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


const sheet = (page: Page) => page.locator('section[aria-labelledby="visit-title"]');
const header = (page: Page) => page.locator('section[aria-labelledby="pt-name"]');
const history = (page: Page) => page.locator('section[aria-labelledby="hist-title"]');
/* Karta tablari (2026-11-20): «Bemor» · «Tarix» · «Tashxislar» … — sarlavha
   ostida. Birinchi tab «Bemor»: anamnez va qabul varag'i birga. Tarix —
   alohida tab: avval unga o'tiladi. */
const anamnesis = (page: Page) => page.locator('section[aria-labelledby="anamnesis-title"]');
const cardTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const openHistory = async (page: Page) => {
    await cardTab(page, /^Tarix/).click();
    await expect(history(page)).toBeVisible();
};
/* Bloklar ustidagi qabul sarlavhasi: kim, holat, shu qabulning puli, «Qabulni yakunlash» */
const bar = (page: Page) => sheet(page).locator('#visit-title').locator('xpath=../..');
/** Qabul sarlavhasidagi «saqlanmoqda / saqlandi · 12:21» yozuvi */
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
    await openVisitInCard(page, 'Terapiya');
    await expect(sheet(page).getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible({ timeout: 15_000 });
    /* Ko'rik formasi bo'sh qabulda yopiq turadi (2026-11-21) — «Ko'rik yozish» bilan ochiladi */
    await sheet(page).getByRole('button', { name: /^Ko'rik yozish$/ }).click();
}

/** Qabul tartibi: «Qabulni boshlash» → «Qabulni yakunlash» (2026-11-21) */
async function startVisit(page: Page) {
    const startBtn = sheet(page).getByRole('button', { name: /^Qabulni boshlash$/ });
    const finishBtn = sheet(page).getByRole('button', { name: /Qabulni yakunlash/ });
    await expect(startBtn.or(finishBtn)).toBeVisible({ timeout: 15_000 });
    if (await startBtn.isVisible()) await startBtn.click();
    await expect(finishBtn).toBeVisible({ timeout: 15_000 });
}

async function orderStudy(page: Page, name: string) {
    await openReferral(page);
    await sheet(page).getByRole('button', { name: /^Diagnostika$/ }).click();
    /* Prayslist tugma bo'lib turadi; prayslistda yo'q tekshiruv — «qo'lda yozish» orqali */
    const manualStudy = page.getByRole('button', { name: /qo'lda yozish/ });
    if (await manualStudy.isVisible()) await manualStudy.click();
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

        /* Ko'rik yozila boshladi — bemor endi kabinetda. Holat varaq
           tepasidagi qabul qatorida o'zi o'zgaradi. */
        await expect(bar(page).getByText(/(^|· )Qabulda$/)).toBeVisible({ timeout: 15_000 });

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

        await startVisit(page);
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
        /* Anamnez — birinchi tabda: ogohlantirish karta ochilishi bilan
           ko'rinadi, uni topish uchun boshqa tabga o'tish shart emas. */
        /* Yuklanmagan allergiya «so'ralmagan» ham deb aytilmaydi — biz
           bilmaymiz. Faqat ogohlantirish turadi. */
        const allergyAsk = anamnesis(page).getByRole('button', { name: 'Allergiya', exact: true });
        await expect(anamnesis(page).getByRole('alert')).toBeVisible();
        await expect(allergyAsk).toHaveCount(0);
        await expect(anamnesis(page).getByText("Allergiyasi yo'q")).toHaveCount(0);

        // Qayta urinish — sahifani yangilamasdan
        await page.unroute('**/api/patients/*/summary');
        await anamnesis(page).getByRole('button', { name: /Qayta urinish/i }).click();
        await expect(header(page).getByText("allergiya: ma'lumot yuklanmadi")).toHaveCount(0);
        // Endi aniq: allergiya hali so'ralmagan
        await expect(anamnesis(page).getByText("Hali so'ralmagan:")).toBeVisible();
        await expect(allergyAsk).toBeVisible();
    });

    test("yakunlangan qabuldan keyin shu kartadan yangisi ochiladi; yopilgani tarixda qoladi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Yakun${n}`, n);

        // Tashxis bloki: «+ Tashxis» → oynada qidiruv → tanlangani blokda
        await openAdd(page, 'Tashxis');
        await page.getByPlaceholder(/Kod yoki kasallik nomi/).fill('gipert');
        await page.getByRole('dialog').locator('button', { hasText: /^I1\d/ }).first().click();
        // Tashxis — «Bugungi qabul» ro'yxatida, boshqa qo'shilganlar bilan birga
        await expect(sheet(page).getByRole('list', { name: "Bugun qo'shilganlar" }).getByText(/^I1\d/)).toBeVisible({ timeout: 15_000 });
        /* Tashxisdan keyin oyna OCHIQ qoladi (2026-11-22) — «Tayyor» yopadi */
        await expect(page.getByRole('dialog')).toHaveCount(1);
        await page.getByRole('dialog').getByRole('button', { name: /^Tayyor$/ }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);

        await startVisit(page);
        await sheet(page).getByRole('button', { name: /Qabulni yakunlash/ }).click();
        const anyway = page.getByRole('button', { name: /Baribir yakunlash/ });
        await expect(sheet(page).getByText('Yakunlangan').or(anyway)).toBeVisible({ timeout: 15_000 });
        if (await anyway.isVisible()) await anyway.click();
        await expect(sheet(page).getByText('Yakunlangan')).toBeVisible({ timeout: 15_000 });

        // Yopilgan varaqda yozadigan narsa yo'q
        await expect(sheet(page).getByPlaceholder(/Kod yoki kasallik nomi/)).toHaveCount(0);
        await expect(sheet(page).getByRole('button', { name: /^Tahlil$/ })).toHaveCount(0);

        /* Ilgari yakunlangan qabul varaqda qolardi va sahifa qayta
           yuklanmaguncha yangisini ochishning iloji yo'q edi. */
        await sheet(page).getByRole('button', { name: /^Yangi qabul$/ }).click();
        await expect(page.getByRole('button', { name: /^Qabul ochish/ })).toBeVisible();

        // Yopilgan qabul yo'qolmadi — «Tarix» tabidan qayta ochiladi
        await openHistory(page);
        const feed = history(page).getByRole('list', { name: 'Tarix' });
        await feed.getByRole('button').first().click();
        await history(page).getByRole('button', { name: 'Qabulni ochish' }).click();
        await expect(cardTab(page, /^Umumiy/)).toHaveAttribute('aria-selected', 'true');
        await expect(sheet(page).getByText('Yakunlangan')).toBeVisible({ timeout: 15_000 });
    });

    test("to'lov chap kartochkada, «Qarz» ostida olinadi; qabul sarlavhasi ham yangilanadi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Marshrut${n}`, n);
        await mark(page);

        await orderStudy(page, `UZI ${n}`);

        /* Chapdagi kartochkada «Qarz» — bemorning HAMMA qarzi va uning ostida
           «To'lov qabul qilish». Qabul sarlavhasida faqat yozuv: «Bu qabul: …
           to'lanmagan». Ilgari u yerdagi «To'lash» shu qabulning summasini
           yozib turib, butun qarz oynasini ochardi (2026-11-21). */
        await expect(page.getByText('Bugungi ish')).toHaveCount(0);
        await expect(header(page).getByRole('button', { name: /^Qarz [1-9]/ })).toBeVisible({ timeout: 15_000 });
        await expect(bar(page).getByText(/to'lanmagan/)).toBeVisible({ timeout: 15_000 });
        await expect(bar(page).getByRole('button', { name: /To'la/ })).toHaveCount(0);

        // To'lov — kartadan chiqmasdan, kassadagi bilan bir xil oynada
        await header(page).getByRole('button', { name: /^To'lov qabul qilish$/ }).click();
        await page.getByRole('dialog').getByRole('button', { name: /^\d[\d\s]* qabul qilish$/ }).click();

        await expect(bar(page).getByText("to'liq to'langan")).toBeVisible({ timeout: 15_000 });
        await expect(bar(page).getByText(/to'lanmagan/)).toHaveCount(0);
        await expect(header(page).getByRole('button', { name: /^Qarz 0$/ })).toBeVisible({ timeout: 15_000 });
        await expect(header(page).getByRole('button', { name: /^To'lov qabul qilish$/ })).toHaveCount(0);
        await stillSamePage(page);
    });

    test("tab shu joyda ochiladi, oyna chiqmaydi; kam ishlatiladigan amallar «⋯» ostida", async ({ page }) => {
        const n = uniq();
        const surname = `Daftar${n}`;
        await login(page);
        await newPatientWithVisit(page, surname, n);

        /* Ilgari «Daftarlar» tugmasi OYNA ochardi. Endi «Tashxislar» —
           sarlavha ostidagi tab: shu joyda ochiladi, oyna chiqmaydi. */
        await expect(page.getByText('Daftarlar')).toHaveCount(0);
        // Birinchi tab — «Bemor»; «Qabul» va «Anamnez» alohida tab emas
        await expect(page.getByRole('tab').first()).toHaveText(/^Umumiy/);
        await expect(cardTab(page, /^(Qabul|Anamnez)/)).toHaveCount(0);
        await cardTab(page, /^Tashxislar/).click();
        await expect(cardTab(page, /^Tashxislar/)).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        /* Qidiruv «+ Tashxis qo'yish» tugmasi ostida (2026-11-22): ilgari nomsiz
           maydon tugma deb tanilmasdi. Tab bo'yicha boshqa tablar ham tugmali. */
        await page.getByRole('tabpanel').getByRole('button', { name: /Tashxis qo'yish/ }).click();
        await expect(page.getByRole('tabpanel').getByPlaceholder(/MKB|kasallik/i).first()).toBeVisible();
        await expect(page.getByRole('tab', { name: /^(Yozuvlar|Materiallar)/ })).toHaveCount(0);

        // Varaq yo'qolmadi: «Bemor» tabiga qaytsa, o'sha joyida turibdi
        await cardTab(page, /^Umumiy/).click();
        await expect(sheet(page)).toBeVisible();

        /* Kam ishlatiladigan amallar — chapdagi bemor kartochkasining
           pastida kichik belgilar qatori (DentaCRM'dagidek) */
        await header(page).getByRole('button', { name: 'Tahrirlash' }).click();
        await expect(page.locator('input[name="lastName"]')).toHaveValue(surname);
    });

    test("noutbuk ekranida bemor, to'lov, «Yakunlash» va qabulning hamma bloki birinchi qarashda ko'rinadi", async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 1366, height: 768 });
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Ekran${n}`, n);
        await orderStudy(page, `UZI ${n}`);

        /* Ilgari «Qabulni yakunlash» va to'lov varaqning eng pastida edi va
           ularga 3–4 marta aylantirib yetilardi. Endi — qabul qutisining
           sarlavhasida, bemor kartochkasi esa chapda. */
        await startVisit(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(sheet(page).getByRole('button', { name: /Qabulni yakunlash/ })).toBeInViewport();
        await expect(header(page).getByRole('button', { name: /^To'lov qabul qilish$/ })).toBeInViewport();
        await expect(header(page).getByRole('heading', { name: new RegExp(`Ekran${n}`) })).toBeInViewport();

        /* IKKI BLOK (2026-11-21, DentaCRM namunasida): «Bugungi qabul» va
           «Tibbiy tarix» — ikkalasining sarlavhasi aylantirmasdan ko'rinadi.
           Bugun qo'shilgan hamma narsa — bitta ro'yxatda. */
        for (const name of ['Bugungi qabul', 'Tibbiy tarix']) {
            await expect(sheet(page).getByRole('heading', { level: 2, name, exact: true })).toBeInViewport();
        }
        await expect(anamnesis(page)).toBeInViewport();
        await expect(sheet(page).getByRole('list', { name: "Bugun qo'shilganlar" }).getByText(`UZI ${n}`)).toBeVisible();

        // Bitta «+ Qo'shish» — hamma tur bitta oynada
        await sheet(page).getByRole('button', { name: /^Qo'shish$/ }).click();
        const kinds = page.getByRole('dialog').getByRole('group', { name: 'Nima qo\'shiladi' }).getByRole('button');
        // Shifokor ishlaydigan tartibda: tashxis birinchi, xizmat oxirida (2026-11-22)
        await expect(kinds).toHaveText(['Tashxis', 'Tahlil', 'Diagnostika', 'Dori', 'Xizmat', 'Boshqa shifokor']);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test("anamnez birinchi tabda: kasallik bir bosishda qo'shiladi va o'zi saqlanadi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Anamnez${n}`, n);

        /* Ilgari: to'qqizinchi tab, matn maydoni, «Saqlash» tugmasi va
           «GIPERTONIYA (DAVLENIYA)-I 11.0» ko'rinishidagi tugmalar. Endi blok
           varaqning yonida turadi va «Saqlash» tugmasi yo'q. */
        const conditions = anamnesis(page).getByRole('list', { name: 'Kasalliklari' });
        await expect(anamnesis(page)).toBeVisible();
        await expect(sheet(page)).toBeVisible();
        await expect(anamnesis(page).getByRole('button', { name: /^Saqlash$/ })).toHaveCount(0);

        /* Yangi bemorda hech narsa so'ralmagan — bo'sh qatorlar emas, bitta
           sariq qator: «Hali so'ralmagan: Allergiya, Kasalliklari, …» */
        await expect(anamnesis(page).getByText("Hali so'ralmagan:")).toBeVisible({ timeout: 15_000 });
        await anamnesis(page).getByRole('button', { name: 'Kasalliklari', exact: true }).click();
        const picker = anamnesis(page).getByRole('group', { name: 'Kasalliklari' });
        const hypertension = picker.getByRole('button', { name: /^Gipertoniya/ });
        await hypertension.click();
        await expect(hypertension).toHaveAttribute('aria-pressed', 'true');
        await expect(conditions.getByText('Gipertoniya')).toBeVisible();

        // Ro'yxatda yo'q kasallik — maydonga yoziladi
        const other = `Bronxial astma ${n}`;
        await picker.getByLabel('Boshqa kasallik yoki izoh').fill(other);
        await picker.getByLabel('Boshqa kasallik yoki izoh').press('Enter');
        await expect(conditions.getByText(other)).toBeVisible();
        await picker.getByRole('button', { name: /^Tayyor$/ }).click();
        await expect(picker).toHaveCount(0);

        // Saqlangan: sahifa yangilangach ham turadi
        await expect(async () => {
            await page.reload();
            await expect(conditions.getByText('Gipertoniya')).toBeVisible({ timeout: 15_000 });
            await expect(conditions.getByText(other)).toBeVisible();
        }).toPass({ timeout: 60_000 });

        // Olib tashlash — bitta bosish
        await conditions.getByRole('button', { name: 'Olib tashlash: Gipertoniya' }).click();
        await expect(conditions.getByText('Gipertoniya')).toHaveCount(0);
        await expect(conditions.getByText(other)).toBeVisible();
    });

    test("tibbiy tarix: «yo'q», doimiy dori va qon guruhi bosib belgilanadi va saqlanadi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Tarix${n}`, n);
        await expect(anamnesis(page).getByText("Hali so'ralmagan:")).toBeVisible({ timeout: 15_000 });

        // «Yo'q» — aniq javob: «allergiyasi yo'q» yashil belgi bo'lib turadi
        await anamnesis(page).getByRole('button', { name: 'Allergiya', exact: true }).click();
        await anamnesis(page).getByRole('group', { name: 'Allergiya' }).getByRole('button', { name: "Allergiyasi yo'q" }).click();
        await anamnesis(page).getByRole('group', { name: 'Allergiya' }).getByRole('button', { name: /^Tayyor$/ }).click();
        await expect(anamnesis(page).getByRole('list', { name: 'Allergiya' }).getByText("Allergiyasi yo'q")).toBeVisible();

        // Qonni suyultiradigan dori — ogohlantirish bilan
        await anamnesis(page).getByRole('button', { name: 'Doimiy dorilar', exact: true }).click();
        const meds = anamnesis(page).getByRole('group', { name: 'Doimiy dorilar' });
        await meds.getByRole('button', { name: 'Varfarin' }).click();
        await meds.getByRole('button', { name: /^Tayyor$/ }).click();
        const medList = anamnesis(page).getByRole('list', { name: 'Doimiy dorilar' });
        await expect(medList.getByText('Varfarin')).toBeVisible();
        await expect(medList.getByText(/qonni suyultiradi/)).toBeVisible();

        // Qon guruhi
        await anamnesis(page).getByRole('button', { name: 'Qon guruhi', exact: true }).click();
        const blood = anamnesis(page).getByRole('group', { name: 'Qon guruhi' });
        await blood.getByRole('button', { name: 'II (A)' }).click();
        await blood.getByRole('button', { name: 'Rh+' }).click();
        await blood.getByRole('button', { name: /^Tayyor$/ }).click();

        // Saqlangan, kim va qachon yozilgan
        await expect(async () => {
            await page.reload();
            await expect(anamnesis(page).getByText("Allergiyasi yo'q")).toBeVisible({ timeout: 15_000 });
            await expect(medList.getByText('Varfarin')).toBeVisible();
            await expect(anamnesis(page).getByRole('list', { name: 'Qon guruhi' })).toContainText('II · Rh+');
            await expect(anamnesis(page).getByText(/^yangilandi /)).toBeVisible();
        }).toPass({ timeout: 60_000 });
        // So'ralganlari sariq qatordan chiqdi
        await expect(anamnesis(page).getByRole('button', { name: 'Allergiya', exact: true })).toHaveCount(0);
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
        await expect(sheet(reg).getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible({ timeout: 30_000 });
        // yozilgani ko'rinadi, lekin maydon emas — matn
        await expect(sheet(reg).getByText(noted)).toBeVisible();
        await expect(sheet(reg).getByLabel('Kasallik anamnezi')).toHaveCount(0);
        await expect(sheet(reg).getByPlaceholder(/Kod yoki kasallik nomi/)).toHaveCount(0);
        // shikoyat qabulxonada ham yoziladi
        await expect(sheet(reg).getByPlaceholder(/Bemor nimadan shikoyat/)).toBeEnabled();
        // pul — registratorning ishi: chapdagi kartochkada, «Qarz» ostida
        await expect(header(reg).getByRole('button', { name: /^To'lov qabul qilish$/ })).toBeVisible();
        /* Tibbiy tarixni registrator ham to'ldiradi — allergiya ham
           (klinika egasi, 2026-11-21; server ham ruxsat beradi) */
        await anamnesis(reg).getByRole('button', { name: 'Allergiya', exact: true }).click();
        await anamnesis(reg).getByRole('group', { name: 'Allergiya' }).getByRole('button', { name: 'Lidokain' }).click();
        await expect(anamnesis(reg).getByRole('list', { name: 'Allergiya' }).getByText('Lidokain')).toBeVisible({ timeout: 15_000 });
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
        /* Shifokorga forma — bitta «Qabulni boshlash» (o'ziga, 2026-11-22) */
        await expect(doc.getByText('Bugun qabul ochilmagan')).toBeVisible({ timeout: 30_000 });
        await openHistory(doc);
        const feed = history(doc).getByRole('list', { name: 'Tarix' });
        await feed.getByRole('button').filter({ hasText: 'ochiq' }).click();
        await history(doc).getByRole('button', { name: 'Qabulni ochish' }).click();
        await expect(sheet(doc).getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible({ timeout: 30_000 });
        await expect(sheet(doc).getByLabel('Kasallik anamnezi')).toHaveValue(noted);
        await expect(bar(doc).getByText(/to'lanmagan/)).toBeVisible();
        await expect(header(doc).getByRole('button', { name: /^To'lov qabul qilish$/ })).toHaveCount(0);
        await docCtx.close();
    });
});
