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
import { sendBackupToOwner } from './backupTelegram';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { tashkentDateStr, tashkentNowMs } from './tashkentTime';
import { findBalanceMismatches } from './billing';

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
export async function runMigrations(
    prisma: any,
    migrationsDir: string,
    opts?: {
        /** Birinchi migratsiya QO'LLANISHDAN OLDIN bir marta chaqiriladi.
         *  Zaxira nusxa shu yerda olinadi: migratsiya tranzaksiyada qaytariladi,
         *  lekin sxema o'zgarishi ustidan qaytish yo'li faqat nusxa. */
        beforeApply?: (pending: string[]) => Promise<void>;
    },
): Promise<MigrationResult> {
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

    /* Qo'llanadigan migratsiyalar bo'lsa — avval zaxira nusxa. Migratsiyaning
       o'zi tranzaksiyada va yiqilsa qaytariladi, lekin MUVAFFAQIYATLI
       qo'llangan sxema o'zgarishidan qaytish yo'li faqat nusxa orqali. */
    const pendingVersions = files.filter((f) => !done.has(f.version)).map((f) => f.version);
    if (pendingVersions.length > 0 && opts?.beforeApply) {
        try {
            await opts.beforeApply(pendingVersions);
        } catch (e: any) {
            // Nusxa olinmasa ham migratsiyani to'xtatmaymiz: to'xtatish serverni
            // umuman ko'tarmaydi va klinika ishlamay qoladi. Ogohlantiramiz.
            console.error('⚠️ Migratsiyadan oldingi nusxa olinmadi:', e?.message || e);
        }
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

/** `xclinic-20260824-233000.db` → `2026-08-24`. Format boshqa bo'lsa `null`. */
function backupDateStr(file: string): string | null {
    const m = /^xclinic-(\d{4})(\d{2})(\d{2})-\d{6}\.db$/.exec(file);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/* ═══ AVTOMATIK NUSXA ══════════════════════════════════════════════════════

   NIMA UCHUN CRON EMAS. Bu qaror loyihada allaqachon qabul qilingan va
   `server.ts` da yozilgan: "Offline dasturda jadval (cron) ishonchsiz —
   kompyuter kechqurun o'chadi". Koyka haqi va kirish jurnalini tozalash shu
   sababli ishga tushishda o'tkazib yuborilgan kunlarni quvib yetadi.
   Zaxira nusxa ham xuddi shu qoida bo'yicha ishlaydi:

     - Toshkent kuniga BITTA avtomatik nusxa;
     - belgilangan soat kelsa olinadi;
     - kompyuter o'sha paytda o'chiq bo'lsa — keyingi ishga tushishda DARHOL
       olinadi, ya'ni o'tkazib yuborilgan kun quvib yetiladi.

   Shuning uchun soat 23:30 turgan bo'lsa ham, kechqurun o'chadigan
   kompyuterda nusxa ertalab olinadi va kechagi ish kuni to'liq nusxaga
   tushadi: baza joyida turgan, faqat nusxa kechikkan.

   Chiqishda (`before-quit`) nusxa olish ATAYLAB qo'shilmadi. U dasturning
   yopilishini sekinlashtiradi, quvib yetish esa o'sha ma'lumotning aynan
   o'zini keyingi ishga tushishda oladi — ya'ni foyda yo'q, narx bor.       */

const BACKUP_CONFIG_NAME = 'backup-config.json';

export type BackupConfig = {
    /** Avtomatik nusxa yoqilganmi */
    enabled: boolean;
    /** Toshkent bo'yicha soat (0-23) va daqiqa (0-59) */
    hour: number;
    minute: number;
    /** Kuniga IKKI marta olinsinmi (ikkinchi vaqt quyida) */
    twiceDaily: boolean;
    /** Ikkinchi vaqt — `twiceDaily` yoqilganda ishlatiladi */
    hour2: number;
    minute2: number;
    /* `keepDaily` va `keepMonthly` — ESKI sozlamalar. Ular endi hech
       narsa qilmaydi: nusxalar o'chirilmaydi (`applyRetention` ga
       qarang). Turi saqlanadi, chunki eski `backup.json` fayllarida
       ular yozilgan va o'qishda yiqilmasligi kerak. */
    keepDaily: number;
    keepMonthly: number;
    /** Ikkinchi manzil: flesh yoki tarmoq diski. Bo'lmasa `null`. */
    extraDir: string | null;
};

const DEFAULT_BACKUP_CONFIG: BackupConfig = {
    enabled: true, hour: 23, minute: 30,
    twiceDaily: true, hour2: 13, minute2: 0,
    keepDaily: 14, keepMonthly: 12, extraDir: null,
};

const clampInt = (v: any, min: number, max: number, fallback: number): number => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function readBackupConfig(userDataPath: string): BackupConfig {
    try {
        const raw = fs.readFileSync(path.join(userDataPath, BACKUP_CONFIG_NAME), 'utf8');
        const j = JSON.parse(raw) || {};
        return {
            enabled: j.enabled !== false,
            hour: clampInt(j.hour, 0, 23, DEFAULT_BACKUP_CONFIG.hour),
            minute: clampInt(j.minute, 0, 59, DEFAULT_BACKUP_CONFIG.minute),
            // Kamida 2 kun: bitta nusxa qolishi xavfli, buzuq nusxa qaytish yo'lini yopadi
            /* Eski faylda bu maydonlar yo'q — sukut bo'yicha YOQILGAN:
               klinika egasi kuniga ikki marta so'radi. */
            twiceDaily: j.twiceDaily !== false,
            hour2: clampInt(j.hour2, 0, 23, DEFAULT_BACKUP_CONFIG.hour2),
            minute2: clampInt(j.minute2, 0, 59, DEFAULT_BACKUP_CONFIG.minute2),
            keepDaily: clampInt(j.keepDaily, 2, 365, DEFAULT_BACKUP_CONFIG.keepDaily),
            keepMonthly: clampInt(j.keepMonthly, 0, 120, DEFAULT_BACKUP_CONFIG.keepMonthly),
            extraDir: typeof j.extraDir === 'string' && j.extraDir.trim() ? j.extraDir.trim() : null,
        };
    } catch {
        // Fayl yo'q yoki buzuq — sukut bo'yicha sozlama. Nusxa olish to'xtamasligi kerak.
        return { ...DEFAULT_BACKUP_CONFIG };
    }
}

export function writeBackupConfig(userDataPath: string, cfg: BackupConfig): void {
    fs.writeFileSync(path.join(userDataPath, BACKUP_CONFIG_NAME), JSON.stringify(cfg, null, 2), 'utf8');
}

/** Jadval holati — `/api/admin/backup/status` shu yerdan o'qiydi. */
const schedulerState: {
    started: boolean;
    lastRunAt: string | null;
    lastFile: string | null;
    lastError: string | null;
    lastDeleted: number;
} = { started: false, lastRunAt: null, lastFile: null, lastError: null, lastDeleted: 0 };

/**
 * Nusxa olish — endpoint ham, jadval ham shu funksiyani chaqiradi.
 *
 * `backupInProgress` bayrog'ini CHAQIRUVCHI qo'yadi: endpoint band bo'lsa 409
 * qaytarishi kerak, jadval esa shunchaki o'tkazib yuboradi.
 */
export async function performBackup(input: {
    prisma: any;
    backupDir: string;
    uploadsDir: string;
    note?: string;
    extraDir?: string | null;
}): Promise<{
    file: string; sizeBytes: number; createdAt: string; uploadsCount: number;
    durationMs: number; extraCopied: boolean; extraError: string | null;
}> {
    const { prisma, backupDir, uploadsDir } = input;
    const started = Date.now();

    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const stamp = backupStamp();
    const dbTarget = path.join(backupDir, `${stamp}.db`);

    // Prisma raw SQL: yo'lda faqat forward slash, apostrof bo'lmasligi kerak
    const sqlPath = dbTarget.split(path.sep).join('/');
    if (sqlPath.includes("'")) {
        throw new Error("nusxa yo'lida apostrof bor");
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

    const note = typeof input.note === 'string' ? input.note.slice(0, 500).trim() : '';
    if (note) {
        try { fs.writeFileSync(path.join(backupDir, `${stamp}.txt`), note, 'utf8'); } catch { /* ixtiyoriy */ }
    }

    /* Ikkinchi manzil. Xatosi butun amalni yiqitmaydi: asosiy nusxa
       allaqachon olingan, flesh esa sug'urta. Ulanmagan disk uchun butun
       zaxirani muvaffaqiyatsiz deb belgilash — yolg'on ogohlantirish. */
    let extraCopied = false;
    let extraError: string | null = null;
    const extraDir = input.extraDir;
    if (extraDir) {
        try {
            if (!fs.existsSync(extraDir)) fs.mkdirSync(extraDir, { recursive: true });
            fs.copyFileSync(dbTarget, path.join(extraDir, `${stamp}.db`));
            const zipName = `${stamp}-uploads.zip`;
            const zipSrc = path.join(backupDir, zipName);
            if (fs.existsSync(zipSrc)) fs.copyFileSync(zipSrc, path.join(extraDir, zipName));
            extraCopied = true;
        } catch (e: any) {
            extraError = e?.message || String(e);
            console.error('Zaxira: ikkinchi manzilga ko\'chirilmadi:', extraError);
        }
    }

    const size = fs.statSync(dbTarget).size;
    const durationMs = Date.now() - started;
    console.log(`💾 Zaxira nusxa: ${stamp}.db (${Math.round(size / 1024)} KB, ${uploadsCount} fayl, ${durationMs} ms)`);

    return {
        file: `${stamp}.db`,
        sizeBytes: size,
        createdAt: new Date().toISOString(),
        uploadsCount,
        durationMs,
        extraCopied,
        extraError,
    };
}

/**
 * ZAXIRA NUSXALAR O'CHIRILMAYDI.
 *
 * Ilgari bu funksiya eskirganlarini o'chirardi: oxirgi N kunning hammasi,
 * undan oldingi har oydan bittasi, izohlilari esa tegilmasdi.
 *
 * KLINIKA EGASINING QARORI (2026-09-09): hech biri o'chirilmaydi — izohsizi
 * ham. Sabab oddiy: zaxira nusxaning butun ma'nosi «kerak bo'lganda bor
 * bo'lishi», va qaysi nusxa kerak bo'lishini oldindan bilib bo'lmaydi.
 * Xato bir oy o'tib sezilishi mumkin, o'sha paytda esa aynan o'sha kunning
 * nusxasi kerak bo'ladi.
 *
 * Funksiya O'CHIRILMADI, chunki uni chaqiradigan joylar bor va ular
 * «nechta o'chirildi» degan javobni kutadi. U endi hech narsa qilmaydi va
 * har doim bo'sh ro'yxat qaytaradi.
 *
 * DISK HAQIDA. Nusxa kuniga ikki marta olinadi, bazaniki ~1 MB — yiliga
 * taxminan 1 GB. Bemor fotolari arxivi esa kattaroq bo'lishi mumkin.
 * Sozlamalar ekrani jami hajmni ko'rsatib turadi; joy tugashiga yaqin
 * qolganda eskilarini tashqi diskka QO'LDA ko'chirish kerak — dastur
 * o'zi hech narsani yo'q qilmaydi.
 */
export function applyRetention(
    _backupDir: string, _keepDaily: number, _keepMonthly: number,
): { deleted: string[] } {
    return { deleted: [] };
}

/** Jadvaldagi vaqtlar — tartiblangan, takrorsiz. */
export function scheduleSlots(cfg: BackupConfig): { hour: number; minute: number }[] {
    const list = [{ hour: cfg.hour, minute: cfg.minute }];
    if (cfg.twiceDaily) list.push({ hour: cfg.hour2, minute: cfg.minute2 });
    const seen = new Set<number>();
    return list
        .filter(s => { const k = s.hour * 60 + s.minute; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Avtomatik nusxa hozir olinishi kerakmi.
 *
 * KUNIGA BIR EMAS, JADVALDAGI HAR VAQT UCHUN. Ilgari qoida oddiy edi:
 * «bugun nusxa bormi — bo'lsa boshqa olinmaydi». Klinika egasi kuniga ikki
 * marta so'ragach bu yetmay qoldi: ikkinchi vaqt kelganda birinchi nusxa
 * borligi uchun ish o'tkazib yuborilardi.
 *
 * Endi hisob VAQT bo'yicha: bugun o'tib bo'lgan oxirgi jadval vaqti
 * topiladi va oxirgi nusxa o'shandan OLDIN olingan bo'lsa — yangisi
 * olinadi.
 *
 * @param newest oxirgi nusxaning belgisi: `YYYYMMDD-HHMMSS` yoki `YYYY-MM-DD`
 *               (eski chaqiruvlar uchun — u holda kun boshi deb olinadi)
 */
export function autoBackupDue(cfg: BackupConfig, newest: string | null, nowMs = tashkentNowMs()): boolean {
    if (!cfg.enabled) return false;
    if (!newest) return true;                       // umuman nusxa yo'q — darhol

    /* Ikkala shakl ham qabul qilinadi: `YYYY-MM-DD` kelsa, o'sha kunning
       BOSHI deb olinadi — ya'ni o'sha kunning har qanday jadval vaqti
       hali o'tmagan hisoblanadi. */
    const stamp = newest.includes('-') && newest.length === 10
        ? `${newest.replace(/-/g, '')}-000000`
        : newest;

    const today = tashkentDateStr().replace(/-/g, '');
    const yesterday = tashkentDateStr(-1).replace(/-/g, '');
    const d = new Date(nowMs);                      // nowMs Toshkentga siljitilgan
    const nowMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();

    const passed = scheduleSlots(cfg).filter(sl => sl.hour * 60 + sl.minute <= nowMinutes);

    /* Bugun hali birinchi vaqt kelmagan. Kun(lar) o'tkazib yuborilgan
       bo'lsa — kutmasdan olamiz (kompyuter o'chiq bo'lgan holat). */
    if (passed.length === 0) return stamp.slice(0, 8) < yesterday;

    const last = passed[passed.length - 1];
    const target = `${today}-${pad2(last.hour)}${pad2(last.minute)}00`;
    return stamp < target;
}


/**
 * Avtomatik nusxa jadvalini ishga tushiradi.
 *
 * Ishga tushishda darhol bir marta tekshiradi (quvib yetish), so'ng har 30
 * daqiqada. Interval kichik emas: `autoBackupDue` kuniga bitta nusxaga
 * kafolat beradi, tekshiruv esa faqat papkani o'qiydi — arzon.
 */
export function startBackupScheduler(deps: {
    prisma: any; userDataPath: string; uploadsDir: string;
}): void {
    if (schedulerState.started) return;
    schedulerState.started = true;

    const backupDir = path.join(deps.userDataPath, BACKUP_DIR_NAME);

    /* SANA emas, TO'LIQ BELGI qaytadi (`YYYYMMDD-HHMMSS`).

       Kuniga bir marta olinganda sana yetardi. Ikki marta olinganda esa
       yetmaydi: ikkinchi vaqt kelganda «bugun nusxa bor» degan javob
       ishni o'tkazib yuborardi. */
    const newestBackupStamp = (): string | null => {
        try {
            if (!fs.existsSync(backupDir)) return null;
            const files = fs.readdirSync(backupDir)
                .filter((f) => /^xclinic-\d{8}-\d{6}\.db$/.test(f))
                .sort();
            const newest = files[files.length - 1];
            return newest ? newest.replace(/^xclinic-/, '').replace(/\.db$/, '') : null;
        } catch {
            return null;
        }
    };

    const tick = async (reason: string) => {
        if (backupInProgress) return;                 // qo'lda olinayotgan bo'lsa aralashmaymiz
        const cfg = readBackupConfig(deps.userDataPath);
        if (!autoBackupDue(cfg, newestBackupStamp())) return;

        backupInProgress = true;
        try {
            const r = await performBackup({
                prisma: deps.prisma,
                backupDir,
                uploadsDir: deps.uploadsDir,
                extraDir: cfg.extraDir,
            });
            const { deleted } = applyRetention(backupDir, cfg.keepDaily, cfg.keepMonthly);
            schedulerState.lastRunAt = r.createdAt;
            schedulerState.lastFile = r.file;
            schedulerState.lastError = r.extraError ? `ikkinchi manzil: ${r.extraError}` : null;
            schedulerState.lastDeleted = deleted.length;
            console.log(`💾 Avtomatik zaxira (${reason}): ${r.file}`);

            /* KLINIKA EGASIGA TELEGRAMGA — kuniga bir marta.

               Nusxa kompyuterning o'zida yotadi; kompyuter ishdan chiqsa
               u ham ketadi. Telegram esa allaqachon ulangan va nusxa
               klinikadan tashqarida paydo bo'ladi.

               Xatosi zaxirani YIQITMAYDI: fayl allaqachon diskda. */
            try {
                const sent = await sendBackupToOwner({
                    prisma: deps.prisma,
                    userDataPath: deps.userDataPath,
                    dbFile: path.join(backupDir, r.file),
                });
                if (!sent.sent && sent.reason !== 'bugun allaqachon yuborilgan') {
                    console.warn(`📤 Telegramga yuborilmadi: ${sent.reason}`);
                }
            } catch (e: any) {
                console.warn('📤 Telegramga yuborilmadi:', e?.message || e);
            }
        } catch (e: any) {
            schedulerState.lastError = describeDbError(e);
            console.error('❌ Avtomatik zaxira olinmadi:', schedulerState.lastError);
        } finally {
            backupInProgress = false;
        }
    };

    /* Ishga tushishdagi quvib yetish 20 soniya kechiktiriladi: server endigina
       ko'tarildi, birinchi so'rovlar kelayotgan bo'lishi mumkin, `VACUUM INTO`
       esa bazani qisqa vaqtga band qiladi. */
    setTimeout(() => { void tick('ishga tushish'); }, 20_000).unref?.();
    setInterval(() => { void tick('jadval'); }, 30 * 60 * 1000).unref?.();

    console.log('✅ Avtomatik zaxira jadvali yoqildi');
}

/* ─── GOOGLE DRIVE PAPKASI ────────────────────────────────────────────────

   NIMA UCHUN API EMAS, PAPKA.

   dentalocal da «Google Drive backup» degan narsa BOR deb hisoblanardi,
   aslida esa u shunchaki papka tanlash edi: matn «Google Drive yoki
   istalgan papkani tanlang» deb turardi va sinxronizatsiyani Google ning
   o'z dasturi qilardi. Integratsiya, OAuth, kalit — hech biri yo'q edi.

   Biz ham shu yo'ldan boramiz, lekin ATAYLAB va aytib:

     · dasturga Google kaliti kerak emas — u paketda yotib, o'g'irlanishi
       mumkin bo'lgan sir bo'lardi;
     · internet uzilganda nusxa OLINAVERADI, keyin Drive o'zi ko'taradi;
     · klinika Drive o'rniga OneDrive yoki oddiy flesh ishlatsa ham
       bir xil ishlaydi.

   Bu yerda faqat papkani TOPAMIZ, shunda foydalanuvchi qo'lda yo'l
   yozib o'tirmaydi. Topilmasa — oddiy papka tanlash qoladi. */

const DRIVE_CANDIDATES = (home: string): { path: string; label: string }[] => [
    { path: path.join(home, 'Google Drive'), label: 'Google Drive' },
    { path: path.join(home, 'My Drive'), label: 'Google Drive (My Drive)' },
    { path: path.join(home, 'GoogleDrive'), label: 'Google Drive' },
    { path: path.join(home, 'OneDrive'), label: 'OneDrive' },
    { path: path.join(home, 'Dropbox'), label: 'Dropbox' },
    { path: path.join(home, 'YandexDisk'), label: 'Yandex Disk' },
];

/** Kompyuterdagi bulut papkalarini topadi. Diskning o'zi ham qaraladi. */
export function findCloudFolders(): { path: string; label: string }[] {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const found: { path: string; label: string }[] = [];
    const seen = new Set<string>();

    const add = (p: string, label: string) => {
        try {
            if (!p || seen.has(p.toLowerCase())) return;
            if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
                seen.add(p.toLowerCase());
                found.push({ path: p, label });
            }
        } catch { /* ruxsat yo'q — o'tkazamiz */ }
    };

    if (home) for (const c of DRIVE_CANDIDATES(home)) add(c.path, c.label);

    /* «Google Drive for desktop» virtual disk ulaydi (odatda G:).
       Undagi `My Drive` — sinxronlanadigan papka. */
    for (const letter of ['G', 'H', 'I', 'J']) {
        add(`${letter}:\\My Drive`, `Google Drive (${letter}:)`);
    }
    return found;
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
    app.post('/api/admin/backup', auth, requireRole('CLINIC_ADMIN'), async (req: any, res: any) => {
        if (backupInProgress) {
            return res.status(409).json({ error: 'Nusxa olish allaqachon ketmoqda' });
        }
        backupInProgress = true;
        try {
            ensureBackupDir();
            const cfg = readBackupConfig(userDataPath);
            const r = await performBackup({
                prisma, backupDir, uploadsDir,
                note: req.body?.note,
                extraDir: cfg.extraDir,
            });
            /* Saqlash muddati qo'lda olingan nusxadan keyin ham qo'llanadi:
               aks holda avtomatik nusxa o'chirilgan klinikada papka cheksiz
               o'sib ketadi. Izohli nusxalar `applyRetention` da himoyalangan. */
            const { deleted } = applyRetention(backupDir, cfg.keepDaily, cfg.keepMonthly);
            res.json({ ...r, deletedCount: deleted.length });
        } catch (e: any) {
            const msg = describeDbError(e);
            console.error('Zaxira nusxa xatosi:', msg);
            res.status(500).json({ error: `Nusxa olinmadi: ${msg}` });
        } finally {
            backupInProgress = false;
        }
    });

    /**
     * GET /api/admin/backup/status — jadval holati.
     *
     * Sozlamalar shu yerdan "oxirgi nusxa qachon olingan" va "kechikkanmi"
     * degan javobni oladi. Kechikish belgisi MUHIM: tugma bosilmay qolgan
     * klinika buni boshqa hech qayerdan bilmaydi.
     */
    app.get('/api/admin/backup/status', auth, requireRole('CLINIC_ADMIN'), async (_req: any, res: any) => {
        try {
            const cfg = readBackupConfig(userDataPath);
            const list = listBackups();
            const newest = list[0] || null;
            const newestDate = newest ? backupDateStr(newest.file) : null;

            let ageDays: number | null = null;
            if (newestDate) {
                const today = tashkentDateStr();
                ageDays = Math.round(
                    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${newestDate}T00:00:00Z`)) / 86400000,
                );
            }

            const totalBytes = list.reduce((s, b) => s + (b.sizeBytes || 0), 0);

            res.json({
                config: cfg,
                lastBackup: newest ? { file: newest.file, createdAt: newest.createdAt, sizeBytes: newest.sizeBytes } : null,
                ageDays,
                // 3 kundan oshsa interfeys qizil ogohlantirish ko'rsatadi
                stale: ageDays === null || ageDays >= 3,
                count: list.length,
                totalBytes,
                scheduler: {
                    running: schedulerState.started,
                    lastRunAt: schedulerState.lastRunAt,
                    lastFile: schedulerState.lastFile,
                    lastError: schedulerState.lastError,
                    lastDeleted: schedulerState.lastDeleted,
                },
            });
        } catch (e: any) {
            console.error('[GET /api/admin/backup/status]', e?.message || e);
            res.status(500).json({ error: 'Zaxira holatini o\'qib bo\'lmadi' });
        }
    });

    /** GET /api/admin/backup/cloud-folders — kompyuterdagi bulut papkalari */
    app.get('/api/admin/backup/cloud-folders', auth, requireRole('CLINIC_ADMIN'), (_req: any, res: any) => {
        try {
            res.json({ folders: findCloudFolders() });
        } catch (e: any) {
            console.error('[GET /api/admin/backup/cloud-folders]', e?.message || e);
            res.json({ folders: [] });
        }
    });

    /** PUT /api/admin/backup/config — jadval sozlamasi */
    app.put('/api/admin/backup/config', auth, requireRole('CLINIC_ADMIN'), async (req: any, res: any) => {
        try {
            const cur = readBackupConfig(userDataPath);
            const b = req.body || {};
            const next: BackupConfig = {
                enabled: b.enabled === undefined ? cur.enabled : !!b.enabled,
                hour: b.hour === undefined ? cur.hour : clampInt(b.hour, 0, 23, cur.hour),
                minute: b.minute === undefined ? cur.minute : clampInt(b.minute, 0, 59, cur.minute),
                twiceDaily: b.twiceDaily === undefined ? cur.twiceDaily : !!b.twiceDaily,
                hour2: b.hour2 === undefined ? cur.hour2 : clampInt(b.hour2, 0, 23, cur.hour2),
                minute2: b.minute2 === undefined ? cur.minute2 : clampInt(b.minute2, 0, 59, cur.minute2),
                keepDaily: b.keepDaily === undefined ? cur.keepDaily : clampInt(b.keepDaily, 2, 365, cur.keepDaily),
                keepMonthly: b.keepMonthly === undefined ? cur.keepMonthly : clampInt(b.keepMonthly, 0, 120, cur.keepMonthly),
                extraDir: b.extraDir === undefined
                    ? cur.extraDir
                    : (typeof b.extraDir === 'string' && b.extraDir.trim() ? b.extraDir.trim() : null),
            };

            /* Ikkinchi manzil tekshiriladi: yozib bo'lmaydigan yo'lni saqlab
               qo'yish — har kuni jimgina xato beradigan sozlama. */
            if (next.extraDir) {
                try {
                    if (!fs.existsSync(next.extraDir)) fs.mkdirSync(next.extraDir, { recursive: true });
                    const probe = path.join(next.extraDir, '.xclinic-write-test');
                    fs.writeFileSync(probe, 'ok', 'utf8');
                    fs.unlinkSync(probe);
                } catch (e: any) {
                    return res.status(400).json({
                        error: `Ikkinchi manzilga yozib bo'lmadi: ${e?.message || e}`,
                    });
                }
            }

            writeBackupConfig(userDataPath, next);
            console.log(`⚙️ Zaxira sozlamasi yangilandi: ${next.enabled ? `${pad(next.hour)}:${pad(next.minute)}` : "o'chirilgan"}`);
            res.json(next);
        } catch (e: any) {
            console.error('[PUT /api/admin/backup/config]', e?.message || e);
            res.status(500).json({ error: 'Sozlamani saqlab bo\'lmadi' });
        }
    });

    /** GET /api/admin/backups — mavjud nusxalar */
    app.get('/api/admin/backups', auth, requireRole('CLINIC_ADMIN'), async (_req: any, res: any) => {
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
    app.post('/api/admin/backup/restore', auth, requireRole('CLINIC_ADMIN'), async (req: any, res: any) => {
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
    app.delete('/api/admin/backup/restore', auth, requireRole('CLINIC_ADMIN'), async (_req: any, res: any) => {
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
    app.get('/api/admin/backup/restore', auth, requireRole('CLINIC_ADMIN'), async (_req: any, res: any) => {
        try {
            if (!fs.existsSync(markerPath)) return res.json({ staged: false });
            const raw = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
            res.json({ staged: true, ...raw });
        } catch {
            res.json({ staged: false });
        }
    });

    /* ═══ YAXLITLIK TEKSHIRUVI ═══════════════════════════════════════════

       Tranzaksiyalar (7.3, 7.4) bundan KEYINGI buzilishlarni to'xtatadi,
       lekin ALLAQACHON buzilgan yozuvlarni topmaydi. Bu endpoint shuni
       qiladi.

       IKKI QAROR, ular tekshiruvlarning shaklini belgilaydi:

       1. RAW SQL EMAS, Prisma agregatsiyalari. Sababi aniq: SQLite da
          `COALESCE(x, 0)` ning literal `0` i INTEGER bo'lib qoladi va Prisma
          uni BigInt qilib qaytaradi — `res.json()` esa BigInt ni
          seriyalashtira olmaydi va endpoint aynan BUZILISH TOPILGAN paytda
          500 beradi. Agregatsiyalar oddiy `number` qaytaradi.

       2. FAQAT SHUBHASIZ buzilishlar "xato" deb belgilanadi. Soxta
          ogohlantirish beradigan tekshiruv — foydasiz tekshiruv: bir-ikki
          marta bekorga qo'ng'iroq qilgandan keyin unga hech kim qaramaydi.
          Shubhali holatlar `warn`, tushuntirish bilan.                     */
    app.get('/api/admin/integrity', auth, requireRole('CLINIC_ADMIN'), async (req: any, res: any) => {
        try {
            const user = req.user || {};
            // Klinika TOKENDAN. Ilgari butun klinikalar ustidagi rol uchun
            // `?clinicId=` dan o'qish yo'li bor edi — u rol bilan birga ketdi.
            const clinicId = user.clinicId;
            if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });

            const LIMIT = 100;               // javobda ko'rsatiladigan misollar soni
            const checks: any[] = [];
            const near = (a: number, b: number) => Math.abs(a - b) < 0.001;

            /* ── (a) To'lovlar: SUM(ChargePayment) == paidAmount ──────────
               ChargePayment qaytarishni MANFIY summa bilan yozadi, qaytarish
               esa `paidAmount` ni kamaytiradi — ya'ni yig'indi baribir mos
               kelishi kerak. */
            const [charges, payGroups] = await Promise.all([
                prisma.visitCharge.findMany({
                    where: { clinicId },
                    select: {
                        id: true, name: true, patientName: true,
                        paidAmount: true, total: true, status: true,
                    },
                }),
                prisma.chargePayment.groupBy({
                    by: ['chargeId'],
                    where: { clinicId },
                    _sum: { amount: true },
                    _count: { _all: true },
                }),
            ]);
            const paidByCharge = new Map<string, { sum: number; count: number }>(
                payGroups.map((g: any) => [g.chargeId, { sum: g._sum.amount || 0, count: g._count._all }]),
            );

            const mismatchA: any[] = [];
            const legacyA: any[] = [];
            for (const c of charges) {
                const rec = paidByCharge.get(c.id);
                const sum = rec?.sum || 0;
                const paid = c.paidAmount || 0;
                if (near(sum, paid)) continue;

                const row = {
                    id: c.id, patientName: c.patientName, name: c.name,
                    paidAmount: Math.round(paid), paymentsSum: Math.round(sum),
                    diff: Math.round(paid - sum),
                };
                /* Bitta ham ChargePayment qatori yo'q, lekin pul yozilgan —
                   bu 0006-migratsiyagacha bo'lgan ESKI yozuv. Buzilish emas,
                   meros: o'sha paytda ChargePayment jadvali yo'q edi. */
                if (!rec) legacyA.push(row); else mismatchA.push(row);
            }
            checks.push({
                key: 'charge_payments',
                title: "To'lovlar: chek qatorlari yig'indisi to'langan summaga teng",
                severity: mismatchA.length ? 'error' : 'ok',
                count: mismatchA.length,
                scanned: charges.length,
                sample: mismatchA.slice(0, LIMIT),
            });
            if (legacyA.length) {
                checks.push({
                    key: 'charge_payments_legacy',
                    title: "Eski yozuvlar: to'lov bor, chek qatori yo'q (0006-migratsiyagacha)",
                    severity: 'info',
                    count: legacyA.length,
                    scanned: charges.length,
                    sample: legacyA.slice(0, LIMIT),
                    note: "Buzilish emas — o'sha paytda ChargePayment jadvali mavjud emas edi.",
                });
            }

            /* ── (b) Holat: to'liq to'langan qator 'Paid' bo'lishi kerak ── */
            const statusBad = charges.filter(
                (c: any) => c.status === 'Unpaid' && (c.paidAmount || 0) >= c.total - 0.001 && c.total > 0,
            );
            checks.push({
                key: 'charge_status',
                title: "Holat: to'liq to'langan qator 'Paid' bo'lishi kerak",
                severity: statusBad.length ? 'error' : 'ok',
                count: statusBad.length,
                scanned: charges.length,
                sample: statusBad.slice(0, LIMIT).map((c: any) => ({
                    id: c.id, patientName: c.patientName, name: c.name,
                    paidAmount: Math.round(c.paidAmount || 0), total: Math.round(c.total), status: c.status,
                })),
            });

            /* ── (b2) Bekor qilingan, lekin puli olingan ──────────────────
               `warn`, `error` EMAS. Sababi: `cancelChargesBySource`
               (billing.ts) qisman to'langan qatorni ham bekor qiladi —
               shifokor muolajani o'chirsa shunday bo'ladi va bu KO'ZDA
               TUTILGAN amal. Pul esa qaytarilishi kerak, shuning uchun
               ko'rsatamiz, lekin "buzilish" demaymiz. */
            const cancelledPaid = charges.filter(
                (c: any) => c.status === 'Cancelled' && (c.paidAmount || 0) > 0.001,
            );
            checks.push({
                key: 'cancelled_paid',
                title: "Bekor qilingan qator, lekin puli olingan — qaytarish kerakmi?",
                severity: cancelledPaid.length ? 'warn' : 'ok',
                count: cancelledPaid.length,
                scanned: charges.length,
                sample: cancelledPaid.slice(0, LIMIT).map((c: any) => ({
                    id: c.id, patientName: c.patientName, name: c.name,
                    paidAmount: Math.round(c.paidAmount || 0),
                })),
                note: "Muolaja o'chirilganda qator bekor bo'ladi — bu normal. Pul qaytarilganini tekshiring.",
            });

            /* ── (c) Ombor: PARTIYA bo'yicha ──────────────────────────────
               NIMA UCHUN partiya bo'yicha, mahsulot qoldig'i bo'yicha EMAS.

               Omborda ikki avlod hisobi yonma-yon yashaydi: yangi yo'l
               `StockMovement` yozadi, eski yo'l (`PUT /api/inventory/:id/stock`,
               bemor kartasidan material) esa `InventoryLog` ga yozadi va
               qoldiqni ABSOLYUT qiymat bilan almashtiradi. Shuning uchun
               "qoldiq = harakatlar yig'indisi" tekshiruvi eski yo'l
               ishlatilgan har mahsulotda SOXTA xato berardi.

               Partiya esa faqat yangi yo'lda o'zgaradi: kirim partiyani
               yaratadi va +qty harakat yozadi, FEFO chiqimi partiyani
               kamaytirib −take yozadi. Ya'ni har partiya uchun
               `SUM(harakatlar) == partiya qoldig'i` — bu ANIQ invariant. */
            const items = await prisma.inventoryItem.findMany({
                where: { clinicId },
                select: { id: true, name: true, quantity: true, unit: true },
            });
            const itemIds = items.map((i: any) => i.id);
            const itemName = new Map(items.map((i: any) => [i.id, i.name]));

            const [batches, batchGroups] = await Promise.all([
                prisma.inventoryBatch.findMany({
                    where: { itemId: { in: itemIds } },
                    select: { id: true, itemId: true, batchNumber: true, quantity: true },
                }),
                prisma.stockMovement.groupBy({
                    by: ['batchId'],
                    where: { clinicId, batchId: { not: null } },
                    _sum: { quantity: true },
                }),
            ]);
            const moveByBatch = new Map<string, number>(
                batchGroups.map((g: any) => [g.batchId, g._sum.quantity || 0]),
            );

            const batchBad = batches
                .map((b: any) => ({ b, sum: moveByBatch.get(b.id) ?? 0 }))
                .filter(({ b, sum }: any) => !near(sum, b.quantity))
                .map(({ b, sum }: any) => ({
                    batchId: b.id, itemName: itemName.get(b.itemId) || '?',
                    batchNumber: b.batchNumber, quantity: b.quantity,
                    movementsSum: sum, diff: Math.round((b.quantity - sum) * 1000) / 1000,
                }));

            checks.push({
                key: 'batch_movements',
                title: "Ombor: har partiya qoldig'i o'z harakatlari yig'indisiga teng",
                severity: batchBad.length ? 'error' : 'ok',
                count: batchBad.length,
                scanned: batches.length,
                sample: batchBad.slice(0, LIMIT),
            });

            /* ── (c2) MAHSULOT qoldig'i = harakatlar yig'indisi ───────────

               0028 gacha bu tekshiruv MUMKIN EMAS edi: eski yo'l
               (`InventoryLog`) qoldiqni harakat yozmasdan o'zgartirardi va
               har mahsulotda soxta xato chiqardi. Shuning uchun o'rnida
               "ikki jurnal ishlatilgan" degan MA'LUMOT bandi turardi.

               0028 uchta narsani qildi: eski qatorlar harakatga ko'chirildi,
               boshlang'ich qoldiqlar ochilish harakati bilan yopildi, eski
               yo'l esa 410 qaytaradi. Endi invariant haqiqiy.

               'Transfer' CHIQARILADI: u bo'lim ichidagi ko'chirish, musbat
               yoziladi, lekin umumiy qoldiqqa tegmaydi. */
            const itemGroups = await prisma.stockMovement.groupBy({
                by: ['itemId'],
                where: { clinicId, type: { not: 'Transfer' } },
                _sum: { quantity: true },
            });
            const moveByItem = new Map<string, number>(
                itemGroups.map((g: any) => [g.itemId, g._sum.quantity || 0]),
            );
            const itemBad = items
                .map((i: any) => ({ i, sum: moveByItem.get(i.id) ?? 0 }))
                .filter(({ i, sum }: any) => !near(sum, i.quantity))
                .map(({ i, sum }: any) => ({
                    itemId: i.id, itemName: i.name, unit: i.unit,
                    quantity: i.quantity, movementsSum: sum,
                    diff: Math.round((i.quantity - sum) * 1000) / 1000,
                }));

            checks.push({
                key: 'item_movements',
                title: "Ombor: har mahsulot qoldig'i o'z harakatlari yig'indisiga teng",
                severity: itemBad.length ? 'error' : 'ok',
                count: itemBad.length,
                scanned: items.length,
                sample: itemBad.slice(0, LIMIT),
                note: "Farq chiqsa — qoldiq harakat yozmasdan o'zgargan. "
                    + "Sababi odatda to'g'ridan-to'g'ri bazaga yozish yoki eski yo'l.",
            });

            /* ── (c3) Eski jurnalga YANGI yozuv tushmayaptimi ──────────────
               0028 dan keyin `InventoryLog` ga hech kim yozmasligi kerak.
               Yozilgan bo'lsa — kimdir yopilgan yo'lni tiriltirgan. */
            const lastLegacy = await prisma.inventoryLog.findFirst({
                where: { itemId: { in: itemIds } },
                orderBy: { date: 'desc' },
                select: { id: true, date: true, itemId: true },
            });
            const cutoff = new Date('2026-08-28T00:00:00.000Z');
            const legacyFresh = lastLegacy && new Date(lastLegacy.date) > cutoff;
            checks.push({
                key: 'inventory_legacy_writes',
                title: 'Eski ombor jurnaliga yangi yozuv tushmagan',
                severity: legacyFresh ? 'error' : 'ok',
                count: legacyFresh ? 1 : 0,
                scanned: 1,
                sample: legacyFresh
                    ? [{ itemName: itemName.get(lastLegacy!.itemId) || '?', date: lastLegacy!.date }]
                    : [],
                note: "Eski jadval tarix uchun turibdi. Unga yozilsa — yopilgan "
                    + "yo'l qaytadan ochilgan, ombor hisobi yana ikkiga bo'linadi.",
            });

            /* ── (c3) KASRLI PUL — 11.1-B o'rniga arzon qo'riqchi ─────────

               O'zbek so'mi butun son. Yozish nuqtalari `money.ts` orqali
               yaxlitlaydi (11.1-A), ya'ni kasr paydo bo'lmasligi kerak.

               Ustun turini `Float` dan `Int` ga ko'chirish (11.1-B) buni
               BAZA darajasida majburlardi, lekin SQLite da bu ~20 jadvalni
               qayta qurishni talab qiladi va migratsiya mexanizmi buni
               bajara olmaydi (PRAGMA tranzaksiya ichida ishlamaydi).

               O'lchov ko'rsatdiki, yozish nuqtalari kafolatni allaqachon
               beradi. Shuning uchun qimmat ko'chirish o'rniga — TEKSHIRUV:
               kasr paydo bo'lsa darhol ko'rinadi va sababi topiladi. */
            const moneyCols: [string, string][] = [
                ['Transaction', 'amount'], ['VisitCharge', 'total'], ['VisitCharge', 'paidAmount'],
                ['VisitCharge', 'unitPrice'], ['VisitCharge', 'discount'],
                ['ChargePayment', 'amount'], ['Patient', 'balance'], ['CashMovement', 'amount'],
                ['Expense', 'amount'],
            ];
            const fracRows: any[] = [];
            let moneyScanned = 0;
            for (const [table, col] of moneyCols) {
                try {
                    /* `CAST(... AS REAL)` — 7.5 dagi BigInt tuzog'idan qochish
                       uchun: `COUNT(*)` INTEGER qaytaradi va JSON ga
                       seriyalashtirilmaydi. */
                    const rows: any = await prisma.$queryRawUnsafe(
                        `SELECT CAST(COUNT(*) AS REAL) AS n FROM "${table}" ` +
                        `WHERE "${col}" IS NOT NULL AND "${col}" != CAST("${col}" AS INTEGER) ` +
                        `AND "${table}".clinicId = ?`,
                        clinicId,
                    );
                    const n = Number(rows?.[0]?.n || 0);
                    moneyScanned++;
                    if (n > 0) fracRows.push({ table, column: col, count: n });
                } catch {
                    /* Ustunda `clinicId` bo'lmasa (masalan `ChargePayment` da bor,
                       lekin kelajakda o'zgarishi mumkin) — o'tkazib yuboramiz. */
                }
            }
            checks.push({
                key: 'money_precision',
                title: "Pul qiymatlari butun so'mda",
                severity: fracRows.length ? 'warn' : 'ok',
                count: fracRows.reduce((s, r) => s + r.count, 0),
                scanned: moneyScanned,
                sample: fracRows,
                note: fracRows.length
                    ? "Kasrli summa topildi — yozish nuqtasi `money.ts` dan o'tmayapti."
                    : undefined,
            });

            /* ── (d) Avans balansi ────────────────────────────────────────
               Formula `billing.ts` dagi `findBalanceMismatches` da — balansni
               qayta hisoblash endpointi ham AYNAN o'shani ishlatadi. */
            const bal = await findBalanceMismatches(prisma, { clinicId });
            checks.push({
                key: 'patient_balance',
                title: 'Avans: bemor balansi cheklar va qaytarishlarga mos',
                severity: bal.diffs.length ? 'warn' : 'ok',
                count: bal.diffs.length,
                scanned: bal.checked,
                sample: bal.diffs.slice(0, LIMIT),
                note: bal.diffs.length
                    ? "Sozlamalar → «Balanslarni qayta hisoblash» bilan tuzatiladi. "
                      + "Chek yoki kassa harakati o'chirilgan bo'lsa farq shundan bo'lishi mumkin."
                    : undefined,
            });

            const errors = checks.filter((c) => c.severity === 'error');
            const warns = checks.filter((c) => c.severity === 'warn');
            res.json({
                checkedAt: new Date().toISOString(),
                ok: errors.length === 0,
                errorCount: errors.reduce((s, c) => s + c.count, 0),
                warnCount: warns.reduce((s, c) => s + c.count, 0),
                checks,
            });
        } catch (e: any) {
            console.error('[GET /api/admin/integrity]', e?.message || e);
            res.status(500).json({ error: `Yaxlitlikni tekshirib bo'lmadi: ${describeDbError(e)}` });
        }
    });

    /**
     * Sxema holati. Ko'rish uchun: qo'llab-quvvatlashda birinchi savol —
     * "klinikada qaysi versiya".
     *
     * `clinicId` ATAYLAB ishlatilmaydi: sxema o'rnatmaga bitta, klinikaga emas.
     */
    app.get('/api/admin/schema-status', auth, requireRole('CLINIC_ADMIN'), async (_req: any, res: any) => {
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
