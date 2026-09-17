/* ─────────────────────────────────────────────────────────────────────────────
   TUNNEL REGISTRATORI — Vercel funksiyasi.

   NIMA UCHUN ALOHIDA SERVIS.

   Doimiy manzil (`k-<id>.domen.com`) yaratish uchun Cloudflare API tokeni
   kerak: u tunnel ochadi va DNS yozuvi qo'shadi. Eski kod bu tokenni HAR
   KLINIKANING kompyuteriga — `.env` ga — qo'yishni kutardi.

   Bu dentalocal dagi xatoning aynan o'zi bo'lardi: istalgan klinika
   kompyuteridan (yoki o'rnatuvchidan) tokenni olib, boshqa HAMMA
   klinikalarning tunnelini va DNS yozuvini o'chirish mumkin edi.

   Endi token FAQAT shu yerda — Vercel muhit o'zgaruvchisida. Klinika
   dasturi faqat o'z `machineId` va litsenziya kalitini yuboradi va javobda
   FAQAT O'Z tunnelini ishga tushiradigan tokenni oladi. U token boshqa
   klinikaga tegolmaydi.

   BITTA FAYL, TASHQI IMPORTSIZ. Vercel funksiyani alohida kompilyatsiya
   qiladi, loyiha esa `"type": "module"`: nisbiy import runtime'da yo'l
   topolmay yiqilishi mumkin. Shuning uchun mantiq shu faylda, sinovlar esa
   `registerTunnel` ni to'g'ridan-to'g'ri chaqiradi.

   KERAKLI MUHIT O'ZGARUVCHILARI (Vercel → Settings → Environment Variables):

     CLOUDFLARE_API_TOKEN     — zona darajasida token (yo'riqnoma: docs/DOMEN-ULASH.md)
     CLOUDFLARE_ACCOUNT_ID
     CLOUDFLARE_ZONE_ID
     CLOUDFLARE_TUNNEL_DOMAIN — hozir `xclinic.org`
     XCLINIC_LICENSE_SALT     — `backend/licenseService.ts` dagi SECRET_SALT

   Birortasi yo'q bo'lsa javob 503: klinika dasturi buni «hali sozlanmagan»
   deb tushunadi va Quick Tunnel (vaqtinchalik manzil) bilan ishlayveradi.
   ───────────────────────────────────────────────────────────────────────────── */

import { createHash } from 'crypto';

export type RegistrarEnv = {
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
    CLOUDFLARE_ZONE_ID?: string;
    CLOUDFLARE_TUNNEL_DOMAIN?: string;
    XCLINIC_LICENSE_SALT?: string;
};

export type RegisterInput = { machineId?: unknown; licenseKey?: unknown; port?: unknown; installSecret?: unknown };

/* ─── O'RNATMA KALITI (audit 2026-09-17) ─────────────────────────────────────

   Litsenziya kaliti `SHA256(machineId + tuz)` dan hisoblanadi, tuz esa
   dastur paketida turadi. Ya'ni boshqa klinikaning `machineId` sini bilgan
   odam uning kalitini ham yasay olardi va shu yerdan O'SHA klinikaning
   tunnel tokenini olib, `k-….xclinic.org` ga o'z konnektorini ulardi.

   Endi har o'rnatma o'zida tasodifiy 32 baytlik kalit saqlaydi va uni har
   so'rovda yuboradi. Birinchi so'rovda registrator kalitning XESHINI
   DNS dagi TXT yozuviga (`_xca.<subdomen>`) yozadi — alohida baza kerak
   emas. Keyin shu manzil faqat o'sha kalit bilan beriladi.

   Eski (yangilanmagan) dastur kalit yubormaydi: TXT yozuvi hali yo'q bo'lsa
   ilgarigidek xizmat qilinadi, bor bo'lsa — rad etiladi.

   KALIT YO'QOLSA (Windows qayta o'rnatildi, baza nusxadan tiklanmadi):
   registrator 403 `INSTALL_MISMATCH` qaytaradi va klinika vaqtinchalik
   manzil bilan ishlayveradi. Tiklash: Cloudflare → DNS da
   `_xca.k-….xclinic.org` TXT yozuvini o'chirish — keyingi so'rovda yangi
   kalit bog'lanadi. */
