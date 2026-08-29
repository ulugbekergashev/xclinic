import { describe, it, expect } from 'vitest';
import { som, qty, pct, splitProportionally, sameMoney } from '../money';

/* ─────────────────────────────────────────────────────────────────────────────
   Pul hisob-kitobi — eng muhim birlik sinovlari.

   Nima uchun aynan bular. Bu funksiyalar bazaga yoziladigan HAR QANDAY
   summadan o'tadi. Ular xato bo'lsa xato jimgina tarqaladi: chek bilan qator
   yig'indisi ayri ketadi, yaxlitlik tekshiruvi (7.5) "buzilish" deb
   ko'rsatadi va sababini topish uchun kunlar ketadi.
   ───────────────────────────────────────────────────────────────────────────── */

describe('som — pul butun so\'mda', () => {
    it('eng yaqin butun songa yaxlitlaydi', () => {
        expect(som(33333.7)).toBe(33334);
        expect(som(33333.2)).toBe(33333);
        expect(som(0.4)).toBe(0);
        expect(som(0.5)).toBe(1);
    });

    it('yaroqsiz kirishda 0 qaytaradi', () => {
        expect(som(NaN)).toBe(0);
        expect(som(undefined as any)).toBe(0);
        expect(som(null as any)).toBe(0);
    });
});

describe('qty — ombor miqdori uch xonada', () => {
    it('real miqdorlarni saqlaydi', () => {
        expect(qty(2.5)).toBe(2.5);      // 2.5 ml
        expect(qty(0.5)).toBe(0.5);      // yarim ampula
    });

    it('uch xonaga qisqartiradi', () => {
        expect(qty(0.3333333)).toBe(0.333);
        expect(qty(1.00049)).toBe(1);
    });
});

describe('pct — foiz bir xonada', () => {
    it('12.5% saqlanadi, 12.53% qisqaradi', () => {
        expect(pct(12.5)).toBe(12.5);
        expect(pct(12.53)).toBe(12.5);
    });
});

describe('splitProportionally — yig\'indi HAR DOIM saqlanadi', () => {
    /* Bu sinovning sababi aniq: har qismni alohida yaxlitlash 100 000 ni
       uchga bo'lganda 33 333 × 3 = 99 999 beradi va bitta so'm yo'qoladi. */
    const cases: [string, number, number[]][] = [
        ['uchga bo\'linmaydigan', 100000, [1, 1, 1]],
        ['ikkiga notekis', 100000, [1, 2]],
        ['bittani uchga', 1, [1, 1, 1]],
        ['kichik son', 7, [3, 3, 1]],
        ['tub sonlar', 999999, [7, 11, 13, 17]],
        ['yagona qism', 50000, [1]],
        ['nol summa', 0, [1, 2]],
    ];

    for (const [name, total, weights] of cases) {
        it(`${name}: ${total} → [${weights}]`, () => {
            const parts = splitProportionally(total, weights);
            expect(parts.reduce((a, b) => a + b, 0)).toBe(som(total));
            expect(parts.every(Number.isInteger)).toBe(true);
            expect(parts.every((p) => p >= 0)).toBe(true);
            expect(parts).toHaveLength(weights.length);
        });
    }

    it('2000 ta tasodifiy holatda ham yig\'indi aynan teng', () => {
        // Aniqlangan urug': sinov har safar bir xil bo'lsin
        let seed = 12345;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

        for (let i = 0; i < 2000; i++) {
            const total = Math.floor(rnd() * 1000000);
            const n = 1 + Math.floor(rnd() * 6);
            const w = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 100));
            const parts = splitProportionally(total, w);
            expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
            expect(parts.every(Number.isInteger)).toBe(true);
        }
    });

    it('og\'irliklar yig\'indisi nol bo\'lsa hammasi nol', () => {
        expect(splitProportionally(1000, [0, 0])).toEqual([0, 0]);
        expect(splitProportionally(1000, [])).toEqual([]);
    });

    it('katta og\'irlik ko\'proq oladi', () => {
        const [a, b] = splitProportionally(100000, [1, 9]);
        expect(a).toBe(10000);
        expect(b).toBe(90000);
    });
});

describe('sameMoney — meros kasrli yozuvlarga bardosh', () => {
    it('0.001 dan kichik farqni teng deb hisoblaydi', () => {
        expect(sameMoney(100, 100.0005)).toBe(true);
        expect(sameMoney(100, 100.01)).toBe(false);
        expect(sameMoney(0, 0)).toBe(true);
    });
});
