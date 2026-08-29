-- 0031 — Ko'rik shablonini jins va yoshga bog'lash. PLAN-180, S2.2 (audit B-09).
--
-- MUAMMO. Erkak bemor kartasidagi «Ko'rik bayoni» tabida GINEKOLOGIYA
-- shabloni ochilardi: menarxe, sikl, oxirgi hayz sanasi, homiladorlik soni,
-- «Ko'zgu yordamida» va «Bimanual tekshiruv» maydonlari bilan.
--
-- SABAB (components/EncounterForm.tsx): shablon tanlanmagan bo'lsa
-- `deptTemplates.find(t => t.isDefault) || deptTemplates[0]` ishlaydi.
-- Bazadagi YETTITA shablonning HAMMASI `isDefault = 1`, ro'yxat esa
-- `ORDER BY name ASC` bilan keladi. Alifboda «Ginekolog ko'rigi» birinchi —
-- shuning uchun u har doim g'olib chiqardi.
--
-- Ya'ni bu tasodif emas, qonuniyat edi: har qanday erkak bemorda.

-- Shablon kimga mos: 'Male' | 'Female' | NULL (hammaga)
ALTER TABLE "EncounterTemplate" ADD COLUMN "gender" TEXT;
-- Yosh chegarasi (to'liq yil). NULL — chegara yo'q.
ALTER TABLE "EncounterTemplate" ADD COLUMN "minAge" INTEGER;
ALTER TABLE "EncounterTemplate" ADD COLUMN "maxAge" INTEGER;

-- Mavjud shablonlarga chegara qo'yamiz. Nom bo'yicha mos qidiriladi:
-- bazadagi nomlar seedda qo'yilgan va o'zgarmagan.
UPDATE "EncounterTemplate" SET "gender" = 'Female'
 WHERE "name" LIKE '%inekolog%' OR "name" LIKE '%кушер%' OR "name" LIKE '%Akusher%';

UPDATE "EncounterTemplate" SET "maxAge" = 14
 WHERE "name" LIKE '%ediatr%';

-- Kattalar terapevti — 15 yoshdan. Bola pediatrga tushsin.
UPDATE "EncounterTemplate" SET "minAge" = 15
 WHERE "name" LIKE '%erapevt%';

-- Standart shablon BITTA bo'lishi kerak. Hozir yettitasi ham `isDefault = 1`
-- va bu «standart» tushunchasini ma'nosiz qilib qo'ygan: tanlov alifboga
-- tushib qolgan. Terapevt ko'rigi standart bo'lib qoladi, qolganlari
-- bo'lim tanlanganda ko'rinadi.
UPDATE "EncounterTemplate" SET "isDefault" = 0
 WHERE "name" NOT LIKE '%erapevt%';

CREATE INDEX IF NOT EXISTS "EncounterTemplate_gender_idx" ON "EncounterTemplate"("gender");
