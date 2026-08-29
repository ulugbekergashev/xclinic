/* 7.2 sinovi: zaxiradan TIKLASH yo'li.

   "Hech qachon tiklanmagan nusxa — nusxa emas, faqat umid."

   Bu sinov HAQIQIY tiklash kodini chaqiradi (`electron/restore.ts` dagi
   `applyPendingRestore`), server tomoni esa belgi faylini haqiqiy endpoint
   orqali qo'yadi — ya'ni ikki yarim orasidagi SHARTNOMA ham tekshiriladi.

   IKKI BOSQICH, chunki haqiqiy oqim ham shunday: server bazani ochiq tutadi,
   Electron esa tiklashni backend ishga tushishidan OLDIN qiladi.

     1-bosqich (server ishlayapti):  nusxa, bemorlar, belgi qo'yish/bekor qilish
     2-bosqich (server to'xtatilgan): haqiqiy tiklash va tekshiruv

   Ishga tushirish:
     T_DB=… T_USERDATA=… npx ts-node --transpile-only _t_restore.ts 1 <token>
     (serverni to'xtating)
     T_DB=… T_USERDATA=… npx ts-node --transpile-only _t_restore.ts 2
*/
import fs from 'fs';
import path from 'path';
/* Kompilyatsiya qilingan modulni chaqiramiz — aynan shu kod o'rnatmaga
   yetkaziladi. Manba `.ts` ni to'g'ridan-to'g'ri import qilib bo'lmaydi:
   ildiz `package.json` da `"type": "module"`, backend esa CommonJS. */
const { applyPendingRestore } = require(process.env.T_RESTORE_MODULE!);

