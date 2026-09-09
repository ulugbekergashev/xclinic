import React from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
   YO'QOLGAN BO'LAK — «Failed to fetch dynamically imported module».

   MUAMMO. Sahifalar `React.lazy` bilan bo'lingan va har build'da fayl nomi
   mazmun xeshidan yasaladi: `Settings-B7jqQJj2.js`. Yangi versiya chiqqanda
   nom o'zgaradi, eskisi esa serverda QOLMAYDI.

   Brauzerda ochiq turgan eski sahifa buni bilmaydi. Foydalanuvchi
   «Sozlamalar» ga bosadi — sahifa o'zining ESKI ro'yxati bo'yicha
   `Settings-B7jqQJj2.js` ni so'raydi, javob 404, va ekranda tushunarsiz
   texnik xato chiqadi. Klinikada bu aynan yangilanish kuni sodir bo'ladi.

   «Qayta urinish» tugmasi ham yordam bermaydi: u O'SHA o'lik manzilga
   qaytadan uradi.

   YECHIM. Import yiqilsa — sahifani BIR MARTA qayta yuklaymiz. Qayta
   yuklash yangi `index.html` ni oladi, u esa yangi nomlarni biladi.
   Foydalanuvchi uchun bu shunchaki «sahifa yangilandi» bo'lib ko'rinadi.

   NIMA UCHUN BIR MARTA. Agar sabab boshqa bo'lsa (internet uzilgan, server
   yiqilgan), cheksiz qayta yuklash halqasi paydo bo'lardi — ekran
   miltillab turadi va hech qachon xatoni ko'rsatmaydi. Shuning uchun
   belgi `sessionStorage` da saqlanadi: ikkinchi urinishda xato
   ErrorBoundary ga o'tadi va odam nima bo'lganini ko'radi.

   Muvaffaqiyatli yuklashdan keyin belgi tozalanadi — keyingi yangilanishda
   mexanizm yana ishlashi kerak.
   ───────────────────────────────────────────────────────────────────────────── */

const FLAG = 'xclinic:chunk-reloaded';

/** Xato aynan «bo'lak yuklanmadi» turidanmi. */
function isChunkLoadError(e: any): boolean {
    const msg = String(e?.message || e || '');
    return /Failed to fetch dynamically imported module/i.test(msg)
        || /error loading dynamically imported module/i.test(msg)
        || /Importing a module script failed/i.test(msg)      // Safari
        || /ChunkLoadError/i.test(String(e?.name || ''));
}

const readFlag = (): boolean => {
    try { return sessionStorage.getItem(FLAG) === '1'; } catch { return false; }
};
const setFlag = (v: boolean) => {
    try {
        if (v) sessionStorage.setItem(FLAG, '1');
        else sessionStorage.removeItem(FLAG);
    } catch { /* private rejimda saqlanmasligi mumkin — ish buzilmaydi */ }
};

export function lazyWithReload<T extends React.ComponentType<any>>(
    factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
    return React.lazy(async () => {
        try {
            const mod = await factory();
            /* Yuklandi — demak nomlar joyida. Belgini tozalaymiz, aks holda
               keyingi yangilanishda mexanizm bir marta ham ishlamasdi. */
            setFlag(false);
            return mod;
        } catch (e) {
            /* OFLAYN BO'LSA — QAYTA YUKLAMAYMIZ.

               Internetsiz planshetda sahifani yangilash ilovani umuman
               ochilmaydigan qiladi, keshni tozalash esa oflayn ishlashni
               butunlay o'ldiradi. Bunday holda xatoni ko'rsatgan
               ma'qul: sabab boshqa va uni yashirish yordam bermaydi. */
            if (isChunkLoadError(e) && !readFlag() && navigator.onLine !== false) {
                setFlag(true);
                /* Eski service worker eski `index.html` ni keshdan berib
                   turishi mumkin — u holda oddiy qayta yuklash o'sha
                   buzuq holatga qaytarardi. Shuning uchun kesh
                   bo'shatiladi: sahifa tarmoqdan yangisini oladi va
                   service worker qaytadan o'rnatiladi. */
                try {
                    if ('caches' in window) {
                        const names = await caches.keys();
                        await Promise.all(names.map(n => caches.delete(n)));
                    }
                    /* Service worker'ning O'ZI ham olib tashlanadi.

                       Keshni bo'shatish yetarli emas: eski service worker
                       nazoratda qolaveradi va o'zining eski yo'nalish
                       jadvali bilan javob berishda davom etadi. Qayta
                       yuklashdan keyin u yangi versiyani darhol
                       o'rnatadi — ya'ni yo'qotadigan narsa yo'q, faqat
                       bir marta tarmoqdan yuklab olinadi. */
                    if ('serviceWorker' in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(regs.map(r => r.unregister()));
                    }
                } catch { /* tozalanmasa ham qayta yuklash yordam beradi */ }

                window.location.reload();
                /* Qayta yuklash boshlanguncha React xato ko'rsatmasligi
                   uchun hech qachon tugamaydigan va'da qaytaramiz. */
                return new Promise<{ default: T }>(() => { });
            }
            throw e;
        }
    });
}

/* ─── SERVICE WORKER ALMASHGANDA ──────────────────────────────────────────────

   `registerType: 'autoUpdate'` yangi service worker'ni darhol o'rnatadi va u
   nazoratni oladi. Lekin OCHIQ sahifa eskiligicha qoladi — u yangi bo'lak
   nomlarini bilmaydi va birinchi o'tishda yuqoridagi xatoga uriladi.

   Shuning uchun nazorat almashganda sahifani bir marta yangilaymiz.

   BIRINCHI O'RNATISHDA QAYTA YUKLAMAYMIZ: `controller` bo'sh bo'lsa, bu
   service worker endigina o'rnatilgani — sahifa allaqachon to'g'ri. Aks
   holda har birinchi tashrifda ekran sababsiz yangilanardi. */
export function reloadOnServiceWorkerUpdate() {
    if (!('serviceWorker' in navigator)) return;
    if (!navigator.serviceWorker.controller) return;

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
    });
}
