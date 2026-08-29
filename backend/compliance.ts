/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — huquqiy kontur: bemor hujjatlari va kirish jurnali.

   MUAMMO. Tizimda bemor IMZOLAYDIGAN birorta hujjat yo'q, va tibbiy yozuvni
   kim ochgani hech qayerda yozilmaydi. Ikkisi ham qonun talabi:

   - 26-modda — pullik xizmat SHARTNOMASI;
   - 25-modda 4-qismi — aralashuvdan oldin XABARDOR ROZILIK;
   - ЗРУ-547 — shaxsga doir ma'lumotlarni qayta ishlashga ROZILIK;
   - 25-modda 3-qismi — vrach siri: ma'lumotga kim kirgani aniqlanishi kerak.

   IKKI QAROR, ular kodning shaklini belgilaydi:

   В5. Chetdan kirishni TAQIQLAMAYMIZ, yozib qo'yamiz. Taqiq ishlayotgan
   klinikalarda shifokorlarga 403 bera boshlaydi — bu birdan buziladigan
   sahnalar. Jurnal javobgarlikni beradi, hech narsani buzmasdan.

   В14. Ko'rishlar ham yoziladi (ko'rish — vrach sirining o'zi), 24 oy
   saqlanadi, tozalash serverni ishga tushirishda.

   MUHIM: jurnalga API orqali YOZIB BO'LMAYDI. Tashqaridan yozish mumkin
   bo'lgan jurnalga ishonch yo'q.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { tashkentDateStr } from './tashkentTime';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
    assertPatientOwnership: (req: any, res: any, patientId: string) => Promise<boolean>;
};

/* ═══ JURNALGA YOZISH ═════════════════════════════════════════════════════════

   Yozuv so'rovni TO'XTATMAYDI va xato bersa ham so'rovni buzmaydi: jurnal
   muhim, lekin bemorni ko'rishdan muhim emas. Shu sababli `void` va `catch`. */

export function logAccess(prisma: any, req: any, data: {
    action: 'View' | 'Create' | 'Update' | 'Delete' | 'Print' | 'Export';
    entityType: string;
    entityId?: string | null;
    patientId?: string | null;
    clinicId?: string | null;
}) {
    const user = req?.user || {};
    const clinicId = data.clinicId || user.clinicId;
    if (!clinicId) return;

    prisma.accessLog.create({
        data: {
            clinicId,
            userRole: user.role || null,
            userName: user.name || null,
            userId: user.doctorId || user.receptionistId || user.nurseId || user.technicianId || null,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId || null,
            patientId: data.patientId || null,
        },
    }).catch((e: any) => {
        // Jurnal yozilmasa ham ish davom etadi — lekin bu jimgina o'tmaydi
        console.warn('[AccessLog] yozib bo\'lmadi:', e?.message || e);
    });
}

/* ═══ O'CHIRISHLARNI JURNALGA OLISH ═══════════════════════════════════════════

   MUAMMO. Jurnal ishlayapti — bemor kartasini ochish, tashrifni ko'rish va
   hujjat yaratish yoziladi. Lekin O'CHIRISH umuman yozilmasdi: bazada 35 ta
   o'chirish marshruti bor va `AccessLog` da `action = 'Delete'` yozuvlari
   soni — 0. Ya'ni jurnal eng muhim voqeani o'tkazib yuborardi.

   NIMA UCHUN MARKAZLASHGAN, HAR MARSHRUTDA EMAS. 35 ta chaqiruv qo'shish —
   35 ta unutish imkoniyati, va yangi o'chirish marshruti qo'shilganda jurnal
   jimgina to'liqsiz bo'lib qoladi. Bu yerda esa qoida bitta: har qanday
   muvaffaqiyatli DELETE yoziladi.

   NIMA UCHUN `res.on('finish')`. Amal BAJARILGANIDAN keyin yozish kerak:
   400 yoki 403 bilan tugagan urinish o'chirish emas. Handler javobni
   yuborganda status ma'lum bo'ladi.

   NIMA UCHUN FAQAT DELETE. Har bir yozuv amalini jurnalga olish jurnalni
   kunlik ish oqimi bilan to'ldirib, o'chirishni ko'rinmas qilib qo'yardi.
   Yaratish va o'zgartirish tibbiy ahamiyatga ega joylarda (bemor kartasi,
   hujjatlar) allaqachon nuqtaviy yoziladi. */

