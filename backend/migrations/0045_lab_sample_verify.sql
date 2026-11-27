-- Probirka yorlig'i va natijani tasdiqlash (2026-11-26).
--
-- 1) `sampleCode` — probirka kodi: faqat raqam, YYMMDD + kunlik tartib
--    (masalan 2611260014). Faqat raqam ATAYLAB: shtrix-kod skaneri klaviatura
--    bo'lib yozadi va kirill/o'zbek tartibida harflarni buzadi. Kod probani
--    olganda yoki birinchi yorliq bosilganda beriladi, keyin o'zgarmaydi.
--    Bir klinikada takrorlanmaydi (UNIQUE; NULL lar cheklanmaydi).
--
-- 2) Tasdiqlash — klinika sozlamasi, dastlab O'CHIQ. Yoqilganda natija
--    Telegramga faqat ikkinchi xodim (yoki ega) tasdiqlagach ketadi.
--    O'chiq bo'lsa hech narsa o'zgarmaydi.
--
-- 3) Yorliq o'lchami va «Olindi bosilganda yorliq o'zi chiqsin» — klinika
--    sozlamasi; NULL — 40×30 mm, o'zi chiqmaydi.
ALTER TABLE "LabOrder" ADD COLUMN "sampleCode" TEXT;
ALTER TABLE "LabOrder" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "LabOrder" ADD COLUMN "verifiedByName" TEXT;
-- Kim kiritgani va kim tasdiqlagani — xodim KALITI («ROL:id»), ism emas:
-- bir xil ismli ikki xodim bir-birini to'smasin, ismsiz xodim aylanib o'tmasin.
ALTER TABLE "LabOrder" ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "LabResult" ADD COLUMN "enteredById" TEXT;
CREATE UNIQUE INDEX "LabOrder_clinicId_sampleCode_key" ON "LabOrder"("clinicId", "sampleCode");
ALTER TABLE "Clinic" ADD COLUMN "labVerifyRequired" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Clinic" ADD COLUMN "labLabelSize" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "labLabelAuto" BOOLEAN NOT NULL DEFAULT 0;
