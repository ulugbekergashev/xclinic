/* A4 qog'ozlar: oldindan bosilgan blanka chekkalari, A4 to'lov varag'i,
 * oylik varaqasi (2026-11-26).
 *
 * Bularning hammasi qog'ozga chiqadi — xato summa yoki ustma-ust tushgan
 * shapkani ekranda hech kim ko'rmaydi. Shuning uchun HTML shu yerda,
 * brauzersiz tekshiriladi.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    layoutFor, pageCss, clinicHeader, setPrintClinic, DEFAULT_LAYOUT,
} from '../../utils/printDocument';
import { buildReceiptA4Body } from '../../utils/printReceipt';
import { salarySlipBody } from '../../utils/printForms';

afterEach(() => setPrintClinic(null));

/** Qog'ozdagi ko'rinish: minglik ajratkich — bo'linmas bo'shliq, apostrof — &#39; */
const plain = (html: string) => html.replace(/ /g, ' ').replace(/&#39;/g, "'");
const a4Body = (...a: Parameters<typeof buildReceiptA4Body>) => plain(buildReceiptA4Body(...a));
const slip = (...a: Parameters<typeof salarySlipBody>) => plain(salarySlipBody(...a));

describe('layoutFor / pageCss', () => {
    it('sozlama yo\'q — avvalgi chekkalar (14/12/14 mm), shapka chiqadi', () => {
        expect(layoutFor(null)).toEqual(DEFAULT_LAYOUT);
        expect(pageCss(layoutFor({}))).toBe('@page { size: A4; margin: 14mm 14mm 12mm 14mm; }');
    });

    it('klinika bergan chekkalar @page ga tushadi', () => {
        const css = pageCss(layoutFor({ printTopMm: 55, printBottomMm: 30, printSideMm: 20 }));
        expect(css).toBe('@page { size: A4; margin: 55mm 20mm 30mm 20mm; }');
    });

    it('chegaradan tashqari va noto\'g\'ri qiymat chekkani buzmaydi', () => {
        const l = layoutFor({ printTopMm: 500, printBottomMm: -5, printSideMm: Number.NaN });
        expect(l.topMm).toBe(80);
        expect(l.bottomMm).toBe(0);
        expect(l.sideMm).toBe(DEFAULT_LAYOUT.sideMm);
    });

    it('«shapka oldindan bosilgan» — dastur shapkasi chiqmaydi', () => {
        setPrintClinic({ name: 'DMC', printHideHeader: true });
        expect(clinicHeader({ name: 'DMC' })).toBe('');

        setPrintClinic({ name: 'DMC', printHideHeader: false });
        expect(clinicHeader({ name: 'DMC' })).toContain('DMC');
    });

    it('sozlama JORIY klinikadan o\'qiladi — serverdan kelgan rx.clinic dan emas', () => {
        setPrintClinic({ name: 'DMC', printHideHeader: true });
        // Chaqiruvchi bergan obyektda bayroq yo'q — baribir shapka chiqmasligi kerak
        expect(clinicHeader({ name: 'Boshqa nom', phone: '1' })).toBe('');
    });

    it('namuna uchun tashqaridan berilgan chekka saqlangan sozlamadan ustun', () => {
        setPrintClinic({ name: 'DMC', printHideHeader: true });
        expect(clinicHeader({ name: 'DMC' }, layoutFor({ printHideHeader: false }))).toContain('DMC');
    });
});

const receipt = {
    title: "To'lov cheki",
    clinic: { name: 'DMC', phone: '+998 90 123 45 67' },
    meta: [{ label: 'Bemor', value: 'Karimov <Aziz>' }, { label: 'Chek raqami', value: '#12' }],
    lines: [
        { name: 'Konsultatsiya', quantity: 1, total: 150000 },
        { name: 'Ukol (m/o)', quantity: 3, total: 60000 },
    ],
    summary: [
        { label: 'Jami', value: "210 000 so'm", strong: true },
        { label: "To'lov usuli", value: 'Naqd' },
    ],
    footer: 'Rahmat',
};

describe('buildReceiptA4Body', () => {
    it('chekdagi qator, miqdor va summalarning HAMMASI A4 jadvalda bor', () => {
        const html = a4Body(receipt);
        expect(html).toContain('Konsultatsiya');
        expect(html).toContain('150 000');
        expect(html).toContain('Ukol (m/o)');
        expect(html).toMatch(/<td class="num">3<\/td>/);
        expect(html).toContain("210 000 so'm");
        expect(html).toContain('#12');
    });

    it('foydalanuvchi matni HTML sifatida tushmaydi', () => {
        const html = a4Body(receipt);
        expect(html).toContain('Karimov &lt;Aziz&gt;');
        expect(html).not.toContain('<Aziz>');
    });

    it('imzo va muhr joyi bor; yorliqlar tarjimadan keladi', () => {
        const html = a4Body(receipt, { cashier: 'Кассир', payer: 'Плательщик', stamp: 'М.П.', name: 'Наименование' });
        expect(html).toContain('Кассир');
        expect(html).toContain('Плательщик');
        expect(html).toContain('М.П.');
        expect(html).toContain('Наименование');
    });
});

const doctorMonth = {
    base: 900000, bonus: 100000, penalty: 50000, due: 950000,
    adjustments: [
        { id: 'a1', type: 'Bonus', reason: 'Tungi navbatchilik', amount: 100000 },
        { id: 'a2', type: 'Penalty', reason: 'Kechikish', amount: 50000 },
    ],
    share: {
        accrued: 900000, paidViaRuns: 0, payable: 900000,
        items: [{ name: 'UZI', paid: 300000, percent: 30, basis: 'paid', share: 90000 }],
    },
    payment: null,
    attendance: { present: 20, absent: 1, excused: 0, late: 2 },
};

describe('salarySlipBody', () => {
    it('asosiy, bonus, jarima va to\'lanishi kerak summa varaqda bor', () => {
        const html = slip({ periodLabel: 'Noyabr 2026', staffName: 'Aliyev Vali', isDoctor: true, month: doctorMonth });
        expect(html).toContain('Oylik varaqasi');
        expect(html).toContain('Aliyev Vali');
        expect(html).toContain('Noyabr 2026');
        expect(html).toContain('900 000');
        expect(html).toContain('Tungi navbatchilik');
        expect(html).toContain('+100 000');
        expect(html).toContain('Kechikish');
        expect(html).toContain('950 000');
        expect(html).toContain("Hali to'lanmagan");
        expect(html).toContain('Xodim imzosi');
    });

    it('shifokorda ulush jadvali: xizmat, foiz va ulush', () => {
        const html = slip({ periodLabel: 'Noyabr 2026', staffName: 'X', isDoctor: true, month: doctorMonth });
        expect(html).toContain('Ulush hisobi');
        expect(html).toContain('UZI');
        expect(html).toContain('30%');
        expect(html).toContain('90 000');
    });

    it('shifokor bo\'lmasa ulush jadvali chiqmaydi; to\'langan bo\'lsa sanasi va kassiri yoziladi', () => {
        const html = slip({
            periodLabel: 'Noyabr 2026', staffName: 'Registrator', isDoctor: false,
            month: { ...doctorMonth, payment: { amount: 950000, paidAt: '2026-11-30T10:00:00Z', paidByName: 'Kassir Ona' } },
        });
        expect(html).not.toContain('Ulush hisobi');
        expect(html).toContain('Asosiy oylik');
        expect(html).toContain("To'landi (30.11.2026)");
        expect(html).toContain('Kassir — Kassir Ona');
        expect(html).not.toContain("Hali to'lanmagan");
    });

    it('eski vedomost orqali to\'langan summa zanjirda bir marta ayiriladi', () => {
        const html = slip({
            periodLabel: 'N', staffName: 'X', isDoctor: true,
            month: {
                ...doctorMonth, base: 700000, bonus: 0, penalty: 0, due: 700000, adjustments: [],
                share: { accrued: 1000000, paidViaRuns: 300000, payable: 700000, items: [] },
            },
        });
        expect(html).toContain('Hisoblangan ulush va oylik');
        expect(html).toContain('1 000 000');
        expect(html).toContain('−300 000');
        expect(html).toContain('700 000');
        expect(html).not.toContain('ayirildi');
    });

    it('fix maoshli shifokorda faqat «Fix maosh» qatori chiqadi', () => {
        const html = slip({
            periodLabel: 'N', staffName: 'X', isDoctor: true,
            month: {
                ...doctorMonth,
                staff: { salaryType: 'fixed' },
                share: {
                    accrued: 3000000, paidViaRuns: 0, payable: 3000000,
                    items: [
                        { name: 'UZI', paid: 300000, percent: 30, share: 90000 },
                        { name: 'Fix maosh (100% davr)', paid: 0, percent: 0, share: 3000000, kind: 'Fixed' },
                    ],
                },
            },
        });
        expect(html).toContain('Fix maosh (100% davr)');
        expect(html).not.toContain('UZI');
    });

    it('300 dan ortiq xizmat — qolgani «yana N ta» qatorida, summasi bilan', () => {
        const many = Array.from({ length: 305 }, (_, i) => ({ name: `X${i}`, paid: 1000, percent: 10, share: 100 }));
        const html = slip({
            periodLabel: 'N', staffName: 'X', isDoctor: true,
            month: { ...doctorMonth, share: { accrued: 30500, paidViaRuns: 0, payable: 30500, items: many } },
        });
        expect(html).toContain('yana 5 ta xizmat');
        expect(html).toContain('>500<');
        expect(html).not.toContain('X300');
    });

    it('sabab matni HTML sifatida tushmaydi', () => {
        const html = slip({
            periodLabel: 'N', staffName: 'X', isDoctor: false,
            month: { ...doctorMonth, adjustments: [{ type: 'Bonus', reason: '<script>x</script>', amount: 1 }] },
        });
        expect(html).not.toContain('<script>');
    });
});
