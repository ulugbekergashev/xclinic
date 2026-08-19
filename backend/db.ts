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
