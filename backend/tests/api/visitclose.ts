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

    console.log('\n=== 5b. SABAB IZOHNI ALMASHTIRMAYDI ===');
    /* Ilgari bu yerda `notes: closeNote` turardi va u qabulning BUTUN
       izohini o'chirib yuborardi: shifokor yozgan matn yakunlash sababi
       bilan almashib ketardi. Endi QO'SHILADI. */
    const pn = (await call('POST', '/patients', {
        firstName: 'Izoh', lastName: `Saqlan${tag}`, gender: 'Male',
        phone: `+99894${tag}`, force: true,
    }, token)).data;
    const vn = await call('POST', '/visits', { patientId: pn?.id }, token);
    const idn = vn.data?.id;
    ok('izoh sinovi uchun qabul ochildi', !!idn, `status: ${vn.status}`);
    if (idn) {
        await call('PUT', `/visits/${idn}`, { notes: 'Bemor allergiyasi bor' }, token);
        const forcedN = await call('PUT', `/visits/${idn}`, {
            status: 'Completed', force: true, closeReason: 'Tashxissiz yopildi',
        }, token);
        const notes = String(forcedN.data?.notes || '');
        ok('eski izoh JOYIDA qoldi', notes.includes('allergiyasi'), notes.slice(0, 80));
        ok('yangi sabab ham yozildi', notes.includes('Tashxissiz'), notes.slice(0, 80));
    }

    console.log('\n=== 5c. QABULNI BEKOR QILISH ===');
    /* `Cancelled` holati kodning hamma filtrida bor edi, lekin uni
       qo'yadigan joy yo'q edi. Endi qo'yiladi va to'lanmagan qatorlar
       birga bekor qilinadi — aks holda ular kassaning «to'lanmagan»
       ro'yxatida abadiy qolardi. */
    const pc = (await call('POST', '/patients', {
        firstName: 'Bekor', lastName: `Qilish${tag}`, gender: 'Female',
        phone: `+99895${tag}`, force: true,
    }, token)).data;
    const vc = await call('POST', '/visits', { patientId: pc?.id }, token);
    const idc = vc.data?.id;
    ok('bekor qilish uchun qabul ochildi', !!idc, `status: ${vc.status}`);
    if (idc) {
        const ch = await call('POST', '/charges', {
            visitId: idc, patientId: pc.id, patientName: `${pc.lastName} ${pc.firstName}`,
            source: 'Other', name: "Bekor bo'ladigan xizmat", quantity: 1,
            unitPrice: 50000, total: 50000,
        }, token);
        ok("to'lanmagan qator qo'shildi", ch.status === 200, `status: ${ch.status}`);

        const cancelled = await call('PUT', `/visits/${idc}`, { status: 'Cancelled' }, token);
        ok('qabul bekor qilindi', cancelled.status === 200 && cancelled.data?.status === 'Cancelled',
            `status: ${cancelled.status}, ${cancelled.data?.status}`);

        const after = await call('GET', `/visits/${idc}/charges`, undefined, token);
        const live = (after.data?.charges || []).filter((c: any) => c.status !== 'Cancelled');
        ok("to'lanmagan qator ham bekor qilindi", live.length === 0, `qolgan: ${live.length}`);
        ok('qarz nolga tushdi', (after.data?.summary?.due || 0) === 0,
            String(after.data?.summary?.due));
    }

    console.log('\n=== 5d. TOLANGAN QABUL BEKOR QILINMAYDI ===');
    /* Pul o'tgan bo'lsa qaytarish kassaning ishi. Qabulni jimgina yopib
       pulni osmonda qoldirib bo'lmaydi. */
    const pp = (await call('POST', '/patients', {
        firstName: 'Tolangan', lastName: `Bekor${tag}`, gender: 'Male',
        phone: `+99896${tag}`, force: true,
    }, token)).data;
    const vp = await call('POST', '/visits', { patientId: pp?.id }, token);
    const idp = vp.data?.id;
    if (idp) {
        const chp = await call('POST', '/charges', {
            visitId: idp, patientId: pp.id, patientName: `${pp.lastName} ${pp.firstName}`,
            source: 'Other', name: "To'langan xizmat", quantity: 1,
            unitPrice: 30000, total: 30000,
        }, token);
        const chargeId = chp.data?.id;
        const paid = await call('POST', '/payments', {
            patientId: pp.id, chargeIds: [chargeId], received: 30000, method: 'Cash',
        }, token);
        ok("to'lov o'tdi", paid.status === 200,
            `status: ${paid.status}, ${JSON.stringify(paid.data).slice(0, 140)}`);

        if (paid.status === 200) {
            const refused = await call('PUT', `/visits/${idp}`, { status: 'Cancelled' }, token);
            ok("to'langan qabulni bekor qilish RAD ETILDI", refused.status === 409,
                `status: ${refused.status}`);
            ok('sabab VISIT_HAS_PAYMENT', refused.data?.code === 'VISIT_HAS_PAYMENT',
                String(refused.data?.code));
        }
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

    await lockedVisit(token, tag);

    finish();
}

