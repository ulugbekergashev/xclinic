/* Boshlang'ich bazani paket katalogiga ko'chirish.
 *
 * Electron paketlangan nusxada uni `backend/dist-bundle/starter.db`
 * dan qidiradi (`electron/main.ts`). `prisma/` katalogi paketga
 * kirmaydi, shuning uchun fayl shu yerga ko'chiriladi.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'prisma', 'starter.db');
const dstDir = path.join(__dirname, '..', 'dist-bundle');
const dst = path.join(dstDir, 'starter.db');

if (!fs.existsSync(src)) {
    console.error('❌ starter.db topilmadi:', src);
    console.error('   Avval: npx ts-node --transpile-only scripts/makeStarterDb.ts');
    process.exit(1);
}
if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
fs.copyFileSync(src, dst);
console.log(`✅ starter.db -> dist-bundle (${Math.round(fs.statSync(dst).size / 1024)} KB)`);

/* ── MIGRATSIYALAR ────────────────────────────────────────────────────────
   Server ularni `__dirname/migrations` dan qidiradi (`server.ts`), ya'ni
   ncc to'plami YONIDAN. Ular ko'chirilmasa paketlangan nusxa jurnalga
   «0 migratsiya mavjud deb belgilandi» deb yozadi va davom etadi —
   xato bermaydi.

   Oqibati keyingi versiyada chiqadi: yangi migratsiya (masalan ustun
   qo'shish) hech qachon qo'llanmaydi va dastur «no such column» bilan
   yiqiladi. Ya'ni bugun sezilmaydigan, yangilanishda portlaydigan xato. */
const migSrc = path.join(__dirname, '..', 'migrations');
const migDst = path.join(dstDir, 'migrations');

if (!fs.existsSync(migSrc)) {
    console.error('❌ migrations katalogi topilmadi:', migSrc);
    process.exit(1);
}
fs.rmSync(migDst, { recursive: true, force: true });
fs.mkdirSync(migDst, { recursive: true });

let n = 0;
for (const f of fs.readdirSync(migSrc)) {
    if (!f.endsWith('.sql')) continue;
    fs.copyFileSync(path.join(migSrc, f), path.join(migDst, f));
    n++;
}
if (n === 0) {
    console.error("❌ Bironta ham .sql migratsiya ko'chirilmadi");
    process.exit(1);
}
console.log(`✅ migrations -> dist-bundle (${n} ta fayl)`);
