/* S2.4 sinovi: SHIFOKOR ↔ XIZMAT va VAQT TO'QNASHUVI.

   ASOSIY SAVOL: band vaqtga yozib bo'ladimi, va kardiologga ginekologiya
   xizmatini biriktirib bo'ladimi?

   Audit topgan holat (B-19): kardiolog Bahodir Ergashevga «Ginekolog
   konsultatsiyasi» ni ALLAQACHON BAND bo'lgan 08:30 ga yozishga urinish
   hech qanday ogohlantirish bermasdi.

   Frontda tekshiruv bor edi, lekin ikki sababdan ishlamasdi:
     1. `appt.time === formData.time` — faqat AYNAN bir xil boshlanish
        vaqti. 08:30 dagi 60 daqiqalik qabul ustiga 09:00 yozilaverardi.
     2. Brauzerdagi ro'yxat to'liq emas — u yuklangan oynani ko'radi.

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

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    const doctors = await call('GET', '/doctors', undefined, token);
    const withDept = (doctors.data || []).find((d: any) => d.departmentId);
    ok("bo'limi ko'rsatilgan shifokor topildi", !!withDept, String(withDept?.firstName));

    console.log("\n═══ 1. XIZMAT SHIFOKOR BO'LIMIGA BOG'LANDI ════════");
    const allSvc = await call('GET', '/services?clinicId=x', undefined, token);
    ok('xizmatlar royxati keldi', Array.isArray(allSvc.data) && allSvc.data.length > 0,
        `${(allSvc.data || []).length} ta`);

    if (withDept) {
        const docSvc = await call('GET', `/services?clinicId=x&doctorId=${withDept.id}`, undefined, token);
        ok("shifokor bo'yicha filtr javob berdi", Array.isArray(docSvc.data),
            `${(docSvc.data || []).length} ta`);
        ok('filtrlangan royxat umumiydan katta emas',
            (docSvc.data || []).length <= (allSvc.data || []).length,
            `${(docSvc.data || []).length} / ${(allSvc.data || []).length}`);
        /* Har bir qaytgan xizmat shifokor bo'limiga tegishli yoki
           bo'limsiz (umumiy) bo'lishi kerak. */
        const wrong = (docSvc.data || []).filter(
            (sv: any) => sv.departmentId && sv.departmentId !== withDept.departmentId);
        ok("begona bo'lim xizmati qaytmadi", wrong.length === 0,
            wrong.map((x: any) => x.name).slice(0, 3).join(', '));
    }

    console.log("\n═══ 2. VAQT TO'QNASHUVI ═══════════════════════════");
    const patients = await call('GET', '/patients', undefined, token);
    const p1 = (patients.data || [])[0];
    const p2 = (patients.data || [])[1];
    ok('ikkita bemor topildi', !!p1 && !!p2);
    if (!p1 || !p2 || !withDept) return finish();

    // Kelajakdagi bo'sh kun — mavjud yozuvlarga tegmaslik uchun
    const d = new Date(); d.setDate(d.getDate() + 90);
    const date = d.toISOString().slice(0, 10);

    const first = await call('POST', '/appointments', {
        patientId: p1.id, patientName: `${p1.lastName} ${p1.firstName}`,
        doctorId: withDept.id, doctorName: 'Dr', type: 'Konsultatsiya',
        date, time: '08:30', duration: 60, status: 'Pending',
    }, token);
    ok('birinchi qabul 08:30–09:30 yaratildi', first.status === 200, `status: ${first.status}`);

    /* MANA SHU auditdagi holat: 09:00 — boshlanish vaqti BOSHQA, lekin
       oraliq kesishadi. Eski tekshiruv buni o'tkazib yuborardi. */
    const overlap = await call('POST', '/appointments', {
        patientId: p2.id, patientName: `${p2.lastName} ${p2.firstName}`,
        doctorId: withDept.id, doctorName: 'Dr', type: 'Konsultatsiya',
        date, time: '09:00', duration: 30, status: 'Pending',
    }, token);
    ok('09:00 (08:30–09:30 ustiga) RAD ETILDI', overlap.status === 409, `status: ${overlap.status}`);
    ok('xato kodi DOCTOR_BUSY', overlap.data?.code === 'DOCTOR_BUSY', String(overlap.data?.code));
    ok('javobda band qabul korsatilgan', overlap.data?.conflict?.time === '08:30',
        String(overlap.data?.conflict?.time));

    console.log("\n═══ 3. BO'SH VAQT O'TADI ══════════════════════════");
    const free = await call('POST', '/appointments', {
        patientId: p2.id, patientName: `${p2.lastName} ${p2.firstName}`,
        doctorId: withDept.id, doctorName: 'Dr', type: 'Konsultatsiya',
        date, time: '09:30', duration: 30, status: 'Pending',
    }, token);
    ok('09:30 (birinchisi tugagach) otdi', free.status === 200, `status: ${free.status}`);

    console.log('\n═══ 4. FORCE — TAQIQ EMAS, TANLOV ═════════════════');
    /* Server TO'SMAYDI, TANLOV beradi — loyihadagi mavjud naqsh
       (bemor dublikatida ham shunday). Shoshilinch holat bo'lishi mumkin. */
    const forced = await call('POST', '/appointments', {
        patientId: p2.id, patientName: `${p2.lastName} ${p2.firstName}`,
        doctorId: withDept.id, doctorName: 'Dr', type: 'Shoshilinch',
        date, time: '09:00', duration: 30, status: 'Pending', force: true,
    }, token);
    ok('force bilan baribir yozildi', forced.status === 200, `status: ${forced.status}`);

    console.log("\n═══ 5. KO'CHIRISHDA HAM TEKSHIRILADI ══════════════");
    const moved = await call('PUT', `/appointments/${free.data?.id}`, { time: '08:45' }, token);
    ok("band vaqtga KO'CHIRISH rad etildi", moved.status === 409, `status: ${moved.status}`);

    console.log('\n═══ 6. BOSHQA SHIFOKORGA XALAL BERMAYDI ═══════════');
    const other = (doctors.data || []).find((x: any) => x.id !== withDept.id);
    if (other) {
        const otherOk = await call('POST', '/appointments', {
            patientId: p1.id, patientName: `${p1.lastName} ${p1.firstName}`,
            doctorId: other.id, doctorName: 'Dr2', type: 'Konsultatsiya',
            date, time: '08:30', duration: 60, status: 'Pending',
        }, token);
        ok("boshqa shifokorda 08:30 bo'sh", otherOk.status === 200, `status: ${otherOk.status}`);
    } else {
        ok('ikkinchi shifokor topildi', false, 'bazada bitta shifokor');
    }

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
