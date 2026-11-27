-- Xarajatni tasdiqlash va bo'lim byudjeti (2026-11-26).
--
-- 1) Belgilangan summadan KATTA xarajatni egadan boshqa xodim yozsa, u
--    «Pending» bo'lib turadi: kassadan pul chiqmaydi, hisobotga tushmaydi.
--    Ega tasdiqlaganda (`Approved`) — o'sha kunning xarajati bo'ladi;
--    rad etsa (`Rejected`) — hech qayerda sanalmaydi, yozuv esa qoladi
--    (so'ragan odam javobni ko'rsin).
--    Chegara dastlab YO'Q (NULL) — hech narsa o'zgarmaydi. Mavjud va avtomatik
--    yoziladigan xarajatlar (oylik, ulush, ombor) — ustun standarti bilan
--    `Approved`, hech qachon ushlanmaydi.
--
-- 2) Bo'limning oylik byudjeti. NULL — byudjet yo'q, blok ko'rinmaydi.
ALTER TABLE "Expense" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Approved';
ALTER TABLE "Expense" ADD COLUMN "requestedByName" TEXT;
ALTER TABLE "Expense" ADD COLUMN "decidedByName" TEXT;
ALTER TABLE "Expense" ADD COLUMN "decidedAt" DATETIME;
CREATE INDEX "Expense_clinicId_status_idx" ON "Expense"("clinicId", "status");
ALTER TABLE "Clinic" ADD COLUMN "expenseApprovalThreshold" REAL;
ALTER TABLE "Department" ADD COLUMN "monthlyBudget" REAL;
