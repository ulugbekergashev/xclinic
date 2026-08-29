/* ─────────────────────────────────────────────────────────────────────────────
   TASDIQLASH — o'chirish izsiz bo'lmasin (S3.6).

   MUAMMO. Audit B-05 «Kritik»: lid kartadagi bitta tugma bosilishi bilan
   yo'qolardi — tasdiq yo'q, qaytarish yo'q. Kod bazasida esa 20 ta
   `window.confirm()` bor edi: u brauzerning bloklovchi oynasi, uni
   stillash mumkin emas, matni ingliz tilidagi tugmalar bilan chiqadi va
   Electron'da boshqacha ko'rinadi.

   YECHIM — `toast.ts` bilan bir xil naqsh: modul darajasidagi bitta
   nuqta, `App` uni o'zining modaliga ulaydi. Chaqiruvchi uchun u oddiy
   `await`:

       if (await confirmAction({ title: '...', danger: true })) { ... }

   NIMA UCHUN PROMISE. `window.confirm` sinxron — shuning uchun uni
   almashtirish oson bo'lishi kerak edi. Promise chaqiruv joyining
   shaklini o'zgartirmaydi: `if (confirm(...))` → `if (await confirm(...))`.
   ───────────────────────────────────────────────────────────────────────── */

export interface ConfirmOptions {
    title: string;
    /** Qo'shimcha tushuntirish — nima yo'qolishini aniq aytadi. */
    body?: string;
    /** Tasdiqlash tugmasining matni. Standart: «Tasdiqlash». */
    confirmLabel?: string;
    cancelLabel?: string;
    /** Qaytarib bo'lmaydigan amal — tugma qizil bo'ladi. */
    danger?: boolean;
}

type Opener = (opts: ConfirmOptions) => Promise<boolean>;

let opener: Opener | null = null;

/** `App` ishga tushganda o'z modalini shu yerga ulaydi. */
export function connectConfirm(fn: Opener) {
    opener = fn;
}

export function disconnectConfirm() {
    opener = null;
}

/**
 * Tasdiq so'raydi. Modal ulanmagan bo'lsa — brauzerning o'zinikiga
 * qaytadi: tasdiqsiz o'chirish sodir bo'lgandan ko'ra xunuk oyna
 * yaxshiroq.
 */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
    if (opener) return opener(opts);
    const text = opts.body ? `${opts.title}\n\n${opts.body}` : opts.title;
    try {
        return Promise.resolve(window.confirm(text));
    } catch {
        return Promise.resolve(false);
    }
}

/** O'chirish uchun tayyor shakl — matn hamma joyda bir xil bo'lsin. */
export function confirmDelete(what: string, body?: string): Promise<boolean> {
    return confirmAction({
        title: `${what} o'chirilsinmi?`,
        body: body || "Bu amal qaytarib bo'lmaydi.",
        confirmLabel: "O'chirish",
        danger: true,
    });
}
