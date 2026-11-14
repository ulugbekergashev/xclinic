import type { ICD10Code } from '../types';

/* ─────────────────────────────────────────────────────────────────────────────
   SHIFOKORNING «TEZ TUGMALARI» — oxirgi yozgan dorilari va ko'p qo'yadigan
   tashxislari.

   Shifokor kun bo'yi bir xil 15–20 ta dorini yozadi va bir xil o'nta
   tashxisni qo'yadi. Har safar nom, doza, mahal va kunni qaytadan yozish —
   qabuldagi eng ko'p vaqt shu yerda ketardi. Endi varaq ularni tugma qilib
   ko'rsatadi: bir bosish — to'rtta maydon to'ladi.

   SAQLASH JOYI — BRAUZER. Bu ataylab: ro'yxat bemor haqida emas (unda faqat
   dori nomi va MKB kodi bor), u shifokorning odati. Narxi: shifokor boshqa
   kompyuterga o'tsa, ro'yxat u yerda bo'sh boshlanadi va ishlagan sari
   to'ladi. Saqlab bo'lmasa (yopiq rejim, to'la xotira) tugmalar shunchaki
   chiqmaydi — varaq oddiy holatda ishlayveradi.

   Tartib: avval ko'p ishlatilgani, teng bo'lsa — yaqinda ishlatilgani.
   ───────────────────────────────────────────────────────────────────────────── */

/** Retsept qatori — varaqdagi formaning aynan o'zi */
export interface RecentRx {
    name: string;
    dosage: string;
    frequency: string;
    durationDays: string;
}

interface Entry<T> { item: T; n: number; at: number }

type Kind = 'rx' | 'dx';

const PREFIX = 'xc-recent:';
/** Saqlanadigani — ko'rsatiladiganidan ko'p: kam ishlatilgan narsa ham
    birdan yo'qolib qolmasin */
const STORED_LIMIT = 40;
/** Varaqda ko'rsatiladigan tugmalar soni */
export const SHOWN_LIMIT = 10;

const storageKey = (kind: Kind, owner: string) => `${PREFIX}${kind}:${owner || 'any'}`;

const isText = (x: unknown): x is string => typeof x === 'string';

const isRx = (x: unknown): x is RecentRx => {
    const r = x as RecentRx;
    return !!r && isText(r.name) && r.name.trim() !== ''
        && isText(r.dosage) && isText(r.frequency) && isText(r.durationDays);
};

const isIcd = (x: unknown): x is ICD10Code => {
    const c = x as ICD10Code;
    return !!c && isText(c.code) && c.code.trim() !== '' && isText(c.name);
};

/* Saqlangan narsa — tashqi ma'lumot: qo'lda o'zgartirilgan yoki eski
   ko'rinishda bo'lishi mumkin. Shakli to'g'ri kelmagan yozuv tashlab
   yuboriladi, butun ro'yxat emas. */
const readEntries = <T>(kind: Kind, owner: string, isItem: (x: unknown) => x is T): Entry<T>[] => {
    try {
        const raw = localStorage.getItem(storageKey(kind, owner));
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((e): e is Entry<T> =>
            !!e && typeof e === 'object'
            && isItem((e as Entry<T>).item)
            && typeof (e as Entry<T>).n === 'number'
            && typeof (e as Entry<T>).at === 'number');
    } catch {
        return [];
    }
};

const readRecent = <T>(kind: Kind, owner: string, isItem: (x: unknown) => x is T): T[] =>
    [...readEntries(kind, owner, isItem)]
        .sort((a, b) => b.n - a.n || b.at - a.at)
        .slice(0, SHOWN_LIMIT)
        .map(e => e.item);

const remember = <T>(
    kind: Kind, owner: string, items: T[],
    isItem: (x: unknown) => x is T, idOf: (x: T) => string,
): void => {
    try {
        const now = Date.now();
        const byId = new Map(readEntries(kind, owner, isItem).map(e => [idOf(e.item), e] as const));
        items.forEach((item, i) => {
            if (!isItem(item)) return;
            const id = idOf(item);
            const prev = byId.get(id);
            /* Eng oxirgi yozilgan ko'rinish saqlanadi: shifokor dozani
               o'zgartirgan bo'lsa, tugma endi yangisini to'ldiradi. */
            byId.set(id, { item, n: (prev?.n ?? 0) + 1, at: now + i });
        });
        const kept = [...byId.values()].sort((a, b) => b.at - a.at).slice(0, STORED_LIMIT);
        localStorage.setItem(storageKey(kind, owner), JSON.stringify(kept));
    } catch {
        /* Saqlanmadi — tugmalar chiqmaydi, varaq baribir ishlaydi */
    }
};

const rxId = (r: RecentRx) => r.name.trim().toLowerCase();

export const recentPrescriptions = (owner: string): RecentRx[] => readRecent('rx', owner, isRx);

export const rememberPrescriptions = (owner: string, items: RecentRx[]): void =>
    remember('rx', owner, items.map(r => ({
        name: r.name.trim(),
        dosage: r.dosage.trim(),
        frequency: r.frequency.trim(),
        durationDays: String(r.durationDays).trim(),
    })), isRx, rxId);

export const recentDiagnoses = (owner: string): ICD10Code[] => readRecent('dx', owner, isIcd);

export const rememberDiagnosis = (owner: string, code: ICD10Code): void =>
    remember('dx', owner, [{ code: code.code, name: code.name }], isIcd, c => c.code);
