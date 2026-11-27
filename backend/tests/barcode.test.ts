/* Code128-C (`utils/barcode.ts`).
 *
 * Jadval qo'lda yozilgan — bitta raqam xato bo'lsa, skaner yorliqni o'qimaydi
 * va buni faqat laboratoriyada, ertalab sezishadi. Shuning uchun standartning
 * o'zgarmas xossalari shu yerda tekshiriladi.
 */
import { describe, it, expect } from 'vitest';
import {
    CODE128_PATTERNS, CODE128_STOP, code128CValues, code128CWidths, code128CModules,
    code128CSvg, isCode128CText,
} from '../../utils/barcode';

const sum = (s: string) => [...s].reduce((a, c) => a + Number(c), 0);

describe('Code128 jadvali', () => {
    it('107 ta naqsh: 106 belgi + start A/B/C', () => {
        expect(CODE128_PATTERNS).toHaveLength(106);
    });

    it('har belgi 11 modul, 6 kenglik, kengliklar 1..4', () => {
        for (const p of CODE128_PATTERNS) {
            expect(p).toMatch(/^[1-4]{6}$/);
            expect(sum(p)).toBe(11);
        }
    });

    it('chiziqlar (1,3,5) yig\'indisi juft, oraliqlar toq — standart pariteti', () => {
        for (const p of CODE128_PATTERNS) {
            const bars = Number(p[0]) + Number(p[2]) + Number(p[4]);
            expect(bars % 2).toBe(0);
        }
    });

    it('hamma naqsh har xil', () => {
        expect(new Set(CODE128_PATTERNS).size).toBe(CODE128_PATTERNS.length);
    });

    it('to\'xtash belgisi — 13 modul', () => {
        expect(CODE128_STOP).toBe('2331112');
        expect(sum(CODE128_STOP)).toBe(13);
    });

    it('standartdan ma\'lum naqshlar joyida', () => {
        expect(CODE128_PATTERNS[0]).toBe('212222');
        expect(CODE128_PATTERNS[99]).toBe('113141');
        expect(CODE128_PATTERNS[103]).toBe('211412');   // Start A
        expect(CODE128_PATTERNS[104]).toBe('211214');   // Start B
        expect(CODE128_PATTERNS[105]).toBe('211232');   // Start C
    });
});

describe('Code128-C kodlash', () => {
    it('faqat juft sonli raqam', () => {
        expect(isCode128CText('2611260014')).toBe(true);
        expect(isCode128CText('261126001')).toBe(false);
        expect(isCode128CText('26A1')).toBe(false);
        expect(() => code128CValues('123')).toThrow();
    });

    it('nazorat yig\'indisi: (105 + Σ qiymat × o\'rin) mod 103', () => {
        // 12 34 56: 105 + 12·1 + 34·2 + 56·3 = 353 → 353 mod 103 = 44
        expect(code128CValues('123456')).toEqual([105, 12, 34, 56, 44]);
    });

    it('10 xonali kod: start + 5 juft + nazorat + stop = 90 modul', () => {
        expect(code128CModules('2611260014')).toBe(11 + 5 * 11 + 11 + 13);
    });

    it('kengliklar bar bilan boshlanadi va bar bilan tugaydi (toq son)', () => {
        const w = code128CWidths('2611260014');
        expect(w.length % 2).toBe(1);
    });

    it('SVG: o\'lcham mm da, faqat chiziqlar chiziladi', () => {
        const svg = code128CSvg('2611260014', { moduleMm: 0.25, heightMm: 9 });
        expect(svg).toContain('height="9mm"');
        expect(svg).toContain('width="27.5mm"');   // (90 + 2·10 tinch zona) × 0.25
        const bars = (svg.match(/<rect /g) || []).length;
        expect(bars).toBe((code128CWidths('2611260014').length + 1) / 2);
    });
});
