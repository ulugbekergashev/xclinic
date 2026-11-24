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
 *   4. tablar shu joyda ochiladi, kam ishlatiladigan amallar «⋯» ostida;
 *   5. registrator ko'rikni o'qiydi, lekin yozolmaydi; shifokor pul olmaydi.
 *
 * Qabul ochish, tashxis va tarix lentasi — `visitcard.spec.ts` da.
 */
import { test, expect, Page } from '@playwright/test';
import { login, go, uniq, openVisitInCard, visitSheet, openOrder, addDiagnosis, orderStudy } from './helpers';

const sheet = visitSheet;
const header = (page: Page) => page.locator('section[aria-labelledby="pt-name"]');
const history = (page: Page) => page.locator('section[aria-labelledby="hist-title"]');
/* Karta tablari (2026-11-23, vrach ish joyi): «Qabul» · «Tarix» ·
   «Tahlillar» · «Anamnez» · «Hujjatlar» · «To'lovlar». Anamnez (allergiya,
   kasalliklar) — o'z tabida: u bemorga tegishli, qabulga emas. Ilgari
   qabul varag'ining o'ng ustunida («Tibbiy tarix») turardi. */
const anamnesis = (page: Page) => page.locator('section[aria-labelledby="anamnesis-title"]');
const cardTab = (page: Page, name: RegExp) => page.getByRole('tab', { name });
const openHistory = async (page: Page) => {
    await cardTab(page, /^Tarix/).click();
    await expect(history(page)).toBeVisible();
};
const openAnamnesis = async (page: Page) => {
    await cardTab(page, /^Anamnez/).click();
    await expect(anamnesis(page)).toBeVisible({ timeout: 15_000 });
};
/* Varaqning matn maydonlari: «Shikoyat va kasallik anamnezi» (qabulxonada
   ham yoziladi) va «Ko'rik» (faqat shifokor) */
const complaintField = (page: Page) => sheet(page).getByLabel('Shikoyat va kasallik anamnezi', { exact: true });
const examField = (page: Page) => sheet(page).getByLabel("Ko'rik", { exact: true });
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
    // Ko'rik bloki doim ochiq — alohida «Ko'rik yozish» tugmasi yo'q (2026-11-23)
    await expect(examField(page)).toBeVisible();
}

