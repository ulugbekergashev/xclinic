/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — ko'p profilli klinika endpointlari.

   server.ts allaqachon 6000 qatordan oshgan, shuning uchun yangi modullar shu
   yerda: bo'limlar, qabul shablonlari, laboratoriya, diagnostika, statsionar,
   dorixona.

   Xavfsizlik: barcha so'rovlar server.ts dagi `authenticateToken` va
   `getScopedClinicId` orqali o'tadi — clinicId hech qachon mijozdan olinmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import { emitEvent } from './events';
import { validateEncounterField } from '../shared/validation';
import { createCharge, cancelChargesBySource, payStateBySource, unpaidGate } from './billing';
import { applyServiceRecipe } from './inventory';
import { tashkentDateStr } from './tashkentTime';
import { logAccess } from './compliance';
import path from 'path';
import fs from 'fs';

type Deps = {
    prisma: any;
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
    /** server.ts dagi multer — fayllar AppData/uploads ga tushadi */
    upload: any;
    uploadsDir: string;
};

/** Diskdagi faylni o'chiradi — uploads/ papkasi o'chirilgan yozuvlar bilan shishmasin */
function removeUploadedFile(url: string | null | undefined, uploadsDir: string) {
    if (!url || !url.startsWith('/uploads/')) return;
    try {
        const p = path.join(uploadsDir, path.basename(url));
        if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) { console.warn('Faylni o\'chirib bo\'lmadi:', e); }
}

// Sana Toshkent bo'yicha — navbat raqami va koyka haqi shu sanaga bog'lanadi
const nowDate = () => tashkentDateStr();

/** Yosh (to'liq yil) — tahlil normasini tanlashda kerak */
function ageFromDob(dob?: string | null): number | null {
    if (!dob) return null;
    const d = new Date(dob);
    if (isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (365.25 * 864e5));
}

/**
 * Ko'rsatkich uchun bemorga mos normani tanlaydi.
 * Bir ko'rsatkichda jins/yosh bo'yicha bir necha qator bo'lishi mumkin —
 * eng aniq mos keladiganini olamiz.
 */
function pickReference(params: any[], sex: string | null, age: number | null) {
    const scored = params.map((p) => {
        let score = 0;
        if (p.sex) {
            if (!sex || p.sex !== sex) return null;   // mos kelmadi
            score += 2;
        }
        if (p.ageMin != null || p.ageMax != null) {
            if (age == null) return null;
            if (p.ageMin != null && age < p.ageMin) return null;
            if (p.ageMax != null && age > p.ageMax) return null;
            score += 1;
        }
        return { p, score };
    }).filter(Boolean) as { p: any; score: number }[];

    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[0].p;
}

/** Qiymatni normaga solishtirib bayroq qo'yadi */
function flagFor(valueNum: number | null, ref: { refLow: number | null; refHigh: number | null } | null): string {
    if (valueNum == null || !ref) return 'Normal';
    if (ref.refLow != null && valueNum < ref.refLow) return 'Low';
    if (ref.refHigh != null && valueNum > ref.refHigh) return 'High';
    return 'Normal';
}

