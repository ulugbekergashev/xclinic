/* E2E yordamchilari.
 *
 * QOIDA: sinovlar CSS sinflariga tayanmaydi. Sinf nomi dizayn
 * o'zgarganda o'zgaradi va sinov «yiqilib», lekin hech qanday xato
 * topmay qoladi. Tayanch nuqtalari — foydalanuvchi ko'radigan narsa:
 * matn, yorliq, rol.
 */
import { Page, expect } from '@playwright/test';

export const PASSWORD = 'testpass123';

/** Ilova HashRouter da — manzil `#/...` ko'rinishida. */
export const go = (page: Page, hash: string) => page.goto(`/#${hash}`);

/**
 * Kirish. Rol bo'yicha boshlang'ich sahifa har xil, shuning uchun
 * sinov aniq bir elementni kutadi, sahifani emas.
 */
export async function login(page: Page, username = 'admin', password = PASSWORD) {
    await page.goto('/');
    // Kirish formasi — ikkita maydon va bitta tugma
    const user = page.locator('input').first();
    await user.waitFor({ state: 'visible', timeout: 30_000 });
    await user.fill(username);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /kirish|войти|sign in/i }).click();

    // Kirish tugagani — kirish formasi yo'qolgani bilan bilinadi
    await expect(page.locator('input[type="password"]')).toHaveCount(0, { timeout: 30_000 });

    /* …va ILOVA OCHILGANI — qobiq (`main`) chiqqani bilan.

       Kirgandan keyin ilova avval «Ma'lumotlar yuklanmoqda» ekranini
       ko'rsatadi: 1-3 soniya, band mashinada ko'proq. Sinovlar esa `go()`
       dan keyin qat'iy 2.5-3.5 s kutib sahifani o'qirdi. Yuklanish cho'zilsa
       `sweep` «sahifa deyarli bo'sh (43 belgi)» deb yiqilardi — o'sha 43
       belgi shu ekranning matni; `arrival` esa «yozuv yo'q» deb jimgina
       o'tkazib yuborilardi, ya'ni hech narsani tekshirmasdi. */
    await expect(page.locator('main')).toBeVisible({ timeout: 60_000 });
}

/* Noyob qo'shimcha — sinovlar bir-birining ma'lumotiga urilmasin.

   `Date.now()` ning O'ZI YETMAYDI: telefon undan yasaladi va ketma-ket
   ishga tushirishlarda birinchi raqamlar bir xil bo'lib qoladi. Server
   esa takror telefonni 409 bilan rad etadi (S3.4) va sinov beqaror
   yiqiladi. Tasodifiy qism oldinda turadi — u kesilganda ham noyob. */
let seq = 0;
export const uniq = () => {
    seq += 1;
    const rand = Math.floor(Math.random() * 900 + 100);   // 3 raqam
    const t = String(Date.now()).slice(-4);               // 4 raqam
    return `${rand}${t}${String(seq % 100).padStart(2, '0')}`;
};

/**
 * Toast xabari. Ular 4-8 soniyada yo'qoladi, shuning uchun tekshiruv
 * darhol bo'lishi kerak.
 */
export function toast(page: Page, text: RegExp) {
    return page.getByText(text).first();
}

/** Bemor kartasidagi qabul varag'i («Qabul» tabi) */
export const visitSheet = (page: Page) => page.locator('section[aria-labelledby="visit-title"]');

/* VRACH ISH JOYI (2026-11-23): varaq bitta ustun — Shikoyat va kasallik
   anamnezi → Ko'rik → Tashxis → Tayinlovlar → Xulosa. «Tayinlovlar»
   sarlavhasida beshta tugma: Tahlil · Diagnostika · Dori · Xizmat ·
   Yo'naltirish. Har biri o'z oynasini ochadi, oynada ichki tab qatori yo'q.
   Ilgari hammasi bitta «+ Qo'shish» oynasining ichki tablarida edi. */
