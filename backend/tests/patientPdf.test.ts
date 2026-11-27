/* Bemorga ketadigan PDF (2026-11-26): nima tushadi, nima TUSHMAYDI. */
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { prescriptionModel, labResultModel, renderPrescriptionPdf, renderLabResultPdf, fmtDateTime } from '../patientPdf';

const patient = { firstName: 'Aziz', lastName: 'Karimov', dob: '1988-04-12', gender: 'Male', cardNumber: 1042, phone: '+998901234567' };

describe('prescriptionModel', () => {
    it('allergiya ogohlantirishini o\'tkazish qaydi bemorga ketmaydi, qolgan izoh qoladi', () => {
        const m = prescriptionModel({
            date: '2026-11-26', patient,
            notes: "Ko'p suyuqlik iching.\nAllergiya ogohlantirishi o'tkazildi: Amoksitsillin ↔ penitsillin (sinalgan)",
            items: [{ name: 'Amoksitsillin', dosage: '500 mg', frequency: 'kuniga 3 mahal', mealTiming: 'after', durationDays: 7 }],
        });
        expect(m.notes).toBe("Ko'p suyuqlik iching.");
        expect(JSON.stringify(m)).not.toContain('Allergiya ogohlantirishi');
        expect(m.items[0].regimen).toBe('500 mg · kuniga 3 mahal · ovqatdan keyin · 7 kun');
    });

    it('faqat qayd bo\'lsa — izoh bloki umuman yo\'q', () => {
        const m = prescriptionModel({ date: '2026-11-26', patient, items: [], notes: "Allergiya ogohlantirishi o'tkazildi: X ↔ Y" });
        expect(m.notes).toBeNull();
    });

    it('bemor telefoni varaqqa tushmaydi', () => {
        const m = prescriptionModel({ date: '2026-11-26', patient, items: [] });
        expect(JSON.stringify(m)).not.toContain('998901234567');
        expect(m.patient.map(r => r[0])).toEqual(['Bemor', "Tug'ilgan sana", 'Jinsi', 'Karta raqami']);
    });
});

describe('labResultModel', () => {
    const order = {
        id: 'abcdef12-0000', orderedAt: '2026-11-26T05:00:00Z', completedAt: '2026-11-26T09:40:00Z',
        doctorName: 'Dr. Aliyev', clinicianNotes: 'ICHKI: bemor shubhali', patient,
        items: [{ testName: 'Umumiy qon tahlili', parameters: [
            { name: 'Gemoglobin', value: '100', unit: 'g/L', refLow: 120, refHigh: 160, flag: 'Low' },
            { name: 'Leykotsit', value: '', unit: '10^9/L', refLow: 4, refHigh: 9 },
            { name: 'Guruh', value: 'II', refText: '—' },
        ] }],
    };

    it('qiymatsiz ko\'rsatkich tushmaydi, bayroq va norma to\'g\'ri', () => {
        const m = labResultModel(order);
        expect(m.groups[0].rows.map(r => r.name)).toEqual(['Gemoglobin', 'Guruh']);
        expect(m.groups[0].rows[0]).toMatchObject({ flag: 'Low', ref: '120 – 160' });
        expect(m.hasAnyValue).toBe(true);
        expect(m.number).toBe('ABCDEF12');
    });

    it('shifokorning laboratoriyaga izohi bemorga ketmaydi', () => {
        expect(JSON.stringify(labResultModel(order))).not.toContain('ICHKI');
    });

    it('vaqt Toshkent bo\'yicha', () => {
        expect(fmtDateTime('2026-11-26T09:40:00Z')).toBe('26.11.2026 14:40');
    });

    it('hech qiymat yo\'q — hasAnyValue=false', () => {
        expect(labResultModel({ items: [{ testName: 'X', parameters: [{ name: 'a', value: ' ' }] }] }).hasAnyValue).toBe(false);
    });
});

describe('PDF yasash', () => {
    const fontOk = process.platform === 'win32';

    it.runIf(fontOk)('retsept — haqiqiy PDF, kirill/oʻ va emoji yiqitmaydi', async () => {
        const bytes = await renderPrescriptionPdf({
            date: '2026-11-26', doctorName: 'Gʻulomova Oʻ.', patient,
            items: [{ name: 'Амброксол 30 мг', instructions: 'Iliq suv bilan 😀' }],
        }, { name: 'DMC Klinika', phone: '+998 71 200 00 00' });
        expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
        expect(bytes.length).toBeLessThan(200_000);   // shrift qisqartirilgan (subset)
    });

    it.runIf(fontOk)('uzun natija bir necha sahifaga bo\'linadi', async () => {
        const params = Array.from({ length: 80 }, (_, i) => ({ name: `P${i}`, value: String(i), unit: 'u', refLow: 1, refHigh: 2 }));
        const bytes = await renderLabResultPdf({ id: 'x', items: [{ testName: 'T', parameters: params }], patient }, { name: 'K' });
        const doc = await PDFDocument.load(bytes);
        expect(doc.getPageCount()).toBeGreaterThan(1);
    });
});
