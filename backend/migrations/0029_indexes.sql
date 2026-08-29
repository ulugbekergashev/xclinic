-- 0029 — Indekslar. FIX-PLAN 10.5.
--
-- O'lchov (`EXPLAIN QUERY PLAN`, 2026-08-28) bitta kutilmagan narsani
-- ko'rsatdi: sxemada 94 ta indeks bor, lekin `Transaction` jadvalida
-- BIRONTASI YO'Q. Va aynan u eng katta jadval — 10.1 o'lchovida 110 010 qator,
-- 41 MB. Kassa, bosh sahifa, shifokor tahlili va bemor kartasi — hammasi
-- shu jadvalni o'qiydi va har biri TO'LIQ SKAN qilardi.
--
-- Nima uchun bugun sezilmaydi: dev bazada 5 qator. Klinikada bir-ikki yildan
-- keyin sezilib qoladi — 10-reliz aynan shu haqda edi.
--
-- Har bir indeks quyida o'lchov bilan asoslangan. "Ehtimol kerak bo'lar"
-- degan indeks qo'shilmadi: har indeks yozuvni sekinlashtiradi va fayl
-- hajmini oshiradi.

-- ─── Transaction ──────────────────────────────────────────────────────────
-- Oldin: SCAN Transaction + USE TEMP B-TREE FOR ORDER BY (uchala so'rovda)
--
-- (clinicId, date) — kassa, bosh sahifa va hisobotlarning asosiy so'rovi.
-- Tartib ham shu ustunda, ya'ni indeks saralashni HAM yopadi va vaqtinchalik
-- B-daraxt qurilmaydi.
CREATE INDEX IF NOT EXISTS "Transaction_clinicId_date_idx" ON "Transaction"("clinicId", "date");
-- Bemor kartasi: `?patientId=` (10.3 qoldig'i)
CREATE INDEX IF NOT EXISTS "Transaction_patientId_idx" ON "Transaction"("patientId");
-- Shifokor kartasi va ulush hisobi: `?doctorId=`
CREATE INDEX IF NOT EXISTS "Transaction_doctorId_idx" ON "Transaction"("doctorId");
-- Qabul ish stoli: tashrifga bog'langan to'lovlar (multiprofile.ts)
CREATE INDEX IF NOT EXISTS "Transaction_visitId_idx" ON "Transaction"("visitId");

-- ─── Appointment ──────────────────────────────────────────────────────────
-- `date` bo'yicha indeks bor edi, lekin `clinicId` yo'q: shifokor bo'yicha
-- so'rov butun jadvalni sana indeksi bo'ylab skan qilardi.
CREATE INDEX IF NOT EXISTS "Appointment_clinicId_date_idx" ON "Appointment"("clinicId", "date");
CREATE INDEX IF NOT EXISTS "Appointment_doctorId_idx" ON "Appointment"("doctorId");

-- ─── Patient ──────────────────────────────────────────────────────────────
-- Kirishdagi ro'yxat: WHERE clinicId ORDER BY createdAt DESC LIMIT 500.
-- Oldin `clinicId, cardNumber` indeksi ishlatilib, saralash uchun
-- vaqtinchalik B-daraxt qurilardi — 110 ming bemorda bu qimmat.
CREATE INDEX IF NOT EXISTS "Patient_clinicId_createdAt_idx" ON "Patient"("clinicId", "createdAt");

-- ─── Statistika ───────────────────────────────────────────────────────────
-- Indeks bo'lishining o'zi yetarli emas: statistikasiz SQLite qaysi indeks
-- arzonligini TAXMIN qiladi. Bitta klinikali bazada `clinicId` hamma qatorga
-- mos keladi, ya'ni taxmin xato bo'lishi mumkin — masalan bemor kesimida
-- `patientId` indeksi o'rniga sana indeksi tanlanadi.
--
-- ANALYZE haqiqiy taqsimotni o'lchab `sqlite_stat1` ga yozadi. Bir marta,
-- migratsiya paytida — klinikaning O'Z ma'lumoti ustida.
ANALYZE;
