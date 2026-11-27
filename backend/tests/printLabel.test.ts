/* Probirka yorlig'i (`utils/printLabel.ts`) va laboratoriya varag'idagi
 * tasdiq belgisi. Yorliq qog'ozga chiqadi — xato ism yoki noto'g'ri o'lcham
 * ekranda ko'rinmaydi, shuning uchun HTML shu yerda tekshiriladi.
 */
import { describe, it, expect } from 'vitest';
import { buildLabelHtml, moduleFor } from '../../utils/printLabel';
import { labResultModel } from '../patientPdf';

const data = {
    code: '2611260014',
    patientName: 'Karimov <Aziz>',
    dob: '1985-03-04',
    gender: 'Male',
    at: '2026-11-26T05:30:00Z',
    groups: [
        { sample: 'Qon', tests: ['UAK', 'Glyukoza'] },
        { sample: 'Siydik', tests: ['OAM'] },
    ],
};

describe('buildLabelHtml', () => {
    it('har namuna turiga bitta yorliq, kod va shtrix-kod har birida', () => {
        const html = buildLabelHtml(data, '40x30');
        expect((html.match(/class="lbl"/g) || []).length).toBe(2);
        expect((html.match(/<svg /g) || []).length).toBe(2);
        expect((html.match(/2611260014/g) || []).length).toBeGreaterThanOrEqual(2);
        expect(html).toContain('Qon');
        expect(html).toContain('UAK, Glyukoza');
        expect(html).toContain('Siydik');
    });

    it('ism HTML sifatida tushmaydi; tug\'ilgan sana — ikkinchi identifikator', () => {
        const html = buildLabelHtml(data, '40x30');
        expect(html).toContain('Karimov &lt;Aziz&gt;');
        expect(html).not.toContain('<Aziz>');
        expect(html).toContain('04.03.1985');
    });

    it('sahifa o\'lchami yorliqniki, chekkasiz', () => {
        expect(buildLabelHtml(data, '40x30')).toContain('@page { size: 40mm 30mm; margin: 0; }');
        expect(buildLabelHtml(data, '58x40')).toContain('@page { size: 58mm 40mm; margin: 0; }');
        expect(buildLabelHtml(data, 'tape80')).toContain('@page { size: 80mm auto; margin: 0; }');
    });

    it('chiziq 0.25 mm dan ingichka emas va yorliqqa sig\'adi', () => {
        expect(moduleFor(40, 1.5, 90)).toBeGreaterThanOrEqual(0.25);
        expect(moduleFor(40, 1.5, 90) * 110).toBeLessThanOrEqual(37);
        expect(moduleFor(20, 1.5, 90)).toBe(0.25);   // sig'masa ham 0.25 dan ingichka bo'lmaydi
        expect(moduleFor(80, 2, 90)).toBe(0.375);
        expect(moduleFor(40, 1.5, 90)).toBe(0.25);   // 0.336 → butun nuqta (2 × 0.125)
    });

    it('raqam bo\'lmagan kod — shtrix-kod chizilmaydi, matn qoladi', () => {
        const html = buildLabelHtml({ ...data, code: 'ABC' }, '40x30');
        expect(html).not.toContain('<svg ');
        expect(html).toContain('ABC');
    });
});

describe('tahlil varag\'i: kod va tasdiq', () => {
    it('buyurtma raqami — probirka kodi; tasdiqlagan ism va vaqt', () => {
        const m = labResultModel({
            id: 'abcdef12-3456', sampleCode: '2611260014', items: [],
            verifiedAt: '2026-11-26T06:00:00Z', verifiedByName: 'Mudira Olima',
        });
        expect(m.number).toBe('2611260014');
        expect(m.verifiedBy).toContain('Mudira Olima');
        expect(m.verifiedBy).toContain('26.11.2026');
    });

    it('tasdiq yo\'q — qator yo\'q; kod yo\'q — id boshi', () => {
        const m = labResultModel({ id: 'abcdef12-3456', items: [] });
        expect(m.number).toBe('ABCDEF12');
        expect(m.verifiedBy).toBeNull();
    });
});
