-- Dori BERILGANINING fakti.
--
-- Nima uchun. `MedicationOrder` — bu TAYINLASH: "Ceftriaxone 1g, kuniga 2
-- marta". Berilgani haqida tizimda hech narsa yo'q (B47, B48, B49). Ya'ni:
--   - hamshira nimani berganini yozadigan joy yo'q;
--   - dori omborda "qolgan" bo'lib turadi, aslida ishlatilgan;
--   - bemor hisobida berilgan dori ko'rinmaydi.
--
-- `admissionId` — `orderId` orqali ham topiladi, lekin bo'lim bo'yicha
-- kunlik ro'yxat ("bugun 3-bo'limda kimga nima berilishi kerak") uchun
-- to'g'ridan-to'g'ri kalit kerak, aks holda har safar JOIN.
--
-- `status = Skipped | Refused` — berilmagani ham FAKT: bemor rad etdi yoki
-- hamshira o'tkazib yubordi. "Yozuv yo'q" bilan "berilmadi" bir xil emas.

CREATE TABLE "MedicationAdministration" (
    "id"          TEXT PRIMARY KEY NOT NULL,
    "clinicId"    TEXT NOT NULL REFERENCES "Clinic"("id"),
    "orderId"     TEXT NOT NULL REFERENCES "MedicationOrder"("id"),
    "admissionId" TEXT NOT NULL REFERENCES "Admission"("id"),
    "givenAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "givenByName" TEXT,
    "dose"        TEXT,
    -- Given | Skipped | Refused
    "status"      TEXT NOT NULL DEFAULT 'Given',
    "skipReason"  TEXT,
    "chargeId"    TEXT REFERENCES "VisitCharge"("id"),
    "note"        TEXT
);

CREATE INDEX "MedicationAdministration_orderId_idx" ON "MedicationAdministration"("orderId");
CREATE INDEX "MedicationAdministration_admissionId_givenAt_idx"
    ON "MedicationAdministration"("admissionId", "givenAt");
CREATE INDEX "MedicationAdministration_clinicId_idx" ON "MedicationAdministration"("clinicId");
