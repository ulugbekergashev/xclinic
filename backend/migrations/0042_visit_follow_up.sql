-- Qayta ko'rik (2026-11-26).
--
-- MUAMMO.
--   Shifokor «3 haftadan keyin keling» deydi — bu hech qayerda yozilmasdi.
--   `Visit.disposition = 'Followup'` bor edi, lekin SANASI yo'q: registratura
--   kimga qo'ng'iroq qilishni bilmasdi, bemorga eslatma ham ketmasdi.
--
-- YECHIM — faqat yangi NULL ustun va indeks, mavjud yozuvlarga tegilmaydi:
--   Visit.followUpDate — 'YYYY-MM-DD' (Visit.date kabi), NULL — belgilanmagan.
--   «Keldimi» saqlanmaydi, hisoblanadi: keyingi qabul yoki kalendar yozuvi.
ALTER TABLE "Visit" ADD COLUMN "followUpDate" TEXT;
CREATE INDEX "Visit_clinicId_followUpDate_idx" ON "Visit"("clinicId", "followUpDate");
