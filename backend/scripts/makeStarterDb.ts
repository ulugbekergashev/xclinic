/* BOSHLANG'ICH BAZANI YASASH — `starter.db`.
 *
 * NIMA UCHUN KERAK. Paketlangan nusxada Prisma CLI yo'q, ya'ni sxemani
 * joyida yaratib bo'lmaydi. Electron birinchi ishga tushishda tayyor
 * `starter.db` ni foydalanuvchi katalogiga ko'chiradi (`electron/main.ts`).
 * Bu fayl bo'lmasa dastur bazasiz qoladi va xaridor hech qachon kira
 * olmaydi — fayl yo'qligi faqat konsolga yoziladi, ekranda ko'rinmaydi.
 *
 * ICHIDA NIMA BOR: FAQAT SXEMA. Klinika ham, admin ham, bo'lim ham yo'q —
 * ular birinchi ishga tushirish ekranida yaratiladi (`backend/license.ts`).
 * Har klinikaning nomi, xodimlari va narxlari har xil, shuning uchun
 * oldindan to'ldirilgan baza baribir qayta yozilardi.
 *
 * MIGRATSIYA BELGILARI ATAYLAB QO'YILMAYDI. Server bo'sh belgilar
 * jadvalini va mavjud sxemani ko'rsa, hamma migratsiyani «qo'llangan»
 * deb belgilaydi va DDL ni QAYTA BAJARMAYDI (`maintenance.ts`,
 * boshlang'ich nuqta). Aks holda `ADD COLUMN` ikkinchi marta bajarilib
 * xato berardi.
 *
 * Ishga tushirish: cd backend && npx ts-node --transpile-only scripts/makeStarterDb.ts
 * (`npm run bundle` buni o'zi chaqiradi)
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const backendDir = path.resolve(__dirname, '..');
const target = path.join(backendDir, 'prisma', 'starter.db');
const schema = path.join(backendDir, 'prisma', 'schema.prisma');

/* Vaqtinchalik yo'lda quramiz: `prisma db push` mavjud faylni
   o'zgartirishi mumkin, va nishonni yarim holatda qoldirib ketish
   xavfli — keyingi build buzuq bazani paketga solib yuborardi. */
const tmp = path.join(backendDir, 'prisma', 'starter.tmp.db');

function cleanup(file: string) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
        try { fs.existsSync(file + suffix) && fs.unlinkSync(file + suffix); } catch { /* band bo'lsa keyin */ }
    }
}

