-- Litsenziya kaliti klinika yozuvida saqlanadi.
--
-- NIMA UCHUN. XClinic bir marta sotiladi va nusxadan himoyalanishi kerak.
-- Kalit mashina identifikatoridan hisoblanadi (`backend/licenseService.ts`),
-- shuning uchun boshqa kompyuterga ko'chirilgan nusxa ishlamaydi.
--
-- Maydon ATAYLAB NULL bo'lishi mumkin: dastur birinchi marta ochilganda
-- klinika hali yaratilmagan bo'ladi, va aktivatsiyadan oldingi holat ham
-- shu bilan ifodalanadi.
--
-- Obuna maydonlari (`planId`, `expiryDate`, `subscriptionType`) sxemada
-- qoladi — SQLite da ustunni qayta yozish ishlab turgan bazalar uchun
-- xavfli. Ular doimiy «umrbod» qiymat bilan to'ldiriladi va hech qayerda
-- tekshirilmaydi: XClinic da tarif ham, muddat ham yo'q.

ALTER TABLE "Clinic" ADD COLUMN "licenseKey" TEXT;
