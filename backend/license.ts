/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — aktivatsiya va birinchi ishga tushirish.

   MUAMMO. Yangi o'rnatmada baza BO'SH bo'ladi: klinika ham, admin ham yo'q.
   Ilgari uni to'ldiradigan hech narsa yo'q edi — na Electron, na server
   `seed.ts` ni yurgizmasdi — ya'ni xaridor dasturni o'rnatib, ochib,
   kirolmasdi. Bu sotishga to'sqinlik qiladigan asosiy narsa edi.

   YECHIM: to'ldirilgan baza jo'natish emas, birinchi ishga tushirishda
   SOZLASH. Sabab: har klinikaning nomi, admini, bo'limlari va narxlari
   har xil — oldindan to'ldirilgan baza baribir qayta yozilishi kerak.

   OQIM:
     1. Dastur ochiladi -> `GET /api/license/status`
        -> `clinicExists: false` va MASHINA IDENTIFIKATORI qaytadi
     2. Xaridorga sozlash ekrani chiqadi, unda o'sha identifikator ko'rinadi
     3. Xaridor uni sotuvchiga yuboradi
     4. Sotuvchi kalit yasaydi:
        cd backend && npx ts-node --transpile-only scripts/generateKey.ts <ID>
     5. Xaridor klinika nomi, admin login/parol va kalitni kiritadi
     6. `POST /api/license/setup` kalitni tekshiradi va klinikani hamda
        adminni yaratadi

   NUSXADAN HIMOYA. Kalit `SHA256(machineId + maxfiy_tuz)` dan olinadi
   (`licenseService.ts`), ya'ni boshqa kompyuterga ko'chirilgan nusxa
   ochilmaydi. Tuz dentalocal nikidan BOSHQA — aks holda o'sha loyiha
   uchun berilgan kalit bu yerda ham ishlab ketardi.

   OBUNA YO'Q. XClinic bir marta sotiladi. `SubscriptionPlan` jadvali
   sxemada qolgan (`Clinic.planId` unga tashqi kalit bilan bog'langan),
   shuning uchun bitta doimiy «umrbod» yozuv yaratiladi. Muddat, tarif
   yoki to'lov tekshiruvi HECH QAYERDA yo'q.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import bcrypt from 'bcryptjs';
import { getMachineId } from './hwid';
import { verifyLicense } from './licenseService';

type Deps = {
    prisma: any;
};

/* Obuna apparatini qanoatlantirish uchun yagona yozuv. Bu TARIF EMAS —
   `Clinic.planId` majburiy va `SubscriptionPlan` ga bog'langani uchun
   kerak bo'lgan minimal qiymat. */
const LIFETIME_PLAN_ID = 'local-lifetime';

/* Muddat tekshirilmaydi, lekin maydon majburiy. Uzoq sana qo'yiladi —
   «muddati tugadi» degan holat hech qachon yuzaga kelmasin. */
const NO_EXPIRY = '2099-12-31T23:59:59Z';

export function registerLicenseRoutes(app: express.Express, deps: Deps) {
    const { prisma } = deps;

    /* ── HOLAT ────────────────────────────────────────────────────────────
       Sozlash ekrani shu javobga qarab chiziladi. HECH QACHON 500
       qaytarmaydi: baza ochilmasa ham foydalanuvchi kamida mashina
       identifikatorini ko'rishi va sotuvchiga yuborishi kerak. */
    app.get('/api/license/status', async (_req, res) => {
        let machineId = 'UNKNOWN';
        try {
            machineId = getMachineId();
        } catch (e: any) {
            console.error('[license/status] mashina identifikatori:', e?.message);
            machineId = 'HWID-ERROR';
        }

        let clinic: any = null;
        let dbError: string | null = null;
        try {
            clinic = await prisma.clinic.findFirst();
        } catch (e: any) {
            dbError = e?.message || 'baza xatoligi';
            console.error('[license/status] baza:', dbError);
        }

        const activated = !!(clinic?.licenseKey && verifyLicense(clinic.licenseKey));

        res.json({
            activated,
            clinicExists: !!clinic,
            /* MAJBURLASH HOLATI ham aytiladi.

               Bu maydonsiz interfeys noto'g'ri xulosa chiqarardi:
               `activated: false` ko'rgan zahoti aktivatsiya ekranini
               ochib, KIRISH SAHIFASINI to'sib qo'yardi. Holbuki ishlab
               chiqish rejimida va allaqachon ishlab turgan
               o'rnatmalarda tekshiruv o'chiq — ularning bazasida
               `licenseKey` yo'q, chunki u endi qo'shildi (migratsiya
               0032). Ya'ni butun boshli klinika ertalab kirish
               o'rniga kalit so'ralayotganini ko'rardi.

               Endi interfeys faqat `enforced: true` bo'lganda
               aralashadi. */
            enforced: process.env.LICENSE_ENFORCE === '1',
            machineId,
            /* Qisqartirilgan ko'rinish — telefon orqali aytish uchun.
               To'lig'i ham qaytariladi: nusxa olish tugmasi uchun kerak. */
            displayId: machineId.slice(0, 8) + '…',
            ...(dbError ? { dbError } : {}),
        });
    });

    /* ── AKTIVATSIYA ──────────────────────────────────────────────────────
       Klinika allaqachon bor, lekin kalit yo'q yoki eskirgan (masalan
       baza yangi kompyuterga ko'chirilgan). */
    app.post('/api/license/activate', async (req, res) => {
        try {
            const key = String(req.body?.key || '').trim();
            if (!key || !verifyLicense(key)) {
                return res.status(400).json({ error: 'Aktivatsiya kaliti noto\'g\'ri' });
            }
            const clinic = await prisma.clinic.findFirst();
            if (!clinic) {
                return res.status(404).json({ error: 'Klinika topilmadi — avval sozlashni yakunlang' });
            }
            await prisma.clinic.update({ where: { id: clinic.id }, data: { licenseKey: key } });
            console.log('🔑 Dastur aktivlashtirildi');
            res.json({ success: true });
        } catch (e: any) {
            console.error('[license/activate]', e?.message);
            res.status(500).json({ error: 'Aktivatsiya xatoligi' });
        }
    });

    /* ── BIRINCHI SOZLASH ─────────────────────────────────────────────────
       Klinikani va uning adminini yaratadi. Faqat baza BO'SH bo'lganda
       ishlaydi: aks holda bu marshrut mavjud klinikaning ustidan yozib,
       ikkinchi admin yaratish yo'liga aylanardi. */
    app.post('/api/license/setup', async (req, res) => {
        try {
            const clinicName = String(req.body?.clinicName || '').trim();
            const username = String(req.body?.username || '').trim().toLowerCase();
            const password = String(req.body?.password || '');
            const phone = String(req.body?.phone || '').trim();
            const key = String(req.body?.key || '').trim();

            if (!clinicName) return res.status(400).json({ error: 'Klinika nomini kiriting' });
            if (!username || !password) {
                return res.status(400).json({ error: 'Admin login va parolini kiriting' });
            }
            /* Parol uzunligi — yagona qoida bilan. Qisqa parol mahalliy
               tarmoqda ham xavf: tizimga klinikaning butun tarixi kiradi. */
            if (password.length < 8) {
                return res.status(400).json({ error: 'Parol kamida 8 belgidan iborat bo\'lsin' });
            }
            if (!key || !verifyLicense(key)) {
                return res.status(400).json({ error: 'Aktivatsiya kaliti noto\'g\'ri' });
            }

            const existing = await prisma.clinic.findFirst();
            if (existing) {
                return res.status(409).json({
                    error: 'Klinika allaqachon sozlangan',
                    hint: 'Kalitni yangilash uchun /api/license/activate dan foydalaning',
                });
            }

            const plan = await prisma.subscriptionPlan.upsert({
                where: { id: LIFETIME_PLAN_ID },
                update: {},
                create: {
                    id: LIFETIME_PLAN_ID,
                    name: 'Mahalliy (umrbod)',
                    price: 0,
                    maxDoctors: 9999,
                    features: 'all',
                },
            });

            const hashed = await bcrypt.hash(password, 10);
            const now = new Date().toISOString();

            const clinic = await prisma.clinic.create({
                data: {
                    name: clinicName,
                    adminName: username,
                    username,
                    password: hashed,
                    phone,
                    status: 'Active',
                    licenseKey: key,
                    /* Obuna merosi — majburiy maydonlar. Hech qayerda
                       tekshirilmaydi, XClinic da tarif yo'q. */
                    planId: plan.id,
                    subscriptionStartDate: now,
                    expiryDate: NO_EXPIRY,
                    monthlyRevenue: 0,
                    subscriptionType: 'Lifetime',
                },
            });

            console.log(`✅ Klinika sozlandi: ${clinicName} (admin: ${username})`);
            res.json({ success: true, clinicId: clinic.id });
        } catch (e: any) {
            console.error('[license/setup]', e?.message);
            res.status(500).json({ error: 'Sozlashda xatolik: ' + (e?.message || '') });
        }
    });

    console.log('✅ Aktivatsiya endpointlari ulandi');
}
