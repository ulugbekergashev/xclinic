-- Hisob qatorini STATSIONAR yotishiga bog'lash.
--
-- Nima uchun. `VisitCharge` faqat `visitId` ga bog'lanadi, statsionarda esa
-- qabul yo'q: bemor 8 kun yotadi, koyka haqi, dorilar va muolajalar
-- yoziladi, lekin hammasi "visitId = null" bo'lib qoladi. Natijada
-- "bu yotishga qancha chiqdi" degan savolga javob yo'q (B7.1).
--
-- MA'LUMOTGA TA'SIRI: bitta NULL ustun. Mavjud qatorlar o'zgarmaydi,
-- ular qabulga bog'langan holda qoladi.

ALTER TABLE "VisitCharge" ADD COLUMN "admissionId" TEXT REFERENCES "Admission"("id");

CREATE INDEX "VisitCharge_admissionId_idx" ON "VisitCharge"("admissionId");
