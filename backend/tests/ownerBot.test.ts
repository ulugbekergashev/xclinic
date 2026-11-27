/* Rahbar/shifokor boti — sof qismlar (2026-11-27, 0050) */
import { describe, it, expect } from 'vitest';
import {
    periodRange, decideDailyReport, parseReportCallback, reportKeyboard, doctorNoticeText,
    fitTelegram, money, esc, addDays,
} from '../ownerBot';

describe('periodRange', () => {
    it('bugun va kecha', () => {
        expect(periodRange('d', '2026-11-27')).toMatchObject({ from: '2026-11-27', to: '2026-11-27' });
        expect(periodRange('y', '2026-11-27')).toMatchObject({ from: '2026-11-26', to: '2026-11-26' });
    });
    it('hafta dushanbadan (27.11.2026 — juma)', () => {
        expect(periodRange('w', '2026-11-27')).toMatchObject({ from: '2026-11-23', to: '2026-11-27' });
        expect(periodRange('w', '2026-11-23')).toMatchObject({ from: '2026-11-23', to: '2026-11-23' });
        expect(periodRange('w', '2026-11-29')).toMatchObject({ from: '2026-11-23' }); // yakshanba
    });
    it("oy va o'tgan oy (yil chegarasi ham)", () => {
        expect(periodRange('m', '2026-11-27')).toMatchObject({ from: '2026-11-01', to: '2026-11-27' });
        expect(periodRange('pm', '2026-11-27')).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
        expect(periodRange('pm', '2027-01-05')).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
        expect(periodRange('pm', '2028-03-10')).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
    });
});

describe('decideDailyReport — qachon yuboriladi', () => {
    const today = '2026-11-27';
    it('vaqt kelmagan, kecha yuborilgan — hech narsa', () => {
        expect(decideDailyReport('2026-11-26', '22:00', '15:00', today)).toBeNull();
    });
    it('vaqt keldi — bugungisi', () => {
        expect(decideDailyReport('2026-11-26', '22:00', '22:00', today)).toEqual({ day: today, yesterday: false });
        expect(decideDailyReport(null, '22:00', '23:10', today)).toEqual({ day: today, yesterday: false });
    });
    it('bugun allaqachon — takrorlanmaydi', () => {
        expect(decideDailyReport(today, '22:00', '23:00', today)).toBeNull();
    });
    it("kecha kompyuter o'chiq edi — ertalab «Kechagi hisobot»", () => {
        expect(decideDailyReport('2026-11-25', '22:00', '09:00', today)).toEqual({ day: '2026-11-26', yesterday: true });
    });
    it("hech qachon yuborilmagan — kechagini o'zi to'qib chiqarmaydi", () => {
        expect(decideDailyReport(null, '22:00', '09:00', today)).toBeNull();
    });
    it("noto'g'ri vaqt — 22:00 deb olinadi", () => {
        expect(decideDailyReport('2026-11-26', 'abc', '21:59', today)).toBeNull();
        expect(decideDailyReport('2026-11-26', 'abc', '22:01', today)).toEqual({ day: today, yesterday: false });
    });
});

describe('tugmalar', () => {
    it('callback_data 64 baytdan oshmaydi va qayta o\'qiladi', () => {
        const kb = reportKeyboard('pm', 'debt');
        for (const row of kb.inline_keyboard) for (const b of row) {
            expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
            expect(parseReportCallback(b.callback_data)).not.toBeNull();
        }
        expect(kb.inline_keyboard[0].find(b => b.callback_data === 'rp:pm:debt')?.text).toMatch(/•/);
    });
    it("begona yoki buzilgan callback — null", () => {
        expect(parseReportCallback('rp:x:sum')).toBeNull();
        expect(parseReportCallback('rp:d:hack')).toBeNull();
        expect(parseReportCallback('confirm_pay_1')).toBeNull();
    });
});

describe('matn', () => {
    it("shifokor xabarida bemor ismi HTML sifatida qochiriladi", () => {
        const txt = doctorNoticeText('new', { clinicId: 'c', patientName: 'A<b>_*', date: '2026-11-28', time: '10:30', type: 'UZI' });
        expect(txt).toContain('A&lt;b&gt;_*');
        expect(txt).toContain('28.11.2026 10:30');
    });
    it("ko'chirilganda eski vaqt chizilgan", () => {
        const txt = doctorNoticeText('moved',
            { clinicId: 'c', patientName: 'Ali', date: '2026-11-29', time: '11:00' },
            { clinicId: 'c', patientName: 'Ali', date: '2026-11-28', time: '10:00' });
        expect(txt).toContain('<s>28.11.2026 10:00</s>');
        expect(txt).toContain('29.11.2026 11:00');
    });
    it('uzun hisobot Telegram chegarasida kesiladi', () => {
        const out = fitTelegram(Array.from({ length: 500 }, (_, i) => `qator ${i} — ${'x'.repeat(20)}`));
        expect(out.length).toBeLessThanOrEqual(4096);
        expect(out.endsWith('…')).toBe(true);
    });
    it('pul va qochirish', () => {
        expect(money(1250000)).toBe('1 250 000');
        expect(money(0)).toBe('0');
        expect(esc('a&b')).toBe('a&amp;b');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    });
});
