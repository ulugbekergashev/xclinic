-- Qabul yakuni va bayonni qulflash.
--
-- `disposition` — qabul NIMA bilan tugadi: bemor uyga ketdimi, takroriy
-- qabulga chaqirildimi, statsionarga yotqizildimi. Hozir bu ma'lumot hech
-- qayerda yo'q, `status` faqat "Completed" deydi va nima bo'lganini aytmaydi.
-- OpenMRS da bu alohida tushuncha (disposition).
--
-- `lockedAt` / `lockedByName` — yakunlangan qabulning bayoni o'zgartirilmasligi
-- uchun. Hozir `PUT /api/visits/:id` har qanday holatdagi qabulni tahrirlaydi,
-- ya'ni oylar oldingi bayonni jimgina qayta yozish mumkin.

ALTER TABLE "Visit" ADD COLUMN "disposition"  TEXT;
ALTER TABLE "Visit" ADD COLUMN "lockedAt"     DATETIME;
ALTER TABLE "Visit" ADD COLUMN "lockedByName" TEXT;
