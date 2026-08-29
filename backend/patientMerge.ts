/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — takror bemorlarni topish va birlashtirish.

   MUAMMO. Bemor yaratishda takror tekshiruvi yo'q edi, ya'ni bazada bir odam
   bir necha karta bilan yotadi va tarixi bo'linib ketadi. Bu noqulaylik emas,
   TIBBIY XAVF: allergiya bitta kartada, retsept boshqasida.

   IKKI QARORNI ALOHIDA AYTIB O'TISH KERAK.

   1. BIRLASHTIRISH QAYTARIB BO'LMAYDI. Shuning uchun sukut bo'yicha QURUQ
      YURITISH: nima ko'chishi ro'yxat bo'lib qaytadi, haqiqiy ko'chirish esa
      `confirm: true` bilan. Xuddi balanslarni qayta hisoblashdagi kabi.

   2. `CashMovement` QO'LDA SANALGAN. Prisma sxemasida `Patient` ning 18 ta
      relationi bor, lekin `patientId` maydoni 19 ta modelda uchraydi:
      `CashMovement` da relation E'LON QILINMAGAN. Ya'ni relationlar bo'yicha
      avtomatik yurgan birlashtirish PUL HARAKATLARINI o'tkazib yuborardi.
      Ro'yxat shuning uchun qo'lda yozilgan va sxema o'zgarsa yangilanishi kerak.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';

type Deps = {
    prisma: any;
    authenticateToken: any;
    requireRole: (...roles: string[]) => any;
    getScopedClinicId: (req: any) => string | null;
    normalizeUzPhone: (p?: string | null) => string | null;
};

/** `patientId` ustuni bor HAMMA jadval. Sxema o'zgarsa shu ro'yxat yangilanadi. */
const PATIENT_TABLES = [
    'patientPhoto', 'appointment', 'visit', 'transaction',
    'cashMovement',            // ← Patient relationida yo'q, qo'lda qo'shilgan
    'patientDiagnosis', 'inventoryLog', 'telegramLog', 'installmentPlan',
    'labOrder', 'diagnosticStudy', 'admission', 'prescription', 'visitCharge',
    'patientAllergy', 'referral', 'vitalSign', 'patientDocument', 'accessLog',
] as const;

/* Bemorning ismi NUSXA qilib saqlanadigan jadvallar — birlashtirishdan keyin
   ular ham yangilanadi, aks holda cheklarda eski ism qolib ketadi.

   Ro'yxat sxemadan TEKSHIRIB olingan, taxmin qilinmagan: `Visit` va
   `Referral` da `patientName` maydoni YO'Q va ularni ro'yxatga qo'shish
   "Unknown argument `patientName`" bilan butun birlashtirishni yiqitadi —
   sinovda aynan shunday bo'ldi. */
const NAME_TABLES: { table: string; field: string }[] = [
    { table: 'appointment', field: 'patientName' },
    { table: 'transaction', field: 'patientName' },
    { table: 'visitCharge', field: 'patientName' },
    { table: 'labOrder', field: 'patientName' },
    { table: 'diagnosticStudy', field: 'patientName' },
    { table: 'admission', field: 'patientName' },
    { table: 'prescription', field: 'patientName' },
];

