/* ─────────────────────────────────────────────────────────────────────────────
   INTERNET MANZILLARI — DOIMIY VA ZAXIRA.

   Masofaviy kirish yoqilganda Electron IKKITA tunnel ko'taradi:

     · doimiy  — `k-<id>.xclinic.org`, registrator bergan, o'zgarmaydi.
                 Manzil `cf-tunnel.json` da (va `.env` dagi
                 `CLOUDFLARE_TUNNEL_URL` da);
     · zaxira  — `xxx.trycloudflare.com` (Quick Tunnel), dastur har qayta
                 ishga tushganda yangisiga almashadi. Manzil
                 `cf-quick-tunnel.json` da.

   NEGA ZAXIRA KERAK. Doimiy manzil bir nechta tashqi bo'g'inga tayanadi:
   domen muddati, Cloudflare akkaunti, Vercel'dagi registrator. Ulardan
   biri ishlamay qolsa, klinika tashqaridan butunlay yopilib qolardi.
   Quick Tunnel esa hech qanday akkaunt va domensiz ishlaydi.

   2026-09-16 gacha doimiy manzil paydo bo'lishi bilan Quick Tunnel
   ATAYLAB o'chirilardi — «ikkita ochiq manzil bo'lmasin» deb. Xavf
   jihatidan farq yo'q: ikkalasi ham bitta login sahifasiga olib boradi,
   ikkalasini ham bitta tugma yopadi.

   ZAXIRA MANZILNING CHEKLOVLARI (Cloudflare hujjati): bir vaqtda 200 ta
   so'rov, SSE qo'llanmaydi, ishlash kafolati yo'q. Dastur buni ko'taradi —
   jonli oqim ulanmasa ekranlar so'rovga o'tadi (`useLiveUpdates`).

   ZAXIRA MANZILNI QANDAY BILADI. U har qayta ishga tushishda o'zgaradi —
   doimiy manzil ishlamay qolgan kuni egasi klinikadan tashqarida bo'lsa,
   Sozlamalarni ocholmaydi va yangi manzilni ko'ra olmaydi. Shuning uchun
   manzil o'zgarganda egasining Telegramiga yuboriladi.
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import path from 'path';
import { sendTelegramText } from './backupTelegram';

export interface TunnelAddresses {
    stableUrl: string | null;
    quickUrl: string | null;
}

const readUrl = (file: string): string | null => {
    try {
        if (!fs.existsSync(file)) return null;
        const url = JSON.parse(fs.readFileSync(file, 'utf8'))?.url;
        return typeof url === 'string' && /^https:\/\/[a-z0-9.-]+$/i.test(url.replace(/\/+$/, ''))
            ? url.replace(/\/+$/, '')
            : null;
    } catch { return null; }
};

/**
 * Hozir ishlayotgan internet manzillari.
 *
 * Masofaviy kirish O'CHIQ bo'lsa — ikkalasi ham `null`, fayllar qolgan
 * bo'lsa ham. `.env` dagi `CLOUDFLARE_TUNNEL_URL` o'chirilganda ham turadi:
 * ilgari u shartsiz qaytarilardi va Sozlamalar ishlamaydigan manzilni
 * ko'rsatib turardi.
 */
export function readTunnelAddresses(userDataPath: string, opts: {
    remoteEnabled: boolean;
    envUrl?: string | null;
}): TunnelAddresses {
    if (!opts.remoteEnabled) return { stableUrl: null, quickUrl: null };

    /* Fayl birinchi: registrator dastur ishlab turgan paytda yangi manzil
       bersa, `tunnelClient` faylni darhol yozadi, `process.env` esa faqat
       qayta ishga tushganda yangilanadi. */
    const envUrl = (opts.envUrl || '').trim().replace(/\/+$/, '');
    const stableUrl = readUrl(path.join(userDataPath, 'cf-tunnel.json'))
        || (/^https:\/\//.test(envUrl) ? envUrl : null);
    const quickUrl = readUrl(path.join(userDataPath, 'cf-quick-tunnel.json'));
    return { stableUrl, quickUrl };
}

/* ─── ZAXIRA MANZILNI EGASIGA YUBORISH ─────────────────────────────────── */

const MARK_FILE = 'last-telegram-quick-url.txt';

/* `quiet` — kutilgan holat (manzil o'zgarmagan, bot ulanmagan): har
   daqiqada jurnalga yozilsa, jurnal shovqinga to'lardi. */
export type NotifyResult =
    | { sent: true; url: string }
    | { sent: false; reason: string; quiet?: boolean };

/**
 * Zaxira manzil O'ZGARGAN bo'lsa — egasining Telegramiga yuboradi.
 *
 * Har daqiqa chaqirilsa ham bo'ladi: manzil o'zgarmagan bo'lsa Telegramga
 * so'rov ketmaydi. Belgi FAQAT muvaffaqiyatli yuborishdan keyin yoziladi —
 * internet bo'lmasa keyingi urinishda qayta yuboriladi.
 */
export async function notifyBackupAddress(input: {
    prisma: any;
    userDataPath: string;
    remoteEnabled: boolean;
    envUrl?: string | null;
}): Promise<NotifyResult> {
    const { stableUrl, quickUrl } = readTunnelAddresses(input.userDataPath, input);
    if (!quickUrl) return { sent: false, reason: "zaxira manzil yo'q", quiet: true };

    const markPath = path.join(input.userDataPath, MARK_FILE);
    let last = '';
    try { last = fs.readFileSync(markPath, 'utf8').trim(); } catch { /* birinchi marta */ }
    if (last === quickUrl) return { sent: false, reason: "manzil o'zgarmagan", quiet: true };

    let clinic: any = null;
    try {
        clinic = await input.prisma.clinic.findFirst({
            select: { name: true, botToken: true, telegramChatId: true },
        });
    } catch (e: any) {
        return { sent: false, reason: `klinika o'qilmadi: ${e?.message || e}` };
    }
    if (!clinic?.botToken) return { sent: false, reason: 'bot ulanmagan', quiet: true };
    if (!clinic?.telegramChatId) return { sent: false, reason: "egasi botga ulanmagan (chat id yo'q)", quiet: true };

    const text = stableUrl
        ? `🌐 ${clinic.name || 'Klinika'} — zaxira manzil yangilandi\n\n`
        + `${quickUrl}\n\n`
        + `Asosiy manzil: ${stableUrl}\n`
        + `Asosiy manzil ochilmasa — zaxira orqali kiring. Zaxira manzil dastur `
        + `qayta ishga tushganda o'zgaradi, yangisi shu yerga keladi.`
        : `🌐 ${clinic.name || 'Klinika'} — internet manzili yangilandi\n\n`
        + `${quickUrl}\n\n`
        + `Manzil dastur qayta ishga tushganda o'zgaradi, yangisi shu yerga keladi.`;

    try {
        await sendTelegramText(clinic.botToken, clinic.telegramChatId, text);
    } catch (e: any) {
        return { sent: false, reason: e?.message || String(e) };
    }

    try { fs.writeFileSync(markPath, quickUrl, 'utf8'); } catch { /* keyingi safar qayta yuboriladi */ }
    console.log(`📤 Zaxira manzil egasiga yuborildi: ${quickUrl}`);
    return { sent: true, url: quickUrl };
}
