/* KALENDAR — uch ko'rinish va yon panel.
 *
 * NIMA TEKSHIRILADI:
 *   · sarlavhadagi sana interfeys tilida (ilgari u har doim inglizcha edi:
 *     «Sep 28 - Oct 4» — o'zbekcha va ruscha ekranda ham);
 *   · Oy ko'rinishi: katakda ism emas, kunning yozuvlari soni; kun bosilsa
 *     o'sha kun kunlik ko'rinishda ochiladi;
 *   · yon panel: kichik oy kalendari kunga o'tkazadi, shifokor — filtr;
 *   · «hozir» chizig'i bugungi ustunda.
 *
 * Sinov yozuvni O'ZI yaratadi (API orqali) — bo'sh bazada ham ishlaydi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq, PASSWORD } from './helpers';

const pad = (n: number) => String(n).padStart(2, '0');

test.describe('Kalendar', () => {

    test("oy ko'rinishi, yon panel va «hozir» chizig'i", async ({ page, request }) => {
        test.setTimeout(120_000);
        const auth = await (await request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };
        const doctors: any[] = (await (await request.get(`/api/doctors?clinicId=${auth.clinicId}`, { headers })).json())
            .filter((d: any) => d.status === 'Active');
        test.skip(doctors.length === 0, "Faol shifokor yo'q");
        const doc = doctors[0];

        const n = uniq();
        const patient = await (await request.post('/api/patients', {
            headers,
            data: { firstName: 'Sinov', lastName: `Oy${n}`, gender: 'Male', phone: `+99894${n.slice(0, 7)}`, force: true },
        })).json();
        const now = new Date();
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const created = await request.post('/api/appointments', {
            headers,
            data: {
                patientId: patient.id, patientName: `Oy${n} Sinov`, doctorId: doc.id, doctorName: `${doc.lastName} ${doc.firstName}`,
                type: 'Konsultatsiya', date: today, time: '12:00', duration: 30, status: 'Confirmed', clinicId: auth.clinicId, force: true,
            },
        });
        expect(created.status(), 'yozuv yaratildi').toBeLessThan(300);

        await login(page);
        await go(page, '/calendar');
        /* Yon panel 2026-11-20 da olib tashlandi: shifokor filtri — tepadagi
           ro'yxat, istalgan kun — sana yozuvini bosib. */
        const doctorSelect = page.getByRole('combobox', { name: 'Shifokorlar' });
        await expect(doctorSelect).toBeVisible({ timeout: 30_000 });

        // ── Sarlavha interfeys tilida ───────────────────────────────────
        const header = page.locator('h1').locator('xpath=following-sibling::div[1]');
        await expect(header).not.toContainText(/Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);

        // ── «Hozir» chizig'i: hafta ko'rinishida bitta, bugungi ustunda ──
        /* Chiziq faqat ISH SOATLARIDA chiziladi, ish soatlari esa klinika va
           shifokorlar jadvalidan olinadi. Ilgari bu yerda «8 dan 20 gacha»
           deb qotirilgan edi va sinov kechqurun (to'r 18:00 da tugaganda)
           yiqilardi. Endi to'rning o'zidan so'raladi: hozirgi soat qatori
           bormi? */
        const hourRow = page.getByText(`${now.getHours()}:00`, { exact: true });
        await expect(page.locator('span.border-red-500.border-t-2')).toHaveCount((await hourRow.count()) > 0 ? 1 : 0);

        // ── Shifokor filtri — tepadagi ro'yxat ───────────────────────────
        await doctorSelect.selectOption(doc.id);
        await expect(doctorSelect).toHaveValue(doc.id);
        /* Blok ism bilan emas, `title` bilan qidiriladi: bir vaqtda uch va undan
           ko'p yozuv bo'lsa hafta ko'rinishida blok siqiladi va ism yozilmaydi. */
        const block = page.locator(`[title*="Oy${n} Sinov"]`);
        await expect(block.first()).toBeAttached();
        await doctorSelect.selectOption('');
        await expect(doctorSelect).toHaveValue('');

        // ── Oy: katakda son; kun bosilsa kunlik ko'rinish ───────────────
        await page.getByRole('button', { name: /^Oy$/ }).click();
        const cell = page.getByRole('button', { name: new RegExp(`^${now.getDate()}-kun: \\d+ ta yozuv, bandlik \\d+%$`) });
        await expect(cell).toBeVisible();
        // Oy katagida ism yo'q — faqat bandlik
        await expect(cell).not.toContainText(`Oy${n}`);
        await cell.click();
        await expect(header).toContainText(new RegExp(`^${now.getDate()}-`));
        await expect(block.first()).toBeAttached();

        // ── Sana yozuvi orqali boshqa kun → «Bugun» qaytaradi ───────────
        const other = now.getDate() === 15 ? 16 : 15;
        const otherKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(other).padStart(2, '0')}`;
        await page.getByLabel('Sanani tanlash').fill(otherKey);
        await expect(header).toContainText(new RegExp(`^${other}-`));
        await page.getByRole('button', { name: /^Bugun$/ }).last().click();
        await expect(header).toContainText(new RegExp(`^${now.getDate()}-`));
    });

    test("shifokorda shifokor filtri yo'q — u faqat o'zinikini ko'radi", async ({ page }) => {
        await login(page, 'malika.yusupova');
        await go(page, '/calendar');
        await expect(page.getByRole('heading', { name: 'Kalendar' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('combobox', { name: 'Shifokorlar' })).toHaveCount(0);
    });
});
