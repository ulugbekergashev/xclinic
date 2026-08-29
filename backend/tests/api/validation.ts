/* S3.1 / S3.2 / S3.5 sinovi: UMUMIY VALIDATSIYA.

   ASOSIY SAVOL: server yaroqsiz ma'lumotni rad etadimi — front nima
   qilishidan qat'i nazar?

   Audit topgan holat:
     B-10 «Kritik»  — harorat 500 °C, AD 9999, puls −40, vazn 0 hech
                      qanday ogohlantirishsiz saqlanardi;
     B-13 «Jiddiy»  — «abcdefg!!!» telefon sifatida saqlanardi. Front
                      ogohlantirardi, lekin saqlashni TO'XTATMASDI, va
                      bazada `+99890000000M` kabi yozuvlar paydo bo'lgan.

   Sinov ATAYLAB HTTP orqali yuriladi: front tekshiruvini chetlab o'tib,
   server o'zi qo'riqlayotganini isbotlaydi.

   Ishga tushirish: cd backend && npm run test:api
*/
const BASE = process.env.T_BASE || 'http://localhost:3079';

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

let seq = 0;
const uniquePhone = () => `+99890${String(1000000 + (seq++) + (Date.now() % 100000)).slice(-7)}`;

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 1. TELEFON — YAROQSIZ SAQLANMAYDI ═════════════');
    const badPhones = ['abcdefg!!!', '+99890000000M', '123', 'salom'];
    let blocked = 0;
    const leaks: string[] = [];
    for (const phone of badPhones) {
        const r = await call('POST', '/patients', {
            firstName: 'Sinov', lastName: 'Telefon', gender: 'Male', phone, force: true,
        }, token);
        if (r.status === 400) blocked++;
        else leaks.push(`${phone} → ${r.status}`);
    }
    ok(`yaroqsiz raqamlarning hammasi rad etildi (${blocked}/${badPhones.length})`,
        blocked === badPhones.length, leaks.join('; '));

    const goodPhone = uniquePhone();
    const good = await call('POST', '/patients', {
        firstName: 'Sinov', lastName: 'Yaroqli', gender: 'Female', phone: goodPhone, force: true,
    }, token);
    ok('yaroqli raqam o\'tdi', good.status === 200, `status: ${good.status}`);
    ok('telefon NORMALLASHTIRIB saqlandi (998...)',
        String(good.data?.phone || '').startsWith('998'), String(good.data?.phone));

    console.log('\n═══ 2. MAYDON XATOLARI ALOHIDA QAYTADI ════════════');
    /* Forma hamma xatoni birdan ko'rsatishi kerak — foydalanuvchi
       ularni bittalab topib chiqmasin. */
    const multi = await call('POST', '/patients', {
        firstName: '', lastName: 'X', gender: 'Erkak', phone: 'yoq', dob: '3026-01-01',
    }, token);
    ok('bir nechta xato bo\'lganda 400', multi.status === 400, `status: ${multi.status}`);
    const fields = multi.data?.fields || {};
    ok('xatolar maydonlar bo\'yicha ajratilgan', Object.keys(fields).length >= 3,
        Object.keys(fields).join(', '));
    ok('kelajakdagi tug\'ilgan sana topildi', !!fields.dob, String(fields.dob));
    ok('noto\'g\'ri jins topildi', !!fields.gender, String(fields.gender));

    console.log('\n═══ 3. JINS — TAXMIN QILINMAYDI ═══════════════════');
    /* Ilgari `gender: gender || 'Male'` turardi va «Lola Karimov» lidi
       bemorga aylantirilganda erkak bo'lib qolgan edi (B-34). */
    const noGender = await call('POST', '/patients', {
        firstName: 'Lola', lastName: 'Karimova', phone: uniquePhone(), force: true,
    }, token);
    ok('jinssiz bemor rad etildi (erkak deb taxmin qilinmadi)',
        noGender.status === 400, `status: ${noGender.status}`);

    console.log('\n═══ 4. KO\'RSATKICHLAR — FIZIOLOGIK CHEGARA ════════');
    const patientId = good.data?.id;
    if (!patientId) { ok('sinov bemori bor', false); return finish(); }

    /* Auditdagi aynan qiymatlar. */
    const absurd: [string, number][] = [
        ['Temp', 500], ['Temp', 12], ['Pulse', -40], ['BpSys', 9999],
        ['Weight', 0], ['SpO2', 150], ['Height', 3],
    ];
    let vBlocked = 0;
    const vLeaks: string[] = [];
    for (const [kind, value] of absurd) {
        const r = await call('POST', '/vitals', {
            patientId, measurements: [{ kind, value }],
        }, token);
        if (r.status === 400) vBlocked++;
        else vLeaks.push(`${kind}=${value} → ${r.status}`);
    }
    ok(`absurd qiymatlarning hammasi rad etildi (${vBlocked}/${absurd.length})`,
        vBlocked === absurd.length, vLeaks.join('; '));

    const sane = await call('POST', '/vitals', {
        patientId, measurements: [{ kind: 'Temp', value: 38.5 }, { kind: 'Pulse', value: 92 }],
    }, token);
    ok('normal qiymatlar o\'tdi', sane.status === 200, `status: ${sane.status}`);

    /* KASAL odamning ko'rsatkichi normadan chiqadi — u SAQLANISHI kerak.
       Fiziologik chegara va norma — ikki boshqa narsa. */
    const feverish = await call('POST', '/vitals', {
        patientId, measurements: [{ kind: 'Temp', value: 39.8 }],
    }, token);
    ok('normadan chiqqan, lekin mumkin bo\'lgan qiymat SAQLANDI (39.8 °C)',
        feverish.status === 200, `status: ${feverish.status}`);

    console.log('\n═══ 5. HECH NARSA YARIM SAQLANMAYDI ═══════════════');
    /* Bitta o'lchov noto'g'ri bo'lsa, boshqasini yozib qo'yish yarim
       holat yaratadi va hamshira nima saqlanganini bilmaydi. */
    const before = await call('GET', `/patients/${patientId}/vitals`, undefined, token);
    const n0 = (before.data || []).length;
    const mixed = await call('POST', '/vitals', {
        patientId, measurements: [{ kind: 'Pulse', value: 80 }, { kind: 'Temp', value: 500 }],
    }, token);
    ok('aralash to\'plam rad etildi', mixed.status === 400, `status: ${mixed.status}`);
    const after = await call('GET', `/patients/${patientId}/vitals`, undefined, token);
    ok('to\'g\'ri o\'lchov ham saqlanmadi (hammasi yoki hech narsa)',
        (after.data || []).length === n0, `oldin ${n0}, keyin ${(after.data || []).length}`);

    console.log('\n═══ 6. KO\'RIK BAYONI HAM TEKSHIRILADI ═════════════');
    /* Auditdagi 500 °C aynan shu yo'ldan kirgan: «Ko'rik bayoni →
       KO'RSATKICHLAR». Bu `examData` JSON'i, alohida marshrut. */
    const visit = await call('POST', '/visits', { patientId }, token);
    const visitId = visit.data?.id;
    ok('sinov qabuli yaratildi', !!visitId, `status: ${visit.status}`);
    if (visitId) {
        const badExam = await call('PUT', `/visits/${visitId}`, {
            examData: JSON.stringify({ temperature: 500, pulse: 70 }),
        }, token);
        ok('ko\'rik bayonidagi 500 °C rad etildi', badExam.status === 400, `status: ${badExam.status}`);
        ok('xato qaysi maydon ekani aytildi', badExam.data?.field === 'temperature',
            String(badExam.data?.field));

        const okExam = await call('PUT', `/visits/${visitId}`, {
            examData: JSON.stringify({ temperature: 37.4, pulse: 70, height: 175, weight: 70 }),
        }, token);
        ok('to\'g\'ri bayon saqlandi', okExam.status === 200, `status: ${okExam.status}`);

        /* Chegarasi yo'q maydonlar erkin qoladi — shablonda ixtiyoriy
           raqamli maydon bo'lishi mumkin. */
        const freeField = await call('PUT', `/visits/${visitId}`, {
            examData: JSON.stringify({ someCustomNumber: 99999 }),
        }, token);
        ok('chegarasi yo\'q maydon to\'silmadi', freeField.status === 200, `status: ${freeField.status}`);
    }

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
