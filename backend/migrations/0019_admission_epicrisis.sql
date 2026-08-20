-- Chiqarish epikrizining TO'RT qismi.
--
-- Nima uchun. Hozir chiqarishda bitta erkin matn bor:
-- `Admission.dischargeSummary`. Rasmiy chiqarish qog'ozida esa alohida
-- bo'limlar bo'lishi kerak: kirishdagi tashxis, yakuniy tashxis,
-- o'tkazilgan davolash, tavsiyalar. Bitta matnda ular aralashib ketadi va
-- bosma blankni tuzib bo'lmaydi.
--
-- `dischargeSummary` OLIB TASHLANMAYDI: eski yotishlarning matni joyida
-- qoladi va ekranda avvalgidek ko'rsatiladi. Yangi maydonlar bo'sh bo'lsa,
-- blank eski matndan foydalanadi.
--
-- MA'LUMOTGA TA'SIRI: to'rt NULL ustun, mavjud yozuvlar o'zgarmaydi.

ALTER TABLE "Admission" ADD COLUMN "admissionDiagnosis" TEXT;
ALTER TABLE "Admission" ADD COLUMN "finalDiagnosis"     TEXT;
ALTER TABLE "Admission" ADD COLUMN "treatmentGiven"     TEXT;
ALTER TABLE "Admission" ADD COLUMN "recommendations"    TEXT;
