/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — ekspluatatsiya: sxema migratsiyalari va zaxira nusxa.

   MUAMMO. Klinikaning kompyuterida Prisma CLI yo'q: `prisma db push` ni ishga
   tushirish imkoni yo'q. Ilgari `server.ts` da faqat `ADD COLUMN` qo'shadigan
   ro'yxat bor edi (COLUMN_MIGRATIONS) — yangi JADVAL yoki indeksni yetkazish
   uchun hech qanday yo'l yo'q edi.

   YECHIM. `backend/migrations/` ichida raqamlangan SQL fayllar. Server ishga
   tushganda `SchemaMigration` jadvaliga qarab yetishmayotganini qo'llaydi.
   Har fayl BITTA tranzaksiyada bajariladi: xato bo'lsa hammasi qaytariladi va
   versiya yozilmaydi, ya'ni keyingi ishga tushishda yana urinib ko'radi.

   BOSHLANG'ICH NUQTA. Ishlayotgan klinikalarning bazasi `db push` bilan
   yaratilgan va sxema versiyasi HECH QAYERDA yozilmagan (`_prisma_migrations`
   ham yo'q — tekshirilgan). Shuning uchun bo'sh bazani to'liq bazadan ajratib,
   ikkinchi holatda DDL ni bajarmasdan `baseline` belgisini qo'yamiz.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

type Deps = {
    prisma: any;
    authenticateToken: any;
    requireRole: (...roles: string[]) => any;
    /** Migratsiya fayllari papkasi */
    migrationsDir: string;
    /** %APPDATA%\xclinic — zaxira nusxalar shu ichida */
    userDataPath: string;
    /** Baza faylining to'liq yo'li */
    dbPath: string;
    /** Bemor fotolari va tekshiruv fayllari */
    uploadsDir: string;
};

const BASELINE = '0000_baseline';

/** Bo'sh bazani to'liq bazadan ajratish uchun tekshiriladigan jadval.
 *  `Visit` tanlangan: u joriy sxemada aniq bor va bo'sh bazada bo'lmaydi. */
const PROBE_TABLE = 'Visit';

export type MigrationResult = {
    applied: string[];
    skipped: string[];
    failed: { version: string; error: string } | null;
    baselined: boolean;
};

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

/** Baza xatosining O'QILADIGAN sababi.
 *
 *  Nozik joy: Prisma'ning `e.message` maydoni BO'SH QATOR bilan boshlanadi
 *  (`"\nInvalid `prisma.$executeRawUnsafe()` invocation:\n\n\nRaw query failed…"`).
 *  Shu sababli `split('\n')[0]` bo'sh satr qaytaradi va operator xatoning
 *  sababini ko'rmaydi — sinovda aynan shunday bo'lgan. Haqiqiy sabab esa
 *  `e.meta.message` da toza holda yotadi: `table "Patient" already exists`. */
export function describeDbError(e: any): string {
    const metaMsg = e?.meta?.message;
    if (typeof metaMsg === 'string' && metaMsg.trim()) {
        return e?.code ? `${metaMsg} (${e.code})` : metaMsg;
    }
    const lines = String(e?.message ?? e ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length) return e?.code ? `${lines[lines.length - 1]} (${e.code})` : lines[lines.length - 1];
    return e?.code ? `Noma'lum xatolik (${e.code})` : "Noma'lum xatolik";
}

/** Fayl nomini tekshiradi: `NNNN_nom.sql` */
function isMigrationFile(name: string): boolean {
    return /^\d{4}_[a-z0-9_]+\.sql$/i.test(name);
}

function readMigrationFiles(dir: string): { version: string; sql: string; checksum: string }[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter(isMigrationFile)
        .sort()                       // 0001 < 0002 < ... — leksikografik tartib to'g'ri ishlaydi
        .map((f) => {
            const sql = fs.readFileSync(path.join(dir, f), 'utf8');
            return { version: f.replace(/\.sql$/i, ''), sql, checksum: sha256(sql) };
        });
}

/** SQL matnini instruksiyalarga bo'ladi. Izohlar (`--`) tashlanadi. */
function splitStatements(sql: string): string[] {
    return sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Jadval bazada bormi */
async function tableExists(prisma: any, table: string): Promise<boolean> {
    const rows: any = await prisma.$queryRawUnsafe(
        `SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`, table,
    );
    return Array.isArray(rows) && rows.length > 0;
}

/**
 * Yetishmayotgan migratsiyalarni qo'llaydi. Server `app.listen` dan OLDIN
 * chaqiradi: sxema tayyor bo'lmagan holatda so'rovlarni qabul qilish
 * ma'nosizdir.
 */
export async function runMigrations(prisma: any, migrationsDir: string): Promise<MigrationResult> {
    const result: MigrationResult = { applied: [], skipped: [], failed: null, baselined: false };

    // `SchemaMigration` ni Prisma Client emas, o'zimiz yaratamiz: bo'sh bazada
    // Client ham hali ishlamasligi mumkin.
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SchemaMigration" (
            "version"    TEXT PRIMARY KEY NOT NULL,
            "appliedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "checksum"   TEXT,
            "durationMs" INTEGER,
            "note"       TEXT
        )
    `);

    const doneRows: any = await prisma.$queryRawUnsafe(`SELECT version, checksum FROM "SchemaMigration"`);
    const done = new Map<string, string | null>(
        (Array.isArray(doneRows) ? doneRows : []).map((r: any) => [r.version, r.checksum]),
    );

    const files = readMigrationFiles(migrationsDir);

    /* Boshlang'ich nuqta. Baza to'liq (Visit bor), lekin bironta migratsiya
       belgisi yo'q — bu `db push` bilan yaratilgan ishlayotgan klinika.
       Mavjud fayllarni QO'LLAMAYMIZ (ular allaqachon sxemada), faqat belgi
       qo'yamiz. Aks holda `ADD COLUMN` ikkinchi marta bajarilib xato beradi. */
    if (done.size === 0 && await tableExists(prisma, PROBE_TABLE)) {
        const now = new Date().toISOString();
        await prisma.$executeRawUnsafe(
            `INSERT INTO "SchemaMigration" ("version","appliedAt","note") VALUES (?, ?, ?)`,
            BASELINE, now, 'baseline: mavjud baza, DDL bajarilmadi',
        );
        for (const f of files) {
            await prisma.$executeRawUnsafe(
                `INSERT INTO "SchemaMigration" ("version","appliedAt","checksum","note") VALUES (?, ?, ?, ?)`,
                f.version, now, f.checksum, 'baseline bilan belgilandi',
            );
            done.set(f.version, f.checksum);
        }
        result.baselined = true;
        console.log(`📌 Sxema boshlang'ich nuqtasi qo'yildi (${files.length} migratsiya mavjud deb belgilandi)`);
        return result;
    }

    for (const f of files) {
        if (done.has(f.version)) {
            const known = done.get(f.version);
            if (known && known !== f.checksum) {
                // Fayl qo'llanilgandan keyin tahrirlangan. Qayta bajarmaymiz —
                // o'zgarish klinikada allaqachon turibdi. Faqat ogohlantiramiz.
                console.warn(`⚠️ Migratsiya ${f.version} qo'llanilgandan keyin tahrirlangan (xesh boshqa). Qayta bajarilmaydi.`);
            }
            result.skipped.push(f.version);
            continue;
        }

        const statements = splitStatements(f.sql);
        if (statements.length === 0) {
            // Bo'sh fayl ham belgilanadi, aks holda har ishga tushishda tekshiriladi
            await prisma.$executeRawUnsafe(
                `INSERT INTO "SchemaMigration" ("version","checksum","durationMs","note") VALUES (?, ?, ?, ?)`,
                f.version, f.checksum, 0, "bo'sh fayl",
            );
            result.applied.push(f.version);
            continue;
        }

        const started = Date.now();
        try {
            // Butun fayl bitta tranzaksiyada: yarim qo'llanilgan migratsiya —
            // eng yomon holat, undan bosh tortish kerak.
            await prisma.$transaction(
                statements.map((st) => prisma.$executeRawUnsafe(st)),
            );
            const ms = Date.now() - started;
            await prisma.$executeRawUnsafe(
                `INSERT INTO "SchemaMigration" ("version","checksum","durationMs") VALUES (?, ?, ?)`,
                f.version, f.checksum, ms,
            );
            result.applied.push(f.version);
            console.log(`✅ Migratsiya qo'llanildi: ${f.version} (${ms} ms)`);
        } catch (e: any) {
            const msg = describeDbError(e);
            result.failed = { version: f.version, error: msg };
            console.error(`❌ Migratsiya ${f.version} bajarilmadi: ${msg}`);
            console.error('   Sxema o\'zgartirilmadi, versiya yozilmadi. Keyingi ishga tushishda qayta urinib ko\'riladi.');
            break; // tartib muhim: keyingilarini o'tkazib yubormaymiz
        }
    }

    if (result.applied.length === 0 && !result.failed && !result.baselined) {
        console.log(`✅ Sxema yangi (${result.skipped.length} migratsiya allaqachon qo'llanilgan)`);
    }
    return result;
}

