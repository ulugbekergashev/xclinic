// ─── AI qatlami (0-bosqich) ───────────────────────────────────────────────────
// Tizimdagi BARCHA AI so'rovlari shu fayldan o'tadi. Model, kalit, fallback va
// hisob-kitob mantiqi faqat shu yerda turadi — route'lar provayder haqida hech
// narsa bilmaydi.
//
// Barcha qo'llab-quvvatlanadigan provayderlar OpenAI-compatible `chat/completions`
// formatida ishlaydi, shuning uchun provayder almashish = .env dagi bitta qiymat.
// Kelajakda pullik tier'ga o'tish ham shu yerda, bitta qatorda hal bo'ladi.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface ChatMessage {
    role: ChatRole;
    content: string | null;
    /** Assistant tool chaqirganda to'ladi. */
    tool_calls?: any[];
    /** role === 'tool' bo'lganda majburiy. */
    tool_call_id?: string;
}

export interface ChatOptions {
    /** Ish turi: qaysi model ishlatilishini belgilaydi. */
    task?: 'chat' | 'cheap';
    maxTokens?: number;
    /** Kuzatuv uchun: qaysi endpoint chaqirdi. */
    label?: string;
}

interface ProviderConfig {
    name: string;
    baseUrl: string;
    apiKey?: string;
    /** task -> model nomi */
    models: { chat: string; cheap: string };
}

// ─── Provayder ro'yxati ──────────────────────────────────────────────────────
// Kalit berilmagan provayder avtomatik o'tkazib yuboriladi, ya'ni faqat
// mavjud kalitlar bilan ishlaydi. Tartib = fallback tartibi.
//
// DIQQAT: bu funksiya, konstanta emas. Sabab: konstanta bo'lganda process.env
// modul yuklangan PAYTDA o'qiladi. Agar aiService .env yuklanishidan oldin
// require qilinsa, kalitlar abadiy undefined bo'lib qolardi va AI jimgina
// "sozlanmagan" holatda ishlardi. Har chaqiruvda o'qish bu bog'liqlikni
// butunlay yo'q qiladi.
const providers = (): ProviderConfig[] => [
    {
        name: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: process.env.GEMINI_API_KEY,
        models: {
            chat: process.env.GEMINI_MODEL_CHAT || 'gemini-2.0-flash',
            cheap: process.env.GEMINI_MODEL_CHEAP || 'gemini-2.0-flash-lite',
        },
    },
    {
        name: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY,
        // gpt-oss-120b o'zbek tilida ham, klinik aniqlikda ham llama-3.3-70b dan
        // sezilarli ustun chiqdi (35-tishni to'g'ri aniqladi, differensial tashxis berdi).
        // Tezligi ham bir xil (~1.6s). qwen3.6-27b ni ishlatmang — u ichki
        // fikrlashini ingliz tilida javobga chiqarib yuboradi.
        models: {
            chat: process.env.GROQ_MODEL_CHAT || 'openai/gpt-oss-120b',
            cheap: process.env.GROQ_MODEL_CHEAP || 'llama-3.1-8b-instant',
        },
    },
    {
        name: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        models: {
            chat: process.env.OPENROUTER_MODEL_CHAT || 'meta-llama/llama-3.3-70b-instruct:free',
            cheap: process.env.OPENROUTER_MODEL_CHEAP || 'meta-llama/llama-3.1-8b-instruct:free',
        },
    },
];

/**
 * Ishlatiladigan provayderlar zanjiri.
 * AI_PROVIDER berilgan bo'lsa — o'sha birinchi bo'ladi, qolganlari zaxira.
 */
const providerChain = (): ProviderConfig[] => {
    const available = providers().filter(p => !!p.apiKey);
    const preferred = process.env.AI_PROVIDER;
    if (!preferred) return available;
    const first = available.filter(p => p.name === preferred);
    const rest = available.filter(p => p.name !== preferred);
    return [...first, ...rest];
};

export const isAiConfigured = (): boolean => providerChain().length > 0;

