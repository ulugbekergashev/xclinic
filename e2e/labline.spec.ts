/* LABORATORIYA LINIYASI va STATSIONAR XARITASI — bo'limlarning o'z ekranlari.
 *
 * Ikkalasi «Bugun» xaritasining tilida: bemor yoki probirka zonadan zonaga
 * o'tadi. Shuning uchun sinov ro'yxatdagi matnni emas, HARAKATNI tekshiradi:
 *
 *   · «Olindi» → odam proba navbatidan ketadi, probirkasi «Ishlanmoqda» da;
 *   · to'lanmagan probirka belgilangan; kassada to'langach belgi O'ZI ketadi
 *     (sahifa qayta yuklanmasdan — ilgari laborant sahifani yangilamaguncha
 *     «to'lanmagan» turardi);
 *   · natija saqlangach yo'llanma «Bugun tayyor» ga o'tadi;
 *   · hamshira postida «Berildi» joriy vaqtni yopadi — bitta bosish bilan.
 *
 * Sinov ma'lumotni O'ZI yaratadi (API orqali).
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import { login, go, uniq, PASSWORD } from './helpers';

const LAB = 'section[aria-labelledby="lab-line-title"]';
const WARD = 'section[aria-labelledby="ward-map-title"]';

async function admin(request: APIRequestContext) {
    const auth = await (await request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } })).json();
    return { headers: { Authorization: `Bearer ${auth.token}` } };
}

test.describe('Laboratoriya liniyasi', () => {

    test("proba → ishlanmoqda → tayyor; to'lov belgisi qayta yuklamasdan yangilanadi", async ({ page, request }) => {
        test.setTimeout(150_000);
        const { headers } = await admin(request);
        const tests: any[] = (await (await request.get('/api/lab-tests', { headers })).json()).filter((t: any) => t.isActive);
        test.skip(tests.length === 0, "Tahlillar katalogi bo'sh");

        const n = uniq();
        const name = `Liniya${n} Sinov`;
        const patient = await (await request.post('/api/patients', {
            headers,
            data: { firstName: 'Sinov', lastName: `Liniya${n}`, gender: 'Male', phone: `+99893${n.slice(0, 7)}`, force: true },
        })).json();
        const order = await (await request.post('/api/lab-orders', {
            headers,
            data: { patientId: patient.id, patientName: name, doctorName: 'Dr. Sinov', testIds: [tests[0].id] },
        })).json();
        expect(order.id, "yo'llanma yozildi").toBeTruthy();

        await login(page);
        await go(page, '/lab');
        const line = page.locator(LAB);
        await expect(line).toBeVisible({ timeout: 30_000 });
        await page.evaluate(() => { (window as any).__sameDocument = true; });

        // ── 1. Proba olish ──────────────────────────────────────────────
        const waiting = line.locator('li', { hasText: name });
        await expect(waiting).toBeVisible();
        await expect(waiting).toContainText(/To'lanmagan/);
        await waiting.getByRole('button', { name: /Olindi$/ }).click();
        await expect(waiting).toHaveCount(0, { timeout: 15_000 });

        // ── 2. Ishlanmoqda: probirka, to'lanmagan ───────────────────────
        const tube = line.locator(`button[title^="${name} — "]`).first();
        await expect(tube).toBeVisible();
        await expect(tube).toHaveAttribute('title', /to'lanmagan/);

        /* To'lov «boshqa kompyuterda» — API orqali. Ochiq turgan liniya buni
           o'zi bilishi kerak: belgi ketadi, o'rniga muddat chiqadi. */
        const charges: any[] = await (await request.get(`/api/charges?patientId=${patient.id}&status=Unpaid`, { headers })).json();
        expect(charges.length, 'tahlil uchun hisob qatori bor').toBeGreaterThan(0);
        const paid = await request.post('/api/payments', { headers, data: { chargeIds: charges.map(c => c.id), method: 'Cash' } });
        expect(paid.status()).toBe(200);
        await expect(tube).toHaveAttribute('title', /qoldi|kechikdi/, { timeout: 20_000 });
        expect(await page.evaluate(() => (window as any).__sameDocument === true), 'sahifa qayta yuklanmadi').toBe(true);

        // ── 3. Natija kiritish → «Bugun tayyor» ─────────────────────────
        await tube.click();
        const dialog = page.locator('div.fixed.inset-0').last();
        await expect(dialog.getByRole('heading', { name })).toBeVisible({ timeout: 15_000 });
        const inputs = dialog.locator('tbody input');
        const count = await inputs.count();
        expect(count, "ko'rsatkich maydonlari bor").toBeGreaterThan(0);
        for (let i = 0; i < count; i++) await inputs.nth(i).fill(String(5 + i));
        await dialog.getByRole('button', { name: /Natijalarni saqlash/ }).click();
        await page.waitForTimeout(2500);
        await dialog.getByRole('button', { name: /^Yopish$/ }).click();

        await expect(line.locator(`button[title^="${name} — "]`)).toHaveCount(0, { timeout: 15_000 });
        const ready = line.locator('li', { hasText: name });
        await expect(ready).toBeVisible();
        await expect(ready).toContainText(/shifokor hali ko'rmagan/);
    });

    test("eski yo'llanmalar yig'iq turadi va jurnalda «Proba olindi» yo'q", async ({ page }) => {
        await login(page);
        await go(page, '/lab');
        const line = page.locator(LAB);
        await expect(line).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('heading', { name: 'Jurnal' })).toBeVisible();
        // «Proba olindi» — faqat liniyada («Olindi»); jurnal — ro'yxat
        await expect(page.getByRole('button', { name: /^Proba olindi$/ })).toHaveCount(0);

        const toggle = line.getByRole('button', { name: /bir kundan ortiq/ });
        test.skip(await toggle.count() === 0, "Bir kundan ortiq kutayotgan yo'llanma yo'q");
        const rows = line.locator('ul').first().locator('li');
        const before = await rows.count();
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(await line.locator('li').count()).toBeGreaterThan(before);
    });
});

