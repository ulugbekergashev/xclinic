import { useEffect, useMemo, useRef } from 'react';
import { onDataChanged } from '../services/dataBus';
import { isDemoMode } from '../services/api';
import { useLiveUpdates, useLiveHealthy, LiveEventType } from './useLiveUpdates';

/* ─────────────────────────────────────────────────────────────────────────────
   UMUMIY RO'YXATLARNI YANGI TUTISH.

   `App.tsx` bo'limlar, xizmatlar, xodimlar, to'lanmagan qatorlar va
   boshqalarni kirishda BIR MARTA yuklaydi. Shundan keyin ular faqat
   `App` ning o'z amallari (`addService`, `addPatient`...) orqali
   yangilanardi. Ekran yozuvni to'g'ridan-to'g'ri `api.*` bilan qilsa yoki
   yozuv boshqa kompyuterda qilinsa — ro'yxat eskirib qolardi:

     · Sozlamalarda qo'shilgan bo'lim Registraturada chiqmasdi;
     · Registraturada ochilgan qabulning qarzi kassadagi «To'lash»
       oynasida yo'q edi («To'lanmagan qator yo'q»);
     · shifokor buyurgan tahlil Laboratoriya ro'yxatiga tushmasdi;
     · muolajada sarflangan material Omborda eski qoldiqda turardi.

   Bu hook ikki manbaga quloq soladi va ikkalasi ham bitta narsani
   aytadi — «`/api/<resource>` ga yozildi»:

     1. `dataBus` — SHU oynadagi yozuv (`fetchJson` e'lon qiladi);
     2. SSE `data.changed` — istalgan kompyuterdagi yozuv (server e'lon
        qiladi, `backend/server.ts`).

   Qaysi ro'yxat qayta o'qilishi `AFFECTS` jadvalida. Jadval SAXIY:
   ortiqcha bitta so'rov arzon, eskirgan ro'yxat esa «dastur ishlamayapti»
   degan shikoyat.
   ───────────────────────────────────────────────────────────────────────────── */

export type Slice =
    | 'departments' | 'services' | 'categories' | 'staff' | 'clinic'
    | 'patients' | 'appointments' | 'transactions' | 'charges'
    | 'labOrders' | 'inventory' | 'expenses' | 'cashClosures' | 'cashMovements';

/** Yozuv manzili (birinchi bo'g'in) → eskiradigan ro'yxatlar. */
const AFFECTS: Record<string, Slice[]> = {
    departments: ['departments'],
    services: ['services'],
    categories: ['categories'],
    doctors: ['staff'],
    receptionists: ['staff'],
    'lab-technicians': ['staff'],
    nurses: ['staff'],
    clinics: ['clinic'],
    license: ['clinic'],

    patients: ['patients'],
    'patient-merge': ['patients', 'appointments', 'charges', 'transactions'],
    appointments: ['appointments'],

    /* Qabul va uning ichidagi buyurtmalar pul qatori tug'diradi, muolaja
       esa retsept bo'yicha ombordan material yechadi. */
    visits: ['charges', 'inventory', 'appointments'],
    'visit-procedures': ['charges', 'inventory'],
    studies: ['charges'],
    'lab-orders': ['labOrders', 'charges', 'inventory', 'expenses'],
    referrals: ['charges', 'labOrders'],
    admissions: ['charges', 'inventory'],
    'medication-orders': ['charges', 'inventory'],

    charges: ['charges', 'transactions'],
    payments: ['charges', 'transactions'],
    transactions: ['transactions', 'charges'],
    installments: ['transactions', 'charges'],

    expenses: ['expenses'],
    payroll: ['expenses'],
    hr: ['expenses'],
    'cash-register': ['cashClosures'],
    'cash-movements': ['cashMovements'],

    /* Kirim narx bilan kelsa server «Ombor» xarajatini ham yozadi. */
    inventory: ['inventory', 'expenses'],
    'inventory-items': ['inventory'],
    'stock-movements': ['inventory', 'expenses'],
    batch: ['inventory'],

    /* Demoda server yo'q va manzil ham yo'q — `demoDone` bitta umumiy
       belgi beradi. Faqat ekranlar chetlab o'tadigan ro'yxatlar. */
    demo: ['departments', 'charges', 'labOrders', 'inventory'],
};