/** Sozlangan provayder nomlari — diagnostika uchun (kalitlar oshkor qilinmaydi). */
export const aiStatus = () => ({
    configured: isAiConfigured(),
    providers: providerChain().map(p => ({ name: p.name, models: p.models })),
});

// Fallback qilishga arziydigan xatolar: limit, vaqtinchalik nosozlik, tarmoq.
// 400/401/403 — bu bizning xatomiz, boshqa provayderda ham takrorlanadi.
const isRetryable = (status: number) => status === 429 || status === 408 || status >= 500;

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60_000);

/**
 * Ba'zi "reasoning" modellar (masalan qwen3.x) ichki fikrlashini <think> blokida
 * javob matniga qo'shib yuboradi — ko'pincha ingliz tilida. Foydalanuvchi buni
 * ko'rmasligi kerak, shuning uchun har qanday model uchun tozalab o'tamiz.
 */
const stripReasoning = (text: string): string =>
    text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        // Yopilmagan blok: model token chegarasiga urilgan bo'lsa shunday bo'ladi.
        .replace(/<think>[\s\S]*$/i, '')
        .trim();

/**
 * Markdown belgilarini olib tashlaydi.
 *
 * UI javobni oddiy matn sifatida chizadi (whitespace-pre-wrap), markdown
 * parse qilinmaydi — ya'ni `**Qarzlar**` foydalanuvchiga yulduzchalari bilan
 * ko'rinadi. Prompt buni taqiqlaydi, lekin prompt ehtimoliy: model ba'zan
 * baribir ishlatadi. Shuning uchun serverda kafolatlab tozalanadi.
 */
const stripMarkdown = (text: string): string =>
    text
        .replace(/\*\*(.+?)\*\*/g, '$1')      // **qalin**
        .replace(/(^|\s)\*(\S[^*]*?)\*/g, '$1$2')  // *kursiv* (ko'paytirishga tegmaydi)
        .replace(/^#{1,6}\s+/gm, '')           // ## sarlavha
        .replace(/^\s*[-*]\s+/gm, '• ')        // ro'yxat belgisi -> nuqta
        .replace(/`([^`]+)`/g, '$1');          // `kod`

const cleanReply = (text: string): string => stripMarkdown(stripReasoning(text)).trim();

interface ProviderError extends Error {
    status?: number;
    provider?: string;
    /** 429 javobidagi `retry-after` (soniya). */
    retryAfter?: number;
}

/** Zanjir to'liq 429 bergandan keyin necha marta qayta urinish. */
const AI_RETRY_MAX = Number(process.env.AI_RETRY_MAX || 2);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * 429 javobidan kutish vaqtini oladi. Groq `retry-after` sarlavhasini beradi,
 * ba'zi provayderlar esa faqat xabar matnida ko'rsatadi.
 */
const parseRetryAfter = (res: Response, body: string): number | undefined => {
    const header = res.headers.get('retry-after');
    if (header) {
        const n = Number(header);
        if (Number.isFinite(n) && n > 0) return Math.min(n, 120);
    }
    // "Please try again in 8.5s" ko'rinishidagi matndan.
    const m = body.match(/try again in ([\d.]+)s/i);
    if (m) {
        const n = Math.ceil(Number(m[1]));
        if (Number.isFinite(n) && n > 0) return Math.min(n, 120);
    }
    return undefined;
};

/** Bitta provayderga so'rov. Xatolikda ProviderError tashlaydi. */
const callProvider = async (
    p: ProviderConfig,
    messages: ChatMessage[],
    opts: ChatOptions
): Promise<string> => {
    const model = p.models[opts.task === 'cheap' ? 'cheap' : 'chat'];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${p.apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: opts.maxTokens ?? 1024,
            }),
            signal: controller.signal,
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const err: ProviderError = new Error(
                `${p.name} ${res.status}: ${body.slice(0, 300)}`
            );
            err.status = res.status;
            err.provider = p.name;
            err.retryAfter = parseRetryAfter(res, body);
            throw err;
        }

        const data: any = await res.json();
        const raw = data?.choices?.[0]?.message?.content;
        const text = typeof raw === 'string' ? cleanReply(raw) : raw;
        if (!text) {
            const err: ProviderError = new Error(`${p.name}: bo'sh javob qaytdi`);
            err.status = 502;
            err.provider = p.name;
            throw err;
        }

        const usage = data?.usage;
        console.log(
            `[AI] ${opts.label || 'chat'} · ${p.name}/${model} · ` +
            `in=${usage?.prompt_tokens ?? '?'} out=${usage?.completion_tokens ?? '?'}`
        );

        return text.trim();
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            const err: ProviderError = new Error(`${p.name}: vaqt tugadi (${AI_TIMEOUT_MS}ms)`);
            err.status = 408;
            err.provider = p.name;
            throw err;
        }
        if (e?.status) throw e;
        // Tarmoq xatosi — fallback qilishga arziydi.
        const err: ProviderError = new Error(`${p.name}: ${e?.message || 'tarmoq xatosi'}`);
        err.status = 503;
        err.provider = p.name;
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

