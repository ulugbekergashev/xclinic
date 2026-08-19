-- Bitta bemorni bir kunda IKKI shifokorga yozish imkoni.
--
-- Nima uchun. `Appointment` da `@@unique([patientId, date])` cheklovi bor edi:
-- bemor bir kunda faqat BITTA yozuvga ega bo'la olardi. Stomatologiyada bu
-- bezarar edi (bitta o'z shifokori), ko'p profilli klinikada esa oddiy kun:
-- ertalab terapevt, tushdan keyin UZI. Cheklov shu ishni imkonsiz qilardi.
--
-- Texnik tomoni. Cheklov oddiy UNIQUE INDEX ko'rinishida — ya'ni jadval
-- QAYTA YARATILMAYDI, ma'lumot ko'chirilmaydi, amal bir zumda bajariladi.
--
-- QAYTARILMAYDI. Indeksni darhol tiklash mumkin, LEKIN klinika bir bemorni bir
-- kunda ikki shifokorga yozgan zahoti SQLite uni qayta yaratishdan bosh
-- tortadi. Shundan keyin yagona qaytish yo'li — zaxira nusxadan tiklash.
-- Shu sababli bu migratsiyadan oldin nusxa olingan (Б1.2).
--
-- Prisma tomonida `@@unique` sxemadan olib tashlandi, `unique_patient_date`
-- kaliti bilan mijoz API si ham yo'qoladi — u kodda hech qayerda
-- ishlatilmagan (tekshirilgan).

DROP INDEX IF EXISTS "Appointment_patientId_date_key";
