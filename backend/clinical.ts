/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — klinik kontur: bemor tarixi, allergiya, qabulni qulflash.

   MUAMMO. Shifokorning ish stolida bemor haqida faqat ism, yosh, jins, telefon
   va shikoyat bor edi. Ya'ni bir oy oldin xirurg ko'rgan bemor kelganda
   terapevt HECH NARSA ko'rmaydi: na allergiyani, na surunkali kasalliklarni,
   na oldingi qabullarni, na tahlil natijalarini.

   Allergiya esa qabul bayonining JSON matnida yotardi (`Visit.examData`,
   `allergies` kaliti) — uni qidirib ham, ko'rsatib ham bo'lmasdi. Bu
   GAP-ANALYSIS dagi C12 xatosining eng qimmat qismi: allergiya bemor
   xavfsizligi masalasi.

   Bu modul bitta so'rov bilan "avval nima bo'lgan" degan savolga javob beradi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { som } from './money';
import { tashkentDateStr } from './tashkentTime';
import { logAccess } from './compliance';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
    assertPatientOwnership: (req: any, res: any, patientId: string) => Promise<boolean>;
};

/* Pul — BUTUN so'm, `money.ts` dagi yagona qoida. Ilgari bu yerda
   o'zining nusxasi turardi va modullar orasida aniqlik farq qilardi. */
const round = som;

