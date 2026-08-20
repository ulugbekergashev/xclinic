-- Bosma blank uchun klinika ma'lumotlari.
--
-- Nima uchun. Yo'llanma, tahlil natijasi va tekshiruv xulosasi — RASMIY
-- qog'oz. Unda klinikaning litsenziya raqami turishi kerak (ЗРУ "Fuqarolar
-- salomatligini saqlash to'g'risida"), hozir esa `Clinic` da bunday maydon
-- yo'q va blankda faqat nom bilan telefon chiqadi.
--
-- `letterheadNote` — blank pastidagi erkin satr: manzil, ish vaqti, sayt.
-- Har klinika o'zi yozadi, tizim shaklga aralashmaydi.
--
-- MA'LUMOTGA TA'SIRI: ikki NULL ustun qo'shiladi, mavjud yozuvlar
-- o'zgarmaydi. Eski kod bu ustunlarni o'qimaydi.
-- ORTGA QAYTARISH: ustunlarni tashlash shart emas.

ALTER TABLE "Clinic" ADD COLUMN "licenseNumber"  TEXT;
ALTER TABLE "Clinic" ADD COLUMN "letterheadNote" TEXT;
