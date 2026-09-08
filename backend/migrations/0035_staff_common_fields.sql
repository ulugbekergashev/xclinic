-- Xodimning UMUMIY maydonlari — hamma to'rt rolda.
--
-- MUAMMO. To'rtta xodim jadvali bir-biridan tasodifan farq qiladi:
--
--   Doctor        — bo'lim, kabinet, ish soatlari, foiz, maosh, rang;
--   Receptionist  — faqat ism, telefon, login. Bo'lim ham, kabinet ham,
--                   ish soati ham yo'q;
--   LabTechnician — mutaxassislik bor, bo'lim yo'q;
--   Nurse         — bo'lim bor, kabinet va soat yo'q.
--
-- Farq mantiqiy emas, o'sish tartibi shunday chiqqan: har rol o'z
-- vaqtida, o'z ehtiyoji bilan qo'shilgan. Oqibati kundalik:
--
--   * registratura kimning qaysi bo'limda ekanini yozib qo'ya olmaydi,
--     ya'ni ko'p profilli klinikada «bu odam qayerda ishlaydi» degan
--     savolga baza javob bermaydi;
--   * laborant kabinet raqamini ko'rsata olmaydi — bemorga «qaysi
--     xonaga borish» kerakligini og'zaki aytish kerak;
--   * ish soatlari faqat shifokorda, ya'ni jadval boshqa rollar uchun
--     klinikaning umumiy soatidan olinadi.
--
-- YECHIM. Bir xil ma'noli maydonlar hamma jadvalda bir xil ataladi.
-- Jadvallar BIRLASHTIRILMAYDI: ularga tizimga kirish va qabullar,
-- yozuvlar, tahlillar bilan bog'lam osilgan. Birlashadigan narsa —
-- EKRAN, sxema keyin.

ALTER TABLE "Receptionist" ADD COLUMN "departmentId" TEXT REFERENCES "Department"("id");
ALTER TABLE "Receptionist" ADD COLUMN "room" TEXT;
ALTER TABLE "Receptionist" ADD COLUMN "startHour" INTEGER;
ALTER TABLE "Receptionist" ADD COLUMN "endHour" INTEGER;
CREATE INDEX "Receptionist_departmentId_idx" ON "Receptionist"("departmentId");

ALTER TABLE "LabTechnician" ADD COLUMN "departmentId" TEXT REFERENCES "Department"("id");
ALTER TABLE "LabTechnician" ADD COLUMN "room" TEXT;
ALTER TABLE "LabTechnician" ADD COLUMN "startHour" INTEGER;
ALTER TABLE "LabTechnician" ADD COLUMN "endHour" INTEGER;
CREATE INDEX "LabTechnician_departmentId_idx" ON "LabTechnician"("departmentId");

ALTER TABLE "Nurse" ADD COLUMN "room" TEXT;
ALTER TABLE "Nurse" ADD COLUMN "startHour" INTEGER;
ALTER TABLE "Nurse" ADD COLUMN "endHour" INTEGER;

-- Hamshira ham mutaxassislikka ega bo'ladi (palata, operatsiya, protsedura).
-- Qolgan uch rolda u allaqachon bor yoki kerak emas.
ALTER TABLE "Nurse" ADD COLUMN "specialty" TEXT;