/** Oqim uzilganda so'rov bilan yangilanadigan ro'yxatlar — og'irlari
 *  (bemorlar, qabullar, cheklar) kirmaydi. */
const POLLED: Slice[] = ['departments', 'services', 'staff', 'charges', 'labOrders', 'inventory'];
const POLL_MS = 60_000;

/** Bir nechta yozuv ketma-ket kelsa (o'z e'lonimiz + server aks-sadosi,
 *  yoki bitta amal ichidagi uch so'rov) — bitta qayta o'qish. */
const DEBOUNCE_MS = 250;

const LIVE: LiveEventType[] = ['data.changed'];

/** Ro'yxatni qayta o'qiydigan funksiya. Natijani o'zi `setState` qiladi. */
export type SliceLoaders = Partial<Record<Slice, () => Promise<void> | void>>;

/**
 * O'zgarmagan ro'yxat o'rniga ESKISINI qaytaradi. Aks holda har qayta
 * o'qish yangi massiv beradi va unga bog'langan har bir `useEffect`
 * ishlab ketadi — masalan Registratura formasi tanlangan shifokorni
 * tashlab yuborardi, chunki uning effekti `services` ga bog'liq.
 */
export function keepIfSame<T>(prev: T, next: T): T {
    /* Demo: `api.*.getAll()` har safar O'SHA massivni qaytaradi va yozuv
       uni joyida o'zgartiradi. Havola bir xil bo'lgani uchun React
       o'zgarishni ko'rmaydi — nusxa beramiz. */
    if (prev === next) return (Array.isArray(next) ? [...next] : next) as T;
    try { return JSON.stringify(prev) === JSON.stringify(next) ? prev : next; }
    catch { return next; }
}

/**
 * @param isNeeded  Ro'yxat HOZIR ochiq ekranga kerakmi. Kerak bo'lmasa
 *   qayta o'qish KECHIKTIRILADI — kerak bo'lgan ekran ochilganda bajariladi.
 *   Sabab: cheklar ro'yxati 1 MB dan oshadi va har to'lovda klinikadagi
 *   HAMMA ochiq ekran uni qayta tortardi, garchi kassadan boshqa hech kim
 *   ko'rsatmasa ham.
 * @param routeKey  O'zgarsa (sahifa almashdi) kechiktirilganlar qayta
 *   tekshiriladi.
 */
/**
 * EKRANNING O'Z RO'YXATI uchun (umumiy ro'yxatlar emas — ular `useDataSync` da).
 *
 * Diagnostika ro'yxati, bemor kartasidagi joriy qabul kabi narsalar ekran
 * ochilganda bir marta yuklanardi. Boshqa kompyuterda shifokor tekshiruv
 * buyursa yoki kassir pulni olsa — ochiq turgan ekran buni bilmasdi va
 * odam sahifadan chiqib qayta kirishi kerak edi.
 *
 * `resources` — `/api/` dan keyingi birinchi bo'g'inlar. Ulardan biriga
 * yozilsa (shu oynada yoki boshqa kompyuterda) `reload` chaqiriladi.
 * Massiv modul darajasida e'lon qilinsin — har renderda yangisi emas.
 */
