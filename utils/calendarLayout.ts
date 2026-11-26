/* KALENDAR TO'RIDA QABULLARNI JOYLASHTIRISH — sof funksiyalar.

   Bir vaqtga to'g'ri kelgan qabullar yonma-yon «yo'lak»larga bo'linadi.
   Ilgari bu hisob `pages/Calendar.tsx` ichida edi va ikkita kamchiligi
   bor edi:
     · guruhlash tranzitiv emas edi — A B bilan, B C bilan kesishsa,
       A va C ba'zan alohida guruhga tushib, ustma-ust chizilardi;
     · bekor qilingan yozuv tirik yozuvdan oldin yo'lak olardi va hafta
       ko'rinishida tirik qabulni «+1» ichiga surib yuborardi.
   Endi: klaster — ketma-ket kesishuvlar zanjiri; yo'lak tanlashda tirik
   yozuvlar birinchi. */
import type { Appointment } from '../types';

export interface LaneInfo { col: number; total: number }

export interface OverflowChip {
    id: string;
    date: string;
    /** Yashirilgan qabullarning eng ertasi — kun boshidan daqiqada */
    startMin: number;
    count: number;
    names: string;
}

/** `HH:MM` → kun boshidan daqiqa; buzuq vaqt — `null` */
export function startMinutes(time: string): number | null {
    /* Bo'sh satr `Number('')` = 0 bo'lib 00:00 ga tushardi va to'rni
       yarim tundan boshlab yuborardi — faqat `H:MM` / `HH:MM` qabul. */
    const m = /^(\d{1,2}):(\d{2})/.exec(time || '');
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Kelmadi / bekor — to'rda xira chiziladi va yo'lakda oxirgi navbatda */
export const isClosedAppt = (a: Pick<Appointment, 'status'>): boolean =>
    a.status === 'Cancelled' || a.status === 'No-Show';

const endMinutes = (a: Appointment, start: number) => start + Math.max(1, a.duration || 0);

/**
 * @param groupKey bir ustunga tushadigan yozuvlar kaliti (sana yoki sana+shifokor)
 * @param maxLanes berilsa — undan ortiq yo'lak chizilmaydi, qolgani `overflow` ga yig'iladi
 */
export function layoutLanes(
    appts: Appointment[],
    groupKey: (a: Appointment) => string,
    maxLanes?: number,
): { lanes: Record<string, LaneInfo>; overflow: OverflowChip[] } {
    const lanes: Record<string, LaneInfo> = {};
    const overflow: OverflowChip[] = [];

    const buckets = new Map<string, { a: Appointment; s: number; e: number }[]>();
    for (const a of appts) {
        const s = startMinutes(a.time);
        if (s == null) continue;
        const key = groupKey(a);
        const list = buckets.get(key) ?? [];
        list.push({ a, s, e: endMinutes(a, s) });
        buckets.set(key, list);
    }

    for (const items of buckets.values()) {
        const sorted = [...items].sort((x, y) => x.s - y.s);
        // Klasterlar: oldingi klasterning oxiridan oldin boshlangan — o'shanga
        const clusters: typeof sorted[] = [];
        let clusterEnd = -1;
        for (const it of sorted) {
            if (clusters.length && it.s < clusterEnd) {
                clusters[clusters.length - 1].push(it);
                clusterEnd = Math.max(clusterEnd, it.e);
            } else {
                clusters.push([it]);
                clusterEnd = it.e;
            }
        }

        for (const cluster of clusters) {
            const ordered = [...cluster].sort((x, y) =>
                Number(isClosedAppt(x.a)) - Number(isClosedAppt(y.a)) || x.s - y.s);
            const columnEnds: { s: number; e: number }[][] = [];
            const colOf = new Map<string, number>();
            for (const it of ordered) {
                let col = columnEnds.findIndex(c => c.every(o => it.e <= o.s || it.s >= o.e));
                if (col === -1) { col = columnEnds.length; columnEnds.push([]); }
                columnEnds[col].push({ s: it.s, e: it.e });
                colOf.set(it.a.id, col);
            }
            const total = columnEnds.length;
            for (const it of cluster) lanes[it.a.id] = { col: colOf.get(it.a.id) ?? 0, total };

            if (maxLanes && total > maxLanes) {
                /* Bekor / kelmadi «+N» ga qo'shilmaydi: belgi «yana bir
                   tirik yozuv bor» deb aldamasin. */
                const hidden = cluster.filter(it => (colOf.get(it.a.id) ?? 0) >= maxLanes && !isClosedAppt(it.a));
                if (hidden.length) {
                    overflow.push({
                        id: 'ov-' + cluster[0].a.id,
                        date: hidden[0].a.date,
                        startMin: Math.min(...hidden.map(h => h.s)),
                        count: hidden.length,
                        names: hidden.map(h => `${h.a.time} · ${h.a.patientName}`).join('\n'),
                    });
                }
            }
        }
    }
    return { lanes, overflow };
}

/** To'r chegarasi: ish soatlari + ko'rinadigan yozuvlar (ish vaqtidan
 *  tashqaridagi yozuv to'rdan chiqib ketmasin). Qaytadi: [start, end) soat. */
export function gridHours(
    workStart: number, workEnd: number, appts: Appointment[],
): { gridStart: number; gridEnd: number } {
    let from = workStart;
    let to = workEnd;
    for (const a of appts) {
        const s = startMinutes(a.time);
        if (s == null) continue;
        from = Math.min(from, Math.floor(s / 60));
        to = Math.max(to, Math.ceil(endMinutes(a, s) / 60));
    }
    from = Math.max(0, Math.min(23, from));
    to = Math.min(24, Math.max(from + 1, to));
    return { gridStart: from, gridEnd: to };
}
