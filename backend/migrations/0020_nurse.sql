-- HAMSHIRA roli (qaror В17).
--
-- Nima uchun. Dorini shifokor emas, hamshira beradi. Hozir tizimda bunday
-- rol yo'q, ya'ni dori berilganini yozish uchun shifokor logini bilan
-- kirish kerak bo'lardi — jurnalda esa "shifokor berdi" deb qolardi.
-- Bu tibbiy hujjat uchun yolg'on yozuv.
--
-- Tuzilishi laborant (`LabTechnician`) bilan bir xil: shu qolipda login,
-- parol va rol tekshiruvi allaqachon ishlaydi.
--
-- `departmentId` — hamshira bo'limga biriktiriladi: kunlik dori ro'yxati
-- "mening bo'limim" bo'yicha ochiladi.

CREATE TABLE "Nurse" (
    "id"           TEXT PRIMARY KEY NOT NULL,
    "firstName"    TEXT NOT NULL,
    "lastName"     TEXT NOT NULL,
    "phone"        TEXT,
    "status"       TEXT NOT NULL DEFAULT 'Active',
    "clinicId"     TEXT NOT NULL REFERENCES "Clinic"("id"),
    "departmentId" TEXT REFERENCES "Department"("id"),
    "username"     TEXT,
    "password"     TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Login klinikalar orasida ham takrorlanmaydi: kirish oynasi bitta.
-- NULL qiymatlar SQLite da unikal indeksga xalaqit bermaydi — loginsiz
-- hamshira ham bo'lishi mumkin (faqat ro'yxatda turadi).
CREATE UNIQUE INDEX "Nurse_username_key" ON "Nurse"("username");
CREATE INDEX "Nurse_clinicId_idx"     ON "Nurse"("clinicId");
CREATE INDEX "Nurse_departmentId_idx" ON "Nurse"("departmentId");
