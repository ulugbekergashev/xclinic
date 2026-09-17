import { describe, it, expect } from 'vitest';
import {
    registerTunnel, expectedLicenseKey, subdomainFor, installProof, RegistrarEnv,
} from '../../api/tunnel-register';
import { upsertEnvLine } from '../tunnelClient';

/* ─────────────────────────────────────────────────────────────────────────────
   TUNNEL REGISTRATORI.

   Nima uchun sinaladi. Bu yerdagi xato ikki xil yo'qotish beradi:

     · jimgina — klinika doimiy manzil olmaydi va sabab ko'rinmaydi;
     · xavfli — begona o'rnatma boshqa klinikaning tunnelini oladi yoki
       zonani yozuvlar bilan to'ldiradi.

   Cloudflare API chaqirilmaydi: `fetch` o'rniga yozib boruvchi soxta
   funksiya beriladi va sinov QAYSI so'rovlar ketganini tekshiradi.
   ───────────────────────────────────────────────────────────────────────────── */

const SALT = 'test-salt';
const MACHINE = 'HWID-ABCDEF123456';
const KEY = expectedLicenseKey(MACHINE, SALT);

const ENV: RegistrarEnv = {
    CLOUDFLARE_API_TOKEN: 'cf-token',
    CLOUDFLARE_ACCOUNT_ID: 'acc1',
    CLOUDFLARE_ZONE_ID: 'zone1',
    CLOUDFLARE_TUNNEL_DOMAIN: 'getxclinic.com',
    XCLINIC_LICENSE_SALT: SALT,
};

/** Soxta Cloudflare: holatni saqlaydi va har so'rovni yozib boradi. */
function fakeCloudflare(opts: { tunnelExists?: boolean; dns?: any[]; failOn?: string; txt?: any[] } = {}) {
    const calls: { method: string; url: string; body?: any }[] = [];
    let tunnels = opts.tunnelExists ? [{ id: 'tun-old' }] : [];
    const dns = opts.dns ?? [];
    const txt: any[] = opts.txt ?? [];
    const fetchImpl = async (url: string, init: any = {}) => {
        const method = init.method || 'GET';
        const body = init.body ? JSON.parse(init.body) : undefined;
        calls.push({ method, url, body });
        const reply = (result: any) => ({ ok: true, status: 200, json: async () => ({ success: true, result }) });
        if (opts.failOn && url.includes(opts.failOn)) {
            return { ok: false, status: 500, json: async () => ({ success: false, errors: [{ code: 1000 }] }) };
        }
        if (method === 'GET' && url.includes('/cfd_tunnel?name=')) return reply(tunnels);
        if (method === 'POST' && url.endsWith('/cfd_tunnel')) { tunnels = [{ id: 'tun-new' }]; return reply({ id: 'tun-new' }); }
        if (method === 'PUT' && url.includes('/configurations')) return reply({});
        if (method === 'GET' && url.includes('/dns_records?type=TXT')) return reply(txt);
        if (method === 'POST' && url.includes('/dns_records') && body?.type === 'TXT') { txt.push({ id: 'txt1', ...body }); return reply({ id: 'txt1' }); }
        if (method === 'GET' && url.includes('/dns_records?name=')) return reply(dns);
        if (url.includes('/dns_records')) return reply({ id: 'rec1' });
        if (method === 'GET' && url.endsWith('/token')) return reply('RUN-TOKEN-' + url.split('/cfd_tunnel/')[1].split('/')[0]);
        return { ok: false, status: 404, json: async () => ({ success: false }) };
    };
    return { calls, fetchImpl, txt };
}

const ok = { machineId: MACHINE, licenseKey: KEY, port: 3001 };

