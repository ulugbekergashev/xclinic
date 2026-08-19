-- "Natija tayyor, lekin shifokor ko'rmagan" belgisi.
--
-- Nima uchun. Bemor tahlilga ketganda qabul `AwaitingResults` holatiga o'tadi
-- va navbatdan chiqadi — to'g'ri. Lekin natija KELGANDA shifokorga hech narsa
-- xabar bermaydi: u har qabulni qo'lda ochib tekshirishi kerak. Navbat ekranida
-- ham "tayyor" va "hali kutilmoqda" bir xil ko'rinadi.
--
-- NULL = ko'rilmagan. Shifokor ochganda vaqt yoziladi va belgi o'chadi.

ALTER TABLE "LabOrder"        ADD COLUMN "seenByDoctorAt" DATETIME;
ALTER TABLE "DiagnosticStudy" ADD COLUMN "seenByDoctorAt" DATETIME;