export function registerMultiprofileRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, getScopedClinicId, upload, uploadsDir } = deps;

    /** Har bir endpoint uchun bir xil try/catch — takrorlanishni oldini oladi */
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
                console.error(`[${method.toUpperCase()} ${path}]`, e.message);
                res.status(500).json({ error: e.message || 'Server xatoligi' });
            }
        });
    };

    /** Yozuv shu klinikaga tegishliligini tekshiradi */
    const owns = async (model: string, id: string, clinicId: string) => {
        const rec = await prisma[model].findUnique({ where: { id } });
        return rec && rec.clinicId === clinicId ? rec : null;
    };

    /* Hamshira endi statsionar ekraniga kiradi (roli menyuga qo'shildi), va
       shu bilan quyidagi uchta amal ham unga ochilib qolgan edi: bu faylda
       rol umuman tekshirilmaydi. Palata ochish, yotqizish va CHIQARISH —
       hamshiraning ishi emas: chiqarishda epikriz yoziladi, ya'ni bu
       shifokor qarori. Qolgan rollarning huquqi o'zgarmaydi — bu yerda
       faqat NURSE qaytariladi. */
    const nurseDenied = (req: any, res: any) => {
        if (req?.user?.role !== 'NURSE') return false;
        res.status(403).json({ error: "Hamshirada bunga ruxsat yo'q" });
        return true;
    };

    // ═══ BO'LIMLAR ═══════════════════════════════════════════════════════════

    route('get', '/api/departments', async (req, res, clinicId) => {
        const items = await prisma.department.findMany({
            where: { clinicId },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        res.json(items);
    });

    route('post', '/api/departments', async (req, res, clinicId) => {
        const { name, code, type, color, sortOrder } = req.body;
        if (!name || !code) return res.status(400).json({ error: 'Nom va kod majburiy' });
        const dept = await prisma.department.create({
            data: {
                clinicId, name, code: String(code).toUpperCase(),
                type: type || 'CLINICAL', color: color || null, sortOrder: sortOrder ?? 0,
            },
        });
        res.json(dept);
    });

    route('put', '/api/departments/:id', async (req, res, clinicId) => {
        if (!(await owns('department', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { name, code, type, color, sortOrder, isActive } = req.body;
        const dept = await prisma.department.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(code !== undefined && { code: String(code).toUpperCase() }),
                ...(type !== undefined && { type }),
                ...(color !== undefined && { color }),
                ...(sortOrder !== undefined && { sortOrder }),
                ...(isActive !== undefined && { isActive }),
            },
        });
        res.json(dept);
    });

    route('delete', '/api/departments/:id', async (req, res, clinicId) => {
        if (!(await owns('department', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        // O'chirish o'rniga faolsizlantiramiz — eski qabullar bo'limga bog'langan
        // bo'lishi mumkin va ular tarixdan yo'qolmasligi kerak.
        await prisma.department.update({ where: { id: req.params.id }, data: { isActive: false } });
        res.json({ success: true, deactivated: true });
    });

    // ═══ QABUL BAYONI SHABLONLARI ════════════════════════════════════════════

    /* Shablonlar ro'yxati.
     *
     * `?patientId=` berilsa — BEMORGA MOS kelmaydigan shablonlar chiqarib
     * tashlanadi (migratsiya 0031). Sabab: ilgari erkak bemorda ginekologiya
     * shabloni ochilardi (audit B-09), chunki tanlov alifboga tushib
     * qolgandi va «Ginekolog ko'rigi» birinchi turardi.
     *
     * Filtrsiz ro'yxat ham kerak — Sozlamalarda shablonlarni tahrirlashda
     * hammasi ko'rinishi shart. Shuning uchun `patientId` majburiy emas.
     */
    route('get', '/api/encounter-templates', async (req, res, clinicId) => {
        const { departmentId, patientId } = req.query;
        const items = await prisma.encounterTemplate.findMany({
            where: { clinicId, ...(departmentId ? { departmentId: String(departmentId) } : {}) },
            orderBy: { name: 'asc' },
        });

        let filtered = items;
        if (patientId) {
            const patient = await prisma.patient.findFirst({
                where: { id: String(patientId), clinicId },
                select: { gender: true, dob: true },
            });
            if (patient) {
                const age = ageFromDob(patient.dob);
                filtered = items.filter((t: any) => {
                    if (t.gender && patient.gender && t.gender !== patient.gender) return false;
                    /* Yosh noma'lum bo'lsa chegara QO'LLANMAYDI: tug'ilgan
                       sanasi kiritilmagan bemorda hamma shablon yopilib
                       qolsa, shifokor hech narsa yoza olmaydi. */
                    if (age === null) return true;
                    if (t.minAge !== null && t.minAge !== undefined && age < t.minAge) return false;
                    if (t.maxAge !== null && t.maxAge !== undefined && age > t.maxAge) return false;
                    return true;
                });
            }
        }

        res.json(filtered.map((t: any) => ({ ...t, fields: safeParse(t.fields, []) })));
    });

    route('post', '/api/encounter-templates', async (req, res, clinicId) => {
        const { departmentId, name, fields, isDefault, gender, minAge, maxAge } = req.body;
        if (!departmentId || !name) return res.status(400).json({ error: "Bo'lim va nom majburiy" });
        const tpl = await prisma.encounterTemplate.create({
            data: {
                clinicId, departmentId, name,
                fields: JSON.stringify(fields || []),
                isDefault: !!isDefault,
                gender: normalizeGender(gender),
                minAge: normalizeAge(minAge),
                maxAge: normalizeAge(maxAge),
            },
        });
        res.json({ ...tpl, fields: safeParse(tpl.fields, []) });
    });

    route('put', '/api/encounter-templates/:id', async (req, res, clinicId) => {
        if (!(await owns('encounterTemplate', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { name, fields, isDefault, gender, minAge, maxAge } = req.body;
        const tpl = await prisma.encounterTemplate.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(fields !== undefined && { fields: JSON.stringify(fields) }),
                ...(isDefault !== undefined && { isDefault }),
                ...(gender !== undefined && { gender: normalizeGender(gender) }),
                ...(minAge !== undefined && { minAge: normalizeAge(minAge) }),
                ...(maxAge !== undefined && { maxAge: normalizeAge(maxAge) }),
            },
        });
        res.json({ ...tpl, fields: safeParse(tpl.fields, []) });
    });

    route('delete', '/api/encounter-templates/:id', async (req, res, clinicId) => {
        if (!(await owns('encounterTemplate', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        await prisma.encounterTemplate.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    });

    // ═══ QABUL (VISIT) ═══════════════════════════════════════════════════════
    // denta7 da Visit modeli bor edi, lekin CRUD yo'q edi — stomatologik oqim
    // tish kartasi orqali ishlardi. Endi Visit markaziy tugun, shuning uchun
    // to'liq CRUD kerak.

    route('get', '/api/visits', async (req, res, clinicId) => {
        const { patientId, date, departmentId, doctorId, status } = req.query;
        // `status=open` — registratura ochgan, hali yakunlanmagan qabullar.
        // Shifokorning kunlik navbati aynan shu.
        const statusFilter = status === 'open'
            ? { status: { in: ['Waiting', 'In Progress'] } }
            : status ? { status: String(status) } : {};

        const items = await prisma.visit.findMany({
            where: {
                clinicId,
                ...(patientId ? { patientId: String(patientId) } : {}),
                ...(date ? { date: String(date) } : {}),
                ...(departmentId ? { departmentId: String(departmentId) } : {}),
                ...(doctorId ? { doctorId: String(doctorId) } : {}),
                ...statusFilter,
            },
            include: {
                patient: true, department: true, procedures: true, diagnoses: { include: { icd10: true } },
                labOrders: { include: { items: true } },
                studies: true,
                prescriptions: { include: { items: true } },
                transactions: true,
            },
            orderBy: [{ date: 'desc' }, { queueNumber: 'asc' }],
        });
        res.json(items);
    });

    /** Bitta qabul — shifokorning ish stoli shuni ochadi */
    route('get', '/api/visits/:id', async (req, res, clinicId) => {
        const visit = await prisma.visit.findUnique({
            where: { id: req.params.id },
            include: {
                patient: true, department: true, template: true, procedures: true,
                diagnoses: { include: { icd10: true } },
                labOrders: { include: { items: true } },
                studies: { include: { files: true } },
                prescriptions: { include: { items: true } },
                transactions: true,
            },
        });
        if (!visit || visit.clinicId !== clinicId) return res.status(404).json({ error: 'Qabul topilmadi' });
        /* Qabul kartasi — eng to'liq tibbiy yozuv (tashxis, tahlillar,
           retseptlar). Kim ochganini yozmaslik mumkin emas. */
        logAccess(prisma, req, {
            action: 'View', entityType: 'Visit',
            entityId: visit.id, patientId: visit.patientId, clinicId,
        });
        res.json(visit);
    });

    route('post', '/api/visits', async (req, res, clinicId) => {
        const { patientId, appointmentId, date, departmentId, doctorId, doctorName,
                templateId, examData, complaints, vitalSigns, notes, diagnosis, treatmentPlan, status } = req.body;
        if (!patientId) return res.status(400).json({ error: 'Bemor majburiy' });

        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient || patient.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });

        const visitDate = date || nowDate();

        /* TAKRORIY QABUL. Ilgari tekshiruv yo'q edi: registratura bir kunda
           ikki marta bosса, o'sha bemorga o'sha bo'limda IKKINCHI qabul va
           ikkinchi navbat raqami ochilardi — konsultatsiya ikki marta
           hisobga tushardi (GAP-ANALYSIS, 1-sahna, 9-band).

           BOSHQA bo'limga ochish bemalol: ko'p profilli klinikada bemor bir
           kunda terapevt va UZI ga borishi normal.

           Jimgina biriktirib qo'ymaydi: 409 va mavjud qabulning id si
           qaytadi, qarorni odam qabul qiladi. `force: true` bilan ataylab
           ikkinchisini ochish mumkin (masalan ertalab va kechqurun ikki
           alohida murojaat). */
        if (!req.body?.force) {
            const open = await prisma.visit.findFirst({
                where: {
                    clinicId, patientId, date: visitDate,
                    departmentId: departmentId || null,
                    status: { notIn: ['Completed', 'Cancelled'] },
                },
                select: { id: true, queueNumber: true, status: true, doctorName: true },
            });
            if (open) {
                return res.status(409).json({
                    error: "Bu bemorga bugun shu bo'limda qabul allaqachon ochilgan",
                    visitId: open.id,
                    queueNumber: open.queueNumber,
                    status: open.status,
                });
            }
        }

        // Navbat raqami: har bo'limda har kuni 1 dan boshlanadi.
        // Registratura talonga shu raqamni bosadi, shifokor shu tartibda chaqiradi.
        const last = await prisma.visit.findFirst({
            where: { clinicId, date: visitDate, departmentId: departmentId || null },
            orderBy: { queueNumber: 'desc' },
            select: { queueNumber: true },
        });
        const queueNumber = (last?.queueNumber || 0) + 1;

        const visit = await prisma.visit.create({
            data: {
                clinicId, patientId,
                appointmentId: appointmentId || null,
                date: visitDate,
                queueNumber,
                departmentId: departmentId || null,
                doctorId: doctorId || null, doctorName: doctorName || null,
                templateId: templateId || null,
                examData: examData || null,
                complaints: complaints || null,
                vitalSigns: vitalSigns || null,
                notes: notes || null,
                diagnosis: diagnosis || null,
                treatmentPlan: treatmentPlan || null,
                // Registratura ochsa — navbatda kutadi; shifokor o'zi ochsa — darhol ish boshlanadi
                status: status || 'Waiting',
            },
            include: { patient: true, department: true, procedures: true },
        });
        emitEvent(clinicId, 'visit.created', { visitId: visit.id, departmentId: visit.departmentId });
        res.json(visit);
    });

    /** Qabulga xizmat qo'shish — narx kassaga shu orqali tushadi */
    route('post', '/api/visits/:id/procedures', async (req, res, clinicId) => {
        const visit = await owns('visit', req.params.id, clinicId);
        if (!visit) return res.status(403).json({ error: "Ruxsat yo'q" });

        const { serviceId, procedureName, price, discount, notes, doctorId, doctorName } = req.body;

        // Narx xizmatlar ro'yxatidan olinadi — mijoz yuborgan qiymatga ishonmaymiz
        let basePrice = Number(price) || 0;
        let name = procedureName;
        if (serviceId) {
            const svc = await prisma.service.findUnique({ where: { id: Number(serviceId) } });
            if (svc && svc.clinicId === clinicId) {
                basePrice = svc.price;
                name = name || svc.name;
            }
        }
        if (!name) return res.status(400).json({ error: 'Xizmat nomi majburiy' });

        const disc = Number(discount) || 0;
        const proc = await prisma.treatmentProcedure.create({
            data: {
                visitId: visit.id,
                procedureName: name,
                serviceId: serviceId ? Number(serviceId) : null,
                departmentId: visit.departmentId,
                basePrice, discount: disc, finalPrice: Math.max(0, basePrice - disc),
                notes: notes || null,
                doctorId: doctorId || visit.doctorId || '',
                doctorName: doctorName || visit.doctorName || '',
                status: 'Completed',
            },
        });

        // Retsept bo'yicha materiallar avtomatik ombordan chiqadi.
        // Bunsiz hech kim har shpritsni qo'lda yozmaydi va qoldiq yolg'on bo'ladi.
        if (serviceId) {
            try {
                await applyServiceRecipe(prisma, {
                    clinicId, serviceId: Number(serviceId),
                    visitId: visit.id,
                    userName: doctorName || visit.doctorName || null,
                });
            } catch (e: any) {
                // Ombor xatosi xizmat qo'shishni to'xtatmasligi kerak
                console.error('Retsept bo\'yicha chiqim xatosi:', e.message);
            }
        }

        // Kassaga boradigan "qog'oz" shu yerda tug'iladi
        const patient = await prisma.patient.findUnique({ where: { id: visit.patientId } });
        await createCharge(prisma, {
            clinicId, visitId: visit.id, patientId: visit.patientId,
            patientName: patient ? `${patient.lastName} ${patient.firstName}` : '',
            source: 'Service', sourceId: proc.id,
            // Xizmat katalogidagi id — shifokor ulushi shunga qarab hisoblanadi
            serviceId: proc.serviceId ?? null,
            name, unitPrice: basePrice, discount: disc,
            createdByName: doctorName || visit.doctorName || null,
            doctorId: proc.doctorId || null,
            doctorName: proc.doctorName || null,
        });

        emitEvent(clinicId, 'charge.changed', { reason: 'procedure', visitId: visit.id });
        res.json(proc);
    });

    route('delete', '/api/visit-procedures/:id', async (req, res, clinicId) => {
        const proc = await prisma.treatmentProcedure.findUnique({
            where: { id: req.params.id }, include: { visit: true },
        });
        if (!proc || proc.visit.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });
        await cancelChargesBySource(prisma, 'Service', proc.id);
        await prisma.treatmentProcedure.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    });

    route('put', '/api/visits/:id', async (req, res, clinicId) => {
        if (!(await owns('visit', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { departmentId, doctorId, doctorName, templateId, examData, complaints,
                vitalSigns, notes, diagnosis, treatmentPlan, status } = req.body;

        /* KO'RIK BAYONIDAGI KO'RSATKICHLAR (S3.2, audit B-10).

           Auditdagi 500 °C harorat va −40 puls AYNAN shu yo'ldan kirgan:
           «Ko'rik bayoni → KO'RSATKICHLAR». `examData` — shablon
           maydonlarining JSON'i va u hech qanday tekshiruvsiz saqlanardi.

           Front ham tekshiradi, lekin u yagona qo'riqchi bo'la olmaydi:
           `curl` bilan istalgan qiymat yuborish mumkin. Qoida bitta
           joydan — `shared/validation.ts`. */
        const raw = examData !== undefined ? examData : null;
        if (raw) {
            let parsed: any = raw;
            if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch { parsed = null; } }
            if (parsed && typeof parsed === 'object') {
                for (const [key, value] of Object.entries(parsed)) {
                    const check = validateEncounterField(key, value);
                    if (!check.ok) {
                        return res.status(400).json({
                            error: check.error, code: 'VITAL_OUT_OF_RANGE', field: key,
                        });
                    }
                }
            }
        }

        /* QABULNI YAKUNLASHDA NAZORAT (S3.7, audit B-12).

           Audit: «Qabulni yakunlash tashxissiz, ko'rsatkichsiz, bayonsiz,
           105 000 so'm to'lanmagan va tahlil natijasi Kutilmoqda holatida —
           tasdiqlashsiz o'tadi».

           TAQIQ EMAS, TANLOV. Bemor qarzga qolishi mumkin, natija ertaga
           kelishi mumkin — bular haqiqiy holatlar. Lekin shifokor ularni
           BILIB yopishi kerak, bilmay emas. Shuning uchun 409 va sabablar
           ro'yxati; `force: true` bilan yopiladi va sabab `notes` ga
           yoziladi.

           Server tomonda, chunki front yagona qo'riqchi bo'la olmaydi. */
        if (status === 'Completed' && req.body?.force !== true) {
            const [diagCount, unpaid, pendingLabs, pendingStudies] = await Promise.all([
                prisma.patientDiagnosis.count({ where: { visitId: req.params.id } }),
                prisma.visitCharge.aggregate({
                    where: { visitId: req.params.id, status: 'Unpaid' },
                    _sum: { total: true, paidAmount: true }, _count: { _all: true },
                }),
                prisma.labOrder.count({ where: { visitId: req.params.id, status: { notIn: ['Completed', 'Cancelled'] } } }),
                prisma.diagnosticStudy.count({ where: { visitId: req.params.id, status: { notIn: ['Completed', 'Cancelled'] } } }),
            ]);

            const due = (unpaid._sum.total || 0) - (unpaid._sum.paidAmount || 0);
            const reasons: { code: string; text: string }[] = [];
            if (diagCount === 0) reasons.push({ code: 'NO_DIAGNOSIS', text: "Tashxis qo'yilmagan" });
            if (due > 0) reasons.push({ code: 'UNPAID', text: `To'lanmagan: ${Math.round(due).toLocaleString('uz-UZ')} so'm` });
            if (pendingLabs > 0) reasons.push({ code: 'LAB_PENDING', text: `${pendingLabs} ta tahlil natijasi kelmagan` });
            if (pendingStudies > 0) reasons.push({ code: 'STUDY_PENDING', text: `${pendingStudies} ta tekshiruv yakunlanmagan` });

            if (reasons.length) {
                return res.status(409).json({
                    error: 'Qabulni yakunlashdan oldin tekshiring',
                    code: 'VISIT_INCOMPLETE',
                    reasons,
                });
            }
        }

        /* QABULNI BEKOR QILISH.

           `Cancelled` holati kodning hamma filtrida bor edi, lekin uni
           qo'yadigan joy yo'q edi — xato ochilgan qabul navbatda abadiy
           osilib turardi. Endi qo'yiladi, lekin ikkita shart bilan:

             1. Pul o'tgan bo'lsa — YO'Q. Qaytarish kassaning ishi
                (`POST /api/charges/:id/refund`), qabulni jimgina yopib
                pulni osmonda qoldirib bo'lmaydi.
             2. To'lanmagan qatorlar BEKOR QILINADI, aks holda ular
                kassaning «to'lanmagan» ro'yxatida abadiy qolardi. */
        if (status === 'Cancelled') {
            const paid = await prisma.visitCharge.aggregate({
                where: { visitId: req.params.id, status: { not: 'Cancelled' } },
                _sum: { paidAmount: true },
            });
            if ((paid._sum.paidAmount || 0) > 0) {
                return res.status(409).json({
                    error: "To'lov o'tgan qabulni bekor qilib bo'lmaydi — kassada qaytarish rasmiylashtiriladi",
                    code: 'VISIT_HAS_PAYMENT',
                });
            }
            await prisma.visitCharge.updateMany({
                where: { visitId: req.params.id, status: 'Unpaid' },
                data: { status: 'Cancelled' },
            });
            emitEvent(clinicId, 'charge.changed', { reason: 'visit-cancelled', visitId: req.params.id });
        }

        /* Sabab bilan yopilgan bo'lsa — u YOZIB QOLADI. «Nega tashxissiz
           yopilgan?» degan savol keyin ham javobsiz qolmasin.

           QO'SHILADI, ALMASHTIRILMAYDI. Ilgari bu yerda `notes: closeNote`
           turardi va u qabulning BUTUN izohini o'chirib yuborardi —
           shifokor yozgan matn yakunlash sababi bilan almashib ketardi. */
        let closeNote: string | null = null;
        if (status === 'Completed' && req.body?.force === true && req.body?.closeReason) {
            const reason = String(req.body.closeReason).slice(0, 200);
            const cur = await prisma.visit.findUnique({
                where: { id: req.params.id }, select: { notes: true },
            });
            const prev = (cur?.notes || '').trim();
            closeNote = (prev ? `${prev}\n${reason}` : reason).slice(0, 2000);
        }

        const visit = await prisma.visit.update({
            where: { id: req.params.id },
            data: {
                ...(closeNote && { notes: closeNote }),
                ...(departmentId !== undefined && { departmentId }),
                ...(doctorId !== undefined && { doctorId }),
                ...(doctorName !== undefined && { doctorName }),
                ...(templateId !== undefined && { templateId }),
                ...(examData !== undefined && { examData }),
                ...(complaints !== undefined && { complaints }),
                ...(vitalSigns !== undefined && { vitalSigns }),
                ...(notes !== undefined && { notes }),
                ...(diagnosis !== undefined && { diagnosis }),
                ...(treatmentPlan !== undefined && { treatmentPlan }),
                ...(status !== undefined && { status }),
                ...(status === 'Called' && { calledAt: new Date() }),
                ...(status === 'AwaitingResults' && { awaitingSince: new Date() }),
                // Natija kelib bemor qaytganda kutish vaqti tozalanadi
                ...(status === 'In Progress' && { awaitingSince: null }),
                ...(status === 'Completed' && { checkOutTime: new Date() }),
            },
            include: { procedures: true, department: true },
        });
        /* ─── KALENDARDAGI YOZUV QABUL BILAN BIRGA YURADI ────────────────

           `Appointment.status === 'Completed'` ni hech qanday kod
           qo'ymasdi: davomat hisoboti, qabuldan keyingi eslatma va baho
           so'rovi — hammasi jonli ma'lumotda o'lik edi.

           Bekor qilishda yozuv KUTISHGA qaytadi: qabul xato ochilgan
           bo'lishi mumkin va bemor baribir kutayotgan bo'ladi. Yozuvni
           butunlay bekor qilish — kalendarning o'z ishi. */
        if (visit.appointmentId && (status === 'Completed' || status === 'Cancelled')) {
            await prisma.appointment.updateMany({
                where: {
                    id: visit.appointmentId,
                    clinicId,
                    ...(status === 'Completed'
                        ? { status: { notIn: ['Completed', 'Cancelled'] } }
                        : { status: 'Checked-In' }),
                },
                data: { status: status === 'Completed' ? 'Completed' : 'Pending' },
            });
        }

        emitEvent(clinicId, 'visit.status', { visitId: visit.id, status: visit.status });
        res.json(visit);
    });

    /** Navbatni chaqirish — tablo shu holatni ko'rsatadi */
    route('post', '/api/visits/:id/call', async (req, res, clinicId) => {
        const visit = await owns('visit', req.params.id, clinicId);
        if (!visit) return res.status(403).json({ error: "Ruxsat yo'q" });
        const updated = await prisma.visit.update({
            where: { id: visit.id },
            data: { status: 'Called', calledAt: new Date() },
            include: { patient: true, department: true },
        });
        emitEvent(clinicId, 'visit.status', { visitId: updated.id, status: 'Called' });
        res.json(updated);
    });

    /**
     * Bugungi navbat tablosi — kutish zali ekrani uchun.
     * Autentifikatsiyasiz ochiladi: tablo alohida kompyuterda, login qilmasdan
     * turadi. Shuning uchun faqat navbat raqami va bo'lim beriladi —
     * bemor ismi yoki boshqa shaxsiy ma'lumot chiqmaydi.
     */
    app.get('/api/queue-board/:clinicId', async (req: any, res: any) => {
        try {
            const visits = await prisma.visit.findMany({
                where: {
                    clinicId: req.params.clinicId,
                    date: nowDate(),
                    status: { in: ['Waiting', 'Called', 'In Progress'] },
                },
                include: { department: { select: { name: true, color: true, code: true } } },
                orderBy: [{ status: 'asc' }, { queueNumber: 'asc' }],
            });
            res.json(visits.map((v: any) => ({
                queueNumber: v.queueNumber,
                /* TALON YORLIG'I (S5.6, audit B-1 tablo).

                   Navbat raqami HAR BO'LIMDA 1 dan boshlanadi (yuqoridagi
                   `POST /api/visits` ga qarang) — ya'ni to'rt bo'limda bir
                   vaqtda to'rtta «2» turadi va tabloga qaragan bemor
                   qaysi biri o'ziniki ekanini bilmaydi.

                   Yorliq bo'lim kodi bilan: K-02, P-02. Kod yo'q bo'lsa
                   raqamning o'zi qoladi — bo'lim majburiy emas. */
                ticket: v.department?.code
                    ? `${v.department.code}-${String(v.queueNumber ?? 0).padStart(2, '0')}`
                    : (v.queueNumber != null ? String(v.queueNumber) : null),
                status: v.status,
                calledAt: v.calledAt,
                department: v.department?.name || null,
                color: v.department?.color || null,
                // `doctorName` ATAYLAB yuborilmaydi: tablo autentifikatsiyasiz
                // ochiladi, ya'ni bu maydon ko'chadan ko'rinadigan ma'lumot
                // bo'lardi. Yuqoridagi izoh shaxsiy ma'lumot chiqmasligini
                // aytadi, lekin kod uni yuborib turgan edi — izoh bilan kod
                // mos kelmayotgan holat tuzatildi.
            })));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    route('delete', '/api/visits/:id', async (req, res, clinicId) => {
        if (!(await owns('visit', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        // Bog'langan yozuvlar tarixdan yo'qolmasligi kerak — faqat bo'sh qabul o'chadi
        const [proc, tx, lab] = await Promise.all([
            prisma.treatmentProcedure.count({ where: { visitId: req.params.id } }),
            prisma.transaction.count({ where: { visitId: req.params.id } }),
            prisma.labOrder.count({ where: { visitId: req.params.id } }),
        ]);
        if (proc + tx + lab > 0) {
            return res.status(409).json({ error: "Qabulga xizmat, to'lov yoki tahlil bog'langan — o'chirib bo'lmaydi" });
        }

        /* Qabul o'chirilsa kalendardagi yozuv KUTISHGA qaytadi.

           Ilgari u «Cheked-In» bo'lib qolardi: bemor «kelgan», qabuli
           esa yo'q. Registratura uni ro'yxatda ko'rmasdi va ikkinchi
           marta belgilay ham olmasdi — yozuv boshi berk ko'chada
           qolardi. */
        const visitRow = await prisma.visit.findUnique({
            where: { id: req.params.id },
            select: { appointmentId: true },
        });
        await prisma.$transaction(async (tx: any) => {
            await tx.visit.delete({ where: { id: req.params.id } });
            if (visitRow?.appointmentId) {
                await tx.appointment.updateMany({
                    where: { id: visitRow.appointmentId, clinicId, status: 'Checked-In' },
                    data: { status: 'Pending' },
                });
            }
        });
        res.json({ success: true });
    });

    // ═══ LABORATORIYA: KATALOG ═══════════════════════════════════════════════

    route('get', '/api/lab-tests', async (req, res, clinicId) => {
        const items = await prisma.labTest.findMany({
            where: { clinicId },
            include: { parameters: { orderBy: { sortOrder: 'asc' } } },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        res.json(items);
    });

    route('post', '/api/lab-tests', async (req, res, clinicId) => {
        const { name, code, sampleType, price, cost, turnaroundHours, departmentId, parameters } = req.body;
        if (!name || !code) return res.status(400).json({ error: 'Nom va kod majburiy' });
        const test = await prisma.labTest.create({
            data: {
                clinicId, name, code: String(code).toUpperCase(),
                sampleType: sampleType || 'Qon',
                price: Number(price) || 0, cost: Number(cost) || 0,
                turnaroundHours: Number(turnaroundHours) || 24,
                departmentId: departmentId || null,
                parameters: {
                    create: (parameters || []).map((p: any, i: number) => ({
                        name: p.name, unit: p.unit || null,
                        refLow: p.refLow ?? null, refHigh: p.refHigh ?? null,
                        refText: p.refText || null, sex: p.sex || null,
                        ageMin: p.ageMin ?? null, ageMax: p.ageMax ?? null,
                        sortOrder: i,
                    })),
                },
            },
            include: { parameters: true },
        });
        res.json(test);
    });

    route('put', '/api/lab-tests/:id', async (req, res, clinicId) => {
        if (!(await owns('labTest', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { name, sampleType, price, cost, turnaroundHours, isActive, departmentId, parameters } = req.body;

        // Ko'rsatkichlar berilgan bo'lsa — to'liq almashtiramiz. Eski natijalar
        // parameterId orqali bog'langani uchun ular tegilmaydi.
        if (Array.isArray(parameters)) {
            const used = await prisma.labResult.findMany({
                where: { parameter: { testId: req.params.id } },
                select: { parameterId: true },
            });
            const usedIds = new Set(used.map((r: any) => r.parameterId));
            await prisma.labTestParameter.deleteMany({
                where: { testId: req.params.id, id: { notIn: Array.from(usedIds) as string[] } },
            });
            for (let i = 0; i < parameters.length; i++) {
                const p = parameters[i];
                const data = {
                    name: p.name, unit: p.unit || null,
                    refLow: p.refLow ?? null, refHigh: p.refHigh ?? null,
                    refText: p.refText || null, sex: p.sex || null,
                    ageMin: p.ageMin ?? null, ageMax: p.ageMax ?? null,
                    sortOrder: i,
                };
                if (p.id && usedIds.has(p.id)) {
                    await prisma.labTestParameter.update({ where: { id: p.id }, data });
                } else {
                    await prisma.labTestParameter.create({ data: { ...data, testId: req.params.id } });
                }
            }
        }

        const test = await prisma.labTest.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(sampleType !== undefined && { sampleType }),
                ...(price !== undefined && { price: Number(price) }),
                ...(cost !== undefined && { cost: Number(cost) }),
                ...(turnaroundHours !== undefined && { turnaroundHours: Number(turnaroundHours) }),
                ...(isActive !== undefined && { isActive }),
                ...(departmentId !== undefined && { departmentId }),
            },
            include: { parameters: { orderBy: { sortOrder: 'asc' } } },
        });
        res.json(test);
    });

    route('delete', '/api/lab-tests/:id', async (req, res, clinicId) => {
        if (!(await owns('labTest', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const usedCount = await prisma.labOrderItem.count({ where: { testId: req.params.id } });
        if (usedCount > 0) {
            // Yo'llanmalarda ishlatilgan — o'chirmaymiz, faolsizlantiramiz
            await prisma.labTest.update({ where: { id: req.params.id }, data: { isActive: false } });
            return res.json({ success: true, deactivated: true });
        }
        await prisma.labTest.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    });

    // ═══ LABORATORIYA: NATIJALAR ═════════════════════════════════════════════

    /** Yo'llanma + bemorga moslangan normalar bilan to'liq natija */
    route('get', '/api/lab-orders/:id/results', async (req, res, clinicId) => {
        const order = await prisma.labOrder.findUnique({
            where: { id: req.params.id },
            include: {
                patient: true,
                items: {
                    include: {
                        test: { include: { parameters: { orderBy: { sortOrder: 'asc' } } } },
                        results: true,
                    },
                },
            },
        });
        if (!order || order.clinicId !== clinicId) return res.status(404).json({ error: 'Topilmadi' });

        const sex = order.patient?.gender || null;
        const age = ageFromDob(order.patient?.dob);

        // Bir xil nomli ko'rsatkichlardan bemorga mos keladiganini tanlaymiz,
        // shunda blankada har ko'rsatkich bir marta, to'g'ri norma bilan chiqadi.
        const items = order.items.map((item: any) => {
            const byName = new Map<string, any[]>();
            for (const p of item.test.parameters) {
                if (!byName.has(p.name)) byName.set(p.name, []);
                byName.get(p.name)!.push(p);
            }
            const parameters = Array.from(byName.entries()).map(([name, variants]) => {
                const ref = pickReference(variants, sex, age) || variants[0];
                const result = item.results.find((r: any) => r.parameterId === ref.id)
                    || item.results.find((r: any) => variants.some((v: any) => v.id === r.parameterId));
                return {
                    parameterId: ref.id, name, unit: ref.unit,
                    refLow: ref.refLow, refHigh: ref.refHigh, refText: ref.refText,
                    value: result?.value ?? '', valueNum: result?.valueNum ?? null,
                    flag: result?.flag ?? null, note: result?.note ?? null,
                };
            });
            return { id: item.id, testId: item.testId, testName: item.testName, status: item.status, price: item.price, parameters };
        });

        res.json({ ...order, items, patientAge: age, patientSex: sex });
    });

    /** Natijalarni saqlash — bayroq shu yerda hisoblanadi va saqlanadi */
    route('post', '/api/lab-orders/:id/results', async (req, res, clinicId) => {
        const order = await prisma.labOrder.findUnique({
            where: { id: req.params.id },
            include: { patient: true, items: true },
        });
        if (!order || order.clinicId !== clinicId) return res.status(404).json({ error: 'Topilmadi' });

        const { results, enteredBy, force } = req.body as {
            results: { orderItemId: string; parameterId: string; value: string; note?: string }[];
            enteredBy?: string;
            force?: boolean;
        };
        if (!Array.isArray(results)) return res.status(400).json({ error: 'results massiv bo\'lishi kerak' });

        // Laboratoriya to'lovsiz natija bermaydi — bu yerda blok o'rinli
        // (shifokorda esa faqat ogohlantirish: shoshilinch holatda kutdirib bo'lmaydi).
        if (!force) {
            const unpaid = await prisma.visitCharge.findFirst({
                where: { source: 'Lab', sourceId: order.id, status: 'Unpaid' },
            });
            if (unpaid) {
                return res.status(402).json({
                    error: "Tahlil to'lanmagan. Bemorni kassaga yo'naltiring.",
                    due: unpaid.total - (unpaid.paidAmount || 0),
                    chargeId: unpaid.id,
                });
            }
        }

        const ownItems = new Set(order.items.map((i: any) => i.id));
        const sex = order.patient?.gender || null;
        const age = ageFromDob(order.patient?.dob);

        for (const r of results) {
            if (!ownItems.has(r.orderItemId)) continue;   // begona yo'llanma qatori
            const param = await prisma.labTestParameter.findUnique({ where: { id: r.parameterId } });
            if (!param) continue;

            // Normani bemorga moslab tanlaymiz (jins/yosh varianti bo'lishi mumkin)
            const siblings = await prisma.labTestParameter.findMany({ where: { testId: param.testId, name: param.name } });
            const ref = pickReference(siblings, sex, age) || param;

            const raw = String(r.value ?? '').trim();
            const num = raw === '' ? null : Number(raw.replace(',', '.'));
            const valueNum = num != null && !isNaN(num) ? num : null;

            const existing = await prisma.labResult.findFirst({
                where: { orderItemId: r.orderItemId, parameterId: r.parameterId },
            });
            const data = {
                value: raw, valueNum,
                flag: flagFor(valueNum, ref),
                note: r.note || null,
                enteredBy: enteredBy || null,
                enteredAt: new Date(),
            };
            if (existing) {
                await prisma.labResult.update({ where: { id: existing.id }, data });
            } else {
                await prisma.labResult.create({ data: { ...data, orderItemId: r.orderItemId, parameterId: r.parameterId } });
            }
        }

        // Har bir qatorda kamida bitta natija bo'lsa — bajarilgan deb belgilaymiz
        for (const item of order.items) {
            const cnt = await prisma.labResult.count({ where: { orderItemId: item.id } });
            if (cnt > 0 && item.status !== 'Completed') {
                await prisma.labOrderItem.update({ where: { id: item.id }, data: { status: 'Completed' } });
            }
        }
        const pending = await prisma.labOrderItem.count({ where: { orderId: order.id, status: { not: 'Completed' } } });
        if (pending === 0) {
            await prisma.labOrder.update({
                where: { id: order.id },
                data: { status: 'Completed', completedAt: new Date() },
            });
        }

        emitEvent(clinicId, 'lab.result', { orderId: order.id, patientId: order.patientId || null });
        res.json({ success: true });
    });

    // ═══ DIAGNOSTIKA ═════════════════════════════════════════════════════════

    route('get', '/api/studies', async (req, res, clinicId) => {
        const { patientId, status } = req.query;
        const items = await prisma.diagnosticStudy.findMany({
            where: {
                clinicId,
                ...(patientId ? { patientId: String(patientId) } : {}),
                ...(status ? { status: String(status) } : {}),
            },
            include: { files: true },
            orderBy: { orderedAt: 'desc' },
        });

        /* TO'LANDIMI — laboratoriya ro'yxatidagi bilan AYNAN bir xil
           hisob (`payStateBySource`). Diagnostikada bu yo'q edi: UZI ni
           kim to'lagan, kim to'lamagan — ekrandan bilib bo'lmasdi. */
        const pay = await payStateBySource(
            prisma, clinicId, 'Study', items.map((s: any) => s.id));

        res.json(items.map((s: any) => {
            const p = pay.get(s.id);
            // Qator umuman yo'q bo'lsa (eski yozuv) — holat noma'lum
            return { ...s, paid: p ? p.paid : null, due: p ? p.due : null };
        }));
    });

    route('post', '/api/studies', async (req, res, clinicId) => {
        const { patientId, patientName, visitId, departmentId, serviceId, modality, name, price, orderedById, orderedByName } = req.body;
        if (!patientId || !modality || !name) return res.status(400).json({ error: 'Bemor, tur va nom majburiy' });
        const study = await prisma.diagnosticStudy.create({
            data: {
                clinicId, patientId, patientName: patientName || '',
                visitId: visitId || null, departmentId: departmentId || null,
                serviceId: serviceId ? Number(serviceId) : null,
                modality, name, price: Number(price) || 0,
                orderedById: orderedById || null, orderedByName: orderedByName || null,
            },
            include: { files: true },
        });

        // Bemor tekshiruvga ketdi — qabul navbatdan chiqadi, lekin YOPILMAYDI.
        // Aks holda shifokor ro'yxati soxta band bo'lib turadi.
        if (study.visitId) {
            await prisma.visit.updateMany({
                where: { id: study.visitId, status: { in: ['Waiting', 'Called', 'In Progress'] } },
                data: { status: 'AwaitingResults', awaitingSince: new Date() },
            });
        }

        await createCharge(prisma, {
            clinicId, visitId: study.visitId, patientId: study.patientId,
            patientName: study.patientName,
            source: 'Study', sourceId: study.id,
            serviceId: study.serviceId ?? null,
            name: study.name, unitPrice: study.price,
            createdByName: study.orderedByName,
            // Tekshiruvni BAJARGAN emas, BUYURGAN shifokor: ulush buyurtmachiga
            doctorId: study.orderedById || null,
            doctorName: study.orderedByName || null,
        });

        res.json(study);
    });

    route('put', '/api/studies/:id', async (req, res, clinicId) => {
        if (!(await owns('diagnosticStudy', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { status, findings, conclusion, performedById, performedByName, price } = req.body;

        /* ─── NATIJA TO'LOVDAN KEYIN ──────────────────────────────

           Laboratoriyada bu to'siq bor edi (402), diagnostikada esa YO'Q:
           UZI xulosasini to'lovsiz yozib, chop etib berish mumkin edi va
           qator «To'lanmagan» bo'lib qolaverardi. Bemor natijani olib
           ketgach, pulni undirish deyarli imkonsiz.

           To'siq faqat NATIJAGA: holatni «Bajarilmoqda» ga o'tkazish,
           narxni tuzatish yoki bekor qilish — to'lovsiz ham mumkin. */
        const writesResult = conclusion !== undefined || findings !== undefined
            || status === 'Completed';
        if (writesResult) {
            const gate = await unpaidGate(prisma, clinicId, 'Study', req.params.id);
            if (gate) {
                return res.status(402).json({
                    error: "Tekshiruv to'lanmagan. Bemorni kassaga yo'naltiring.",
                    ...gate,
                });
            }
        }
        const study = await prisma.diagnosticStudy.update({
            where: { id: req.params.id },
            data: {
                ...(status !== undefined && { status }),
                ...(findings !== undefined && { findings }),
                ...(conclusion !== undefined && { conclusion }),
                ...(performedById !== undefined && { performedById }),
                ...(performedByName !== undefined && { performedByName }),
                ...(price !== undefined && { price: Number(price) }),
                ...(status === 'Completed' && { performedAt: new Date() }),
            },
            include: { files: true },
        });
        emitEvent(clinicId, 'study.result', { studyId: study.id, patientId: study.patientId || null });
        res.json(study);
    });

    route('delete', '/api/studies/:id', async (req, res, clinicId) => {
        if (!(await owns('diagnosticStudy', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        // Fayllar diskda ham qolib ketmasin
        const files = await prisma.diagnosticFile.findMany({ where: { studyId: req.params.id } });
        for (const f of files) removeUploadedFile(f.url, uploadsDir);
        await cancelChargesBySource(prisma, 'Study', req.params.id);
        await prisma.diagnosticStudy.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    });

    /** Tekshiruv rasmi (UZI surati, EKG lentasi va h.k.) */
    app.post('/api/studies/:id/files', auth, upload.single('photo'), async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });
            if (!req.file) return res.status(400).json({ error: 'Fayl yuborilmadi' });

            const study = await prisma.diagnosticStudy.findUnique({ where: { id: req.params.id } });
            if (!study || study.clinicId !== clinicId) {
                removeUploadedFile(`/uploads/${req.file.filename}`, uploadsDir);
                return res.status(403).json({ error: "Ruxsat yo'q" });
            }

            const file = await prisma.diagnosticFile.create({
                data: {
                    studyId: req.params.id,
                    url: `/uploads/${req.file.filename}`,
                    kind: (req.file.mimetype || '').startsWith('image/') ? 'image' : 'file',
                    caption: req.body?.caption || null,
                },
            });
            res.json(file);
        } catch (e: any) {
            console.error('[POST /api/studies/:id/files]', e.message);
            res.status(500).json({ error: e.message || 'Fayl yuklanmadi' });
        }
    });

    route('delete', '/api/study-files/:id', async (req, res, clinicId) => {
        const file = await prisma.diagnosticFile.findUnique({
            where: { id: req.params.id }, include: { study: true },
        });
        if (!file || file.study.clinicId !== clinicId) return res.status(403).json({ error: "Ruxsat yo'q" });
        removeUploadedFile(file.url, uploadsDir);
        await prisma.diagnosticFile.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    });

    // ═══ STATSIONAR ══════════════════════════════════════════════════════════

    route('get', '/api/wards', async (req, res, clinicId) => {
        const items = await prisma.ward.findMany({
            where: { clinicId },
            include: {
                beds: {
                    orderBy: { label: 'asc' },
                    include: {
                        admissions: {
                            where: { status: 'Active' },
                            select: { id: true, patientId: true, patientName: true, admittedAt: true },
                        },
                    },
                },
            },
            orderBy: { name: 'asc' },
        });
        res.json(items);
    });

    route('post', '/api/wards', async (req, res, clinicId) => {
        if (nurseDenied(req, res)) return;
        const { name, floor, kind, dailyRate, departmentId, bedCount } = req.body;
        if (!name) return res.status(400).json({ error: 'Nom majburiy' });
        const ward = await prisma.ward.create({
            data: {
                clinicId, name, floor: floor || null, kind: kind || 'Umumiy',
                dailyRate: Number(dailyRate) || 0, departmentId: departmentId || null,
                beds: { create: Array.from({ length: Number(bedCount) || 0 }, (_, i) => ({ label: `${i + 1}-koyka` })) },
            },
            include: { beds: true },
        });
        res.json(ward);
    });

    route('put', '/api/wards/:id', async (req, res, clinicId) => {
        if (!(await owns('ward', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { name, floor, kind, dailyRate, isActive, departmentId } = req.body;
        const ward = await prisma.ward.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(floor !== undefined && { floor }),
                ...(kind !== undefined && { kind }),
                ...(dailyRate !== undefined && { dailyRate: Number(dailyRate) }),
                ...(isActive !== undefined && { isActive }),
                ...(departmentId !== undefined && { departmentId }),
            },
            include: { beds: true },
        });
        res.json(ward);
    });

    route('get', '/api/admissions', async (req, res, clinicId) => {
        const { status, patientId } = req.query;
        const items = await prisma.admission.findMany({
            where: {
                clinicId,
                ...(status ? { status: String(status) } : {}),
                ...(patientId ? { patientId: String(patientId) } : {}),
            },
            include: {
                bed: { include: { ward: true } },
                rounds: { orderBy: { date: 'desc' } },
                medicationOrders: true,
            },
            orderBy: { admittedAt: 'desc' },
        });
        res.json(items);
    });

    route('post', '/api/admissions', async (req, res, clinicId) => {
        if (nurseDenied(req, res)) return;
        const { patientId, patientName, departmentId, doctorId, doctorName, bedId, reason, diagnosis, dailyRate } = req.body;
        if (!patientId) return res.status(400).json({ error: 'Bemor majburiy' });

        // Koyka band bo'lmasligi kerak — aks holda ikki bemor bir koykada qoladi
        if (bedId) {
            const bed = await prisma.bed.findUnique({ where: { id: bedId }, include: { ward: true } });
            if (!bed || bed.ward.clinicId !== clinicId) return res.status(400).json({ error: 'Koyka topilmadi' });
            if (bed.status === 'Occupied') return res.status(409).json({ error: 'Koyka band' });
        }

        const admission = await prisma.admission.create({
            data: {
                clinicId, patientId, patientName: patientName || '',
                departmentId: departmentId || null,
                doctorId: doctorId || null, doctorName: doctorName || null,
                bedId: bedId || null, reason: reason || null, diagnosis: diagnosis || null,
                dailyRate: Number(dailyRate) || 0,
                lastChargedDate: nowDate(),
            },
            include: { bed: { include: { ward: true } } },
        });
        if (bedId) await prisma.bed.update({ where: { id: bedId }, data: { status: 'Occupied' } });
        res.json(admission);
    });

    route('put', '/api/admissions/:id', async (req, res, clinicId) => {
        const existing = await owns('admission', req.params.id, clinicId);
        if (!existing) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { diagnosis, doctorId, doctorName, dailyRate, bedId } = req.body;

        if (bedId !== undefined && bedId !== existing.bedId) {
            if (bedId) {
                const bed = await prisma.bed.findUnique({ where: { id: bedId }, include: { ward: true } });
                if (!bed || bed.ward.clinicId !== clinicId) return res.status(400).json({ error: 'Koyka topilmadi' });
                if (bed.status === 'Occupied') return res.status(409).json({ error: 'Koyka band' });
                await prisma.bed.update({ where: { id: bedId }, data: { status: 'Occupied' } });
            }
            if (existing.bedId) await prisma.bed.update({ where: { id: existing.bedId }, data: { status: 'Free' } });
        }

        const admission = await prisma.admission.update({
            where: { id: req.params.id },
            data: {
                ...(diagnosis !== undefined && { diagnosis }),
                ...(doctorId !== undefined && { doctorId }),
                ...(doctorName !== undefined && { doctorName }),
                ...(dailyRate !== undefined && { dailyRate: Number(dailyRate) }),
                ...(bedId !== undefined && { bedId: bedId || null }),
            },
            include: { bed: { include: { ward: true } } },
        });
        res.json(admission);
    });

    /** Chiqarish — koyka bo'shaydi */
    route('post', '/api/admissions/:id/discharge', async (req, res, clinicId) => {
        if (nurseDenied(req, res)) return;
        const existing = await owns('admission', req.params.id, clinicId);
        if (!existing) return res.status(403).json({ error: "Ruxsat yo'q" });
        if (existing.status === 'Discharged') return res.status(400).json({ error: 'Allaqachon chiqarilgan' });

        /* QARZ BILAN CHIQARISH.
           Taqiqlamaymiz: bemorni pul uchun ushlab turish — tibbiy ham,
           huquqiy ham to'g'ri emas. Lekin JIMGINA ham o'tkazmaymiz: qarz
           bo'lsa chiqarish `confirmDebt: true` ni talab qiladi, ya'ni
           odam ataylab tasdiqlaydi va bu qaror uning qo'lida bo'ladi
           (GAP-ANALYSIS, 3-sahna, 10-band). */
        if (!req.body?.confirmDebt) {
            const open = await prisma.visitCharge.findMany({
                where: { clinicId, admissionId: existing.id, status: 'Unpaid' },
                select: { total: true, paidAmount: true },
            });
            const due = Math.round(open.reduce((s: number, c: any) => s + (c.total - (c.paidAmount || 0)), 0));
            if (due > 0) {
                return res.status(409).json({
                    error: `Yotish bo'yicha to'lanmagan qarz: ${due}`,
                    due,
                    count: open.length,
                    needsConfirm: true,
                });
            }
        }

        /* Epikrizning to'rt qismi (migratsiya 0019). `dischargeSummary`
           hamon qabul qilinadi — eski mijoz buzilmaydi va eski yotishlarning
           matni joyida qoladi. */
        const b = req.body || {};
        const admission = await prisma.admission.update({
            where: { id: req.params.id },
            data: {
                status: 'Discharged',
                dischargedAt: new Date(),
                dischargeSummary: b.dischargeSummary || null,
                admissionDiagnosis: b.admissionDiagnosis || existing.admissionDiagnosis || null,
                finalDiagnosis: b.finalDiagnosis || null,
                treatmentGiven: b.treatmentGiven || null,
                recommendations: b.recommendations || null,
            },
        });
        if (existing.bedId) await prisma.bed.update({ where: { id: existing.bedId }, data: { status: 'Cleaning' } });
        res.json(admission);
    });

    route('post', '/api/admissions/:id/rounds', async (req, res, clinicId) => {
        const adm = await owns('admission', req.params.id, clinicId);
        if (!adm) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { date, doctorId, doctorName, vitalSigns, notes, plan } = req.body;
        const round = await prisma.inpatientRound.create({
            data: {
                admissionId: req.params.id, date: date || nowDate(),
                doctorId: doctorId || null, doctorName: doctorName || null,
                vitalSigns: vitalSigns ? JSON.stringify(vitalSigns) : null,
                notes: notes || null, plan: plan || null,
            },
        });

        /* Ko'rsatkichlar QO'SHIMCHA ravishda `VitalSign` ga yoziladi
           (migratsiya 0017). JSON maydon joyida qoladi: eski ekranlar
           ilgarigidek o'qiydi, harorat grafigi esa yangi jadvaldan quriladi.
           Xato bo'lsa obhod yozuvi baribir saqlanib qoladi. */
        try {
            const map: Record<string, string> = {
                temp: 'Temp', temperature: 'Temp',
                bpSys: 'BpSys', systolic: 'BpSys',
                bpDia: 'BpDia', diastolic: 'BpDia',
                pulse: 'Pulse', heartRate: 'Pulse',
                weight: 'Weight', height: 'Height',
                spo2: 'SpO2', oxygen: 'SpO2',
            };
            const units: Record<string, string> = {
                Temp: '°C', BpSys: 'mmHg', BpDia: 'mmHg', Pulse: 'urish/min',
                Weight: 'kg', Height: 'sm', SpO2: '%',
            };
            for (const [key, raw] of Object.entries(vitalSigns || {})) {
                const kind = map[key];
                const value = Number(raw);
                if (!kind || !isFinite(value)) continue;
                await prisma.vitalSign.create({
                    data: {
                        clinicId, patientId: adm.patientId,
                        admissionId: adm.id,
                        kind, value, unit: units[kind] || null,
                        measuredByName: doctorName || (req as any).user?.name || null,
                    },
                });
            }
        } catch (e: any) {
            console.error("Obhod ko'rsatkichlarini yozib bo'lmadi:", e?.message || e);
        }

        res.json(round);
    });

    route('post', '/api/admissions/:id/medications', async (req, res, clinicId) => {
        if (!(await owns('admission', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { medicationId, name, dosage, route: adminRoute, frequency, startDate, endDate } = req.body;
        if (!name) return res.status(400).json({ error: 'Dori nomi majburiy' });
        const order = await prisma.medicationOrder.create({
            data: {
                admissionId: req.params.id, medicationId: medicationId || null, name,
                dosage: dosage || null, route: adminRoute || null, frequency: frequency || null,
                startDate: startDate || nowDate(), endDate: endDate || null,
            },
        });
        res.json(order);
    });

    // ═══ RETSEPT ═════════════════════════════════════════════════════════════

    route('get', '/api/prescriptions', async (req, res, clinicId) => {
        const { patientId } = req.query;
        const items = await prisma.prescription.findMany({
            where: { clinicId, ...(patientId ? { patientId: String(patientId) } : {}) },
            include: { items: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json(items);
    });

    route('post', '/api/prescriptions', async (req, res, clinicId) => {
        const { patientId, patientName, visitId, doctorId, doctorName, date, notes, items } = req.body;
        if (!patientId) return res.status(400).json({ error: 'Bemor majburiy' });
        const rx = await prisma.prescription.create({
            data: {
                clinicId, patientId, patientName: patientName || '',
                visitId: visitId || null, doctorId: doctorId || null, doctorName: doctorName || null,
                date: date || nowDate(), notes: notes || null,
                items: {
                    create: (items || []).map((i: any) => ({
                        medicationId: i.medicationId || null, name: i.name,
                        dosage: i.dosage || null, frequency: i.frequency || null,
                        durationDays: i.durationDays ? Number(i.durationDays) : null,
                        instructions: i.instructions || null,
                    })),
                },
            },
            include: { items: true },
        });
        res.json(rx);
    });

    route('delete', '/api/prescriptions/:id', async (req, res, clinicId) => {
        if (!(await owns('prescription', req.params.id, clinicId))) return res.status(403).json({ error: "Ruxsat yo'q" });
        await prisma.prescription.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    });

    // ═══ OMBOR: PARTIYA VA MUDDAT ════════════════════════════════════════════

    route('get', '/api/inventory/:id/batches', async (req, res, clinicId) => {
        const item = await owns('inventoryItem', req.params.id, clinicId);
        if (!item) return res.status(403).json({ error: "Ruxsat yo'q" });
        const batches = await prisma.inventoryBatch.findMany({
            where: { itemId: req.params.id },
            orderBy: { expiryDate: 'asc' },
        });
        res.json(batches);
    });

    route('post', '/api/inventory/:id/batches', async (req, res, clinicId) => {
        const item = await owns('inventoryItem', req.params.id, clinicId);
        if (!item) return res.status(403).json({ error: "Ruxsat yo'q" });
        const { batchNumber, expiryDate, quantity, cost } = req.body;
        const qty = Number(quantity) || 0;

        /* YAGONA JURNAL INVARIANTI (migratsiya 0028).

           Bu yerda ilgari ikkita amal bor edi: partiya yaratilardi va
           `item.quantity` oshirilardi — lekin `StockMovement` YOZILMASDI.
           0028 dan keyin qoldiq harakatlar yig'indisiga teng bo'lishi
           shart, ya'ni har partiya kirimi jimgina invariantni buzardi.
           Yaxlitlik tekshiruvi buni «item invarianti» xatosi deb
           ko'rsatadi.

           Ikkinchi kamchiligi: uchta amal alohida edi — o'rtada uzilsa
           partiya yaratilib, qoldiq oshmay qolardi. Endi tranzaksiyada,
           `/stock-movements/in` bilan bir xil tartibda. */
        const batch = await prisma.$transaction(async (tx: any) => {
            const created = await tx.inventoryBatch.create({
                data: {
                    itemId: req.params.id, batchNumber: batchNumber || null,
                    expiryDate: expiryDate || null, quantity: qty, cost: Number(cost) || 0,
                },
            });
            if (qty > 0) {
                await tx.stockMovement.create({
                    data: {
                        clinicId, itemId: req.params.id, batchId: created.id,
                        type: 'In', quantity: qty, reason: 'Purchase',
                        note: batchNumber ? `Partiya ${batchNumber}` : null,
                        userName: req.user?.name || null,
                    },
                });
                await tx.inventoryItem.update({
                    where: { id: req.params.id },
                    data: { quantity: { increment: qty } },
                });
            }
            return created;
        }, { timeout: 15000, maxWait: 10000 });

        res.json(batch);
    });

    /** Muddati o'tgan yoki yaqinlashgan partiyalar — Ombor sahifasidagi ogohlantirish */
    route('get', '/api/inventory-expiring', async (req, res, clinicId) => {
        const days = Number(req.query.days) || 60;
        // Chegara ham Toshkent kuni bo'yicha: expiryDate matn sifatida saqlanadi
        const limit = tashkentDateStr(days);
        const batches = await prisma.inventoryBatch.findMany({
            where: {
                quantity: { gt: 0 },
                expiryDate: { not: null, lte: limit },
                item: { clinicId },
            },
            include: { item: true },
            orderBy: { expiryDate: 'asc' },
        });
        const today = nowDate();
        res.json(batches.map((b: any) => ({
            ...b,
            expired: !!b.expiryDate && b.expiryDate < today,
        })));
    });

    console.log("✅ Ko'p profil endpointlari ulandi");
}

/* ─── Shablon chegaralari (migratsiya 0031) ──────────────────────────────── */

/* `ageFromDob` shu faylning yuqorisida allaqachon bor (tahlil normasi
   uchun yozilgan) — shablon chegarasi ham o'shani ishlatadi. */

/** Faqat 'Male' yoki 'Female'; qolgani `null` — «hammaga mos». */
function normalizeGender(v: any): string | null {
    const s = String(v ?? '').trim();
    return s === 'Male' || s === 'Female' ? s : null;
}

/** Yosh chegarasi: 0–130 oralig'idagi butun son yoki `null`. */
function normalizeAge(v: any): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const i = Math.trunc(n);
    return i >= 0 && i <= 130 ? i : null;
}

function safeParse<T>(raw: string | null, fallback: T): T {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
