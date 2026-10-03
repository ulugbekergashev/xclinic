-- Qabulda KABINETGA KIRGAN vaqt.
--
-- MUAMMO. Qabulning to'rtta vaqti bor edi: kelgan (`checkInTime`),
-- chaqirilgan (`calledAt`), natija kutayotgan (`awaitingSince`) va chiqqan
-- (`checkOutTime`). Bemor shifokor oldiga QACHON kirgani esa hech qayerda
-- yozilmasdi — holat «In Progress» ga o'tardi, vaqti saqlanmasdi.
--
-- Oqibati: «Bugun klinikada» xaritasida kabinetdagi bemor necha daqiqadan
-- beri qabulda ekanini ko'rsatib bo'lmaydi, navbatdagilar qancha kutishini
-- ham taxmin qilib bo'lmaydi. `calledAt` o'rnini bosmaydi: bemor chaqirilmay
-- kirishi mumkin, chaqirilgandan keyin esa besh daqiqa yo'lda yurishi mumkin.
--
-- YECHIM. `startedAt` — holat «In Progress» ga O'TGAN payt. Navbatga
-- qaytarilsa tozalanadi (`backend/multiprofile.ts`, `PUT /api/visits/:id`).
--
-- MA'LUMOTGA TA'SIRI: bitta NULL ustun. Hozir qabulda turganlarga taxminiy
-- qiymat qo'yiladi (chaqirilgan, bo'lmasa kelgan vaqt) — aks holda yangilangan
-- kuni xarita ularni «0 daqiqa» deb ko'rsatardi. Yopilgan qabullar o'zgarmaydi.

ALTER TABLE "Visit" ADD COLUMN "startedAt" DATETIME;

UPDATE "Visit"
SET "startedAt" = COALESCE("calledAt", "checkInTime")
WHERE "status" = 'In Progress' AND "startedAt" IS NULL;