test.describe('Statsionar xaritasi', () => {

    test('hamshira postida «Berildi» joriy vaqtni yopadi — bitta bosish', async ({ page, request }) => {
        test.setTimeout(120_000);
        const { headers } = await admin(request);
        const zones = await (await request.get('/api/today/zones', { headers })).json();
        const bed = zones.inpatient?.wards.flatMap((w: any) => w.beds).find((b: any) => b.admissionId);
        test.skip(!bed, "Statsionarda yotgan bemor yo'q");
        /* «Har 2 soatda» — 06:00 dan boshlab o'n ikki vaqt. Toshkent bo'yicha
           06:00 dan oldin hali hech biri kelmagan — u holda tekshiradigan narsa yo'q. */
        test.skip(new Date(Date.now() + 5 * 3600e3).getUTCHours() < 6, 'Kun boshi: hali vaqti kelgan doza yo\'q');

        const n = uniq();
        const med = await (await request.post(`/api/admissions/${bed.admissionId}/medications`, {
            headers,
            data: { name: `Post${n}`, dosage: '1 tab', route: 'Ichga', frequency: 'har 2 soatda' },
        })).json();
        expect(med.id, 'dori tayinlandi').toBeTruthy();

        await login(page, 'gulnora.hamshira');
        await go(page, '/inpatient');
        const map = page.locator(WARD);
        await expect(map).toBeVisible({ timeout: 30_000 });
        const post = page.locator('#nurse-post');
        const row = post.locator('li', { hasText: `Post${n}` });
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText(/vaqti keldi/i);
        // Koykadagi belgi ham shundan
        await expect(map.getByRole('button', { name: new RegExp(` — ${bed.patientName}$`) })).toContainText(/muolaja vaqti keldi/);

        await row.getByRole('button', { name: /Berildi$/ }).click();
        /* Ertalabdan beri bir necha vaqt o'tgan bo'lsa ham bitta belgi yetadi:
           satr navbatdagi soatga o'tadi yoki (kun oxirida) ro'yxatdan chiqadi. */
        await expect(row.filter({ hasText: /vaqti keldi/i })).toHaveCount(0, { timeout: 15_000 });
        await expect(post).toContainText(/Bugun bajarildi: [1-9]\d* ta muolaja/);

        // Hamshirada boshqaruv yo'q: palata tahriri, yotqizish, ta'mir
        await expect(map.getByRole('button', { name: /Palatani tahrirlash|Yotqizish|Ta'mirga chiqarish/ })).toHaveCount(0);
    });

    test('`?tab=meds` havolasi xaritani ochadi (eski «Dori varag\'i» manzili)', async ({ page }) => {
        await login(page);
        await go(page, '/inpatient?tab=meds');
        await expect(page.locator(WARD)).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#nurse-post')).toBeVisible();
        await expect(page).not.toHaveURL(/tab=/);
    });
});
