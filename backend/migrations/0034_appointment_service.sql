-- Yozuvda XIZMAT identifikatori.
--
-- MUAMMO. `Appointment.type` — erkin matn: «Konsultatsiya», «UZI»,
-- «Breket». Registratura yozilish paytida xizmatni tanlaydi, lekin
-- saqlanadigan narsa faqat NOMI.
--
-- Oqibati ikkita:
--
--   * bemor kelganda xizmat nom bo'yicha qidiriladi (`utils/arrival.ts`,
--     `x.name === appt.type`). Prayslistda nom ozgina o'zgarsa —
--     «UZI» → «Qorin UZI si» — moslik yo'qoladi va qabul XIZMATSIZ
--     ochiladi. Ya'ni kassada hech narsa ko'rinmaydi va bemor pul
--     to'lamasdan ketadi;
--   * hisobotlarda «qaysi xizmatga yozilishadi-yu, qaysisiga kelishmaydi»
--     degan savolga javob berib bo'lmaydi.
--
-- YECHIM. `serviceId` — bog'lam, `type` esa SNIMOK bo'lib qoladi: nom
-- keyin o'zgarsa ham eski yozuvda o'sha paytdagi nom turadi.

ALTER TABLE "Appointment" ADD COLUMN "serviceId" INTEGER REFERENCES "Service"("id");
CREATE INDEX "Appointment_serviceId_idx" ON "Appointment"("serviceId");

-- Mavjud yozuvlarni NOM bo'yicha bog'laymiz — bir marta, oxirgi marta.
-- Topilmaganlari NULL bo'lib qoladi: taxmin qilmaymiz.
UPDATE "Appointment"
SET "serviceId" = (
    SELECT s."id" FROM "Service" s
    WHERE s."clinicId" = "Appointment"."clinicId"
      AND s."name" = "Appointment"."type"
    LIMIT 1
)
WHERE "serviceId" IS NULL AND "type" IS NOT NULL AND "type" <> '';
