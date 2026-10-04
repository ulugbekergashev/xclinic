/* Marshrut — qabuldan bekatlar ro'yxati (`utils/visitRoute.ts`).
 *
 * Qoida ekranning ichida emas, alohida faylda: «Yangi qabul» oynasi, talon va
 * xaritadagi «1/3» belgisi bir xil tartib va bir xil sanoqdan o'qiydi.
 */
import { describe, it, expect } from 'vitest';
import { routeOfVisit, routeProgress, modalityOfName } from '../../utils/visitRoute';

const visit = (over: any = {}): any => ({
    id: 'v1', status: 'AwaitingResults', doctorId: 'd1', doctorName: 'Rahimova N.',
    procedures: [{ procedureName: 'Terapevt konsultatsiyasi' }],
    labOrders: [], studies: [], ...over,
});
const lab = (status: string, ...names: string[]) => ({ status, items: names.map(testName => ({ testName })) });
const study = (status: string, name: string, modality = 'UZI') => ({ status, name, modality });

describe('routeOfVisit — bekatlar', () => {
    it('faqat shifokor — bitta bekat, marshrut emas', () => {
        const v = visit();
        expect(routeOfVisit(v).map(s => s.kind)).toEqual(['doctor']);
        expect(routeProgress(v)).toBeNull();
    });

    it('tartib: laboratoriya → diagnostika → shifokor', () => {
        const v = visit({
            studies: [study('Ordered', 'Qorin UZI'), study('Ordered', 'EKG', 'EKG')],
            labOrders: [lab('Ordered', 'UQT', 'Biokimyo')],
        });
        const stops = routeOfVisit(v);
        expect(stops.map(s => s.kind)).toEqual(['lab', 'study', 'study', 'doctor']);
        expect(stops[0].services).toEqual(['UQT', 'Biokimyo']);
        expect(stops[3].services).toEqual(['Terapevt konsultatsiyasi']);
    });

    it('bir nechta yo\'llanma — bitta laboratoriya bekati; hammasi tayyor bo\'lgachgina o\'tilgan', () => {
        const v = visit({ labOrders: [lab('Completed', 'UQT'), lab('InProgress', 'Biokimyo')] });
        const stops = routeOfVisit(v);
        expect(stops.filter(s => s.kind === 'lab')).toHaveLength(1);
        expect(stops[0].done).toBe(false);
        v.labOrders[1].status = 'Completed';
        expect(routeOfVisit(v)[0].done).toBe(true);
    });

    it('bekor qilingan yo\'llanma va tekshiruv marshrutga kirmaydi', () => {
        const v = visit({ labOrders: [lab('Cancelled', 'UQT')], studies: [study('Cancelled', 'UZI')] });
        expect(routeOfVisit(v).map(s => s.kind)).toEqual(['doctor']);
    });
});

describe('routeProgress — «2 / 3»', () => {
    it('o\'tilgan bekatlar sanaladi; qabul yakunlangach hammasi', () => {
        const v = visit({ labOrders: [lab('Completed', 'UQT')], studies: [study('Ordered', 'Qorin UZI')] });
        expect(routeProgress(v)).toEqual({ done: 1, total: 3 });
        v.studies[0].status = 'Completed';
        expect(routeProgress(v)).toEqual({ done: 2, total: 3 });
        v.status = 'Completed';
        expect(routeProgress(v)).toEqual({ done: 3, total: 3 });
    });
});

describe('modalityOfName — tur nomdan', () => {
    it('tanish nomlar', () => {
        expect(modalityOfName("Qorin bo'shlig'i UZI")).toBe('UZI');
        expect(modalityOfName('EKG')).toBe('EKG');
        expect(modalityOfName('Panoramik rentgen (OPG)')).toBe('RENTGEN');
        expect(modalityOfName('Gastroskopiya')).toBe('ENDOSKOPIYA');
        expect(modalityOfName('Bosh miya MRT')).toBe('MRT');
        expect(modalityOfName('3D konus-nurli tomografiya')).toBe('KT');
        expect(modalityOfName('ЭКГ с расшифровкой')).toBe('EKG');
    });

    it('«kt» so\'z ichida bo\'lsa — KT emas', () => {
        expect(modalityOfName('Doktor konsultatsiyasi')).toBe('UZI');
    });

    it('tanilmagan nom — UZI (diagnost o\'z ekranida tuzatadi)', () => {
        expect(modalityOfName('Denситометрия')).toBe('UZI');
    });
});
