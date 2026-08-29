/* MKB-10 migratsiyasini `icd10Data.ts` dan generatsiya qiladi.
 *
 * Nima uchun generator: migratsiya SQL — yetkazish mexanizmi, tahrirlash
 * mexanizmi emas (migrations/README.md, 3-qoida). Ro'yxat esa o'sadi.
 * Shuning uchun manba TS da, SQL undan yasaladi.
 *
 * Ishlatish: cd backend && npx tsx scripts/genIcd10Migration.ts [nomer]
 */
import fs from 'fs';
import path from 'path';
import { ICD10_ROWS, findDuplicateCodes } from '../icd10Data';

const dupes = findDuplicateCodes();
if (dupes.length) {
    console.error(`Takroriy kodlar (code — birlamchi kalit): ${dupes.join(', ')}`);
    process.exit(1);
}

const num = process.argv[2] || '0030';
const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;

const values = ICD10_ROWS
    .map(r => `  (${q(r.code)}, ${q(r.uz)}, ${q(r.ru)}, ${q(r.cat)})`)
    .join(',\n');

const sql = `-- ${num} — MKB-10 spravochnigi. PLAN-180, S2.2.
--
-- Muammo: qidiruv endpointi (\`/api/icd10\`), indeks va interfeys joyida edi,
-- lekin \`ICD10Code\` jadvalida BOR-YO'G'I 1 TA QATOR bor edi. Ya'ni bu kod
-- bugi emas, ma'lumot bugi: qidiruv to'g'ri ishlab, har doim bo'sh natija
-- qaytarardi va qabulga tashxis umuman kiritib bo'lmasdi (audit B-02).
--
-- Bu yerda ${ICD10_ROWS.length} ta kod — to'liq MKB-10 emas (unda 14 mingdan
-- ortiq kod bor, katta qismi statsionar va statistika uchun), balki ko'p
-- profilli AMBULATOR klinikada haqiqatan yoziladigan tashxislar.
--
-- Manba: backend/icd10Data.ts. Bu fayl QO'LDA TAHRIRLANMAYDI —
-- \`npx tsx scripts/genIcd10Migration.ts\` bilan qayta yasaladi.
-- Yangi kod kerak bo'lsa: manbaga qo'shiladi va YANGI migratsiya yasaladi.

-- Ruscha nom uchun ustun. Qidiruv ikkala tilda ham ishlashi kerak:
-- shifokor "gipert" yozsa ham, "гиперт" yozsa ham topsin.
ALTER TABLE "ICD10Code" ADD COLUMN "nameRu" TEXT;

-- \`INSERT OR REPLACE\` — migratsiya bir marta yuriladi, lekin bazada
-- allaqachon bitta qator bor va u shu ro'yxatga tushishi mumkin.
INSERT OR REPLACE INTO "ICD10Code" ("code", "name", "nameRu", "category") VALUES
${values};

-- Nom bo'yicha qidiruv: \`LIKE '%...%'\` indeksdan foydalana olmaydi, lekin
-- jadval kichik (${ICD10_ROWS.length} qator) va to'liq skan ham tez. Kod
-- bo'yicha prefiks qidiruvi esa birlamchi kalitdan foydalanadi.
CREATE INDEX IF NOT EXISTS "ICD10Code_category_idx" ON "ICD10Code"("category");
`;

const out = path.resolve(__dirname, '..', 'migrations', `${num}_icd10_catalog.sql`);
fs.writeFileSync(out, sql, 'utf8');
console.log(`Yozildi: ${out}`);
console.log(`Kodlar: ${ICD10_ROWS.length}`);
const byCat = new Map<string, number>();
for (const r of ICD10_ROWS) byCat.set(r.cat, (byCat.get(r.cat) || 0) + 1);
for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`);