export function installProof(installSecret: string): string {
    return 'xca=' + createHash('sha256').update('xclinic-install:' + installSecret).digest('hex');
}

export type RegisterResult =
    | { status: 200; body: { url: string; token: string } }
    | { status: 400 | 403 | 405 | 502 | 503; body: { error: string; code: string } };

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const CF = 'https://api.cloudflare.com/client/v4';

/** Litsenziya kaliti — `backend/licenseService.ts` dagi `generateExpectedKey` bilan AYNAN bir xil. */
export function expectedLicenseKey(machineId: string, salt: string): string {
    return createHash('sha256').update(machineId + salt).digest('hex').substring(0, 24).toUpperCase();
}

/* SUBDOMEN MASHINADAN yasaladi, so'rovdan emas. Klinika o'zi «menga
   `k-abc` ber» deya olmaydi — aks holda boshqaning manzilini so'rab
   olishga urinish mumkin bo'lardi. Bitta mashina har doim bitta manzil
   oladi: qayta o'rnatilsa ham, qayta so'ralsa ham. */
export function subdomainFor(machineId: string): string {
    return 'k-' + createHash('sha256').update('xclinic-tunnel:' + machineId).digest('hex').substring(0, 10);
}

const fail = (status: 400 | 403 | 405 | 502 | 503, code: string, error: string): RegisterResult =>
    ({ status, body: { error, code } });

