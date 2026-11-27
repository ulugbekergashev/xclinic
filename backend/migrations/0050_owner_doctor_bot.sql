-- Rahbar va shifokor Telegram boti (2026-11-27, dentalocal'dan ko'chirildi).
--
-- 1) Rahbarning kunlik hisoboti: ilgari har kuni 22:00 da QATTIQ cron edi —
--    kompyuter o'sha daqiqada o'chiq bo'lsa hisobot umuman kelmasdi va uni
--    o'chirib ham, vaqtini o'zgartirib ham bo'lmasdi. Endi sozlanadi va
--    o'tkazib yuborilgan kun ertasi «Kechagi hisobot» bo'lib keladi.
--    Avvalgidek YOQIQ, 22:00 — mavjud klinikada hech narsa o'zgarmaydi.
-- 2) Shifokorga qabul xabari: registrator yozgan, ko'chirgan yoki bekor
--    qilgan qabul shifokorning Telegramiga boradi. Faqat Telegram ulagan
--    shifokorga; sozlamada o'chirib qo'yish mumkin.
-- 3) Ertalabki jadval ham bir martalik belgi bilan: 08:00 da kompyuter
--    o'chiq bo'lsa, 12:00 gacha yoqilganda yuboriladi.
ALTER TABLE "Clinic" ADD COLUMN "ownerReportEnabled" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "Clinic" ADD COLUMN "ownerReportTime" TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE "Clinic" ADD COLUMN "ownerReportSentFor" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doctorMorningSentOn" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "doctorNotify" BOOLEAN NOT NULL DEFAULT 1;