export function useResourceSync(resources: readonly string[], reload: () => void, enabled = true): void {
    const cb = useRef(reload);
    cb.current = reload;
    const on = useRef(enabled);
    on.current = enabled;

    const wanted = useMemo(() => new Set(resources), [resources]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hit = (resource?: string) => {
        // `demo` — demoda manzil yo'q, har yozuv hammaga tegishli deb olinadi
        if (!on.current || !resource || (resource !== 'demo' && !wanted.has(resource))) return;
        if (timer.current) return;
        timer.current = setTimeout(() => { timer.current = null; cb.current(); }, DEBOUNCE_MS);
    };
    const hitRef = useRef(hit);
    hitRef.current = hit;

    useEffect(() => onDataChanged((r) => hitRef.current(r)), []);
    useLiveUpdates(LIVE, (p) => hitRef.current(p?.resource));
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
}

export function useDataSync(
    loaders: SliceLoaders,
    enabled: boolean,
    isNeeded?: (slice: Slice) => boolean,
    routeKey?: string,
): void {
    const ref = useRef(loaders);
    ref.current = loaders;

    const neededRef = useRef(isNeeded);
    neededRef.current = isNeeded;
    /** Eskirgan, lekin hozirgi ekranga kerak bo'lmagani uchun kutayotganlar */
    const deferred = useRef(new Set<Slice>());

    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    const pending = useRef(new Set<Slice>());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* Bitta ro'yxat bir vaqtda faqat BIR MARTA o'qiladi. Ikkita parallel
       so'rovning javobi teskari tartibda kelishi mumkin — shunda eski
       javob yangisini bosib ketardi. O'qish paytida yana o'zgarish kelsa,
       tugagach bir marta qayta o'qiladi. */
    const inFlight = useRef(new Set<Slice>());
    const dirty = useRef(new Set<Slice>());

    const run = async (s: Slice): Promise<void> => {
        if (inFlight.current.has(s)) { dirty.current.add(s); return; }
        inFlight.current.add(s);
        try { await ref.current[s]?.(); }
        catch (e) { console.error('[sync]', s, e); }
        finally {
            inFlight.current.delete(s);
            if (dirty.current.delete(s)) void run(s);
        }
    };

    const flush = () => {
        timer.current = null;
        const slices = Array.from(pending.current);
        pending.current.clear();
        for (const s of slices) {
            if (neededRef.current && !neededRef.current(s)) deferred.current.add(s);
            else void run(s);
        }
    };

    const queue = (slices: Slice[] | undefined) => {
        if (!enabledRef.current || !slices?.length) return;
        for (const s of slices) pending.current.add(s);
        if (!timer.current) timer.current = setTimeout(flush, DEBOUNCE_MS);
    };

    /* Sahifa almashdi — kechiktirilgan ro'yxatlardan endi keraklilari
       o'qiladi. Chiqishda (`enabled` o'chdi) hammasi tashlanadi: keyingi
       kirishda `App` baribir hammasini qayta yuklaydi. */
    useEffect(() => {
        if (!enabled) { deferred.current.clear(); pending.current.clear(); return; }
        for (const s of Array.from(deferred.current)) {
            if (!neededRef.current || neededRef.current(s)) {
                deferred.current.delete(s);
                void run(s);
            }
        }
    }, [routeKey, enabled]);

    // 1. Shu oynadagi yozuvlar
    useEffect(() => onDataChanged((resource) => queue(AFFECTS[resource])), []);

    // 2. Boshqa kompyuterdagi yozuvlar
    useLiveUpdates(LIVE, (p) => queue(AFFECTS[p?.resource]));

    /* 3. Oqim uzilib qayta ulandi — orada o'tgan hodisalar yo'qolgan,
          shuning uchun hammasi qayta o'qiladi. Birinchi ulanish hisobga
          kirmaydi: `App` hozirgina hammasini yuklagan. */
    const healthy = useLiveHealthy();
    const seenHealthy = useRef(false);
    const wasDown = useRef(false);
    useEffect(() => {
        if (!enabled) { seenHealthy.current = false; wasDown.current = false; return; }
        if (!healthy) { if (seenHealthy.current) wasDown.current = true; return; }
        if (seenHealthy.current && wasDown.current) queue(Object.keys(ref.current) as Slice[]);
        seenHealthy.current = true;
        wasDown.current = false;
    }, [healthy, enabled]);

    /* 4. Oqim ishlamayapti (eski proksi, tunnel) — daqiqada bir so'rov.
          Demoda so'ralmaydi: u yerda server ham, boshqa foydalanuvchi
          ham yo'q. */
    useEffect(() => {
        if (!enabled || healthy || isDemoMode()) return;
        const id = setInterval(() => queue(POLLED), POLL_MS);
        return () => clearInterval(id);
    }, [healthy, enabled]);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
}
