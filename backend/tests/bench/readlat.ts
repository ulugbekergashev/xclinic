/* 7.0, ikkinchi o'lchov: UZOQ YOZUV paytida O'QISH qancha kutadi?

   Klinika ssenariysi: kassir to'lovni saqlayapti (tranzaksiya, ~300 ms),
   shu paytda shifokorning navbati, laborant ekrani va navbat tablosi
   ma'lumot so'raydi. Ular qancha kutadi?

   Uchta sozlama taqqoslanadi:
     A) rollback-journal, connection_limit sozlanmagan  — 7.0 gacha
     B) WAL, connection_limit sozlanmagan               — faqat WAL
     C) WAL + connection_limit=1                        — WAL + navbat

   Ishga tushirish:  cd backend && npx ts-node --transpile-only _t_readlat.ts
*/
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const WRITE_HOLD_MS = 300;   // yozuv tranzaksiyasi qancha ushlab turadi
const READERS = 6;           // nechta parallel o'quvchi

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function measure(label: string, dbFile: string, opts: {
    connectionLimit1: boolean; wal: boolean;
}) {
    for (const s of ['', '-wal', '-shm', '-journal']) {
        try { fs.existsSync(dbFile + s) && fs.unlinkSync(dbFile + s); } catch { /* ignore */ }
    }
    const url = `file:${dbFile}` + (opts.connectionLimit1 ? '?connection_limit=1' : '');
    const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'], errorFormat: 'minimal' });

    let journalMode = 'delete';
    if (opts.wal) {
        const w: any = await db.$queryRawUnsafe(`PRAGMA journal_mode = WAL`);
        journalMode = String(w?.[0]?.journal_mode ?? '?');
    }
    await db.$queryRawUnsafe(`PRAGMA busy_timeout = 10000`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_LatProbe" ("id" INTEGER PRIMARY KEY, "n" INTEGER NOT NULL)`);
    await db.$executeRawUnsafe(`DELETE FROM "_LatProbe"`);
    await db.$executeRawUnsafe(`INSERT INTO "_LatProbe" ("id","n") VALUES (1, 0)`);

    // Uzoq yozuv tranzaksiyasini boshlaymiz
    const writeStarted = Date.now();
    const writePromise = db.$transaction(async (tx: any) => {
        await tx.$executeRawUnsafe(`UPDATE "_LatProbe" SET n = n + 1 WHERE id = 1`);
        await sleep(WRITE_HOLD_MS);
    }, { timeout: 20000, maxWait: 20000 });

    // Yozuv boshlanishiga ulgursin, keyin o'quvchilarni qo'yib yuboramiz
    await sleep(40);

    const readLatencies: number[] = [];
    const readErrors: string[] = [];
    await Promise.all(Array.from({ length: READERS }, async () => {
        const t0 = Date.now();
        try {
            await db.$queryRawUnsafe(`SELECT n FROM "_LatProbe" WHERE id = 1`);
            readLatencies.push(Date.now() - t0);
        } catch (e: any) {
            readErrors.push(String(e?.message || e).split('\n').pop() || '?');
        }
    }));

    await writePromise;
    const writeTotal = Date.now() - writeStarted;
    await db.$disconnect();

    const max = readLatencies.length ? Math.max(...readLatencies) : -1;
    const avg = readLatencies.length
        ? Math.round(readLatencies.reduce((a, b) => a + b, 0) / readLatencies.length) : -1;

    console.log(`\n  ${label}`);
    console.log(`    journal_mode         : ${journalMode}`);
    console.log(`    o'qish kechikishi    : o'rtacha ${avg} ms, eng yomoni ${max} ms`);
    console.log(`    yozuv davomiyligi    : ${writeTotal} ms (ushlash ${WRITE_HOLD_MS} ms)`);
    if (readErrors.length) console.log(`    o'qish xatolari      : ${readErrors.length} — ${readErrors[0].slice(0, 70)}`);
    console.log(`    ${max < WRITE_HOLD_MS / 2 ? "✅ o'qish yozuvni KUTMADI" : "❌ o'qish yozuv ortida navbatda turdi"}`);

    for (const s of ['', '-wal', '-shm', '-journal']) {
        try { fs.existsSync(dbFile + s) && fs.unlinkSync(dbFile + s); } catch { /* ignore */ }
    }
    return { max, avg, journalMode };
}

async function main() {
    const d = __dirname;
    console.log(`\n${WRITE_HOLD_MS} ms davom etadigan yozuv tranzaksiyasi paytida ${READERS} ta parallel o'qish`);
    console.log('═'.repeat(66));

    const a = await measure('A) rollback-journal, limit sozlanmagan  (7.0 gacha)', path.join(d, '_t_lat_a.db'), { connectionLimit1: false, wal: false });
    const b = await measure('B) WAL, limit sozlanmagan', path.join(d, '_t_lat_b.db'), { connectionLimit1: false, wal: true });
    const c = await measure('C) WAL + connection_limit=1', path.join(d, '_t_lat_c.db'), { connectionLimit1: true, wal: true });

    console.log('\n' + '═'.repeat(66));
    console.log('XULOSA — eng yomon o\'qish kechikishi:');
    console.log(`  A) rollback-journal, limitsiz : ${a.max} ms`);
    console.log(`  B) WAL, limitsiz              : ${b.max} ms`);
    console.log(`  C) WAL + connection_limit=1   : ${c.max} ms`);
    console.log(`\n  Eng yaxshisi: ${[['A', a.max], ['B', b.max], ['C', c.max]].sort((x: any, y: any) => x[1] - y[1])[0][0]}`);
    process.exit(0);
}

main().catch((e) => { console.error("O'lchov yiqildi:", e); process.exit(1); });
