/* DASTUR IKONKASI — `build/icon.ico`.
 *
 * NIMA UCHUN. `electron-builder` ikonkani `build/icon.ico` dan oladi.
 * Fayl bo'lmasa u OGOHLANTIRISH yozib, standart Electron belgisini
 * qo'yadi — ya'ni sotiladigan dastur boshqa birovning logosi bilan
 * o'rnatiladi. Xato emas, shuning uchun payqamay qolish oson.
 *
 * Manba: `public/logo.svg` — dastur ichidagi logo (`components/Logo.tsx`)
 * bilan bir xil shakl. Undan ikkita fayl yasaladi:
 *   · `public/logo-icon.png` — PWA (telefonga o'rnatish) va favikon;
 *   · `build/icon.ico` — Windows ikonkasi, bir necha o'lchamda.
 *
 * 2026-09-16 gacha manba PNG edi va unda denta7 dan qolgan TISH rasmi
 * turardi — XClinic ish stolida tish belgisi bilan o'rnatilardi.
 *
 * Ishga tushirish: node scripts/makeIcon.mjs
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const src = path.resolve('public/logo.svg');
const png = path.resolve('public/logo-icon.png');
const out = path.resolve('build/icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

if (!fs.existsSync(src)) {
    console.error('❌ Manba topilmadi:', src);
    process.exit(1);
}

// SVG ni katta zichlikda o'qiymiz — kichik o'lchamlar ham tiniq chiqadi.
const master = await sharp(src, { density: 1536 }).resize(512, 512).png().toBuffer();
fs.writeFileSync(png, master);

const buffers = [];
for (const size of SIZES) {
    buffers.push(await sharp(master).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer());
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await pngToIco(buffers));
console.log(`✅ ${path.relative(process.cwd(), out)} (${SIZES.join(', ')} px, ${Math.round(fs.statSync(out).size / 1024)} KB)`);
