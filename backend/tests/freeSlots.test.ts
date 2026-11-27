/* Bo'sh vaqtlar (`onlineBooking.ts`, freeSlots) — saytdan yozilish shunga tayanadi.
 * Ish kunlari, o'tib ketgan vaqt va band yozuvlar hisobga olinishi kerak. */
import { describe, it, expect } from 'vitest';
import { freeSlots, worksOn } from '../onlineBooking';

const clinic = { startHour: 9, endHour: 12 };
/* «Hozir» — Toshkent vaqti UTC maydonlarida: 2026-11-26 (payshanba) 10:10 */
const now = new Date(Date.UTC(2026, 10, 26, 10, 10));

describe('freeSlots', () => {
    it('ish kuni bo\'lmagan kun — bo\'sh ro\'yxat', () => {
        // 1=Du ... 7=Ya; 2026-11-29 — yakshanba
        expect(worksOn({ workDays: '1,2,3,4,5' }, '2026-11-29')).toBe(false);
        expect(freeSlots({ doctor: { workDays: '1,2,3,4,5' }, clinic, date: '2026-11-29', taken: [], now })).toEqual([]);
    });

    it('ish kunlari belgilanmagan — har kuni ishlaydi', () => {
        expect(worksOn({ workDays: null }, '2026-11-29')).toBe(true);
    });

    it('ertangi kun: klinika soatlari, 30 daqiqalik qadam', () => {
        expect(freeSlots({ doctor: {}, clinic, date: '2026-11-27', taken: [], now }))
            .toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']);
    });

    it('bugun — o\'tib ketgan vaqt chiqmaydi', () => {
        expect(freeSlots({ doctor: {}, clinic, date: '2026-11-26', taken: [], now })).toEqual(['10:30', '11:00', '11:30']);
    });

    it('kecha — hech narsa', () => {
        expect(freeSlots({ doctor: {}, clinic, date: '2026-11-25', taken: [], now })).toEqual([]);
    });

    it('band yozuv va uning davomiyligi to\'sadi; shifokor soati klinikanikidan ustun', () => {
        const taken = [{ time: '09:30', duration: 60 }];
        expect(freeSlots({ doctor: { startHour: 9, endHour: 11 }, clinic: { startHour: 8, endHour: 20 }, date: '2026-11-27', taken, now }))
            .toEqual(['09:00', '10:30']);
    });
});
