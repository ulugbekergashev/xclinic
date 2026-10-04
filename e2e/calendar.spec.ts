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
        const side = page.locator('aside[aria-label="Kalendar paneli"]');
        await expect(side).toBeVisible({ timeout: 30_000 });

        // ── Sarlavha interfeys tilida ───────────────────────────────────
        const header = page.locator('h1').locator('xpath=following-sibling::div[1]');
        await expect(header).not.toContainText(/Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);

        // ── «Hozir» chizig'i: hafta ko'rinishida bitta, bugungi ustunda ──
        const hour = now.getHours();
        if (hour >= 8 && hour <= 20) await expect(page.locator('span.border-red-500.border-t-2')).toHaveCount(1);

        // ── Yon panel: shifokor — filtr ─────────────────────────────────
        const mine = side.getByRole('button', { name: new RegExp(`^Dr\\. ${doc.lastName}`) });
        await mine.click();
        await expect(mine).toHaveAttribute('aria-pressed', 'true');
        /* Blok ism bilan emas, `title` bilan qidiriladi: bir vaqtda uch va undan
           ko'p yozuv bo'lsa hafta ko'rinishida blok siqiladi va ism yozilmaydi. */
        const block = page.locator(`[title*="Oy${n} Sinov"]`);
        await expect(block.first()).toBeAttached();
        await mine.click();
        await expect(mine).toHaveAttribute('aria-pressed', 'false');

        // ── Oy: katakda son; kun bosilsa kunlik ko'rinish ───────────────
        await page.getByRole('button', { name: /^Oy$/ }).click();
        const cell = page.getByRole('button', { name: new RegExp(`^${now.getDate()}-kun: \\d+ ta yozuv, bandlik \\d+%$`) });
        await expect(cell).toBeVisible();
        // Oy katagida ism yo'q — faqat bandlik
        await expect(cell).not.toContainText(`Oy${n}`);
        await cell.click();
        await expect(header).toContainText(new RegExp(`^${now.getDate()}-`));
        await expect(block.first()).toBeAttached();

        // ── Kichik oy kalendari: boshqa kun → «Bugun» qaytaradi ─────────
        const other = now.getDate() === 15 ? 16 : 15;
        await side.getByRole('button', { name: new RegExp(`^${other} `) }).click();
        await expect(header).toContainText(new RegExp(`^${other}-`));
        await page.getByRole('button', { name: /^Bugun$/ }).last().click();
        await expect(header).toContainText(new RegExp(`^${now.getDate()}-`));
    });

    test("shifokorda yon panelda boshqa shifokorlar ro'yxati yo'q", async ({ page }) => {
        await login(page, 'malika.yusupova');
        await go(page, '/calendar');
        const side = page.locator('aside[aria-label="Kalendar paneli"]');
        await expect(side).toBeVisible({ timeout: 30_000 });
        await expect(side.getByRole('button', { name: /^Dr\. / })).toHaveCount(0);
        // Holatlar izohi hammaga
        await expect(side.getByText('Holatlar')).toBeVisible();
    });
});
