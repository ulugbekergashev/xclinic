/* Qabuldagi ishlar — `utils/visitWork.ts`.
 *
 * Bu fayl ilgari `visitRoute.test.ts` edi va MARSHRUTNI tekshirardi:
 * «tartib: laboratoriya → diagnostika → shifokor». O'sha tartibni kod o'zi
 * o'ylab topgandi va u noto'g'ri edi — klinikadan klinikaga ham, bemordan
 * bemorga ham farq qiladi.
 *
 * Endi tartib faqat VAQTDAN chiqadi. Shu fayldagi eng muhim sinov ham
 * o'sha: shifokor avval ko'rib, keyin tahlilga yuborsa, ro'yxatda ham
 * shifokor birinchi turishi kerak.
 */
import { describe, it, expect } from 'vitest';
import { visitWork, workProgress, modalityOfName } from '../../utils/visitWork';

const visit = (over: any = {}): any => ({
    id: 'v1', status: 'AwaitingResults', doctorId: 'd1', doctorName: 'Rahimova N.',
    checkInTime: '2026-10-11T05:00:00Z',
    procedures: [{ procedureName: 'Terapevt konsultatsiyasi' }],
    labOrders: [], studies: [], ...over,
});
const lab = (status: string, ...names: string[]) => ({ status, items: names.map(testName => ({ testName })) });
const study = (status: string, name: string, modality = 'UZI') => ({ status, name, modality });

describe('visitWork — tartib vaqtdan chiqadi', () => {
    it('shifokor AVVAL ko\'rib, keyin tahlilga yuborgan — shifokor birinchi', () => {
        /* Aynan shu holat eski kodda noto'g'ri chiqardi: qoida
           «laboratoriya birinchi» deb turardi va tahlil shifokordan oldinga
           o'tib ketardi, garchi u keyin buyurilgan bo'lsa ham. */
        const v = visit({
            status: 'Completed',
            checkOutTime: '2026-10-11T06:00:00Z',
            labOrders: [{
                ...lab('Completed', 'UQT'),
                orderedAt: '2026-10-11T05:50:00Z',
                completedAt: '2026-10-11T07:30:00Z',
            }],
        });
        expect(visitWork(v).map(s => s.kind)).toEqual(['doctor', 'lab']);
    });

    it('tahlil avval topshirilgan — tahlil birinchi', () => {
        const v = visit({
            status: 'Completed',
            checkOutTime: '2026-10-11T09:00:00Z',
            labOrders: [{
                ...lab('Completed', 'UQT'),
                orderedAt: '2026-10-11T04:00:00Z',
                completedAt: '2026-10-11T06:30:00Z',
            }],
        });
        expect(visitWork(v).map(s => s.kind)).toEqual(['lab', 'doctor']);
    });

    it('bajarilgan → ketayotgan → ochiq; ochiqlar buyurilish vaqti bo\'yicha', () => {
        const v = visit({
            status: 'In Progress',
            startedAt: '2026-10-11T08:00:00Z',
            labOrders: [{ ...lab('Completed', 'UQT'), completedAt: '2026-10-11T06:00:00Z' }],
            studies: [
                { ...study('Ordered', 'EKG', 'EKG'), orderedAt: '2026-10-11T09:00:00Z' },
                { ...study('Ordered', 'Qorin UZI'), orderedAt: '2026-10-11T08:30:00Z' },
            ],
        });
        expect(visitWork(v).map(s => [s.kind, s.state])).toEqual([
            ['lab', 'done'],
            ['doctor', 'active'],
            ['study', 'open'],
            ['study', 'open'],
        ]);
        // Ochiqlar orasida: oldin buyurilgani oldinda
        expect(visitWork(v).filter(s => s.kind === 'study').map(s => s.services[0]))
            .toEqual(['Qorin UZI', 'EKG']);
    });

    it('vaqti yo\'q yozuv oxirida qoladi — oldinga surish yana taxmin bo\'lardi', () => {
        const v = visit({
            status: 'Waiting',
            labOrders: [{ ...lab('Ordered', 'UQT') }],
            studies: [{ ...study('Ordered', 'EKG', 'EKG'), orderedAt: '2026-10-11T07:00:00Z' }],
        });
        const open = visitWork(v).filter(s => s.state === 'open');
        /* Shifokor ham ochiq va uning vaqti eng erta (`checkInTime`), ya'ni u
           oldinda. Bu yerda tekshirilayotgani boshqa narsa: vaqti UMUMAN
           yo'q yozuv (laboratoriya) oxirida qoladi. */
        expect(open[open.length - 1].kind).toBe('lab');
        expect(open.map(s => s.kind)).toEqual(['doctor', 'study', 'lab']);
    });
});

