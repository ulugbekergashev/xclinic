-- Bo'lib to'lash rejasi hisob qatorlariga bog'lanadi.
--
-- MUAMMO. Reja butunlay ALOHIDA pul modeli edi: `InstallmentPlan` +
-- `InstallmentItem`, xizmat nomi ERKIN MATN, summa esa qo'lda kiritilardi.
-- Hech qanday `VisitCharge` bilan aloqasi yo'q edi. Natijada:
--
--   * bemorda bir vaqtning o'zida TO'LANMAGAN qator ham, o'sha xizmat uchun
--     reja ham turardi — qarz ikki marta hisoblanardi yoki qator abadiy
--     to'lanmagan bo'lib qolardi;
--   * har bo'lib to'lash to'lovi `Transaction` yozardi, `ChargePayment` esa
--     yozmasdi — ya'ni SHIFOKOR ULUSHI bu puldan hisoblanmasdi. Vedomost va
--     shifokorlar hisoboti faqat `ChargePayment` ni o'qiydi;
--   * reja o'chirilganda to'langan qatorlar ham izsiz ketardi.
--
-- YECHIM. Reja endi mavjud to'lanmagan QATORLAR ustiga quriladi va to'lov
-- `POST /api/payments` ning aynan o'sha yo'lidan o'tadi. Reja pulni
-- yozmaydi — u faqat JADVAL: qachon qancha kutilyapti.

ALTER TABLE "VisitCharge" ADD COLUMN "installmentPlanId" TEXT REFERENCES "InstallmentPlan"("id");
CREATE INDEX "VisitCharge_installmentPlanId_idx" ON "VisitCharge"("installmentPlanId");

-- ── Eski rejalar uchun qator yaratamiz ────────────────────────────────────
--
-- Tugallanmagan rejaning qolgan summasi ("totalAmount" - "totalPaid") uchun
-- bitta qator ochiladi va rejaga bog'lanadi. Shundan keyin eski reja ham
-- yangi yo'ldan to'lanadi va shifokor ulushi to'g'ri hisoblanadi.
--
-- Tugallangan rejalarga tegilmaydi: ular tarix, ularning puli allaqachon
-- `Transaction` da yozilgan. Uni endi qatorga ko'chirish daromadni ikki
-- marta ko'rsatgan bo'lardi.
--
-- `uuid` SQLite da yo'q — RFC 4122 shaklidagi satrni randomblob dan yig'amiz.
INSERT INTO "VisitCharge" (
    "id", "clinicId", "visitId", "patientId", "patientName",
    "source", "sourceId", "name", "quantity", "unitPrice", "discount", "total",
    "status", "paidAmount", "createdAt", "createdByName",
    "doctorId", "doctorName", "installmentPlanId"
)
SELECT
    lower(
        hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4'
        || substr(hex(randomblob(2)), 2) || '-'
        || substr('89ab', abs(random()) % 4 + 1, 1)
        || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))
    ),
    p."clinicId", NULL, p."patientId",
    COALESCE(pt."lastName" || ' ' || pt."firstName", ''),
    'Other', p."id",
    'Bo''lib to''lash: ' || p."service",
    1,
    ROUND(p."totalAmount" - p."totalPaid"),
    0,
    ROUND(p."totalAmount" - p."totalPaid"),
    'Unpaid', 0, CURRENT_TIMESTAMP, 'migratsiya 0033',
    p."doctorId",
    (SELECT d."lastName" || ' ' || d."firstName" FROM "Doctor" d WHERE d."id" = p."doctorId"),
    p."id"
FROM "InstallmentPlan" p
LEFT JOIN "Patient" pt ON pt."id" = p."patientId"
WHERE p."status" <> 'Completed'
  AND (p."totalAmount" - p."totalPaid") > 0;
