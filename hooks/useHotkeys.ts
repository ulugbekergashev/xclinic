import { useEffect } from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
   Global tezkor tugmalar.

   MUAMMO. Registrator kuniga 100 bemor kiritadi va sichqonni ushlab
   o'tirmaydi. Butun kodda `keydown` faqat AI oynasida ishlatilgan edi —
   ya'ni klaviatura bilan ishlash umuman ko'zda tutilmagan.

   ─── Uch qoida ────────────────────────────────────────────────────────────

   1. MATN KIRITILAYOTGANDA ARALASHMAYMIZ. `input`, `textarea`, `select` va
      `contenteditable` ichida bosilgan tugma o'zining ishini qiladi. Aks
      holda bemorning ismini yozayotgan registrator "F" harfini bosganda
      boshqa sahifaga uchib ketardi.

      ISTISNO: `Esc` va `F`-tugmalar — ular matn kiritmaydi va ularning
      ma'nosi maydon ichida ham bir xil.

   2. BRAUZER TUGMALARINI TORTIB OLMAYMIZ. `Ctrl+F`, `Ctrl+P`, `F5` —
      foydalanuvchi ularni biladi va kutadi. Shuning uchun `F2`-`F4` va
      `Esc` tanlangan: brauzerда bo'sh turadi.

   3. HAR TUGMA — BITTA MA'NO. Sahifaga qarab o'zgaradigan tugma
      eslab qolinmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

export type HotkeyHandler = (e: KeyboardEvent) => void;

export interface HotkeyMap {
    /** Registratura: yangi qabul */
    F2?: HotkeyHandler;
    /** Bemor qidirish — istalgan joydan */
    F3?: HotkeyHandler;
    /** Kassa: to'lov qabul qilish */
    F4?: HotkeyHandler;
    /** Modal yopiladi / qidiruv tozalanadi */
    Escape?: HotkeyHandler;
    /** Ochiq formani saqlash */
    ctrlS?: HotkeyHandler;
}

/** Fokus matn kiritiladigan joydami */
export function isTypingTarget(el: EventTarget | null): boolean {
    const t = el as HTMLElement | null;
    if (!t || !t.tagName) return false;
    const tag = t.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return t.isContentEditable === true;
}

export function useHotkeys(map: HotkeyMap, enabled = true): void {
    useEffect(() => {
        if (!enabled) return;

        const onKey = (e: KeyboardEvent) => {
            // Tizim tugmalari bilan birga bosilgan F-tugmalarga tegmaymiz
            if (e.altKey || e.metaKey) return;

            if (e.key === 'Escape' && map.Escape) {
                map.Escape(e);
                return;
            }

            if (e.ctrlKey && (e.key === 's' || e.key === 'S') && map.ctrlS) {
                // Brauzerning "sahifani saqlash" oynasi ochilmasin
                e.preventDefault();
                map.ctrlS(e);
                return;
            }

            if (e.ctrlKey) return;   // qolgan Ctrl birikmalari brauzerniki

            const fn = (map as any)[e.key] as HotkeyHandler | undefined;
            if (fn && (e.key === 'F2' || e.key === 'F3' || e.key === 'F4')) {
                e.preventDefault();
                fn(e);
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [map, enabled]);
}

/* ─── Skaner ──────────────────────────────────────────────────────────────
   Shtrix-kod va karta skanerlari klaviatura sifatida ishlaydi: butun kodni
   juda tez "yozadi" va oxirida Enter bosadi. Ya'ni alohida qo'llab-quvvatlash
   kerak emas — faqat "tez kelgan uzun satr" ni tanib, uni qidiruvga
   yuborish yetarli.

   50 ms — odam qo'li bilan yetib bo'lmaydigan tezlik; 6 belgi — tasodifiy
   tez yozishdan ajratadigan eng qisqa uzunlik. */
export function useScannerInput(onScan: (code: string) => void, enabled = true): void {
    useEffect(() => {
        if (!enabled) return;

        let buffer = '';
        let lastAt = 0;

        const onKey = (e: KeyboardEvent) => {
            const now = Date.now();
            if (now - lastAt > 50) buffer = '';   // uzilish bo'ldi — yangi ketma-ketlik
            lastAt = now;

            if (e.key === 'Enter') {
                if (buffer.length >= 6) {
                    onScan(buffer);
                    buffer = '';
                }
                return;
            }
            if (e.key.length === 1) buffer += e.key;
            if (buffer.length > 64) buffer = '';   // skaner emas
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onScan, enabled]);
}
