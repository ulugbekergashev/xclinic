import { Visit, Modality } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   TASHRIF — FAKTLAR, MARSHRUT EMAS.

   Bu fayl ilgari `visitRoute.ts` edi va qabuldan BEKATLAR ro'yxatini yasardi.
   Tartibni esa koddagi qoida qo'yardi:

       1. laboratoriya — och qoringa topshiriladi;
       2. diagnostika (UZI, EKG, rentgen …);
       3. shifokor — oxirida, natijalar bilan.

   va kassa to'langaniga qarab boshiga yoki oxiriga qo'yilardi.

   O'SHA QOIDA NOTO'G'RI EDI. Bemorning yo'li klinikadan klinikaga ham,
   bemordan bemorga ham farq qiladi:

     · diagnostika markazida shifokor qabuli umuman bo'lmaydi;
     · ko'p profilli klinikada shifokor AVVAL ko'radi, keyin tahlilga
       yuboradi — ya'ni laboratoriya birinchi emas, oxirgi bekat;
     · yakka kabinetda bitta bekatning o'zi;
     · ba'zi klinikada avval to'lanadi, ba'zisida xizmatdan keyin.

   Tizim esa o'ylab topilgan ketma-ketlikni haqiqat qilib ko'rsatardi, va
   registratura bemor qo'liga o'sha tartibdagi talonni chiqarardi.

   ENG ACHINARLISI: haqiqiy vaqtlar qo'l ostida turardi — `orderedAt`,
   `sampleCollectedAt`, `completedAt`, `performedAt`, `calledAt`, `startedAt`,
   `checkOutTime` — va eski kod ularni faqat yorliqqa yozib, tartibni o'zi
   o'ylab topardi. Fakt bor edi, ustidan taxmin yozilgan edi.

   ENDI TARTIBNI HECH KIM QO'YMAYDI — U VAQTDAN CHIQADI:

     · bajarilganlar — BAJARILISH vaqti bo'yicha, ya'ni haqiqatan qanday
       ketma-ketlikda bo'lgan bo'lsa, shunday;
     · keyin hozir ketayotgani;
     · oxirida ochiq ishlar — BUYURILISH vaqti bo'yicha.

   Bu ham tartib, lekin u da'vo emas: har qatorning yonida uning o'z vaqti
   turadi, ya'ni foydalanuvchi tekshira oladi.

   KASSA BEKAT EMAS. Pul — ishning holati, joy emas. U hisob blokida turadi;
   bu yerga «kassa» degan bekat qo'shilsa, o'sha o'ylab topilgan qoida orqa
   eshikdan qaytib kiradi.
   ───────────────────────────────────────────────────────────────────────────── */

export type WorkState = 'done' | 'active' | 'open';

export interface VisitWork {
    kind: 'lab' | 'study' | 'doctor';
    /** Bekat ichidagi xizmatlar — «Umumiy qon tahlili · Biokimyo» */
    services: string[];
    state: WorkState;
    /** Tekshiruv turi (faqat `study`) — nomi shundan */
    modality?: Modality;
    /** Buyurilgan vaqt — ochiq ishlar shu bo'yicha saralanadi */
    orderedAt?: string | null;
    /** Bajarilgan vaqt — bajarilganlar shu bo'yicha saralanadi */
    doneAt?: string | null;
}

const earliest = (times: (string | null | undefined)[]): string | null =>
    times.filter((x): x is string => !!x).sort().shift() || null;

const latest = (times: (string | null | undefined)[]): string | null =>
    times.filter((x): x is string => !!x).sort().pop() || null;

/* Saralash kaliti. Vaqti yo'q yozuv oxirida qoladi — uni oldinga surish
   yana taxmin bo'lardi. */
const by = (t: string | null | undefined) => t || '￿';

/**
 * Qabuldagi ishlar — bo'lgani va bo'lmagani, haqiqiy vaqt bo'yicha.
 * Saqlanmaydi, har safar hisoblanadi: shifokor kartadan yana bir tahlil
 * qo'shsa, u ham shu yerga o'zi tushadi.
 */
export function visitWork(v: Visit): VisitWork[] {
    const items: VisitWork[] = [];

    /* ── Laboratoriya: yo'llanma bir nechta bo'lsa ham bitta qator ──
       Bemor uchun bu bitta ish: probani bir marta topshiradi. */
    const orders = (v.labOrders || []).filter(o => o.status !== 'Cancelled');
    if (orders.length > 0) {
        const allDone = orders.every(o => o.status === 'Completed');
        const started = orders.some(o => !!o.sampleCollectedAt);
        items.push({
            kind: 'lab',
            services: orders.flatMap(o => (o.items || []).map(i => i.testName)),
            state: allDone ? 'done' : started ? 'active' : 'open',
            orderedAt: earliest(orders.map(o => o.orderedAt)),
            /* Hammasi tayyor bo'lsa — oxirgi natija vaqti. Aks holda
               tayyor BO'LMAGANLARIDAN olingan proba vaqti: tayyorining
               vaqtini ko'rsatsak, tegilmagan tahlil ham boshlangandek
               ko'rinardi. */
            doneAt: allDone
                ? latest(orders.map(o => o.completedAt))
                : latest(orders.filter(o => o.status !== 'Completed').map(o => o.sampleCollectedAt)),
        });
    }

    /* ── Diagnostika: har tekshiruv alohida ── */
    for (const s of (v.studies || []).filter(x => x.status !== 'Cancelled')) {
        items.push({
            kind: 'study',
            services: [s.name],
            state: s.status === 'Completed' ? 'done' : s.status === 'InProgress' ? 'active' : 'open',
            modality: s.modality,
            orderedAt: s.orderedAt,
            doneAt: s.performedAt || null,
        });
    }

    /* ── Shifokor qabuli ── */
    if (v.doctorId || v.doctorName) {
        const done = v.status === 'Completed';
        const active = v.status === 'In Progress' || v.status === 'Called';
        items.push({
            kind: 'doctor',
            services: (v.procedures || []).map(p => p.procedureName).filter(Boolean),
            state: done ? 'done' : active ? 'active' : 'open',
            orderedAt: v.checkInTime || null,
            doneAt: done ? (v.checkOutTime || null) : (v.startedAt || v.calledAt || null),
        });
    }

    /* Tartib: bo'lgani → ketayotgani → qolgani. Har guruh ichida o'z vaqti
       bo'yicha. Bu yagona joy, bu yerda tartib haqida qaror qabul qilinadi —
       va u faqat vaqtga tayanadi. */
    const rank: Record<WorkState, number> = { done: 0, active: 1, open: 2 };
    return items.sort((a, b) =>
        rank[a.state] - rank[b.state]
        || (a.state === 'open'
            ? by(a.orderedAt).localeCompare(by(b.orderedAt))
            : by(a.doneAt).localeCompare(by(b.doneAt))));
}

/**
 * «2 / 3» — nechta ishdan nechtasi bajarildi.
 * Bu ketma-ketlik haqida hech narsa demaydi, faqat sanaydi.
 * Bitta ishli qabulda ko'rsatadigan narsa yo'q: `null`.
 */
export function workProgress(v: Visit): { done: number; total: number } | null {
    const items = visitWork(v);
    if (items.length < 2) return null;
    return { done: items.filter(s => s.state === 'done').length, total: items.length };
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
