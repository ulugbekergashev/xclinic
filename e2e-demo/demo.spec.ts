/* NAMOYISH NUSXASI ISHLAYAPTIMI.
 *
 * NIMA UCHUN KERAK. Vercelga chiqadigan nusxada backend yo'q: hamma
 * ma'lumot brauzerda va har bir yozish `services/api.ts` dagi demo
 * tarmog'iga tushadi. O'sha tarmoq backendli sinovlarda UMUMAN
 * yurmaydi — ya'ni `e2e/` dagi 30 ta sinov yashil turgan holda demo
 * nusxa buzuq bo'lishi mumkin. Aynan shunday bo'lgan ham:
 *
 *   · o'ttiz bitta yozish amali «Demo rejimda saqlab bo'lmaydi» xatosini
 *     berardi — ombor kirimi, kassa to'lovi, tahlil natijasi, bo'lim
 *     qo'shish va boshqalar;
 *   · `#/inventory` kabi havolani ochgan odam Boshqaruv panelida paydo
 *     bo'lardi — avtomatik kirish so'ralgan manzilni tashlab yuborardi;
 *   · kassadagi «To'lash» oynasi bemorning qarzini ko'ra olmasdi, chunki
 *     `App.tsx` demo tarmog'ida hisob qatorlarini yuklamasdi.
 *
 * Shuning uchun bu yerda ikki narsa tekshiriladi: sahifa HAQIQATAN
 * so'ralgani ochiladimi va asosiy tugmalar ish bajaradimi.
 */
import { test, expect, Page } from '@playwright/test';

/* Har safar YANGI hujjat. Bir xil hash'ga qayta o'tish sahifani
   yangilamaydi va oldingi sinovda ochilgan modal ochiq qolib, keyingi
   bosishlarni to'sib qo'yadi. */
const go = async (page: Page, route: string) => {
    await page.goto(`/?t=${Date.now()}#${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(2300);
};

/** Demo tarmog'ining eski xatti-harakati — bu matn chiqsa, tugma o'lik. */
const noDemoError = async (page: Page) => {
    await expect(page.getByText(/Demo rejimda saqlab bo'lmaydi/)).toHaveCount(0);
};

/* ── 1. HAVOLA BO'YICHA TO'G'RIDAN-TO'G'RI SAHIFAGA KIRISH ────────────── */

const DEEP_LINKS: { route: string; marker: RegExp }[] = [
    { route: '/inventory', marker: /Qoldiqlar/ },
    { route: '/settings', marker: /Xizmatlar/ },
    { route: '/diagnostics', marker: /tekshiruv/i },
    { route: '/lab', marker: /Natijalar|yo'llanma/i },
    { route: '/finance', marker: /Kassa/ },
];

test.describe('Demo: havola bo\'yicha kirish', () => {
    for (const { route, marker } of DEEP_LINKS) {
        test(`${route} — so'ralgan sahifa ochiladi`, async ({ page }) => {
            /* Toza kontekst: avtomatik kirish shu yerda ishga tushadi va
               aynan shu payt manzil tashlanib ketardi. */
            await go(page, route);
            await expect(page.locator('main')).toContainText(marker);
        });
    }
});

/* ── 2. YOZISH AMALLARI ────────────────────────────────────────────────── */

