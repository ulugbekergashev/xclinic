/* «BUGUN KLINIKADA» — «Bugun» ekranidagi jonli xarita.
 *
 * NIMA TEKSHIRILADI. Xarita chizilgan rasm emas, navbatni yuritadigan
 * asbob: navbatdagi bemor kutish zalida ko'rinishi, «Kirdi» uni kabinetga
 * o'tkazishi va holat SERVERDA o'zgarishi kerak — kabinetga kirgan vaqt
 * bilan birga (taymer shundan sanaydi, migratsiya 0037).
 *
 * Sinov bemor va qabulni O'ZI yaratadi (API orqali): bazadagi bugungi
 * navbatga umid qilsa, bo'sh kunda jimgina o'tkazib yuborilardi.
 */
import { test, expect } from '@playwright/test';
import { login, go, uniq, PASSWORD } from './helpers';

test.describe('«Bugun klinikada» xaritasi', () => {

    test("navbatdagi bemor «Kirdi» bilan kabinetga o'tadi va qaytariladi", async ({ page, request }) => {
        const auth = await (await request.post('/api/auth/login', {
            data: { username: 'admin', password: PASSWORD },
        })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };

        /* Navbati BO'SH shifokor kerak: «Kirdi» navbatdagi BIRINCHI bemorga
           tegishli, oldinda boshqa odam tursa tugma unga chiqadi. */
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const doctors: any[] = await (await request.get(`/api/doctors?clinicId=${auth.clinicId}`, { headers })).json();
        const visits: any[] = await (await request.get(`/api/visits?date=${today}`, { headers })).json();
        const busy = new Set(visits
            .filter(v => ['Waiting', 'Called', 'In Progress'].includes(v.status))
            .map(v => v.doctorId));
        const doc = doctors.find(d => d.status === 'Active' && d.departmentId && !busy.has(d.id));
        test.skip(!doc, "Navbati bo'sh, bo'limga biriktirilgan shifokor yo'q");

        const n = uniq();
        const surname = `Xarita${n}`;
        const fullName = `${surname} Sinov`;
        const patient = await (await request.post('/api/patients', {
            headers,
            data: { firstName: 'Sinov', lastName: surname, gender: 'Male', phone: `+99890${n.slice(0, 7)}`, force: true },
        })).json();
        const visit = await (await request.post('/api/visits', {
            headers,
            data: {
                patientId: patient.id, date: today, departmentId: doc.departmentId, doctorId: doc.id,
                doctorName: `Dr. ${doc.firstName} ${doc.lastName}`, status: 'Waiting',
            },
        })).json();
        expect(visit.id, 'qabul ochildi').toBeTruthy();

        await login(page);
        await go(page, '/reception');
        const map = page.locator('section[aria-labelledby="clinic-map-title"]');
        await expect(map).toBeVisible({ timeout: 30_000 });

        /* Kutish zalida: «Kirdi» tugmasi aynan shu bemorga chiqadi. */
        const enter = map.getByRole('button', { name: `${fullName} kabinetga kirdi deb belgilash` });
        await expect(enter).toBeVisible({ timeout: 15_000 });
        await enter.click();

        /* Kabinetda: «Navbatga qaytarish» faqat kabinetdagi bemorda bo'ladi. */
        const undo = map.getByRole('button', { name: `${fullName}: Navbatga qaytarish` });
        await expect(undo).toBeVisible({ timeout: 15_000 });

        const inChair = await (await request.get(`/api/visits/${visit.id}`, { headers })).json();
        expect(inChair.status).toBe('In Progress');
        expect(inChair.startedAt, 'kabinetga kirgan vaqt yozildi').toBeTruthy();

        /* Adashib bosilgan «Kirdi» — bemor navbatga qaytadi, vaqt tozalanadi. */
        await undo.click();
        await expect(enter).toBeVisible({ timeout: 15_000 });
        const back = await (await request.get(`/api/visits/${visit.id}`, { headers })).json();
        expect(back.status).toBe('Waiting');
        expect(back.startedAt).toBeNull();
    });

    test("shifokorda faqat o'z qatori: «Mening kabinetim», «Qabulni boshlash» kartani ochadi", async ({ page, request }) => {
        const auth = await (await request.post('/api/auth/login', {
            data: { username: 'admin', password: PASSWORD },
        })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const doctors: any[] = await (await request.get(`/api/doctors?clinicId=${auth.clinicId}`, { headers })).json();
        const visits: any[] = await (await request.get(`/api/visits?date=${today}`, { headers })).json();
        const busy = new Set(visits
            .filter(v => ['Waiting', 'Called', 'In Progress'].includes(v.status))
            .map(v => v.doctorId));
        /* Kabineti bo'sh va kirish nomi bor shifokor kerak: «Qabulni boshlash»
           faqat bo'sh kabinetda, navbatdagi BIRINCHI bemorga chiqadi. */
        const usable = doctors.filter(d => d.status === 'Active' && d.departmentId && d.username);
        const doc = usable.find(d => !busy.has(d.id));
        const other = usable.find(d => d.id !== doc?.id);
        test.skip(!doc || !other, "Navbati bo'sh shifokor va yana bitta shifokor kerak");

        const n = uniq();
        const queueUp = async (surname: string, d: any) => {
            const patient = await (await request.post('/api/patients', {
                headers,
                data: { firstName: 'Sinov', lastName: surname, gender: 'Male', phone: `+99891${uniq().slice(0, 7)}`, force: true },
            })).json();
            const visit = await (await request.post('/api/visits', {
                headers,
                data: {
                    patientId: patient.id, date: today, departmentId: d.departmentId, doctorId: d.id,
                    doctorName: `Dr. ${d.firstName} ${d.lastName}`, status: 'Waiting',
                },
            })).json();
            expect(visit.id, 'qabul ochildi').toBeTruthy();
            return visit;
        };
        const mine = await queueUp(`Oziniki${n}`, doc);
        await queueUp(`Begona${n}`, other);

        /* Sinov bazasida hamma parol bir xil (`e2e/server.mjs`). */
        await login(page, doc.username);
        await go(page, '/reception');
        const map = page.locator('section[aria-labelledby="clinic-map-title"]');
        await expect(map.getByRole('heading', { name: 'Mening kabinetim' })).toBeVisible({ timeout: 30_000 });

        /* Faqat o'z navbati. Boshqa shifokorning bemori, butun klinika
           xaritasi va qabul ochish — bu yerda yo'q. */
        await expect(map.getByRole('button', { name: new RegExp(`^Oziniki${n}`) }).first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(new RegExp(`Begona${n}`))).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Bugun klinikada' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Yangi qabul$/ })).toHaveCount(0);

        /* Shifokor bemorni «kiritmaydi» — qabulni BOSHLAYDI: holat o'zgaradi
           va karta ochiladi. */
        await map.getByRole('button', { name: `Oziniki${n} Sinov: Qabulni boshlash` }).click();
        await expect(page).toHaveURL(/#\/patients\/[^?]+\?visit=/, { timeout: 15_000 });
        await expect(page.getByText('Joriy qabul')).toBeVisible({ timeout: 15_000 });
        const started = await (await request.get(`/api/visits/${mine.id}`, { headers })).json();
        expect(started.status).toBe('In Progress');
    });

    test('xarita yig\'iladi va holatini eslab qoladi', async ({ page }) => {
        await login(page);
        await go(page, '/reception');
        const map = page.locator('section[aria-labelledby="clinic-map-title"]');
        await expect(map).toBeVisible({ timeout: 30_000 });

        await map.getByRole('button', { name: "Xaritani yig'ish" }).click();
        /* Yig'ilganda ham sarlavha va jonli raqamlar qoladi. */
        await expect(map.getByText('Bugun klinikada')).toBeVisible();
        await expect(map.getByText('navbatda')).toBeVisible();
        await expect(map.getByRole('button', { name: 'Xaritani ochish' })).toBeVisible();

        /* Boshqa sahifaga o'tib qaytganda ham yig'iq turadi: registrator uni
           har safar qaytadan yig'ishi kerak bo'lmasin. */
        await go(page, '/patients');
        await go(page, '/reception');
        await expect(map.getByRole('button', { name: 'Xaritani ochish' })).toBeVisible({ timeout: 30_000 });
    });
});
