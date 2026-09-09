/* ─────────────────────────────────────────────────────────────────────────────
   ZAXIRA NUSXA — KLINIKA EGASIGA TELEGRAMGA.

   NIMA UCHUN. Nusxa kompyuterning o'zida yotadi. Kompyuter yonsa, o'g'irlansa
   yoki diski ishdan chiqsa — nusxa ham u bilan ketadi. Bulut papkasi (Google
   Drive / OneDrive) buni yopadi, lekin u SOZLANGAN bo'lishi kerak va klinika
   uni sozlamasligi mumkin.

   Telegram esa allaqachon ulangan: bot bor, egasining chat id si bor. Kuniga
   bir marta baza nusxasi o'sha yerga tushsa — klinikadan tashqarida, egasining
   telefonida, hech qanday sozlashsiz nusxa paydo bo'ladi.

   UCHTA CHEKLOV, ular kodda ham ko'rinadi:

   1. FAQAT BAZA. Bemor fotolari arxivi yuborilmaydi: u yuzlab megabayt
      bo'lishi mumkin va Telegram bot uchun chegara 50 MB. Baza esa
      hamma yozuvni saqlaydi — eng muhimi shu.

   2. KUNIGA BIR MARTA. Nusxa kuniga ikki marta olinadi, lekin egasining
      telefoniga kuniga ikkita fayl kelishi keraksiz. Belgi faylda
      saqlanadi, ya'ni server qayta ishga tushsa ham takrorlanmaydi.

   3. XATO ZAXIRANI YIQITMAYDI. Telegram ishlamasa (internet yo'q, bot
      bloklangan, chat id eskirgan) — nusxa baribir olingan va diskda
      turibdi. Faqat jurnalga yoziladi.
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import path from 'path';
import { tashkentDateStr } from './tashkentTime';

/** Telegram bot uchun hujjat chegarasi — 50 MB. Zaxira bilan 45 MB olamiz. */
const MAX_BYTES = 45 * 1024 * 1024;

const MARK_FILE = 'last-telegram-backup.txt';

const readMark = (userDataPath: string): string => {
    try { return fs.readFileSync(path.join(userDataPath, MARK_FILE), 'utf8').trim(); }
    catch { return ''; }
};
const writeMark = (userDataPath: string, day: string) => {
    try { fs.writeFileSync(path.join(userDataPath, MARK_FILE), day, 'utf8'); }
    catch { /* belgi yozilmasa ertaga yana yuboriladi — zarari yo'q */ }
};

export type TelegramBackupResult =
    | { sent: true; bytes: number }
    | { sent: false; reason: string };

/**
 * Baza nusxasini klinika egasiga yuboradi — kuniga bir marta.
 *
 * @param force belgini e'tiborsiz qoldiradi (qo'lda yuborish uchun)
 */
export async function sendBackupToOwner(input: {
    prisma: any;
    userDataPath: string;
    dbFile: string;          // to'liq yo'l
    force?: boolean;
}): Promise<TelegramBackupResult> {
    const { prisma, userDataPath, dbFile } = input;

    const today = tashkentDateStr();
    if (!input.force && readMark(userDataPath) === today) {
        return { sent: false, reason: 'bugun allaqachon yuborilgan' };
    }

    let clinic: any = null;
    try {
        clinic = await prisma.clinic.findFirst({
            select: { name: true, botToken: true, telegramChatId: true },
        });
    } catch (e: any) {
        return { sent: false, reason: `klinika o'qilmadi: ${e?.message || e}` };
    }

    if (!clinic?.botToken) return { sent: false, reason: 'bot ulanmagan' };
    if (!clinic?.telegramChatId) {
        return { sent: false, reason: "egasi botga ulanmagan (chat id yo'q)" };
    }

    if (!fs.existsSync(dbFile)) return { sent: false, reason: 'nusxa fayli topilmadi' };
    const bytes = fs.statSync(dbFile).size;

    /* Chegaradan katta bo'lsa — faylni emas, XABARNI yuboramiz. Jimgina
       yiqilish eng yomoni: ega nusxa kelayotgandir deb o'ylab yuradi. */
    if (bytes > MAX_BYTES) {
        await sendText(clinic.botToken, clinic.telegramChatId,
            `⚠️ Zaxira nusxa Telegramga sig'madi (${Math.round(bytes / 1024 / 1024)} MB, chegara 45 MB).\n`
            + `Nusxa kompyuterda olingan va joyida. Bulut papkasini sozlash tavsiya etiladi.`)
            .catch(() => { /* xabar ham ketmasa — jurnalga tushadi */ });
        return { sent: false, reason: `fayl katta: ${bytes} bayt` };
    }

    try {
        const form = new FormData();
        form.append('chat_id', String(clinic.telegramChatId));
        form.append('caption',
            `🗄 ${clinic.name || 'Klinika'} — zaxira nusxa\n`
            + `${today} · ${(bytes / 1024 / 1024).toFixed(1)} MB\n\n`
            + `Bu baza nusxasi. Uni saqlab qo'ying: kompyuter ishdan chiqsa, `
            + `tiklash aynan shundan bo'ladi.`);
        form.append('document',
            new Blob([new Uint8Array(fs.readFileSync(dbFile))]),
            path.basename(dbFile));

        const r = await fetch(`https://api.telegram.org/bot${clinic.botToken}/sendDocument`, {
            method: 'POST',
            body: form,
        });
        if (!r.ok) {
            const text = await r.text().catch(() => '');
            return { sent: false, reason: `Telegram ${r.status}: ${text.slice(0, 160)}` };
        }

        writeMark(userDataPath, today);
        console.log(`📤 Zaxira nusxa egasiga yuborildi (${Math.round(bytes / 1024)} KB)`);
        return { sent: true, bytes };
    } catch (e: any) {
        return { sent: false, reason: e?.message || String(e) };
    }
}

async function sendText(token: string, chatId: string, text: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
}
