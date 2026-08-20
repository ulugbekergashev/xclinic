-- Hisob qatorini XIZMAT KATALOGIGA bog'lash.
--
-- Nima uchun. `VisitCharge` da xizmat NOMI bor, id si yo'q. Natijada:
--   - "shu xizmat oyda necha marta sotildi" degan hisobotni nom bo'yicha
--     yig'ish kerak, nom esa o'zgaradi va xato beradi;
--   - shifokor ulushini XIZMAT bo'yicha hisoblab bo'lmaydi (B85): stavka
--     xizmatga bog'lanadi, qator esa unga bog'lanmagan.
--
-- MA'LUMOTGA TA'SIRI: bitta NULL ustun. Mavjud qatorlar nomi bilan qoladi,
-- hisobot ularni ilgarigidek nom bo'yicha ko'rsatadi.
-- ORTGA QAYTARISH: ustunni tashlash shart emas.

ALTER TABLE "VisitCharge" ADD COLUMN "serviceId" INTEGER REFERENCES "Service"("id");

CREATE INDEX "VisitCharge_serviceId_idx" ON "VisitCharge"("serviceId");
