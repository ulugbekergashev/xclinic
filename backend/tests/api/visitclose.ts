/* S3.7 sinovi: QABULNI YAKUNLASHDA NAZORAT.

   ASOSIY SAVOL: bo'sh va to'lanmagan qabulni bir bosishda yopib bo'ladimi?

   Audit topgan holat (B-12, «Jiddiy»): «Qabulni yakunlash tashxissiz,
   ko'rsatkichlarsiz, bayonsiz, 105 000 so'm to'lanmagan va tahlil
   natijasi Kutilmoqda holatida — tasdiqlashsiz o'tadi».

   QOIDA: taqiq emas, TANLOV. Bemor qarzga qolishi mumkin, natija ertaga
   kelishi mumkin — bular haqiqiy holatlar. Lekin shifokor ularni BILIB
   yopishi kerak, bilmay emas.

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

const codes = (r: any) => (r.data?.reasons || []).map((x: any) => x.code);

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    /* O'Z bemorini yaratadi, mavjudini olmaydi: bazadagi bemorda ochiq
       qabul bo'lishi mumkin va server ikkinchisini ochmaydi (409,
       «qabul allaqachon ochilgan»). Sinov toza holatdan boshlashi kerak. */
    const tag = String(Date.now()).slice(-7);
    const created = await call('POST', '/patients', {
        firstName: 'Yakun', lastName: `Sinov${tag}`, gender: 'Male',
        phone: `+99890${tag}`, force: true,
    }, token);
    const p = created.data;
    ok('sinov bemori yaratildi', !!p?.id, `status: ${created.status}`);
    if (!p?.id) return finish();

    console.log('\n═══ 1. BO\'SH QABUL — TASHXISSIZ ═══════════════════');
    const v1 = await call('POST', '/visits', { patientId: p.id }, token);
    const id1 = v1.data?.id;
    ok('qabul ochildi', !!id1, `status: ${v1.status}`);
    if (!id1) return finish();

    const close1 = await call('PUT', `/visits/${id1}`, { status: 'Completed' }, token);
    ok('tashxissiz yakunlash RAD ETILDI', close1.status === 409, `status: ${close1.status}`);
    ok('sabab NO_DIAGNOSIS', codes(close1).includes('NO_DIAGNOSIS'), codes(close1).join(', '));

    console.log('\n═══ 2. TO\'LANMAGAN QATOR ══════════════════════════');
    const charge = await call('POST', '/charges', {
        visitId: id1, patientId: p.id, patientName: `${p.lastName} ${p.firstName}`,
        source: 'Other', name: 'Sinov xizmati', quantity: 1, unitPrice: 105000, total: 105000,
    }, token);
    ok('105 000 so\'mlik qator qo\'shildi', charge.status === 200, `status: ${charge.status}`);

    const close2 = await call('PUT', `/visits/${id1}`, { status: 'Completed' }, token);
    ok('to\'lanmagan qabul RAD ETILDI', close2.status === 409, `status: ${close2.status}`);
    ok('sabab UNPAID', codes(close2).includes('UNPAID'), codes(close2).join(', '));
    ok('summa xabarda ko\'rsatilgan',
        (close2.data?.reasons || []).some((r: any) => String(r.text).includes('105')),
        JSON.stringify(close2.data?.reasons || []).slice(0, 90));

    console.log('\n═══ 3. SABABLAR BIR VAQTDA KO\'RSATILADI ═══════════');
    /* Shifokor ularni bittalab topib chiqmasin — hammasi birdan. */
    ok('ikkala sabab ham bir javobda', codes(close2).length >= 2, codes(close2).join(', '));

    console.log('\n═══ 4. FORCE — SABAB BILAN YOPILADI ═══════════════');
    const forced = await call('PUT', `/visits/${id1}`, {
        status: 'Completed', force: true, closeReason: 'Bemor qarzga qoldi',
    }, token);
    ok('force bilan yakunlandi', forced.status === 200, `status: ${forced.status}`);
    ok('holat Completed', forced.data?.status === 'Completed', String(forced.data?.status));
    /* «Nega tashxissiz yopilgan?» degan savol keyin javobsiz qolmasin. */
    ok('sabab qabul izohiga YOZILDI',
        String(forced.data?.notes || '').includes('qarzga'), String(forced.data?.notes));

    console.log('\n═══ 5. TO\'LIQ QABUL TO\'SILMAYDI ══════════════════');
    const p2 = (await call('POST', '/patients', {
        firstName: 'Yakun', lastName: `Toliq${tag}`, gender: 'Female',
        phone: `+99891${tag}`, force: true,
    }, token)).data;
    const v2 = await call('POST', '/visits', { patientId: p2?.id }, token);
    const id2 = v2.data?.id;
    ok('ikkinchi qabul ochildi', !!id2);
    if (id2) {
        const icd = await call('GET', '/icd10?query=I10', undefined, token);
        const code = icd.data?.[0]?.code;
        ok('MKB-10 kodi topildi', !!code, String(code));
        if (code) {
            const dx = await call('POST', '/diagnoses', {
                patientId: p2.id, code, date: new Date().toISOString().slice(0, 10),
                status: 'Active', visitId: id2,
            }, token);
            ok('tashxis qo\'yildi', dx.status === 200, `status: ${dx.status}`);
        }
        const close3 = await call('PUT', `/visits/${id2}`, { status: 'Completed' }, token);
        ok('tashxisli va qarzsiz qabul BEMALOL yakunlandi',
            close3.status === 200, `status: ${close3.status}, ${JSON.stringify(close3.data?.reasons || '')}`);
    }

    console.log('\n═══ 6. BOSHQA HOLATLAR TO\'SILMAYDI ════════════════');
    /* Nazorat faqat YAKUNLASHDA. «Chaqirildi», «Qabulda» kabi holatlar
       hech qanday tekshiruvsiz o'tishi kerak — aks holda navbat qotadi. */
    const p3 = (await call('POST', '/patients', {
        firstName: 'Yakun', lastName: `Holat${tag}`, gender: 'Male',
        phone: `+99893${tag}`, force: true,
    }, token)).data;
    const v3 = await call('POST', '/visits', { patientId: p3?.id }, token);
    if (v3.data?.id) {
        const inprog = await call('PUT', `/visits/${v3.data.id}`, { status: 'In Progress' }, token);
        ok('«Qabulda» holatiga o\'tish to\'silmadi', inprog.status === 200, `status: ${inprog.status}`);
    }

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
