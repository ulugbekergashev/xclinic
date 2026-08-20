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
import { tashkentDateStr } from './tashkentTime';
import { writeOff } from './inventory';
import { createCharge } from './billing';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

const round = (n: number) => Math.round(n * 100) / 100;

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

const VITAL_KINDS = ['Temp', 'BpSys', 'BpDia', 'Pulse', 'Weight', 'Height', 'SpO2'];
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
        if (!hasRole(req, 'CLINIC_ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST')) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const adm = await ownAdmission(req.params.id, clinicId);
        if (!adm) return res.status(404).json({ error: 'Yotish topilmadi' });

        const result = await chargeBedDays(prisma, adm.id, (req as any).user?.name);
        res.json(result);
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
        if (!hasRole(req, 'NURSE', 'DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN')) {
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
                    reason: 'Statsionar',
                    note: `MAR ${record.id} · ${order.admission.patientName}`,
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
        if (!hasRole(req, 'NURSE', 'DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN')) {
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
        const clean = list
            .map((m: any) => ({ kind: String(m?.kind || ''), value: Number(m?.value), unit: m?.unit }))
            .filter((m: any) => VITAL_KINDS.includes(m.kind) && isFinite(m.value));
        if (clean.length === 0) {
            return res.status(400).json({ error: `O'lchov yo'q yoki turi noto'g'ri (${VITAL_KINDS.join(', ')})` });
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
        if (!hasRole(req, 'DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN')) {
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
        if (!hasRole(req, 'RECEPTIONIST', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE')) {
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

    console.log('✅ Statsionar endpointlari ulandi');
}
