-- BEMOR HUJJATLARI: rozilik, shartnoma, ma'lumotlarga rozilik.
--
-- Nima uchun. Tizimda bemor IMZOLAYDIGAN birorta hujjat yo'q (B94, B95,
-- B96, B99). Huquqiy asos:
--   - 26-modda: pullik xizmat shartnomasi;
--   - 25-modda 4-qismi: xabardor rozilik (aralashuvdan oldin);
--   - ЗРУ-547 "Shaxsga doir ma'lumotlar to'g'risida": ma'lumotlarni
--     qayta ishlashga rozilik.
--
-- `textSnapshot` — IMZOLANGAN PAYTDAGI matn. Shablon keyin o'zgaradi,
-- hujjat esa o'zgarmasligi kerak: bemor imzolagan matn aynan shu bo'lishi
-- kerak. Bu maydonsiz hujjat huquqiy kuchini yo'qotadi.
--
-- ERI (elektron imzo) maydonlari HOZIR qo'shiladi (`signature`,
-- `signerCertificate`) — Б9.5 kelganda jadvalni qayta yaratmaslik uchun.
-- Ular bo'sh turadi va hech narsaga xalaqit bermaydi.

CREATE TABLE "PatientDocument" (
    "id"                TEXT PRIMARY KEY NOT NULL,
    "clinicId"          TEXT NOT NULL REFERENCES "Clinic"("id"),
    "patientId"         TEXT NOT NULL REFERENCES "Patient"("id"),
    "visitId"           TEXT REFERENCES "Visit"("id"),
    -- Consent | Contract | DataConsent | Discharge | Other
    "kind"              TEXT NOT NULL,
    "number"            TEXT,
    "textSnapshot"      TEXT,
    "signedAt"          DATETIME,
    "signedByName"      TEXT,
    "patientSigned"     BOOLEAN NOT NULL DEFAULT 0,
    "filePath"          TEXT,
    "signature"         TEXT,
    "signerCertificate" TEXT,
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName"     TEXT
);

CREATE INDEX "PatientDocument_patientId_kind_idx" ON "PatientDocument"("patientId", "kind");
CREATE INDEX "PatientDocument_clinicId_createdAt_idx" ON "PatientDocument"("clinicId", "createdAt");