/* QULFLANGAN QABUL VA REGISTRATOR CHEGARASI.

   Topilgan holat: `POST /visits/:id/lock` faqat `lockedAt` yozardi, uni
   hech kim tekshirmasdi — imzolangan bayon, tashxis va xizmatlar ro'yxati
   jimgina qayta yozilardi. Registrator esa navbat bilan birga tashxisni
   ham o'zgartira olardi. */
async function lockedVisit(token: string, tag: string) {
    console.log('\n═══ 7. REGISTRATOR — FAQAT NAVBAT ══════════════════');
    const rec = await call('POST', '/receptionists', {
        firstName: 'Navbat', lastName: `Registrator${tag}`, phone: `+99899${tag}`,
        username: `lockrec${tag}`, password: 'testpass123',
    }, token);
    ok('registrator yaratildi', !!rec.data?.id, `status: ${rec.status}, ${JSON.stringify(rec.data).slice(0, 120)}`);
    const recToken = (await call('POST', '/auth/login', { username: `lockrec${tag}`, password: 'testpass123' })).data?.token;
    ok('registrator kirdi', !!recToken);

    const p = (await call('POST', '/patients', {
        firstName: 'Qulf', lastName: `Sinov${tag}`, gender: 'Male', phone: `+99888${tag}`, force: true,
    }, token)).data;
    const v = await call('POST', '/visits', { patientId: p?.id, force: true }, token);
    const id = v.data?.id;
    ok('qulf sinovi uchun qabul ochildi', !!id, `status: ${v.status}`);
    if (!id) return;

    if (recToken) {
        const q = await call('PUT', `/visits/${id}`, { status: 'Called' }, recToken);
        ok('registrator navbat holatini o\'zgartira oladi', q.status === 200, `status: ${q.status}`);
        const dx = await call('PUT', `/visits/${id}`, { diagnosis: 'Registrator tashxisi' }, recToken);
        ok('registrator tashxis YOZA OLMAYDI (403)', dx.status === 403, `status: ${dx.status}`);
        ok('sabab CLINICAL_FIELDS_DENIED', dx.data?.code === 'CLINICAL_FIELDS_DENIED', String(dx.data?.code));
    }

    await call('PUT', `/visits/${id}`, { notes: 'Imzolangan bayon', diagnosis: 'Asl tashxis' }, token);
    const procBefore = await call('POST', `/visits/${id}/procedures`, { procedureName: 'Qulfdan oldingi xizmat', price: 0 }, token);
    ok("qulfdan oldin xizmat qo'shildi", procBefore.status === 200, `status: ${procBefore.status}`);

    console.log('\n═══ 8. QULFLANGAN QABUL O\'ZGARMAYDI ═════════════════');
    const lock = await call('POST', `/visits/${id}/lock`, {}, token);
    ok('qabul qulflandi', lock.status === 200, `status: ${lock.status}`);

    for (const [label, body] of [
        ['tashxis', { diagnosis: "O'zgartirilgan tashxis" }],
        ['bayon izohi', { notes: 'Qayta yozilgan' }],
        ["ko'rik bayoni", { examData: '{}' }],
        ['shifokor', { doctorName: 'Boshqa shifokor' }],
    ] as [string, any][]) {
        const r = await call('PUT', `/visits/${id}`, body, token);
        ok(`qulflangan qabulda ${label} RAD ETILDI (409)`, r.status === 409 && r.data?.code === 'VISIT_LOCKED',
            `status: ${r.status}, ${r.data?.code}`);
    }
    const after = (await call('GET', `/visits/${id}`, undefined, token)).data;
    ok('bayon va tashxis JOYIDA', after?.notes === 'Imzolangan bayon' && after?.diagnosis === 'Asl tashxis',
        `${after?.notes} / ${after?.diagnosis}`);

    /* `force` — qabulda tashxis yozuvi yo'q, yakunlash nazorati (VISIT_INCOMPLETE)
       bu sinovning mavzusi emas. Muhimi: holat qulf tufayli to'silmaydi. */
    const status = await call('PUT', `/visits/${id}`, { status: 'Completed', force: true }, token);
    ok('holat (navbat) o\'zgarishi qulf bilan to\'silmadi', status.status === 200,
        `status: ${status.status}, ${status.data?.code}`);

    const addProc = await call('POST', `/visits/${id}/procedures`, { procedureName: 'Qulfdan keyingi xizmat', price: 10000 }, token);
    ok("qulflangan qabulga xizmat QO'SHILMADI (409)", addProc.status === 409, `status: ${addProc.status}`);
    if (procBefore.data?.id) {
        const delProc = await call('DELETE', `/visit-procedures/${procBefore.data.id}`, undefined, token);
        ok("qulflangan qabuldan xizmat O'CHIRILMADI (409)", delProc.status === 409, `status: ${delProc.status}`);
    }
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
