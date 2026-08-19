-- Shifokorning xonasi (kabinet raqami).
--
-- Nima uchun. Registratura talon beradi, unda navbat raqami, bo'lim va shifokor
-- bor — LEKIN bemor qaysi xonaga borishini bilmaydi. Hozir buni og'zaki
-- aytishadi. Navbat tablosida ham xona ko'rsatilmaydi.
--
-- Nima uchun shifokorda, bo'limda emas: bemor SHIFOKORGA boradi. Agar klinikada
-- xona bo'limga biriktirilgan bo'lsa va shifokorlar almashsa — maydonni
-- `Department` ga ko'chirish kerak bo'ladi.

ALTER TABLE "Doctor" ADD COLUMN "room" TEXT;
