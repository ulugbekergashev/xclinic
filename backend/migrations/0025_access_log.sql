-- KIM BEMOR KARTASINI KO'RGANI jurnali.
--
-- Nima uchun. `CashAuditLog` faqat pulni qamrab oladi. Tibbiy yozuvni kim
-- ochgani, kim o'zgartirgani hech qayerda yozilmaydi (GAP-ANALYSIS B97,
-- A20). Huquqiy asos — vrach siri, "Fuqarolar salomatligini saqlash
-- to'g'risida" qonunning 25-moddasi 3-qismi: ma'lumotga kim kirgani
-- aniqlanadigan bo'lishi kerak.
--
-- QAROR В5: chetdan kirishni TAQIQLAMAYMIZ, YOZIB QO'YAMIZ. Taqiq
-- ishlayotgan klinikalarda shifokorlarga 403 bera boshlaydi — bu
-- "ishlayotganni buzmaslik" qoidasining buzilishi. Jurnal esa
-- javobgarlikni beradi va birorta sahnani buzmaydi.
--
-- QAROR В14: ko'rishlar ham yoziladi (ko'rish — vrach sirining o'zi), va
-- 24 oy saqlanadi. Tozalash serverni ishga tushirishda bo'ladi: oddiy ish
-- kompyuterining diski cheksiz emas.
--
-- `userId` ATAYLAB tashqi kalit EMAS: rollar turli jadvallarda yotadi
-- (Doctor, Receptionist, Nurse, LabTechnician), xuddi
-- `Transaction.receivedById` da bo'lgani kabi.

CREATE TABLE "AccessLog" (
    "id"         TEXT PRIMARY KEY NOT NULL,
    "clinicId"   TEXT NOT NULL REFERENCES "Clinic"("id"),
    "at"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userRole"   TEXT,
    "userName"   TEXT,
    "userId"     TEXT,
    -- View | Create | Update | Delete | Print | Export
    "action"     TEXT NOT NULL,
    -- Visit | LabOrder | DiagnosticStudy | PatientDocument | Patient ...
    "entityType" TEXT NOT NULL,
    "entityId"   TEXT,
    "patientId"  TEXT REFERENCES "Patient"("id")
);

CREATE INDEX "AccessLog_clinicId_at_idx"          ON "AccessLog"("clinicId", "at");
CREATE INDEX "AccessLog_patientId_at_idx"         ON "AccessLog"("patientId", "at");
CREATE INDEX "AccessLog_entityType_entityId_idx"  ON "AccessLog"("entityType", "entityId");
