/* E2E uchun server: baza NUSXASI + frontend build + backend.
 *
 * NIMA UCHUN NUSXA. Sinovlar bemor, qabul va to'lov yaratadi. Ular dev
 * bazada qolmasligi kerak — `backend/tests/run-api.ts` dagi bilan bir xil
 * qoida va bir xil usul (`VACUUM INTO`: baza WAL rejimida va oddiy
 * `copyFile` oxirgi yozuvlarni tashlab ketadi).
 *
 * NIMA UCHUN BUILD. Backend `dist/` ni statik beradi (`express.static`),
 * ya'ni bitta portda ham front, ham API. Bu Electron'dagi holatning
 * aynan o'zi (S1.3 dan keyin) — sinov haqiqiy sxemani tekshiradi,
 * dev-server o'ziga xosliklarini emas.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const backendDir = path.join(root, 'backend');

const PORT = Number(process.env.E2E_PORT || 3077);
const srcDb = path.join(backendDir, 'prisma', 'xclinic.db');

if (!fs.existsSync(srcDb)) {
    console.error(`Baza topilmadi: ${srcDb}`);
    process.exit(1);
}

/* Frontend build — `dist/index.html` bo'lmasa backend bo'sh sahifa beradi.
   Har safar qayta qurmaymiz: build 20-60 soniya, va odatda u allaqachon
   tayyor. `E2E_BUILD=1` bilan majburlash mumkin. */
const distIndex = path.join(root, 'dist', 'index.html');
if (process.env.E2E_BUILD === '1' || !fs.existsSync(distIndex)) {
    console.error('Frontend quriladi…');
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xclinic-e2e-'));
const dbPath = path.join(workDir, 'xclinic.db');

{
    /* `better-sqlite3` va `bcryptjs` BACKEND ning `node_modules` ida —
       ildizda ular yo'q. `createRequire` shu papkaga qaratiladi, aks
       holda ESM ularni topa olmaydi (native modul, CJS). */
    const require = createRequire(path.join(backendDir, 'package.json'));
    const Database = require('better-sqlite3');
    const bcrypt = require('bcryptjs');

    const src = new Database(srcDb, { readonly: true });
    try {
        src.prepare('VACUUM INTO ?').run(dbPath);
    } finally {
        src.close();
    }

    const db = new Database(dbPath);
    const hash = bcrypt.hashSync('testpass123', 10);
    db.prepare('UPDATE Clinic SET password = ?').run(hash);
    for (const table of ['Receptionist', 'Doctor', 'Nurse', 'LabTechnician']) {
        try { db.prepare(`UPDATE ${table} SET password = ?`).run(hash); } catch { /* jadval yo'q */ }
    }
    db.close();
}

const server = spawn(process.execPath, [
    path.join(backendDir, 'node_modules', 'ts-node', 'dist', 'bin.js'),
    '--transpile-only', path.join(backendDir, 'server.ts'),
], {
    cwd: backendDir,
    env: {
        ...process.env,
        ELECTRON_RUN: 'true',
        ELECTRON_USER_DATA_PATH: workDir,
        ELECTRON_BACKEND_PORT: String(PORT),
        PORT: String(PORT),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
});

/* TOZALASH — Windows'da jarayonlar DARAXTI bilan.
   `kill()` faqat `ts-node` ni o'ldiradi, uning Node bolasi bazani ochiq
   tutadi va papka o'chmaydi. Bu API sinovlarida 27 ta papka va ~200 MB
   yeb qo'ygan edi. */
const stop = () => {
    try {
        if (server.pid && process.platform === 'win32') {
            try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); }
            catch { /* allaqachon tugagan */ }
        } else {
            server.kill();
        }
    } catch { /* ignore */ }
    for (let i = 0; i < 10; i++) {
        try { fs.rmSync(workDir, { recursive: true, force: true }); return; }
        catch { try { execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},200)']); } catch { /* ignore */ } }
    }
};

process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('SIGTERM', () => { stop(); process.exit(0); });
process.on('exit', stop);

server.on('exit', (code) => {
    stop();
    process.exit(code ?? 0);
});
