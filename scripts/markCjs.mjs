/* Build natijasi papkalariga «bu yerdagi .js — CommonJS» belgisini qo'yadi.
 *
 * ── Muammo ────────────────────────────────────────────────────────────────
 * Ildizdagi `package.json` da `"type": "module"` turibdi (frontend Vite bilan
 * ESM da yozilgan). electron-builder o'sha faylni `app.asar` ichiga ham
 * ko'chiradi. Node esa modul turini FAYLGA ENG YAQIN `package.json` bo'yicha
 * aniqlaydi — ya'ni asar ichidagi har bir `.js` ES modul deb o'qiladi.
 *
 * Lekin `electron-main/*.js` ni TypeScript CommonJS qilib chiqaradi
 * (`tsconfig.electron.json` → `"module": "CommonJS"`), backend bundle'ini esa
 * ncc shunday yig'adi. Natijada paketlangan ilova ishga tushishda yiqiladi:
 *
 *     ReferenceError: exports is not defined in ES module scope
 *
 * ── Yechim ────────────────────────────────────────────────────────────────
 * Har bir chiqish papkasiga o'zining `package.json` i qo'yiladi. Node yuqoriga
 * chiqmasdan shuni topadi va papkadagi `.js` fayllarni CommonJS deb o'qiydi.
 * Ildizdagi `"type": "module"` frontend uchun avvalgidek qoladi.
 *
 * Nima uchun fayl qo'lda yozilmagan: ikkala papka ham `.gitignore` da —
 * ular build natijasi. Repozitoriyada turmagani uchun har qurishda qayta
 * yaratilishi kerak, aks holda toza klondan qurilgan paket yana yiqiladi.
 */
import fs from 'node:fs';
import path from 'node:path';

const TARGETS = process.argv.slice(2);

if (TARGETS.length === 0) {
    console.error('markCjs: papka ko\'rsatilmadi');
    process.exit(1);
}

for (const dir of TARGETS) {
    if (!fs.existsSync(dir)) {
        console.error(`markCjs: «${dir}» topilmadi — avval build bosqichi bajarilishi kerak`);
        process.exit(1);
    }

    const file = path.join(dir, 'package.json');
    fs.writeFileSync(file, JSON.stringify({
        name: `xclinic-${path.basename(dir)}`,
        version: '0.0.0',
        private: true,
        type: 'commonjs',
    }, null, 2) + '\n');

    console.log(`markCjs: ${file} yozildi (type: commonjs)`);
}
