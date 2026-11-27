/* RETSEPT VA TAHLIL NATIJASINI TELEGRAMGA PDF QILIB YUBORISH (2026-11-26).

   Haqiqiy Telegram CHAQIRILMAYDI: yurituvchi serverni
   TELEGRAM_API_BASE=http://127.0.0.1:3089 bilan ko'taradi, bu to'plam esa
   o'sha portda soxta Telegram ochadi va kelgan so'rovlarni yozib oladi.

   ASOSIY SAVOLLAR:
     1. Bot yo'q / bemor ulanmagan — aniq sabab bilan rad etiladimi?
     2. Retsept PDF bo'lib bemorning O'Z chatiga ketadimi; fayl nomida ism yo'qmi?
     3. 60 soniya ichida o'zgarmagan hujjatga ikkinchi bosish — 429; jurnal?
     4. Natija yo'q — rad; natija bor — ketadi; tuzatilgach — «tuzatildi».
     5. «O'zi yuborilsin» yoqilgan — buyurtma bajarilganda o'zi ketadimi?
     6. Telegram rad etsa (bot bloklangan) — odam tilida xato, jurnalda Failed.
     7. Ruxsat: kirmagan foydalanuvchi — 401 (rollar jadvali permissions.test.ts da).

   Bot tokeni va chat id bazaga to'g'ridan yoziladi (T_DB) va oxirida
   qaytariladi — boshqa to'plamlar «bot yo'q» holatiga tayanadi.

   Ishga tushirish: cd backend && T_ONLY=docsend npm run test:api
*/
import http from 'http';

const BASE = process.env.T_BASE || 'http://localhost:3079';
const MOCK_PORT = 3089;

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(method: string, path: string, body?: any, token?: string) {
    const r = await fetch(BASE + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ── Soxta Telegram ─────────────────────────────────────────────────────── */
interface Hit { path: string; chatId: string; filename: string; caption: string; size: number; isPdf: boolean }
const hits: Hit[] = [];
const BLOCKED_CHAT = '777000';

function startMock(): Promise<http.Server> {
    const srv = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('latin1');
            const field = (name: string) => {
                const m = new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(raw);
                return m ? Buffer.from(m[1], 'latin1').toString('utf8') : '';
            };
            const fn = /name="document"; filename="([^"]+)"/.exec(raw)?.[1] || '';
            const hit: Hit = {
                path: req.url || '', chatId: field('chat_id'), filename: fn, caption: field('caption'),
                size: chunks.reduce((n, c) => n + c.length, 0), isPdf: raw.includes('%PDF-'),
            };
            hits.push(hit);
            res.setHeader('Content-Type', 'application/json');
            if (hit.chatId === BLOCKED_CHAT) {
                res.statusCode = 403;
                res.end(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }));
                return;
            }
            res.end(JSON.stringify({ ok: true, result: { message_id: hits.length } }));
        });
    });
    return new Promise((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(MOCK_PORT, '127.0.0.1', () => resolve(srv));
    });
}

