/* S2.2 sinovi: MKB-10 SPRAVOCHNIGI.

   ASOSIY SAVOL: qabulga tashxis kiritish mumkinmi?

   Audit topgan holat (B-02, «Kritik»): «gipert», «I10», «a» — uchalasi ham
   bo'sh natija. Kod ko'rilganda ma'lum bo'ldiki, endpoint, indeks va
   interfeys joyida edi — `ICD10Code` jadvalida BOR-YO'G'I 1 TA QATOR bor
   edi. Ya'ni qidiruv to'g'ri ishlab, qidiradigan narsa yo'q edi.

   Ishga tushirish: cd backend && npm run test:api
*/
const BASE = process.env.T_BASE || 'http://localhost:3079';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = '') => {
    if (cond) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

async function call(path: string, token?: string) {
    const r = await fetch(BASE + '/api' + path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
    return { status: r.status, data };
}

async function main() {
    const login = await fetch(BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'testpass123' }),
    });
    const token = (await login.json())?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 1. SPRAVOCHNIK TO\'LDIRILGANMI ═════════════════');
    const all = await call('/icd10?query=a', token);
    ok('qidiruv javob berdi', all.status === 200, `status: ${all.status}`);
    ok('natija BO\'SH EMAS', Array.isArray(all.data) && all.data.length > 0,
        `topildi: ${Array.isArray(all.data) ? all.data.length : 'massiv emas'}`);

    console.log('\n═══ 2. AUDITDAGI UCHTA SO\'ROV ═════════════════════');
    /* Aynan audit sinab ko'rgan uchta so'rov — uchalasi ham bo'sh edi. */
    for (const q of ['gipert', 'I10', 'a']) {
        const r = await call(`/icd10?query=${encodeURIComponent(q)}`, token);
        ok(`«${q}» natija qaytardi`, Array.isArray(r.data) && r.data.length > 0,
            `topildi: ${Array.isArray(r.data) ? r.data.length : 0}`);
    }

    console.log('\n═══ 3. TARTIB — KERAKLISI BIRINCHI ════════════════');
    const i10 = await call('/icd10?query=I10', token);
    ok('«I10» birinchi natija aynan I10',
        i10.data?.[0]?.code === 'I10', String(i10.data?.[0]?.code));

    const gipert = await call('/icd10?query=gipert', token);
    const codes = (gipert.data || []).map((c: any) => c.code);
    ok('«gipert» ro\'yxatida I10 bor', codes.includes('I10'), codes.slice(0, 5).join(', '));

    console.log('\n═══ 4. IKKI TILDA QIDIRUV ═════════════════════════');
    const ru = await call(`/icd10?query=${encodeURIComponent('гиперт')}`, token);
    ok('ruscha so\'rov ham topadi', Array.isArray(ru.data) && ru.data.length > 0,
        `topildi: ${Array.isArray(ru.data) ? ru.data.length : 0}`);
    ok('ruscha nom javobda bor', !!ru.data?.[0]?.nameRu, String(ru.data?.[0]?.nameRu).slice(0, 40));

    const uz = await call(`/icd10?query=${encodeURIComponent('qandli')}`, token);
    ok('o\'zbekcha so\'rov topadi (qandli diabet)',
        (uz.data || []).some((c: any) => String(c.code).startsWith('E1')),
        (uz.data || []).map((c: any) => c.code).slice(0, 4).join(', '));

    console.log('\n═══ 5. BO\'SH SO\'ROV ═══════════════════════════════');
    /* Bo'sh maydonda bo'sh ro'yxat «ishlamayapti» degan taassurot beradi —
       aynan shu audit B-02 ga olib kelgan. Endi namuna qaytadi. */
    const empty = await call('/icd10?query=', token);
    ok('bo\'sh so\'rovda namuna ko\'rsatiladi',
        Array.isArray(empty.data) && empty.data.length > 0,
        `topildi: ${Array.isArray(empty.data) ? empty.data.length : 0}`);

    console.log('\n═══ 6. QAMROV ═════════════════════════════════════');
    const specialties: [string, string][] = [
        ['E11', 'qandli diabet'],
        ['J06', 'ORVI'],
        ['N39', 'siydik yo\'llari infeksiyasi'],
        ['M54', 'bel og\'rig\'i'],
        ['K29', 'gastrit'],
        ['O80', 'tug\'ruq'],
        ['Z23', 'emlash'],
    ];
    let found = 0;
    const missing: string[] = [];
    for (const [code, label] of specialties) {
        const r = await call(`/icd10?query=${encodeURIComponent(code)}`, token);
        if ((r.data || []).some((c: any) => String(c.code).startsWith(code))) found++;
        else missing.push(`${code} (${label})`);
    }
    ok(`asosiy mutaxassisliklar qamrab olingan (${found}/${specialties.length})`,
        found === specialties.length, missing.join(', '));

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
