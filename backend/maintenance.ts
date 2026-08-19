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

export function registerMaintenanceRoutes(app: express.Express, deps: Deps) {
    const { prisma, authenticateToken: auth, requireRole, migrationsDir } = deps;

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
