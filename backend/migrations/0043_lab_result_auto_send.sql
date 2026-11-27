-- Tahlil natijasini bemorga o'zi yuborish (2026-11-26).
--
-- Retsept va natija endi bemorning Telegramiga PDF bo'lib ketadi
-- (bir bosishda, printer tugmasi yonidan). Bu ustun — klinikaning BITTA
-- sozlamasi: «natija tayyor bo'lganda o'zi yuborilsin».
--
-- Dastlab O'CHIQ (0): natija ba'zan kiritilgandan keyin tuzatiladi, bemor
-- Telegramida xato raqam qolishi — klinika uchun xavf. Ega o'zi yoqadi.
-- Mavjud yozuvlarga tegilmaydi.
ALTER TABLE "Clinic" ADD COLUMN "labResultAutoSend" BOOLEAN NOT NULL DEFAULT 0;
