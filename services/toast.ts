/* ─────────────────────────────────────────────────────────────────────────────
   TOAST — har amalga ko'rinadigan javob (S3.3).

   MUAMMO. Kod bazasida 88 ta `alert()` bor edi. `alert` brauzerning
   BLOKLOVCHI oynasi: u chiqqanda butun interfeys javob bermay qoladi,
   uni stillash mumkin emas, va u ko'pincha texnik matn ko'rsatardi —
   «.env faylida FACEBOOK_APP_ID ni kiriting» (audit B-06). Registrator
   `.env` nima ekanini bilmaydi.

   Toast mexanizmi (`App.tsx` dagi `addToast`) allaqachon yozilgan va
   ishlayotgan edi — shunchaki ishlatilmasdi, chunki uni har komponentga
   prop bilan uzatish kerak edi va chuqurdagi fayllarga u yetib bormasdi.

   YECHIM. Modul darajasidagi bitta nuqta: `App` o'zining `addToast` ini
   shu yerga ULAYDI, qolgan hamma fayl esa `toast.error(...)` deb
   chaqiradi — prop uzatish shart emas.

   NIMA UCHUN CONTEXT EMAS. Toast xabari ko'pincha React daraxtidan
   TASHQARIDA tug'iladi: `catch` blokida, `api.ts` ichida, hodisa
   ishlovchisida. Context faqat komponent ichida ishlaydi, bu esa
   hamma joyda.
   ───────────────────────────────────────────────────────────────────────── */

export type ToastType = 'success' | 'error' | 'info';

type Sink = (type: ToastType, message: string) => void;

/* Ulanmagunicha xabarlar shu yerda kutadi. Ilova ishga tushayotganda
   xato bo'lsa, u yo'qolib ketmasin. */
let sink: Sink | null = null;
const pending: { type: ToastType; message: string }[] = [];

/** `App` ishga tushganda o'zining `addToast` ini shu yerga ulaydi. */
export function connectToast(fn: Sink) {
    sink = fn;
    while (pending.length) {
        const t = pending.shift()!;
        try { fn(t.type, t.message); } catch { /* ko'rsatib bo'lmasa ham ish davom etadi */ }
    }
}

export function disconnectToast() {
    sink = null;
}

function emit(type: ToastType, message: string) {
    const text = String(message || '').trim();
    if (!text) return;
    if (sink) {
        try { sink(type, text); return; } catch { /* pastga tushadi */ }
    }
    if (pending.length < 20) pending.push({ type, message: text });
}

export const toast = {
    success: (message: string) => emit('success', message),
    error: (message: string) => emit('error', message),
    info: (message: string) => emit('info', message),
};

/* ─── Xato matnini foydalanuvchi tiliga o'girish ─────────────────────────────

   Audit B-06: «.env faylida FACEBOOK_APP_ID ni kiriting» — bu dasturchi
   uchun yozilgan matn, registrator uchun emas. Server matnlari sekin-asta
   tuzatiladi, lekin eskilari hali kelib turadi; shuning uchun eng
   ko'p uchraydiganlari shu yerda tarjima qilinadi.

   Ro'yxatda topilmagan matn O'ZGARISHSIZ o'tadi: tanimagan xatoni
   «Xatolik yuz berdi» ga almashtirish sababni yo'qotadi. */
const FRIENDLY: { match: RegExp; text: string }[] = [
    {
        match: /FACEBOOK_APP_ID|facebook.*\.env|\.env.*facebook/i,
        text: 'Facebook integratsiyasi hali sozlanmagan — Sozlamalar → Lid integratsiyasi',
    },
    {
        match: /API kalit|API key.*not (set|configured)|\.env.*API/i,
        text: 'AI yordamchi sozlanmagan — Sozlamalar → Integratsiyalar',
    },
    { match: /Bot not configured/i, text: 'Telegram bot sozlanmagan — Sozlamalar → SMS va Telegram' },
    { match: /Patient telegram not linked/i, text: 'Bemor Telegram botga ulanmagan' },
    { match: /Failed to fetch|NetworkError|ERR_NETWORK/i, text: 'Serverga ulanib bo\'lmadi. Internet yoki server holatini tekshiring' },
    { match: /^Session expired$/i, text: 'Sessiya tugadi — qaytadan kiring' },
];

/** Server yoki tarmoq xatosini o'qiladigan matnga aylantiradi. */
export function friendlyError(err: any, fallback = 'Amalni bajarib bo\'lmadi'): string {
    const raw = String(err?.data?.error || err?.message || err || '').trim();
    if (!raw) return fallback;
    for (const f of FRIENDLY) if (f.match.test(raw)) return f.text;
    return raw;
}

/** `catch` blokida eng ko'p ishlatiladigan shakl. */
export const toastError = (err: any, fallback?: string) => toast.error(friendlyError(err, fallback));
