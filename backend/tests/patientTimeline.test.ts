/* Bemor kartasidagi «Tarix» lentasi (`utils/patientTimeline.ts`).
 *
 * Ilgari tarix o'n bitta alohida ro'yxat edi: qabullar bir joyda, tahlillar
 * boshqa joyda, tekshiruvlar uchinchisida. Lenta ularni bitta vaqt o'qiga
 * teradi — qoida ekranda emas, shu faylda.
 */
import { describe, it, expect } from 'vitest';
import { buildTimeline, filterTimeline, dayOf } from '../../utils/patientTimeline';

const visit = (over: any = {}): any => ({
    id: 'v1', date: '2026-09-12', checkInTime: '2026-09-12T05:10:00Z', status: 'Completed',
    labOrders: [], studies: [], ...over,
});
const lab = (over: any = {}): any => ({ id: 'l1', status: 'Ordered', orderedAt: '2026-09-12T05:15:00Z', ...over });

describe('buildTimeline', () => {
    it('qabul, uning tahlili va tekshiruvi — alohida yozuvlar, eng yangisi tepada', () => {
        const entries = buildTimeline({
            visits: [visit({
                labOrders: [lab({ status: 'Completed', completedAt: '2026-09-12T06:40:00Z' })],
                studies: [{ id: 's1', status: 'Completed', orderedAt: '2026-09-12T05:20:00Z', performedAt: '2026-09-12T05:50:00Z' }],
            })],
        });
        expect(entries.map(e => e.id)).toEqual(['lab-l1', 'study-s1', 'visit-v1']);
    });

    it("bekor qilingan qabul lentada qoladi, bekor qilingan yo'llanma — yo'q", () => {
        const entries = buildTimeline({
            visits: [
                visit({ id: 'v2', status: 'Cancelled', checkInTime: '2026-09-11T05:00:00Z' }),
                visit({ labOrders: [lab({ status: 'Cancelled' })] }),
            ],
        });
        expect(entries.map(e => e.id)).toEqual(['visit-v1', 'visit-v2']);
    });

    it('statsionar yotish — yotgan kunida', () => {
        const entries = buildTimeline({
            visits: [visit()],
            admissions: [{ id: 'a1', admittedAt: '2026-05-15T04:00:00Z', dischargedAt: '2026-05-20T07:00:00Z' }],
        });
        expect(entries.map(e => e.kind)).toEqual(['visit', 'stay']);
    });

    it("hali bajarilmagan yo'llanma buyurilgan vaqtida turadi", () => {
        const [entry] = buildTimeline({ visits: [visit({ labOrders: [lab()] })] });
        expect(entry.at).toBe('2026-09-12T05:15:00Z');
    });

    it("bir xil yozuv ikki marta kelsa (ro'yxat birlashtirilgan) — bitta qoladi", () => {
        expect(buildTimeline({ visits: [visit(), visit()] })).toHaveLength(1);
    });

    it('bir vaqtdagi yozuvlar: avval qabul, keyin uning yo\'llanmalari', () => {
        const at = '2026-09-12T05:10:00Z';
        const entries = buildTimeline({
            visits: [visit({
                labOrders: [lab({ orderedAt: at })],
                studies: [{ id: 's1', status: 'Ordered', orderedAt: at }],
            })],
        });
        expect(entries.map(e => e.kind)).toEqual(['visit', 'lab', 'study']);
    });

    it("qabulga bog'lanmagan tahlil va tekshiruv ham lentada", () => {
        const entries = buildTimeline({
            visits: [visit()],
            looseLabs: [lab({ id: 'l9', status: 'Completed', completedAt: '2026-08-01T06:00:00Z' })],
            looseStudies: [{ id: 's9', status: 'Completed', orderedAt: '2026-07-01T06:00:00Z', performedAt: '2026-07-01T07:00:00Z' } as any],
        });
        expect(entries.map(e => e.id)).toEqual(['visit-v1', 'lab-l9', 'study-s9']);
    });

    it("bog'lanmagan ro'yxatdagi yo'llanma qabul ichida ham kelsa — bitta, qabuldagi nusxasi", () => {
        const full = lab({ status: 'Completed', completedAt: '2026-09-12T06:40:00Z', items: [{ testName: 'UQT' }] });
        const entries = buildTimeline({
            visits: [visit({ labOrders: [full] })],
            looseLabs: [lab({ status: 'Completed', completedAt: '2026-09-12T06:40:00Z' })],
        });
        const labs = entries.filter(e => e.kind === 'lab');
        expect(labs).toHaveLength(1);
        expect((labs[0] as any).order.items).toHaveLength(1);
    });
});

describe('filterTimeline', () => {
    const entries = buildTimeline({
        visits: [visit({ labOrders: [lab()] })],
        admissions: [{ id: 'a1', admittedAt: '2026-05-15T04:00:00Z' }],
    });

    it("«hammasi» — o'zgarishsiz", () => {
        expect(filterTimeline(entries, 'all')).toHaveLength(3);
    });

    it('«qabul» — ambulator qabul ham, statsionar ham', () => {
        expect(filterTimeline(entries, 'visit').map(e => e.kind)).toEqual(['visit', 'stay']);
    });

    it("«tahlil», «tekshiruv» — faqat o'z turi", () => {
        expect(filterTimeline(entries, 'lab').map(e => e.id)).toEqual(['lab-l1']);
        expect(filterTimeline(entries, 'study')).toEqual([]);
    });
});

describe('dayOf — klinikadagi (mahalliy) kun', () => {
    it("sof sana o'zgarishsiz qaytadi", () => {
        expect(dayOf('2026-09-12')).toBe('2026-09-12');
    });

    it('sana-vaqtdan mahalliy kunni oladi — UTC dagi kunni emas', () => {
        /* Mahalliy 01:30 — UTC da hali kechagi kun bo'lishi mumkin (Toshkent,
           UTC+5). Satrning boshini kesib olsak kechagi sana chiqardi. */
        const afterMidnight = new Date(2026, 8, 12, 1, 30).toISOString();
        expect(dayOf(afterMidnight)).toBe('2026-09-12');
        const beforeMidnight = new Date(2026, 8, 12, 23, 30).toISOString();
        expect(dayOf(beforeMidnight)).toBe('2026-09-12');
    });

    it("buzuq qiymat sinovni yiqitmaydi", () => {
        expect(dayOf('2026-09-12Txx')).toBe('2026-09-12');
    });
});
