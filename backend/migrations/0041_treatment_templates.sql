-- Davolash to'plami va dori ovqat vaqti (2026-11-26).
--
-- MUAMMO.
--   * Shifokor har O'RVI bemoriga bir xil 3 dori, ko'rik va qon tahlilini
--     qaytadan yozardi. «Oxirgi yozilgan dorilar» faqat shu kompyuterda
--     eslab qolinardi va xizmat, tahlilni olib kelmasdi.
--   * Dorida «ovqatdan keyin» yoziladigan joy yo'q edi — bemor so'rardi.
--
-- YECHIM — yangi jadval va bitta NULL ustun, mavjud yozuvlarga tegilmaydi:
--   TreatmentTemplate        — shifokorning (doctorId) yoki klinikaning
--                              (doctorId NULL) to'plami; tarkibi JSON
--                              (`EncounterTemplate.fields` kabi): dorilar,
--                              xizmatlar, tahlillar. Qo'llanganda oddiy
--                              retsept / xizmat / tahlil yozuviga aylanadi.
--   PrescriptionItem.mealTiming — 'before' | 'with' | 'after' | NULL.
CREATE TABLE "TreatmentTemplate" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id"),
    "doctorId" TEXT,
    "name" TEXT NOT NULL,
    "icdCodes" TEXT,
    "items" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TreatmentTemplate_clinicId_doctorId_idx" ON "TreatmentTemplate"("clinicId", "doctorId");
ALTER TABLE "PrescriptionItem" ADD COLUMN "mealTiming" TEXT;