export async function openOrder(page: Page, kind: string) {
    await visitSheet(page).getByRole('button', { name: new RegExp(`^${kind}$`) }).click();
    await expect(page.getByRole('dialog', { name: kind })).toBeVisible();
}

/** Tashxis — MKB-10 qidiruvi varaqning O'ZIDA (oyna yo'q). Qo'yilgan kodni qaytaradi. */
export async function addDiagnosis(page: Page, query = 'gipert'): Promise<string> {
    const sheet = visitSheet(page);
    await sheet.getByPlaceholder(/Kod yoki kasallik nomi/).fill(query);
    /* Natija chiqmasa — qidiruv ishlamayapti: kamida bitta kod chiqishi SHART */
    const hit = sheet.locator('button', { hasText: /^I1\d/ }).first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    const code = (await hit.innerText()).trim().split(/\s/)[0];
    await hit.click();
    // Tashxis «Tashxis» blokidagi ro'yxatga tushdi — server qabulga bog'lab saqladi
    await expect(sheet.getByRole('list', { name: 'Tashxis' }).getByText(code, { exact: true }))
        .toBeVisible({ timeout: 15_000 });
    return code;
}

/** Tekshiruvga yuborish: «Diagnostika» oynasi; prayslistda yo'q — «qo'lda yozish» orqali */
export async function orderStudy(page: Page, name: string, price = '90000') {
    await openOrder(page, 'Diagnostika');
    const dialog = page.getByRole('dialog', { name: 'Diagnostika' });
    const manual = dialog.getByRole('button', { name: /qo'lda yozish/ });
    if (await manual.isVisible()) await manual.click();
    await dialog.getByPlaceholder(/Masalan: Qorin/).fill(name);
    await dialog.getByPlaceholder(/^Narx$/).fill(price);
    await dialog.getByRole('button', { name: /^Diagnostikaga yuborish$/ }).click();
    // Yuborilgach oyna yopiladi, tekshiruv «Tayinlovlar» ro'yxatida turadi
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(visitSheet(page).getByRole('list', { name: "Bugun qo'shilganlar" }).getByText(name))
        .toBeVisible({ timeout: 15_000 });
}

/**
 * Bemor kartasida bugungi qabulni ochadi: Bo'lim → Shifokor → «Qabul ochish».
 * `dept` berilmasa — shifokori bor birinchi bo'lim. Shifokor tanlanmagan
 * bo'lsa ro'yxatdagi birinchisi olinadi (marshrutda shifokor bekati shundan).
 * e2e-demo ham shuni ishlatadi.
 */
export async function openVisitInCard(page: Page, dept?: string) {
    const box = page.locator('section[aria-labelledby="visit-title"]');
    const deptSel = box.getByLabel("Bo'lim", { exact: true });
    const docSel = box.getByLabel(/^Shifokor/);
    /* Shifokor kirgan bo'lsa forma bitta tugma: «Qabulni boshlash» (o'ziga).
       Boshqa bo'lim kerak bo'lsa — «O'zgartirish» bilan to'liq forma. */
    const quick = box.getByRole('button', { name: /^Qabulni boshlash$/ });
    await expect(quick.or(deptSel)).toBeVisible({ timeout: 15_000 });
    if (await quick.isVisible()) {
        if (!dept) { await quick.click(); return; }
        await box.getByRole('button', { name: /^O'zgartirish$/ }).click();
    }
    // Bo'limlar serverdan kechroq keladi — ro'yxat to'lguncha kutiladi
    await expect(deptSel.locator('option').nth(1)).toBeAttached({ timeout: 15_000 });
    if (dept) {
        await deptSel.selectOption({ label: dept });
    } else {
        const values = await deptSel.locator('option').evaluateAll(
            os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean));
        for (const v of values) {
            await deptSel.selectOption(v);
            if (await docSel.locator('option').count() > 1) break;
        }
    }
    if (!(await docSel.inputValue()) && await docSel.locator('option').count() > 1) {
        await docSel.selectOption({ index: 1 });
    }
    await box.getByRole('button', { name: /^Qabul ochish — / }).click();
}
