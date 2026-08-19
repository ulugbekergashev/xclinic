-- Hisob qatori va to'lov o'rtasidagi bog'lanish: KO'PDAN-KO'PGA.
--
-- Nima uchun. Hozir bog'lanish bitta: `VisitCharge.transactionId`. Bu to'rt
-- narsani imkonsiz qiladi:
--   1. bir chek bilan bir necha qatorni to'lash (qaysi qatorga qancha ketgani
--      saqlanmaydi);
--   2. qisman to'lovda AYNAN qaysi qatorni to'lashni tanlash;
--   3. bir chekni naqd + karta deb bo'lish;
--   4. bitta qator bo'yicha qaytarish.
--
-- Mavjud ustunlar OLIB TASHLANMAYDI: `paidAmount` yig'indi keshi bo'lib qoladi,
-- `transactionId` — oxirgi chekka havola. Bu ataylab ortiqchalik: ishlayotgan
-- kod buzilmasligi kerak.
--
-- `kind` = 'Payment' yoki 'Refund'. Qaytarish manfiy summa bilan yoziladi,
-- shuning uchun qator bo'yicha yig'indi har doim "haqiqatda qancha to'langan".

CREATE TABLE "ChargePayment" (
    "id"            TEXT PRIMARY KEY NOT NULL,
    "clinicId"      TEXT NOT NULL REFERENCES "Clinic"("id"),
    "chargeId"      TEXT NOT NULL REFERENCES "VisitCharge"("id"),
    "transactionId" TEXT NOT NULL REFERENCES "Transaction"("id"),
    "amount"        REAL NOT NULL,
    "kind"          TEXT NOT NULL DEFAULT 'Payment',
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT
);

CREATE INDEX "ChargePayment_chargeId_idx"      ON "ChargePayment"("chargeId");
CREATE INDEX "ChargePayment_transactionId_idx" ON "ChargePayment"("transactionId");
CREATE INDEX "ChargePayment_clinicId_createdAt_idx" ON "ChargePayment"("clinicId", "createdAt");

-- Mavjud to'langan qatorlar uchun bittalab yozuv yasaymiz (В16 qarori:
-- ko'chiramiz). Shart: to'lov summasi bor VA chek havolasi bor. Amal
-- idempotent: qayta ishga tushsa dublikat yaratmaydi.
INSERT INTO "ChargePayment" ("id", "clinicId", "chargeId", "transactionId", "amount", "kind", "createdAt", "createdByName")
SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-a' ||
    substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    c."clinicId", c."id", c."transactionId", c."paidAmount", 'Payment',
    COALESCE(c."paidAt", c."createdAt"), c."createdByName"
FROM "VisitCharge" c
WHERE c."transactionId" IS NOT NULL
  AND c."paidAmount" > 0
  AND NOT EXISTS (SELECT 1 FROM "ChargePayment" p WHERE p."chargeId" = c."id");
