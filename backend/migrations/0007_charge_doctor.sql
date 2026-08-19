-- Hisob qatorining shifokori.
--
-- Nima uchun. Shifokor ulushi `Transaction.doctorId` dan hisoblanadi, lekin
-- BITTA chek bir necha shifokorning xizmatini o'z ichiga oladi: terapevt
-- konsultatsiyasi + UZI. Chekda esa bitta `doctorId` bor — demak tushumni
-- shifokorlarga bo'lish imkoni yo'q.
--
-- Yechim: shifokorni CHEKKA emas, QATORGA yozamiz. Har qator kimning ishi
-- ekani aniq bo'ladi, ulush esa qatorlar bo'yicha yig'iladi.
-- Bu bir vaqtda C11 xatosini ham yopadi: hisobotda shifokorlar ISM bo'yicha
-- guruhlanardi va bir xil ismli ikki shifokor qo'shilib ketardi.

ALTER TABLE "VisitCharge" ADD COLUMN "doctorId"   TEXT;
ALTER TABLE "VisitCharge" ADD COLUMN "doctorName" TEXT;

CREATE INDEX "VisitCharge_doctorId_idx" ON "VisitCharge"("doctorId");