export function registerClinicalRoutes(app: express.Express, deps: Deps) {
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

    // ═══ BEMOR TARIXI (bitta so'rov) ═════════════════════════════════════════

    /**
     * GET /api/patients/:id/summary
     *
     * Shifokor begona bemorni ko'rganda bilishi kerak bo'lgan hamma narsa —
     * BITTA so'rovda. Ish stolida panel shu javobdan quriladi.
     *
     * Tartib ataylab shunday: allergiya birinchi, chunki u xavfsizlik masalasi.
     */
    route('get', '/api/patients/:id/summary', async (req, res, clinicId) => {
        const patientId = req.params.id;
        if (!(await assertPatientOwnership(req, res, patientId))) return;

        const [patient, allergies, chronic, visits, labs, studies, prescriptions, charges, admissions] =
            await Promise.all([
                prisma.patient.findUnique({
                    where: { id: patientId },
                    select: {
                        id: true, firstName: true, lastName: true, dob: true, gender: true,
                        phone: true, cardNumber: true, balance: true, medicalHistory: true,
                    },
                }),
                prisma.patientAllergy.findMany({
                    where: { patientId, isActive: true },
                    orderBy: [{ severity: 'desc' }, { notedAt: 'desc' }],
                }),
                prisma.patientDiagnosis.findMany({
                    where: { patientId, isChronic: true },
                    include: { icd10: { select: { code: true, name: true } } },
                    orderBy: { date: 'desc' },
                }),
                // Oxirgi qabullar — BOSHQA bo'limlarniki ham. Aynan shu narsa
                // ilgari ko'rinmasdi.
                prisma.visit.findMany({
                    where: { patientId, clinicId },
                    include: { department: { select: { name: true, color: true } } },
                    orderBy: { date: 'desc' },
                    take: 5,
                }),
                prisma.labOrder.findMany({
                    where: { patientId, clinicId, status: 'Completed' },
                    include: {
                        items: {
                            include: {
                                results: {
                                    include: { parameter: { select: { name: true, unit: true, refLow: true, refHigh: true } } },
                                },
                            },
                        },
                    },
                    orderBy: { completedAt: 'desc' },
                    take: 3,
                }),
                prisma.diagnosticStudy.findMany({
                    where: { patientId, clinicId, status: 'Completed' },
                    select: { id: true, modality: true, name: true, conclusion: true, performedAt: true },
                    orderBy: { performedAt: 'desc' },
                    take: 3,
                }),
                // Faol retseptlar — "hozir nima ichadi" savoliga javob
                prisma.prescription.findMany({
                    where: { patientId, clinicId, status: 'Active' },
                    include: { items: true },
                    orderBy: { createdAt: 'desc' },
                    take: 3,
                }),
                prisma.visitCharge.findMany({
                    where: { patientId, clinicId, status: 'Unpaid' },
                    select: { total: true, paidAmount: true },
                }),
                prisma.admission.findMany({
                    where: { patientId, clinicId },
                    select: { id: true, admittedAt: true, dischargedAt: true, status: true, diagnosis: true },
                    orderBy: { admittedAt: 'desc' },
                    take: 3,
                }),
            ]);

        if (!patient) return res.status(404).json({ error: 'Bemor topilmadi' });

        const due = round(charges.reduce((s: number, c: any) => s + (c.total - (c.paidAmount || 0)), 0));

        // Norma chegarasidan chiqqan natijalar — shifokor birinchi shuni ko'radi
        const abnormal: any[] = [];
        for (const order of labs) {
            for (const item of order.items || []) {
                for (const r of item.results || []) {
                    if (r.flag && r.flag !== 'Normal') {
                        abnormal.push({
                            name: r.parameter?.name || '—',
                            value: r.value, unit: r.parameter?.unit || null,
                            flag: r.flag,
                            refLow: r.parameter?.refLow ?? null,
                            refHigh: r.parameter?.refHigh ?? null,
                            at: order.completedAt,
                        });
                    }
                }
            }
        }

        /* Shifokor stolidagi "avval nima bo'lgan" paneli — bu ham
           bemor kartasini ko'rish. Jurnalga tushadi (qaror В14). */
        logAccess(prisma, req, {
            action: 'View', entityType: 'Patient',
            entityId: patientId, patientId, clinicId,
        });

        res.json({
            patient,
            allergies,
            chronic: chronic.map((d: any) => ({
                id: d.id, code: d.code, name: d.icd10?.name || d.code, date: d.date, notes: d.notes,
            })),
            recentVisits: visits.map((v: any) => ({
                id: v.id, date: v.date, status: v.status,
                department: v.department?.name || null,
                color: v.department?.color || null,
                doctorName: v.doctorName || null,
                diagnosis: v.diagnosis || null,
                disposition: v.disposition || null,
            })),
            recentLabs: labs.map((o: any) => ({
                id: o.id, completedAt: o.completedAt,
                tests: (o.items || []).map((i: any) => i.testName),
                seen: !!o.seenByDoctorAt,
            })),
            abnormalResults: abnormal.slice(0, 10),
            recentStudies: studies,
            activeMedications: prescriptions.flatMap((rx: any) =>
                (rx.items || []).map((i: any) => ({
                    name: i.name, dosage: i.dosage, frequency: i.frequency,
                    date: rx.date, prescriptionId: rx.id,
                })),
            ),
            admissions,
            due,
        });
    });

    // ═══ ALLERGIYA ═══════════════════════════════════════════════════════════

    route('get', '/api/patients/:id/allergies', async (req, res, clinicId) => {
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;
        const items = await prisma.patientAllergy.findMany({
            where: { patientId: req.params.id },
            orderBy: [{ isActive: 'desc' }, { notedAt: 'desc' }],
        });
        res.json(items);
    });

    route('post', '/api/patients/:id/allergies', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!['DOCTOR', 'CLINIC_ADMIN'].includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;

        const { substance, reaction, severity } = req.body;
        if (!substance || !String(substance).trim()) {
            return res.status(400).json({ error: 'Modda nomi majburiy' });
        }
        const allowed = ['Mild', 'Severe', 'Unknown'];
        const clean = String(substance).trim();

        /* Bir modda ikki marta yozilmasin. Aks holda qizil blokda
           "Penitsillin, Penitsillin, Penitsillin" chiqadi va o'chirganda
           bittasi qolib ketadi — ya'ni "o'chirdim, lekin turibdi" holati.
           Ayni modda allaqachon faol bo'lsa — YANGILAYMIZ (og'irlik va
           reaksiya aniqlashtirilishi mumkin). */
        // SQLite da `mode: 'insensitive'` ishlamaydi — solishtirishni qo'lda qilamiz
        const active = await prisma.patientAllergy.findMany({
            where: { patientId: req.params.id, isActive: true },
        });
        const existing = active.find(
            (a: any) => String(a.substance).trim().toLowerCase() === clean.toLowerCase(),
        );

        const data = {
            substance: clean,
            reaction: reaction ? String(reaction).trim() : null,
            severity: allowed.includes(severity) ? severity : 'Unknown',
            notedByName: user?.name || null,
        };

        const item = existing
            ? await prisma.patientAllergy.update({ where: { id: existing.id }, data })
            : await prisma.patientAllergy.create({
                data: { clinicId, patientId: req.params.id, ...data },
            });
        res.json(item);
    });

    /** Allergiya O'CHIRILMAYDI, faolsizlantiriladi: tibbiy tarix saqlanadi */
    route('delete', '/api/patients/:id/allergies/:allergyId', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!['DOCTOR', 'CLINIC_ADMIN'].includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const rec = await prisma.patientAllergy.findUnique({ where: { id: req.params.allergyId } });
        if (!rec || rec.clinicId !== clinicId || rec.patientId !== req.params.id) {
            return res.status(404).json({ error: 'Topilmadi' });
        }
        await prisma.patientAllergy.update({
            where: { id: req.params.allergyId }, data: { isActive: false },
        });
        res.json({ success: true, deactivated: true });
    });

    // ═══ NATIJA KO'RILDI ═════════════════════════════════════════════════════

    /* Ilgari natija kelganda shifokorga hech narsa xabar bermasdi: navbatda
       "tayyor" va "kutilmoqda" bir xil ko'rinardi. Endi ko'rilmagan natija
       belgilanadi va shifokor ochganda belgi o'chadi. */

    route('post', '/api/lab-orders/:id/seen', async (req, res, clinicId) => {
        const order = await prisma.labOrder.findUnique({ where: { id: req.params.id } });
        if (!order || order.clinicId !== clinicId) return res.status(404).json({ error: 'Topilmadi' });
        await prisma.labOrder.update({
            where: { id: req.params.id }, data: { seenByDoctorAt: new Date() },
        });
        res.json({ success: true });
    });

    route('post', '/api/studies/:id/seen', async (req, res, clinicId) => {
        const study = await prisma.diagnosticStudy.findUnique({ where: { id: req.params.id } });
        if (!study || study.clinicId !== clinicId) return res.status(404).json({ error: 'Topilmadi' });
        await prisma.diagnosticStudy.update({
            where: { id: req.params.id }, data: { seenByDoctorAt: new Date() },
        });
        res.json({ success: true });
    });

    /**
     * GET /api/visits/pending-results
     *
     * Natijasi tayyor, lekin shifokor ko'rmagan qabullar. SANA bilan
     * CHEKLANMAYDI: tahlil bir kundan ko'p vaqt olsa, qabul "bugungi navbat"
     * dan chiqib ketardi va umuman ko'rinmasdi (GAP-ANALYSIS, B22).
     */
    route('get', '/api/visits/pending-results', async (req, res, clinicId) => {
        const user = (req as any).user;
        const doctorFilter = user?.role === 'DOCTOR' && user?.doctorId
            ? { doctorId: user.doctorId }
            : {};

        const visits = await prisma.visit.findMany({
            where: {
                clinicId,
                status: 'AwaitingResults',
                ...doctorFilter,
            },
            include: {
                patient: { select: { firstName: true, lastName: true } },
                department: { select: { name: true } },
                labOrders: { select: { id: true, status: true, completedAt: true, seenByDoctorAt: true } },
                studies: { select: { id: true, status: true, performedAt: true, seenByDoctorAt: true } },
            },
            orderBy: { date: 'desc' },
            take: 100,
        });

        // "Tayyor va ko'rilmagan" — ekranda aynan shu belgi kerak
        const rows = visits.map((v: any) => {
            const readyLabs = (v.labOrders || []).filter((o: any) => o.status === 'Completed');
            const readyStudies = (v.studies || []).filter((s: any) => s.status === 'Completed');
            const unseen = readyLabs.filter((o: any) => !o.seenByDoctorAt).length
                + readyStudies.filter((s: any) => !s.seenByDoctorAt).length;
            const pending = (v.labOrders || []).length - readyLabs.length
                + (v.studies || []).length - readyStudies.length;
            return {
                visitId: v.id, date: v.date, queueNumber: v.queueNumber,
                patientName: `${v.patient?.lastName || ''} ${v.patient?.firstName || ''}`.trim(),
                department: v.department?.name || null,
                doctorName: v.doctorName || null,
                awaitingSince: v.awaitingSince,
                readyCount: readyLabs.length + readyStudies.length,
                unseenCount: unseen,
                stillPending: pending,
            };
        });

        // Ko'rilmagan natijasi borlar tepada
        rows.sort((a: any, b: any) => b.unseenCount - a.unseenCount);
        res.json(rows);
    });

    // ═══ QABULNI QULFLASH ════════════════════════════════════════════════════

    /**
     * Yakunlangan qabulni qulflash. Ilgari `PUT /api/visits/:id` har qanday
     * holatdagi qabulni tahrirlardi — oylar oldingi bayonni jimgina qayta
     * yozish mumkin edi.
     */
    route('post', '/api/visits/:id/lock', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!['DOCTOR', 'CLINIC_ADMIN'].includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
        if (!visit || visit.clinicId !== clinicId) return res.status(404).json({ error: 'Qabul topilmadi' });
        if (visit.lockedAt) return res.status(409).json({ error: 'Qabul allaqachon qulflangan' });

        const updated = await prisma.visit.update({
            where: { id: req.params.id },
            data: {
                lockedAt: new Date(),
                lockedByName: user?.name || null,
                // Qulflash yakunlashni ham bildiradi
                ...(visit.status !== 'Completed' ? { status: 'Completed', checkOutTime: new Date() } : {}),
                ...(req.body?.disposition ? { disposition: String(req.body.disposition) } : {}),
            },
        });
        res.json(updated);
    });

    /**
     * TAHLIL DINAMIKASI: bitta ko'rsatkich vaqt bo'yicha.
     *
     * Nima uchun kerak. Bitta gemoglobin qiymati kam narsa aytadi. Ma'nosi
     * O'ZGARISHDA: 130 → 118 → 98 — bu qon yo'qotish, va uni faqat qatorlar
     * yonma-yon turganda ko'rish mumkin (GAP-ANALYSIS, 2-sahna, 5-band).
     * Hozir natijalar faqat o'z buyurtmasi ichida ko'rinadi.
     *
     * Ko'rsatkich bo'yicha guruhlaymiz, NOMI bilan emas id si bilan:
     * bir xil nomli ko'rsatkich turli tahlillarda boshqa normaga ega
     * bo'lishi mumkin.
     */
    route('get', '/api/patients/:id/lab-dynamics', async (req, res, clinicId) => {
        if (!(await assertPatientOwnership(req, res, req.params.id))) return;

        const results = await prisma.labResult.findMany({
            where: {
                orderItem: {
                    order: { clinicId, patientId: req.params.id, status: 'Completed' },
                },
                // Matnli natijalar grafikka tushmaydi ("salbiy", "topilmadi")
                valueNum: { not: null },
            },
            include: {
                parameter: { select: { id: true, name: true, unit: true, refLow: true, refHigh: true } },
                orderItem: {
                    select: {
                        testName: true,
                        order: { select: { completedAt: true, orderedAt: true } },
                    },
                },
            },
            orderBy: { enteredAt: 'asc' },
            take: 1000,
        });

        const byParam = new Map<string, any>();
        for (const r of results) {
            const key = r.parameterId;
            if (!byParam.has(key)) {
                byParam.set(key, {
                    parameterId: key,
                    name: r.parameter?.name || '—',
                    unit: r.parameter?.unit || null,
                    refLow: r.parameter?.refLow ?? null,
                    refHigh: r.parameter?.refHigh ?? null,
                    testName: r.orderItem?.testName || null,
                    points: [] as any[],
                });
            }
            byParam.get(key).points.push({
                at: r.orderItem?.order?.completedAt || r.enteredAt,
                value: r.valueNum,
                flag: r.flag,
            });
        }

        /* Bitta o'lchov — dinamika emas. Lekin uni ham qaytaramiz: shifokor
           "o'lchangan, lekin taqqoslash uchun yetarli emas" degan holatni
           ko'rishi kerak, ro'yxatda umuman yo'qligini emas. */
        const series = Array.from(byParam.values()).map((p: any) => {
            const pts = p.points;
            const last = pts[pts.length - 1];
            const prev = pts.length > 1 ? pts[pts.length - 2] : null;
            return {
                ...p,
                count: pts.length,
                last: last?.value ?? null,
                lastAt: last?.at ?? null,
                lastFlag: last?.flag ?? null,
                // O'zgarish: oxirgi ikki o'lchov orasida
                delta: prev ? Math.round((last.value - prev.value) * 100) / 100 : null,
            };
        });

        /* Tartib: normadan chetdagilar tepada, keyin o'lchovi ko'p bo'lganlar.
           Shifokor ekranning boshiga qaraydi va muammoni o'sha yerda ko'radi. */
        series.sort((a: any, b: any) => {
            const aBad = a.lastFlag && a.lastFlag !== 'Normal' ? 1 : 0;
            const bBad = b.lastFlag && b.lastFlag !== 'Normal' ? 1 : 0;
            if (aBad !== bBad) return bBad - aBad;
            return b.count - a.count;
        });

        logAccess(prisma, req, {
            action: 'View', entityType: 'LabOrder',
            patientId: req.params.id, clinicId,
        });
        res.json(series);
    });

    // ═══ YO'LLANMA ═══════════════════════════════════════════════════════════

    /* Nima uchun kerak. Hozir shifokor "kassaga boring, keyin UZI ga" deb
       og'zida aytadi (GAP-ANALYSIS B7, A29). Bemor kassaga kelib nima
       to'lashini o'zi tushuntiradi, kassir eshitib yozadi, bemor qo'lida esa
       hech qanday qog'oz qolmaydi.

       Yo'llanma — raqami, holati va BERILGAN PAYTDAGI narxi bor hujjat. */

    /** Yo'llanma raqami: YIL-KETMAKET. Klinika ichida takrorlanmaydi. */
    async function nextReferralNumber(clinicId: string): Promise<string> {
        const prefix = `${new Date().getFullYear()}-`;
        const last = await prisma.referral.findFirst({
            where: { clinicId, number: { startsWith: prefix } },
            orderBy: { number: 'desc' },
            select: { number: true },
        });
        const lastSeq = last ? parseInt(String(last.number).slice(prefix.length), 10) || 0 : 0;
        // To'rt xonali: qog'ozda o'qishga qulay, yiliga 9999 ta yetadi
        return `${prefix}${String(lastSeq + 1).padStart(4, '0')}`;
    }

    const REFERRAL_KINDS = ['Lab', 'Study', 'Consult', 'Cashier'];

    route('post', '/api/referrals', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!['DOCTOR', 'RECEPTIONIST', 'CLINIC_ADMIN'].includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const { patientId, visitId, kind, targetDepartmentId, items } = req.body || {};
        if (!patientId) return res.status(400).json({ error: "Bemor ko'rsatilmagan" });
        if (!REFERRAL_KINDS.includes(String(kind))) {
            return res.status(400).json({ error: `Yo'llanma turi noto'g'ri (${REFERRAL_KINDS.join(', ')})` });
        }
        if (!(await assertPatientOwnership(req, res, String(patientId)))) return;

        /* Kelgan HAR BIR havola tekshiriladi: tanada boshqa klinikaning
           qabuli yoki bo'limi ko'rsatilishi mumkin. Bu relizlarda topilgan
           17-20 teshiklarning darsi: clinicId ni tekshirish yetmaydi. */
        if (visitId) {
            const visit = await prisma.visit.findUnique({ where: { id: String(visitId) } });
            if (!visit || visit.clinicId !== clinicId) return res.status(404).json({ error: 'Qabul topilmadi' });
        }
        if (targetDepartmentId) {
            const dep = await prisma.department.findUnique({ where: { id: String(targetDepartmentId) } });
            if (!dep || dep.clinicId !== clinicId) return res.status(404).json({ error: "Bo'lim topilmadi" });
        }

        /* `payload` — qog'ozdagi ro'yxat va summa. Narx keyin o'zgarsa ham
           bemor qo'lidagi varaq bilan tizim bir xil qolishi kerak. */
        const list = Array.isArray(items) ? items : [];
        const clean = list
            .map((it: any) => ({
                name: String(it?.name || '').trim().slice(0, 200),
                price: round(Number(it?.price) || 0),
                quantity: Number(it?.quantity) > 0 ? Number(it.quantity) : 1,
            }))
            .filter((it: any) => it.name);
        const total = round(clean.reduce((sum: number, it: any) => sum + it.price * it.quantity, 0));

        /* Raqam unikal, ya'ni ikki yo'llanma bir vaqtda bir raqamni olishga
           urinishi mumkin. Unikal indeks xato bersa (P2002) qayta olamiz. */
        let created: any = null;
        let lastError: any = null;
        for (let attempt = 0; attempt < 5 && !created; attempt++) {
            try {
                created = await prisma.referral.create({
                    data: {
                        clinicId,
                        patientId: String(patientId),
                        visitId: visitId ? String(visitId) : null,
                        number: await nextReferralNumber(clinicId),
                        kind: String(kind),
                        targetDepartmentId: targetDepartmentId ? String(targetDepartmentId) : null,
                        issuedByName: user?.name || null,
                        payload: clean.length ? JSON.stringify({ items: clean, total }) : null,
                    },
                });
            } catch (e: any) {
                lastError = e;
                if (e?.code !== 'P2002') throw e;
            }
        }
        if (!created) throw lastError;
        res.json(created);
    });

    route('get', '/api/referrals', async (req, res, clinicId) => {
        const { patientId, status, visitId } = req.query;
        if (patientId && !(await assertPatientOwnership(req, res, String(patientId)))) return;
        const items = await prisma.referral.findMany({
            where: {
                clinicId,
                ...(patientId ? { patientId: String(patientId) } : {}),
                ...(status ? { status: String(status) } : {}),
                ...(visitId ? { visitId: String(visitId) } : {}),
            },
            include: {
                patient: { select: { firstName: true, lastName: true, phone: true, dob: true, gender: true } },
                targetDepartment: { select: { name: true } },
            },
            orderBy: { issuedAt: 'desc' },
            take: 200,
        });
        res.json(items);
    });

    /** Bosma varaq uchun: klinika shapkasi va yoyilgan payload bilan */
    route('get', '/api/referrals/:id', async (req, res, clinicId) => {
        const item = await prisma.referral.findUnique({
            where: { id: req.params.id },
            include: {
                patient: {
                    select: {
                        firstName: true, lastName: true, phone: true,
                        dob: true, gender: true, cardNumber: true,
                    },
                },
                targetDepartment: { select: { name: true } },
            },
        });
        if (!item || item.clinicId !== clinicId) return res.status(404).json({ error: "Yo'llanma topilmadi" });

        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { name: true, phone: true, address: true, licenseNumber: true, letterheadNote: true },
        });

        let payload: any = null;
        // Buzuq JSON butun varaqni yo'q qilmasligi kerak
        try { payload = item.payload ? JSON.parse(item.payload) : null; } catch { payload = null; }
        res.json({ ...item, clinic, payload });
    });

    /* Yo'llanma ISHLATILDI. Kassir to'lovni qabul qilganda yoki laborant
       bemorni qabul qilganda bosiladi: shu paytdan keyin o'sha qog'oz bilan
       ikkinchi marta kelib bo'lmaydi. */
    route('post', '/api/referrals/:id/use', async (req, res, clinicId) => {
        const item = await prisma.referral.findUnique({ where: { id: req.params.id } });
        if (!item || item.clinicId !== clinicId) return res.status(404).json({ error: "Yo'llanma topilmadi" });
        if (item.status === 'Cancelled') return res.status(409).json({ error: 'Bekor qilingan' });
        if (item.status === 'Used') return res.status(409).json({ error: 'Allaqachon ishlatilgan' });

        res.json(await prisma.referral.update({
            where: { id: item.id },
            data: { status: 'Used' },
        }));
    });

    route('post', '/api/referrals/:id/cancel', async (req, res, clinicId) => {
        const user = (req as any).user;
        if (!['DOCTOR', 'CLINIC_ADMIN'].includes(user?.role)) {
            return res.status(403).json({ error: "Ruxsat yo'q" });
        }
        const item = await prisma.referral.findUnique({ where: { id: req.params.id } });
        if (!item || item.clinicId !== clinicId) return res.status(404).json({ error: "Yo'llanma topilmadi" });
        /* Ishlatilganini bekor qilib bo'lmaydi: bemor allaqachon to'lagan yoki
           xizmatni olgan. Bunday holat pul qaytarish orqali yechiladi. */
        if (item.status === 'Used') {
            return res.status(409).json({ error: "Ishlatilgan yo'llanmani bekor qilib bo'lmaydi" });
        }
        res.json(await prisma.referral.update({
            where: { id: item.id },
            data: { status: 'Cancelled' },
        }));
    });

    console.log('✅ Klinik endpointlar ulandi');
}
