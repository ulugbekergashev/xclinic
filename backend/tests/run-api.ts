/* ─────────────────────────────────────────────────────────────────────────────
   API sinovlarini yurituvchi.

   Nima qiladi: bazaning ALOHIDA nusxasini yasaydi, unga sinov paroli qo'yadi,
   serverni bo'sh portda ko'taradi, hamma sinovni ketma-ket yuritadi va
   oxirida hammasini tozalaydi.

   NIMA UCHUN ALOHIDA NUSXA. Sinovlar bemor, to'lov va qator yaratadi, biri
   esa ataylab ma'lumot buzadi (`integrity`). Ular ishlab turgan bazada
   yuritilmasligi kerak — hatto dev bazada ham.

   TARTIB MUHIM: `integrity` OXIRIDA. U `paidAmount`, partiya qoldig'i va
   balansni ataylab buzadi va faqat balansni tuzatadi — undan keyin yuritilgan
   sinov "buzilish bor" deb yiqiladi. Bu bir marta sodir bo'lgan va yarim soat
   yo'qotgan.

   Ishga tushirish:  cd backend && npm run test:api
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess, execFileSync } from 'child_process';

const PORT = Number(process.env.T_PORT || 3079);
const BASE = `http://localhost:${PORT}`;

/* Tartib qat'iy: integrity oxirida (yuqoridagi sababga ko'ra),
   auth va restore esa alohida shart talab qiladi — pastda. */
const SUITES = ['permissions', 'consistency', 'icd10', 'attendance', 'license', 'templates', 'scheduling', 'staff', 'expiry', 'validation', 'visitclose', 'payments', 'moneybugs', 'stock', 'patients', 'events', 'money', 'integrity'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Bazadan IZCHIL nusxa. `copyFileSync` YARAMAYDI: baza WAL rejimida
   (`journal_mode=wal`, FIX-PLAN 7.0) va oxirgi yozuvlar hali `.db` fayliga
   ko'chirilmagan bo'lishi mumkin — ular `.db-wal` da yotadi. Ya'ni oddiy
   nusxa jimgina ESKI holatni beradi va sinov nimani tekshirayotganini
   bilmay qoladi.

   `VACUUM INTO` — zaxira nusxa moduli ishlatadigan usulning aynan o'zi:
   ochiq baza ustida ham izchil snapshot beradi. */
function snapshotDb(srcDb: string, dest: string) {
    const Database = require('better-sqlite3');
    const src = new Database(srcDb, { readonly: true });
    try {
        src.prepare('VACUUM INTO ?').run(dest);
    } finally {
        src.close();
    }
}


async function waitHealthy(timeoutMs = 60000): Promise<boolean> {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        try {
            const r = await fetch(`${BASE}/health`);
            if (r.ok) return true;
        } catch { /* hali ko'tarilmagan */ }
        await sleep(500);
    }
    return false;
}