export function registerPatientMergeRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, requireRole, getScopedClinicId, normalizeUzPhone } = deps;

    /* YO'L NOMI ATAYLAB `/api/patients/...` EMAS.

       `app.get('/api/patients/:id')` server.ts da ANCHA OLDIN ro'yxatdan
       o'tgan, Express esa marshrutlarni ro'yxatga olish tartibida solishtiradi.
       Ya'ni `/api/patients/duplicates` o'sha marshrutga `id = "duplicates"`
       bo'lib tushardi va 404 qaytardi — sinovda aynan shunday bo'ldi.

       Ro'yxatga olish joyini ko'chirish bilan ham tuzatsa bo'lardi, lekin u
       mo'rt: kelajakda kimdir tartibni o'zgartirsa xato jimgina qaytadi.
       Alohida nom bu bog'liqlikni umuman yo'q qiladi. */

    /**
     * GET /api/patient-duplicates — shubhali juftliklar.
     *
     * Ikki belgi bo'yicha: bir xil telefon (normallashtirilgan) yoki bir xil
     * ism + familiya + tug'ilgan sana. Ikkalasi ham "shubha", "hukm" emas —
     * qarorni odam qabul qiladi.
     */
    app.get('/api/patient-duplicates', auth, requireRole('CLINIC_ADMIN'), async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });

            const patients = await prisma.patient.findMany({
                where: { clinicId, status: { not: 'Archived' } },
                select: {
                    id: true, firstName: true, lastName: true, phone: true,
                    dob: true, cardNumber: true, lastVisit: true, createdAt: true,
                },
                orderBy: { createdAt: 'asc' },
            });

            const byPhone = new Map<string, any[]>();
            const byName = new Map<string, any[]>();
            for (const p of patients) {
                const d = normalizeUzPhone(p.phone);
                if (d) {
                    const k = d.slice(-9);
                    if (!byPhone.has(k)) byPhone.set(k, []);
                    byPhone.get(k)!.push(p);
                }
                if (p.dob) {
                    const k = `${(p.firstName || '').trim().toLowerCase()}|${(p.lastName || '').trim().toLowerCase()}|${p.dob}`;
                    if (!byName.has(k)) byName.set(k, []);
                    byName.get(k)!.push(p);
                }
            }

            /* Bitta guruh ikki belgi bo'yicha ham chiqishi mumkin — id lar
               to'plami bo'yicha takrorlanmasligini ta'minlaymiz. */
            const seen = new Set<string>();
            const groups: any[] = [];
            const collect = (map: Map<string, any[]>, reason: string) => {
                for (const [, list] of map) {
                    if (list.length < 2) continue;
                    const key = list.map((p) => p.id).sort().join(',');
                    if (seen.has(key)) continue;
                    seen.add(key);
                    groups.push({ reason, count: list.length, patients: list });
                }
            };
            collect(byPhone, 'phone');
            collect(byName, 'name_dob');

            res.json({ scanned: patients.length, groups: groups.slice(0, 200), total: groups.length });
        } catch (e: any) {
            console.error('[GET /api/patients/duplicates]', e?.message || e);
            res.status(500).json({ error: "Takrorlarni topib bo'lmadi" });
        }
    });

    /**
     * POST /api/patient-merge — `sourceId` ni `targetId` (asosiy karta) ga qo'shadi.
     *
     * Sukut bo'yicha QURUQ YURITADI: nima ko'chishi sanaladi, hech narsa
     * o'zgarmaydi. Haqiqiy birlashtirish `confirm: true` bilan.
     */
    app.post('/api/patient-merge', auth, requireRole('CLINIC_ADMIN'), async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });

            const targetId = String(req.body?.targetId || '');
            const sourceId = String(req.body?.sourceId || '');
            const confirm = req.body?.confirm === true;

            if (!targetId) return res.status(400).json({ error: "Asosiy bemor ko'rsatilmagan" });
            if (!sourceId) return res.status(400).json({ error: "Qo'shiladigan bemor ko'rsatilmagan" });
            if (sourceId === targetId) return res.status(400).json({ error: "Bemorni o'ziga qo'shib bo'lmaydi" });

            const [target, source] = await Promise.all([
                prisma.patient.findUnique({ where: { id: targetId } }),
                prisma.patient.findUnique({ where: { id: sourceId } }),
            ]);
            if (!target || target.clinicId !== clinicId) return res.status(404).json({ error: 'Asosiy bemor topilmadi' });
            if (!source || source.clinicId !== clinicId) return res.status(404).json({ error: "Qo'shiladigan bemor topilmadi" });

            // Nima ko'chishini sanaymiz
            const counts: Record<string, number> = {};
            let totalRows = 0;
            for (const t of PATIENT_TABLES) {
                const n = await (prisma as any)[t].count({ where: { patientId: sourceId } });
                if (n > 0) { counts[t] = n; totalRows += n; }
            }

            const targetName = `${target.lastName} ${target.firstName}`;
            const plan = {
                target: { id: target.id, name: targetName, phone: target.phone, cardNumber: target.cardNumber },
                source: { id: source.id, name: `${source.lastName} ${source.firstName}`, phone: source.phone, cardNumber: source.cardNumber },
                rows: counts,
                totalRows,
                balanceMoved: Math.round(source.balance || 0),
            };

            if (!confirm) {
                return res.json({
                    dryRun: true, ...plan,
                    message: `${totalRows} ta yozuv "${targetName}" kartasiga ko'chadi. `
                        + `Bajarish uchun confirm: true yuboring.`,
                });
            }

            /* HAMMASI BITTA TRANZAKSIYADA. Yarim ko'chgan bemor — ikkita
               buzuq karta degani, ya'ni boshlang'ich holatdan battar. */
            await prisma.$transaction(async (tx: any) => {
                for (const t of PATIENT_TABLES) {
                    if (!counts[t]) continue;
                    await (tx as any)[t].updateMany({
                        where: { patientId: sourceId },
                        data: { patientId: targetId },
                    });
                }

                // Saqlangan ism ham yangilanadi — aks holda cheklarda eski ism qoladi
                for (const { table, field } of NAME_TABLES) {
                    await (tx as any)[table].updateMany({
                        where: { patientId: targetId, [field]: `${source.lastName} ${source.firstName}` },
                        data: { [field]: targetName },
                    });
                }

                // Avans balansi qo'shiladi
                if (source.balance) {
                    await tx.patient.update({
                        where: { id: targetId },
                        data: { balance: { increment: source.balance } },
                    });
                }

                /* Manba kartasi O'CHIRILMAYDI, arxivga o'tadi. Sabab: uning id
                   si tashqarida (chek raqami, qog'oz karta) ishlatilgan
                   bo'lishi mumkin va uni yo'q qilish izni uzadi. */
                await tx.patient.update({
                    where: { id: sourceId },
                    data: {
                        status: 'Archived',
                        balance: 0,
                        medicalHistory: [source.medicalHistory, `[Birlashtirildi: ${targetId}]`]
                            .filter(Boolean).join('\n'),
                    },
                });
            }, { timeout: 30000, maxWait: 10000 });

            console.log(`👥 Bemorlar birlashtirildi: ${plan.source.name} → ${targetName} (${totalRows} yozuv)`);
            res.json({ dryRun: false, ...plan, success: true });
        } catch (e: any) {
            console.error('[POST /api/patients/:id/merge]', e?.message || e);
            res.status(500).json({ error: `Birlashtirib bo'lmadi: ${e?.message || e}` });
        }
    });

    console.log('✅ Takror bemor endpointlari ulandi');
}
