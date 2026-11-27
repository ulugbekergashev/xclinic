-- Saytdan qabulga yozilish va so'rovni tasdiqlash (2026-11-26).
--
-- Bemor klinika havolasini ochadi (masofaviy kirish manzili + /book):
-- shifokor → kun → bo'sh vaqt → ism va telefon. So'rov oddiy `Appointment`
-- bo'lib yoziladi, holati 'Requested' (yangi holat: eslatma, «yozildi»
-- xabari va oldindan to'lov oqimi uni bilmaydi; vaqt esa band turadi).
-- Registrator Kalendarda «Saytdan kelgan so'rovlar» blokida bitta bosishda
-- tasdiqlaydi yoki boshqa vaqt beradi.
--
-- `source` — 'site' | 'bot' | NULL (xodim yozgan).
-- Sozlama dastlab O'CHIQ: o'chiq bo'lsa sahifa 404 beradi, bot ham
-- avvalgidek ishlaydi.
ALTER TABLE "Appointment" ADD COLUMN "source" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "onlineBookingEnabled" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "Clinic" ADD COLUMN "bookingAutoConfirm" BOOLEAN NOT NULL DEFAULT 0;
CREATE INDEX "Appointment_clinicId_status_idx" ON "Appointment"("clinicId", "status");
