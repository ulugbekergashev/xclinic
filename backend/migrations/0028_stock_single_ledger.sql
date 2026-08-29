-- 0028 — Ombor: yagona jurnal.
--
-- Muammo. Omborda ikki avlod hisobi yonma-yon yashardi:
--   yangi yo'l  — StockMovement + InventoryBatch (harakat yoziladi)
--   eski yo'l   — InventoryLog (PUT /api/inventory/:id/stock, bemor kartasi)
-- Eski yo'l partiyalarga tegmasdi va StockMovement yozmasdi, ya'ni
-- "qoldiq = harakatlar yig'indisi" invarianti u ishlatilganda buzilardi.
--
-- Bu migratsiya uch ish qiladi:
--   1) StockMovement ga `patientId` va `reversalOfId` ustunlarini qo'shadi;
--   2) InventoryLog ning HAR qatorini harakat qilib ko'chiradi;
--   3) har mahsulot uchun qolgan farqni "boshlang'ich qoldiq" harakati bilan
--      yopadi — shundan keyin item darajasidagi invariant HAM to'g'ri bo'ladi.
--
-- InventoryLog jadvali O'CHIRILMAYDI: ko'chirish to'g'ri o'tganini keyin ham
-- solishtirib ko'rish uchun qoladi. Unga endi hech kim YOZMAYDI.

-- ─── 1. Yangi ustunlar ────────────────────────────────────────────────────
-- Bemor kesimida material sarfi. Ilgari bu faqat InventoryLog da bor edi,
-- ya'ni yangi yo'lga o'tish uchun ustunning o'zi yetishmayotgan edi.
ALTER TABLE "StockMovement" ADD COLUMN "patientId" TEXT REFERENCES "Patient"("id");

-- Bekor qilingan chiqim. Harakat O'CHIRILMAYDI (jurnal o'chirilmaydi) —
-- uning o'rniga teskari harakat yoziladi va shu ustun orqali bog'lanadi.
ALTER TABLE "StockMovement" ADD COLUMN "reversalOfId" TEXT;

CREATE INDEX IF NOT EXISTS "StockMovement_patientId_idx" ON "StockMovement"("patientId");
CREATE INDEX IF NOT EXISTS "StockMovement_reversalOfId_idx" ON "StockMovement"("reversalOfId");

-- ─── 2. Eski jurnalni ko'chirish ──────────────────────────────────────────
-- `id` ataylab hosil qilinadi ('mig28-' + eski id): migratsiya takroran
-- ishlab ketsa PRIMARY KEY to'qnashuvi xato beradi — jimgina ikkilanishdan
-- ko'ra xato yaxshi. `change` allaqachon ishorali (OUT manfiy) edi.
--
-- reason = 'Legacy': bu qatorlar xizmat retseptidan chiqmagan, shuning uchun
-- ular xizmat tannarxiga (reports.ts, reason === 'Service') QO'SHILMASLIGI
-- kerak — aks holda eski sarflar bugungi tannarxga ikkinchi marta tushardi.
INSERT INTO "StockMovement" (
    "id", "clinicId", "itemId", "batchId", "type", "quantity", "reason",
    "visitId", "serviceId", "note", "userName", "createdAt", "patientId"
)
SELECT
    'mig28-' || il."id",
    it."clinicId",
    il."itemId",
    NULL,
    CASE WHEN il."change" < 0 THEN 'Out' ELSE 'In' END,
    il."change",
    'Legacy',
    NULL,
    NULL,
    TRIM(COALESCE(il."note", '') || ' · eski jurnaldan ko''chirildi (0028)'),
    COALESCE(il."userName", 'tizim'),
    il."date",
    il."patientId"
FROM "InventoryLog" il
JOIN "InventoryItem" it ON it."id" = il."itemId";

-- ─── 3. Boshlang'ich qoldiqlar ────────────────────────────────────────────
-- Mahsulot yaratilganda `quantity` to'g'ridan-to'g'ri yozilardi va bironta
-- harakat qatori yozilmasdi. Shuning uchun ko'chirishdan keyin ham
-- `quantity` va harakatlar yig'indisi orasida farq qoladi — o'sha farq shu
-- yerda bitta ochilish harakati bilan yopiladi.
--
-- 'Transfer' CHIQARIB TASHLANADI: u bo'lim ichidagi ko'chirish, musbat
-- yoziladi, lekin umumiy qoldiqni O'ZGARTIRMAYDI. Uni qo'shsak farq soxta
-- chiqardi.
--
-- Yordamchi jadval kerak: `INSERT INTO t SELECT ... FROM t` da SQLite ning
-- o'zi kiritayotgan qatorlarni ichki so'rov ko'rishi kafolatlanmagan.
CREATE TABLE "_mig0028_opening" AS
SELECT
    i."id"        AS "itemId",
    i."clinicId"  AS "clinicId",
    i."createdAt" AS "createdAt",
    i."quantity" - COALESCE((
        SELECT SUM(m."quantity") FROM "StockMovement" m
        WHERE m."itemId" = i."id" AND m."type" <> 'Transfer'
    ), 0) AS "diff"
FROM "InventoryItem" i;

INSERT INTO "StockMovement" (
    "id", "clinicId", "itemId", "batchId", "type", "quantity", "reason",
    "note", "userName", "createdAt"
)
SELECT
    'open28-' || o."itemId",
    o."clinicId",
    o."itemId",
    NULL,
    'Adjust',
    o."diff",
    'Inventory',
    'Boshlang''ich qoldiq (migratsiya 0028)',
    'tizim',
    o."createdAt"
FROM "_mig0028_opening" o
WHERE ABS(o."diff") > 0.0005;

DROP TABLE "_mig0028_opening";