/**
 * AI dan javob oladi. Birinchi provayder limitga urilsa yoki tushib qolsa —
 * avtomatik keyingisiga o'tadi.
 *
 * @throws Barcha provayderlar ishlamasa yoki hech biri sozlanmagan bo'lsa.
 */
export const chat = async (
    messages: ChatMessage[],
    opts: ChatOptions = {}
): Promise<string> => {
    const chain = providerChain();
    if (chain.length === 0) {
        throw new Error(
            'AI sozlanmagan: GEMINI_API_KEY, GROQ_API_KEY yoki OPENROUTER_API_KEY dan ' +
            'kamida bittasini .env ga qo\'shing.'
        );
    }

    const errors: string[] = [];
    for (let attempt = 0; attempt <= AI_RETRY_MAX; attempt++) {
        let waitFor: number | undefined;

        for (const p of chain) {
            try {
                return await callProvider(p, messages, opts);
            } catch (e: any) {
                errors.push(e.message);
                const status = e?.status ?? 500;
                if (!isRetryable(status)) {
                    // Konfiguratsiya xatosi — zanjirni davom ettirish ma'nosiz.
                    console.error(`[AI] ${p.name} qaytarib bo'lmaydigan xatolik:`, e.message);
                    throw e;
                }
                if (status === 429 && e.retryAfter) {
                    waitFor = Math.min(waitFor ?? Infinity, e.retryAfter);
                }
                console.warn(`[AI] ${p.name} ishlamadi (${status}), keyingi provayderga o'tilmoqda...`);
            }
        }

        // Butun zanjir limitga urildi. Zaxira provayder yo'q — kutamiz.
        if (attempt < AI_RETRY_MAX) {
            const sec = waitFor ?? Math.pow(2, attempt) * 3;
            console.warn(`[AI] Zanjir band. ${sec}s kutib qayta urinilmoqda (${attempt + 1}/${AI_RETRY_MAX})...`);
            await sleep(sec * 1000);
        }
    }

    throw new Error(`Barcha AI provayderlari ishlamadi. ${errors.slice(-3).join(' | ')}`);
};

// ─── Tool calling (2-bosqich) ────────────────────────────────────────────────

export interface ToolCallTrace {
    name: string;
    args: any;
}

