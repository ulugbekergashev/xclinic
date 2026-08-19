// ─── Etalon to'plam uchun barqaror soxta klinika ─────────────────────────────
// Baza chaqirilmaydi. Sabab: etalon testning maqsadi — MODEL to'g'ri tool'ni
// to'g'ri argument bilan chaqirdimi va javobda raqamni to'g'ri ishlatdimi.
// Haqiqiy bazada raqamlar har kuni o'zgaradi, ya'ni test natijasi ham o'zgaradi
// va regressiyani sezib bo'lmaydi. Fikstura buni barqaror qiladi.
//
// EVAL_TODAY ataylab qotirilgan — "bugun", "kecha", "shu oy" savollarini
// tekshirish uchun sana ma'lum bo'lishi shart.

export const EVAL_TODAY = '2026-08-14';   // payshanba
export const EVAL_YESTERDAY = '2026-08-13';
export const EVAL_TOMORROW = '2026-08-15';

const inRange = (from: string, to: string, d: string) => d >= from && d <= to;

// ─── Qabullar ────────────────────────────────────────────────────────────────
const APPTS = [
    // bugun: 12 ta
    ...Array.from({ length: 7 }, (_, i) => ({ date: EVAL_TODAY, doctorName: 'Rahimov B.', status: 'Confirmed', time: `0${9 + i}:00`, patientName: `Bemor${i}`, type: 'Konsultatsiya' })),
    ...Array.from({ length: 3 }, (_, i) => ({ date: EVAL_TODAY, doctorName: 'Karimova N.', status: 'Completed', time: `1${i}:00`, patientName: `Bemor1${i}`, type: 'Davolash' })),
    ...Array.from({ length: 2 }, (_, i) => ({ date: EVAL_TODAY, doctorName: 'Yusupov A.', status: 'No-Show', time: `1${5 + i}:00`, patientName: `Bemor2${i}`, type: 'Tekshiruv' })),
    // ertaga: 8 ta
    ...Array.from({ length: 8 }, (_, i) => ({ date: EVAL_TOMORROW, doctorName: 'Rahimov B.', status: 'Confirmed', time: `0${9 + (i % 5)}:00`, patientName: `Ertaga${i}`, type: 'Konsultatsiya' })),
    // kecha: 15 ta
    ...Array.from({ length: 15 }, (_, i) => ({ date: EVAL_YESTERDAY, doctorName: i < 9 ? 'Karimova N.' : 'Rahimov B.', status: 'Completed', time: `0${9 + (i % 8)}:00`, patientName: `Kecha${i}`, type: 'Davolash' })),
];

// ─── Moliya ──────────────────────────────────────────────────────────────────
// Avgust (1–31) va iyul (1–31) — "o'tgan oyga nisbatan" savollari uchun.
const REVENUE: Record<string, any> = {
    avgust: {
        kassaga_kirgan: 42_350_000, umumiy_aylanma: 45_100_000,
        xarajat: 11_200_000, sof: 31_150_000, tolovlar_soni: 87,
        usul_kesimida: { Cash: 18_500_000, Card: 15_850_000, Click: 8_000_000, Balance: 2_750_000 },
        xarajat_kesimida: { Materiallar: 7_200_000, Ijara: 4_000_000 },
    },
    iyul: {
        kassaga_kirgan: 38_900_000, umumiy_aylanma: 40_100_000,
        xarajat: 12_600_000, sof: 26_300_000, tolovlar_soni: 79,
        usul_kesimida: { Cash: 17_000_000, Card: 14_900_000, Click: 7_000_000, Balance: 1_200_000 },
        xarajat_kesimida: { Materiallar: 8_100_000, Ijara: 4_000_000 },
    },
};

const IZOH_REVENUE =
    'kassaga_kirgan — haqiqatda tushgan pul. umumiy_aylanma bunga qo\'shimcha ravishda ' +
    'avansdan yechilgan (Balance) to\'lovlarni ham o\'z ichiga oladi, ular kassaga yangi ' +
    'pul keltirmaydi. Summalar so\'mda.';

// ─── Qarzdorlar ──────────────────────────────────────────────────────────────
const DEBTORS = [
    { bemor: 'Aliyev S.', telefon: '***4571', qarz: 1_200_000, oxirgi_tashrif: '2026-07-02' },
    { bemor: 'Karimova M.', telefon: '***8832', qarz: 980_000, oxirgi_tashrif: '2026-07-19' },
    { bemor: 'Tosheva D.', telefon: '***1204', qarz: 850_000, oxirgi_tashrif: '2026-06-28' },
    { bemor: 'Rasulov J.', telefon: '***9911', qarz: 720_000, oxirgi_tashrif: '2026-08-01' },
    { bemor: 'Nazarova G.', telefon: '***3355', qarz: 640_000, oxirgi_tashrif: '2026-05-14' },
    { bemor: 'Ergashev B.', telefon: '***7788', qarz: 460_000, oxirgi_tashrif: '2026-08-09' },
];

// ─── Shifokorlar ─────────────────────────────────────────────────────────────
// Qabul sonlari APPTS dan HISOBLANADI, qo'lda yozilmaydi. Sabab: birinchi
// versiyada ular alohida yozilgan edi va get_appointments bilan ziddiyatga
// tushdi — model to'g'ri javob bergani holda test yiqildi. Bitta manba
// bo'lgani uchun endi bunday bo'lmaydi.
const DOCTOR_META = [
    { shifokor: 'Rahimov B.', yonalish: 'Terapevt', tushum: 19_800_000 },
    { shifokor: 'Karimova N.', yonalish: 'Ortodont', tushum: 16_200_000 },
    { shifokor: 'Yusupov A.', yonalish: 'Xirurg', tushum: 6_350_000 },
];

