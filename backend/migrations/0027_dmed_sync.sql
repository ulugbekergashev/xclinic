-- DMED (IT-MED) ga yuborish HOLATI.
--
-- Nima uchun. `POST /api/visits/:id/dmed-sync` endpointi bor, lekin
-- yuborilgan-yuborilmagani hech qayerda saqlanmaydi: `syncEncounter`
-- konsolga yozadi va shu. Ya'ni "qaysi qabullar davlat tizimiga
-- ketmagan" degan savolga javob yo'q (B103).
--
-- Uch maydon: tashqi id, muvaffaqiyatli yuborilgan payt va oxirgi xato
-- matni. Xatoni SAQLASH muhim: "yuborilmadi" bilan "yuborilmadi, chunki
-- PINFL bo'sh" — bir xil emas, ikkinchisini tuzatish mumkin.
--
-- MA'LUMOTGA TA'SIRI: uch NULL ustun, mavjud qabullar o'zgarmaydi.

ALTER TABLE "Visit" ADD COLUMN "dmedId"       TEXT;
ALTER TABLE "Visit" ADD COLUMN "dmedSyncedAt" DATETIME;
ALTER TABLE "Visit" ADD COLUMN "dmedError"    TEXT;

CREATE INDEX "Visit_dmedSyncedAt_idx" ON "Visit"("dmedSyncedAt");
