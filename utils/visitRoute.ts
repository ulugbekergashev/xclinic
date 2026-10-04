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
