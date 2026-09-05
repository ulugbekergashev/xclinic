/* ─── AI kalitlari: sozlamalar oynasidan ──────────────────────────────────────
   Ilgari kalit FAQAT `.env` da turardi. Klinika uni o'zi qo'ya olmasdi:
   har o'zgarish uchun bizga murojaat qilish va yangi build kerak edi.
   Endi kalit bazada (`PlatformSetting`) yotadi va Sozlamalar > «AI yordamchi»
   bo'limidan kiritiladi.

   `.env` KUCHDA QOLADI. Tartib: BAZA → `.env`. Sabab: allaqachon .env bilan
   ishlab turgan o'rnatmalar yangilanishdan keyin ham hech narsa qilmasdan
   ishlayverishi kerak. Bazada kalit paydo bo'lsa — u .env dagini bosadi,
   chunki uni odam ataylab, oxirgi bo'lib kiritgan.

   KESH nima uchun kerak: `aiService.providers()` — SINXRON funksiya, Prisma
   esa async. Har AI so'rovida bazaga borish uchun provayder ro'yxatini async
   qilishga to'g'ri kelardi, u esa `chat`, `chatWithTools`, `providerChain` va
   ularni chaqiruvchi o'nlab route bo'ylab tarqalardi. Shuning uchun qiymat
   ikki joyda keshga o'qiladi: server ishga tushganda va har saqlashda.
   ───────────────────────────────────────────────────────────────────────── */
import { prisma } from './db';

export type AiProviderName = 'gemini' | 'groq' | 'openrouter';

export const AI_PROVIDERS: AiProviderName[] = ['gemini', 'groq', 'openrouter'];

/** Foydalanuvchiga ko'rinadigan nomlar va kalitni qayerdan olish haqida izoh. */
export const AI_PROVIDER_INFO: Record<AiProviderName, { label: string; hint: string; url: string }> = {
    gemini: {
        label: 'Google Gemini',
        hint: 'Google AI Studio da bepul kalit beriladi.',
        url: 'https://aistudio.google.com/apikey',
    },
    groq: {
        label: 'Groq',
        hint: 'Eng tez javob beradi, bepul limiti bor.',
        url: 'https://console.groq.com/keys',
    },
    openrouter: {
        label: 'OpenRouter',
        hint: 'Bitta kalit bilan ko\'p model. Bepul modellari ham bor.',
        url: 'https://openrouter.ai/keys',
    },
};

const KEY_PREFIX = 'ai.key.';
const PREFERRED_KEY = 'ai.provider';

/** .env dagi mos o'zgaruvchi nomi — zaxira sifatida o'qiladi. */
const ENV_NAME: Record<AiProviderName, string> = {
    gemini: 'GEMINI_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
};

interface Cache {
    keys: Partial<Record<AiProviderName, string>>;
    preferred?: AiProviderName;
    loaded: boolean;
}

const cache: Cache = { keys: {}, loaded: false };

const isProvider = (v: any): v is AiProviderName => AI_PROVIDERS.includes(v);

/**
 * Bazadagi kalitni keshga o'qiydi. Server ishga tushganda bir marta va
 * har saqlashdan keyin chaqiriladi.
 *
 * Xato bo'lsa YIQILMAYDI: AI — yordamchi funksiya, uning sozlamasi
 * o'qilmagani uchun butun server ishga tushmay qolishi mumkin emas.
 */
export const loadAiSettings = async (): Promise<void> => {
    try {
        const rows = await prisma.platformSetting.findMany({
            where: { key: { startsWith: 'ai.' } },
        });
        const keys: Partial<Record<AiProviderName, string>> = {};
        let preferred: AiProviderName | undefined;

        for (const row of rows) {
            const value = (row.value || '').trim();
            if (!value) continue;
            if (row.key === PREFERRED_KEY) {
                if (isProvider(value)) preferred = value;
                continue;
            }
            const name = row.key.slice(KEY_PREFIX.length);
            if (row.key.startsWith(KEY_PREFIX) && isProvider(name)) keys[name] = value;
        }

        cache.keys = keys;
        cache.preferred = preferred;
        cache.loaded = true;
    } catch (e: any) {
        console.error('[AI] sozlamalarni o\'qib bo\'lmadi:', e?.message || e);
    }
};

