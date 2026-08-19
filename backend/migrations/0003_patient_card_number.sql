-- Bemor kartasining O'QILADIGAN raqami.
--
-- Nima uchun. Hozir bemorning yagona identifikatori — UUID
-- (`23ad6ef4-09cd-4c00-b051-7662f28dd7ba`). Uni registratura og'zaki aytolmaydi,
-- qog'ozga yozolmaydi va telefonda so'rayolmaydi. Klinikada esa karta raqami —
-- bemorni topishning eng tez yo'li.
--
-- Nullable: mavjud bemorlarda bo'sh qoladi va hech narsa buzilmaydi. Raqam
-- keyin qo'lda yoki avtomatik beriladi.
--
-- Unique index klinika ichida: ikki bemor bir raqamga ega bo'lmasligi kerak,
-- lekin turli klinikalarda raqamlar takrorlanishi mumkin. SQLite da UNIQUE
-- indeksda bir nechta NULL RUXSAT ETILADI — shuning uchun barcha mavjud
-- bemorlarda NULL bo'lsa ham indeks muammosiz yaratiladi.

ALTER TABLE "Patient" ADD COLUMN "cardNumber" TEXT;

CREATE UNIQUE INDEX "Patient_clinicId_cardNumber_key"
    ON "Patient"("clinicId", "cardNumber");
