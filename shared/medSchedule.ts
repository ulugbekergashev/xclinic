/* ─────────────────────────────────────────────────────────────────────────────
   DORI JADVALI — «kuniga 3 mahal» degan matndan bugungi vaqtlar.

   MUAMMO. Tayinlovda qabul tartibi erkin matn bilan yoziladi
   (`MedicationOrder.frequency`: «Kuniga 2 mahal», «3 раза в день»,
   «og'riqda»). Soat hech qayerda saqlanmaydi. Hamshiraning savoli esa aynan
   soat haqida: «hozir kimga nima berishim kerak?» Ekran faqat «bugun 1 marta
   berildi» deb turardi — vaqti kelgan dozani undan bilib bo'lmasdi.

   YECHIM — STANDART VAQTLAR. Statsionarda dori tarqatish odatda bir xil
   soatlarda bo'ladi: bir mahal — ertalab, ikki mahal — ertalab va kechqurun,
   uch mahal — ertalab, tushda, kechqurun. Matndan «necha mahal» ajratib
   olinadi va shu soatlarga yoyiladi. Vaqti o'tgan soatlar soni bugun
   belgilangan dozalar sonidan ko'p bo'lsa — doza kutyapti.

   BU TAXMIN, VA U EKRANDA KO'RINIB TURADI: har tayinlov yonida uning
   soatlari yoziladi. Klinika boshqa soatda tarqatsa, belgi shunchaki
   ertaroq yoki kechroq yonadi — hech narsa yozilmaydi va o'chirilmaydi.

   JADVALSIZ TAYINLOV. «Og'riqda», «zaruratga qarab» — bularda vaqt yo'q va
   bo'lmasligi kerak: `dosesPerDay` `null` qaytaradi, doza hech qachon
   «kutyapti» bo'lmaydi. Tushunib bo'lmagan matn ham shunday — noto'g'ri
   eslatmadan ko'ra eslatmaning yo'qligi yaxshi.

   Bu fayl front va backend uchun UMUMIY (`shared/README.md`): qoida ikki
   joyda yozilsa, statsionar ekrani bir sonni, «Bugun» boshqasini ko'rsatardi.
   ───────────────────────────────────────────────────────────────────────────── */

const WORDS: Record<string, number> = {
    bir: 1, ikki: 2, uch: 3, tort: 4, besh: 5, olti: 6,
    'один': 1, 'одна': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5, 'шесть': 6,
    'однократно': 1, 'дважды': 2, 'трижды': 3,
};

/** Zaruratga qarab beriladigan dori — jadvali yo'q. «talab» so'z boshida:
 *  aks holda «erTALAB» ham shunga tushardi (sinov aynan shuni ushlagan). */
const AS_NEEDED = /ogriq|zarur|kerak bol|lozim bol|(?:^|\s)talab|при бол|необходимост|по требовани|\bprn\b|\bsos\b/;

/** «mahal», «marta», «раз» — sonning birligi */
const UNIT = '(?:mahal|maxal|marta|marotaba|раза?|р\\.?\\s*(?:/|в)\\s*(?:д|сут)|x|х|×|times?)';

/** Kunning qismlari: «ertalab va kechqurun» — ikki mahal */
const DAY_PARTS = [
    /ertalab|nahor|утр/,
    /tush|kunduz|обед|дн[её]м/,
    /kechqurun|kechki|вечер/,
    /tunda|yotish|на ночь|перед сном/,
];

const clamp = (n: number) => (n >= 1 && n <= 12 ? Math.round(n) : null);

/**
 * Kuniga necha mahal. `null` — jadvalsiz: zaruratga qarab yoki matndan
 * aniqlab bo'lmadi.
 */
export function dosesPerDay(frequency?: string | null): number | null {
    // Apostroflar olib tashlanadi: «og'riqda», «to'rt» har xil belgi bilan yoziladi
    const s = String(frequency || '').toLowerCase().replace(/['ʻʼ’‘`]/g, '').trim();
    if (!s) return null;
    if (AS_NEEDED.test(s)) return null;

    // «har 8 soatda», «каждые 6 часов»
    const every = s.match(/(?:har|каждые?|every)\s*(\d{1,2})\s*(?:soat|час|h)/);
    if (every) {
        const hours = Number(every[1]);
        return hours > 0 ? clamp(24 / hours) : null;
    }

    // «kuniga 3 marta», «2 раза в день», «3x»
    const digits = s.match(new RegExp(`(\\d{1,2})\\s*${UNIT}`));
    if (digits) return clamp(Number(digits[1]));

    // «kuniga ikki mahal», «три раза в день», «дважды в день»
    for (const [word, n] of Object.entries(WORDS)) {
        if (new RegExp(`(?:^|[^a-zа-яё])${word}(?:\\s*${UNIT}|$|[^a-zа-яё])`).test(s)
            && (new RegExp(`${word}\\s*${UNIT}`).test(s) || /жды|кратно/.test(word))) return n;
    }

    // Faqat son: «3», «2 / kun»
    const bare = s.match(/^(\d{1,2})(?:\s*(?:\/|в|kun)|$)/);
    if (bare) return clamp(Number(bare[1]));

    // «ertalab va kechqurun» — kun qismlari sanaladi
    const parts = DAY_PARTS.filter(re => re.test(s)).length;
    return parts > 0 ? parts : null;
}

const STANDARD: Record<number, number[]> = {
    1: [9 * 60],
    2: [8 * 60, 20 * 60],
    3: [8 * 60, 14 * 60, 20 * 60],
    4: [8 * 60, 12 * 60, 16 * 60, 20 * 60],
};

/** N mahal uchun standart vaqtlar — kun boshidan daqiqada. 5 va undan ko'pi: 06:00–22:00 oralig'ida teng */
export function slotMinutes(perDay: number): number[] {
    if (STANDARD[perDay]) return STANDARD[perDay];
    if (!(perDay >= 1)) return [];
    const from = 6 * 60, to = 22 * 60;
    return Array.from({ length: perDay }, (_, i) => Math.round(from + (i * (to - from)) / (perDay - 1)));
}

/** Daqiqa → «08:00» */
export const slotLabel = (min: number): string =>
    `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface MedDue {
    /** Kuniga necha mahal; `null` — jadvalsiz */
    perDay: number | null;
    /** Bugungi vaqtlar — «08:00» ko'rinishida */
    slots: string[];
    /** Vaqti kelgan, lekin belgilanmagan dozalar soni */
    due: number;
    /** Bugungi keyingi vaqt; qolmagan bo'lsa `null` */
    nextAt: string | null;
}

/**
 * Tayinlovning bugungi holati.
 * `handledToday` — bugun belgilangan dozalar: berilgani ham, o'tkazib
 * yuborilgani ham, rad etilgani ham — uchalasi ham hamshiraning qarori.
 */
export function medDue(frequency: string | null | undefined, handledToday: number, nowMin: number): MedDue {
    const perDay = dosesPerDay(frequency);
    if (perDay == null) return { perDay: null, slots: [], due: 0, nextAt: null };
    const mins = slotMinutes(perDay);
    const passed = mins.filter(m => m <= nowMin).length;
    const next = mins.find(m => m > nowMin);
    return {
        perDay,
        slots: mins.map(slotLabel),
        due: Math.max(0, passed - Math.max(0, handledToday)),
        nextAt: next != null ? slotLabel(next) : null,
    };
}
