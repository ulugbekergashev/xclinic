/* NAMOYISH NUSXASI uchun server: backend YO'Q, faqat statik fayllar.
 *
 * NIMA UCHUN ALOHIDA. `e2e/server.mjs` haqiqiy backendni ko'taradi va
 * bazaning nusxasi bilan ishlaydi — klinikaga o'rnatiladigan holat.
 * Vercelga chiqadigan nusxa esa BUTUNLAY boshqacha: serveri yo'q, hamma
 * ma'lumot brauzerda, kirish sahifasi ko'rsatilmaydi. Ya'ni u alohida
 * mahsulot va alohida sinаlishi kerak.
 *
 * Buning bahosi allaqachon to'langan: demo nusxada o'ttiz bitta yozish amali
 * «Demo rejimda saqlab bo'lmaydi» xatosini berardi va havola bo'yicha
 * to'g'ridan-to'g'ri sahifaga kirib bo'lmasdi — backendli sinovlarning
 * HAMMASI o'sha paytda yashil edi.
 *
 * Ishga tushirish:  npm run test:e2e:demo
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist-demo');
const PORT = Number(process.env.DEMO_E2E_PORT || 4180);

/* Demo bundle ODATDAGIDAN boshqacha: `VITE_DEMO_BUILD=true` bo'lmasa
   avtomatik kirish yoqilmaydi va sinovlar kirish sahifasida qotib qoladi.
   Shuning uchun u alohida papkaga quriladi va `dist/` ga tegilmaydi. */
if (process.env.DEMO_E2E_BUILD === '1' || !fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('Namoyish nusxasi quriladi…');
    execFileSync('npx', ['vite', 'build', '--outDir', 'dist-demo'], {
        cwd: root, stdio: 'inherit', shell: true,
        env: { ...process.env, VITE_DEMO_BUILD: 'true' },
    });
}

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
    const rel = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(dist, rel);
    /* SPA: mavjud bo'lmagan yo'l `index.html` ga tushadi — Vercel ham
       shunday qiladi, aks holda `#/inventory` havolasi 404 berardi. */
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(dist, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
});

server.listen(PORT, () => console.error(`Namoyish nusxasi: http://localhost:${PORT}`));
