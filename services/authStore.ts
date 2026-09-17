/* ─────────────────────────────────────────────────────────────────────────────
   SESSIYA — token qayerda yashaydi (S1.3).

   ILGARI QANDAY EDI. Butun sessiya, jumladan 30 kunlik JWT, `localStorage`
   da ochiq JSON bo'lib yotardi. Bu ikki narsani anglatardi:
   bitta XSS butun klinikaning sessiyasini olib qo'yardi, va o'g'irlangan
   token bir oy amal qilardi.

   ENDI IKKI QISM:

   1. KIRISH TOKENI — faqat shu moduldagi o'zgaruvchida, ya'ni brauzer
      XOTIRASIDA. Diskda hech qayerda yo'q, DevTools → Storage da ko'rinmaydi.
      Umri 30 daqiqa.

   2. YANGILASH TOKENI — `httpOnly` cookie'da, serverda qo'yiladi.
      JavaScript uni o'qiy ham, o'chira ham olmaydi. Sahifa yangilanganda
      xotiradagi token yo'qoladi va `refresh()` shu cookie orqali yangisini
      oladi — foydalanuvchi qaytadan parol kiritmaydi.

   FOYDALANUVCHI MA'LUMOTI (ism, rol, klinika) `sessionStorage` da qoladi:
   u sir emas va interfeys uni har renderda o'qiydi. Roldagi soxtalashtirish
   endi hech narsa bermaydi — ruxsatni server hal qiladi
   (`backend/permissions.ts`).
   ───────────────────────────────────────────────────────────────────────── */

const KEY = 'xclinic_auth';

export interface Session {
    role?: string;
    name?: string;
    clinicId?: string;
    doctorId?: string;
    receptionistId?: string;
    technicianId?: string;
    username?: string;
    isDemo?: boolean;
    /** Faqat demo rejimda — u serverga bormaydi. */
    token?: string;
}

/* ─── Kirish tokeni: XOTIRADA ────────────────────────────────────────────── */

let accessToken: string | null = null;

export const getToken = (): string | null => accessToken;
export const setToken = (t: string | null) => { accessToken = t; };

/* ─── Foydalanuvchi ma'lumoti: sessionStorage ────────────────────────────── */

export function getSession(): Session | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        return raw ? JSON.parse(raw) as Session : null;
    } catch {
        return null;
    }
}

export function setSession(s: Session | null) {
    try {
        if (!s) { sessionStorage.removeItem(KEY); return; }
        /* Token ATAYLAB ajratib tashlanadi: shu funksiyaga tokenli obyekt
           berilsa ham u diskka tushmasin. Demo rejim istisno — u soxta
           token bilan ishlaydi va serverga umuman bormaydi. */
        const { token, ...rest } = s;
        const toStore: Session = s.isDemo ? { ...rest, token } : rest;
        sessionStorage.setItem(KEY, JSON.stringify(toStore));
        if (token && !s.isDemo) setToken(token);
    } catch { /* saqlab bo'lmasa sessiya baribir xotirada ishlaydi */ }
}

/**
 * Eski sessiyani ko'chirish.
 *
 * Bu o'zgarishgacha token `localStorage` da yotgan. Ilova ishga tushganda u
 * bir marta xotiraga ko'chiriladi va DISKDAN O'CHIRILADI — shunda mavjud
 * xodimlar bir kunda tizimdan chiqib qolmaydi, lekin token diskda qolmaydi.
 * Server eski (`typ` siz) tokenni hali qabul qiladi va birinchi so'rovda uni
 * yangi shaklga o'tkazadi.
 */
export function migrateLegacyStorage() {
    try {
        const legacy = localStorage.getItem(KEY);
        if (!legacy) return;
        const parsed = JSON.parse(legacy) as Session;
        localStorage.removeItem(KEY);
        if (parsed?.token && !parsed.isDemo) setToken(parsed.token);
        if (!sessionStorage.getItem(KEY)) setSession(parsed);
    } catch {
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }
}

/* ─── Yangilash ──────────────────────────────────────────────────────────── */

/** Yangilash natijasi. «Sessiya yo'q» va «server javob bermadi» — BOSHQA
 *  narsalar: birinchisida foydalanuvchi qayta kirishi kerak, ikkinchisida
 *  esa sessiya tirik, faqat tarmoq (yoki server) vaqtincha ishlamayapti. */
export type RefreshOutcome =
    | { ok: true; session: Session }
    | { ok: false; reason: 'unauthorized' | 'network' };

