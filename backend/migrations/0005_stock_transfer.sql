-- Ombor harakatida bo'limlar orasida ko'chirish.
--
-- Nima uchun. `StockMovement.type` uchta qiymatni bilardi: In, Out, Adjust,
-- Writeoff. Bo'limdan bo'limga ko'chirish (masalan, umumiy ombordan
-- laboratoriyaga) hech qanday tur bilan ifodalanmasdi: uni "chiqim + kirim"
-- deb yozish kerak edi, va bunda "qayerdan qayerga" ma'lumoti yo'qolardi.
--
-- `type` matn ustuni bo'lgani uchun 'Transfer' qiymatini qo'shish MIGRATSIYA
-- TALAB QILMAYDI — faqat kodda. Migratsiya kerak bo'lgan qism: qayerdan va
-- qayerga.
--
-- Ikkalasi ham nullable: mavjud harakatlarda bo'sh qoladi, ular ko'chirish
-- emas. REFERENCES yangi ustunda qo'shiladi — SQLite bunga ruxsat beradi va
-- jadval QAYTA YARATILMAYDI (Prisma migrate esa bu holatda jadvalni qayta
-- yaratadi, shuning uchun migratsiyani o'zimiz yozamiz).

ALTER TABLE "StockMovement" ADD COLUMN "fromDepartmentId" TEXT REFERENCES "Department"("id");
ALTER TABLE "StockMovement" ADD COLUMN "toDepartmentId" TEXT REFERENCES "Department"("id");

CREATE INDEX "StockMovement_fromDepartmentId_idx" ON "StockMovement"("fromDepartmentId");
CREATE INDEX "StockMovement_toDepartmentId_idx" ON "StockMovement"("toDepartmentId");