/** Qabul tartibi: «Qabulni boshlash» → «Qabulni yakunlash» (2026-11-21) */
async function startVisit(page: Page) {
    const startBtn = sheet(page).getByRole('button', { name: /^Qabulni boshlash$/ });
    const finishBtn = sheet(page).getByRole('button', { name: /Qabulni yakunlash/ });
    await expect(startBtn.or(finishBtn)).toBeVisible({ timeout: 15_000 });
    if (await startBtn.isVisible()) await startBtn.click();
    await expect(finishBtn).toBeVisible({ timeout: 15_000 });
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
        const exam = examField(page);
        const typed = `Umumiy holati qoniqarli, o'pkada vezikulyar nafas ${n}`;
        await exam.pressSequentially(typed, { delay: 70 });
        await expect(exam).toHaveValue(typed);

        const complaint = complaintField(page);
        await complaint.fill(`Holsizlik ${n}`);
        await exam.click();   // shikoyatdan chiqildi — u ham ketadi
        await expect(saveLabel(page)).toContainText('saqlandi', { timeout: 15_000 });
        await expect(exam).toHaveValue(typed);

        // Haqiqatan serverga yozilganmi — sahifani qayta yuklab ko'ramiz
        await page.reload();
        await expect(examField(page)).toHaveValue(typed, { timeout: 30_000 });
        await expect(complaintField(page)).toHaveValue(`Holsizlik ${n}`);

        /* Ko'rik yozila boshladi — bemor endi kabinetda. Holat varaq
           tepasidagi qabul qatorida o'zi o'zgaradi. */
        await expect(bar(page).getByText(/(^|· )Qabulda$/)).toBeVisible({ timeout: 15_000 });
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
        const pulse = sheet(page).getByRole('spinbutton', { name: /^Puls/ });
        await pulse.fill('72');
        const noted = `Tomoq qizargan, bodomcha bezlari kattalashgan ${n}`;
        await examField(page).fill(noted);

        /* TO'SIQNI AYLANIB O'TIB BO'LMAYDI. Shikoyat tahrirlansa yorliq
           «saqlandi» ga o'zgarardi va «Yakunlash» o'tib ketardi — xato
           qiymat bilan. Endi to'siq yorliqqa bog'liq emas. */
        const complaint = complaintField(page);
        await complaint.fill(`Isitma ${n}`);
        await temperature.focus();   // shikoyatdan chiqildi — u saqlanadi
        await page.waitForTimeout(3500);
        await expect(saveLabel(page)).toContainText('chegaradan tashqari');

        await startVisit(page);
        await sheet(page).getByRole('button', { name: /Qabulni yakunlash/ }).click();
        await expect(sheet(page).getByRole('button', { name: /Qabulni yakunlash/ })).toBeVisible();
        await expect(sheet(page).getByText('Yakunlangan')).toHaveCount(0);

        // Serverda: ko'rik va shikoyat bor, 500 daraja — yo'q
        await page.reload();
        await expect(examField(page)).toHaveValue(noted, { timeout: 30_000 });
        await expect(complaintField(page)).toHaveValue(`Isitma ${n}`);
        await expect(sheet(page).getByRole('spinbutton', { name: /^Puls/ })).toHaveValue('72');
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
        /* Ogohlantirish karta ochilishi bilan chapdagi bemor kartochkasida
           ko'rinadi — uni topish uchun boshqa tabga o'tish shart emas. */
        await expect(header(page).getByText("allergiya: ma'lumot yuklanmadi")).toBeVisible({ timeout: 30_000 });
        /* «Anamnez» tabida ham: yuklanmagan allergiya «so'ralmagan» deb
           aytilmaydi — biz bilmaymiz. Faqat ogohlantirish turadi. */
        await openAnamnesis(page);
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

        /* Tashxis bloki: qidiruv varaqning o'zida → tanlangani blok ro'yxatida.
           Oyna yo'q — yopadigan «Tayyor» ham yo'q (2026-11-23). */
        await addDiagnosis(page);
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
        await expect(cardTab(page, /^Qabul/)).toHaveAttribute('aria-selected', 'true');
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

        /* Ilgari «Daftarlar» tugmasi OYNA ochardi. Endi «Anamnez» —
           sarlavha ostidagi tab: shu joyda ochiladi, oyna chiqmaydi. */
        await expect(page.getByText('Daftarlar')).toHaveCount(0);
        /* Tablar (2026-11-23): birinchisi «Qabul». «Tashxislar» va «Retseptlar»
           yo'q — tashxis va retsept qabulda yoziladi, har qabulniki «Tarix» da.
           Tablarda «+» tugmalar ham yo'q. */
        await expect(page.getByRole('tab')).toHaveText([/^Qabul/, /^Tarix/, /^Tahlillar/, /^Anamnez/, /^Hujjatlar/, /^To'lovlar/]);
        await expect(cardTab(page, /^(Tashxislar|Retseptlar|Umumiy|Yozuvlar|Materiallar)/)).toHaveCount(0);
        await cardTab(page, /^Anamnez/).click();
        await expect(cardTab(page, /^Anamnez/)).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('tabpanel').locator('section[aria-labelledby="anamnesis-title"]')).toBeVisible();
        // Anamnez varaqda emas — faqat o'z tabida
        await expect(sheet(page)).toBeHidden();

        // Varaq yo'qolmadi: «Qabul» tabiga qaytsa, o'sha joyida turibdi
        await cardTab(page, /^Qabul/).click();
        await expect(sheet(page)).toBeVisible();
        await expect(anamnesis(page)).toHaveCount(0);

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

        /* «Qabulni yakunlash» ilgari varaqning eng pastida edi va unga 3–4
           marta aylantirib yetilardi. Endi varaq pastiga YOPISHIB turadi
           (2026-11-23): uzun varaqda ham aylantirmasdan ko'rinadi. */
        await startVisit(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(sheet(page).getByRole('button', { name: /Qabulni yakunlash/ })).toBeInViewport();
        await expect(header(page).getByRole('button', { name: /^To'lov qabul qilish$/ })).toBeInViewport();
        await expect(header(page).getByRole('heading', { name: new RegExp(`Ekran${n}`) })).toBeInViewport();

        /* BITTA USTUN (2026-11-23, vrach ish joyi): shifokor ishlaydigan
           tartibda beshta blok. Boshidagisi aylantirmasdan ko'rinadi, qolgani
           pastda — vrach yuqoridan pastga yozadi. */
        await expect(sheet(page).getByRole('heading', { level: 2, name: 'Bugungi qabul', exact: true })).toBeInViewport();
        await expect(sheet(page).getByRole('heading', { level: 3, name: 'Shikoyat va kasallik anamnezi', exact: true })).toBeInViewport();
        for (const name of ["Ko'rik", 'Tashxis', 'Tayinlovlar', 'Xulosa va tavsiyalar']) {
            await expect(sheet(page).getByRole('heading', { level: 3, name, exact: true })).toHaveCount(1);
        }
        // «Tibbiy tarix» varaqda yo'q — anamnez o'z tabida
        await expect(sheet(page).getByRole('heading', { name: 'Tibbiy tarix' })).toHaveCount(0);
        await expect(anamnesis(page)).toHaveCount(0);
        await expect(sheet(page).getByRole('list', { name: "Bugun qo'shilganlar" }).getByText(`UZI ${n}`)).toBeVisible();

        /* «Tayinlovlar» — beshta ochiq tugma; bitta «+ Qo'shish» va uning
           «Nima qo'shiladi» tab qatori olib tashlandi. */
        await expect(sheet(page).getByRole('button', { name: /^Qo'shish$/ })).toHaveCount(0);
        for (const kind of ['Tahlil', 'Diagnostika', 'Dori', 'Xizmat', "Yo'naltirish"]) {
            await expect(sheet(page).getByRole('button', { name: kind, exact: true })).toBeVisible();
        }
        // Tugma o'z oynasini ochadi — ichida boshqa turlarga o'tadigan tab yo'q
        await openOrder(page, 'Dori');
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('group', { name: "Nima qo'shiladi" })).toHaveCount(0);
        await expect(dialog.getByRole('button', { name: /^(Tahlil|Diagnostika|Xizmat|Tashxis)$/ })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test("anamnez tabida: kasallik bir bosishda qo'shiladi va o'zi saqlanadi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        await login(page);
        await newPatientWithVisit(page, `Anamnez${n}`, n);

        /* Ilgari: to'qqizinchi tab, matn maydoni, «Saqlash» tugmasi va
           «GIPERTONIYA (DAVLENIYA)-I 11.0» ko'rinishidagi tugmalar. Endi
           «Anamnez» — kartaning to'rtinchi tabi va «Saqlash» tugmasi yo'q. */
        const conditions = anamnesis(page).getByRole('list', { name: 'Kasalliklari' });
        await openAnamnesis(page);
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
            await openAnamnesis(page);
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
        await openAnamnesis(page);
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
            await openAnamnesis(page);
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

        const noted = `Yurak tonlari aniq, AB yuqori ${n}`;
        await examField(page).fill(noted);
        await expect(saveLabel(page)).toContainText('saqlandi', { timeout: 15_000 });
        await orderStudy(page, `UZI ${n}`);
        const cardUrl = page.url();

        // ── Registrator: boshqa kompyuterda
        const regCtx = await browser.newContext();
        const reg = await regCtx.newPage();
        await login(reg, 'zilola.reg');
        await reg.goto(cardUrl);
        await expect(sheet(reg).getByRole('heading', { name: /^Bugungi qabul$/ })).toBeVisible({ timeout: 30_000 });
        // yozilgan ko'rik ko'rinadi, lekin maydon emas — matn
        await expect(sheet(reg).getByText(noted)).toBeVisible();
        await expect(examField(reg)).toHaveCount(0);
        await expect(sheet(reg).getByPlaceholder(/Kod yoki kasallik nomi/)).toHaveCount(0);
        // shikoyat qabulxonada ham yoziladi
        await expect(complaintField(reg)).toBeEnabled();
        // pul — registratorning ishi: chapdagi kartochkada, «Qarz» ostida
        await expect(header(reg).getByRole('button', { name: /^To'lov qabul qilish$/ })).toBeVisible();
        /* Anamnezni registrator ham to'ldiradi — allergiya ham
           (klinika egasi, 2026-11-21; server ham ruxsat beradi) */
        await openAnamnesis(reg);
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
        await expect(examField(doc)).toHaveValue(noted);
        await expect(bar(doc).getByText(/to'lanmagan/)).toBeVisible();
        await expect(header(doc).getByRole('button', { name: /^To'lov qabul qilish$/ })).toHaveCount(0);
        await docCtx.close();
    });
});