/** Vaqtinchalik xatoda qayta urinishlar orasidagi kutish (ms) */
const REFRESH_BACKOFF = [400, 1200];

/** Bir vaqtda bitta yangilash. Aks holda o'nta parallel so'rov 401 olsa,
 *  o'nta yangilash ketardi va ular bir-birining cookie'sini almashtirardi. */
let inFlight: Promise<RefreshOutcome> | null = null;

/**
 * Tokenni cookie orqali yangilaydi.
 *
 * ILGARI tarmoq xatosi va 5xx ham `null` qaytarardi, chaqiruvchi esa uni
 * «sessiya tugagan» deb tushunib chiqish so'rovini yuborardi va cookie'ni
 * o'chirardi. Ya'ni Wi-Fi bir soniya uzilsa yoki server qayta ishga
 * tushayotgan bo'lsa, xodim tizimdan chiqarib yuborilardi.
 *
 * ENDI faqat 401/403 (va tokensiz javob) — «unauthorized». Tarmoq xatosi va
 * 5xx bir necha marta qisqa kutish bilan qayta uriniladi, keyin «network»
 * qaytadi va sessiya TEGILMAYDI.
 */
export function refreshWithOutcome(apiBase: string): Promise<RefreshOutcome> {
    if (inFlight) return inFlight;

    inFlight = (async (): Promise<RefreshOutcome> => {
        try {
            for (let attempt = 0; ; attempt++) {
                let r: Response | null = null;
                try {
                    r = await fetch(`${apiBase}/auth/refresh`, {
                        method: 'POST',
                        // Cookie yuborilishi uchun shart.
                        credentials: 'include',
                    });
                } catch { r = null; /* tarmoq xatosi */ }

                if (r && r.ok) {
                    const data = await r.json().catch(() => null);
                    if (!data?.token) return { ok: false, reason: 'unauthorized' };

                    setToken(data.token);
                    const prev = getSession() || {};
                    const next: Session = {
                        ...prev,
                        role: data.role ?? prev.role,
                        name: data.name ?? prev.name,
                        clinicId: data.clinicId ?? prev.clinicId,
                        doctorId: data.doctorId ?? prev.doctorId,
                        receptionistId: data.receptionistId ?? prev.receptionistId,
                        technicianId: data.technicianId ?? prev.technicianId,
                    };
                    setSession(next);
                    return { ok: true, session: next };
                }

                /* 4xx (401, 403, 400…) — cookie yaroqsiz yoki yo'q. Qayta
                   urinishdan foyda yo'q. Faqat 5xx va tarmoq — vaqtinchalik. */
                const transient = !r || r.status >= 500 || r.status === 408 || r.status === 429;
                if (!transient) return { ok: false, reason: 'unauthorized' };
                if (attempt >= REFRESH_BACKOFF.length) return { ok: false, reason: 'network' };
                await new Promise(res => setTimeout(res, REFRESH_BACKOFF[attempt]));
            }
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}

/** Eski shakl: sessiya yoki `null`. Faqat ishga tushishda ishlatiladi —
 *  u yerda `null` hech narsani o'chirmaydi, kirish sahifasini ko'rsatadi. */
export async function refresh(apiBase: string): Promise<Session | null> {
    const r = await refreshWithOutcome(apiBase);
    return r.ok ? r.session : null;
}

/** Chiqish so'rovi bir vaqtda bitta — parallel 401 lar har biri alohida
 *  `logout` yubormasin. */
let clearing: Promise<void> | null = null;

/** Chiqish: xotira, sessionStorage va serverdagi cookie — uchalasi ham. */
export function clearSession(apiBase: string): Promise<void> {
    if (clearing) return clearing;
    /* Sessiya allaqachon tozalangan bo'lsa serverga qayta bormaymiz:
       muddati tugagan so'rov sessiyani tozalaydi, keyin App dagi
       `auth:unauthorized` ishlovchisi ham shu funksiyani chaqiradi. */
    let hadSession = !!accessToken;
    try { hadSession = hadSession || !!sessionStorage.getItem(KEY) || !!localStorage.getItem(KEY); } catch { /* ignore */ }

    setToken(null);
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    if (!hadSession) return Promise.resolve();

    clearing = (async () => {
        try {
            // Cookie'ni faqat server o'chira oladi — `httpOnly` shuni anglatadi.
            await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include' });
        } catch { /* tarmoq yo'q bo'lsa ham lokal tozalash bajarildi */ }
        finally { clearing = null; }
    })();
    return clearing;
}
