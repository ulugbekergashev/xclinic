-- Registrator boti va bemorning eslatmaga javobi (2026-11-27, dentalocal'dan).
--
-- 1) Registrator ham botga telefon raqami bilan ulanadi (rahbar va
--    shifokor kabi): bugungi/ertangi qabullar, bugungi kassa; bemor
--    «kela olmayman» desa yoki saytdan so'rov kelsa — xabar.
-- 2) «Qabuldan oldin» eslatmasida «✅ Kelaman / ❌ Kela olmayman» tugmalari.
--    Javob qabulga yoziladi va Kalendarda ko'rinadi. Tugma ixtiyoriy:
--    bemor bosmasa hech narsa o'zgarmaydi.
ALTER TABLE "Receptionist" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "patientReply" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "patientReplyAt" DATETIME;