describe('visitWork — ishlar ro\'yxati', () => {
    it('faqat shifokor — bitta ish, sanoq ko\'rsatilmaydi', () => {
        const v = visit();
        expect(visitWork(v).map(s => s.kind)).toEqual(['doctor']);
        expect(workProgress(v)).toBeNull();
    });

    it('bir nechta yo\'llanma — bitta laboratoriya qatori; hammasi tayyor bo\'lgachgina bajarilgan', () => {
        const v = visit({ labOrders: [lab('Completed', 'UQT'), lab('InProgress', 'Biokimyo')] });
        const items = visitWork(v);
        expect(items.filter(s => s.kind === 'lab')).toHaveLength(1);
        expect(items.find(s => s.kind === 'lab')!.state).not.toBe('done');
        v.labOrders[1].status = 'Completed';
        expect(visitWork(v).find(s => s.kind === 'lab')!.state).toBe('done');
    });

    it('bekor qilingan yo\'llanma va tekshiruv kirmaydi', () => {
        const v = visit({ labOrders: [lab('Cancelled', 'UQT')], studies: [study('Cancelled', 'UZI')] });
        expect(visitWork(v).map(s => s.kind)).toEqual(['doctor']);
    });

    it('KASSA ISH EMAS — ro\'yxatda hech qachon chiqmaydi', () => {
        /* Ilgari kassa to'langaniga qarab boshiga yoki oxiriga qo'yilardi:
           yana bir o'ylab topilgan qoida. Pul endi hisob blokida. */
        const v = visit({ status: 'Completed', labOrders: [lab('Completed', 'UQT')] });
        expect(visitWork(v).some(s => (s.kind as string) === 'cashier')).toBe(false);
    });

    it('xizmatlar qatorga tushadi', () => {
        const v = visit({ labOrders: [lab('Ordered', 'UQT', 'Biokimyo')] });
        const items = visitWork(v);
        expect(items.find(s => s.kind === 'lab')!.services).toEqual(['UQT', 'Biokimyo']);
        expect(items.find(s => s.kind === 'doctor')!.services).toEqual(['Terapevt konsultatsiyasi']);
    });
});

describe('visitWork — laboratoriya vaqti', () => {
    const order = (status: string, over: any = {}) => ({ ...lab(status, 'UQT'), ...over });

    it('bitta yo\'llanma tayyor, ikkinchisiga tegilmagan — «proba olindi» vaqti chiqmaydi', () => {
        /* Tayyor bo'lgan yo'llanmaning vaqti butun qatorniki qilib
           ko'rsatilsa, tegilmagan tahlil ham boshlangandek ko'rinardi. */
        const v = visit({
            status: 'AwaitingResults',
            labOrders: [
                order('Completed', { sampleCollectedAt: '2026-10-11T06:00:00Z', completedAt: '2026-10-11T06:58:00Z' }),
                order('Ordered'),
            ],
        });
        const labItem = visitWork(v).find(s => s.kind === 'lab')!;
        expect(labItem.state).toBe('active');
        expect(labItem.doneAt).toBeNull();
    });

    it('tayyor bo\'lmaganidan proba olingan bo\'lsa — o\'sha vaqt', () => {
        const v = visit({
            status: 'AwaitingResults',
            labOrders: [
                order('Completed', { completedAt: '2026-10-11T06:58:00Z' }),
                order('In-Progress', { sampleCollectedAt: '2026-10-11T07:10:00Z' }),
            ],
        });
        expect(visitWork(v).find(s => s.kind === 'lab')!.doneAt).toBe('2026-10-11T07:10:00Z');
    });

    it('hammasi tayyor — oxirgi natija vaqti', () => {
        const v = visit({
            status: 'AwaitingResults',
            labOrders: [
                order('Completed', { completedAt: '2026-10-11T06:58:00Z' }),
                order('Completed', { completedAt: '2026-10-11T07:40:00Z' }),
            ],
        });
        expect(visitWork(v).find(s => s.kind === 'lab')!.doneAt).toBe('2026-10-11T07:40:00Z');
    });
});

describe('workProgress — «2 / 3» (tartib haqida hech narsa demaydi)', () => {
    it('bajarilgan ishlar sanaladi; qabul yakunlangach hammasi', () => {
        const v = visit({ labOrders: [lab('Completed', 'UQT')], studies: [study('Ordered', 'Qorin UZI')] });
        expect(workProgress(v)).toEqual({ done: 1, total: 3 });
        v.studies[0].status = 'Completed';
        expect(workProgress(v)).toEqual({ done: 2, total: 3 });
        v.status = 'Completed';
        expect(workProgress(v)).toEqual({ done: 3, total: 3 });
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
        expect(modalityOfName('Денситометрия')).toBe('UZI');
    });
});
