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

/** Bir vaqtda bitta yangilash. Aks holda o'nta parallel so'rov 401 olsa,
 *  o'nta yangilash ketardi va ular bir-birining cookie'sini almashtirardi. */
let inFlight: Promise<Session | null> | null = null;

export function refresh(apiBase: string): Promise<Session | null> {
    if (inFlight) return inFlight;

    inFlight = (async () => {
        try {
            const r = await fetch(`${apiBase}/auth/refresh`, {
                method: 'POST',
                // Cookie yuborilishi uchun shart.
                credentials: 'include',
            });
            if (!r.ok) return null;
            const data = await r.json();
            if (!data?.token) return null;

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
            return next;
        } catch {
            return null;
        } finally {
            inFlight = null;
        }
    })();

    return inFlight;
}

/** Chiqish: xotira, sessionStorage va serverdagi cookie — uchalasi ham. */
export async function clearSession(apiBase: string) {
    setToken(null);
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    try {
        // Cookie'ni faqat server o'chira oladi — `httpOnly` shuni anglatadi.
        await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch { /* tarmoq yo'q bo'lsa ham lokal tozalash bajarildi */ }
}
