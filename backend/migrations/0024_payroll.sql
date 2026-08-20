-- OYLIK VEDOMOSTI: davr uchun hisoblangan va to'langan summa.
--
-- Nima uchun. Hozir shifokor ulushi qo'lda `Expense` sifatida yoziladi
-- (kategoriya `DoctorShare`). Ya'ni:
--   - "shu oy kimga qancha tegdi" degan hujjat yo'q;
--   - hisob-kitob Excel da qilinadi va xato o'sha yerda qoladi;
--   - to'langan-to'lanmagani ko'rinmaydi (B87).
--
-- Vedomost DRAFT holatida yaratiladi: raqamlarni ko'rib, tekshirib, keyin
-- tasdiqlanadi. Tasdiqlangandan keyin qatorlar QAYTA HISOBLANMAYDI —
-- aks holda o'tgan oyning vedomosti bugungi stavka bilan o'zgarib ketardi.
--
-- `staffName` — nom NUSXASI: shifokor ketib qolsa ham vedomostda ismi
-- qoladi. Bu moliyaviy hujjat.

CREATE TABLE "PayrollRun" (
    "id"              TEXT PRIMARY KEY NOT NULL,
    "clinicId"        TEXT NOT NULL REFERENCES "Clinic"("id"),
    "periodFrom"      TEXT NOT NULL,
    "periodTo"        TEXT NOT NULL,
    -- Draft | Approved | Paid
    "status"          TEXT NOT NULL DEFAULT 'Draft',
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByName"   TEXT,
    "approvedByName"  TEXT,
    "approvedAt"      DATETIME,
    "note"            TEXT
);

CREATE INDEX "PayrollRun_clinicId_periodFrom_idx" ON "PayrollRun"("clinicId", "periodFrom");

CREATE TABLE "PayrollLine" (
    "id"        TEXT PRIMARY KEY NOT NULL,
    "runId"     TEXT NOT NULL REFERENCES "PayrollRun"("id") ON DELETE CASCADE,
    "doctorId"  TEXT REFERENCES "Doctor"("id"),
    -- Nom NUSXASI: xodim ketsa ham vedomostda qoladi
    "staffName" TEXT NOT NULL,
    "accrued"   REAL NOT NULL DEFAULT 0,
    "paid"      REAL NOT NULL DEFAULT 0,
    "expenseId" TEXT REFERENCES "Expense"("id"),
    -- Hisob qanday chiqqani: qaysi xizmatlar, qaysi foiz (JSON)
    "detail"    TEXT
);

CREATE INDEX "PayrollLine_runId_idx" ON "PayrollLine"("runId");
