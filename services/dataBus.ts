/* ─────────────────────────────────────────────────────────────────────────────
   «MA'LUMOT O'ZGARDI» — ilova ichidagi yagona e'lon nuqtasi.

   MUAMMO. `App.tsx` umumiy ro'yxatlarni kirishda bir marta yuklaydi va
   ekranlarga prop qilib beradi. Ekran yozuvni to'g'ridan-to'g'ri
   `api.*` orqali o'zgartirsa (Sozlamalar → bo'lim, bemor kartasi →
   tahlil yo'llanmasi, Registratura → qabul), umumiy ro'yxat eskirib
   qolardi. Har ekranga «tugagach App ga ayt» degan callback uzatish
   kerak edi va u aynan unutilgan joylarda xato chiqardi.

   YECHIM. Yozuvni `fetchJson` O'ZI e'lon qiladi — manzilning birinchi
   bo'g'ini bilan. Ekran hech narsani eslab qolishi shart emas. Xuddi shu
   e'lon boshqa kompyuterlarga server orqali (SSE, `data.changed`) yetib
   boradi; ikkalasi ham `hooks/useDataSync.ts` ga tushadi.

   `api.ts` va `useLiveUpdates.ts` bir-birini import qiladi, shuning uchun
   bu modul ATAYLAB hech narsani import qilmaydi.
   ───────────────────────────────────────────────────────────────────────────── */

type Listener = (resource: string) => void;

const listeners = new Set<Listener>();

/** `resource` — `/api/` dan keyingi birinchi bo'g'in: `departments`, `visits`... */
export function emitDataChanged(resource: string): void {
    if (!resource) return;
    for (const fn of listeners) {
        try { fn(resource); } catch (e) { console.error('[dataBus] obunachi xatosi:', e); }
    }
}

export function onDataChanged(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** `/visits/abc/procedures?x=1` → `visits` */
export function resourceOf(url: string): string {
    return url.replace(/^\/+/, '').split(/[/?#]/)[0] || '';
}