async function main() {
    const backendDir = path.resolve(__dirname, '..');
    const srcDb = path.join(backendDir, 'prisma', 'xclinic.db');
    if (!fs.existsSync(srcDb)) {
        console.error(`Baza topilmadi: ${srcDb}`);
        console.error('Avval `npx prisma db push` bajaring.');
        process.exit(1);
    }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xclinic-apitest-'));
    const dbPath = path.join(workDir, 'xclinic.db');
    snapshotDb(srcDb, dbPath);

    // Sinov paroli
    const Database = require('better-sqlite3');
    const bcrypt = require('bcryptjs');
    const db = new Database(dbPath);
    const hash = bcrypt.hashSync('testpass123', 10);
    db.prepare('UPDATE Clinic SET password = ?').run(hash);
    /* Xodim parollari ham qo'yiladi: `permissions` sinovi registrator,
       shifokor va hamshira nomidan kirib, ularga TAQIQLANGAN amallar
       haqiqatan 403 qaytarishini tekshiradi. Faqat egadan sinash
       cheklovni umuman isbotlamaydi — ega hamma narsaga haqli. */
    for (const table of ['Receptionist', 'Doctor', 'Nurse', 'LabTechnician']) {
        try { db.prepare(`UPDATE ${table} SET password = ?`).run(hash); } catch { /* jadval yo'q */ }
    }
    db.close();

    console.log(`\nBaza nusxasi : ${dbPath}`);
    console.log(`Server porti : ${PORT}\n`);

    let server: ChildProcess | null = null;
    let failed = 0;
    const results: [string, string][] = [];

    /* TOZALASH — Windows'da JARAYONLAR DARAXTI bilan.

       Ilgari bu yerda `server?.kill()` turardi. Windows'da u faqat
       `ts-node` ni o'ldiradi, u ko'targan Node bola jarayoni esa TIRIK
       qoladi va sinov bazasini ochiq tutadi. Natijada `rmSync` "fayl
       band" deb yiqiladi, xato esa `catch` da yutiladi — ya'ni HAR
       YURITISHDA vaqtinchalik papka qolib ketadi.

       Bir sessiyada 27 ta shunday papka to'planib, ~200 MB yeb qo'ygan.

       `taskkill /T /F` butun daraxtni o'ldiradi. Undan keyin ham fayl
       darhol bo'shamasligi mumkin (Windows uni biroz ushlab turadi),
       shuning uchun bir necha marta urinib ko'riladi. */
    const stop = () => {
        try {
            if (server?.pid && process.platform === 'win32') {
                try {
                    require('child_process').execFileSync(
                        'taskkill', ['/PID', String(server.pid), '/T', '/F'],
                        { stdio: 'ignore' });
                } catch { /* jarayon allaqachon tugagan bo'lishi mumkin */ }
            } else {
                server?.kill();
            }
        } catch { /* ignore */ }

        for (let i = 0; i < 10; i++) {
            try {
                fs.rmSync(workDir, { recursive: true, force: true });
                return;
            } catch {
                // Fayl hali band — 200 ms kutamiz
                try { execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},200)']); } catch { /* ignore */ }
            }
        }
        console.warn(`⚠️ Vaqtinchalik papka o'chirilmadi: ${workDir}`);
    };
    process.on('SIGINT', () => { stop(); process.exit(130); });

    try {
        server = spawn(process.execPath, [
            path.join(backendDir, 'node_modules', 'ts-node', 'dist', 'bin.js'),
            '--transpile-only', path.join(backendDir, 'server.ts'),
        ], {
            cwd: backendDir,
            env: {
                ...process.env,
                ELECTRON_RUN: 'true',
                ELECTRON_USER_DATA_PATH: workDir,
                ELECTRON_BACKEND_PORT: String(PORT),
            },
            stdio: 'ignore',
        });

        if (!await waitHealthy()) {
            console.error('Server ko\'tarilmadi.');
            process.exit(1);
        }

        const login = await fetch(`${BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'testpass123' }),
        });
        const token = (await login.json())?.token;
        if (!token) {
            console.error('Kirish amalga oshmadi.');
            process.exit(1);
        }

        for (const name of SUITES) {
            const file = path.join(__dirname, 'api', `${name}.ts`);
            if (!fs.existsSync(file)) { results.push([name, 'fayl yo\'q']); continue; }
            process.stdout.write(`  ${name.padEnd(12)} `);
            try {
                const out = execFileSync(process.execPath, [
                    path.join(backendDir, 'node_modules', 'ts-node', 'dist', 'bin.js'),
                    '--transpile-only', file, token,
                ], {
                    cwd: backendDir,
                    env: { ...process.env, T_BASE: BASE, T_DB: dbPath },
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
                const last = out.trim().split('\n').filter(Boolean).pop() || '';
                console.log(last.trim());
                // T_VERBOSE=1 — to'plamning har bir qatorini ko'rsatadi.
                // Xulosa qatori "0 yiqildi" desa ham, sinov haqiqatan
                // bajarilganini (masalan, login o'tganini) shundan ko'riladi.
                if (process.env.T_VERBOSE) console.log(out.trimEnd());
                results.push([name, last.trim()]);
            } catch (e: any) {
                const out = String(e.stdout || '') + String(e.stderr || '');
                const last = out.trim().split('\n').filter(Boolean).pop() || 'yiqildi';
                console.log(last.trim());
                /* Yiqilgan to'plamda batafsil chiqish HAR DOIM ko'rsatiladi —
                   `T_VERBOSE` siz ham. Aks holda faqat "6 yiqildi" ko'rinib,
                   qaysi biri yiqilgani noma'lum qolardi. */
                console.log(out.trimEnd());
                results.push([name, last.trim()]);
                failed++;
            }
        }
    } finally {
        stop();
    }

    console.log(`\n${failed === 0 ? '✅ hamma API sinovi o\'tdi' : `❌ ${failed} ta to'plam yiqildi`}\n`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
