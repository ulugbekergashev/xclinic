/* Tahlil natijasining me'yor yo'lagidagi o'rni (`utils/labRange.ts`). */
import { describe, it, expect } from 'vitest';
import { rangeMark } from '../../utils/labRange';

describe('rangeMark', () => {
    it('me\'yor ichidagi qiymat — yashil yo\'lak ichida', () => {
        const m = rangeMark(4.5, 3.5, 5.5)!;
        expect(m.pos).toBe(50);
        expect([m.bandLeft, m.bandRight]).toEqual([25, 75]);
    });

    it('chegaraning o\'zi — yo\'lak chetida', () => {
        expect(rangeMark(3.5, 3.5, 5.5)!.pos).toBe(25);
        expect(rangeMark(5.5, 3.5, 5.5)!.pos).toBe(75);
    });

    it('me\'yordan past va baland — yo\'lakdan tashqarida, lekin chizg\'ich ichida', () => {
        expect(rangeMark(3.0, 3.5, 5.5)!.pos).toBeLessThan(25);
        expect(rangeMark(7.9, 3.5, 5.5)!.pos).toBeGreaterThan(75);
        expect(rangeMark(900, 3.5, 5.5)!.pos).toBe(96);
        expect(rangeMark(-900, 3.5, 5.5)!.pos).toBe(4);
    });

    it('faqat yuqori chegara («< 5,2») — yo\'lak chapdan boshlanadi', () => {
        const m = rangeMark(2.6, null, 5.2)!;
        expect(m.bandLeft).toBe(0);
        expect(m.pos).toBeCloseTo(37.5);
    });

    it('faqat pastki chegara («> 1,0») — yo\'lak o\'ng chetgacha', () => {
        const m = rangeMark(2, 1, null)!;
        expect(m.bandRight).toBe(100);
        expect(m.pos).toBe(50);
    });

    it('son yoki me\'yor bo\'lmasa — chizilmaydi', () => {
        expect(rangeMark(null, 1, 2)).toBeNull();
        expect(rangeMark(NaN, 1, 2)).toBeNull();
        expect(rangeMark(5, null, null)).toBeNull();
        expect(rangeMark(5, 6, 6)).not.toBeNull(); // teng chegaralar — yuqori chegara sifatida
    });
});