/** `/api/patients/abc-123` → `Patient`; `/api/cash-movements/9` → `CashMovement` */
function entityFromPath(path: string): { entityType: string; entityId: string | null } {
    const parts = path.replace(/^\/api\//, '').split('/').filter(Boolean);
    if (!parts.length) return { entityType: 'Unknown', entityId: null };

    /* Oxirgi bo'lak identifikatormi yoki amal nomimi. `restore` va `api-key`
       kabi nomlar ID emas — ular yo'lning bir qismi. */
    const last = parts[parts.length - 1];
    const looksLikeId = /^[0-9a-f-]{8,}$/i.test(last) || /^\d+$/.test(last) || /^\d{4}-\d{2}-\d{2}$/.test(last);

    const resource = looksLikeId ? parts[parts.length - 2] ?? parts[0] : last;
    const entityId = looksLikeId ? last : null;

    // `cash-movements` → `CashMovement`, `patients` → `Patient`
    const singular = resource.replace(/ies$/, 'y').replace(/s$/, '');
    const entityType = singular
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');

    return { entityType: entityType || 'Unknown', entityId };
}

/**
 * Muvaffaqiyatli o'chirishni jurnalga yozadi. `authenticateToken` ichidan,
 * ruxsat tekshiruvidan KEYIN chaqiriladi — rad etilgan urinish o'chirish emas.
 */
export function auditDeletion(prisma: any, req: any, res: any) {
    if (req.method !== 'DELETE') return;

    res.on('finish', () => {
        if (res.statusCode >= 400) return;

        const { entityType, entityId } = entityFromPath(req.path);
        /* Bemor ID'si qayerdan kelishi marshrutga bog'liq: ba'zilarida
           yo'lda (`/api/patients/:id`), ba'zilarida tanada. Topilmasa
           `null` — yozuv baribir qimmatli. */
        const patientId = req.params?.patientId || req.body?.patientId
            || (entityType === 'Patient' ? entityId : null) || null;

        logAccess(prisma, req, { action: 'Delete', entityType, entityId, patientId });
    });
}

/**
 * 24 oydan oshgan yozuvlarni tozalash (qaror В14).
 *
 * Nima uchun ishga tushirishda, jadval (cron) bilan emas: bu offline dastur,
 * kechqurun o'chiriladi va tunda ishlaydigan jadvalga ishonch yo'q. Ishga
 * tushirishda tozalash esa har ochilganda bajariladi.
 */
export async function pruneAccessLog(prisma: any, months = 24) {
    try {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        const res = await prisma.accessLog.deleteMany({ where: { at: { lt: cutoff } } });
        if (res.count > 0) {
            console.log(`🧹 Kirish jurnali: ${res.count} eski yozuv tozalandi (${months} oydan oshgan)`);
        }
    } catch (e: any) {
        console.warn('⚠️ Kirish jurnalini tozalab bo\'lmadi:', e?.message || e);
    }
}

/* ═══ HUJJAT SHABLONLARI ══════════════════════════════════════════════════════

   Matn TIZIMDA turadi, chunki uni har klinika o'zi yozib chiqishi mumkin
   emas — bu huquqiy matn. Shablon `textSnapshot` ga NUSXA olinadi: keyin
   matnni to'g'irlaganimizda imzolangan hujjatlar o'zgarmaydi.

   Bu matnlar YURIST tekshirishidan o'tishi kerak. Hozircha ular qonun
   moddalariga havola bilan yozilgan ish varianti — buni klinikaga aytish
   kerak, "tizim beradi, demak to'g'ri" degan taassurot xavfli. */

const DOC_KINDS = ['Consent', 'Contract', 'DataConsent', 'Discharge', 'Other'];

const DOC_TITLES: Record<string, string> = {
    Consent: 'Xabardor rozilik',
    Contract: "Pullik tibbiy xizmat ko'rsatish shartnomasi",
    DataConsent: "Shaxsga doir ma'lumotlarni qayta ishlashga rozilik",
    Discharge: 'Bemor talabiga ko\'ra ma\'lumotnoma',
    Other: 'Hujjat',
};

function template(kind: string, ctx: { clinicName: string; patientName: string; date: string }): string {
    const head = `${ctx.clinicName}\n${DOC_TITLES[kind] || DOC_TITLES.Other}\nSana: ${ctx.date}\nBemor: ${ctx.patientName}\n\n`;

    if (kind === 'Consent') {
        return head +
            `Men, ${ctx.patientName}, tibbiy aralashuvning maqsadi, xarakteri, kutilayotgan\n` +
            `natijasi, mumkin bo'lgan asoratlari va muqobil usullari haqida tushunarli\n` +
            `shaklda ma'lumot oldim. Savol berish imkoniga ega bo'ldim va javob oldim.\n\n` +
            `Aralashuvga o'z xohishim bilan rozilik beraman. Roziligimni istalgan\n` +
            `vaqtda, aralashuv boshlanishidan oldin qaytarib olish huquqim borligini\n` +
            `bilaman.\n\n` +
            `Asos: "Fuqarolar salomatligini saqlash to'g'risida"gi qonun, 25-modda 4-qismi.`;
    }
    if (kind === 'Contract') {
        return head +
            `1. Ijrochi (${ctx.clinicName}) buyurtmachiga tibbiy xizmatlarni ko'rsatadi,\n` +
            `   buyurtmachi esa ko'rsatilgan xizmatlar uchun to'lovni amalga oshiradi.\n\n` +
            `2. Xizmatlarning nomi, hajmi va narxi tibbiy kartada va kassa hujjatlarida\n` +
            `   qayd etiladi. Narxlar xizmat ko'rsatilgan kunga ko'ra qo'llaniladi.\n\n` +
            `3. Buyurtmachi shifokor tavsiyalariga rioya qilish majburiyatini oladi.\n` +
            `   Tavsiyalarga rioya qilinmaganda natija uchun ijrochi javob bermaydi.\n\n` +
            `4. Tomonlarning javobgarligi va nizolarni hal qilish tartibi\n` +
            `   O'zbekiston Respublikasi qonunchiligiga muvofiq belgilanadi.\n\n` +
            `Asos: "Fuqarolar salomatligini saqlash to'g'risida"gi qonun, 26-modda.`;
    }
    if (kind === 'DataConsent') {
        return head +
            `Men, ${ctx.patientName}, ${ctx.clinicName} ga shaxsga doir ma'lumotlarimni\n` +
            `(F.I.Sh., tug'ilgan sana, aloqa ma'lumotlari, sog'liqqa doir ma'lumotlar)\n` +
            `tibbiy yordam ko'rsatish, hisob-kitob va qonunda belgilangan hisobot\n` +
            `maqsadlarida qayta ishlashga rozilik beraman.\n\n` +
            `Ma'lumotlarim uchinchi shaxslarga faqat qonunda ko'rsatilgan hollarda\n` +
            `beriladi. Roziligimni yozma murojaat bilan qaytarib olish huquqim bor.\n\n` +
            `Asos: "Shaxsga doir ma'lumotlar to'g'risida"gi ЗРУ-547 qonuni.`;
    }
    if (kind === 'Discharge') {
        return head + `Ma'lumotnoma bemorning yozma talabiga ko'ra berildi.`;
    }
    return head;
}

export function registerComplianceRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId, assertPatientOwnership } = deps;

    const route = (
        method: 'get' | 'post' | 'put' | 'delete',
        path: string,
        handler: (req: any, res: any, clinicId: string) => Promise<any>,
    ) => {
        (app as any)[method](path, auth, async (req: any, res: any) => {
            try {
                const clinicId = getScopedClinicId(req);
                if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
                await handler(req, res, clinicId);
            } catch (e: any) {
                console.error(`[${method.toUpperCase()} ${path}]`, e?.message || e);
                res.status(500).json({ error: e?.message || 'Server xatoligi' });
            }
        });
    };

    const hasRole = (req: any, ...roles: string[]) => roles.includes((req as any).user?.role);

    // ═══ HUJJATLAR ═══════════════════════════════════════════════════════════

    /** Hujjat raqami: YIL-KETMAKET, klinika ichida */
    async function nextDocNumber(clinicId: string): Promise<string> {
        const prefix = `${new Date().getFullYear()}/`;
        const last = await prisma.patientDocument.findFirst({
            where: { clinicId, number: { startsWith: prefix } },
            orderBy: { number: 'desc' },
            select: { number: true },
        });
        const seq = last ? parseInt(String(last.number).slice(prefix.length), 10) || 0 : 0;
        return `${prefix}${String(seq + 1).padStart(4, '0')}`;
    }

    route('post', '/api/patient-documents', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!hasRole(req, 'RECEPTIONIST', 'DOCTOR', 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const { patientId, visitId, kind, textSnapshot } = req.body || {};
        if (!patientId) return res.status(400).json({ error: "Bemor ko'rsatilmagan" });
        if (!DOC_KINDS.includes(String(kind))) {
            return res.status(400).json({ error: `Hujjat turi noto'g'ri (${DOC_KINDS.join(', ')})` });
        }
        if (!(await assertPatientOwnership(req, res, String(patientId)))) return;

        if (visitId) {
            const visit = await prisma.visit.findUnique({ where: { id: String(visitId) } });
            if (!visit || visit.clinicId !== clinicId) return res.status(404).json({ error: 'Qabul topilmadi' });
        }

        const [patient, clinic] = await Promise.all([
            prisma.patient.findUnique({ where: { id: String(patientId) }, select: { firstName: true, lastName: true } }),
            prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } }),
        ]);

        /* Matn: mijoz o'zi bergan bo'lsa o'shani olamiz (tahrirlangan
           variant), aks holda shablondan nusxa. Ikki holatda ham matn
           hujjat ichida QOLADI. */
        const text = textSnapshot && String(textSnapshot).trim()
            ? String(textSnapshot)
            : template(String(kind), {
                clinicName: clinic?.name || 'Klinika',
                patientName: `${patient?.lastName || ''} ${patient?.firstName || ''}`.trim(),
                date: tashkentDateStr(),
            });

        let created: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
            try {
                created = await prisma.patientDocument.create({
                    data: {
                        clinicId,
                        patientId: String(patientId),
                        visitId: visitId ? String(visitId) : null,
                        kind: String(kind),
                        number: await nextDocNumber(clinicId),
                        textSnapshot: text,
                        createdByName: user?.name || null,
                    },
                });
            } catch (e: any) {
                lastError = e;
                if (e?.code !== 'P2002') throw e;
            }
        }
        if (!created) throw lastError;

        logAccess(prisma, req, {
            action: 'Create', entityType: 'PatientDocument',
            entityId: created.id, patientId: String(patientId), clinicId,
        });
        res.json(created);
    });

    route('get', '/api/patient-documents', async (req, res, clinicId) => {
        const { patientId, kind } = req.query;
        if (patientId && !(await assertPatientOwnership(req, res, String(patientId)))) return;

        const items = await prisma.patientDocument.findMany({
            where: {
                clinicId,
                ...(patientId ? { patientId: String(patientId) } : {}),
                ...(kind ? { kind: String(kind) } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        if (patientId) {
            logAccess(prisma, req, {
                action: 'View', entityType: 'PatientDocument',
                patientId: String(patientId), clinicId,
            });
        }
        res.json(items);
    });

    /** Bosma varaq uchun: klinika shapkasi va bemor ma'lumoti bilan */
    route('get', '/api/patient-documents/:id', async (req, res, clinicId) => {
        const doc = await prisma.patientDocument.findUnique({
            where: { id: req.params.id },
            include: {
                patient: {
                    select: {
                        firstName: true, lastName: true, dob: true,
                        gender: true, phone: true, cardNumber: true, address: true,
                    },
                },
            },
        });
        if (!doc || doc.clinicId !== clinicId) return res.status(404).json({ error: 'Hujjat topilmadi' });

        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { name: true, phone: true, address: true, licenseNumber: true, letterheadNote: true },
        });

        logAccess(prisma, req, {
            action: 'View', entityType: 'PatientDocument',
            entityId: doc.id, patientId: doc.patientId, clinicId,
        });
        res.json({ ...doc, clinic, title: DOC_TITLES[doc.kind] || DOC_TITLES.Other });
    });

    /**
     * Hujjatni IMZOLANGAN deb belgilash.
     *
     * Nima uchun bu alohida amal: hujjat yaratilishi bilan imzolanmaydi.
     * Uni bosib chiqarish, bemorga o'qitish va qo'l qo'ydirish kerak. Faqat
     * shundan keyin tizimda "imzolangan" deb belgilanadi.
     */
    route('post', '/api/patient-documents/:id/sign', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!hasRole(req, 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const doc = await prisma.patientDocument.findUnique({ where: { id: req.params.id } });
        if (!doc || doc.clinicId !== clinicId) return res.status(404).json({ error: 'Hujjat topilmadi' });
        if (doc.signedAt) return res.status(409).json({ error: 'Hujjat allaqachon imzolangan' });

        const updated = await prisma.patientDocument.update({
            where: { id: doc.id },
            data: {
                signedAt: new Date(),
                signedByName: user?.name || null,
                patientSigned: req.body?.patientSigned !== false,
                // ERI hozircha ishlatilmaydi, lekin kelsa shu maydonlarga tushadi
                signature: req.body?.signature ? String(req.body.signature) : null,
                signerCertificate: req.body?.signerCertificate ? String(req.body.signerCertificate) : null,
            },
        });

        logAccess(prisma, req, {
            action: 'Update', entityType: 'PatientDocument',
            entityId: doc.id, patientId: doc.patientId, clinicId,
        });
        res.json(updated);
    });

    // ═══ KIRISH JURNALI ══════════════════════════════════════════════════════

    /* Jurnal FAQAT klinika egasiga. Nima uchun shifokorga ham emas: "kim
       kartani ko'rdi" yozuvining o'zi ham nozik ma'lumot, va shifokor kim
       uning murojaatlarini tekshirganini ko'rmasligi kerak. */
    route('get', '/api/access-log', async (req, res, clinicId) => {
        if (!hasRole(req, 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q — jurnal faqat klinika egasiga" });
        }
        const { patientId, from, to, action, entityType } = req.query;

        const where: any = { clinicId };
        if (patientId) where.patientId = String(patientId);
        if (action) where.action = String(action);
        if (entityType) where.entityType = String(entityType);
        if (from || to) {
            where.at = {};
            if (from) where.at.gte = new Date(`${String(from)}T00:00:00.000Z`);
            if (to) where.at.lt = new Date(new Date(`${String(to)}T00:00:00.000Z`).getTime() + 24 * 3600e3);
        }

        const [items, total] = await Promise.all([
            prisma.accessLog.findMany({
                where,
                include: { patient: { select: { firstName: true, lastName: true } } },
                orderBy: { at: 'desc' },
                take: 500,
            }),
            prisma.accessLog.count({ where }),
        ]);

        res.json({
            items: items.map((l: any) => ({
                ...l,
                patientName: l.patient ? `${l.patient.lastName} ${l.patient.firstName}` : null,
                patient: undefined,
            })),
            total,
            // 500 dan ko'p bo'lsa ekranda aytiladi: "hammasi emas"
            truncated: total > items.length,
            retentionMonths: 24,
        });
    });

    console.log('✅ Huquqiy kontur endpointlari ulandi');
}
