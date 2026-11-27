-- Oldindan bosilgan blanka uchun chop etish chekkalari (2026-11-26).
--
-- Ko'p klinikada tepasida klinika nomi, logotip va manzil BOSMAXONADA
-- bosilgan qog'oz bor. Dastur ham o'z shapkasini chiqarsa, ikkalasi ustma-ust
-- tushadi. Shuning uchun klinika: shapkani o'chiradi va varaqning tepa,
-- past va yon chekkalarini millimetrda o'zi beradi.
--
-- Hammasi ixtiyoriy: NULL — avvalgi chekkalar (14/12/14 mm), shapka chiqadi.
-- Telegram PDF ga tegilmaydi: u qog'oz emas, shapkasiz bo'lmaydi.
ALTER TABLE "Clinic" ADD COLUMN "printTopMm" INTEGER;
ALTER TABLE "Clinic" ADD COLUMN "printBottomMm" INTEGER;
ALTER TABLE "Clinic" ADD COLUMN "printSideMm" INTEGER;
ALTER TABLE "Clinic" ADD COLUMN "printHideHeader" BOOLEAN NOT NULL DEFAULT 0;
