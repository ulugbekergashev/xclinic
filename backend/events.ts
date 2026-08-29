/* ─────────────────────────────────────────────────────────────────────────────
   XClinic — real vaqtda yangilanish (SSE).

   MUAMMO. Ekranlar bir-birini ko'rmasdi. `MyQueue` 30 soniyada bir marta
   so'rardi, `QueueBoard` ham, qolgan ekranlar esa UMUMAN yangilanmasdi —
   `App.tsx` bir marta yuklab, shu holicha turardi. Kunlik sahnalar:

     - registrator bemorni yozdi → shifokor ekranida 30 soniyagacha yo'q;
     - kassir to'lovni oldi → laborant hali "to'lanmagan" ko'radi va natija
       kirita olmaydi (402), kassirga qo'ng'iroq qiladi;
     - ikki registrator bir vaqtda ishlaydi → biri ikkinchisining qabulini
       ko'rmaydi.

   ─── Uchta qaror ──────────────────────────────────────────────────────────

   1. SSE, WebSocket EMAS. Bizga bir tomonlama oqim kerak: server aytadi,
      mijoz o'qiydi. SSE oddiy HTTP ustida ishlaydi — ya'ni mavjud
      autentifikatsiya, CORS va Cloudflare tunnel bilan qo'shimcha ishsiz
      ketadi. WebSocket ikkinchi protokol, ikkinchi xato sinfi va tunnelda
      alohida sozlash demak.

   2. HODISA MA'LUMOTNI TASHIMAYDI, faqat "nima o'zgardi" ni. Ekran o'zi
      kerakli joyni qayta so'raydi. Ikki foydasi bor: oqim yengil qoladi, va
      MAXFIYLIK muammosi tug'ilmaydi — bemor ismi hech qachon ochiq kanalga
      chiqmaydi (navbat tablosi login talab qilmasligini eslang).

   3. KLINIKA BO'YICHA AJRATILGAN. Har mijoz faqat o'z klinikasining
      hodisalarini oladi.
   ───────────────────────────────────────────────────────────────────────────── */

import type express from 'express';

type Deps = {
    authenticateToken: any;
    getScopedClinicId: (req: any) => string | null;
};

/** Nima o'zgargani. Ma'lumot emas — sabab. */
export type EventType =
    | 'visit.created'      // yangi qabul ochildi (navbat, registratura, shifokor ro'yxati)
    | 'visit.status'       // qabul holati o'zgardi (chaqirildi, yakunlandi, tahlilga ketdi)
    | 'charge.paid'        // to'lov qabul qilindi (kassa, laboratoriya bloki ochiladi)
    | 'charge.changed'     // qator qo'shildi/bekor qilindi/chegirma berildi
    | 'lab.result'         // tahlil natijasi kiritildi
    | 'study.result'       // diagnostika xulosasi kiritildi
    | 'admission.changed'  // statsionar: yotqizish, ko'chirish, chiqarish
    | 'stock.changed'      // ombor qoldig'i o'zgardi
    | 'ping';              // ulanish tirikligini bildiradi

type Client = {
    id: number;
    clinicId: string;
    res: express.Response;
};

const clients = new Set<Client>();
let nextId = 1;

/**
 * Hodisani shu klinikaning HAMMA ochiq ekraniga yuboradi.
 *
 * ATAYLAB `void` va xatoni yutadi: hodisa yuborilmagani uchun to'lov yoki
 * qabul yiqilmasligi kerak. Bu — qulaylik qatlami, ma'lumot manbai emas.
 */
export function emitEvent(clinicId: string | null | undefined, type: EventType, payload?: Record<string, any>): void {
    if (!clinicId) return;
    const data = JSON.stringify({ type, at: Date.now(), ...(payload || {}) });
    for (const c of clients) {
        if (c.clinicId !== clinicId) continue;
        try {
            c.res.write(`event: ${type}\ndata: ${data}\n\n`);
        } catch {
            // Uzilgan ulanish — tozalash `close` ishlovchisida bo'ladi
        }
    }
}

/** Diagnostika uchun: hozir nechta ekran ulangan */
export function connectedCount(clinicId?: string): number {
    if (!clinicId) return clients.size;
    let n = 0;
    for (const c of clients) if (c.clinicId === clinicId) n++;
    return n;
}

export function registerEventRoutes(app: express.Express, deps: Deps) {
    const { authenticateToken: auth, getScopedClinicId } = deps;

    /**
     * GET /api/events — hodisalar oqimi.
     *
     * DIQQAT: mijoz `EventSource` EMAS, `fetch` + `ReadableStream` bilan
     * ulanadi. Sabab: `EventSource` sarlavha yubora olmaydi, ya'ni tokenni
     * URL ga qo'yishga to'g'ri kelardi — u esa server jurnaliga va brauzer
     * tarixiga tushadi. `fetch` bilan `Authorization` odatdagidek ketadi.
     */
    app.get('/api/events', auth, (req: any, res: any) => {
        const clinicId = getScopedClinicId(req);
        if (!clinicId) return res.status(400).json({ error: 'clinicId aniqlanmadi' });

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // Nginx/proksi oqimni buferlab qo'ymasin — aks holda hodisalar
            // to'planib, bir necha soniyadan keyin to'da bo'lib keladi
            'X-Accel-Buffering': 'no',
        });
        res.write('retry: 3000\n\n');

        const client: Client = { id: nextId++, clinicId, res };
        clients.add(client);

        /* Tiriklik signali. Ikki vazifasi bor: (1) oraliq proksilar jim
           turgan ulanishni yopib qo'ymasin; (2) mijoz server o'chganini
           bilsin — brauzer uzilishni har doim ham darhol sezmaydi. */
        const heartbeat = setInterval(() => {
            try { res.write(`event: ping\ndata: {"type":"ping","at":${Date.now()}}\n\n`); }
            catch { /* uzilgan */ }
        }, 25000);

        const cleanup = () => {
            clearInterval(heartbeat);
            clients.delete(client);
        };
        req.on('close', cleanup);
        req.on('error', cleanup);
    });

    console.log('✅ Hodisalar oqimi (SSE) ulandi');
}