// ─── Ombor ───────────────────────────────────────────────────────────────────
const LOW_STOCK = [
    { nom: 'Implant Osstem 4.0', qoldiq: 3, minimum: 10, olchov: 'dona' },
    { nom: 'Kompozit A2', qoldiq: 5, minimum: 12, olchov: 'shprits' },
    { nom: 'Anestetik Ubistesin', qoldiq: 8, minimum: 20, olchov: 'ampula' },
];

/**
 * Fikstura executor — runTool o'rniga ishlaydi.
 * Model yuborgan argumentlarni HAQIQATAN tekshiradi (sanani inobatga oladi),
 * shuning uchun noto'g'ri sana bergan model noto'g'ri javob oladi va test yiqiladi.
 */
export const fixtureExecutor = async (name: string, args: any): Promise<any> => {
    switch (name) {
        case 'get_appointments': {
            const from = String(args.dateFrom || '');
            const to = String(args.dateTo || '');
            let rows = APPTS.filter(a => inRange(from, to, a.date));
            if (args.doctorName) {
                const q = String(args.doctorName).toLowerCase();
                rows = rows.filter(a => a.doctorName.toLowerCase().includes(q));
            }
            if (args.status) rows = rows.filter(a => a.status === args.status);

            const byStatus: Record<string, number> = {};
            for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

            return {
                jami: rows.length,
                status_kesimida: byStatus,
                qabullar: rows.slice(0, 40).map(r => ({
                    sana: r.date, vaqt: r.time, shifokor: r.doctorName,
                    bemor: r.patientName, turi: r.type, status: r.status,
                })),
            };
        }

        case 'get_revenue': {
            const from = String(args.dateFrom || '');
            // Qaysi oy so'ralganini boshlanish sanasidan aniqlaymiz.
            const key = from.startsWith('2026-07') ? 'iyul' : from.startsWith('2026-08') ? 'avgust' : null;
            if (!key) {
                return { davr: `${args.dateFrom} — ${args.dateTo}`, kassaga_kirgan: 0, umumiy_aylanma: 0, xarajat: 0, sof: 0, tolovlar_soni: 0, usul_kesimida: {}, xarajat_kesimida: {}, izoh: 'Bu davr uchun ma\'lumot yo\'q. ' + IZOH_REVENUE };
            }
            return { davr: `${args.dateFrom} — ${args.dateTo}`, ...REVENUE[key], izoh: IZOH_REVENUE };
        }

        case 'get_debtors': {
            const limit = Math.min(Number(args.limit) || 10, 50);
            const rows = DEBTORS.slice(0, limit);
            return {
                topildi: rows.length,
                jami_qarz: DEBTORS.reduce((s, d) => s + d.qarz, 0),
                bemorlar: rows,
                izoh: 'Summalar so\'mda. Faqat faol bemorlar.',
            };
        }

        case 'get_doctor_stats': {
            const from = String(args.dateFrom || '');
            const to = String(args.dateTo || '');
            return {
                davr: `${args.dateFrom} — ${args.dateTo}`,
                shifokorlar: DOCTOR_META.map(d => {
                    const mine = APPTS.filter(a => a.doctorName === d.shifokor && inRange(from, to, a.date));
                    return {
                        shifokor: d.shifokor,
                        yonalish: d.yonalish,
                        qabullar: mine.length,
                        bajarilgan: mine.filter(a => a.status === 'Completed').length,
                        kelmagan: mine.filter(a => a.status === 'No-Show').length,
                        bekor: mine.filter(a => a.status === 'Cancelled').length,
                        tushum: d.tushum,
                    };
                }),
                izoh: 'tushum — shifokorga biriktirilgan to\'lovlar, so\'mda.',
            };
        }

        case 'find_patient': {
            const q = String(args.query || '').toLowerCase();
            if (q.length < 2) return { xato: 'Qidiruv so\'rovi juda qisqa (kamida 2 belgi).' };
            const hit = DEBTORS.find(d => d.bemor.toLowerCase().includes(q));
            if (!hit) {
                return { topildi: 0, bemorlar: [], izoh: 'Bemor topilmadi. Ism boshqacha yozilgan bo\'lishi mumkin.' };
            }
            return {
                topildi: 1,
                bemorlar: [{
                    bemor: hit.bemor, telefon: hit.telefon, balans: -hit.qarz,
                    oxirgi_tashrif: hit.oxirgi_tashrif, shifokor: 'Rahimov B.', holat: 'Active',
                }],
                izoh: 'Manfiy balans — qarz. Ismlar maxfiylik uchun qisqartirilgan.',
            };
        }

        case 'get_low_stock':
            return { jami_pozitsiya: 48, tugayotgan: LOW_STOCK.length, materiallar: LOW_STOCK };

        case 'get_leads': {
            const days = Math.min(Number(args.days) || 30, 365);
            return {
                davr_kun: days,
                jami: 24,
                status_kesimida: { New: 9, Contacted: 7, Thinking: 3, Booked: 4, Cancelled: 1 },
                manba_kesimida: { Instagram: 12, Telegram: 7, 'Tavsiya': 5 },
                javobsiz_eski_lidlar: 5,
                izoh: '5 ta lid 7 kundan beri "New" holatida — ular bilan bog\'lanilmagan.',
            };
        }

        default:
            return { xato: `Noma'lum tool: ${name}` };
    }
};
