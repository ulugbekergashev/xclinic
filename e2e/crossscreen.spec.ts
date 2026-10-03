/* EKRANLAR ORASIDAGI BOG'LANISH.
 *
 * Har bir sinov bitta savolga javob beradi: «A ekranda qilingan amal
 * B ekranda SAHIFANI QAYTA YUKLAMASDAN ko'rinadimi?»
 *
 * NIMA UCHUN ALOHIDA FAYL. Modul sinovlari (`staff`, `inventory`,
 * `labcatalog`) amalni o'sha ekranning o'zida tekshiradi va yashil
 * turadi. Xato esa ekranlar ORASIDA edi: Sozlamalarda qo'shilgan bo'lim
 * Registraturada chiqmasdi, chunki Sozlamalar o'z ro'yxatini yangilardi,
 * Registratura esa kirishda bir marta yuklangan umumiy ro'yxatni o'qirdi.
 *
 * QOIDA: ekranlar orasida MENYU orqali o'tiladi (`nav`), `page.goto`
 * bilan emas — foydalanuvchi ham shunday qiladi va sahifa qayta
 * yuklanmasligi shu sinovning butun mazmuni.
 */
import { test, expect, Page, Browser } from '@playwright/test';
import { login, uniq } from './helpers';

/* SAHIFA QAYTA YUKLANMAGANINI ISBOTLASH.
 *
 * Qayta yuklash hamma ro'yxatni serverdan yangidan oladi, ya'ni xato
 * bo'lsa ham sinov yashil chiqadi. `enter` oynaga belgi qo'yadi, har
 * sinov oxirida `stillSamePage` uni tekshiradi: belgi yo'qolgan bo'lsa
 * sahifa qayta yuklangan va natijaga ishonib bo'lmaydi. */
async function enter(page: Page, username = 'admin') {
    await login(page, username);
    await page.evaluate(() => { (window as any).__sameDocument = true; });
}

async function stillSamePage(page: Page) {
    expect(await page.evaluate(() => (window as any).__sameDocument === true),
        'sahifa sinov davomida qayta yuklangan').toBe(true);
}

/** Yon paneldagi punkt orqali o'tish — sahifa qayta yuklanmaydi. */
async function nav(page: Page, label: RegExp) {
    await page.locator('aside, nav').getByRole('link', { name: label }).first().click();
    await page.waitForTimeout(600);
}

async function settingsTab(page: Page, label: RegExp) {
    await nav(page, /^Sozlamalar$/);
    await page.getByRole('button', { name: label }).first().click();
    await page.waitForTimeout(500);
}

async function addDepartment(page: Page, name: string) {
    await settingsTab(page, /^Bo'limlar$/);
    await page.getByRole('button', { name: /Bo'lim qo'shish/ }).click();
    await page.getByPlaceholder(/Masalan: Kardiologiya/).fill(name);
    await page.getByRole('button', { name: /^Saqlash$/ }).click();
    await expect(page.getByText(name).first()).toBeVisible();
}

/** Bemorlar ekranida yangi bemor. Familiya noyob — keyin shu bo'yicha topiladi. */
async function addPatient(page: Page, surname: string, n: string) {
    await nav(page, /^Bemorlar$/);
    await page.getByRole('button', { name: /Bemor qo'shish/ }).first().click();
    await page.locator('input[name="lastName"]').fill(surname);
    await page.locator('input[name="firstName"]').fill('Sinov');
    await page.locator('input[name="phone"]').fill(`+99890${n.slice(0, 7)}`);
    await page.locator('input[name="dob"]').fill('1988-04-12');
    await page.getByRole('button', { name: /^Saqlash$/ }).click();
    await expect(page.getByText(surname).first()).toBeVisible();
}

/** «Bugun» dagi «Yangi qabul» oynasi — qabul masterosi shu yerda. */
async function openIntake(page: Page) {
    await nav(page, /^Bugun$/);
    await page.getByRole('button', { name: /^Yangi qabul$/ }).click();
    await expect(page.locator('#rc-dept')).toBeVisible();
}

/** Oyna yon menyuni yopib turadi — boshqa ekranga o'tishdan oldin yopiladi,
    foydalanuvchi ham shunday qiladi. */
async function closeIntake(page: Page) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Yangi qabul' })).toHaveCount(0);
}

/** «Yangi qabul» oynasida qabul ochish: bemor → bo'lim → shifokor → xizmat. */
async function openVisitAtReception(page: Page, surname: string, dept: RegExp) {
    await openIntake(page);
    await page.getByRole('dialog').getByPlaceholder(/qidir|ism|telefon/i).first().fill(surname);
    await page.getByRole('button', { name: new RegExp(surname) }).first().click();
    const deptSelect = page.locator('#rc-dept');
    const value = await deptSelect.locator('option', { hasText: dept }).first().getAttribute('value');
    await deptSelect.selectOption(value!);
    await page.locator('#rc-doctor').selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Qabulni ochish/ }).click();
    await expect(page.getByText(/Qabul ochildi/).first()).toBeVisible();
}

