-- XODIMLAR MODULI: oylik, bonus/jarima, ish grafigi va davomat.
--
-- MUAMMO. Maosh faqat SHIFOKORDA bor. `Doctor` da `salaryType`,
-- `fixedSalary` va `percentage` turadi, qolgan uch jadvalda esa umuman
-- yo'q. Ya'ni registrator, laborant va hamshiraning oyligini dasturga
-- yozib bo'lmaydi — u Excel da yoki daftarda qoladi.
--
-- Yana uchta narsa yo'q edi:
--
--   * BONUS va JARIMA. Klinika ularni har oy beradi, lekin yozadigan
--     joyi yo'q: xarajatga qo'lda yoziladi va kimga tegishli ekani
--     yo'qoladi.
--   * ISH GRAFIGI. `startHour`/`endHour` — kunning SOATI, lekin HAFTANING
--     qaysi kunlari ishlashi hech qayerda yo'q.
--   * XODIM DAVOMATI. Kim keldi, kim kelmadi — baza bilmaydi.
--
-- QARORLAR, ular kodda ham takrorlanadi:
--
-- 1. Foiz (ulush) qolgan uch rolga QO'SHILMAYDI. Ulush to'langan
--    xizmatdan hisoblanadi va uni faqat shifokor bajaradi. Registratorga
--    «KPI foizi» maydonini qo'yish — hech qachon pul chiqarmaydigan
--    maydon ko'rsatish, ya'ni yolg'on.
--
-- 2. `StaffSalaryPayment` faqat ASOSIY oylikni (+bonus −jarima) yopadi.
--    Shifokorning ulushi ilgarigidek VEDOMOST orqali to'lanadi. Ikkala
--    yo'l bir xil pulni ikki marta bermasligi uchun ular ataylab
--    ajratilgan; xodim kartasi ikkalasini yonma-yon ko'rsatadi.
--
-- 3. Davomat oylikdan AVTOMATIK ushlab qolmaydi. Kelmagan kun uchun
--    ushlash — direktorning qarori, summasi har xil bo'ladi; buni
--    dastur o'zi qilsa, hech kim so'ramagan pul ushlanib qoladi.
--    Kelmagan kun ko'rinadi, ushlash esa jarima orqali qo'lda yoziladi.

-- ─── Oylik: qolgan uch rolda ham ────────────────────────────────────────────
ALTER TABLE "Receptionist" ADD COLUMN "fixedSalary" REAL NOT NULL DEFAULT 0;
ALTER TABLE "LabTechnician" ADD COLUMN "fixedSalary" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Nurse" ADD COLUMN "fixedSalary" REAL NOT NULL DEFAULT 0;

-- Registratorda mutaxassislik yo'q edi — «Lavozim» ustuni uning uchun
-- bo'sh qolardi (0035 uni hamshiraga qo'shgan, registratorni o'tkazib
-- yuborgan).
ALTER TABLE "Receptionist" ADD COLUMN "specialty" TEXT;

-- Elektron pochta — xodim kartasidagi aloqa bloki uchun.
ALTER TABLE "Receptionist" ADD COLUMN "email" TEXT;
ALTER TABLE "LabTechnician" ADD COLUMN "email" TEXT;
ALTER TABLE "Nurse" ADD COLUMN "email" TEXT;

-- ─── Ish grafigi: haftaning kunlari ─────────────────────────────────────────
-- Format: vergul bilan ajratilgan kun raqamlari, 1 = dushanba … 7 = yakshanba
-- («1,2,3,4,5»). NULL — grafik belgilanmagan.
ALTER TABLE "Doctor" ADD COLUMN "workDays" TEXT;
ALTER TABLE "Receptionist" ADD COLUMN "workDays" TEXT;
ALTER TABLE "LabTechnician" ADD COLUMN "workDays" TEXT;
ALTER TABLE "Nurse" ADD COLUMN "workDays" TEXT;

