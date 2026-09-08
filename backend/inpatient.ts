/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — STATSIONAR: koyka haqi, dori berilishi, harorat varag'i, ko'chirish.

   MUAMMO. Statsionar tizimda "bor", lekin yotgan bemor bilan HECH NARSA
   sodir bo'lmaydi:

   1. Koyka haqi. `Admission.dailyRate` maydoni bor, `lastChargedDate` ham bor,
      lekin ularni hisoblaydigan kod YO'Q. Bemor 8 kun yotib chiqadi, hisobda
      nol. Kassir kalkulyatorda hisoblab, qo'lda kiritadi (B44).

   2. Dori. `MedicationOrder` — tayinlash. Berilgani haqida yozuv yo'q: hamshira
      qog'ozga belgi qo'yadi, ombor dorini "bor" deb hisoblaydi, bemor hisobida
      dori ko'rinmaydi (B47, B48, B49).

   3. Harorat varag'i. Ko'rsatkichlar `InpatientRound.vitalSigns` JSON matnida
      yotadi — grafik qurib bo'lmaydi (B51).

   4. Ko'chirish. Koyka almashtirilganda `bedId` ustiga yozib yuboriladi,
      "reanimatsiyada qancha yotdi" degan savolga javob yo'qoladi (B52).

   5. Bo'shagan koyka `Cleaning` holatida ABADIY qoladi: uni `Free` ga
      qaytaradigan hech narsa yo'q (B53).

   Bu modul beshini ham yopadi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { serializeWorkDays } from './hr';
import { som } from './money';
import { tashkentDateStr } from './tashkentTime';
import { writeOff } from './inventory';
import { emitEvent } from './events';
import { validateVital, VITAL_KINDS as SHARED_VITAL_KINDS } from '../shared/validation';
import { createCharge } from './billing';
import bcrypt from 'bcryptjs';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

/* Pul — BUTUN so'm, `money.ts` dagi yagona qoida. Ilgari bu yerda
   o'zining nusxasi turardi va modullar orasida aniqlik farq qilardi. */
const round = som;

/** 'YYYY-MM-DD' ni bir kun oldinga suradi */
function nextDay(date: string): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return dt.toISOString().slice(0, 10);
}

/** DateTime dan Toshkent kunini oladi */
function dayOfLocal(v: Date | string): string {
    const t = new Date(v).getTime() + 5 * 60 * 60 * 1000;
    return new Date(t).toISOString().slice(0, 10);
}

/* O'lchov turlari va CHEGARALARI `shared/validation.ts` da — front ham
   shu ro'yxatdan o'qiydi (S3.1). Ilgari bu yerdagi ro'yxat frontdagisi
   bilan qo'lda ushlab turilardi. */
const VITAL_KINDS = SHARED_VITAL_KINDS;
const VITAL_UNITS: Record<string, string> = {
    Temp: '°C', BpSys: 'mmHg', BpDia: 'mmHg', Pulse: 'urish/min',
    Weight: 'kg', Height: 'sm', SpO2: '%',
};

/* ═══ KOYKA HAQI ══════════════════════════════════════════════════════════════

   Nima uchun "quvib yetuvchi" hisob, "bugun uchun yozish" emas.

   Bu OFFLINE dastur: kechqurun kompyuter o'chiriladi, dam olish kunlari
   umuman ochilmaydi. Har kunga bir marta ishlaydigan jadval (cron) shu
   kunlarni O'TKAZIB YUBORADI va koyka haqi yo'qoladi.

   Shuning uchun hisob har chaqirilganda `admittedAt` dan bugungi kunga
   (yoki chiqarilgan kungacha) YETIB OLADI. Ikkinchi marta chaqirilsa hech
   narsa qo'shilmaydi: har kun uchun qator `sourceId = admissionId:sana`
   bilan belgilangan va mavjudligi tekshiriladi.

   `lastChargedDate` ga TAYANMAYMIZ, faqat yangilaymiz: u qator yaratilmasdan
   ham o'zgargan bo'lishi mumkin (yotishni yaratishda o'sha kun yoziladi).
   Idempotentlik qatorlarning o'zidan kelib chiqadi — bu ishonchliroq. */

