-- Diagnostika va laboratoriya navbati (2026-11-27).
--
-- Ega so'radi: «bularda navbat yo'qmi?». Olti tomonlama muhokamadan keyin:
--   · yangi raqam YO'Q — bemor qabuldagi talon raqami bilan (masalan T-05)
--     UZI ga ham, qon olishga ham boradi; tablodagi raqam bilan bir xil;
--   · «Chaqirish» ixtiyoriy: bosilsa vaqti yoziladi va tablo ovoz bilan
--     «T-05, UZI xonasiga» deydi. Bosilmasa hech narsa o'zgarmaydi.
--   · Qabulning (Visit) holatiga tegilmaydi — aks holda bemor shifokor
--     navbatiga qaytib tushardi.
ALTER TABLE "DiagnosticStudy" ADD COLUMN "calledAt" DATETIME;
ALTER TABLE "LabOrder" ADD COLUMN "calledAt" DATETIME;
