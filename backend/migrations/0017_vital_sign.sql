-- Harorat varag'i uchun O'LCHOVLAR jadvali.
--
-- Nima uchun. Hozir ko'rsatkichlar JSON matn ichida yotadi:
-- `InpatientRound.vitalSigns` va `Visit.vitalSigns`. JSON dan GRAFIK
-- qurib bo'lmaydi — harorat varag'i esa aynan grafik (B51). Statsionarda
-- haroratning 3 kunlik egri chizig'i tashxisning bir qismi.
--
-- Har o'lchov ALOHIDA qator (kind + value), bitta "vitals" obyekti emas:
-- haroratni kuniga 2 marta, bosimni kuniga 1 marta o'lchash mumkin, ular
-- bir vaqtda bo'lishi shart emas.
--
-- MUHIM: eski JSON maydonlar TEGILMAYDI. Yangi yozuvlar ikki joyga ham
-- yoziladi — yangi jadvalga ishonch hosil bo'lguncha eski ekranlar
-- ilgarigidek ishlaydi.

CREATE TABLE "VitalSign" (
    "id"             TEXT PRIMARY KEY NOT NULL,
    "clinicId"       TEXT NOT NULL REFERENCES "Clinic"("id"),
    "patientId"      TEXT NOT NULL REFERENCES "Patient"("id"),
    "admissionId"    TEXT REFERENCES "Admission"("id"),
    "visitId"        TEXT REFERENCES "Visit"("id"),
    "measuredAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Temp | BpSys | BpDia | Pulse | Weight | Height | SpO2
    "kind"           TEXT NOT NULL,
    "value"          REAL NOT NULL,
    "unit"           TEXT,
    "measuredByName" TEXT
);

CREATE INDEX "VitalSign_patientId_kind_measuredAt_idx"
    ON "VitalSign"("patientId", "kind", "measuredAt");
CREATE INDEX "VitalSign_admissionId_idx" ON "VitalSign"("admissionId");
CREATE INDEX "VitalSign_clinicId_idx"    ON "VitalSign"("clinicId");
