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
import crypto from 'crypto';
import { getMachineId } from './hwid';

/* O'RNATMA KALITI (audit 2026-09-17). Registrator doimiy manzilni birinchi
   so'rovda shu kalitga bog'laydi (`api/tunnel-register.ts`, installProof):
   litsenziya kalitini soxtalashtirgan odam ham manzilni ololmaydi.

   BAZADA saqlanadi, faylda emas: dastur qayta o'rnatilsa yoki baza
   zaxiradan tiklansa kalit ham qaytadi va klinika manzilini yo'qotmaydi.
   Ekranga hech qayerda chiqmaydi. */
const INSTALL_SECRET_KEY = 'tunnel_install_secret';

export async function getInstallSecret(prisma: any): Promise<string> {
    const row = await prisma.platformSetting.findUnique({ where: { key: INSTALL_SECRET_KEY } });
    const existing = String(row?.value || '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;

    const fresh = crypto.randomBytes(32).toString('hex');
    await prisma.platformSetting.upsert({
        where: { key: INSTALL_SECRET_KEY },
        update: { value: fresh, updatedAt: new Date() },
        create: { key: INSTALL_SECRET_KEY, value: fresh },
    });
    return fresh;
}

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
    let installSecret = '';
    try {
        const clinic = await input.prisma.clinic.findFirst({ select: { licenseKey: true } });
        licenseKey = String(clinic?.licenseKey || '').trim();
        installSecret = await getInstallSecret(input.prisma);
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
            body: JSON.stringify({ machineId: getMachineId(), licenseKey, port: input.port, installSecret }),
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
    if (status === 403 && data?.code === 'INSTALL_MISMATCH') {
        return {
            ok: false,
            reason: "doimiy manzil boshqa o'rnatma kalitiga bog'langan. Tiklash: Cloudflare DNS da "
                + "`_xca.<subdomen>` TXT yozuvini o'chiring (docs/DOMEN-ULASH.md). Hozircha vaqtinchalik manzil ishlaydi",
        };
    }
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
