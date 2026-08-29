/* S2.3 sinovi: KO'RIK SHABLONI — jins va yoshga bog'liqlik.

   ASOSIY SAVOL: erkak bemorda ginekologiya shabloni ochiladimi?

   Audit topgan holat (B-09, «Kritik»): erkak bemor kartasidagi «Ko'rik
   bayoni» tabida GINEKOLOGIK ANAMNEZ ochilardi — menarxe, sikl, oxirgi
   hayz sanasi, homiladorlik/tug'ruq soni, «Ko'zgu yordamida» va «Bimanual
   tekshiruv».

   Sabab tasodif emas, qonuniyat edi: bazadagi yettita shablonning HAMMASI
   `isDefault = 1`, ro'yxat esa `ORDER BY name ASC` bilan kelardi va
   alifboda «Ginekolog ko'rigi» birinchi turardi.

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

const isGyn = (t: any) => /inekolog/i.test(String(t?.name || ''));
const names = (list: any[]) => (list || []).map((t: any) => t.name).join(', ');

async function main() {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'testpass123' });
    const token = login.data?.token;
    ok('ega kirdi', !!token);
    if (!token) return finish();

    console.log('\n═══ 0. MIGRATSIYA QO\'LLANDIMI ═════════════════════');
    const all = await call('GET', '/encounter-templates', undefined, token);
    ok('shablonlar ro\'yxati keldi', Array.isArray(all.data) && all.data.length > 0,
        `${Array.isArray(all.data) ? all.data.length : 0} ta`);
    const gyn = (all.data || []).find(isGyn);
    ok('ginekologiya shabloni Female ga bog\'landi', gyn?.gender === 'Female', String(gyn?.gender));
    const ped = (all.data || []).find((t: any) => /ediatr/i.test(t.name));
    ok('pediatriya shabloniga yosh chegarasi qo\'yildi', ped?.maxAge === 14, String(ped?.maxAge));

    /* «Standart» BITTA bo'lishi kerak. Yettitasi ham standart bo'lgani
       uchun tanlov alifboga tushib qolgan edi. */
    const defaults = (all.data || []).filter((t: any) => t.isDefault);
    ok('standart shablon bitta', defaults.length === 1, `${defaults.length} ta: ${names(defaults)}`);
    ok('standart — terapevt ko\'rigi', /erapevt/i.test(String(defaults[0]?.name)), String(defaults[0]?.name));

    console.log('\n═══ 1. SINOV BEMORLARI ════════════════════════════');
    const yearsAgo = (n: number) => {
        const d = new Date(); d.setFullYear(d.getFullYear() - n);
        return d.toISOString().slice(0, 10);
    };
    const mk = async (gender: string, dob: string, tag: string) => {
        const r = await call('POST', '/patients', {
            firstName: 'Shablon', lastName: `Sinov${tag}`,
            gender, dob, phone: `+99890000${String(Date.now()).slice(-4)}`,
            status: 'Active',
        }, token);
        return r.data?.id;
    };
    const maleId = await mk('Male', yearsAgo(40), 'Erkak');
    const femaleId = await mk('Female', yearsAgo(30), 'Ayol');
    const childId = await mk('Male', yearsAgo(7), 'Bola');
    ok('erkak bemor yaratildi', !!maleId);
    ok('ayol bemor yaratildi', !!femaleId);
    ok('bola bemor yaratildi (7 yosh)', !!childId);
    if (!maleId || !femaleId || !childId) return finish();

    console.log('\n═══ 2. ERKAK BEMOR ════════════════════════════════');
    const male = await call('GET', `/encounter-templates?patientId=${maleId}`, undefined, token);
    ok('erkakda GINEKOLOGIYA shabloni YO\'Q', !(male.data || []).some(isGyn), names(male.data));
    ok('erkakda shablon baribir bor (bo\'sh qolmadi)',
        Array.isArray(male.data) && male.data.length > 0, `${(male.data || []).length} ta`);
    ok('erkakda pediatriya ham yo\'q (40 yosh)',
        !(male.data || []).some((t: any) => /ediatr/i.test(t.name)), names(male.data));

    console.log('\n═══ 3. AYOL BEMOR ═════════════════════════════════');
    const female = await call('GET', `/encounter-templates?patientId=${femaleId}`, undefined, token);
    ok('ayolda ginekologiya shabloni BOR', (female.data || []).some(isGyn), names(female.data));

    console.log('\n═══ 4. BOLA ═══════════════════════════════════════');
    const child = await call('GET', `/encounter-templates?patientId=${childId}`, undefined, token);
    ok('bolada pediatriya shabloni bor',
        (child.data || []).some((t: any) => /ediatr/i.test(t.name)), names(child.data));
    ok('bolada kattalar terapevti YO\'Q (minAge 15)',
        !(child.data || []).some((t: any) => /erapevt/i.test(t.name)), names(child.data));

    console.log('\n═══ 5. FILTRSIZ RO\'YXAT SAQLANDI ══════════════════');
    /* Sozlamalarda shablonlarni tahrirlashda HAMMASI ko'rinishi shart —
       filtr faqat `?patientId=` berilganda ishlaydi. */
    ok('filtrsiz so\'rovda hamma shablon qaytadi',
        (all.data || []).length > (male.data || []).length,
        `filtrsiz ${(all.data || []).length}, erkakda ${(male.data || []).length}`);

    finish();
}

function finish() {
    console.log(`\n  Natija: ${pass} o'tdi, ${fail} yiqildi\n`);
    if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
