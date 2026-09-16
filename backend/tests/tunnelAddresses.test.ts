import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readTunnelAddresses, notifyBackupAddress } from '../tunnelAddresses';

/* ─────────────────────────────────────────────────────────────────────────────
   DOIMIY VA ZAXIRA MANZIL.

   Nima uchun sinaladi. Zaxira manzil doimiysi ishlamay qolgan kun uchun —
   ya'ni aynan u kerak bo'lgan kuni tekshirib ko'rishning iloji yo'q. Ikki
   xato ayniqsa qimmat:

     · o'chirilgan masofaviy kirishda eski manzil ko'rsatilsa — ega uni
       tarqatadi, u esa ishlamaydi;
     · Telegramga har daqiqa bir xil manzil ketsa — ega botni o'chirib
       qo'yadi va manzil o'zgargan kuni xabar kelmaydi.

   Telegram chaqirilmaydi: `fetch` soxta funksiya bilan almashtiriladi.
   ───────────────────────────────────────────────────────────────────────────── */

const STABLE = 'https://k-57b1273c46.xclinic.org';
const QUICK = 'https://brave-lion-cat.trycloudflare.com';

let dir = '';
const put = (file: string, url: string) =>
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ url }), 'utf8');

const prismaWith = (clinic: any) => ({ clinic: { findFirst: async () => clinic } });
const OWNER = { name: 'Shifo', botToken: 'bot-token', telegramChatId: '777' };

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-tunnel-')); });
afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('readTunnelAddresses', () => {
    it("masofaviy kirish o'chiq bo'lsa — fayllar qolgan bo'lsa ham hech narsa qaytmaydi", () => {
        put('cf-tunnel.json', STABLE);
        put('cf-quick-tunnel.json', QUICK);
        expect(readTunnelAddresses(dir, { remoteEnabled: false, envUrl: STABLE }))
            .toEqual({ stableUrl: null, quickUrl: null });
    });

    it('ikkala manzil birga qaytadi', () => {
        put('cf-tunnel.json', STABLE);
        put('cf-quick-tunnel.json', QUICK + '/');
        expect(readTunnelAddresses(dir, { remoteEnabled: true }))
            .toEqual({ stableUrl: STABLE, quickUrl: QUICK });
    });

    it(".env dagi manzil — fayl bo'lmaganda doimiy manzil o'rnida", () => {
        expect(readTunnelAddresses(dir, { remoteEnabled: true, envUrl: STABLE }))
            .toEqual({ stableUrl: STABLE, quickUrl: null });
    });

    it('buzuq fayl va https bo\'lmagan manzil e\'tiborsiz qoladi', () => {
        fs.writeFileSync(path.join(dir, 'cf-tunnel.json'), '{buzuq', 'utf8');
        put('cf-quick-tunnel.json', 'http://evil.example.com');
        expect(readTunnelAddresses(dir, { remoteEnabled: true }))
            .toEqual({ stableUrl: null, quickUrl: null });
    });
});

describe('notifyBackupAddress', () => {
    const calls: any[] = [];
    const okFetch = vi.fn(async (url: string, init: any) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response('{"ok":true}', { status: 200 });
    });

    beforeEach(() => { calls.length = 0; okFetch.mockClear(); });

    it('yangi zaxira manzil — egasiga bir marta yuboriladi, takrorlanmaydi', async () => {
        vi.stubGlobal('fetch', okFetch);
        put('cf-tunnel.json', STABLE);
        put('cf-quick-tunnel.json', QUICK);
        const input = { prisma: prismaWith(OWNER), userDataPath: dir, remoteEnabled: true };

        expect(await notifyBackupAddress(input)).toEqual({ sent: true, url: QUICK });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('https://api.telegram.org/botbot-token/sendMessage');
        expect(calls[0].body.chat_id).toBe('777');
        expect(calls[0].body.text).toContain(QUICK);
        expect(calls[0].body.text).toContain(STABLE);

        const again = await notifyBackupAddress(input);
        expect(again).toMatchObject({ sent: false, quiet: true });
        expect(calls).toHaveLength(1);
    });

    it("manzil o'zgarsa — yana yuboriladi", async () => {
        vi.stubGlobal('fetch', okFetch);
        put('cf-quick-tunnel.json', QUICK);
        const input = { prisma: prismaWith(OWNER), userDataPath: dir, remoteEnabled: true };
        await notifyBackupAddress(input);

        const NEXT = 'https://other-words-here.trycloudflare.com';
        put('cf-quick-tunnel.json', NEXT);
        expect(await notifyBackupAddress(input)).toEqual({ sent: true, url: NEXT });
        expect(calls).toHaveLength(2);
    });

    it('Telegram rad etsa — belgi qo\'yilmaydi, keyingi urinishda qayta yuboriladi', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));
        put('cf-quick-tunnel.json', QUICK);
        const input = { prisma: prismaWith(OWNER), userDataPath: dir, remoteEnabled: true };

        const failed = await notifyBackupAddress(input);
        expect(failed.sent).toBe(false);
        expect((failed as any).quiet).toBeFalsy();

        vi.stubGlobal('fetch', okFetch);
        expect(await notifyBackupAddress(input)).toEqual({ sent: true, url: QUICK });
    });

    it("bot ulanmagan yoki masofaviy kirish o'chiq — Telegramga so'rov ketmaydi", async () => {
        vi.stubGlobal('fetch', okFetch);
        put('cf-quick-tunnel.json', QUICK);

        const noBot = await notifyBackupAddress({
            prisma: prismaWith({ name: 'Shifo', botToken: null, telegramChatId: null }),
            userDataPath: dir, remoteEnabled: true,
        });
        expect(noBot).toMatchObject({ sent: false, quiet: true });

        const off = await notifyBackupAddress({ prisma: prismaWith(OWNER), userDataPath: dir, remoteEnabled: false });
        expect(off).toMatchObject({ sent: false, quiet: true });

        expect(calls).toHaveLength(0);
    });
});