export async function registerTunnel(
    input: RegisterInput, env: RegistrarEnv, fetchImpl: FetchLike,
): Promise<RegisterResult> {
    const token = (env.CLOUDFLARE_API_TOKEN || '').trim();
    const account = (env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const zone = (env.CLOUDFLARE_ZONE_ID || '').trim();
    const domain = (env.CLOUDFLARE_TUNNEL_DOMAIN || '').trim().replace(/^\.+/, '');
    const salt = env.XCLINIC_LICENSE_SALT || '';
    if (!token || !account || !zone || !domain || !salt) {
        return fail(503, 'NOT_CONFIGURED', "Registrator hali sozlanmagan (domen ulanmagan)");
    }

    // ── Kiruvchi ma'lumot ───────────────────────────────────────────────
    const machineId = typeof input.machineId === 'string' ? input.machineId.trim() : '';
    const licenseKey = typeof input.licenseKey === 'string' ? input.licenseKey.trim().toUpperCase() : '';
    const port = Number(input.port);
    if (!/^HWID-[A-Za-z0-9_-]{6,80}$/.test(machineId)) return fail(400, 'BAD_MACHINE', "machineId noto'g'ri");
    if (!/^[0-9A-F]{24}$/.test(licenseKey)) return fail(400, 'BAD_LICENSE_FORMAT', "Litsenziya kaliti noto'g'ri");
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return fail(400, 'BAD_PORT', "Port noto'g'ri");
    const installSecret = typeof input.installSecret === 'string' ? input.installSecret.trim().toLowerCase() : '';
    if (installSecret && !/^[0-9a-f]{64}$/.test(installSecret)) {
        return fail(400, 'BAD_INSTALL_SECRET', "O'rnatma kaliti noto'g'ri");
    }

    /* Litsenziyasiz o'rnatma zonada yozuv yarata olmaydi. Aks holda istalgan
       odam so'rov yuborib zonani minglab yozuv bilan to'ldirishi mumkin edi. */
    if (licenseKey !== expectedLicenseKey(machineId, salt)) {
        return fail(403, 'LICENSE_INVALID', 'Litsenziya bu kompyuterga tegishli emas');
    }

    const sub = subdomainFor(machineId);
    const fqdn = `${sub}.${domain}`;
    const tunnelName = `xclinic-${sub}`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const call = async (method: string, path: string, body?: any) => {
        const r = await fetchImpl(CF + path, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        });
        let data: any = null;
        try { data = await r.json(); } catch { /* bo'sh javob */ }
        if (!r.ok || data?.success === false) {
            const codes = (data?.errors || []).map((e: any) => e?.code).filter(Boolean).join(',');
            throw new Error(`Cloudflare ${method} ${path.split('?')[0]} → ${r.status}${codes ? ` [${codes}]` : ''}`);
        }
        return data?.result;
    };

    try {
        /* 0. O'RNATMA KALITI — manzil qaysi o'rnatmaga bog'langan (yuqoridagi izoh). */
        const proofName = `_xca.${fqdn}`;
        const proofRecords: any[] = await call('GET',
            `/zones/${zone}/dns_records?type=TXT&name=${encodeURIComponent(proofName)}`) || [];
        const bound = (Array.isArray(proofRecords) ? proofRecords : []).find((r: any) => r?.type === 'TXT');
        if (bound) {
            const stored = String(bound.content || '').replace(/^"+|"+$/g, '');
            if (!installSecret || stored !== installProof(installSecret)) {
                return fail(403, 'INSTALL_MISMATCH', "Bu manzil boshqa o'rnatmaga bog'langan");
            }
        } else if (installSecret) {
            await call('POST', `/zones/${zone}/dns_records`,
                { type: 'TXT', name: proofName, content: installProof(installSecret), ttl: 1 });
        }

        /* 1. TUNNEL — BORINI ISHLATAMIZ, O'CHIRMAYMIZ.

           Eski kod har ro'yxatdan o'tishda tunnelni o'chirib qaytadan
           yaratardi. Bu ishlab turgan klinikaning ulanishini uzardi va har
           safar yangi token paydo bo'lardi. Endi tunnel bir marta
           yaratiladi; qayta so'rov faqat marshrut va DNS ni tekshiradi. */
        const existing: any[] = await call('GET',
            `/accounts/${account}/cfd_tunnel?name=${encodeURIComponent(tunnelName)}&is_deleted=false`) || [];
        let tunnelId: string = existing[0]?.id;
        if (!tunnelId) {
            /* `config_src: cloudflare` — marshrut Cloudflare tomonida saqlanadi
               va klinika kompyuterida konfiguratsiya fayli kerak bo'lmaydi. */
            const created = await call('POST', `/accounts/${account}/cfd_tunnel`,
                { name: tunnelName, config_src: 'cloudflare' });
            tunnelId = created?.id;
            if (!tunnelId) throw new Error("Cloudflare tunnel id qaytarmadi");
        }

        /* 2. MARSHRUT. Port har ishga tushishda boshqa bo'lishi mumkin
           (Electron bo'sh portni tanlaydi) — shuning uchun HAR safar yoziladi. */
        await call('PUT', `/accounts/${account}/cfd_tunnel/${tunnelId}/configurations`, {
            config: {
                ingress: [
                    { hostname: fqdn, service: `http://localhost:${port}` },
                    { service: 'http_status:404' },
                ],
            },
        });

        // 3. DNS — bor bo'lsa yangilaymiz, yo'q bo'lsa yaratamiz
        const target = `${tunnelId}.cfargotunnel.com`;
        const records: any[] = await call('GET',
            `/zones/${zone}/dns_records?name=${encodeURIComponent(fqdn)}`) || [];
        const record = { type: 'CNAME', name: fqdn, content: target, proxied: true };
        if (!records.length) {
            await call('POST', `/zones/${zone}/dns_records`, record);
        } else if (records[0].content !== target || records[0].type !== 'CNAME' || !records[0].proxied) {
            await call('PUT', `/zones/${zone}/dns_records/${records[0].id}`, record);
        }

        // 4. Faqat SHU tunnelni ishga tushiradigan token
        const runToken = await call('GET', `/accounts/${account}/cfd_tunnel/${tunnelId}/token`);
        if (typeof runToken !== 'string' || !runToken) throw new Error("Cloudflare token qaytarmadi");

        return { status: 200, body: { url: `https://${fqdn}`, token: runToken } };
    } catch (e: any) {
        /* API tokeni yoki ichki tafsilot javobga TUSHMAYDI — faqat qisqa
           sabab. To'liq xato Vercel jurnalida qoladi. */
        console.error('[tunnel-register]', e?.message || e);
        return fail(502, 'CLOUDFLARE_ERROR', "Cloudflare bilan ishlashda xato. Keyinroq qayta uriniladi.");
    }
}

/** Vercel kirish nuqtasi */
export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Faqat POST', code: 'METHOD' });
        return;
    }
    let body: any = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const result = await registerTunnel(body || {}, process.env as RegistrarEnv, fetch as any);
    res.status(result.status).json(result.body);
}