test.describe('Demo: tugmalar ish bajaradi', () => {

    test("Ombor: kirim qoldiqni oshiradi va jurnalga tushadi", async ({ page }) => {
        /* Qoldiq jadval katagida emas, oddiy `div` qatorida turadi —
           shuning uchun butun ro'yxat matnidan o'qiladi. «Paxta» ikkinchi
           qator: `title="Kirim"` tugmalari ham shu tartibda. */
        const qtyOfPaxta = async () => {
            const text = await page.locator('main').innerText();
            const m = text.match(/Paxta\s*\n?\s*minimal[^\n]*\n?\s*([\d\s.,]+)/);
            return m ? m[1].trim() : null;
        };

        await go(page, '/inventory');
        const before = await qtyOfPaxta();
        expect(before, 'boshlang\'ich qoldiq o\'qilishi kerak').not.toBeNull();

        await page.locator('button[title="Kirim"]').nth(1).click();
        await page.getByLabel(/^Miqdor/).fill('7');
        await page.getByRole('button', { name: 'Kirimni yozish' }).click();
        await page.waitForTimeout(1500);
        await noDemoError(page);

        expect(await qtyOfPaxta(), 'kirimdan keyin qoldiq o\'zgarishi kerak').not.toBe(before);

        // Harakat jurnalda ham ko'rinadi — ikki ekran bir-biriga zid bo'lmasin
        await page.getByRole('button', { name: 'Harakatlar' }).click();
        await page.waitForTimeout(1200);
        await expect(page.locator('main')).toContainText('Paxta');
    });

    test('Kassa: qarzdor bemordan to\'lov qabul qilinadi', async ({ page }) => {
        await go(page, '/finance');
        const panel = page.getByText(/Hozir klinikada/).locator('..');
        const before = (await panel.innerText()).replace(/\s+/g, ' ');

        await page.getByRole('button', { name: "To'lash" }).last().click();
        await page.waitForTimeout(1200);

        const accept = page.getByRole('button', { name: /qabul qilish/i }).last();
        /* Oyna bemorning to'lanmagan qatorlarini KO'RISHI shart. Ilgari u
           «To'lanmagan qator yo'q» deb turardi va tugma o'chiq edi. */
        await expect(accept, 'to\'lanmagan qatorlar topilishi kerak').toBeEnabled();
        await accept.click();
        await page.waitForTimeout(2000);
        await noDemoError(page);

        const after = (await page.getByText(/Hozir klinikada/).locator('..').innerText()).replace(/\s+/g, ' ');
        expect(after, 'to\'lovdan keyin qarz kamayishi kerak').not.toBe(before);
    });

    test("Sozlamalar: bo'lim qo'shiladi (kod nomdan yasaladi)", async ({ page }) => {
        await go(page, '/settings');
        await page.getByRole('button', { name: /^Bo.limlar$/ }).click();
        await page.waitForTimeout(1200);
        await page.getByRole('button', { name: /qo.sh/i }).first().click();
        await page.getByPlaceholder(/Masalan: Kardiologiya/).fill('Kardiologiya');

        /* «Saqlash» DARHOL ochiq bo'lishi kerak. Ilgari u `code` maydoni
           to'lmaguncha o'chiq turardi, majburiyligi esa hech qayerda
           aytilmasdi — tugma sababsiz o'lik ko'rinardi. */
        const save = page.getByRole('button', { name: 'Saqlash' }).last();
        await expect(save, 'nom yozilgach saqlash ochilishi kerak').toBeEnabled();
        await save.click();
        await page.waitForTimeout(1500);
        await noDemoError(page);
        await expect(page.locator('main')).toContainText('Kardiologiya');
    });

    test('Laboratoriya: natija kiritish oynasi to\'ladi va saqlanadi', async ({ page }) => {
        await go(page, '/lab');
        await page.getByRole('button', { name: 'Natijalar' }).first().click();
        await page.waitForTimeout(1200);

        /* Oyna PARAMETRLAR bilan ochilishi kerak: ilgari `labResults.get`
           bo'sh `items` qaytarardi va ekranning butun ma'nosi yo'q edi. */
        const fields = page.locator('input:visible');
        expect(await fields.count(), 'natija maydonlari bo\'lishi kerak').toBeGreaterThan(1);

        await fields.nth(1).fill('130');
        await page.getByRole('button', { name: /saqla/i }).last().click();
        await page.waitForTimeout(1500);
        await noDemoError(page);
    });

    test('Sozlamalar: «AI yordamchi» tizimdan chiqarib yubormaydi', async ({ page }) => {
        await go(page, '/settings');
        await page.getByRole('button', { name: 'AI yordamchi' }).last().click();
        await page.waitForTimeout(2000);

        /* Bu vkladka serverdan kalit holatini so'raydi. Demo tokeni soxta,
           server 401 beradi, 401 esa sessiyani tozalab kirish sahifasiga
           uloqtiradi — ya'ni to'siqsiz shu tugmaning O'ZI demodan
           chiqarib yuborardi. Parol maydoni ko'rinsa — chiqib ketilgan. */
        await expect(page.locator('input[type="password"][name="password"]'),
            'AI vkladkasi kirish sahifasiga uloqtirmasligi kerak').toHaveCount(0);
        await expect(page.locator('main')).toContainText(/Gemini|Groq|OpenRouter/);
    });

    test('Diagnostika: xulosa saqlanadi', async ({ page }) => {
        await go(page, '/diagnostics');
        await page.getByRole('button', { name: 'Xulosa' }).first().click();
        await page.waitForTimeout(800);
        await page.locator('textarea:visible').first().fill('Patologiya aniqlanmadi.');
        await page.getByRole('button', { name: /saqla/i }).last().click();
        await page.waitForTimeout(1500);
        await noDemoError(page);
    });
});

/* ── 3. YANGILASHDAN KEYIN SAQLANADIMI ─────────────────────────────────── */

test.describe('Demo: o\'zgarish sahifa yangilangandan keyin ham turadi', () => {
    test('to\'lov qaytib kelmaydi', async ({ page }) => {
        await go(page, '/finance');
        const read = async () =>
            (await page.getByText(/Hozir klinikada/).locator('..').innerText()).replace(/\s+/g, ' ');

        const before = await read();
        await page.getByRole('button', { name: "To'lash" }).last().click();
        await page.waitForTimeout(1200);
        await page.getByRole('button', { name: /qabul qilish/i }).last().click();
        await page.waitForTimeout(2000);
        const afterPay = await read();
        expect(afterPay).not.toBe(before);

        /* Chek `DEMO_TRANSACTIONS` da saqlanadi. Hisob qatori saqlanmasa,
           yangilashdan keyin pul ham olingan, qarz ham joyida bo'lib
           ko'rinardi — namoyishda eng yomon ziddiyat. */
        await go(page, '/finance');
        expect(await read(), 'yangilashdan keyin qarz qaytib kelmasligi kerak').toBe(afterPay);
    });
});