/** Kalit: avval baza, keyin .env. Ikkalasi ham bo'lmasa — undefined. */
export const getApiKey = (name: AiProviderName): string | undefined =>
    cache.keys[name] || process.env[ENV_NAME[name]] || undefined;

/** Afzal ko'rilgan provayder: avval baza, keyin .env dagi AI_PROVIDER. */
export const getPreferredProvider = (): string | undefined => {
    if (cache.preferred) return cache.preferred;
    const fromEnv = process.env.AI_PROVIDER;
    return fromEnv ? fromEnv : undefined;
};

/* Kalitni HECH QACHON to'liq qaytarmaymiz. Sozlamalar oynasi «kalit bormi
   va qaysi biri» degan savolga javob beradi, kalitning o'zini ko'rsatmaydi:
   ekranni suratga olish yoki yelka ustidan qarash bilan u ketib qolmasin. */
const mask = (value: string): string => {
    const tail = value.slice(-4);
    return `${'•'.repeat(8)}${tail}`;
};

/** Sozlamalar oynasi uchun holat. Kalitlar oshkor qilinmaydi. */
export const describeAiSettings = () => ({
    preferred: cache.preferred ?? null,
    providers: AI_PROVIDERS.map((name) => {
        const fromDb = cache.keys[name];
        const fromEnv = process.env[ENV_NAME[name]];
        const key = fromDb || fromEnv;
        return {
            name,
            label: AI_PROVIDER_INFO[name].label,
            hint: AI_PROVIDER_INFO[name].hint,
            url: AI_PROVIDER_INFO[name].url,
            configured: !!key,
            masked: key ? mask(key) : null,
            /* Qayerdan kelgani muhim: `.env` dagini sozlamalardan o'chirib
               bo'lmaydi va buni foydalanuvchiga aytish kerak — aks holda u
               «o'chirdim, lekin qolib ketdi» degan xulosaga keladi. */
            source: fromDb ? 'settings' : fromEnv ? 'env' : null,
            envName: ENV_NAME[name],
        };
    }),
});

export interface AiSettingsPatch {
    keys?: Partial<Record<AiProviderName, string>>;
    preferred?: string | null;
}

/**
 * Kalitlarni saqlaydi.
 *
 * Bo'sh satr = O'CHIRISH. Undefined = tegmaslik. Farqi muhim: oyna
 * o'zgarmagan maydonni umuman yubormaydi, tozalangan maydonni esa bo'sh
 * satr qilib yuboradi — aks holda kalitni olib tashlashning yo'li qolmasdi.
 */
export const saveAiSettings = async (patch: AiSettingsPatch): Promise<void> => {
    const now = new Date();

    for (const name of AI_PROVIDERS) {
        const value = patch.keys?.[name];
        if (value === undefined) continue;
        const trimmed = value.trim();
        const key = `${KEY_PREFIX}${name}`;
        if (!trimmed) {
            await prisma.platformSetting.deleteMany({ where: { key } });
        } else {
            await prisma.platformSetting.upsert({
                where: { key },
                update: { value: trimmed, updatedAt: now },
                create: { key, value: trimmed, updatedAt: now },
            });
        }
    }

    if (patch.preferred !== undefined) {
        if (!patch.preferred) {
            await prisma.platformSetting.deleteMany({ where: { key: PREFERRED_KEY } });
        } else if (isProvider(patch.preferred)) {
            await prisma.platformSetting.upsert({
                where: { key: PREFERRED_KEY },
                update: { value: patch.preferred, updatedAt: now },
                create: { key: PREFERRED_KEY, value: patch.preferred, updatedAt: now },
            });
        }
    }

    await loadAiSettings();
};