async function main() {
    console.log('Boshlang\'ich baza yasalmoqda…');
    cleanup(tmp);

    /* Prisma BEVOSITA `node` bilan chaqiriladi, `npx` orqali emas.

       Ikki sabab, ikkalasi ham amalda urib ko'rilgan:
         · `shell: true` bilan Windows argumentlarni qo'shtirnoqsiz
           birlashtiradi va loyiha yo'lidagi bo'shliq («Hp Vitus Gaming»)
           buyruqni bo'lib yuboradi
         · `shell` siz `npx.cmd` ni chaqirib bo'lmaydi — Node ning yangi
           versiyalari `.cmd` faylini bevosita ishga tushirishni taqiqlaydi
           (EINVAL) */
    const prismaCli = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js');
    execFileSync(process.execPath, [prismaCli, 'db', 'push', '--schema=' + schema, '--skip-generate'], {
        cwd: backendDir,
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL: 'file:' + tmp },
    });

    /* NAZORAT. Sxema to'liq va baza BO'SH bo'lishi shart. Ikkalasi ham
       jimgina buzilishi mumkin: `db push` yiqilsa yarim sxema qoladi,
       noto'g'ri `DATABASE_URL` bilan esa ishlayotgan bazaning NUSXASI
       paketga tushib, boshqa klinikaning ma'lumoti tarqalib ketardi. */
    const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + tmp } } });
    try {
        const tables: any[] = await prisma.$queryRawUnsafe(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        );
        if (tables.length < 40) {
            throw new Error(`sxema to'liq emas — atigi ${tables.length} ta jadval`);
        }

        const counts = {
            klinika: await prisma.clinic.count(),
            bemor: await prisma.patient.count(),
            shifokor: await prisma.doctor.count(),
            tashrif: await prisma.visit.count(),
        };
        const notEmpty = Object.entries(counts).filter(([, n]) => n > 0);
        if (notEmpty.length) {
            throw new Error(
                'baza BO\'SH emas: ' + notEmpty.map(([k, n]) => `${k}=${n}`).join(', ') +
                ' — DATABASE_URL noto\'g\'ri bo\'lishi mumkin',
            );
        }

        /* Muhimi jadval emas, YOZUVLAR soni. `SchemaMigration` jadvali
           sxemada bor, ya'ni u `db push` dan keyin baribir paydo bo'ladi.
           Server esa `done.size === 0` ga qaraydi: belgilar bo'sh bo'lsa
           va sxema mavjud bo'lsa — hammasini «qo'llangan» deb belgilaydi.
           Agar bu yerga belgi tushib qolsa, server yangi migratsiyalarni
           qo'llamay ketardi va sxema eskirgan holda qolardi. */
        const markRows: any[] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM "SchemaMigration"');
        const marks = Number(markRows?.[0]?.n || 0);
        if (marks > 0) {
            throw new Error(`migratsiya belgilari bo'sh bo'lishi kerak, ${marks} ta topildi`);
        }

        console.log(`  jadvallar: ${tables.length}`);
        console.log(`  yozuvlar: yo'q (to'g'ri)`);
        console.log(`  migratsiya belgilari: yo'q (to'g'ri — server ishga tushganda o'zi belgilaydi)`);

        /* ── WAL NI ASOSIY FAYLGA YIG'ISH ────────────────────────────────
           Prisma bazani WAL rejimida ochadi: yozilgan narsa yonidagi
           `-wal` faylida turadi va asosiy `.db` ga keyin ko'chiriladi.

           Bu shu yerda jimgina xato keltirdi: sxema WAL da qolib, faqat
           `.db` ko'chirilgani uchun `starter.db` da BITTA jadval qoldi.
           Paketlangan dastur esa uni ochib «no such table: Patient»
           bilan yiqildi. Tekshiruv ko'chirishdan OLDIN bajarilgani va
           SQLite WAL ni avtomatik qo'shib o'qigani uchun skript
           «64 jadval» deb yozib, xatoni ko'rmasdi.

           `journal_mode=DELETE` WAL ni asosiy faylga yig'adi va uni
           o'chiradi — natijada bitta o'zi yetarli fayl qoladi. */
        /* `$queryRawUnsafe` — bu PRAGMA lar natija QAYTARADI, va
           `$executeRawUnsafe` SQLite da natijali so'rovni rad etadi. */
        await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
        await prisma.$queryRawUnsafe('PRAGMA journal_mode=DELETE');
    } finally {
        await prisma.$disconnect();
    }

    cleanup(target);
    fs.renameSync(tmp, target);
    cleanup(tmp);

    /* NAZORAT YAKUNIY FAYL USTIDA. Yuqoridagi tekshiruv vaqtinchalik
       fayl ustida edi va WAL bilan birga o'qilardi — aynan shuning
       uchun buzuq natijani o'tkazib yuborgan. */
    const check = new PrismaClient({ datasources: { db: { url: 'file:' + target } } });
    try {
        const finalTables: any[] = await check.$queryRawUnsafe(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        );
        if (finalTables.length < 40) {
            throw new Error(
                `ko'chirilgandan keyin atigi ${finalTables.length} ta jadval qoldi — ` +
                "WAL asosiy faylga yig'ilmagan",
            );
        }
        console.log(`  yakuniy nazorat: ${finalTables.length} ta jadval`);
    } finally {
        await check.$disconnect();
    }
    cleanup(target + '-wal');

    const kb = Math.round(fs.statSync(target).size / 1024);
    console.log(`✅ ${path.relative(process.cwd(), target)} (${kb} KB)`);
}

main().catch((e) => {
    console.error('❌ Boshlang\'ich bazani yasab bo\'lmadi:', e.message);
    cleanup(tmp);
    process.exit(1);
});