describe('tunnel registratori — kirish nazorati', () => {
    it("sozlanmagan bo'lsa 503 (klinika Quick Tunnel bilan ishlayveradi)", async () => {
        const cf = fakeCloudflare();
        const r = await registerTunnel(ok, { ...ENV, CLOUDFLARE_API_TOKEN: '' }, cf.fetchImpl);
        expect(r.status).toBe(503);
        expect(cf.calls).toHaveLength(0);
    });

    it("litsenziya kaliti boshqa mashinaniki bo'lsa — 403 va Cloudflare'ga UMUMAN so'rov ketmaydi", async () => {
        const cf = fakeCloudflare();
        const r = await registerTunnel({ ...ok, licenseKey: expectedLicenseKey('HWID-BOSHQA99999', SALT) }, ENV, cf.fetchImpl);
        expect(r.status).toBe(403);
        expect(cf.calls).toHaveLength(0);
    });

    it("noto'g'ri machineId, kalit shakli va port rad etiladi", async () => {
        const cf = fakeCloudflare();
        expect((await registerTunnel({ ...ok, machineId: 'evil' }, ENV, cf.fetchImpl)).status).toBe(400);
        expect((await registerTunnel({ ...ok, licenseKey: 'short' }, ENV, cf.fetchImpl)).status).toBe(400);
        expect((await registerTunnel({ ...ok, port: 80 }, ENV, cf.fetchImpl)).status).toBe(400);
        expect(cf.calls).toHaveLength(0);
    });

    it('litsenziya hisobi licenseService dagi bilan bir xil shaklda (24 belgi, katta harf)', () => {
        expect(KEY).toMatch(/^[0-9A-F]{24}$/);
    });
});

describe('tunnel registratori — Cloudflare oqimi', () => {
    it('yangi mashina: tunnel yaratiladi, marshrut, DNS va token', async () => {
        const cf = fakeCloudflare();
        const r = await registerTunnel(ok, ENV, cf.fetchImpl);
        expect(r.status).toBe(200);
        const sub = subdomainFor(MACHINE);
        expect(r.body).toEqual({ url: `https://${sub}.getxclinic.com`, token: 'RUN-TOKEN-tun-new' });
        expect(cf.calls.some(c => c.method === 'POST' && c.url.endsWith('/cfd_tunnel'))).toBe(true);
        const cfg = cf.calls.find(c => c.url.includes('/configurations'))!;
        expect(cfg.body.config.ingress[0]).toEqual({ hostname: `${sub}.getxclinic.com`, service: 'http://localhost:3001' });
        const dns = cf.calls.find(c => c.method === 'POST' && c.url.includes('/dns_records'))!;
        expect(dns.body).toEqual({ type: 'CNAME', name: `${sub}.getxclinic.com`, content: 'tun-new.cfargotunnel.com', proxied: true });
    });

    /* Eski kod har safar tunnelni O'CHIRIB qaytadan yaratardi — ishlab turgan
       klinikaning ulanishi uzilardi. */
    it("mavjud tunnel O'CHIRILMAYDI va qayta yaratilmaydi", async () => {
        const cf = fakeCloudflare({ tunnelExists: true, dns: [{ id: 'rec1', type: 'CNAME', content: 'tun-old.cfargotunnel.com', proxied: true }] });
        const r = await registerTunnel(ok, ENV, cf.fetchImpl);
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ token: 'RUN-TOKEN-tun-old' });
        expect(cf.calls.some(c => c.method === 'DELETE')).toBe(false);
        expect(cf.calls.some(c => c.method === 'POST')).toBe(false);
        expect(cf.calls.some(c => c.method === 'PUT' && c.url.includes('/dns_records/'))).toBe(false);
    });

    it("port o'zgarsa marshrut YANGI port bilan yoziladi", async () => {
        const cf = fakeCloudflare({ tunnelExists: true });
        await registerTunnel({ ...ok, port: 3057 }, ENV, cf.fetchImpl);
        const cfg = cf.calls.find(c => c.url.includes('/configurations'))!;
        expect(cfg.body.config.ingress[0].service).toBe('http://localhost:3057');
    });

    it('eskirgan DNS yozuvi (boshqa tunnelga qaragan) yangilanadi', async () => {
        const cf = fakeCloudflare({ tunnelExists: true, dns: [{ id: 'rec9', type: 'CNAME', content: 'eski.cfargotunnel.com', proxied: true }] });
        await registerTunnel(ok, ENV, cf.fetchImpl);
        const put = cf.calls.find(c => c.method === 'PUT' && c.url.includes('/dns_records/rec9'));
        expect(put?.body.content).toBe('tun-old.cfargotunnel.com');
    });

    it("subdomen so'rovdan emas, MASHINADAN yasaladi va barqaror", () => {
        expect(subdomainFor(MACHINE)).toBe(subdomainFor(MACHINE));
        expect(subdomainFor(MACHINE)).not.toBe(subdomainFor('HWID-BOSHQA99999'));
        expect(subdomainFor(MACHINE)).toMatch(/^k-[0-9a-f]{10}$/);
    });

    it("Cloudflare xatosi 502 bo'ladi va javobga ichki tafsilot tushmaydi", async () => {
        const cf = fakeCloudflare({ failOn: '/configurations' });
        const r = await registerTunnel(ok, ENV, cf.fetchImpl);
        expect(r.status).toBe(502);
        expect(JSON.stringify(r.body)).not.toContain('cf-token');
    });
});

