/* ─────────────────────────────────────────────────────────────────────────────
   0028 sinovi — eski ombor jurnalini ko'chirish.

   NIMA UCHUN ALOHIDA SINOV KERAK. Dev bazada `InventoryLog` BO'SH (0 qator).
   Ya'ni migratsiyani shu bazada yurgizib "o'tdi" deyish hech narsani
   isbotlamaydi: ko'chiriladigan ma'lumotning o'zi yo'q. Klinika bazasida esa
   u bor — va aynan o'sha yerda xato qilib bo'lmaydi.

   Shuning uchun bu yerda ATAYLAB eski holat yasaladi:
     · mahsulot yaratiladi va qoldiq TO'G'RIDAN-TO'G'RI yoziladi, bironta
       harakatsiz — 0028 gacha `POST /api/inventory` aynan shunday qilardi;
     · unga eski jurnal qatorlari qo'yiladi (bemor kartasidan material).

   Keyin migratsiya SQL fayli xuddi server qanday qo'llasa shunday qo'llanadi
   va invariant tekshiriladi.

   Ishga tushirish:  cd backend && npm run test:migration
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import path from 'path';
import os from 'os';

const Database = require('better-sqlite3');

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


const MIGRATION = '0028_stock_single_ledger';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

/** Server bilan BIR XIL bo'linish: `--` izohlar tashlanadi, `;` bo'yicha bo'linadi. */
function splitStatements(sql: string): string[] {
    return sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function main() {
    const backendDir = path.resolve(__dirname, '..');
    const srcDb = path.join(backendDir, 'prisma', 'xclinic.db');
    const sqlFile = path.join(backendDir, 'migrations', `${MIGRATION}.sql`);

    if (!fs.existsSync(srcDb)) { console.error(`Baza topilmadi: ${srcDb}`); process.exit(1); }
    if (!fs.existsSync(sqlFile)) { console.error(`Migratsiya topilmadi: ${sqlFile}`); process.exit(1); }

    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xclinic-mig0028-'));
    const dbPath = path.join(workDir, 'xclinic.db');
    snapshotDb(srcDb, dbPath);
    console.log(`\nBaza nusxasi: ${dbPath}`);

    const db = new Database(dbPath);
    const now = new Date().toISOString();

    try {
        /* ── Nusxani 0028 gacha bo'lgan holatga QAYTARAMIZ ──────────────────
           Dev bazada migratsiya allaqachon qo'llangan. Uni shunchaki
           "o'tkazib yuborsak" sinov hech qachon ishlamaydi va yolg'on
           xotirjamlik beradi — bu sinovning o'zi bo'lmaganidan yomonroq.

           Jadvalni qayta qurish odatda TAQIQLANGAN (migrations/README), lekin
           bu YO'Q QILINADIGAN nusxa, klinika bazasi emas. */
        db.prepare(`DELETE FROM "SchemaMigration" WHERE version = ?`).run(MIGRATION);
        const cols = db.prepare(`PRAGMA table_info("StockMovement")`).all().map((c: any) => c.name);
        if (cols.includes('patientId')) {
            db.transaction(() => {
                db.prepare(`DELETE FROM "StockMovement" WHERE id LIKE 'mig28-%' OR id LIKE 'open28-%'`).run();
                db.prepare(`
                    CREATE TABLE "_sm_pre0028" AS SELECT
                        id, clinicId, itemId, batchId, type, quantity, reason,
                        visitId, serviceId, note, userName, createdAt,
                        fromDepartmentId, toDepartmentId
                    FROM "StockMovement"
                `).run();
                db.prepare(`DROP TABLE "StockMovement"`).run();
                db.prepare(`ALTER TABLE "_sm_pre0028" RENAME TO "StockMovement"`).run();
            })();
            console.log("  (nusxa 0028 gacha bo'lgan holatga qaytarildi)");
        }

        const clinic: any = db.prepare(`SELECT id FROM "Clinic" LIMIT 1`).get();
        if (!clinic) { console.error('Klinika topilmadi'); process.exit(1); }

        const patient: any = db.prepare(`SELECT id FROM "Patient" WHERE clinicId = ? LIMIT 1`).get(clinic.id);

        console.log('\n═══ TAYYORGARLIK — 0028 gacha bo\'lgan holat yasaladi ═══');

        /* Mahsulot: qoldiq 25, harakat YO'Q. Bu 0028 gacha `POST /api/inventory`
           ning aynan xatti-harakati — shuning uchun item darajasidagi
           invariant o'sha paytda umuman tekshirib bo'lmaydigan edi. */
        const itemId = `t0028-item-${Date.now()}`;
        db.prepare(`
            INSERT INTO "InventoryItem"
                (id, name, unit, quantity, minQuantity, clinicId, price,
                 isMedication, isConsumable, createdAt, updatedAt)
            VALUES (?, ?, 'dona', 25, 0, ?, 1000, 0, 1, ?, ?)
        `).run(itemId, `0028 sinov materiali`, clinic.id, now, now);

        /* Eski jurnal: bemor kartasidan ikki marta material yozilgan.
           `change` ishorali — chiqim manfiy. */
        const logIns = db.prepare(`
            INSERT INTO "InventoryLog" (id, itemId, change, type, note, date, userName, patientId)
            VALUES (?, ?, ?, 'OUT', ?, ?, 'Doctor', ?)
        `);
        logIns.run(`t0028-log-a-${Date.now()}`, itemId, -3, 'Bemor: sinov A', now, patient?.id || null);
        logIns.run(`t0028-log-b-${Date.now()}`, itemId, -2, 'Bemor: sinov B', now, patient?.id || null);

        // Eski yo'l qoldiqni ham qayta yozardi: 25 − 3 − 2 = 20
        db.prepare(`UPDATE "InventoryItem" SET quantity = 20 WHERE id = ?`).run(itemId);

        ok('eski holat yasaldi: harakatsiz mahsulot + 2 ta eski jurnal qatori',
            db.prepare(`SELECT COUNT(*) c FROM "InventoryLog" WHERE itemId = ?`).get(itemId).c === 2);

        const beforeMoves = db.prepare(`SELECT COUNT(*) c FROM "StockMovement" WHERE itemId = ?`).get(itemId).c;
        ok('migratsiyagacha bu mahsulotda harakat yo\'q', beforeMoves === 0, `harakatlar: ${beforeMoves}`);

        // ── MIGRATSIYA ──────────────────────────────────────────────────────
        console.log('\n═══ MIGRATSIYA QO\'LLANADI ═════════════════════════');
        const sql = fs.readFileSync(sqlFile, 'utf8');
        const statements = splitStatements(sql);
        const runAll = db.transaction(() => {
            for (const st of statements) db.prepare(st).run();
        });
        runAll();
        console.log(`  ${statements.length} ta instruksiya qo'llanildi`);

        // ── TEKSHIRUV ───────────────────────────────────────────────────────
        console.log('\n═══ 1. Eski qatorlar ko\'chirildimi ════════════════');
        const legacy: any[] = db.prepare(`
            SELECT * FROM "StockMovement" WHERE itemId = ? AND reason = 'Legacy' ORDER BY quantity
        `).all(itemId);
        ok('ikkala eski qator harakatga aylandi', legacy.length === 2, `topildi: ${legacy.length}`);
        ok('miqdorlar saqlandi (−3 va −2)',
            legacy.map((m) => m.quantity).join(',') === '-3,-2',
            legacy.map((m) => m.quantity).join(','));
        ok('turi Out deb belgilandi', legacy.every((m) => m.type === 'Out'));
        if (patient?.id) {
            ok('bemor bog\'lanishi saqlandi', legacy.every((m) => m.patientId === patient.id));
        }
        ok('partiyasiz (batchId bo\'sh) — eski yo\'l partiyaga tegmagan edi',
            legacy.every((m) => m.batchId === null));

        console.log('\n═══ 2. Boshlang\'ich qoldiq yopildimi ══════════════');
        const opening: any = db.prepare(`
            SELECT * FROM "StockMovement" WHERE id = ?
        `).get(`open28-${itemId}`);
        ok('ochilish harakati yozildi', !!opening);
        // 20 = 25 − 5, ya'ni ochilish 25 bo'lishi kerak
        ok('ochilish miqdori to\'g\'ri (25)', opening && Math.abs(opening.quantity - 25) < 0.0005,
            `yozilgan: ${opening?.quantity}`);
        ok('sababi Inventory', opening?.reason === 'Inventory');

        console.log('\n═══ 3. INVARIANT — butun baza bo\'yicha ════════════');
        const bad: any[] = db.prepare(`
            SELECT i.id, i.name, i.quantity,
                   COALESCE((SELECT SUM(m.quantity) FROM "StockMovement" m
                             WHERE m.itemId = i.id AND m.type <> 'Transfer'), 0) AS movesum
            FROM "InventoryItem" i
            WHERE ABS(i.quantity - COALESCE((SELECT SUM(m.quantity) FROM "StockMovement" m
                     WHERE m.itemId = i.id AND m.type <> 'Transfer'), 0)) > 0.0005
        `).all();
        ok('har mahsulot: qoldiq = harakatlar yig\'indisi', bad.length === 0,
            bad.slice(0, 3).map((b) => `${b.name}: ${b.quantity} ≠ ${b.movesum}`).join(' | '));

        const totalItems = db.prepare(`SELECT COUNT(*) c FROM "InventoryItem"`).get().c;
        console.log(`  (tekshirildi: ${totalItems} ta mahsulot)`);

        console.log('\n═══ 4. Partiya invarianti buzilmadimi ═════════════');
        const batchBad: any[] = db.prepare(`
            SELECT b.id, b.quantity,
                   COALESCE((SELECT SUM(m.quantity) FROM "StockMovement" m WHERE m.batchId = b.id), 0) AS movesum
            FROM "InventoryBatch" b
            WHERE ABS(b.quantity - COALESCE((SELECT SUM(m.quantity) FROM "StockMovement" m
                     WHERE m.batchId = b.id), 0)) > 0.0005
        `).all();
        ok('har partiya: qoldiq = o\'z harakatlari yig\'indisi', batchBad.length === 0,
            `buzilgan: ${batchBad.length}`);

        console.log('\n═══ 5. Ikki marta qo\'llanmaydimi ══════════════════');
        /* Migratsiya mexanizmi buni allaqachon `SchemaMigration` bilan
           to'xtatadi. Lekin himoya ikki qavatli bo'lgani yaxshi: `id` ataylab
           hosil qilingani uchun ikkinchi urinish PRIMARY KEY xatosi beradi —
           jimgina ikkilangan qatordan ko'ra xato yaxshi. */
        let threw = false;
        try {
            db.transaction(() => { for (const st of statements) db.prepare(st).run(); })();
        } catch { threw = true; }
        ok('takroran qo\'llash xato beradi (jimgina ikkilanish yo\'q)', threw);

        // Rad etilgan tranzaksiyadan keyin holat buzilmaganini tasdiqlaymiz
        const badAfter = db.prepare(`
            SELECT COUNT(*) c FROM "InventoryItem" i
            WHERE ABS(i.quantity - COALESCE((SELECT SUM(m.quantity) FROM "StockMovement" m
                     WHERE m.itemId = i.id AND m.type <> 'Transfer'), 0)) > 0.0005
        `).get().c;
        ok('xatodan keyin ham invariant butun', badAfter === 0);

    } finally {
        db.close();
    }

    console.log(`\n═══════════════════════════════════════════════════`);
    console.log(`  O'tdi: ${pass}   Yiqildi: ${fail}`);
    console.log(`═══════════════════════════════════════════════════\n`);

    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* muhim emas */ }
    process.exit(fail > 0 ? 1 : 0);
}

main();
