import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/* ─────────────────────────────────────────────────────────────────────────────
   Cloudflare kalitlari MUHITDAN olinadi, koddan emas.

   Ilgari bu uchtasi shu yerda matn sifatida turardi. Token account darajasida:
   uni bilgan odam SIZNING akkauntingizda tunnellarni o'chirishi, ya'ni barcha
   klinikalarning masofadan kirishini o'chirib qo'yishi va zonadagi DNS
   yozuvlarini qayta yozishi mumkin edi.

   MUHIM: kodni tozalash yetarli EMAS. Eski token allaqachon repozitoriyda va,
   ehtimol, tarqatilgan bilduruvlarda bo'lgan — uni Cloudflare panelida
   BEKOR QILISH shart, aks holda toza kod bilan birga o'sha ochiq kalit qoladi.

   Kalitlar bo'lmasa: avtomatik ro'yxatdan o'tish ishga tushmaydi va bir marta
   tushunarli log yoziladi. Klinika mahalliy tarmoqda ishlashda davom etadi —
   offline ish buzilmaydi. */
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || '';

/** Uchtasi ham to'ldirilganmi. Bittasi yo'q bo'lsa — API ga murojaat qilib bo'lmaydi. */
const hasCloudflareCredentials = () =>
    !!CLOUDFLARE_API_TOKEN && !!CLOUDFLARE_ACCOUNT_ID && !!CLOUDFLARE_ZONE_ID;

/**
 * Returns a STABLE, per-installation RANDOM id used for this machine's public tunnel
 * subdomain. It is generated once on first run and saved in this machine's own userData
 * folder (never bundled into the installer). Being random — not derived from hardware —
 * guarantees two machines can NEVER collide, even with identical hardware or if files were
 * copied from another install. This makes every clinic's link fully independent.
 */
