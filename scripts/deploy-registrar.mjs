/* ─────────────────────────────────────────────────────────────────────────────
   Tunnel registratorini Vercel'ga joylash.

   NIMA UCHUN ALOHIDA LOYIHA. Registrator demo sayt (`xclinic-alpha`) bilan
   bir joyda bo'lishi shart emas va bo'lmagani yaxshi: uning muhit
   o'zgaruvchilarida Cloudflare tokeni turadi, demo sayt esa har push'da
   qayta quriladi va boshqa odamlar ham unga tegishi mumkin. Alohida kichik
   loyihada faqat bitta funksiya bor.

   MANBA BITTA — `api/tunnel-register.ts`. Skript uni vaqtinchalik papkaga
   ko'chiradi va o'sha papkani joylaydi; nusxa repoda saqlanmaydi.

   Ishga tushirish:
     node scripts/deploy-registrar.mjs --scope <vercel-jamoa>

   Birinchi marta Vercel `xclinic-registrar` nomli loyiha yaratadi,
   keyingilarida o'shani yangilaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const scopeIdx = args.indexOf('--scope');
const scope = scopeIdx >= 0 ? args[scopeIdx + 1] : '';

/* Papka nomi O'ZGARMAS: Vercel loyihani papka nomi bo'yicha topadi. Tasodifiy
   nom har joylashda yangi loyiha yaratib yuborardi. */
const dir = path.join(os.tmpdir(), 'xclinic-registrar');
fs.mkdirSync(path.join(dir, 'api'), { recursive: true });

fs.copyFileSync(path.join(root, 'api', 'tunnel-register.ts'), path.join(dir, 'api', 'tunnel-register.ts'));
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'xclinic-registrar',
    private: true,
    type: 'module',
}, null, 2));
fs.writeFileSync(path.join(dir, 'vercel.json'), JSON.stringify({
    $schema: 'https://openapi.vercel.sh/vercel.json',
    functions: { 'api/tunnel-register.ts': { maxDuration: 30 } },
}, null, 2));

const cmd = ['deploy', '--prod', '--yes', ...(scope ? ['--scope', scope] : [])];
console.log(`📦 ${dir}\n▶ vercel ${cmd.join(' ')}`);
const r = spawnSync('vercel', cmd, { cwd: dir, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