const BASE = process.env.T_BASE || 'http://localhost:3091';
const PHASE = process.argv[2];
const TOKEN = process.argv[3];
const USER_DATA = process.env.T_USERDATA!;
const DB_PATH = process.env.T_DB!;
const STATE = path.join(USER_DATA, '_t_restore_state.json');

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function api(method: string, p: string, body?: any) {
    const r = await fetch(BASE + '/api' + p, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

const Database = require('better-sqlite3');
function countPatients(): number {
    const db = new Database(DB_PATH, { readonly: true });
    const n = db.prepare('SELECT COUNT(*) c FROM Patient').get().c;
    db.close();
    return n;
}

const markerPath = () => path.join(USER_DATA, 'restore-pending.json');
const finish = () => {
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} o'tdi, ${fail} yiqildi\n`);
    process.exit(fail === 0 ? 0 : 1);
};

async function phase1() {
    console.log('\n═══ 1. NUSXA OLAMIZ ═══════════════════════════════');
    const before = countPatients();
    const backup = await api('POST', '/admin/backup', { note: 'tiklash mashqi' });
    ok('nusxa olindi', backup.status === 200 && !!backup.data?.file,
        `${JSON.stringify(backup.data).slice(0, 120)}`);
    const file = backup.data?.file;
    console.log(`     nusxa: ${file}, o'sha paytda ${before} ta bemor`);

    console.log('\n═══ 2. NUSXADAN KEYIN 5 BEMOR QO\'SHAMIZ ═══════════');
    for (let i = 0; i < 5; i++) {
        await api('POST', '/patients', {
            firstName: `Tiklash${i}`, lastName: 'Sinovov',
            phone: `+99890000${100 + i}`, gender: 'Male',
        });
    }
    const afterAdd = countPatients();
    ok('5 ta bemor qo\'shildi', afterAdd === before + 5, `${before} → ${afterAdd}`);

    console.log('\n═══ 3. TIKLASHNI BELGILAYMIZ (server endpointi) ═══');
    const staged = await api('POST', '/admin/backup/restore', { file, confirm: true });
    ok('tiklash belgilandi', staged.status === 200 && staged.data?.staged === true,
        `status: ${staged.status}, ${JSON.stringify(staged.data).slice(0, 110)}`);
    ok('qayta ishga tushirish talab qilindi', staged.data?.restartRequired === true);
    ok('belgi fayli yaratildi', fs.existsSync(markerPath()));
    ok('holat "belgilangan" deb ko\'rsatildi',
        (await api('GET', '/admin/backup/restore')).data?.staged === true);

    console.log('\n═══ 4. BEKOR QILISH YO\'LI ═════════════════════════');
    const cancelled = await api('DELETE', '/admin/backup/restore');
    ok('belgilangan tiklash bekor qilindi', cancelled.status === 200);
    ok('belgi fayli o\'chdi', !fs.existsSync(markerPath()));
    ok('baza tegilmadi (bemorlar joyida)', countPatients() === afterAdd);

    // Haqiqiy tiklash uchun qayta belgilaymiz
    await api('POST', '/admin/backup/restore', { file, confirm: true });
    ok('haqiqiy tiklash uchun qayta belgilandi', fs.existsSync(markerPath()));

    fs.writeFileSync(STATE, JSON.stringify({ before, afterAdd, file, pass, fail }), 'utf8');
    console.log(`\n1-bosqich tugadi: ${pass} o'tdi, ${fail} yiqildi. Serverni to'xtating.\n`);
    process.exit(fail === 0 ? 0 : 1);
}

function phase2() {
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    pass = st.pass; fail = st.fail;

    console.log('\n═══ 5. HAQIQIY TIKLASH (Electron kodi) ════════════');
    ok('belgi hali joyida', fs.existsSync(markerPath()));

    applyPendingRestore(USER_DATA, DB_PATH);

    const afterRestore = countPatients();
    ok('BAZA TIKLANDI: 5 ta yangi bemor yo\'q', afterRestore === st.before,
        `kutilgan ${st.before}, hozir ${afterRestore}`);
    ok('belgi fayli o\'chirildi (takrorlanmaydi)', !fs.existsSync(markerPath()));

    const backupDir = path.join(USER_DATA, 'backups');
    const preRestore = fs.readdirSync(backupDir).filter((f) => /^pre-restore-.*\.db$/.test(f)).sort();
    ok('QAYTISH YO\'LI bor: pre-restore nusxasi yaratildi', preRestore.length >= 1,
        `topildi: ${preRestore.length}`);

    if (preRestore.length) {
        const db = new Database(path.join(backupDir, preRestore[preRestore.length - 1]), { readonly: true });
        const n = db.prepare('SELECT COUNT(*) c FROM Patient').get().c;
        db.close();
        ok('pre-restore nusxasida 5 ta bemor SAQLANGAN', n === st.afterAdd,
            `pre-restore da ${n}, tiklashdan oldin ${st.afterAdd}`);
    }

    const leftovers = ['-wal', '-shm', '-journal'].filter((s) => fs.existsSync(DB_PATH + s));
    ok('eski WAL/SHM fayllari tozalandi', leftovers.length === 0, `qolgan: ${leftovers.join(', ')}`);

    console.log('\n═══ 6. YOMON BELGI FAYLI — himoya ═════════════════');
    const n1 = countPatients();

    fs.writeFileSync(markerPath(), JSON.stringify({ file: '../../../etc/passwd' }), 'utf8');
    applyPendingRestore(USER_DATA, DB_PATH);
    ok('yo\'l bilan chiqishga urinish rad etildi', countPatients() === n1);
    ok('yomon belgi o\'chirildi', !fs.existsSync(markerPath()));

    fs.writeFileSync(markerPath(), '{buzuq json', 'utf8');
    applyPendingRestore(USER_DATA, DB_PATH);
    ok('buzuq belgi fayli xavfsiz o\'tkazildi', !fs.existsSync(markerPath()) && countPatients() === n1);

    fs.writeFileSync(markerPath(), JSON.stringify({ file: 'xclinic-20200101-000000.db' }), 'utf8');
    applyPendingRestore(USER_DATA, DB_PATH);
    ok('mavjud bo\'lmagan nusxa rad etildi', !fs.existsSync(markerPath()) && countPatients() === n1);

    finish();
}

if (!USER_DATA || !DB_PATH) { console.error('T_USERDATA va T_DB kerak'); process.exit(1); }
if (PHASE === '1') { main1(); } else { phase2(); }

async function main1() {
    if (!TOKEN) { console.error('token kerak'); process.exit(1); }
    await phase1();
}
