-- Tibbiy tarix (anamnez) — to'liq bo'limlar.
--
-- MUAMMO. Bemor kartasidagi «Tibbiy tarix» faqat ikki narsani bilardi:
-- allergiya (`PatientAllergy`) va kasalliklar (`Patient.medicalHistory`,
-- har satr — bitta yozuv). Doimiy ichadigan dori, operatsiyalar, oilaviy
-- kasalliklar, odatlar, qon guruhi, homiladorlik — hech qayerda saqlanmasdi.
-- «Yo'q» va «so'ralmagan» ham farqlanmasdi: bo'sh joy ikkalasini bildirardi.
--
-- YECHIM.
--   * `anamnesis` — qolgan bo'limlar va «yo'q» belgilari, bitta JSON matn.
--     Shakli `components/patient/anamnesisData.ts` da (`AnamnesisData`).
--     Bo'limlar qo'shilsa ustun qo'shilmaydi — JSON kengayadi.
--   * `anamnesisUpdatedAt`, `anamnesisUpdatedBy` — tibbiy tarixni oxirgi
--     marta kim va qachon o'zgartirgan (kasallik, allergiya yoki shu JSON).
--     Kartada sarlavha yonida chiqadi: shifokor eskirgan ma'lumotni ko'radi.
--
-- MA'LUMOTGA TA'SIRI: uchta NULL ustun. Mavjud kasallik va allergiya
-- yozuvlari o'z joyida qoladi.

ALTER TABLE "Patient" ADD COLUMN "anamnesis" TEXT;
ALTER TABLE "Patient" ADD COLUMN "anamnesisUpdatedAt" DATETIME;
ALTER TABLE "Patient" ADD COLUMN "anamnesisUpdatedBy" TEXT;
