import { Visit, Modality } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   TASHRIF — MARSHRUT.

   Ko'p profilli klinikada bemor bitta kelishda bir necha joyga boradi: avval
   tahlil topshiradi, keyin UZI, oxirida shifokorga kiradi — natijalar bilan.
   Bazada bu allaqachon bitta narsa: qabul (`Visit`) va unga bog'langan
   yo'llanmalar (`LabOrder.visitId`, `DiagnosticStudy.visitId`); hisob
   qatorlari ham o'sha qabulga yoziladi — kassada bitta chek.

   Bu fayl shu bog'lanishdan BEKATLAR ro'yxatini yasaydi. Yangi jadval yoki
   maydon yo'q: marshrut saqlanmaydi, har safar hisoblanadi — shuning uchun
   shifokor kartadan yana bir tahlil qo'shsa, u ham marshrutga o'zi tushadi.

   TARTIB (registrator qo'ymaydi, qoida qo'yadi):
     1. laboratoriya — och qoringa topshiriladi, natijasi eng uzoq tayyorlanadi;
     2. diagnostika (UZI, EKG, rentgen …);
     3. shifokor — oxirida, natijalar bilan.
   ───────────────────────────────────────────────────────────────────────────── */

export interface RouteStop {
    kind: 'lab' | 'study' | 'doctor';
    /** Bekat ichidagi xizmatlar — «Umumiy qon tahlili · Biokimyo» */
    services: string[];
    /** Bu bekatdagi ish tugaganmi */
    done: boolean;
    /** Tekshiruv turi (faqat `study`) — bekat nomi shundan */
    modality?: Modality;
}

/** Qabulning bekatlari — yuqoridagi tartibda. Bekor qilingan yo'llanmalar kirmaydi. */
export function routeOfVisit(v: Visit): RouteStop[] {
    const stops: RouteStop[] = [];

    const orders = (v.labOrders || []).filter(o => o.status !== 'Cancelled');
    if (orders.length > 0) {
        stops.push({
            kind: 'lab',
            services: orders.flatMap(o => (o.items || []).map(i => i.testName)),
            done: orders.every(o => o.status === 'Completed'),
        });
    }

    for (const s of (v.studies || []).filter(x => x.status !== 'Cancelled')) {
        stops.push({ kind: 'study', services: [s.name], done: s.status === 'Completed', modality: s.modality });
    }

    if (v.doctorId || v.doctorName) {
        stops.push({
            kind: 'doctor',
            services: (v.procedures || []).map(p => p.procedureName).filter(Boolean),
            done: v.status === 'Completed',
        });
    }
    return stops;
}

/** «2 / 3» — nechta bekatdan nechtasi o'tildi. Bitta bekatli qabul marshrut emas: `null`. */
export function routeProgress(v: Visit): { done: number; total: number } | null {
    const stops = routeOfVisit(v);
    if (stops.length < 2) return null;
    return { done: stops.filter(s => s.done).length, total: stops.length };
}

/* ─── BEMOR KARTASIDAGI MARSHRUT ─────────────────────────────────────────────
   Talon va xaritaga «qayerga, qaysi tartibda» yetarli. Kartada esa shifokor
   va registrator bemor HOZIR qayerda ekanini ko'rishi kerak, shuning uchun
   har bekat holat bilan keladi va kassa ham bekat bo'ladi.

   KASSA O'RNI. To'langan bo'lsa — birinchi: pul odatda registraturada,
   xizmatdan oldin olinadi. Qarz bo'lsa — oxirida: bemor tashrif so'ngida
   kassaga boradi va shifokor qo'shgan yangi yo'llanma ham shu yerga tushadi. */

export type StopState = 'done' | 'now' | 'next';

export interface ProfileStop {
    kind: RouteStop['kind'] | 'cashier';
    state: StopState;
    services: string[];
    modality?: Modality;
    /** Bekatdagi oxirgi voqea vaqti (natija tayyor bo'ldi, qabul boshlandi) */
    at?: string | null;
    /** Faqat kassa: hisob jami va qolgan qarz */
    total?: number;
    due?: number;
}

