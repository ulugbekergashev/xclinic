/* ─────────────────────────────────────────────────────────────────────────────
   OVOZ → MATN (AI yordamchi, 2026-11-27, dentalocal'dagi g'oya).

   Foydalanuvchi mikrofon tugmasini bosib savolini aytadi. Matn so'rov
   maydoniga tushadi — yuborishdan oldin o'qib, tuzatish mumkin (AI noto'g'ri
   eshitgan ismni ko'r-ko'rona bajarmasin).

   Provayder — klinikaning o'z kaliti (Sozlamalar → AI yordamchi):
     1. Gemini (ovozni to'g'ridan-to'g'ri tushunadi, o'zbekchani yaxshi biladi);
     2. Groq Whisper (zaxira).
   Ikkalasi ham bo'lmasa — 503: «ovoz uchun Gemini yoki Groq kaliti kerak».
   Ovoz faqat matnga aylantirish uchun yuboriladi, saqlanmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

import { getApiKey } from '../aiSettings';

/* 90 soniya opus ~ 0.5–1 MB — 2 MB yetarli (xotira himoyasi) */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 45_000;
const ALLOWED_MIME = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|m4a)(;.*)?$/;

export const speechConfigured = () => !!(getApiKey('gemini') || getApiKey('groq'));
export const audioMimeOk = (mime: string) => ALLOWED_MIME.test(String(mime || '').toLowerCase());

const withTimeout = async (url: string, init: RequestInit) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try { return await fetch(url, { ...init, signal: ctl.signal }); }
    finally { clearTimeout(timer); }
};

async function viaGemini(key: string, audio: Buffer, mime: string, lang: 'uz' | 'ru'): Promise<string> {
    const model = process.env.GEMINI_MODEL_CHAT || 'gemini-2.0-flash';
    const prompt = lang === 'ru'
        ? "Перепиши дословно, что сказано в аудио. Только текст, без пояснений."
        : "Audioda aytilgan gapni so'zma-so'z yozib ber (o'zbek lotin yozuvida, rus so'zlari bo'lsa — o'z holicha). Faqat matn, izohsiz.";
    /* Kalit URL da emas, sarlavhada — proksi/jurnallarga tushmasin */
    const r = await withTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime.split(';')[0], data: audio.toString('base64') } }] }],
            generationConfig: { temperature: 0 },
        }),
    });
    const data: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.error?.message || `Gemini ${r.status}`);
    return (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join(' ').trim();
}

async function viaGroq(key: string, audio: Buffer, mime: string, lang: 'uz' | 'ru'): Promise<string> {
    const form = new FormData();
    const ext = /ogg/.test(mime) ? 'ogg' : /mp4|m4a/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : /mpeg/.test(mime) ? 'mp3' : 'webm';
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime.split(';')[0] }), `savol.${ext}`);
    form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
    form.append('language', lang);
    form.append('response_format', 'json');
    const r = await withTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    const data: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.error?.message || `Groq ${r.status}`);
    return String(data?.text || '').trim();
}

/** Ovozni matnga. Birinchi provayder yiqilsa — ikkinchisi. */
export async function transcribe(audio: Buffer, mime: string, lang: 'uz' | 'ru'): Promise<string> {
    const errors: string[] = [];
    const gemini = getApiKey('gemini');
    if (gemini) {
        /* Bo'sh javob — ovozda gap yo'q; ikkinchi provayderga yubormaymiz
           (bemor ovozi ortiqcha uchinchi tomonga ketmasin) */
        try { return await viaGemini(gemini, audio, mime, lang); }
        catch (e: any) { errors.push(`Gemini: ${e?.message || e}`); }
    }
    const groq = getApiKey('groq');
    if (groq) {
        try { const t = await viaGroq(groq, audio, mime, lang); if (t) return t; }
        catch (e: any) { errors.push(`Groq: ${e?.message || e}`); }
    }
    if (errors.length) console.error('[AI/ovoz]', errors.join(' | '));
    return '';
}