-- ─── Bonus va jarima ────────────────────────────────────────────────────────
-- `staffRole` + `staffId` — to'rt jadvalga tashqi kalit qo'yib bo'lmaydi,
-- shuning uchun bog'lam rol nomi bilan yuritiladi. Xodim o'chirilmaydi
-- (ro'yxatdan chiqariladi), ya'ni yozuv osilib qolmaydi.
CREATE TABLE "StaffAdjustment" (
    "id"            TEXT PRIMARY KEY,
    "clinicId"      TEXT NOT NULL,
    "staffRole"     TEXT NOT NULL,
    "staffId"       TEXT NOT NULL,
    -- Qaysi oyga tegishli: 'YYYY-MM'
    "period"        TEXT NOT NULL,
    -- Bonus | Penalty
    "type"          TEXT NOT NULL,
    "reason"        TEXT NOT NULL,
    "amount"        REAL NOT NULL,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName" TEXT,
    CONSTRAINT "StaffAdjustment_clinic_fk" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
);
CREATE INDEX "StaffAdjustment_lookup_idx"
    ON "StaffAdjustment"("clinicId", "staffRole", "staffId", "period");

-- ─── Davomat ────────────────────────────────────────────────────────────────
-- Bir xodim, bir kun — bitta yozuv. Takroriy belgilash yangi qator
-- yaratmaydi, borini yangilaydi (unikal indeks shuni kafolatlaydi).
CREATE TABLE "StaffAttendance" (
    "id"        TEXT PRIMARY KEY,
    "clinicId"  TEXT NOT NULL,
    "staffRole" TEXT NOT NULL,
    "staffId"   TEXT NOT NULL,
    -- 'YYYY-MM-DD', Toshkent vaqti bo'yicha
    "date"      TEXT NOT NULL,
    -- Present | Absent | Excused | Late
    "status"    TEXT NOT NULL,
    "note"      TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffAttendance_clinic_fk" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id")
);
CREATE UNIQUE INDEX "StaffAttendance_day_unique"
    ON "StaffAttendance"("staffRole", "staffId", "date");
CREATE INDEX "StaffAttendance_month_idx"
    ON "StaffAttendance"("clinicId", "date");

-- ─── Oylik to'lovi ──────────────────────────────────────────────────────────
-- Har xodimga har oy uchun BITTA to'lov — unikal indeks ikkinchisiga yo'l
-- qo'ymaydi. Ilgari bunday himoya yo'q edi va bir oyni ikki marta to'lash
-- faqat xarajatlar ro'yxatida ko'rinardi.
--
-- `expenseId` — xarajat yozuvi. Pul kassadan chiqadi, ya'ni oylik
-- hisobotda ham, kassada ham ko'rinadi. Nusxa maydonlari (`staffName`,
-- `base`, `bonus`, `penalty`) ataylab: hujjat keyin o'zgarmasligi kerak.
CREATE TABLE "StaffSalaryPayment" (
    "id"         TEXT PRIMARY KEY,
    "clinicId"   TEXT NOT NULL,
    "staffRole"  TEXT NOT NULL,
    "staffId"    TEXT NOT NULL,
    "staffName"  TEXT NOT NULL,
    "period"     TEXT NOT NULL,
    "base"       REAL NOT NULL DEFAULT 0,
    "bonus"      REAL NOT NULL DEFAULT 0,
    "penalty"    REAL NOT NULL DEFAULT 0,
    "amount"     REAL NOT NULL,
    "method"     TEXT,
    "expenseId"  TEXT,
    "paidAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidByName" TEXT,
    CONSTRAINT "StaffSalaryPayment_clinic_fk" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id"),
    CONSTRAINT "StaffSalaryPayment_expense_fk" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id")
);
CREATE UNIQUE INDEX "StaffSalaryPayment_period_unique"
    ON "StaffSalaryPayment"("staffRole", "staffId", "period");
CREATE INDEX "StaffSalaryPayment_clinic_idx"
    ON "StaffSalaryPayment"("clinicId", "period");