export async function chargeBedDays(prisma: any, admissionId: string, userName?: string | null) {
    const adm = await prisma.admission.findUnique({ where: { id: admissionId } });
    if (!adm) return { charged: 0, from: null, to: null, total: 0, skipped: 'yotish topilmadi' };
    if (!(adm.dailyRate > 0)) {
        return { charged: 0, from: null, to: null, total: 0, skipped: 'koyka narxi 0' };
    }

    const firstDay = dayOfLocal(adm.admittedAt);
    // Chiqarilgan kun ham hisoblanadi: bemor o'sha kuni koykani egallagan
    const lastDay = adm.dischargedAt ? dayOfLocal(adm.dischargedAt) : tashkentDateStr();
    if (lastDay < firstDay) return { charged: 0, from: null, to: null, total: 0, skipped: 'sana teskari' };

    // Bekor qilinganlar HAM hisobga olinadi: qasddan bekor qilingan kun
    // qayta tirilmasligi kerak
    const existing = await prisma.visitCharge.findMany({
        where: { clinicId: adm.clinicId, source: 'Bed', admissionId: adm.id },
        select: { sourceId: true },
    });
    const have = new Set(existing.map((c: any) => String(c.sourceId || '')));

    let day = firstDay;
    let charged = 0;
    let total = 0;
    const days: string[] = [];

    // Cheklov: bir chaqiriqda 400 kundan ko'p emas (buzuq sanadan himoya)
    for (let guard = 0; day <= lastDay && guard < 400; guard++, day = nextDay(day)) {
        const sourceId = `${adm.id}:${day}`;
        if (have.has(sourceId)) continue;

        const row = await createCharge(prisma, {
            clinicId: adm.clinicId,
            patientId: adm.patientId,
            patientName: adm.patientName,
            source: 'Bed',
            sourceId,
            admissionId: adm.id,
            name: `Koyka (${day})`,
            unitPrice: adm.dailyRate,
            quantity: 1,
            createdByName: userName || 'Tizim',
            doctorId: adm.doctorId,
            doctorName: adm.doctorName,
        });
        if (row) { charged++; total = round(total + row.total); days.push(day); }
    }

    if (charged > 0) {
        await prisma.admission.update({
            where: { id: adm.id },
            data: {
                lastChargedDate: lastDay,
                totalCharges: round((adm.totalCharges || 0) + total),
            },
        });
    }

    return { charged, from: days[0] || null, to: days[days.length - 1] || null, total };
}

/** Server ishga tushganda: o'chirilgan kunlarni quvib yetadi */
export async function chargeAllPendingBedDays(prisma: any) {
    try {
        const active = await prisma.admission.findMany({
            where: { status: 'Active', dailyRate: { gt: 0 } },
            select: { id: true },
        });
        let totalRows = 0;
        for (const a of active) {
            const r = await chargeBedDays(prisma, a.id, 'Tizim (ishga tushish)');
            totalRows += r.charged;
        }
        if (totalRows > 0) {
            console.log(`🛏  Koyka haqi: ${totalRows} kun uchun qator yozildi (${active.length} yotish)`);
        }
    } catch (e: any) {
        // Ishga tushishni to'xtatmaydi: koyka haqi keyin ham hisoblanadi
        console.warn('⚠️ Koyka haqini hisoblab bo\'lmadi:', e?.message || e);
    }
}

