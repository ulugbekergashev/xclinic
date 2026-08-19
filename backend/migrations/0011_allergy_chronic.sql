-- Allergiya va surunkali kasalliklar — MAYDON sifatida, JSON ichida emas.
--
-- Nima uchun. Hozir allergiya qabul bayonining JSON matnida yotadi
-- (`Visit.examData`, seed.ts dagi `allergies` kaliti). Natijada:
--   - allergiyani QIDIRIB bo'lmaydi;
--   - shifokor ekranida ko'rsatib bo'lmaydi;
--   - dori tayinlaganda solishtirib bo'lmaydi.
-- Bu GAP-ANALYSIS dagi C12 xatosining eng qimmat qismi: allergiya —
-- bemor xavfsizligi masalasi, JSON ichidagi satr emas.
--
-- Nima uchun alohida jadval, `Patient` da ustun emas: allergiya bir nechta
-- bo'ladi, har birining reaksiyasi, og'irligi va kim yozgani bor.
--
-- `isActive` — allergiya olib tashlanganda yozuv O'CHIRILMAYDI, o'chiriladi:
-- tibbiy ma'lumot tarixi yo'qolmasligi kerak.

CREATE TABLE "PatientAllergy" (
    "id"          TEXT PRIMARY KEY NOT NULL,
    "clinicId"    TEXT NOT NULL REFERENCES "Clinic"("id"),
    "patientId"   TEXT NOT NULL REFERENCES "Patient"("id"),
    "substance"   TEXT NOT NULL,
    "reaction"    TEXT,
    "severity"    TEXT NOT NULL DEFAULT 'Unknown',
    "notedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notedByName" TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT 1
);

CREATE INDEX "PatientAllergy_patientId_idx" ON "PatientAllergy"("patientId");
CREATE INDEX "PatientAllergy_clinicId_idx"  ON "PatientAllergy"("clinicId");

-- Surunkali tashxis: bir marta qo'yiladi va uzoq davom etadi. Hozir tashxis
-- faqat qabulga bog'langan, "bemorning surunkali kasalliklari" ro'yxati yo'q.
ALTER TABLE "PatientDiagnosis" ADD COLUMN "isChronic" BOOLEAN NOT NULL DEFAULT 0;

CREATE INDEX "PatientDiagnosis_patientId_isChronic_idx"
    ON "PatientDiagnosis"("patientId", "isChronic");
