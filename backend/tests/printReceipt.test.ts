/* Kassa cheki (`utils/printReceipt.ts`).
 *
 * Chek — bemor qo'lida olib ketadigan qog'oz: undagi summa va nom xato
 * bo'lsa, buni ekranda hech kim ko'rmaydi. Shuning uchun HTML brauzersiz,
 * shu yerda tekshiriladi.
 */
import { describe, it, expect } from 'vitest';
import { buildReceiptHtml, mergeReceiptLines } from '../../utils/printReceipt';

const base = {
    title: "To'lov cheki",
    clinic: { name: 'DMC', phone: '+998 90 123 45 67', address: 'Toshkent' },
    meta: [{ label: 'Bemor', value: 'Karimov Aziz' }],
    lines: [{ name: 'Ukol (m/o)', quantity: 2, total: 40000 }],
    summary: [{ label: 'Jami', value: "40 000 so'm", strong: true }],
};

describe('buildReceiptHtml', () => {
    it('har qatorni nomi, miqdori va summasi bilan chiqaradi', () => {
        const html = buildReceiptHtml(base);

        expect(html).toContain('Ukol (m/o)');
        expect(html).toContain('×2');
        expect(html).toContain('40 000');
        expect(html).toContain('Karimov Aziz');
        expect(html).toContain('DMC');
    });

    it("miqdor 1 bo'lsa «×1» yozmaydi", () => {
        const html = buildReceiptHtml({ ...base, lines: [{ name: 'EKG', quantity: 1, total: 50000 }] });

        expect(html).not.toContain('×1');
    });

    it('yakuniy satrni qalin sinf bilan belgilaydi', () => {
        const html = buildReceiptHtml(base);

        expect(html).toMatch(/class="r b"><span>Jami<\/span>/);
    });

    it("foydalanuvchi kiritgan matnni HTML sifatida o'tkazmaydi", () => {
        const html = buildReceiptHtml({
            ...base,
            clinic: { name: '<b>Klinika</b>' },
            meta: [{ label: 'Bemor', value: '<script>alert(1)</script>' }],
            lines: [{ name: '<img src=x onerror=alert(1)>', total: 1000 }],
        });

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('<b>Klinika</b>');
        expect(html).toContain('&lt;script&gt;');
    });

    it("klinika ma'lumoti bo'lmasa ham yiqilmaydi", () => {
        const html = buildReceiptHtml({ ...base, clinic: null });

        expect(html).toContain('Ukol (m/o)');
        expect(html).not.toContain('undefined');
        expect(html).not.toContain('null');
    });
});

describe('mergeReceiptLines', () => {
    it("bir xil nomli qatorlarni bitta satrga yig'adi", () => {
        const merged = mergeReceiptLines([
            { name: 'Dorilar', quantity: 1, total: 30000 },
            { name: 'Muolaja', quantity: 1, total: 20000 },
            { name: 'Dorilar', quantity: 1, total: 45000 },
        ]);

        expect(merged).toEqual([
            { name: 'Dorilar', quantity: 2, total: 75000 },
            { name: 'Muolaja', quantity: 1, total: 20000 },
        ]);
    });

    it("yig'indi o'zgarmaydi", () => {
        const lines = [
            { name: 'A', total: 100 }, { name: 'B', quantity: 3, total: 300 }, { name: 'A', quantity: 2, total: 250 },
        ];
        const sum = (rows: { total: number }[]) => rows.reduce((s, r) => s + r.total, 0);

        expect(sum(mergeReceiptLines(lines))).toBe(sum(lines));
    });

    it("kirish massivini o'zgartirmaydi", () => {
        const lines = [{ name: 'A', quantity: 1, total: 100 }, { name: 'A', quantity: 1, total: 100 }];
        const snapshot = JSON.parse(JSON.stringify(lines));

        mergeReceiptLines(lines);

        expect(lines).toEqual(snapshot);
    });

    it("bo'sh ro'yxatda bo'sh ro'yxat qaytaradi", () => {
        expect(mergeReceiptLines([])).toEqual([]);
    });
});
