/* DAVOLASH TO'PLAMI VA ALLERGIYA sinovi (2026-11-26).

   ASOSIY SAVOLLAR:
     1. Penitsillin allergiyasi bor bemorga amoksitsillin (guruhdan) yozilsa
        server rad etadimi (409 ALLERGY)? «Baribir yozish» bilan yoziladimi va
        retsept izohida qoladimi? Allergiyasiz dori to'siqsiz yoziladimi?
     2. Dorining «ovqatdan keyin» belgisi saqlanadimi?
     3. To'plam: tarkib tozalanadi (noma'lum tur tashlanadi), ro'yxatda chiqadi,
        «ishlatildi» soni oshadi, o'chirilgach ko'rinmaydi; bo'sh to'plam rad.

   Ishga tushirish: cd backend && npm run test:api
*/
import { checkDrugAllergy } from '../../../shared/allergyMatch';

const BASE = process.env.T_BASE || 'http://localhost:3079';

/* Moslik jadvali — dori bazasisiz guruhlar. Har biri: dori, allergiya, kutilgan daraja.
   «none» — ogohlantirish BO'LMASLIGI kerak (charchatuvchi soxta signal). */
const MATCH_CASES: [string, string, string][] = [
    ['Amoksitsillin 500 mg', 'Penitsillin', 'class'],
    ['Augmentin 625', 'Пенициллин', 'class'],
    ['Аугментин', 'penicillin', 'class'],
    ['Fenoksimetilpenitsillin', 'Penitsillin', 'class'],
    ['Kloksatsillin', 'Penitsillin', 'class'],
    ['Seftriakson 1 g', 'Penitsillin', 'related'],
    ['Ampitsillin', 'Ampitsillin', 'direct'],
    ['Biseptol', 'sulfanilamid', 'class'],
    ['Co-trimoxazole', 'Sulfanilamid', 'class'],
    ['Magniy sulfat 25%', 'sulfanilamid', 'none'],
    ['Diklofenak', 'Aspirin', 'class'],
    ['Nurofen', 'ибупрофен', 'class'],
    ['Paratsetamol 500 mg', 'Aspirin', 'none'],
    ["Ko'k yod", 'Yod', 'direct'],
    ['Baralgin', 'analgin', 'class'],
    ['Amoksiklav', 'antibiotiklar', 'class'],
    ['Loratadin 10 mg', 'Penitsillin', 'none'],
    ['Vazelin', 'Penitsillin', 'none'],
];

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

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();
    const api = (m: string, p: string, b?: any) => call(m, p, b, token);
    const tag = String(Date.now()).slice(-6);

    console.log('\n═══ 0. MOSLIK JADVALI (dori ↔ allergiya) ════════════');
    for (const [drug, allergy, want] of MATCH_CASES) {
        const got = checkDrugAllergy(drug, [{ substance: allergy, severity: 'Unknown', isActive: true }])[0]?.level || 'none';
        ok(`${drug} ↔ ${allergy}: ${want}`, got === want, `chiqdi: ${got}`);
    }

    console.log('\n═══ 1. ALLERGIYA ════════════════════════════════════');
    const p = (await api('POST', '/patients', { firstName: 'Allergik', lastName: `Sinov${tag}`, gender: 'Female', phone: `+99898${tag}1`, force: true })).data;
    ok('bemor yaratildi', !!p?.id);
    if (!p?.id) return finish();
    const al = await api('POST', `/patients/${p.id}/allergies`, { substance: 'Пенициллин', severity: 'Severe' });
    ok('allergiya yozildi (kirillcha)', al.status === 200 || al.status === 201, `status ${al.status}`);

    const blocked = await api('POST', '/prescriptions', {
        patientId: p.id, patientName: 'Sinov', items: [{ name: 'Amoksitsillin 500 mg', dosage: '1 kapsula', frequency: 'Kuniga 3 mahal', durationDays: 7 }],
    });
    ok('amoksitsillin — 409 ALLERGY', blocked.status === 409 && blocked.data?.code === 'ALLERGY', `status ${blocked.status}`);
    ok('javobda sabab: penitsillin guruhi', (blocked.data?.hits || []).some((h: any) => h.level === 'class'), JSON.stringify(blocked.data?.hits || []).slice(0, 160));

    const brand = await api('POST', '/prescriptions', { patientId: p.id, patientName: 'Sinov', items: [{ name: 'Аугментин 625' }] });
    ok('Augmentin (kirillcha savdo nomi) ham ushlandi', brand.status === 409, `status ${brand.status}`);

    const acked = await api('POST', '/prescriptions', {
        patientId: p.id, patientName: 'Sinov',
        items: [{ name: 'Amoksitsillin 500 mg', mealTiming: 'after', allergyAck: true, allergyReason: 'Avval ichgan' }],
    });
    ok('«Baribir yozish» bilan yozildi', acked.status === 200, `status ${acked.status}: ${JSON.stringify(acked.data).slice(0, 120)}`);
    ok('retsept izohida ogohlantirish qoldi', /Allergiya ogohlantirishi o'tkazildi/.test(acked.data?.notes || ''), String(acked.data?.notes));
    ok('«ovqatdan keyin» saqlandi', acked.data?.items?.[0]?.mealTiming === 'after', String(acked.data?.items?.[0]?.mealTiming));

    const clean = await api('POST', '/prescriptions', { patientId: p.id, patientName: 'Sinov', items: [{ name: 'Paratsetamol 500 mg', mealTiming: 'nonsense' }] });
    ok('allergiyasiz dori to\'siqsiz', clean.status === 200, `status ${clean.status}`);
    ok('noto\'g\'ri ovqat qiymati — saqlanmadi', clean.data?.items?.[0]?.mealTiming === null, String(clean.data?.items?.[0]?.mealTiming));
    ok('izoh bo\'sh', !clean.data?.notes, String(clean.data?.notes));

    console.log('\n═══ 2. DAVOLASH TO\'PLAMI ═════════════════════════════');
    const empty = await api('POST', '/treatment-templates', { name: 'Bo\'sh', items: [{ kind: 'nimadir' }] });
    ok('bo\'sh to\'plam — 400', empty.status === 400, `status ${empty.status}`);

    const created = await api('POST', '/treatment-templates', {
        name: `O'RVI sinov ${tag}`, icdCodes: ['J06'],
        items: [
            { kind: 'drug', name: 'Paratsetamol 500 mg', dosage: '1 tabletka', frequency: 'Kuniga 3 mahal', durationDays: 5, mealTiming: 'after', extra: 'x' },
            { kind: 'service', serviceId: 1 },
            { kind: 'lab', labTestId: 'abc' },
            { kind: 'hack', sql: 'drop' },
        ],
    });
    ok('to\'plam yaratildi', created.status === 200 && !!created.data?.id, `status ${created.status}`);
    ok('noma\'lum tur tashlandi (3 qator qoldi)', created.data?.items?.length === 3, String(created.data?.items?.length));
    ok('ortiqcha maydon tashlandi', created.data?.items?.[0]?.extra === undefined);
    ok('ega yaratgani — klinikaniki', created.data?.shared === true);

    const list = (await api('GET', '/treatment-templates')).data || [];
    ok('ro\'yxatda bor', list.some((x: any) => x.id === created.data?.id));
    await api('POST', `/treatment-templates/${created.data?.id}/use`);
    const after = ((await api('GET', '/treatment-templates')).data || []).find((x: any) => x.id === created.data?.id);
    ok('«ishlatildi» soni oshdi', after?.useCount === 1, String(after?.useCount));

    const del = await api('DELETE', `/treatment-templates/${created.data?.id}`);
    ok('o\'chirildi', del.status === 200, `status ${del.status}`);
    const gone = ((await api('GET', '/treatment-templates')).data || []).some((x: any) => x.id === created.data?.id);
    ok('o\'chirilgani ro\'yxatda yo\'q', !gone);

    console.log('\n═══ 3. RUXSAT ═════════════════════════════════════');
    const anon = await call('GET', '/treatment-templates');
    ok('kirmagan foydalanuvchiga yopiq', anon.status === 401 || anon.status === 403, `status ${anon.status}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