const latest = (times: (string | null | undefined)[]): string | null =>
    times.filter((x): x is string => !!x).sort().pop() || null;

export function profileRoute(v: Visit, money?: { total: number; due: number }): ProfileStop[] {
    const closed = v.status === 'Completed' || v.status === 'Cancelled';
    const withDoctor = v.status === 'In Progress' || v.status === 'Called';
    const orders = (v.labOrders || []).filter(o => o.status !== 'Cancelled');
    const studies = (v.studies || []).filter(s => s.status !== 'Cancelled');
    let studyIndex = 0;

    /* Laboratoriya bekati bitta, yo'llanmalar esa bir nechta bo'lishi mumkin.
       Hammasi tayyor — oxirgi natija vaqti. Aks holda — hali tayyor
       BO'LMAGANLARIDAN olingan proba vaqti: tayyor bo'lgan yo'llanmaning
       vaqtini «proba olindi» deb ko'rsatsak, tegilmagan tahlil ham
       boshlangandek ko'rinardi. */
    const labAt = orders.every(o => o.status === 'Completed')
        ? latest(orders.map(o => o.completedAt))
        : latest(orders.filter(o => o.status !== 'Completed').map(o => o.sampleCollectedAt));

    const stops: ProfileStop[] = routeOfVisit(v).map(s => {
        const at = s.kind === 'lab' ? labAt
            : s.kind === 'study' ? (studies[studyIndex++]?.performedAt || null)
                : (v.startedAt || v.calledAt || null);
        return { kind: s.kind, state: s.done ? 'done' : 'next', services: s.services, modality: s.modality, at };
    });

    /* «Hozir» — bitta bekat. Shifokor chaqirgan yoki qabul qilayotgan bo'lsa
       shifokor; aks holda bemor yurishi kerak bo'lgan birinchi bekat. */
    if (!closed) {
        const current = withDoctor
            ? stops.find(s => s.kind === 'doctor')
            : stops.find(s => s.state !== 'done');
        if (current) current.state = 'now';
    }

    if (!money || money.total <= 0) return stops;
    if (money.due <= 0) {
        return [{ kind: 'cashier', state: 'done', services: [], total: money.total, due: 0 }, ...stops];
    }
    const nothingElseLeft = !stops.some(s => s.state === 'now');
    return [...stops, {
        kind: 'cashier', state: nothingElseLeft && v.status !== 'Cancelled' ? 'now' : 'next',
        services: [], total: money.total, due: money.due,
    }];
}

/* Prayslistdagi diagnostika xizmatida TUR (UZI, EKG …) yo'q — faqat nom.
   Tekshiruv yozuvida esa tur majburiy (`DiagnosticStudy.modality`): diagnost
   ro'yxatni shu bo'yicha saralaydi. Kartada shifokor turni qo'lda tanlaydi;
   registraturada bunga vaqt yo'q — tur nomdan aniqlanadi. Topilmasa — UZI
   (eng ko'p uchraydigani); diagnost uni o'z ekranida tuzata oladi. */
export function modalityOfName(name: string): Modality {
    const s = name.toLowerCase();
    if (/ekg|экг|elektrokardio|электрокардио|xolter|холтер/.test(s)) return 'EKG';
    if (/rentgen|рентген|flyuoro|флюоро|opg|mammogra|маммогра/.test(s)) return 'RENTGEN';
    if (/endoskop|эндоскоп|gastroskop|гастроскоп|kolonoskop|колоноскоп|fgds|фгдс/.test(s)) return 'ENDOSKOPIYA';
    if (/(^|[^a-zа-я])(mrt|мрт)([^a-zа-я]|$)|magnit|магнит/.test(s)) return 'MRT';
    if (/(^|[^a-zа-я])(kt|кт|mskt|мскт)([^a-zа-я]|$)|tomogra|томогра/.test(s)) return 'KT';
    return 'UZI';
}
