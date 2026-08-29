/* 7.0 o'lchovi: interaktiv tranzaksiyalar parallel ishlaganda SQLite
   qulflanadimi va yangilanish yo'qoladimi?

   Tekshiruvchi haqli talab qo'ydi: "Amallar tartibini o'zgartirishdan OLDIN
   buni o'lchash shart, aks holda bu asossiz o'zgarish."

   Ikki sozlamani YONMA-YON o'lchaydi:
     A) connection_limit sozlanmagan (7.0 gacha bo'lgan holat)
     B) connection_limit=1 + WAL + busy_timeout (7.0 dan keyin)

   Ishga tushirish:  cd backend && npx ts-node --transpile-only _t_locking.ts
*/
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const PARALLEL = 12;      // bir vaqtda nechta tranzaksiya
const HOLD_MS = 60;       // har biri qulfni shuncha ushlab turadi

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome = {
    label: string;
    journalMode: string;
    ok: number;
    failed: number;
    lockErrors: number;
    finalN: number;
    elapsed: number;
    errors: string[];
};

async function measure(label: string, dbFile: string, opts: {
    connectionLimit1: boolean; pragmas: boolean;
}): Promise<Outcome> {
    // Har o'lchov uchun toza baza
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
        try { fs.existsSync(dbFile + suffix) && fs.unlinkSync(dbFile + suffix); } catch { /* ignore */ }
    }

    const url = `file:${dbFile}` + (opts.connectionLimit1 ? '?connection_limit=1' : '');
    const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'], errorFormat: 'minimal' });

    let journalMode = 'delete';
    if (opts.pragmas) {
        const w: any = await db.$queryRawUnsafe(`PRAGMA journal_mode = WAL`);
        journalMode = String(w?.[0]?.journal_mode ?? '?');
        await db.$queryRawUnsafe(`PRAGMA busy_timeout = 10000`);
        await db.$executeRawUnsafe(`PRAGMA synchronous = NORMAL`);
    }

    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_LockProbe" ("id" INTEGER PRIMARY KEY, "n" INTEGER NOT NULL)`);
    await db.$executeRawUnsafe(`DELETE FROM "_LockProbe"`);
    await db.$executeRawUnsafe(`INSERT INTO "_LockProbe" ("id","n") VALUES (1, 0)`);

    const started = Date.now();
    const results = await Promise.allSettled(
        Array.from({ length: PARALLEL }, () =>
            db.$transaction(async (tx: any) => {
                const rows: any = await tx.$queryRawUnsafe(`SELECT n FROM "_LockProbe" WHERE id = 1`);
                const n = Number(rows[0].n);
                await sleep(HOLD_MS);                 // qulfni ushlab turamiz
                await tx.$executeRawUnsafe(`UPDATE "_LockProbe" SET n = ${n + 1} WHERE id = 1`);
            }, { timeout: 20000, maxWait: 20000 }),
        ),
    );
    const elapsed = Date.now() - started;

    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    const msgs = failed.map((f) => {
        const m = String(f.reason?.message || f.reason).split('\n').map((s) => s.trim()).filter(Boolean);
        return m[m.length - 1] || '?';
    });
    const lockErrors = msgs.filter((m) => /locked|busy|connection pool|Timed out/i.test(m)).length;

    const final: any = await db.$queryRawUnsafe(`SELECT n FROM "_LockProbe" WHERE id = 1`);
    await db.$disconnect();

    return {
        label, journalMode,
        ok: results.length - failed.length,
        failed: failed.length,
        lockErrors,
        finalN: Number(final[0].n),
        elapsed,
        errors: [...new Set(msgs)].slice(0, 3),
    };
}

function report(o: Outcome) {
    console.log(`\n  ${o.label}`);
    console.log(`    journal_mode        : ${o.journalMode}`);
    console.log(`    muvaffaqiyatli      : ${o.ok}/${PARALLEL}`);
    console.log(`    qulf xatolari       : ${o.lockErrors}`);
    console.log(`    yakuniy son         : ${o.finalN} / ${PARALLEL} ${o.finalN === PARALLEL ? '' : `← ${PARALLEL - o.finalN} ta YO'QOLDI`}`);
    console.log(`    vaqt                : ${o.elapsed} ms`);
    for (const e of o.errors) console.log(`    xato: ${e.slice(0, 100)}`);
}

async function main() {
    const dir = __dirname;
    console.log(`\n${PARALLEL} ta parallel interaktiv tranzaksiya, har biri o'qish → ${HOLD_MS} ms → yozish`);
    console.log('═'.repeat(64));

    const before = await measure(
        'A) 7.0 GACHA — connection_limit sozlanmagan, rollback-journal',
        path.join(dir, '_t_lock_a.db'), { connectionLimit1: false, pragmas: false });
    report(before);

    const after = await measure(
        'B) 7.0 DAN KEYIN — connection_limit=1 + WAL + busy_timeout',
        path.join(dir, '_t_lock_b.db'), { connectionLimit1: true, pragmas: true });
    report(after);

    console.log('\n' + '═'.repeat(64));
    console.log('XULOSA');
    console.log(`  WAL yoqildi                  : ${after.journalMode === 'wal' ? "✅ ha" : '❌ ' + after.journalMode}`);
    console.log(`  Qulf xatolari (A → B)        : ${before.lockErrors} → ${after.lockErrors} ${after.lockErrors === 0 ? '✅' : '❌'}`);
    console.log(`  Yo'qolgan yangilanish (A → B): ${PARALLEL - before.finalN} → ${PARALLEL - after.finalN} ${after.finalN === PARALLEL ? '✅' : '❌'}`);

    for (const f of ['_t_lock_a.db', '_t_lock_b.db']) {
        for (const s of ['', '-wal', '-shm', '-journal']) {
            try { fs.existsSync(path.join(dir, f + s)) && fs.unlinkSync(path.join(dir, f + s)); } catch { /* ignore */ }
        }
    }

    const pass = after.journalMode === 'wal' && after.lockErrors === 0 && after.finalN === PARALLEL;
    console.log(`\n${pass ? '✅ 7.0 poydevori tayyor' : '❌ muammo bor'}\n`);
    process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("O'lchov yiqildi:", e); process.exit(1); });
