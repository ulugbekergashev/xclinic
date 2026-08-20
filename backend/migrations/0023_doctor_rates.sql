-- Shifokor ulushi: har XIZMATGA o'z foizi.
--
-- Nima uchun. Hozir `Doctor.percentage` — bitta foiz hamma narsaga.
-- Haqiqatda: konsultatsiyadan 30%, operatsiyadan 15%, UZI dan 0% (apparat
-- klinikaning), implantdan qat'iy summa. Bitta foiz bilan hisob-kitob har
-- oy qo'lda tuzatiladi (B85).
--
-- `serviceId` NULL bo'lsa — stavka butun BO'LIMGA tegishli. Ikkisi ham
-- NULL bo'lsa — shifokorning umumiy stavkasi.
--
-- `role` = Doctor | Assistant — bitta muolajada ikki kishi ishlaydi va
-- ularning foizi boshqa (B86).
--
-- `Doctor.percentage` OLIB TASHLANMAYDI: stavka topilmasa u ishlatiladi.
-- Ya'ni migratsiyadan keyin hech narsa o'zgarmaydi.

CREATE TABLE "DoctorServiceRate" (
    "id"           TEXT PRIMARY KEY NOT NULL,
    "clinicId"     TEXT NOT NULL REFERENCES "Clinic"("id"),
    "doctorId"     TEXT NOT NULL REFERENCES "Doctor"("id"),
    "serviceId"    INTEGER REFERENCES "Service"("id"),
    "departmentId" TEXT REFERENCES "Department"("id"),
    "percent"      REAL NOT NULL,
    -- Doctor | Assistant
    "role"         TEXT NOT NULL DEFAULT 'Doctor',
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "DoctorServiceRate_doctorId_idx" ON "DoctorServiceRate"("doctorId");
-- Bitta shifokor + xizmat + rol uchun ikkita stavka bo'lmaydi.
-- SQLite da NULL lar unikal indeksda bir-biriga teng emas, ya'ni
-- "hamma xizmatga" stavkasi (serviceId NULL) bir necha marta yozilishi
-- mumkin — buni kod tekshiradi.
CREATE UNIQUE INDEX "DoctorServiceRate_doctorId_serviceId_role_key"
    ON "DoctorServiceRate"("doctorId", "serviceId", "role");

-- Muolajada ASSISTENT: ikki kishi ishlaganda ikkinchisi ham ulush oladi
ALTER TABLE "TreatmentProcedure" ADD COLUMN "assistantId"   TEXT;
ALTER TABLE "TreatmentProcedure" ADD COLUMN "assistantName" TEXT;
