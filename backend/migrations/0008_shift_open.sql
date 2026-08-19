-- Kassa smenasini OCHISH.
--
-- Nima uchun. `CashRegisterDay` da faqat yopilish bor: `closedByName`,
-- `closedAt`. Smena kim va qachon OCHGANI hech qayerda yozilmaydi, ya'ni
-- "kim kassada turgan edi" degan savolga javob yo'q, va boshlang'ich naqd
-- qoldiq kimning so'zi ekani ham noma'lum.

ALTER TABLE "CashRegisterDay" ADD COLUMN "openedAt"     DATETIME;
ALTER TABLE "CashRegisterDay" ADD COLUMN "openedByName" TEXT;
ALTER TABLE "CashRegisterDay" ADD COLUMN "openedByRole" TEXT;