async function main() {
    const dbPath = process.env.T_DB;
    if (!dbPath) { console.log('  ⏭  T_DB berilmagan — to\'plam o\'tkazib yuborildi'); return finish(); }
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);

    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const api = (m: string, p: string, b?: any) => call(m, p, b, token);
    const clinicId = login.data?.user?.clinicId || db.prepare('SELECT id FROM Clinic LIMIT 1').get().id;
    const tag = String(Date.now()).slice(-6);

    const orig = db.prepare('SELECT botToken, labResultAutoSend FROM Clinic WHERE id = ?').get(clinicId);
    let mock: http.Server | null = null;
    try {
        mock = await startMock();

        const p = (await api('POST', '/patients', { firstName: 'Telegram', lastName: `Pdf${tag}`, gender: 'Female', dob: '1990-05-05', phone: `+99893${tag}1`, force: true })).data;
        const rx = (await api('POST', '/prescriptions', {
            patientId: p?.id, patientName: `Pdf${tag} Telegram`, doctorName: 'Dr. Sinov',
            items: [{ name: 'Paratsetamol', dosage: '500 mg', frequency: 'kuniga 3 mahal', mealTiming: 'after', durationDays: 5 }],
        })).data;
        ok('bemor va retsept yaratildi', !!p?.id && !!rx?.id, JSON.stringify(rx).slice(0, 120));
        if (!rx?.id) return;

        console.log('\n═══ 1. BOT YO\'Q / ULANMAGAN ═══════════════════════════');
        db.prepare('UPDATE Clinic SET botToken = NULL WHERE id = ?').run(clinicId);
        let r = await api('POST', `/prescriptions/${rx.id}/send-telegram`);
        ok('bot yo\'q — 409 NO_BOT', r.status === 409 && r.data?.code === 'NO_BOT', `${r.status} ${JSON.stringify(r.data)}`);
        let st = (await api('GET', `/patients/${p.id}/sent-docs`)).data;
        ok('holat: bot=false', st?.bot === false, JSON.stringify(st));

        db.prepare('UPDATE Clinic SET botToken = ? WHERE id = ?').run('TESTTOKEN', clinicId);
        r = await api('POST', `/prescriptions/${rx.id}/send-telegram`);
        ok('bemor ulanmagan — 409 NO_TELEGRAM', r.status === 409 && r.data?.code === 'NO_TELEGRAM', `${r.status} ${JSON.stringify(r.data)}`);
        ok('Telegramga hech narsa ketmadi', hits.length === 0);

        console.log('\n═══ 2. RETSEPT ═════════════════════════════════════════');
        const chat = `55${tag}`;
        db.prepare('UPDATE Patient SET telegramChatId = ? WHERE id = ?').run(chat, p.id);
        st = (await api('GET', `/patients/${p.id}/sent-docs`)).data;
        ok('holat: bot va ulangan, chat id qaytmaydi', st?.bot === true && st?.linked === true && !JSON.stringify(st).includes(chat), JSON.stringify(st));

        r = await api('POST', `/prescriptions/${rx.id}/send-telegram`);
        ok('yuborildi — 200, sentAt bor', r.status === 200 && !!r.data?.sentAt, `${r.status} ${JSON.stringify(r.data)}`);
        const h = hits[hits.length - 1];
        ok('soxta Telegram sendDocument oldi', !!h && h.path === '/botTESTTOKEN/sendDocument', h?.path);
        ok('bemorning o\'z chatiga', h?.chatId === chat, h?.chatId);
        ok('ichida haqiqiy PDF', !!h?.isPdf);
        ok('fayl nomida ism/telefon yo\'q', /^Retsept_\d{2}-\d{2}-\d{4}\.pdf$/.test(h?.filename || '') && !h.filename.includes('Pdf'), h?.filename);
        ok('izohda salom va ism', (h?.caption || '').includes('Telegram'), h?.caption);

        r = await api('POST', `/prescriptions/${rx.id}/send-telegram`);
        ok('60 soniya ichida qayta — 429 RECENT', r.status === 429 && r.data?.code === 'RECENT', `${r.status}`);

        st = (await api('GET', `/patients/${p.id}/sent-docs`)).data;
        ok('holatda yuborilgan vaqt', !!st?.sent?.[`rx:${rx.id}`], JSON.stringify(st?.sent));
        const log = db.prepare("SELECT * FROM TelegramLog WHERE refId = ? AND status = 'Sent'").get(`rx:${rx.id}`);
        ok('jurnalda qisqa yozuv, dori nomi yo\'q', !!log && log.type === 'Document' && !String(log.message).includes('Paratsetamol'), log?.message);
        const acc = db.prepare("SELECT * FROM AccessLog WHERE entityId = ? AND action = 'Export'").get(rx.id);
        ok('kim yuborgani AccessLog da', !!acc && acc.entityType === 'PrescriptionTelegram');

        const other = await api('POST', `/prescriptions/nonexistent-${tag}/send-telegram`);
        ok('yo\'q retsept — 404', other.status === 404, `${other.status}`);

        console.log('\n═══ 3. TAHLIL NATIJASI ═════════════════════════════════');
        const test = (await api('POST', '/lab-tests', {
            name: `PDF sinov ${tag}`, code: `PDF${tag}`, price: 0,
            parameters: [{ name: 'Gemoglobin', unit: 'g/L', refLow: 120, refHigh: 160 }, { name: 'Leykotsit', unit: '10^9/L', refLow: 4, refHigh: 9 }],
        })).data;
        const order = (await api('POST', '/lab-orders', { patientId: p.id, patientName: `Pdf${tag} Telegram`, doctorName: 'Dr. Sinov', testIds: [test?.id] })).data;
        ok('yo\'llanma yozildi', !!order?.id, JSON.stringify(order).slice(0, 120));
        if (!order?.id) return;

        r = await api('POST', `/lab-orders/${order.id}/send-telegram`);
        ok('natija yo\'q — 409 NO_RESULT', r.status === 409 && r.data?.code === 'NO_RESULT', `${r.status} ${JSON.stringify(r.data)}`);

        const view = (await api('GET', `/lab-orders/${order.id}/results`)).data;
        const item = view?.items?.[0];
        const enter = (vals: string[]) => api('POST', `/lab-orders/${order.id}/results`, {
            force: true,
            results: (item?.parameters || []).map((pr: any, i: number) => ({ orderItemId: item.id, parameterId: pr.parameterId, value: vals[i] ?? '' })),
        });
        const before = hits.length;
        const saved = await enter(['100', '6']);
        ok('natija saqlandi', saved.status === 200, `${saved.status} ${JSON.stringify(saved.data)}`);
        await sleep(600);
        ok('«o\'zi yuborilsin» o\'chiq — hech narsa ketmadi', hits.length === before);

        r = await api('POST', `/lab-orders/${order.id}/send-telegram`);
        ok('natija qo\'lda yuborildi', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`);
        const hl = hits[hits.length - 1];
        ok('tahlil fayli nomi', /^Tahlil_\d{2}-\d{2}-\d{4}\.pdf$/.test(hl?.filename || ''), hl?.filename);
        ok('birinchi yuborish — «tayyor»', (hl?.caption || '').includes('tayyor'), hl?.caption);

        r = await api('POST', `/lab-orders/${order.id}/send-telegram`);
        ok('o\'zgarmagan natija 60 s ichida — 429', r.status === 429 && r.data?.code === 'RECENT', `${r.status}`);

        /* Xuddi shu qiymatlar qayta saqlandi — bu tuzatish EMAS */
        await enter(['100', '6']);
        r = await api('POST', `/lab-orders/${order.id}/send-telegram`);
        ok('o\'sha qiymatlar qayta saqlansa ham — 429 (tuzatish emas)', r.status === 429, `${r.status}`);

        await sleep(20);
        await enter(['130', '6']);
        r = await api('POST', `/lab-orders/${order.id}/send-telegram`);
        ok('raqam tuzatildi — darhol qayta yuboriladi', r.status === 200, `${r.status} ${JSON.stringify(r.data)}`);
        ok('izohda «TUZATILDI»', /TUZATILDI/.test(hits[hits.length - 1]?.caption || ''), hits[hits.length - 1]?.caption);

        console.log('\n═══ 4. O\'ZI YUBORILSIN ═════════════════════════════════');
        const forbidden = await call('PUT', `/clinics/${clinicId}/lab-auto-send`, { enabled: true });
        ok('kirmagan — sozlamani o\'zgartira olmaydi', forbidden.status === 401 || forbidden.status === 403, `${forbidden.status}`);
        const on = await api('PUT', `/clinics/${clinicId}/lab-auto-send`, { enabled: true });
        ok('sozlama yoqildi', on.status === 200 && on.data?.labResultAutoSend === true, `${on.status} ${JSON.stringify(on.data)}`);

        const order2 = (await api('POST', '/lab-orders', { patientId: p.id, patientName: `Pdf${tag} Telegram`, doctorName: 'Dr. Sinov', testIds: [test.id] })).data;
        const view2 = (await api('GET', `/lab-orders/${order2.id}/results`)).data;
        const it2 = view2.items[0];
        const before2 = hits.length;
        /* Chala: ikki ko'rsatkichdan bittasi — buyurtma «bajarildi» bo'ladi,
           lekin bemorga bir qatorli varaq ketmasligi kerak */
        await api('POST', `/lab-orders/${order2.id}/results`, {
            force: true, results: [{ orderItemId: it2.id, parameterId: it2.parameters[0].parameterId, value: '5' }],
        });
        await sleep(800);
        ok('chala natija o\'zi ketmadi', hits.length === before2, `${hits.length - before2} ta`);

        await api('POST', `/lab-orders/${order2.id}/results`, {
            force: true, results: it2.parameters.map((pr: any) => ({ orderItemId: it2.id, parameterId: pr.parameterId, value: '5' })),
        });
        let waited = 0;
        while (hits.length === before2 && waited < 5000) { await sleep(200); waited += 200; }
        ok('bajarilishi bilan natija o\'zi ketdi', hits.length === before2 + 1, `${hits.length - before2} ta`);
        const autoLog = db.prepare("SELECT * FROM TelegramLog WHERE refId = ? AND status = 'Sent'").get(`lab:${order2.id}`);
        ok('jurnalda manba lab_auto', autoLog?.source === 'lab_auto', autoLog?.source);

        await api('POST', `/lab-orders/${order2.id}/results`, {
            force: true, results: it2.parameters.map((pr: any) => ({ orderItemId: it2.id, parameterId: pr.parameterId, value: '6' })),
        });
        await sleep(800);
        ok('tuzatish (qayta saqlash) o\'zi qayta yubormaydi', hits.length === before2 + 1, `${hits.length - before2} ta`);
        await api('PUT', `/clinics/${clinicId}/lab-auto-send`, { enabled: false });

        console.log('\n═══ 5. TELEGRAM RAD ETSA ═══════════════════════════════');
        const p2 = (await api('POST', '/patients', { firstName: 'Blok', lastName: `Pdf${tag}`, gender: 'Male', phone: `+99893${tag}2`, force: true })).data;
        db.prepare('UPDATE Patient SET telegramChatId = ? WHERE id = ?').run(BLOCKED_CHAT, p2.id);
        const rx2 = (await api('POST', '/prescriptions', { patientId: p2.id, patientName: 'Blok', items: [{ name: 'Vitamin C' }] })).data;
        r = await api('POST', `/prescriptions/${rx2.id}/send-telegram`);
        ok('bot bloklangan — 502, odam tilida', r.status === 502 && /bloklagan/.test(r.data?.error || ''), `${r.status} ${JSON.stringify(r.data)}`);
        const failed = db.prepare("SELECT * FROM TelegramLog WHERE refId = ? ORDER BY sentAt DESC").get(`rx:${rx2.id}`);
        ok('jurnalda Failed va sabab', failed?.status === 'Failed' && /bloklagan/.test(failed?.error || ''), JSON.stringify(failed?.error));
        r = await api('POST', `/prescriptions/${rx2.id}/send-telegram`);
        ok('xatodan keyin darhol qayta urinish mumkin (429 emas)', r.status === 502, `${r.status}`);

        console.log('\n═══ 6. RUXSAT ══════════════════════════════════════════');
        const anon = await call('POST', `/prescriptions/${rx.id}/send-telegram`);
        ok('kirmagan — 401/403', anon.status === 401 || anon.status === 403, `${anon.status}`);
        const anonSt = await call('GET', `/patients/${p.id}/sent-docs`);
        ok('kirmagan holatni ko\'rmaydi', anonSt.status === 401 || anonSt.status === 403, `${anonSt.status}`);

    } finally {
        db.prepare('UPDATE Clinic SET botToken = ?, labResultAutoSend = ? WHERE id = ?').run(orig?.botToken ?? null, orig?.labResultAutoSend ?? 0, clinicId);
        db.close();
        mock?.close();
    }
    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
