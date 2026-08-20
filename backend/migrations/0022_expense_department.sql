-- Xarajatni BO'LIMGA bog'lash.
--
-- Nima uchun. "Qaysi bo'lim qancha keltirdi" degan savolga javob berish
-- uchun daromad ham, XARAJAT ham bo'lim kesimida bo'lishi kerak. Hozir
-- xarajatda faqat kategoriya bor: "Ijara 5 mln" — lekin bu ijara
-- laboratoriyaning-mi yoki statsionarning-mi, bilinmaydi (B84).
--
-- NULL qoladigan xarajatlar ("umumiy") hisobotda alohida qatorda ko'rinadi:
-- ularni bo'limlarga majburan taqsimlash — soxta aniqlik.
--
-- MA'LUMOTGA TA'SIRI: bitta NULL ustun, mavjud xarajatlar o'zgarmaydi.

ALTER TABLE "Expense" ADD COLUMN "departmentId" TEXT REFERENCES "Department"("id");

CREATE INDEX "Expense_departmentId_idx" ON "Expense"("departmentId");
