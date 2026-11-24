-- Vrach ish joyi (2026-11-23): ko'rik matni, yo'naltirish, tashxis turi.
--
-- MUAMMO.
--   * Ob'ektiv ko'rik faqat bo'lim shablonining alohida maydonlarida
--     (`examData` JSON) yozilardi: o'pka, yurak, qorin — har biri o'z
--     qutisida, «Ko'rik yozish» tugmasi ortida. Vrachlar ularni to'ldirmasdi.
--   * Vrach bemorni boshqa shifokorga yuborsa, ikkinchi shifokor KIM va
--     NIMA UCHUN yuborganini ko'rmasdi; javob ham yuboruvchiga qaytmasdi.
--     Tashqi yo'llanma (boshqa klinika, shifokor) hech qayerda yozilmasdi.
--   * Tashxisning turi yo'q edi — qaysi biri asosiy, qaysi biri yondosh.
--
-- YECHIM — faqat yangi NULL ustunlar, mavjud yozuvlarga tegilmaydi:
--   Visit.objectiveText        — ko'rik matni (shablon «me'yor»ni yozadi,
--                                vrach og'ishni tuzatadi). Raqamlar (AB,
--                                puls…) `examData` da qoladi.
--   Visit.referralSource       — NULL: o'zi keldi · 'Internal' · 'External'
--   Visit.referredFromVisitId  — ichki yo'llanma: qaysi qabuldan
--   Visit.referredByName       — kim yo'naltirdi (shifokor / klinika nomi)
--   Visit.referralReason       — nima uchun (bitta qator)
--   PatientDiagnosis.kind      — 'Main' | 'Concomitant' | 'Complication';
--                                NULL — eski yozuv (birinchisi asosiy deb
--                                ko'rsatiladi)

ALTER TABLE "Visit" ADD COLUMN "objectiveText" TEXT;
ALTER TABLE "Visit" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "Visit" ADD COLUMN "referredFromVisitId" TEXT REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD COLUMN "referredByName" TEXT;
ALTER TABLE "Visit" ADD COLUMN "referralReason" TEXT;
CREATE INDEX "Visit_referredFromVisitId_idx" ON "Visit"("referredFromVisitId");

ALTER TABLE "PatientDiagnosis" ADD COLUMN "kind" TEXT;
