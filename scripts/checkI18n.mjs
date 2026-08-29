/* Tarjima kalitlarini tekshiradi (S4.1).
 *
 * Uch narsani qidiradi:
 *   1. Bir tilda bor, ikkinchisida yo'q kalitlar;
 *   2. Bitta blok ichida TAKRORLANGAN kalitlar — JavaScript oxirgisini
 *      oladi, ya'ni oldingi tarjima jimgina yo'qoladi;
 *   3. Tarjimasi bo'sh kalitlar.
 *
 * ⚠️ IKKALA TIRNOQ TURI. Fayldagi kalitlarning bir qismi bitta tirnoq,
 * bir qismi qo'sh tirnoq bilan yozilgan. Faqat bittasini qidiradigan
 * tekshiruv 850 kalitdan 668 tasini ko'radi va mavjud kalitni «yo'q» deb
 * hisoblaydi — bu haqiqatan sodir bo'lgan va 24 ta takror kalit
 * qo'shilishiga olib kelgan. Shuning uchun regex ikkalasini ham oladi.
 *
 * Ishga tushirish: node scripts/checkI18n.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'i18n', 'translations.ts');

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const blockStart = (lang) => lines.findIndex((l) => new RegExp(`^\\s{2}${lang}:\\s*\\{`).test(l));

const uzStart = blockStart('uz');
const ruStart = blockStart('ru');
if (uzStart < 0 || ruStart < 0) {
    console.error("uz yoki ru bloki topilmadi — fayl tuzilishi o'zgargan?");
    process.exit(1);
}

/** Kalit va qiymat — ikkala tirnoq turi bilan. */
const KEY = /^\s*['"]([^'"]+)['"]\s*:\s*(.*?),?\s*$/;

function parse(slice) {
    const entries = [];
    for (const l of slice) {
        const m = KEY.exec(l);
        if (m) entries.push([m[1], m[2]]);
    }
    return entries;
}

const uz = parse(lines.slice(uzStart, ruStart));
const ru = parse(lines.slice(ruStart));

const problems = [];

// 1. Yetishmayotgan kalitlar
const uzKeys = new Set(uz.map((e) => e[0]));
const ruKeys = new Set(ru.map((e) => e[0]));
const missingRu = [...uzKeys].filter((k) => !ruKeys.has(k));
const missingUz = [...ruKeys].filter((k) => !uzKeys.has(k));
if (missingRu.length) problems.push(`RU da yo'q (${missingRu.length}): ${missingRu.slice(0, 10).join(', ')}${missingRu.length > 10 ? '…' : ''}`);
if (missingUz.length) problems.push(`UZ da yo'q (${missingUz.length}): ${missingUz.slice(0, 10).join(', ')}${missingUz.length > 10 ? '…' : ''}`);

// 2. Takrorlar
function dupes(entries, lang) {
    const seen = new Map();
    const out = [];
    for (const [k] of entries) {
        seen.set(k, (seen.get(k) || 0) + 1);
    }
    for (const [k, n] of seen) if (n > 1) out.push(k);
    if (out.length) problems.push(`${lang} da takror (${out.length}): ${out.slice(0, 10).join(', ')}${out.length > 10 ? '…' : ''}`);
}
dupes(uz, 'UZ');
dupes(ru, 'RU');

// 3. Bo'sh qiymatlar
for (const [lang, entries] of [['UZ', uz], ['RU', ru]]) {
    const empty = entries.filter(([, v]) => /^(''|""|``)$/.test(String(v).trim())).map(([k]) => k);
    if (empty.length) problems.push(`${lang} da bo'sh tarjima (${empty.length}): ${empty.slice(0, 10).join(', ')}`);
}

if (problems.length) {
    console.error("❌ Tarjimalarda muammo:\n");
    for (const p of problems) console.error('  • ' + p);
    console.error(`\n  UZ: ${uzKeys.size} kalit, RU: ${ruKeys.size} kalit`);
    process.exit(1);
}

console.log(`✅ Tarjimalar toza — UZ va RU da ${uzKeys.size} tadan kalit, takror va bo'sh qiymat yo'q`);