/* ─── ZAXIRA NUSXA ─────────────────────────────────────────────────────────
   Nusxa oddiy `copyFile` bilan OLINMAYDI: server bazani ochiq tutadi va
   nusxalash yarim yozilgan holatni tushirib qolishi mumkin. SQLite ning
   `VACUUM INTO` buyrug'i ochiq baza ustida ham izchil snapshot beradi va
   qo'shimcha kutubxona talab qilmaydi (tekshirilgan: 816 KB, 53 jadval).

   Baza bilan birga `uploads/` arxivlanadi: aks holda tiklangan bazada bemor
   fotolari va UZI suratlariga havolalar bor, fayllar esa yo'q. */

const BACKUP_DIR_NAME = 'backups';
const RESTORE_MARKER = 'restore-pending.json';

/** Bir vaqtda faqat bitta nusxa. Ikkita `VACUUM INTO` bir-birini urib ketadi. */
let backupInProgress = false;

/** Fayl nomidan papkadan chiqib ketish urinishini kesadi. */
function safeBackupName(name: any): string | null {
    if (typeof name !== 'string' || !name) return null;
    const base = path.basename(name);
    if (base !== name) return null;                       // yo'l qismlari bo'lmasin
    if (!/^xclinic-\d{8}-\d{6}\.db$/.test(base)) return null;
    return base;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `xclinic-20260819-171530` — nusxa nomining asosi (mahalliy vaqt bo'yicha) */
function backupStamp(d = new Date()): string {
    return `xclinic-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
        + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function registerMaintenanceRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, requireRole, migrationsDir,
            userDataPath, dbPath, uploadsDir } = deps;

    const backupDir = path.join(userDataPath, BACKUP_DIR_NAME);
    const markerPath = path.join(userDataPath, RESTORE_MARKER);
    const ensureBackupDir = () => { if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true }); };

    /** Nusxalar ro'yxati: `.db` fayllari, yangilari birinchi */
    const listBackups = () => {
        if (!fs.existsSync(backupDir)) return [];
        return fs.readdirSync(backupDir)
            .filter((f) => /^xclinic-\d{8}-\d{6}\.db$/.test(f))
            .map((f) => {
                const st = fs.statSync(path.join(backupDir, f));
                const zip = f.replace(/\.db$/, '-uploads.zip');
                const noteFile = f.replace(/\.db$/, '.txt');
                let note: string | null = null;
                try {
                    const np = path.join(backupDir, noteFile);
                    if (fs.existsSync(np)) note = fs.readFileSync(np, 'utf8').trim() || null;
                } catch { /* izoh ixtiyoriy */ }
                return {
                    file: f,
                    sizeBytes: st.size,
                    createdAt: st.mtime.toISOString(),
                    hasUploads: fs.existsSync(path.join(backupDir, zip)),
                    note,
                };
            })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    };

    /**
     * POST /api/admin/backup — hozir nusxa olish.
     *
     * Bazani `VACUUM INTO` bilan, `uploads/` ni zip bilan. Izoh berilsa,
     * yonma-yon `.txt` faylga yoziladi (bazaga ustun qo'shmaslik uchun).
     */
    app.post('/api/admin/backup', auth, requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'), async (req: any, res: any) => {
        if (backupInProgress) {
            return res.status(409).json({ error: 'Nusxa olish allaqachon ketmoqda' });
        }
        backupInProgress = true;
        const started = Date.now();
        try {
            ensureBackupDir();
            const stamp = backupStamp();
            const dbTarget = path.join(backupDir, `${stamp}.db`);

            // Prisma raw SQL: yo'lda faqat forward slash, apostrof bo'lmasligi kerak
            const sqlPath = dbTarget.split(path.sep).join('/');
            if (sqlPath.includes("'")) {
                return res.status(500).json({ error: 'Nusxa yo\'lida apostrof bor — nusxa olinmadi' });
            }
            await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);

            // uploads/ — arxivga. Bo'sh bo'lsa arxiv yaratilmaydi.
            let uploadsCount = 0;
            try {
                if (fs.existsSync(uploadsDir) && fs.readdirSync(uploadsDir).length > 0) {
                    const AdmZip = require('adm-zip');
                    const zip = new AdmZip();
                    zip.addLocalFolder(uploadsDir);
                    zip.writeZip(path.join(backupDir, `${stamp}-uploads.zip`));
                    uploadsCount = fs.readdirSync(uploadsDir).length;
                }
            } catch (e: any) {
                // Baza nusxasi olingan — bu asosiysi. Fayllar arxivi yiqilsa
                // ogohlantiramiz, lekin butun amalni bekor qilmaymiz.
                console.error('Zaxira: uploads arxivlanmadi:', e?.message || e);
            }

            const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500).trim() : '';
            if (note) {
                try { fs.writeFileSync(path.join(backupDir, `${stamp}.txt`), note, 'utf8'); } catch { /* ixtiyoriy */ }
            }

            const size = fs.statSync(dbTarget).size;
            const durationMs = Date.now() - started;
            console.log(`💾 Zaxira nusxa: ${stamp}.db (${Math.round(size / 1024)} KB, ${uploadsCount} fayl, ${durationMs} ms)`);
            res.json({ file: `${stamp}.db`, sizeBytes: size, createdAt: new Date().toISOString(), uploadsCount, durationMs });
        } catch (e: any) {
            const msg = describeDbError(e);
            console.error('Zaxira nusxa xatosi:', msg);
            res.status(500).json({ error: `Nusxa olinmadi: ${msg}` });
        } finally {
            backupInProgress = false;
        }
    });

    /** GET /api/admin/backups — mavjud nusxalar */
    app.get('/api/admin/backups', auth, requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'), async (_req: any, res: any) => {
        try {
            res.json(listBackups());
        } catch (e: any) {
            console.error('[GET /api/admin/backups]', e?.message || e);
            res.status(500).json({ error: 'Nusxalar ro\'yxatini o\'qib bo\'lmadi' });
        }
    });

    /**
     * POST /api/admin/backup/restore — tiklashni BELGILAYDI.
     *
     * Tiklashni shu endpoint BAJARMAYDI: server bazani ochiq tutadi va uni
     * o'z ostidan almashtirib bo'lmaydi. Shuning uchun tanlangan fayl belgi
     * fayliga yoziladi, almashtirishni esa Electron backend ishga tushishidan
     * OLDIN qiladi. Javob shu sababli `staged`, `restored` emas.
     */
    app.post('/api/admin/backup/restore', auth, requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'), async (req: any, res: any) => {
        try {
            if (req.body?.confirm !== true) {
                return res.status(400).json({ error: 'Tasdiqlanmagan: confirm=true kerak' });
            }
            const file = safeBackupName(req.body?.file);
            if (!file) return res.status(400).json({ error: 'Nusxa nomi noto\'g\'ri' });
            if (!fs.existsSync(path.join(backupDir, file))) {
                return res.status(404).json({ error: 'Nusxa topilmadi' });
            }
            if (fs.existsSync(markerPath)) {
                return res.status(409).json({ error: 'Tiklash allaqachon belgilangan' });
            }
            const user = req.user;
            fs.writeFileSync(markerPath, JSON.stringify({
                file,
                stagedAt: new Date().toISOString(),
                byName: user?.name || null,
                byRole: user?.role || null,
            }, null, 2), 'utf8');
            console.warn(`⚠️ Tiklash belgilandi: ${file} (${user?.name || '?'}). Dastur qayta ishga tushganda qo'llanadi.`);
            res.json({ staged: true, restartRequired: true, file });
        } catch (e: any) {
            console.error('[POST /api/admin/backup/restore]', e?.message || e);
            res.status(500).json({ error: 'Tiklashni belgilab bo\'lmadi' });
        }
    });

    /** DELETE /api/admin/backup/restore — belgilangan tiklashni bekor qilish.
     *  Kerak, chunki tiklash kechiktirilgan: "bosdim va o'yladim" holatidan chiqish yo'li. */
    app.delete('/api/admin/backup/restore', auth, requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'), async (_req: any, res: any) => {
        try {
            if (!fs.existsSync(markerPath)) {
                return res.status(404).json({ error: 'Tiklash belgilanmagan' });
            }
            fs.unlinkSync(markerPath);
            console.log('Tiklash bekor qilindi');
            res.json({ success: true });
        } catch (e: any) {
            console.error('[DELETE /api/admin/backup/restore]', e?.message || e);
            res.status(500).json({ error: 'Bekor qilib bo\'lmadi' });
        }
    });

    /** GET /api/admin/backup/restore — belgilangan tiklash bormi (interfeys shu bilan
     *  sahifada ogohlantirish chizig'ini ko'rsatadi) */
    app.get('/api/admin/backup/restore', auth, requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'), async (_req: any, res: any) => {
        try {
            if (!fs.existsSync(markerPath)) return res.json({ staged: false });
            const raw = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
            res.json({ staged: true, ...raw });
        } catch {
            res.json({ staged: false });
        }
    });

    /**
     * Sxema holati. Ko'rish uchun: qo'llab-quvvatlashda birinchi savol —
     * "klinikada qaysi versiya".
     *
     * `clinicId` ATAYLAB ishlatilmaydi: sxema o'rnatmaga bitta, klinikaga emas.
     */
    app.get('/api/admin/schema-status', auth, requireRole('CLINIC_ADMIN', 'SUPER_ADMIN'), async (_req: any, res: any) => {
        try {
            const rows: any = await prisma.$queryRawUnsafe(
                `SELECT version, appliedAt, durationMs, note FROM "SchemaMigration" ORDER BY version ASC`,
            );
            const applied: any[] = Array.isArray(rows) ? rows : [];
            const appliedSet = new Set(applied.map((r) => r.version));

            const files = readMigrationFiles(migrationsDir);
            const pending = files.filter((f) => !appliedSet.has(f.version)).map((f) => f.version);

            // Boshlang'ich nuqta belgisi — texnik yozuv, "joriy versiya" emas
            const real = applied.filter((r) => r.version !== BASELINE);

            res.json({
                current: real.length ? real[real.length - 1].version : null,
                baseline: appliedSet.has(BASELINE),
                appliedCount: real.length,
                applied: real,
                pending,
                pendingCount: pending.length,
            });
        } catch (e: any) {
            console.error('[GET /api/admin/schema-status]', e?.message || e);
            res.status(500).json({ error: 'Sxema holatini o\'qib bo\'lmadi' });
        }
    });

    console.log('✅ Ekspluatatsiya endpointlari ulandi');
}
