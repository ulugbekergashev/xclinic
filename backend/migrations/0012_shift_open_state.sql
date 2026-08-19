-- Ochilgan smenani YOPILGAN smenadan ajratish.
--
-- Muammo. 0008 migratsiyasi smenani ochish maydonlarini qo'shdi, lekin
-- `CashRegisterDay` qatorining O'ZI "kun yopilgan" degani edi: interfeys
-- qatorning borligini yopilish deb hisoblaydi (utils/cashbook.ts,
-- getClosureStatus). Smena ochilganda qator yaratiladi — natijada hali
-- sanalmagan kun "yopilgan, farq -X" bo'lib ko'rinadi.
--
-- `closedAt` ni ishlatib bo'lmaydi: u NOT NULL va DEFAULT now(), ya'ni
-- ochilgan qatorda ham to'la bo'ladi.
--
-- MA'LUMOTGA TA'SIRI: mavjud barcha qatorlar — haqiqiy yopilishlar, shuning
-- uchun DEFAULT 1. Ya'ni migratsiyadan keyin eski kunlar avvalgidek
-- "yopilgan" bo'lib qoladi, hech narsa o'zgarmaydi.
-- ORTGA QAYTARISH: ustunni tashlash shart emas — eski kod uni o'qimaydi.
-- Zarur bo'lsa: SQLite 3.35+ da ALTER TABLE ... DROP COLUMN "isClosed".

ALTER TABLE "CashRegisterDay" ADD COLUMN "isClosed" BOOLEAN NOT NULL DEFAULT 1;