/** Bemor kartasida qabul ochib, UZI buyuradi — to'lanmagan qator tug'iladi. */
async function orderStudyInCard(page: Page, surname: string, studyName: string) {
    await page.getByText(surname).first().click();
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
    await expect(page.getByText('Joriy qabul')).toBeVisible();
    await page.getByRole('button', { name: /^Diagnostikaga$/ }).click();
    await page.getByPlaceholder(/Masalan: Qorin/).fill(studyName);
    await page.getByPlaceholder(/^Narx$/).fill('90000');
    await page.getByRole('button', { name: /^Diagnostikaga yuborish$/ }).click();
    await expect(page.getByText(/to'lanmagan — bemorni kassaga/)).toBeVisible();
}

async function secondScreen(browser: Browser, username: string) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await enter(page, username);
    return { ctx, page };
}

test.describe('bir kompyuterda', () => {
    test("Sozlamalarda qo'shilgan bo'lim Registraturada darhol chiqadi", async ({ page }) => {
        const name = `Urologiya${uniq().slice(0, 4)}`;
        await enter(page);
        await addDepartment(page, name);

        await openIntake(page);
        await expect(page.locator('#rc-dept option', { hasText: name })).toHaveCount(1);
        await stillSamePage(page);
    });

    test("faolsizlantirilgan bo'lim Registraturadan ketadi, yoqilsa qaytadi", async ({ page }) => {
        const name = `Okulist${uniq().slice(0, 4)}`;
        await enter(page);
        await addDepartment(page, name);

        const row = page.locator('div.border.rounded-lg', { hasText: name }).last();
        await row.getByRole('button', { name: /^Faolsizlantirish$/ }).click();
        // Tasdiqlash oynasi — amal qaytariladi, lekin tasodifan bosilmasin
        await page.getByRole('dialog').getByRole('button', { name: /^Faolsizlantirish$/ }).click();
        await expect(row.getByText(/O'chirilgan/i)).toBeVisible();

        await openIntake(page);
        await expect(page.locator('#rc-dept option', { hasText: name })).toHaveCount(0);
        await closeIntake(page);

        await settingsTab(page, /^Bo'limlar$/);
        await page.locator('div.border.rounded-lg', { hasText: name }).last()
            .getByRole('button', { name: /^Yoqish$/ }).click();
        await openIntake(page);
        await expect(page.locator('#rc-dept option', { hasText: name })).toHaveCount(1);
        await stillSamePage(page);
    });

    test("Registraturada ochilgan qabul kassada to'lanadi", async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        const surname = `Kassa${n}`;
        await enter(page);
        await addPatient(page, surname, n);
        await openVisitAtReception(page, surname, /^Terapiya$/);

        await nav(page, /^Moliya$/);
        const row = page.locator('li', { hasText: surname }).first();
        await expect(row).toBeVisible();
        await row.getByRole('button', { name: /^To'lash$/ }).click();

        /* Aynan shu joy yiqilardi: bemor ro'yxatda qarzi bilan turardi,
           oyna esa «To'lanmagan qator yo'q» derdi — qatorlar kirishda
           yuklangan eski ro'yxatdan olinardi. */
        await expect(page.getByText(/To'lanmagan qator yo'q/)).toHaveCount(0);
        await expect(page.getByText(/Terapevt konsultatsiyasi/).last()).toBeVisible();
        // Oynadagi tugma summa bilan boshlanadi: «60 000 qabul qilish»
        await page.getByRole('button', { name: /^\d[\d\s]* qabul qilish$/ }).click();
        await expect(page.getByText(/so'm qabul qilindi/).first()).toBeVisible();

        // To'langach bemor qarzdorlar ro'yxatidan ketadi
        await expect(page.locator('li', { hasText: surname })
            .getByRole('button', { name: /^To'lash$/ })).toHaveCount(0);
        await stillSamePage(page);
    });

    test('bemor kartasida buyurilgan tahlil Laboratoriyada chiqadi', async ({ page }) => {
        test.setTimeout(120_000);
        const n = uniq();
        const surname = `Tahlil${n}`;
        await enter(page);
        await addPatient(page, surname, n);

        await page.getByText(surname).first().click();
        await page.locator('select').first().selectOption({ index: 1 });
        await page.getByRole('button', { name: /^Qabul ochish$/ }).click();
        await expect(page.getByText('Joriy qabul')).toBeVisible();

        await page.getByRole('button', { name: /^Tahlilga$/ }).click();
        await page.locator('label', { has: page.locator('input[type="checkbox"]') }).first().click();
        await page.getByRole('button', { name: /^Laboratoriyaga yuborish$/ }).click();
        await page.waitForTimeout(1500);

        await nav(page, /^Laboratoriya$/);
        await expect(page.getByText(surname).first()).toBeVisible();
        await stillSamePage(page);
    });
});

test.describe('ikki kompyuterda', () => {
    test("ega bo'lim qo'shadi — registrator qayta kirmasdan ko'radi", async ({ page, browser }) => {
        const name = `Endokrin${uniq().slice(0, 4)}`;
        const reg = await secondScreen(browser, 'admin');
        await openIntake(reg.page);

        await enter(page);
        await addDepartment(page, name);

        await expect(reg.page.locator('#rc-dept option', { hasText: name })).toHaveCount(1);
        await stillSamePage(reg.page);
        await reg.ctx.close();
    });

    test("registrator qabul ochadi — kassir ochiq turgan kassada ko'radi", async ({ page, browser }) => {
        test.setTimeout(120_000);
        const n = uniq();
        const surname = `Ikki${n}`;

        const cashier = await secondScreen(browser, 'admin');
        await nav(cashier.page, /^Moliya$/);

        await enter(page);
        await addPatient(page, surname, n);
        await openVisitAtReception(page, surname, /^Terapiya$/);

        const row = cashier.page.locator('li', { hasText: surname }).first();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.getByRole('button', { name: /^To'lash$/ }).click();
        await expect(cashier.page.getByText(/To'lanmagan qator yo'q/)).toHaveCount(0);
        await expect(cashier.page.getByText(/Terapevt konsultatsiyasi/).last()).toBeVisible();
        await stillSamePage(cashier.page);
        await cashier.ctx.close();
    });

    test("shifokor tekshiruv buyuradi — diagnostning ochiq ekranida chiqadi", async ({ page, browser }) => {
        test.setTimeout(120_000);
        const n = uniq();
        const surname = `Diag${n}`;

        const diag = await secondScreen(browser, 'admin');
        await nav(diag.page, /^Diagnostika$/);

        await enter(page);
        await addPatient(page, surname, n);
        await orderStudyInCard(page, surname, `UZI ${n}`);

        await expect(diag.page.getByText(surname).first()).toBeVisible({ timeout: 15_000 });
        await stillSamePage(diag.page);
        await diag.ctx.close();
    });

    test("kassir pulni oladi — shifokorning ochiq kartasida qarz yo'qoladi", async ({ page, browser }) => {
        test.setTimeout(150_000);
        const n = uniq();
        const surname = `Karta${n}`;

        await enter(page);
        await addPatient(page, surname, n);
        await orderStudyInCard(page, surname, `UZI ${n}`);

        /* Shifokor ko'rikni yozib ulgurdi, lekin hali SAQLAMADI. Panel
           qayta chizilganda bu matn yo'qolardi: avval o'z tugmasini
           bosganda («Tahlilga»), endi esa boshqa kompyuterdan yangilanish
           kelganda ham yo'qolishi mumkin edi. */
        const typed = `Bosh og'rig'i, uch kundan beri ${n}`;
        const exam = page.locator('textarea:not([disabled])').first();
        await exam.fill(typed);
        await page.getByRole('button', { name: /^Tahlilga$/ }).click();
        await expect(exam).toHaveValue(typed);

        // Kassir — boshqa kompyuterda, registrator hisobi bilan
        const cashier = await secondScreen(browser, 'zilola.reg');
        await nav(cashier.page, /^Moliya$/);
        const row = cashier.page.locator('li', { hasText: surname }).first();
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.getByRole('button', { name: /^To'lash$/ }).click();
        await cashier.page.getByRole('button', { name: /^\d[\d\s]* qabul qilish$/ }).click();
        await expect(cashier.page.getByText(/so'm qabul qilindi/).first()).toBeVisible();

        // Shifokor kartadan chiqmagan — ogohlantirish o'zi yo'qoladi
        await expect(page.getByText(/to'lanmagan — bemorni kassaga/)).toHaveCount(0, { timeout: 15_000 });
        // ...va yozilgan matn joyida
        await expect(exam).toHaveValue(typed);
        await stillSamePage(page);
        await cashier.ctx.close();
    });
});
