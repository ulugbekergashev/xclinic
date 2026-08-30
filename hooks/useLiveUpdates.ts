import { useEffect, useRef, useState } from 'react';
import { API_URL, getAuthToken, isDemoMode } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   Real vaqtda yangilanish — mijoz tomoni.

   ─── To'rtta qaror ────────────────────────────────────────────────────────

   1. BITTA ULANISH, ko'p obunachi. Har komponent o'z oqimini ochsa, beshta
      ekran ochilgan kompyuterda beshta ulanish bo'lardi. Shuning uchun
      ulanish MODUL darajasida, komponentlar unga obuna bo'ladi.

   2. `EventSource` EMAS, `fetch` + `ReadableStream`. `EventSource` sarlavha
      yubora olmaydi — tokenni URL ga qo'yishga to'g'ri kelardi va u server
      jurnaliga tushardi. Narxi: qayta ulanishni o'zimiz yozamiz (baribir
      kerak edi).

   3. HODISA MA'LUMOT KELTIRMAYDI. U faqat "nima o'zgardi" ni aytadi, ekran
      esa o'zi qayta so'raydi. Shuning uchun obunachi — oddiy `() => void`.

   4. UZILSA — POLLING GA QAYTADI. Oqim ishlamasa (eski proksi, tarmoq
      muammosi), ekranlar 30 soniyalik so'rovga qaytadi — ya'ni AVVALGI
      xatti-harakat. Yomonlashuv yo'q, faqat yaxshilanish.
   ───────────────────────────────────────────────────────────────────────────── */

export type LiveEventType =
    | 'visit.created' | 'visit.status'
    | 'charge.paid' | 'charge.changed'
    | 'lab.result' | 'study.result'
    | 'admission.changed' | 'stock.changed';

type Listener = (payload: any) => void;

const listeners = new Map<LiveEventType, Set<Listener>>();
let controller: AbortController | null = null;
let connected = false;
let stopped = false;
let retryMs = 1000;
/** Oqim ishlayaptimi — ekranlar shunga qarab polling ni yoqadi/o'chiradi */
let streamHealthy = false;
const healthListeners = new Set<(ok: boolean) => void>();

const setHealthy = (ok: boolean) => {
    if (streamHealthy === ok) return;
    streamHealthy = ok;
    for (const l of healthListeners) { try { l(ok); } catch { /* ignore */ } }
};

function dispatch(type: string, payload: any) {
    const set = listeners.get(type as LiveEventType);
    if (!set) return;
    for (const fn of set) {
        try { fn(payload); } catch (e) { console.error('[live] obunachi xatosi:', e); }
    }
}

async function connect() {
    if (connected || stopped) return;

    /* DEMO REJIMI. `getAuthToken()` demo tokenini QAYTARADI (u sessiyada
       haqiqiy token o'rnida turadi), ya'ni tekshiruvsiz bu yerda oqim
       ochilishga urinardi. Demoda esa server umuman yo'q: so'rov yiqiladi,
       qayta ulanish uni 1s → 2s → ... bilan cheksiz takrorlaydi va
       konsolni xato bilan to'ldiradi.

       To'xtatamiz. Yo'qotiladigan narsa yo'q: oqim ishlamaganda ekranlar
       allaqachon 30 soniyalik so'rovga qaytadi (4-qarorga qarang), demo
       ma'lumoti esa brauzerning o'zida — u yerda "boshqa foydalanuvchi
       o'zgartirdi" degan holat bo'lmaydi. */
    if (isDemoMode()) { setHealthy(false); return; }

    const token = getAuthToken();
    if (!token) return;

    connected = true;
    controller = new AbortController();

    try {
        const res = await fetch(`${API_URL}/events`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE: ${res.status}`);

        setHealthy(true);
        retryMs = 1000;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (!stopped) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            /* SSE ramkasi: bo'sh qator xabarni tugatadi. Bo'lak yarim kelishi
               mumkin, shuning uchun oxirgi tugallanmagan qismi buferda qoladi. */
            const parts = buf.split('\n\n');
            buf = parts.pop() || '';
            for (const chunk of parts) {
                const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
                if (!dataLine) continue;
                try {
                    const payload = JSON.parse(dataLine.slice(5).trim());
                    if (payload?.type && payload.type !== 'ping') dispatch(payload.type, payload);
                } catch { /* buzuq ramka — tashlab yuboramiz */ }
            }
        }
    } catch (e: any) {
        if (e?.name !== 'AbortError') {
            console.warn('[live] oqim uzildi:', e?.message || e);
        }
    } finally {
        connected = false;
        setHealthy(false);
        if (!stopped) {
            // Eksponensial kechikish, 30 soniyagacha — serverni bombardimon qilmaymiz
            setTimeout(connect, retryMs);
            retryMs = Math.min(retryMs * 2, 30000);
        }
    }
}

export function startLiveUpdates() {
    stopped = false;
    void connect();
}

export function stopLiveUpdates() {
    stopped = true;
    setHealthy(false);
    try { controller?.abort(); } catch { /* ignore */ }
    controller = null;
}

/**
 * Hodisaga obuna. `types` o'zgarmas bo'lishi kerak (`useMemo` yoki modul
 * darajasidagi massiv) — aks holda har renderda qayta obuna bo'ladi.
 */
export function useLiveUpdates(types: LiveEventType[], onChange: Listener): void {
    const cb = useRef(onChange);
    cb.current = onChange;

    useEffect(() => {
        const fn: Listener = (p) => cb.current(p);
        for (const t of types) {
            if (!listeners.has(t)) listeners.set(t, new Set());
            listeners.get(t)!.add(fn);
        }
        return () => {
            for (const t of types) listeners.get(t)?.delete(fn);
        };
    }, [types]);
}

/**
 * Oqim tirikmi. Ekranlar shunga qarab polling ni o'chiradi:
 * oqim ishlayotganda 30 soniyalik so'rov ortiqcha, ishlamayotganda esa —
 * yagona yangilanish yo'li.
 */
export function useLiveHealthy(): boolean {
    const [ok, setOk] = useState(streamHealthy);
    useEffect(() => {
        const fn = (v: boolean) => setOk(v);
        healthListeners.add(fn);
        setOk(streamHealthy);
        return () => { healthListeners.delete(fn); };
    }, []);
    return ok;
}
