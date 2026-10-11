/* Marshrut — qabuldan bekatlar ro'yxati (`utils/visitRoute.ts`).
 *
 * Qoida ekranning ichida emas, alohida faylda: «Yangi qabul» oynasi, talon va
 * xaritadagi «1/3» belgisi bir xil tartib va bir xil sanoqdan o'qiydi.
 */
import { describe, it, expect } from 'vitest';
import { routeOfVisit, routeProgress, modalityOfName, profileRoute } from '../../utils/visitRoute';

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

/* BEMOR KARTASIDAGI MARSHRUT — bekatning HOLATI bilan («o'tildi», «hozir»,
   «keyin») va kassa bekati bilan. Talon va xaritadagi tartib o'zgarmaydi. */
describe('profileRoute — kartadagi marshrut', () => {
    it('shifokor qabulida: tahlil o\'tilgan, shifokor «hozir», tekshiruv «keyin»', () => {
        const v = visit({
            status: 'In Progress',
            labOrders: [lab('Completed', 'UQT')],
            studies: [study('Ordered', 'EKG', 'EKG')],
        });
        const stops = profileRoute(v);
        expect(stops.map(s => [s.kind, s.state])).toEqual([
            ['lab', 'done'], ['study', 'next'], ['doctor', 'now'],
        ]);
    });

    it('navbatda: birinchi o\'tilmagan bekat «hozir»; hammasi tayyor bo\'lsa — shifokor', () => {
        const waiting = visit({ status: 'Waiting', labOrders: [lab('Ordered', 'UQT')] });
        expect(profileRoute(waiting).map(s => s.state)).toEqual(['now', 'next']);

        const ready = visit({ status: 'AwaitingResults', labOrders: [lab('Completed', 'UQT')] });
        expect(profileRoute(ready).map(s => s.state)).toEqual(['done', 'now']);
    });

    it('to\'langan kassa — birinchi va o\'tilgan; qarz bo\'lsa — oxirida', () => {
        const v = visit({ status: 'In Progress' });
        expect(profileRoute(v, { total: 100000, due: 0 }).map(s => [s.kind, s.state]))
            .toEqual([['cashier', 'done'], ['doctor', 'now']]);
        expect(profileRoute(v, { total: 100000, due: 40000 }).map(s => [s.kind, s.state]))
            .toEqual([['doctor', 'now'], ['cashier', 'next']]);
    });

    it('qabul yakunlangan, qarz qolgan — endi kassaga: kassa «hozir»', () => {
        const v = visit({ status: 'Completed' });
        const stops = profileRoute(v, { total: 100000, due: 100000 });
        expect(stops.map(s => [s.kind, s.state])).toEqual([['doctor', 'done'], ['cashier', 'now']]);
        expect(stops[1].due).toBe(100000);
    });

    it('hisob yo\'q — kassa bekati ham yo\'q; bekor qilingan qabulda «hozir» bo\'lmaydi', () => {
        expect(profileRoute(visit({ status: 'In Progress' }), { total: 0, due: 0 }).map(s => s.kind)).toEqual(['doctor']);
        const cancelled = visit({ status: 'Cancelled', labOrders: [lab('Ordered', 'UQT')] });
        expect(profileRoute(cancelled).some(s => s.state === 'now')).toBe(false);
    });

    it('bekat vaqti: natija tayyor bo\'lgan payt, qabul boshlangan payt', () => {
        const v = visit({
            status: 'In Progress', startedAt: '2026-10-11T08:20:00Z',
            labOrders: [{ ...lab('Completed', 'UQT'), completedAt: '2026-10-11T06:58:00Z' }],
        });
        const [labStop, doctor] = profileRoute(v);
        expect(labStop.at).toBe('2026-10-11T06:58:00Z');
        expect(doctor.at).toBe('2026-10-11T08:20:00Z');
    });
});

describe('profileRoute — laboratoriya bekatining vaqti', () => {
    const order = (status: string, over: any = {}) => ({ ...lab(status, 'UQT'), ...over });

    it('bitta yo\'llanma tayyor, ikkinchisiga tegilmagan — «proba olindi» vaqti chiqmaydi', () => {
        /* Tayyor bo'lgan yo'llanmaning vaqti butun bekatniki qilib ko'rsatilsa,
           tegilmagan tahlil ham boshlangandek ko'rinardi. */
        const v = visit({
            status: 'AwaitingResults',
            labOrders: [
                order('Completed', { sampleCollectedAt: '2026-10-11T06:00:00Z', completedAt: '2026-10-11T06:58:00Z' }),
                order('Ordered'),
            ],
        });
        const [labStop] = profileRoute(v);
        expect(labStop.state).toBe('now');
        expect(labStop.at).toBeNull();
    });

    it('tayyor bo\'lmaganidan proba olingan bo\'lsa — o\'sha vaqt', () => {
        const v = visit({
            status: 'AwaitingResults',
            labOrders: [
                order('Completed', { completedAt: '2026-10-11T06:58:00Z' }),
                order('In-Progress', { sampleCollectedAt: '2026-10-11T07:10:00Z' }),
            ],
        });
        expect(profileRoute(v)[0].at).toBe('2026-10-11T07:10:00Z');
    });

    it('hammasi tayyor — oxirgi natija vaqti', () => {
        const v = visit({
            status: 'AwaitingResults',
            labOrders: [
                order('Completed', { completedAt: '2026-10-11T06:58:00Z' }),
                order('Completed', { completedAt: '2026-10-11T07:40:00Z' }),
            ],
        });
        expect(profileRoute(v)[0].at).toBe('2026-10-11T07:40:00Z');
    });
});
