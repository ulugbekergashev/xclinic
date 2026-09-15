/* ─────────────────────────────────────────────────────────────────────────────
   DOIMIY MANZIL — KLINIKA TOMONI.

   Klinika dasturi Cloudflare bilan TO'G'RIDAN-TO'G'RI gaplashmaydi. U
   registratorga (`api/tunnel-register.ts`, Vercel) o'z `machineId` va
   litsenziya kalitini yuboradi va javobda ikki narsa oladi:

     · doimiy manzil — `https://k-<id>.domen.com`;
     · FAQAT O'Z tunnelini ishga tushiradigan token.

   Token `userData/.env` ga yoziladi. Electron har 30 soniyada shu faylni
   o'qiydi va token paydo bo'lganda doimiy tunnelni ko'taradi — dasturni
   qayta ishga tushirish shart emas.

   REGISTRATOR HALI SOZLANMAGAN BO'LSA (domen olinmagan) — javob 503 va bu
   XATO EMAS. Klinika Quick Tunnel (vaqtinchalik manzil) bilan ishlayveradi,
   jurnalga bir qator yoziladi. Domen ulangan kuni hech narsani
   o'zgartirmasdan keyingi urinishda doimiy manzil paydo bo'ladi.
   ───────────────────────────────────────────────────────────────────────────── */

import fs from 'fs';
import path from 'path';
import { getMachineId } from './hwid';

/* Registrator manzili — alohida Vercel loyihasi (`scripts/deploy-registrar.mjs`).
   Demo sayt (`xclinic-alpha`) EMAS: u yerda `api/` `.vercelignore` bilan
   chiqarilgan. Muhitdan almashtirish mumkin: `XCLINIC_TUNNEL_REGISTRAR`. */
export const DEFAULT_REGISTRAR_URL = 'https://xclinic-registrar.vercel.app/api/tunnel-register';

export type TunnelRequestResult =
    | { ok: true; url: string }
    | { ok: false; reason: string; quiet?: boolean };

/** `.env` dagi bitta kalitni yangilaydi yoki qo'shadi. Qolgan qatorlarga tegmaydi. */
export function upsertEnvLine(content: string, key: string, value: string): string {
    const line = `${key}="${value}"`;
    const re = new RegExp(`^${key}\\s*=.*$`, 'm');
    if (re.test(content)) return content.replace(re, line);
    return (content && !content.endsWith('\n') ? content + '\n' : content) + line + '\n';
}

export async function requestStableTunnel(input: {
    prisma: any;
    userDataPath: string;
    port: number;
    registrarUrl?: string;
    fetchImpl?: typeof fetch;
}): Promise<TunnelRequestResult> {
    const url = (input.registrarUrl || process.env.XCLINIC_TUNNEL_REGISTRAR || DEFAULT_REGISTRAR_URL).trim();
    const doFetch = input.fetchImpl || fetch;

    let licenseKey = '';
    try {
        const clinic = await input.prisma.clinic.findFirst({ select: { licenseKey: true } });
        licenseKey = String(clinic?.licenseKey || '').trim();
    } catch (e: any) {
        return { ok: false, reason: `klinika o'qilmadi: ${e?.message || e}` };
    }
    /* Litsenziyasiz o'rnatma doimiy manzil so'ramaydi: registrator baribir
       rad etadi, so'rov esa behuda ketadi. */
    if (!licenseKey) return { ok: false, reason: 'litsenziya faollashtirilmagan', quiet: true };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let status = 0;
    let data: any = null;
    try {
        const r = await doFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ machineId: getMachineId(), licenseKey, port: input.port }),
            signal: controller.signal,
        });
        status = r.status;
        try { data = await r.json(); } catch { /* bo'sh javob */ }
    } catch (e: any) {
        return { ok: false, reason: `registratorga ulanib bo'lmadi: ${e?.name === 'AbortError' ? 'vaqt tugadi' : (e?.message || e)}`, quiet: true };
    } finally {
        clearTimeout(timer);
    }

    if (status === 503) return { ok: false, reason: 'registrator hali sozlanmagan (domen ulanmagan)', quiet: true };
    if (status !== 200 || typeof data?.token !== 'string' || typeof data?.url !== 'string') {
        return { ok: false, reason: `registrator ${status}: ${data?.error || 'javob noto\'g\'ri'}` };
    }
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(data.url)) {
        return { ok: false, reason: "registrator noto'g'ri manzil qaytardi" };
    }

    /* userData/.env — Electron aynan shu faylni o'qiydi. Tokenni
       o'zgartirmasdan qayta yozish ham zararsiz: Electron faqat token
       O'ZGARGANDA ulanishni qayta ko'taradi. */
    try {
        fs.mkdirSync(input.userDataPath, { recursive: true });
        const envPath = path.join(input.userDataPath, '.env');
        let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
        content = upsertEnvLine(content, 'CLOUDFLARE_TUNNEL_TOKEN', data.token);
        content = upsertEnvLine(content, 'CLOUDFLARE_TUNNEL_URL', data.url);
        fs.writeFileSync(envPath, content, 'utf8');
        fs.writeFileSync(path.join(input.userDataPath, 'cf-tunnel.json'), JSON.stringify({ url: data.url }, null, 2), 'utf8');
    } catch (e: any) {
        return { ok: false, reason: `tokenni saqlab bo'lmadi: ${e?.message || e}` };
    }

    console.log(`🔗 Doimiy manzil tayyor: ${data.url}`);
    return { ok: true, url: data.url };
}