/** Bitta provayderga tool'lar bilan so'rov — xom javob qaytaradi. */
const callProviderRaw = async (
    p: ProviderConfig,
    messages: ChatMessage[],
    tools: any[],
    opts: ChatOptions
): Promise<any> => {
    const model = p.models[opts.task === 'cheap' ? 'cheap' : 'chat'];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: opts.maxTokens ?? 1024,
                ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            const err: ProviderError = new Error(`${p.name} ${res.status}: ${body.slice(0, 300)}`);
            err.status = res.status;
            err.provider = p.name;
            err.retryAfter = parseRetryAfter(res, body);
            throw err;
        }
        return await res.json();
    } catch (e: any) {
        if (e?.status) throw e;
        const err: ProviderError = new Error(`${p.name}: ${e?.message || 'tarmoq xatosi'}`);
        err.status = e?.name === 'AbortError' ? 408 : 503;
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

/** Fallback zanjiri bilan bitta raund. */
const roundWithFallback = async (
    messages: ChatMessage[],
    tools: any[],
    opts: ChatOptions
): Promise<{ data: any; provider: ProviderConfig }> => {
    const chain = providerChain();
    if (chain.length === 0) throw new Error('AI sozlanmagan: hech qanday provayder kaliti yo\'q.');
    const errors: string[] = [];
    for (let attempt = 0; attempt <= AI_RETRY_MAX; attempt++) {
        let waitFor: number | undefined;

        for (const p of chain) {
            try {
                return { data: await callProviderRaw(p, messages, tools, opts), provider: p };
            } catch (e: any) {
                errors.push(e.message);
                if (!isRetryable(e?.status ?? 500)) throw e;
                if (e?.status === 429 && e.retryAfter) {
                    waitFor = Math.min(waitFor ?? Infinity, e.retryAfter);
                }
                console.warn(`[AI] ${p.name} ishlamadi (${e.status}), keyingisiga o'tilmoqda...`);
            }
        }

        if (attempt < AI_RETRY_MAX) {
            const sec = waitFor ?? Math.pow(2, attempt) * 3;
            console.warn(`[AI] Zanjir band. ${sec}s kutib qayta urinilmoqda (${attempt + 1}/${AI_RETRY_MAX})...`);
            await sleep(sec * 1000);
        }
    }
    throw new Error(`Barcha AI provayderlari ishlamadi. ${errors.slice(-3).join(' | ')}`);
};

/**
 * Tool'lar bilan suhbat. Model tool chaqirsa — `execute` orqali bajariladi va
 * natija modelga qaytariladi. Model javob yozgunicha yoki `maxRounds` ga
 * yetgunicha takrorlanadi.
 *
 * maxRounds — cheksiz tsikldan himoya: model bir xil tool'ni qayta-qayta
 * chaqiraversa, so'rov to'xtaydi va shu paytgacha yig'ilgan ma'lumot bilan
 * javob so'raladi.
 */
export const chatWithTools = async (
    messages: ChatMessage[],
    tools: any[],
    execute: (name: string, args: any) => Promise<any>,
    opts: ChatOptions & { maxRounds?: number } = {}
): Promise<{ reply: string; toolCalls: ToolCallTrace[] }> => {
    const maxRounds = opts.maxRounds ?? 5;
    const history: ChatMessage[] = [...messages];
    const trace: ToolCallTrace[] = [];

    for (let round = 0; round < maxRounds; round++) {
        // Oxirgi raundda tool bermaymiz — model matn bilan javob berishga majbur bo'ladi.
        const active = round === maxRounds - 1 ? [] : tools;
        const { data, provider } = await roundWithFallback(history, active, opts);

        const msg = data?.choices?.[0]?.message;
        const calls = msg?.tool_calls;

        if (!calls || calls.length === 0) {
            const raw = msg?.content;
            const reply = typeof raw === 'string' ? cleanReply(raw) : '';
            console.log(
                `[AI] ${opts.label || 'ask'} · ${provider.name} · raund=${round + 1} · ` +
                `tool=${trace.length} · in=${data?.usage?.prompt_tokens ?? '?'} out=${data?.usage?.completion_tokens ?? '?'}`
            );
            if (!reply) throw new Error('Model bo\'sh javob qaytardi.');
            return { reply, toolCalls: trace };
        }

        // Assistant'ning tool chaqiruvini tarixga qo'shamiz (protokol talabi).
        history.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls });

        for (const c of calls) {
            let args: any = {};
            try {
                args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
            } catch {
                args = {};
            }
            const name = c.function?.name;
            trace.push({ name, args });
            console.log(`[AI:tool] ${name}(${JSON.stringify(args).slice(0, 160)})`);

            const result = await execute(name, args);
            history.push({
                role: 'tool',
                tool_call_id: c.id,
                content: JSON.stringify(result).slice(0, 12_000),
            });
        }
    }

    throw new Error('Tool chaqiruvlari chegarasiga yetdi, javob shakllanmadi.');
};
