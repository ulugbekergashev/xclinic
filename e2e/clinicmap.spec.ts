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

    test("laboratoriya va statsionar zonalari: proba olinsa zona o'zi yangilanadi, koyka yotishni ochadi", async ({ page, request }) => {
        /* Zonalar «Bugun» xaritasining ichida turadi va raqamni serverdan
           oladi (`/api/today/zones`). Ikki narsa tekshiriladi: ekrandagi son
           serverniki bilan bir xilmi va boshqa kompyuterdagi yozuvdan keyin
           sahifa QAYTA YUKLANMASDAN yangilanadimi. */
        const auth = await (await request.post('/api/auth/login', {
            data: { username: 'admin', password: PASSWORD },
        })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };
        const zones = async () => (await request.get('/api/today/zones', { headers })).json();

        const tests: any[] = (await (await request.get('/api/lab-tests', { headers })).json())
            .filter((t: any) => t.isActive);
        test.skip(tests.length === 0, "Tahlillar katalogi bo'sh");

        const n = uniq();
        const patient = await (await request.post('/api/patients', {
            headers,
            data: { firstName: 'Sinov', lastName: `Zona${n}`, gender: 'Male', phone: `+99892${n.slice(0, 7)}`, force: true },
        })).json();
        const order = await (await request.post('/api/lab-orders', {
            headers,
            data: { patientId: patient.id, patientName: `Zona${n} Sinov`, doctorName: 'Dr. Sinov', testIds: [tests[0].id] },
        })).json();
        expect(order.id, "yo'llanma yozildi").toBeTruthy();
        const before = await zones();

        await login(page);
        await go(page, '/reception');
        const map = page.locator('section[aria-labelledby="clinic-map-title"]');
        const lab = map.locator('section[aria-label="Laboratoriya"]');
        await expect(lab).toBeVisible({ timeout: 30_000 });
        await expect(lab.getByText(`${before.lab.waiting.count} kishi kutmoqda`)).toBeVisible();
        await page.evaluate(() => { (window as any).__sameDocument = true; });

        /* Proba «boshqa kompyuterda» olinadi — API orqali. Ochiq turgan
           «Bugun» buni o'zi bilishi kerak. */
        const collected = await request.post(`/api/lab-orders/${order.id}/collect`, { headers });
        expect(collected.status()).toBe(200);
        const waitingNow = before.lab.waiting.count - 1;
        await expect(lab.getByText(waitingNow ? `${waitingNow} kishi kutmoqda` : "kutayotgan yo'q")).toBeVisible({ timeout: 20_000 });
        await expect(lab.getByText(`${before.lab.working.count + 1} ta yo'llanma`)).toBeVisible();
        expect(await page.evaluate(() => (window as any).__sameDocument === true), 'sahifa qayta yuklanmadi').toBe(true);

        /* Statsionar: band koyka — o'sha yotishga havola. */
        const inp = before.inpatient;
        const bed = inp?.wards.flatMap((w: any) => w.beds.map((b: any) => ({ ...b, ward: w.name }))).find((b: any) => b.admissionId);
        test.skip(!bed, "Statsionarda yotgan bemor yo'q");
        const zone = map.locator('section[aria-label="Statsionar"]');
        await expect(zone.getByText(new RegExp(`Statsionar · ${inp.beds.occupied} / ${inp.beds.total} band`, 'i'))).toBeVisible();
        await zone.getByRole('button', { name: new RegExp(`^${bed.ward} · ${bed.label} — ${bed.patientName}`) }).click();
        await expect(page).toHaveURL(/#\/inpatient/, { timeout: 15_000 });
        await expect(page.locator('div.fixed').getByText(bed.patientName).first()).toBeVisible({ timeout: 15_000 });
    });

    test("hamshirada xarita faqat ko'rish uchun: navbat tugmalari yo'q, statsionar zonasi bor", async ({ page, request }) => {
        /* Navbat amallari hamshiraga serverda yopiq (`backend/permissions.ts`).
           Ilgari u navbatni ro'yxat ko'rinishida ko'rardi va «Chaqirish»,
           «Ochish», «Keldi» tugmalari bosilganda 403 qaytardi. */
        const auth = await (await request.post('/api/auth/login', {
            data: { username: 'admin', password: PASSWORD },
        })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };
        const nurses: any[] = await (await request.get('/api/nurses', { headers })).json();
        const nurse = (Array.isArray(nurses) ? nurses : []).find(x => x.username);
        test.skip(!nurse, "Kirish nomi bor hamshira yo'q");

        /* Navbatda kamida bitta bemor bo'lsin: bo'sh xaritada «tugma yo'q»
           hech narsani isbotlamaydi. */
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const doctors: any[] = await (await request.get(`/api/doctors?clinicId=${auth.clinicId}`, { headers })).json();
        const doc = doctors.find(d => d.status === 'Active' && d.departmentId);
        test.skip(!doc, "Bo'limga biriktirilgan shifokor yo'q");
        const n = uniq();
        const patient = await (await request.post('/api/patients', {
            headers,
            data: { firstName: 'Sinov', lastName: `Hamshira${n}`, gender: 'Male', phone: `+99897${n.slice(0, 7)}`, force: true },
        })).json();
        const visit = await (await request.post('/api/visits', {
            headers,
            data: {
                patientId: patient.id, date: today, departmentId: doc.departmentId, doctorId: doc.id,
                doctorName: `Dr. ${doc.firstName} ${doc.lastName}`, status: 'Waiting',
            },
        })).json();
        expect(visit.id, 'qabul ochildi').toBeTruthy();

        await login(page, nurse.username);
        await go(page, '/reception');
        const map = page.locator('section[aria-labelledby="clinic-map-title"]');
        await expect(map.getByRole('heading', { name: 'Bugun klinikada' })).toBeVisible({ timeout: 30_000 });

        /* Bemor ko'rinadi (ismi kartani ochadi), lekin navbatni boshqarib bo'lmaydi. */
        const seat = map.getByRole('button', { name: new RegExp(`^Hamshira${n}`) }).first();
        for (let i = 0; i < 12 && !(await seat.isVisible()); i++) {
            const more = page.getByRole('button', { name: /hammasini ko'rsatish/ }).first();
            if (!(await more.count())) { await page.waitForTimeout(500); continue; }
            await more.click();
        }
        await expect(seat).toBeVisible({ timeout: 15_000 });
        for (const gone of [/: Chaqirish$/, /kabinetga kirdi deb belgilash/, /: Keldi$/, /: Navbatga qaytarish$/, /^Yangi qabul$/]) {
            await expect(page.getByRole('button', { name: gone })).toHaveCount(0);
        }
        await expect(page.getByText(/Bugungi navbat|Bugunga yozilganlar/)).toHaveCount(0);

        /* Uning ishi — Statsionarda: zona shu yerda, laboratoriya zonasi esa
           yo'q (menyusida ham yo'q). */
        const zones = await (await request.get('/api/today/zones', { headers })).json();
        if (zones.inpatient) await expect(map.locator('section[aria-label="Statsionar"]')).toBeVisible();
        await expect(map.locator('section[aria-label="Laboratoriya"]')).toHaveCount(0);
    });

    test("vaqti kelgan muolaja: zonadagi son hamshira postini ochadi, tayinlov o'sha yerda", async ({ page, request }) => {
        /* Tayinlovda soat yo'q — «har 2 soatda» matnidan jadval chiqariladi
           (`shared/medSchedule.ts`): 06:00 dan 22:00 gacha o'n ikki vaqt. */
        const auth = await (await request.post('/api/auth/login', {
            data: { username: 'admin', password: PASSWORD },
        })).json();
        const headers = { Authorization: `Bearer ${auth.token}` };
        const zones = async () => (await request.get('/api/today/zones', { headers })).json();
        const bed = (await zones()).inpatient?.wards.flatMap((w: any) => w.beds).find((b: any) => b.admissionId);
        test.skip(!bed, "Statsionarda yotgan bemor yo'q");

        const n = uniq();
        const order = await (await request.post(`/api/admissions/${bed.admissionId}/medications`, {
            headers,
            data: { name: `Jadval${n}`, dosage: '1 tab', route: 'Ichga', frequency: 'har 2 soatda' },
        })).json();
        expect(order.id, 'dori tayinlandi').toBeTruthy();

        await login(page);
        /* Toshkent vaqti bilan 06:00 dan keyin kamida bitta vaqt o'tgan bo'ladi.
           Undan oldin son nol — u holda ro'yxat to'g'ridan-to'g'ri ochiladi. */
        const tashkent = new Date(Date.now() + 5 * 3600e3);
        const anyDue = tashkent.getUTCHours() >= 6;
        if (anyDue) {
            await go(page, '/reception');
            const zone = page.locator('section[aria-label="Statsionar"]');
            await expect(zone).toBeVisible({ timeout: 30_000 });
            const due = (await zones()).inpatient.medsDue;
            expect(due, 'vaqti kelgan tayinlov bor').toBeGreaterThan(0);
            await zone.getByRole('button', { name: `${due} muolaja vaqti keldi` }).click();
            await expect(page).toHaveURL(/#\/inpatient/, { timeout: 15_000 });
        } else {
            await go(page, '/inpatient?tab=meds');
        }

        /* «Dori varag'i» alohida vkladka edi; endi u Statsionar xaritasidagi
           hamshira posti. Tayinlov postda bitta satr: soati va holati bilan. */
        const row = page.locator('#nurse-post li', { hasText: `Jadval${n}` });
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText(/\d{2}:\d{2}/);
        if (anyDue) await expect(row).toContainText(/vaqti keldi/i);
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