export function registerInpatientRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;

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

    /** Yotish shu klinikaga tegishlimi */
    const ownAdmission = async (id: string, clinicId: string) => {
        const a = await prisma.admission.findUnique({ where: { id } });
        return a && a.clinicId === clinicId ? a : null;
    };

    const hasRole = (req: any, ...roles: string[]) => roles.includes((req as any).user?.role);

    // ═══ KOYKA HAQI ══════════════════════════════════════════════════════════

    route('post', '/api/admissions/:id/charge-bed-days', async (req, res, clinicId) => {
        if (!hasRole(req, 'CLINIC_ADMIN', 'RECEPTIONIST')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const adm = await ownAdmission(req.params.id, clinicId);
        if (!adm) return res.status(404).json({ error: 'Yotish topilmadi' });

        const result = await chargeBedDays(prisma, adm.id, (req as any).user?.name);
        res.json(result);
    });

    /* ═══ YOTISH HISOBI ═══════════════════════════════════════════════════════

       Statsionar to'lovi tartibi yo'q edi: depozit, oraliq hisob, chiqarishda
       yakuniy hisob — hech narsa (GAP-ANALYSIS, 3-sahna, 10-band).

       QAROR В7 ga ko'ra alohida depozit sxemasi KERAK EMAS: `Patient.balance`
       allaqachon avans uchun ishlaydi, 'Avans' xizmati bilan to'lov balansni
       oshiradi, `type: 'Balance'` esa kamaytiradi. Ya'ni depozit = avans, va
       yangi jadval o'ylab topish shart emas.

       Bu endpoint bitta savolga javob beradi: shu yotishga qancha yozilgan,
       qancha to'langan, qancha qoldi va bemorning avansi bor-yo'qmi. */
    route('get', '/api/admissions/:id/billing', async (req, res, clinicId) => {
        const adm = await ownAdmission(req.params.id, clinicId);
        if (!adm) return res.status(404).json({ error: 'Yotish topilmadi' });

        const [charges, patient] = await Promise.all([
            prisma.visitCharge.findMany({
                where: { clinicId, admissionId: adm.id, status: { not: 'Cancelled' } },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.patient.findUnique({
                where: { id: adm.patientId },
                select: { balance: true, firstName: true, lastName: true },
            }),
        ]);

        const accrued = round(charges.reduce((s: number, c: any) => s + c.total, 0));
        const paid = round(charges.reduce((s: number, c: any) => s + (c.paidAmount || 0), 0));

        // Manba bo'yicha: koyka, dori, xizmat — "nima uchun bunday summa"
        const bySource: Record<string, { count: number; total: number; paid: number }> = {};
        for (const c of charges) {
            const k = String(c.source);
            if (!bySource[k]) bySource[k] = { count: 0, total: 0, paid: 0 };
            bySource[k].count++;
            bySource[k].total = round(bySource[k].total + c.total);
            bySource[k].paid = round(bySource[k].paid + (c.paidAmount || 0));
        }

        res.json({
            admissionId: adm.id,
            patientName: adm.patientName,
            status: adm.status,
            dailyRate: adm.dailyRate,
            accrued,
            paid,
            due: round(accrued - paid),
            /* Avans — bu ayni depozit. Statsionarga yotqizishda kassa
               'Avans' xizmati bilan pul oladi, keyin shu hisobdan yechiladi. */
            advance: round(patient?.balance || 0),
            bySource,
            charges,
        });
    });

    // ═══ DORI BERILISHI (MAR) ════════════════════════════════════════════════

    /* Nima uchun bu eng muhim endpoint. "Dori berildi" degan yozuv uch narsani
       bir vaqtda hal qiladi:
         - tibbiy hujjat: kim, qachon, qancha berdi;
         - ombor: dori haqiqatda ishlatildi, qoldiq kamaydi;
         - pul: berilgan dori bemor hisobiga tushadi.
       Ilgari uchtasi ham yo'q edi. */
    route('post', '/api/medication-orders/:id/administer', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!hasRole(req, 'NURSE', 'DOCTOR', 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }

        const order = await prisma.medicationOrder.findUnique({
            where: { id: req.params.id },
            include: { admission: true, medication: true },
        });
        if (!order || order.admission?.clinicId !== clinicId) {
            return res.status(404).json({ error: 'Tayinlov topilmadi' });
        }
        if (order.admission.status === 'Discharged') {
            return res.status(409).json({ error: 'Bemor chiqarilgan' });
        }

        const status = ['Given', 'Skipped', 'Refused'].includes(String(req.body?.status))
            ? String(req.body.status) : 'Given';
        if (status !== 'Given' && !String(req.body?.skipReason || '').trim()) {
            // Berilmagan dorining SABABI majburiy: "belgi yo'q" bilan
            // "bermadim, chunki..." bir xil emas
            return res.status(400).json({ error: 'Berilmagan bo\'lsa sabab majburiy' });
        }

        const qty = Number(req.body?.quantity) > 0 ? Number(req.body.quantity) : 1;

        const record = await prisma.medicationAdministration.create({
            data: {
                clinicId,
                orderId: order.id,
                admissionId: order.admissionId,
                givenByName: user?.name || null,
                dose: req.body?.dose ? String(req.body.dose).slice(0, 100) : (order.dosage || null),
                status,
                skipReason: req.body?.skipReason ? String(req.body.skipReason).slice(0, 300) : null,
                note: req.body?.note ? String(req.body.note).slice(0, 300) : null,
            },
        });

        /* Ombor va pul — FAQAT haqiqatda berilganda. Skipped va Refused
           holatida dori qutida qoladi. */
        let charge: any = null;
        let stockMoves = 0;
        if (status === 'Given' && order.medicationId && order.medication) {
            try {
                const moves = await writeOff(prisma, {
                    clinicId,
                    itemId: order.medicationId,
                    quantity: qty,
                    /* Sabab 'Service': dori bemorga BERILGAN va hisobiga
                       tushgan — bu behuda ketish emas. Ilgari bu yerda
                       'Statsionar' turardi va chiqimlar hisobotida dori
                       "behuda ketgan" ustuniga tushib, zararni oshirib
                       ko'rsatardi (sahnalar testi ko'rsatdi). Statsionar
                       ekani izohda qoladi. */
                    reason: 'Service',
                    note: `Statsionar · MAR ${record.id} · ${order.admission.patientName}`,
                    userName: user?.name || null,
                });
                stockMoves = moves.length;
            } catch (e: any) {
                // Chiqim o'tmasa ham BERILGANLIK fakti saqlanadi: tibbiy
                // yozuvni ombor xatosi tufayli yo'qotib bo'lmaydi
                console.error('MAR chiqimi o\'tmadi:', e?.message || e);
            }

            const price = Number(order.medication.price) || 0;
            if (price > 0) {
                charge = await createCharge(prisma, {
                    clinicId,
                    patientId: order.admission.patientId,
                    patientName: order.admission.patientName,
                    source: 'Medication',
                    sourceId: record.id,
                    admissionId: order.admissionId,
                    name: `${order.name}${req.body?.dose ? ` (${req.body.dose})` : ''}`,
                    unitPrice: price,
                    quantity: qty,
                    createdByName: user?.name || null,
                    doctorId: order.admission.doctorId,
                    doctorName: order.admission.doctorName,
                });
                if (charge) {
                    await prisma.medicationAdministration.update({
                        where: { id: record.id },
                        data: { chargeId: charge.id },
                    });
                    await prisma.admission.update({
                        where: { id: order.admissionId },
                        data: { totalCharges: round((order.admission.totalCharges || 0) + charge.total) },
                    });
                }
            }
        }

        res.json({ administration: record, charge, stockMoves });
    });

    /** Bitta bemorning kunlik dori varag'i */
    route('get', '/api/admissions/:id/mar', async (req, res, clinicId) => {
        const adm = await ownAdmission(req.params.id, clinicId);
        if (!adm) return res.status(404).json({ error: 'Yotish topilmadi' });

        const date = String(req.query.date || tashkentDateStr());
        const orders = await prisma.medicationOrder.findMany({
            where: {
                admissionId: adm.id,
                // Shu kunga tegishli tayinlovlar: boshlangan va tugamagan
                startDate: { lte: date },
                OR: [{ endDate: null }, { endDate: { gte: date } }],
            },
            orderBy: { createdAt: 'asc' },
        });

        const start = new Date(`${date}T00:00:00.000Z`);
        const marks = await prisma.medicationAdministration.findMany({
            where: {
                admissionId: adm.id,
                givenAt: {
                    // Toshkent kuni = UTC 19:00 (oldingi kun) dan 19:00 gacha
                    gte: new Date(start.getTime() - 5 * 3600e3),
                    lt: new Date(start.getTime() + 19 * 3600e3),
                },
            },
            orderBy: { givenAt: 'asc' },
        });

        const byOrder = new Map<string, any[]>();
        for (const m of marks) {
            const arr = byOrder.get(m.orderId) || [];
            arr.push(m);
            byOrder.set(m.orderId, arr);
        }

        res.json({
            date,
            admission: {
                id: adm.id, patientName: adm.patientName,
                patientId: adm.patientId, departmentId: adm.departmentId,
            },
            orders: orders.map((o: any) => ({
                ...o,
                administrations: byOrder.get(o.id) || [],
                givenToday: (byOrder.get(o.id) || []).filter((m: any) => m.status === 'Given').length,
            })),
        });
    });

    /* Bo'limning kunlik dori ro'yxati — hamshiraning asosiy ekrani.
       "Bugun kimga nima berilishi kerak" degan savolga bitta so'rovda javob. */
    route('get', '/api/inpatient/med-schedule', async (req, res, clinicId) => {
        const date = String(req.query.date || tashkentDateStr());
        const departmentId = req.query.departmentId ? String(req.query.departmentId) : null;

        const admissions = await prisma.admission.findMany({
            where: {
                clinicId,
                status: 'Active',
                ...(departmentId ? { departmentId } : {}),
            },
            include: {
                bed: { include: { ward: true } },
                medicationOrders: {
                    where: {
                        startDate: { lte: date },
                        OR: [{ endDate: null }, { endDate: { gte: date } }],
                    },
                },
            },
            orderBy: { admittedAt: 'asc' },
        });

        const start = new Date(`${date}T00:00:00.000Z`);
        const marks = await prisma.medicationAdministration.findMany({
            where: {
                clinicId,
                givenAt: {
                    gte: new Date(start.getTime() - 5 * 3600e3),
                    lt: new Date(start.getTime() + 19 * 3600e3),
                },
            },
            select: { orderId: true, status: true, givenAt: true, givenByName: true, dose: true },
        });
        const byOrder = new Map<string, any[]>();
        for (const m of marks) {
            const arr = byOrder.get(m.orderId) || [];
            arr.push(m);
            byOrder.set(m.orderId, arr);
        }

        res.json({
            date,
            rows: admissions.map((a: any) => ({
                admissionId: a.id,
                patientName: a.patientName,
                ward: a.bed?.ward?.name || null,
                bed: a.bed?.label || null,
                orders: (a.medicationOrders || []).map((o: any) => ({
                    id: o.id, name: o.name, dosage: o.dosage,
                    route: o.route, frequency: o.frequency,
                    marks: byOrder.get(o.id) || [],
                })),
            })),
        });
    });

    // ═══ HARORAT VARAG'I ═════════════════════════════════════════════════════

    route('post', '/api/vitals', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!hasRole(req, 'NURSE', 'DOCTOR', 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const { patientId, admissionId, visitId, measurements, measuredAt } = req.body || {};
        if (!patientId) return res.status(400).json({ error: "Bemor ko'rsatilmagan" });

        const patient = await prisma.patient.findUnique({ where: { id: String(patientId) } });
        if (!patient || patient.clinicId !== clinicId) return res.status(404).json({ error: 'Bemor topilmadi' });
        if (admissionId && !(await ownAdmission(String(admissionId), clinicId))) {
            return res.status(404).json({ error: 'Yotish topilmadi' });
        }
        if (visitId) {
            const v = await prisma.visit.findUnique({ where: { id: String(visitId) } });
            if (!v || v.clinicId !== clinicId) return res.status(404).json({ error: 'Qabul topilmadi' });
        }

        const list = Array.isArray(measurements) ? measurements : [];
        if (list.length === 0) {
            return res.status(400).json({ error: `O'lchov yo'q (${VITAL_KINDS.join(', ')})` });
        }

        /* FIZIOLOGIK CHEGARA (S3.2, audit B-10).

           Bu yerda ilgari `isFinite(m.value)` turardi — ya'ni harorat 500,
           puls −40 va AD 9999 to'g'ri son sifatida o'tib, saqlanardi.

           Endi har o'lchov `shared/validation.ts` dagi chegara bo'yicha
           tekshiriladi. Xato TOPILGANDA HECH NARSA saqlanmaydi: bitta
           o'lchov noto'g'ri bo'lsa, boshqasini yozib qo'yish yarim holat
           yaratadi va hamshira nima saqlanganini bilmaydi. */
        const clean: { kind: string; value: number; unit?: string }[] = [];
        for (const m of list) {
            const kind = String(m?.kind || '');
            const check = validateVital(kind, m?.value);
            if (!check.ok) {
                return res.status(400).json({ error: check.error, code: 'VITAL_OUT_OF_RANGE', kind });
            }
            clean.push({ kind, value: check.value, unit: m?.unit });
        }

        const when = measuredAt ? new Date(measuredAt) : new Date();
        const created = [];
        for (const m of clean) {
            created.push(await prisma.vitalSign.create({
                data: {
                    clinicId,
                    patientId: String(patientId),
                    admissionId: admissionId ? String(admissionId) : null,
                    visitId: visitId ? String(visitId) : null,
                    measuredAt: when,
                    kind: m.kind,
                    value: m.value,
                    unit: m.unit ? String(m.unit) : (VITAL_UNITS[m.kind] || null),
                    measuredByName: user?.name || null,
                },
            }));
        }
        res.json(created);
    });

    route('get', '/api/patients/:id/vitals', async (req, res, clinicId) => {
        const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
        if (!patient || patient.clinicId !== clinicId) return res.status(404).json({ error: 'Bemor topilmadi' });

        const { kind, from, to, admissionId } = req.query;
        const items = await prisma.vitalSign.findMany({
            where: {
                clinicId,
                patientId: req.params.id,
                ...(kind ? { kind: String(kind) } : {}),
                ...(admissionId ? { admissionId: String(admissionId) } : {}),
                ...(from || to ? {
                    measuredAt: {
                        ...(from ? { gte: new Date(`${String(from)}T00:00:00.000Z`) } : {}),
                        ...(to ? { lt: new Date(new Date(`${String(to)}T00:00:00.000Z`).getTime() + 24 * 3600e3) } : {}),
                    },
                } : {}),
            },
            orderBy: { measuredAt: 'asc' },
            take: 2000,
        });
        res.json(items);
    });

    // ═══ KO'CHIRISH ══════════════════════════════════════════════════════════

    /* Ilgari koyka almashtirish `Admission.bedId` ni ustiga yozardi va tarix
       yo'qolardi. Endi har almashinuv alohida yozuv: qachon, qayerdan qayerga,
       kim va nima uchun. */
    route('post', '/api/admissions/:id/transfer', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!hasRole(req, 'DOCTOR', 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const adm = await ownAdmission(req.params.id, clinicId);
        if (!adm) return res.status(404).json({ error: 'Yotish topilmadi' });
        if (adm.status === 'Discharged') return res.status(409).json({ error: 'Bemor chiqarilgan' });

        const { toBedId, toDepartmentId, reason } = req.body || {};
        if (!toBedId && !toDepartmentId) {
            return res.status(400).json({ error: 'Koyka yoki bo\'lim ko\'rsatilishi kerak' });
        }

        let bed: any = null;
        if (toBedId) {
            bed = await prisma.bed.findUnique({ where: { id: String(toBedId) }, include: { ward: true } });
            if (!bed || bed.ward?.clinicId !== clinicId) return res.status(404).json({ error: 'Koyka topilmadi' });
            if (String(toBedId) === adm.bedId) return res.status(409).json({ error: 'Bemor allaqachon shu koykada' });
            if (bed.status === 'Occupied') return res.status(409).json({ error: 'Koyka band' });
        }
        if (toDepartmentId) {
            const dep = await prisma.department.findUnique({ where: { id: String(toDepartmentId) } });
            if (!dep || dep.clinicId !== clinicId) return res.status(404).json({ error: "Bo'lim topilmadi" });
        }

        const transfer = await prisma.admissionTransfer.create({
            data: {
                admissionId: adm.id,
                fromBedId: adm.bedId || null,
                toBedId: toBedId ? String(toBedId) : adm.bedId || null,
                fromDepartmentId: adm.departmentId || null,
                toDepartmentId: toDepartmentId ? String(toDepartmentId) : adm.departmentId || null,
                movedByName: user?.name || null,
                reason: reason ? String(reason).slice(0, 300) : null,
            },
        });

        if (toBedId) {
            await prisma.bed.update({ where: { id: String(toBedId) }, data: { status: 'Occupied' } });
            // Bo'shagan koyka tozalashga ketadi — yangi bemor darhol yotmaydi
            if (adm.bedId) {
                await prisma.bed.update({ where: { id: adm.bedId }, data: { status: 'Cleaning' } });
            }
        }

        const updated = await prisma.admission.update({
            where: { id: adm.id },
            data: {
                ...(toBedId ? { bedId: String(toBedId) } : {}),
                ...(toDepartmentId ? { departmentId: String(toDepartmentId) } : {}),
            },
            include: { bed: { include: { ward: true } } },
        });

        emitEvent(clinicId, 'admission.changed', { admissionId: updated.id, reason: 'transfer' });
        res.json({ admission: updated, transfer });
    });

    route('get', '/api/admissions/:id/transfers', async (req, res, clinicId) => {
        const adm = await ownAdmission(req.params.id, clinicId);
        if (!adm) return res.status(404).json({ error: 'Yotish topilmadi' });
        res.json(await prisma.admissionTransfer.findMany({
            where: { admissionId: adm.id },
            orderBy: { movedAt: 'asc' },
        }));
    });

    // ═══ KOYKA TOZALANDI ═════════════════════════════════════════════════════

    /* B53. Chiqarishdan keyin koyka `Cleaning` bo'lib qoladi va uni `Free` ga
       qaytaradigan hech narsa yo'q edi — palata asta-sekin "band" bo'lib
       tugaydi. */
    route('post', '/api/beds/:id/ready', async (req, res, clinicId) => {
        if (!hasRole(req, 'RECEPTIONIST', 'CLINIC_ADMIN', 'NURSE')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const bed = await prisma.bed.findUnique({ where: { id: req.params.id }, include: { ward: true } });
        if (!bed || bed.ward?.clinicId !== clinicId) return res.status(404).json({ error: 'Koyka topilmadi' });
        if (bed.status === 'Occupied') return res.status(409).json({ error: 'Koyka band — bemor yotibdi' });
        if (bed.status === 'Free') return res.json(bed);

        res.json(await prisma.bed.update({
            where: { id: bed.id },
            data: { status: 'Free' },
        }));
    });

    /* ─── KOYKA QO'SHISH VA BLOKLASH ────────────────────────────────────────

       Koykalar FAQAT palata yaratilganda, `bedCount` orqali paydo bo'lardi.
       Ya'ni palataga bitta koyka qo'shish, uni qayta nomlash yoki
       ta'mirga chiqarish IMKONI YO'Q edi: buning uchun palatani o'chirib,
       qaytadan yaratish kerak bo'lardi — birga yotgan bemorlar tarixi
       bilan. `Bed.status` dagi `Blocked` qiymati sxemada bor edi, lekin
       unga o'tadigan yo'l yo'q edi. */

    route('post', '/api/wards/:id/beds', async (req, res, clinicId) => {
        if (!hasRole(req, 'RECEPTIONIST', 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const ward = await prisma.ward.findUnique({
            where: { id: req.params.id }, include: { beds: true },
        });
        if (!ward || ward.clinicId !== clinicId) return res.status(404).json({ error: 'Palata topilmadi' });

        const label = String(req.body?.label || '').trim();
        /* Nom berilmasa — keyingi raqam. Mavjud nomlardan eng kattasini
           olamiz, sonini emas: koyka o'chirilgan bo'lsa nom takrorlanardi. */
        const nextNum = ward.beds.reduce((max: number, b: any) => {
            const m = /^(\d+)/.exec(b.label || '');
            return m ? Math.max(max, Number(m[1])) : max;
        }, 0) + 1;
        const finalLabel = label || `${nextNum}-koyka`;

        if (ward.beds.some((b: any) => b.label === finalLabel)) {
            return res.status(409).json({ error: 'Bu nomdagi koyka allaqachon bor' });
        }
        const bed = await prisma.bed.create({ data: { wardId: ward.id, label: finalLabel } });
        res.json(bed);
    });

    route('put', '/api/beds/:id', async (req, res, clinicId) => {
        if (!hasRole(req, 'RECEPTIONIST', 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const bed = await prisma.bed.findUnique({ where: { id: req.params.id }, include: { ward: true } });
        if (!bed || bed.ward?.clinicId !== clinicId) return res.status(404).json({ error: 'Koyka topilmadi' });

        const { label, status } = req.body || {};
        /* Bemor yotgan koykani na qayta nomlash, na bloklash mumkin —
           u ish stolida boshqa bemorga bo'sh bo'lib ko'rinib qolardi. */
        if (bed.status === 'Occupied' && (status !== undefined || label !== undefined)) {
            return res.status(409).json({ error: 'Koyka band — bemor yotibdi' });
        }
        if (status !== undefined && !['Free', 'Blocked', 'Cleaning'].includes(String(status))) {
            return res.status(400).json({ error: "Holat noto'g'ri" });
        }
        if (label !== undefined && String(label).trim() === '') {
            return res.status(400).json({ error: "Koyka nomi bo'sh bo'lmasin" });
        }
        res.json(await prisma.bed.update({
            where: { id: bed.id },
            data: {
                ...(label !== undefined && { label: String(label).trim() }),
                ...(status !== undefined && { status: String(status) }),
            },
        }));
    });

    route('delete', '/api/beds/:id', async (req, res, clinicId) => {
        if (!hasRole(req, 'CLINIC_ADMIN')) return res.status(403).json({ error: "Ruxsat yo'q" });
        const bed = await prisma.bed.findUnique({
            where: { id: req.params.id },
            include: { ward: true, admissions: { select: { id: true } } },
        });
        if (!bed || bed.ward?.clinicId !== clinicId) return res.status(404).json({ error: 'Koyka topilmadi' });
        /* Tarixi bor koyka O'CHIRILMAYDI: yotqizish yozuvlari unga
           bog'langan va ular yo'qolib ketardi. Bunday koyka BLOKLANADI. */
        if (bed.admissions.length) {
            return res.status(409).json({
                error: "Bu koykada yotqizish tarixi bor — o'chirib bo'lmaydi, bloklang",
                code: 'BED_HAS_HISTORY',
            });
        }
        await prisma.bed.delete({ where: { id: bed.id } });
        res.json({ success: true });
    });

    /* ─── DORI TAYINLASHNI TO'XTATISH ───────────────────────────────────────

       `MedicationOrder.status` va `endDate` sxemada bor edi, lekin
       yaratilgandan keyin ularga HECH QACHON tegilmasdi: bekor qilingan
       dori ham kunlik varaqda chiqib turaverardi va hamshira uni berishda
       davom etardi. */
    route('put', '/api/medication-orders/:id', async (req, res, clinicId) => {
        if (!hasRole(req, 'DOCTOR', 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const order = await prisma.medicationOrder.findUnique({
            where: { id: req.params.id }, include: { admission: true },
        });
        if (!order || order.admission?.clinicId !== clinicId) {
            return res.status(404).json({ error: 'Tayinlov topilmadi' });
        }
        const { status, endDate } = req.body || {};
        if (status !== undefined && !['Active', 'Stopped'].includes(String(status))) {
            return res.status(400).json({ error: "Holat noto'g'ri" });
        }
        res.json(await prisma.medicationOrder.update({
            where: { id: order.id },
            data: {
                ...(status !== undefined && { status: String(status) }),
                ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
                ...(status === 'Stopped' && endDate === undefined && { endDate: new Date() }),
            },
        }));
    });

    // ═══ HAMSHIRALAR ═════════════════════════════════════════════════════════

    /* Nima uchun bu yerda, server.ts da emas: hamshira — statsionar xodimi,
       va uning yagona vazifasi shu moduldagi dori varag'i bilan ishlash.

       ROL: yaratish/o'zgartirish faqat CLINIC_ADMIN. Mavjud xodim
       endpointlari (shifokor, laborant) buni tekshirmaydi — ya'ni registrator
       ham login yaratishi mumkin. Bu ishlayotgan xatti-harakat, uni shu
       relizda o'zgartirmayman (klinikada registrator xodim qo'shayotgan
       bo'lishi mumkin), lekin YANGI rol qat'iy boshlanadi. */

    const nurseSafe = {
        id: true, firstName: true, lastName: true, phone: true,
        status: true, clinicId: true, departmentId: true,
        username: true, createdAt: true,
        // Umumiy xodim maydonlari (migratsiya 0035)
        room: true, startHour: true, endHour: true, specialty: true,
        // Xodimlar moduli (migratsiya 0036)
        email: true, fixedSalary: true, workDays: true,
        // `password` ATAYLAB yo'q: hech qachon tashqariga chiqmaydi
    };

    /* Kabinet, ish soatlari va mutaxassislik — boshqa rollardagi bilan
       BIR XIL nomlanadi (0035). Soat chegarasi ham bir xil: 0..23. */
    const nurseCommon = (body: any): { ok: true; data: any } | { ok: false; error: string } => {
        const data: any = {};
        if (body.room !== undefined) data.room = body.room ? String(body.room).trim() : null;
        if (body.specialty !== undefined) data.specialty = body.specialty ? String(body.specialty).trim() : null;
        /* Xodimlar moduli (0036): oylik, pochta va ish kunlari — qolgan
           uch rol bilan bir xil nomda va bir xil qoidada. */
        if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null;
        if (body.fixedSalary !== undefined) {
            const n = Number(body.fixedSalary);
            if (!(n >= 0)) return { ok: false, error: "Oylik manfiy bo'lishi mumkin emas" };
            data.fixedSalary = Math.round(n);
        }
        if (body.workDays !== undefined) data.workDays = serializeWorkDays(body.workDays);
        for (const f of ['startHour', 'endHour'] as const) {
            if (body[f] === undefined) continue;
            if (body[f] === null || body[f] === '') { data[f] = null; continue; }
            const n = Math.floor(Number(body[f]));
            if (!(n >= 0 && n <= 23)) return { ok: false, error: "Ish soati 0 dan 23 gacha bo'lishi kerak" };
            data[f] = n;
        }
        return { ok: true, data };
    };

    route('get', '/api/nurses', async (req, res, clinicId) => {
        res.json(await prisma.nurse.findMany({
            where: { clinicId, status: { not: 'Deleted' } },
            select: nurseSafe,
            orderBy: { lastName: 'asc' },
        }));
    });

    route('post', '/api/nurses', async (req, res, clinicId) => {
        if (!hasRole(req, 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const { firstName, lastName, phone, departmentId, username, password } = req.body || {};
        if (!firstName || !lastName) return res.status(400).json({ error: 'Ism va familiya majburiy' });

        if (departmentId) {
            const dep = await prisma.department.findUnique({ where: { id: String(departmentId) } });
            if (!dep || dep.clinicId !== clinicId) return res.status(404).json({ error: "Bo'lim topilmadi" });
        }
        if (username) {
            const busy = await prisma.nurse.findUnique({ where: { username: String(username) } });
            if (busy) return res.status(400).json({ error: 'Bu login allaqachon band' });
        }

        const common = nurseCommon(req.body || {});
        if (!common.ok) return res.status(400).json({ error: common.error });

        const data: any = {
            clinicId,
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            phone: phone ? String(phone).trim() : null,
            departmentId: departmentId ? String(departmentId) : null,
            status: 'Active',
            ...common.data,
        };
        if (username) data.username = String(username).trim();
        if (password) data.password = await bcrypt.hash(String(password), await bcrypt.genSalt(10));

        const nurse = await prisma.nurse.create({ data, select: nurseSafe });
        res.json(nurse);
    });

    route('put', '/api/nurses/:id', async (req, res, clinicId) => {
        if (!hasRole(req, 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const existing = await prisma.nurse.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clinicId !== clinicId) return res.status(404).json({ error: 'Hamshira topilmadi' });

        const { firstName, lastName, phone, departmentId, status, username, password } = req.body || {};
        if (departmentId) {
            const dep = await prisma.department.findUnique({ where: { id: String(departmentId) } });
            if (!dep || dep.clinicId !== clinicId) return res.status(404).json({ error: "Bo'lim topilmadi" });
        }
        if (username) {
            const busy = await prisma.nurse.findUnique({ where: { username: String(username) } });
            if (busy && busy.id !== existing.id) return res.status(400).json({ error: 'Bu login allaqachon band' });
        }

        const commonUp = nurseCommon(req.body || {});
        if (!commonUp.ok) return res.status(400).json({ error: commonUp.error });

        const data: any = { ...commonUp.data };
        if (firstName !== undefined) data.firstName = String(firstName).trim();
        if (lastName !== undefined) data.lastName = String(lastName).trim();
        if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
        if (departmentId !== undefined) data.departmentId = departmentId ? String(departmentId) : null;
        if (status !== undefined) data.status = String(status);
        if (username !== undefined) data.username = username ? String(username).trim() : null;
        if (password) data.password = await bcrypt.hash(String(password), await bcrypt.genSalt(10));

        res.json(await prisma.nurse.update({ where: { id: existing.id }, data, select: nurseSafe }));
    });

    /* O'chirish YUMSHOQ: dori berilishi yozuvlarida "kim berdi" nomi qoladi,
       lekin xodim ro'yxatdan chiqadi va kira olmaydi. Tibbiy yozuvni
       xodim ketgani uchun yo'q qilib bo'lmaydi. */
    route('delete', '/api/nurses/:id', async (req, res, clinicId) => {
        if (!hasRole(req, 'CLINIC_ADMIN')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const existing = await prisma.nurse.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clinicId !== clinicId) return res.status(404).json({ error: 'Hamshira topilmadi' });

        res.json(await prisma.nurse.update({
            where: { id: existing.id },
            // Login ham bo'shatiladi: o'chirilgan xodim nomi bilan kirish yo'q
            data: { status: 'Deleted', username: null, password: null },
            select: nurseSafe,
        }));
    });

    console.log('✅ Statsionar endpointlari ulandi');
}
