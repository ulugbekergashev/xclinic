import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — markaziy Prisma klienti.

   denta7 da bu fayl shunchaki `new PrismaClient()` edi: manzil .env dagi
   DATABASE_URL (Railway Postgres) dan olinardi. XClinic offline ishlaydi, shuning
   uchun baza yo'li shu yerda, bitta joyda hal qilinadi — server.ts, botManager,
   triggers va boshqa 8 ta modul hammasi shu klientni import qiladi.

   MUHIM: baza foydalanuvchining %APPDATA%\xclinic papkasida yashaydi.
   dentalocal %APPDATA%\dentalflow-crm ni ishlatadi — papkalar boshqa, ya'ni
   ikki dastur bir kompyuterda yonma-yon ishlasa ham bazalari hech qachon
   to'qnashmaydi. denta7 ning Postgres bazasiga esa umuman ulanilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

const isElectron = process.env.ELECTRON_RUN === 'true';

export const USER_DATA_PATH =
    (process.env.ELECTRON_USER_DATA_PATH || '').replace(/['"]/g, '').trim()
    || (process.env.APPDATA ? path.join(process.env.APPDATA, 'xclinic') : __dirname);

export const DB_PATH = isElectron
    ? path.join(USER_DATA_PATH, 'xclinic.db')
    : path.resolve(__dirname, 'prisma', 'xclinic.db');

const dbUrl = isElectron
    ? `file:${DB_PATH}`
    : (process.env.DATABASE_URL || `file:${DB_PATH}`);

// ncc bilan bundle qilinganda Prisma o'z query-engine .node faylini topa olmaydi —
// yo'lni qo'lda ko'rsatamiz. Electron main.ts ham buni beradi; bu ikkinchi himoya.
if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    const localEngine = path.join(__dirname, 'client', 'query_engine-windows.dll.node');
    if (fs.existsSync(localEngine)) process.env.PRISMA_QUERY_ENGINE_LIBRARY = localEngine;
} else if (!fs.existsSync(process.env.PRISMA_QUERY_ENGINE_LIBRARY)) {
    const localEngine = path.join(__dirname, 'client', 'query_engine-windows.dll.node');
    if (fs.existsSync(localEngine)) process.env.PRISMA_QUERY_ENGINE_LIBRARY = localEngine;
}

console.log('🔗 XClinic baza:', dbUrl);

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
    datasources: { db: { url: dbUrl } },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // 'minimal' — ncc bundle ichida Prisma o'zining rangli xato chizmasini
    // yasay olmaydi va xato o'rniga ichki kodini to'kib yuboradi.
    errorFormat: 'minimal',
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/* ─── SQLite jurnal rejimi ────────────────────────────────────────────────
   O'lchandi (2026-08-24, ishlayotgan baza): `journal_mode = delete`, ya'ni
   WAL EMAS. Rollback-journal rejimida yozuv paytida baza qulflanadi.

   NIMA UCHUN FAQAT WAL, boshqa hech narsa yo'q. Uchta sozlama ko'rib
   chiqildi va ikkitasi O'LCHOV ASOSIDA rad etildi:

   1. `connection_limit=1` — RAD ETILDI. U hamma so'rovni bitta ulanishga
      tiqadi, ya'ni O'QISH ham yozuv ortida navbatda turadi. O'lchov
      (`_t_readlat.ts`, 300 ms lik yozuv paytida 6 ta o'qish):

          rollback-journal, limitsiz : eng yomoni  14 ms
          WAL, limitsiz              : eng yomoni  18 ms
          WAL + connection_limit=1   : eng yomoni 253 ms   ← 14 barobar yomon

      Klinikada bu shifokorning ro'yxati kassirning har to'lovida qotib
      qolishini bildiradi. Uni qo'yish uchun sabab — parallel tranzaksiyalar
      qulflanishi qo'rquvi edi; o'lchov (`_t_locking.ts`, 12 ta parallel
      interaktiv tranzaksiya) buni RAD ETDI: limitsiz holatda ham qulf
      xatosi 0, yo'qolgan yangilanish 0. Prisma SQLite so'rovlarini o'zi
      ketma-ketlashtirar ekan.

   2. `synchronous = NORMAL` — RAD ETILDI. Tezroq, lekin tok o'chganda
      oxirgi tranzaksiyalarni yo'qotish ehtimoli bor. Klinikada UPS
      bo'lmaydi, WAL dagi sukut qiymat FULL esa buni kafolatlaydi.
      Ma'lumot ishonchliligi tezlikdan ustun.

   3. `busy_timeout`, `foreign_keys` — QO'YILMAYDI, chunki ular ULANISHGA
      tegishli va Prisma havzasida bir nechta ulanish bor: ishga tushishda
      qo'yilgani faqat bittasiga tegadi, ya'ni yolg'on kafolat bo'lardi.
      O'lchov qulf xatosi yo'qligini ko'rsatdi, `foreign_keys` esa
      allaqachon yoqilgan (o'lchandi: 1).

   `journal_mode` esa baza FAYLIGA yoziladi — bir marta qo'yilsa hamma
   ulanish va hamma keyingi ishga tushish uchun amal qiladi. Shu sababli u
   yagona ishonchli sozlama va yagona qo'yilayotgani.                      */
export async function applySqlitePragmas(): Promise<{ journalMode: string; ok: boolean }> {
    try {
        /* DIQQAT: `PRAGMA journal_mode` QIYMAT QAYTARADI, shuning uchun
           `$queryRawUnsafe`. `$executeRawUnsafe` bilan chaqirilsa Prisma
           "Execute returned results, which is not allowed in SQLite" xatosini
           beradi — sinovda aynan shunday bo'ldi. */
        const rows: any = await prisma.$queryRawUnsafe(`PRAGMA journal_mode = WAL`);
        const journalMode = String(rows?.[0]?.journal_mode ?? 'noma\'lum');
        const ok = journalMode.toLowerCase() === 'wal';

        console.log(`🔒 SQLite: journal_mode=${journalMode}`);
        if (!ok) {
            console.warn(
                `⚠️ WAL rejimi yoqilmadi (${journalMode}). Baza tarmoq diskida bo'lsa bu normal — ` +
                `dastur ishlayveradi, lekin yozuv paytida o'qish kutadi.`,
            );
        }
        return { journalMode, ok };
    } catch (e: any) {
        // Rejim qo'yilmasa ham dastur ishlashi kerak — bu yaxshilash, shart emas
        console.error('⚠️ SQLite jurnal rejimini qo\'yib bo\'lmadi:', e?.message || e);
        return { journalMode: 'xato', ok: false };
    }
}
