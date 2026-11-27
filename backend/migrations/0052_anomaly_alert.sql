-- G'ayrioddiy kun haqida ogohlantirish (2026-11-27, dentalocal'dagi g'oya).
-- Kunlik hisobotda (kun yakunida, ma'lumot to'liq bo'lganda) bugungi
-- tushum, qabullar soni va kelmaganlar oxirgi 30 kunga solishtiriladi.
-- Keskin farq bo'lsa (ikki standart chetlanish) hisobot boshida
-- «⚠️ Diqqat talab qiladi» bo'limi chiqadi. Oddiy kunda — yo'q.
-- (dentalocal'da 18:00 da alohida xabar edi: kun hali tugamagan payt
-- tushum doim «past» ko'rinib, yolg'on ogohlantirish berardi.)
-- Yoqiq; Sozlamalar → Integratsiyalar → Telegram bot kartasida o'chiriladi.
ALTER TABLE "Clinic" ADD COLUMN "anomalyAlert" BOOLEAN NOT NULL DEFAULT 1;
