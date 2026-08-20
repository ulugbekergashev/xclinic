-- YO'LLANMA — raqami va holati bor hujjat.
--
-- Nima uchun. Hozir shifokor "kassaga boring, keyin UZI ga" deb OG'ZIDA
-- aytadi (GAP-ANALYSIS B7, A29). Natijada:
--   - bemor kassada nima to'lashini o'zi tushuntiradi;
--   - qog'oz yo'q, ya'ni bemor qo'lida hech narsa qolmaydi;
--   - yo'llanma ishlatilganini tekshirib bo'lmaydi.
--
-- `payload` — yo'llanma BERILGAN PAYTDAGI xizmatlar va summa. Narx keyin
-- o'zgarsa, qog'ozdagi raqam bilan tizimdagi raqam bir xil qolishi kerak:
-- bemor o'sha qog'ozni ko'rsatib keladi.
--
-- `number` klinika ichida takrorlanmaydi (unikal indeks), lekin klinikalar
-- orasida bir xil bo'lishi mumkin — har biri o'z hisobini olib boradi.

CREATE TABLE "Referral" (
    "id"                 TEXT PRIMARY KEY NOT NULL,
    "clinicId"           TEXT NOT NULL REFERENCES "Clinic"("id"),
    "patientId"          TEXT NOT NULL REFERENCES "Patient"("id"),
    "visitId"            TEXT REFERENCES "Visit"("id"),
    "number"             TEXT NOT NULL,
    -- Lab | Study | Consult | Cashier
    "kind"               TEXT NOT NULL,
    "targetDepartmentId" TEXT REFERENCES "Department"("id"),
    -- Issued | Used | Cancelled
    "status"             TEXT NOT NULL DEFAULT 'Issued',
    "issuedAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByName"       TEXT,
    "payload"            TEXT
);

CREATE UNIQUE INDEX "Referral_clinicId_number_key" ON "Referral"("clinicId", "number");
CREATE INDEX "Referral_clinicId_status_idx" ON "Referral"("clinicId", "status");
CREATE INDEX "Referral_patientId_idx"       ON "Referral"("patientId");
CREATE INDEX "Referral_visitId_idx"         ON "Referral"("visitId");
