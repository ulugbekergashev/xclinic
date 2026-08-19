// ─── Etalon to'plamni ishga tushiruvchi ──────────────────────────────────────
//
//   npx ts-node ai/evals/run.ts                    # hammasi (50 savol)
//   npx ts-node ai/evals/run.ts --category moliya  # bitta toifa
//   npx ts-node ai/evals/run.ts --id 9,17,40       # tanlangan savollar
//   npx ts-node ai/evals/run.ts --limit 10         # birinchi N ta
//   npx ts-node ai/evals/run.ts --verbose          # to'liq javoblarni ko'rsat
//
// Baza CHAQIRILMAYDI — fikstura ishlatiladi. AI provayder kaliti kerak.

require('dotenv').config();

const ai = require('../../aiService');
const tools = require('../tools');
import { QUESTIONS, EvalQuestion } from './questions';
import { EVAL_TODAY, fixtureExecutor } from './fixtures';

// ─── Argumentlar ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
};
const VERBOSE = argv.includes('--verbose');

// ─── Sur'at ──────────────────────────────────────────────────────────────────
// Groq bepul tier: daqiqasiga 8 000 token (x-ratelimit-limit-tokens).
// Bitta savol ~3 500–4 000 token yeydi (system prompt + 7 tool ta'rifi, ikki
// raund), ya'ni daqiqasiga atigi ~2 ta savol sig'adi.
//
// Tanaffusni qisqartirmang. 2.5s bilan sinab ko'rilgan edi: retry bo'roni
// boshlanadi — har bir qayta urinish to'liq promptni qaytadan yuboradi va
// byudjetni yanada tez yeydi. Bitta savol 450 soniya oldi va natijalar
// sifatni emas, limitni o'lchab qoldi.
//
// Pullik tier'ga o'tganda yoki limiti kengroq provayderda buni tushirsa bo'ladi.
const EVAL_DELAY_MS = Number(process.env.EVAL_DELAY_MS || 30_000);

let selected = QUESTIONS;
const cat = flag('category');
if (cat) selected = selected.filter(q => q.category === cat);
const ids = flag('id');
if (ids) {
    const set = new Set(ids.split(',').map(s => Number(s.trim())));
    selected = selected.filter(q => set.has(q.id));
}
const limit = flag('limit');
if (limit) selected = selected.slice(0, Number(limit));

// ─── Solishtirish yordamchilari ──────────────────────────────────────────────

/**
 * Raqamni ajratgichdan qat'i nazar topadi: 42350000 ni "42 350 000",
 * "42,350,000" va "42.350.000" ko'rinishlarida ham tan oladi.
 */
const containsNumber = (text: string, n: number): boolean => {
    const digits = String(n);
    const pattern = digits.split('').join('[\\s.,\\u00A0\']?');
    return new RegExp(pattern).test(text);
};

const containsValue = (text: string, v: string | number): boolean =>
    typeof v === 'number'
        ? containsNumber(text, v)
        : text.toLowerCase().includes(String(v).toLowerCase());

// Prompt endpoint bilan BIR XIL manbadan olinadi — nusxa ko'chirilmaydi.
// Aks holda prompt endpointda o'zgarganda test eski matnni sinab, mavjud
// bo'lmagan xatti-harakatni "to'g'ri" deb ko'rsataverardi.
const { askSystemPrompt } = require('../prompts');

interface Result {
    q: EvalQuestion;
    ok: boolean;
    toolOk: boolean;
    argsOk: boolean;
    contentOk: boolean;
    reply: string;
    called: string[];
    sabab: string[];
    ms: number;
}

const runOne = async (q: EvalQuestion): Promise<Result> => {
    const t0 = Date.now();
    const calls: { name: string; args: any }[] = [];

    const exec = async (name: string, args: any) => {
        calls.push({ name, args });
        // Rol tekshiruvi haqiqiy runTool'dagidek — ruxsatsiz tool'ni bloklaymiz.
        const def = tools.TOOL_DEFS.find((d: any) => d.name === name);
        if (!def) return { xato: `Noma'lum tool: ${name}` };
        if (!def.roles.includes(q.role)) return { xato: 'Bu ma\'lumotga sizning rolingizda ruxsat yo\'q.' };
        return fixtureExecutor(name, args);
    };

    let reply = '';
    try {
        const r = await ai.chatWithTools(
            [{ role: 'system', content: askSystemPrompt(EVAL_TODAY) }, { role: 'user', content: q.q }],
            tools.toolsForRole(q.role),
            exec,
            { task: 'chat', maxTokens: 1200, maxRounds: 5, label: `eval:${q.id}` }
        );
        reply = r.reply;
    } catch (e: any) {
        reply = `[XATO] ${e.message}`;
    }

    const called = calls.map(c => c.name);
    const sabab: string[] = [];

    // 1. TOOL
    let toolOk: boolean;
    if (q.tool === null) {
        toolOk = calls.length === 0;
        if (!toolOk) sabab.push(`tool chaqirilmasligi kerak edi, chaqirildi: ${called.join(',')}`);
    } else if (q.tool === '*') {
        toolOk = true; // qaysi tool ishlatilgani muhim emas
    } else {
        const want = Array.isArray(q.tool) ? q.tool : [q.tool];
        toolOk = want.every(w => called.includes(w));
        if (!toolOk) sabab.push(`kutilgan tool: ${want.join(',')}; chaqirilgan: ${called.join(',') || 'hech narsa'}`);
    }

    // 1a. Keng savollar: model o'zi bir nechta manbadan ma'lumot yig'ishi kerak.
    if (q.minTools && calls.length < q.minTools) {
        toolOk = false;
        sabab.push(`kamida ${q.minTools} ta tool kutilgan, chaqirilgan: ${calls.length}`);
    }

    // 1b. TAQIQLANGAN TOOL — rol cheklovining asosiy tekshiruvi.
    for (const f of q.forbiddenTools || []) {
        if (called.includes(f)) {
            toolOk = false;
            sabab.push(`TAQIQLANGAN tool chaqirildi: ${f}`);
        }
    }

    // 2. ARGS
    let argsOk = true;
    if (q.args && q.tool && typeof q.tool === 'string') {
        const call = calls.find(c => c.name === q.tool);
        argsOk = !!call && q.args(call.args);
        if (!argsOk) sabab.push(`argument noto'g'ri: ${JSON.stringify(call?.args ?? null)}`);
    }

    // 3. JAVOB
    let contentOk = true;
    for (const v of q.mustInclude || []) {
        if (!containsValue(reply, v)) { contentOk = false; sabab.push(`javobda yo'q: ${v}`); }
    }
    for (const v of q.mustNotInclude || []) {
        if (containsValue(reply, v)) { contentOk = false; sabab.push(`javobda BO'LMASLIGI kerak edi: ${v}`); }
    }

    return { q, ok: toolOk && argsOk && contentOk, toolOk, argsOk, contentOk, reply, called, sabab, ms: Date.now() - t0 };
};