function getTunnelSubdomainId(): string {
    const dir = process.env.ELECTRON_USER_DATA_PATH
        ? process.env.ELECTRON_USER_DATA_PATH.replace(/['"]/g, '').trim()
        : (process.env.APPDATA ? path.join(process.env.APPDATA, 'xclinic') : __dirname);
    const idPath = path.join(dir, 'tunnel_id.txt');

    try {
        if (fs.existsSync(idPath)) {
            const existing = fs.readFileSync(idPath, 'utf8').trim().toLowerCase();
            if (/^[a-f0-9]{12}$/.test(existing)) {
                return existing;
            }
        }
    } catch (e) {
        console.warn('[Cloudflare Auto] Failed to read tunnel id, generating a new one:', e);
    }

    const fresh = crypto.randomBytes(6).toString('hex'); // 12 hex chars, unique per install
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(idPath, fresh, 'utf8');
        console.log(`🆔 [Cloudflare Auto] Generated a new unique tunnel id for this installation: ${fresh}`);
    } catch (e) {
        console.error('[Cloudflare Auto] Failed to persist tunnel id:', e);
    }
    return fresh;
}

// Backend porti 3001 band bo'lsa 3002, 3003... ga o'tadi (Electron tanlaydi).
// Tunnel ingress'i ham AYNAN shu portga qarashi shart — aks holda ommaviy manzil
// 3001 dagi butunlay boshqa dasturga uzatib yuboradi.
function getLocalService(): string {
    const port = process.env.ELECTRON_BACKEND_PORT || process.env.PORT || '3001';
    return `http://localhost:${port}`;
}

// Mavjud tunnelning ingress sozlamasini joriy portga to'g'rilaydi.
// Tunnelni o'chirmaydi/qayta yaratmaydi — faqat marshrutni tuzatadi.
async function ensureIngressTarget(tunnelName: string, domain: string, headers: any) {
    const service = getLocalService();
    try {
        const search = await axios.get(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel?name=${tunnelName}`,
            { headers }
        );
        const tunnel = (search.data.result || [])[0];
        if (!tunnel) return;

        const cfg = await axios.get(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnel.id}/configurations`,
            { headers }
        );
        const current = cfg.data?.result?.config?.ingress?.[0]?.service;
        if (current === service) return; // allaqachon to'g'ri

        console.log(`🔧 [Cloudflare Auto] Ingress "${current}" -> "${service}" ga to'g'rilanmoqda...`);
        await axios.put(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnel.id}/configurations`,
            { config: { ingress: [{ hostname: domain, service }, { service: 'http_status:404' }] } },
            { headers }
        );
        console.log('✅ [Cloudflare Auto] Ingress to\'g\'rilandi');
    } catch (e: any) {
        console.warn('[Cloudflare Auto] Ingress\'ni to\'g\'rilab bo\'lmadi:', e.response?.data?.errors?.[0]?.message || e.message);
    }
}

export async function checkAndRegisterAutoTunnel() {
    // Kalitlar muhitda bo'lmasa — hech narsa qilmaymiz. Bu xato emas: masofadan
    // kirish ixtiyoriy imkoniyat, klinika mahalliy tarmoqda ishlayveradi.
    if (!hasCloudflareCredentials()) {
        console.log(
            '📡 [Cloudflare Auto] Kalitlar sozlanmagan (CLOUDFLARE_API_TOKEN, '
            + 'CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID) — avtomatik ro\'yxatdan '
            + 'o\'tish o\'tkazib yuborildi. Mahalliy tarmoqda ishlash buzilmaydi.'
        );
        return;
    }

    const envPath = path.join(__dirname, '.env');
    // Haqiqiy token/URL userData'dagi .env da saqlanadi; bundle ichidagi .env da ular bo'sh.
    // Faqat __dirname dan o'qilsa, token "yo'q" deb hisoblanib har ishga tushishda
    // qayta ro'yxatdan o'tishga urinadi va "1013 — tunnel allaqachon mavjud" xatosiga tushadi.
    const userEnvPath = process.env.ELECTRON_USER_DATA_PATH
        ? path.join(process.env.ELECTRON_USER_DATA_PATH.replace(/['"]/g, '').trim(), '.env')
        : '';
    let envContent = '';

    for (const p of [envPath, userEnvPath].filter(Boolean)) {
        try {
            if (fs.existsSync(p)) {
                const c = fs.readFileSync(p, 'utf8');
                // Keyingi fayl oldingisini to'ldiradi: to'ldirilgan qiymat ustun turadi
                if (/CLOUDFLARE_TUNNEL_TOKEN\s*=\s*["']?[^"'\r\n]+["']?/.test(c) || !envContent) {
                    envContent = c;
                }
            }
        } catch { /* o'qib bo'lmasa keyingisiga o'tamiz */ }
    }

    const tokenMatch = envContent.match(/CLOUDFLARE_TUNNEL_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?/);
    const urlMatch = envContent.match(/CLOUDFLARE_TUNNEL_URL\s*=\s*["']?([^"'\r\n]+)["']?/);
    const autoMatch = envContent.match(/CLOUDFLARE_AUTO_TUNNEL\s*=\s*["']?([^"'\r\n]+)["']?/);
    const isAutoEnabled = autoMatch ? autoMatch[1].trim() === 'true' : false;

    // This installation's own unique identity for the public tunnel. It is a random id
    // stored in this machine's userData, so every clinic gets its OWN independent link and
    // no other machine can ever claim or steal it.
    const uid = getTunnelSubdomainId();
    const subdomain = `denta-${uid}`;
    const tunnelName = `xclinic-${uid}`;
    const domain = `${subdomain}.denta-crm.com`;
    const targetSuffix = '.denta-crm.com';

    // Self-healing: the cached URL is stale/foreign if it doesn't end with our domain suffix,
    // OR its subdomain does not match THIS installation's own id. The second case is what
    // happens when a build ships with a baked-in URL — without this check the machine would
    // reuse that shared link instead of provisioning its own unique tunnel.
    const currentUrl = urlMatch && urlMatch[1] ? urlMatch[1].trim() : '';
    const isWrongDomain = !!currentUrl && (!currentUrl.endsWith(targetSuffix) || !currentUrl.includes(subdomain));

    if (!isAutoEnabled) {
        console.log('📡 [Cloudflare Auto] Automatic tunnel registration is disabled (CLOUDFLARE_AUTO_TUNNEL is not true). Skipping static registration.');
        return;
    }

    if (tokenMatch && tokenMatch[1] && currentUrl && !isWrongDomain) {
        console.log('🔗 [Cloudflare Auto] Tunnel is already configured for this machine in .env:', currentUrl);
        // Tunnel bor, lekin backend porti o'zgargan bo'lishi mumkin — marshrutni tekshiramiz
        await ensureIngressTarget(tunnelName, domain, {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json'
        });
        return;
    }

    if (isWrongDomain) {
        console.log(`🔄 [Cloudflare Auto] Tunnel URL "${currentUrl}" does not belong to this machine (expected ${subdomain}). Forcing a fresh, machine-specific registration...`);
    } else {
        console.log('⚡ [Cloudflare Auto] No tunnel token found. Starting automatic tunnel registration...');
    }

    try {
        // Generate a cryptographically secure random secret for the tunnel
        // Cloudflare requires 32-bytes base64 encoded
        const tunnelSecret = crypto.randomBytes(32).toString('base64');

        console.log(`📡 [Cloudflare Auto] Registering subdomain: ${domain}`);

        const headers = {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json'
        };

        // 1. Check if a tunnel with this name already exists on Cloudflare
        console.log(`🔍 [Cloudflare Auto] Checking if tunnel '${tunnelName}' exists...`);
        const searchTunnelsResponse = await axios.get(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel?name=${tunnelName}`,
            { headers }
        );

        const existingTunnels = searchTunnelsResponse.data.result || [];
        if (existingTunnels.length > 0) {
            console.log(`⚠️ [Cloudflare Auto] Existing tunnel found. Deleting old tunnel to refresh credentials...`);
            for (const t of existingTunnels) {
                try {
                    await axios.delete(
                        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${t.id}`,
                        { headers }
                    );
                    console.log(`✅ [Cloudflare Auto] Deleted old tunnel ID: ${t.id}`);
                } catch (e: any) {
                    console.warn(`[Cloudflare Auto] Failed to delete tunnel ${t.id}:`, e.message);
                }
            }
        }

        // 2. Create the new Cloudflare Tunnel
        console.log(`➕ [Cloudflare Auto] Creating new Cloudflare Tunnel...`);
        const createTunnelResponse = await axios.post(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel`,
            {
                name: tunnelName,
                tunnel_secret: tunnelSecret
            },
            { headers }
        );

        const tunnelId = createTunnelResponse.data.result.id;
        console.log(`✅ [Cloudflare Auto] Tunnel created successfully! ID: ${tunnelId}`);

        // 3. Configure local Ingress routing rules for this Tunnel
        console.log(`⚙️ [Cloudflare Auto] Configuring Ingress rules to route ${domain} to ${getLocalService()}...`);
        await axios.put(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/configurations`,
            {
                config: {
                    ingress: [
                        {
                            hostname: domain,
                            service: getLocalService()
                        },
                        {
                            service: 'http_status:404'
                        }
                    ]
                }
            },
            { headers }
        );
        console.log(`✅ [Cloudflare Auto] Ingress configuration saved!`);

        // 4. Manage DNS Records (CNAME)
        console.log(`🔍 [Cloudflare Auto] Checking if DNS record for '${domain}' already exists...`);
        const searchDnsResponse = await axios.get(
            `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${domain}`,
            { headers }
        );

        const existingDns = searchDnsResponse.data.result || [];
        if (existingDns.length > 0) {
            console.log(`⚠️ [Cloudflare Auto] Duplicate DNS record found. Removing it...`);
            for (const record of existingDns) {
                try {
                    await axios.delete(
                        `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`,
                        { headers }
                    );
                    console.log(`✅ [Cloudflare Auto] Deleted old DNS record ID: ${record.id}`);
                } catch (e: any) {
                    console.warn(`[Cloudflare Auto] Failed to delete DNS record ${record.id}:`, e.message);
                }
            }
        }

        // 5. Create new CNAME DNS Record pointing to the Tunnel
        console.log(`➕ [Cloudflare Auto] Creating new DNS CNAME record...`);
        await axios.post(
            `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records`,
            {
                type: 'CNAME',
                name: subdomain,
                content: `${tunnelId}.cfargotunnel.com`,
                proxied: true
            },
            { headers }
        );
        console.log(`✅ [Cloudflare Auto] DNS CNAME record successfully created!`);

        // 6. Generate the dynamic Cloudflare Tunnel Base64 Token
        const tokenObj = {
            a: CLOUDFLARE_ACCOUNT_ID,
            t: tunnelId,
            s: tunnelSecret
        };
        const generatedToken = Buffer.from(JSON.stringify(tokenObj)).toString('base64');

        // 7. Update .env file
        console.log(`📝 [Cloudflare Auto] Saving credentials to .env file...`);
        let newEnvContent = envContent;

        // Remove old occurrences of CLOUDFLARE_TUNNEL_TOKEN if they exist
        if (tokenMatch) {
            newEnvContent = newEnvContent.replace(/CLOUDFLARE_TUNNEL_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?/, `CLOUDFLARE_TUNNEL_TOKEN="${generatedToken}"`);
        } else {
            newEnvContent += `\nCLOUDFLARE_TUNNEL_TOKEN="${generatedToken}"`;
        }

        // Remove old occurrences of CLOUDFLARE_TUNNEL_URL if they exist
        if (urlMatch) {
            newEnvContent = newEnvContent.replace(/CLOUDFLARE_TUNNEL_URL\s*=\s*["']?([^"'\r\n]+)["']?/, `CLOUDFLARE_TUNNEL_URL="https://${domain}"`);
        } else {
            newEnvContent += `\nCLOUDFLARE_TUNNEL_URL="https://${domain}"`;
        }

        // Write the updated content back to BOTH backend/.env and Electron userData/.env
        const pathsToUpdate = [
            envPath
        ];
        if (process.env.ELECTRON_USER_DATA_PATH) {
            pathsToUpdate.push(path.join(process.env.ELECTRON_USER_DATA_PATH, '.env'));
        }

        for (const filePath of pathsToUpdate) {
            try {
                let fileEnvContent = '';
                if (fs.existsSync(filePath)) {
                    fileEnvContent = fs.readFileSync(filePath, 'utf8');
                }
                let updatedContent = fileEnvContent;

                // Update CLOUDFLARE_TUNNEL_TOKEN
                if (updatedContent.match(/CLOUDFLARE_TUNNEL_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?/)) {
                    updatedContent = updatedContent.replace(/CLOUDFLARE_TUNNEL_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?/, `CLOUDFLARE_TUNNEL_TOKEN="${generatedToken}"`);
                } else {
                    updatedContent += `\nCLOUDFLARE_TUNNEL_TOKEN="${generatedToken}"`;
                }

                // Update CLOUDFLARE_TUNNEL_URL
                if (updatedContent.match(/CLOUDFLARE_TUNNEL_URL\s*=\s*["']?([^"'\r\n]+)["']?/)) {
                    updatedContent = updatedContent.replace(/CLOUDFLARE_TUNNEL_URL\s*=\s*["']?([^"'\r\n]+)["']?/, `CLOUDFLARE_TUNNEL_URL="https://${domain}"`);
                } else {
                    updatedContent += `\nCLOUDFLARE_TUNNEL_URL="https://${domain}"`;
                }

                // Update CLOUDFLARE_AUTO_TUNNEL
                if (updatedContent.match(/CLOUDFLARE_AUTO_TUNNEL\s*=\s*["']?([^"'\r\n]+)["']?/)) {
                    updatedContent = updatedContent.replace(/CLOUDFLARE_AUTO_TUNNEL\s*=\s*["']?([^"'\r\n]+)["']?/, `CLOUDFLARE_AUTO_TUNNEL="true"`);
                } else {
                    updatedContent += `\nCLOUDFLARE_AUTO_TUNNEL="true"`;
                }

                fs.writeFileSync(filePath, updatedContent, 'utf8');
                console.log(`✅ [Cloudflare Auto] Saved credentials to env file: ${filePath}`);
            } catch (err: any) {
                console.error(`❌ [Cloudflare Auto] Failed to write to env path ${filePath}:`, err.message);
            }
        }

        console.log(`🚀 [Cloudflare Auto] Success! Dynamic tunnel registered at: https://${domain}`);
        console.log('💡 Note: The application will pick up these configurations next time cloudflared starts.');

    } catch (error: any) {
        console.error('❌ [Cloudflare Auto] Tunnel registration failed:', error.response?.data || error.message);
    }
}