describe("tunnel registratori — o'rnatma kaliti (manzilni o'g'irlashdan himoya)", () => {
    const SECRET = 'a'.repeat(64);
    const OTHER = 'b'.repeat(64);
    const txtName = () => `_xca.${subdomainFor(MACHINE)}.getxclinic.com`;
    const bound = (secret: string) => [{ id: 't1', type: 'TXT', name: txtName(), content: `"${installProof(secret)}"` }];

    it("birinchi so'rov kalitni bog'laydi: TXT yozuviga faqat XESH yoziladi", async () => {
        const cf = fakeCloudflare();
        const r = await registerTunnel({ ...ok, installSecret: SECRET }, ENV, cf.fetchImpl);
        expect(r.status).toBe(200);
        expect(cf.txt).toHaveLength(1);
        expect(cf.txt[0]).toMatchObject({ type: 'TXT', name: txtName(), content: installProof(SECRET) });
        expect(JSON.stringify(cf.calls)).not.toContain(SECRET);
    });

    it("bog'langan kalit bilan qayta so'rov o'tadi va yangi TXT yaratilmaydi", async () => {
        const cf = fakeCloudflare({ tunnelExists: true, txt: bound(SECRET) });
        const r = await registerTunnel({ ...ok, installSecret: SECRET }, ENV, cf.fetchImpl);
        expect(r.status).toBe(200);
        expect(cf.calls.some(c => c.method === 'POST' && c.body?.type === 'TXT')).toBe(false);
        expect(cf.txt).toHaveLength(1);
    });

    it("BOSHQA kalit bilan — 403 va tunnel tokeni BERILMAYDI", async () => {
        const cf = fakeCloudflare({ tunnelExists: true, txt: bound(SECRET) });
        const r = await registerTunnel({ ...ok, installSecret: OTHER }, ENV, cf.fetchImpl);
        expect(r.status).toBe(403);
        expect(r.body).toMatchObject({ code: 'INSTALL_MISMATCH' });
        expect(cf.calls.some(c => c.url.endsWith('/token') || c.url.includes('/configurations'))).toBe(false);
    });

    it("kalitsiz so'rov (kalit to'g'ri litsenziya bilan ham) bog'langan manzilni ololmaydi", async () => {
        const cf = fakeCloudflare({ tunnelExists: true, txt: bound(SECRET) });
        const r = await registerTunnel(ok, ENV, cf.fetchImpl);
        expect(r.status).toBe(403);
    });

    it("eski dastur (kalitsiz), TXT hali yo'q — ilgarigidek xizmat, TXT yaratilmaydi", async () => {
        const cf = fakeCloudflare({ tunnelExists: true });
        const r = await registerTunnel(ok, ENV, cf.fetchImpl);
        expect(r.status).toBe(200);
        expect(cf.txt).toHaveLength(0);
    });

    it("kalit shakli noto'g'ri bo'lsa 400 va Cloudflare'ga so'rov ketmaydi", async () => {
        const cf = fakeCloudflare();
        const r = await registerTunnel({ ...ok, installSecret: 'qisqa' }, ENV, cf.fetchImpl);
        expect(r.status).toBe(400);
        expect(cf.calls).toHaveLength(0);
    });
});

describe('klinika tomoni — .env ni yangilash', () => {
    it("bor kalit almashtiriladi, qolgan qatorlarga tegilmaydi", () => {
        const before = 'PORT=3001\nCLOUDFLARE_TUNNEL_TOKEN="eski"\nJWT_SECRET=x\n';
        const after = upsertEnvLine(before, 'CLOUDFLARE_TUNNEL_TOKEN', 'yangi');
        expect(after).toBe('PORT=3001\nCLOUDFLARE_TUNNEL_TOKEN="yangi"\nJWT_SECRET=x\n');
    });

    it("yo'q kalit oxiriga qo'shiladi", () => {
        expect(upsertEnvLine('PORT=3001', 'CLOUDFLARE_TUNNEL_URL', 'https://k-1.d.com'))
            .toBe('PORT=3001\nCLOUDFLARE_TUNNEL_URL="https://k-1.d.com"\n');
    });
});