// ─── Ishga tushirish ─────────────────────────────────────────────────────────
(async () => {
    if (!ai.isAiConfigured()) {
        console.error('AI sozlanmagan — .env ga kalit qo\'shing.');
        process.exit(1);
    }
    const st = ai.aiStatus();
    console.log(`Provayder: ${st.providers.map((p: any) => p.name).join(' -> ')}`);
    console.log(`Model    : ${st.providers[0].models.chat}`);
    console.log(`Savollar : ${selected.length} ta\n`);

    // --repeat N: har bir savolni N marta takrorlaydi. Tool chaqirish
    // ehtimoliy jarayon — bitta ishga tushirish "o'tdi" degani har doim
    // o'tadi degani emas. Beqarorlikni ko'rish uchun shu bayroq kerak.
    const REPEAT = Math.max(1, Number(flag('repeat') || 1));
    const passCount = new Map<number, number>();

    const results: Result[] = [];
    for (const q of selected) {
        let r!: Result;
        let passes = 0;
        for (let i = 0; i < REPEAT; i++) {
            const attempt = await runOne(q);
            if (attempt.ok) passes++;
            // Xulosa uchun oxirgi natijani saqlaymiz; yiqilgani bo'lsa — o'shani.
            if (i === 0 || (!attempt.ok && r.ok)) r = attempt;
            if (i < REPEAT - 1) await new Promise(res => setTimeout(res, Number(process.env.EVAL_DELAY_MS || 2500)));
        }
        passCount.set(q.id, passes);
        results.push(r);

        const mark = REPEAT > 1
            ? (passes === REPEAT ? '✓' : passes === 0 ? '✗' : '~')
            : (r.ok ? '✓' : '✗');
        const suffix = REPEAT > 1 ? ` [${passes}/${REPEAT}]` : '';
        console.log(`${mark} #${String(q.id).padStart(2)} [${q.category}/${q.role.slice(0, 4)}] ${q.q.slice(0, 46)}${suffix}  (${r.ms}ms)`);
        if (!r.ok) r.sabab.forEach(s => console.log(`     └─ ${s}`));
        if (VERBOSE) console.log(`     javob: ${r.reply.replace(/\n/g, ' ').slice(0, 220)}\n`);
        await new Promise(res => setTimeout(res, EVAL_DELAY_MS));
    }

    // ─── Xulosa ──────────────────────────────────────────────────────────────
    const pass = results.filter(r => r.ok).length;
    const pct = (n: number, d: number) => d === 0 ? '—' : `${Math.round((n / d) * 100)}%`;

    console.log(`\n${'='.repeat(62)}`);
    console.log(`UMUMIY: ${pass}/${results.length}  (${pct(pass, results.length)})`);
    console.log('='.repeat(62));

    console.log('\nBosqich bo\'yicha:');
    console.log(`  tool tanlash : ${pct(results.filter(r => r.toolOk).length, results.length)}`);
    console.log(`  argumentlar  : ${pct(results.filter(r => r.argsOk).length, results.length)}`);
    console.log(`  javob mazmuni: ${pct(results.filter(r => r.contentOk).length, results.length)}`);

    console.log('\nToifa bo\'yicha:');
    const cats = [...new Set(results.map(r => r.q.category))];
    for (const c of cats) {
        const rs = results.filter(r => r.q.category === c);
        const p = rs.filter(r => r.ok).length;
        console.log(`  ${c.padEnd(14)} ${String(p).padStart(2)}/${rs.length}  ${pct(p, rs.length)}`);
    }

    if (REPEAT > 1) {
        const flaky = [...passCount.entries()].filter(([, p]) => p > 0 && p < REPEAT);
        const totalRuns = selected.length * REPEAT;
        const totalPass = [...passCount.values()].reduce((s, p) => s + p, 0);
        console.log(`\nBeqarorlik (${REPEAT} marta takror):`);
        console.log(`  jami urinish : ${totalPass}/${totalRuns}  ${pct(totalPass, totalRuns)}`);
        console.log(`  beqaror savol: ${flaky.length} ta${flaky.length ? ' — ' + flaky.map(([id, p]) => `#${id}(${p}/${REPEAT})`).join(', ') : ''}`);
    }

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
        console.log(`\nYiqilganlar: ${failed.map(r => '#' + r.q.id).join(', ')}`);
        console.log('Batafsil ko\'rish uchun: npx ts-node ai/evals/run.ts --id ' + failed.map(r => r.q.id).join(',') + ' --verbose');
    }

    process.exit(failed.length ? 1 : 0);
})();
