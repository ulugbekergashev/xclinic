-- Yozuv QACHON yaratilgani — «Qabulga yozilganda» xabari uchun.
--
-- MUAMMO. Bemor qabulga yozilganda unga tasdiq ketmasdi: avtomatikada
-- faqat «qabuldan N soat oldin» eslatmasi bor edi. Yozuv yaratilgan vaqt
-- esa hech qayerda saqlanmasdi — `Appointment` da faqat qabul sanasi va
-- soati bor, ya'ni «hozirgina yozilganlar»ni topib bo'lmasdi.
--
-- YECHIM. `bookedAt` — xodim yozuvni yaratgan payt (`POST /api/appointments`
-- o'zi qo'yadi). Qoidasi `backend/triggers.ts`, `appointment_booked`.
--
-- NULL — «xabar kerak emas» degani va bu ATAYLAB:
--   * mavjud yozuvlar NULL bo'lib qoladi. To'ldirilsa, qoida yoqilgan zahoti
--     kelgusi barcha yozuvlarga birdaniga SMS ketardi;
--   * Telegram bot orqali yozilganlarda ham NULL — bot chatda o'zi
--     tasdiqlaydi, ikkinchi xabar (yoki pullik SMS) ortiqcha.
-- Shuning uchun ustunda DEFAULT yo'q.
--
-- MA'LUMOTGA TA'SIRI: bitta NULL ustun, mavjud yozuvlar o'zgarmaydi.

ALTER TABLE "Appointment" ADD COLUMN "bookedAt" DATETIME;
