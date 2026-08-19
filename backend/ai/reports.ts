// ─── Tayyor hisobotlar ────────────────────────────────────────────────────────
//
// Farqi /ai/ask dan: bu yerda model QAYSI tool'ni chaqirishni hal qilmaydi.
// Tugma bosilgan — demak kerakli tool'lar aniq ma'lum va ular to'g'ridan-to'g'ri
// chaqiriladi. Model faqat tayyor raqamlar ustiga qisqa xulosa yozadi.
//
// Uchta sabab:
//   1. Beqarorlik yo'qoladi. Etalon to'plamda model ba'zan tool'ni umuman
//      chaqirmasdan javob berardi (~8% holatda). Tugma uchun bu qabul qilib
//      bo'lmaydi — bosgan odam aniq natija kutadi.
//   2. Tez va arzon. Bitta model chaqiruvi, ~1000 token. Tool-calling tsikli
//      esa kamida ikki raund va ~4000 token. 8000 TPM limitida bu sezilarli.
//   3. Raqamlar UI ga xom holda yetib boradi va karta sifatida chiziladi.
//      Paragraf ichidagi raqamni ko'z bilan o'qib bo'lmaydi.

const { runTool } = require('./tools');
const { chat } = require('../aiService');

export type ReportType = 'today' | 'performance' | 'finance' | 'debtors' | 'inventory' | 'leads';

export interface Metric {
    label: string;
    value: number | string;
    unit?: string;
    hint?: string;
    /** UI rangi: neytral / yaxshi / ogohlantirish / yomon */
    tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

export interface ReportTable {
    columns: string[];
    rows: (string | number)[][];
}

export interface Report {
    type: ReportType;
    title: string;
    period: string;
    metrics: Metric[];
    table?: ReportTable;
    narrative: string;
    sources: string[];
    /** Ma'lumot umuman yo'q. UI nol devori o'rniga bo'sh holat ko'rsatadi. */
    empty?: boolean;
    emptyText?: string;
}

/**
 * Rangni QIYMATGA bog'laydi. Ilgari tone statik edi va "0 so'm tushum"
 * yashil chiqardi — go'yo yaxshi xabar. Nol hech qachon yutuq emas.
 */
const good = (v: number): Metric['tone'] => (v > 0 ? 'good' : 'neutral');
const bad = (v: number): Metric['tone'] => (v > 0 ? 'bad' : 'neutral');
const warn = (v: number): Metric['tone'] => (v > 0 ? 'warn' : 'neutral');

export interface ReportContext {
    clinicId: string;
    role: string;
    doctorId?: string;
}

// ─── Yordamchilar ────────────────────────────────────────────────────────────

const som = (n: number) => ({ value: Math.round(n), unit: 'so\'m' });

/** Oy boshidan bugungacha. */
const monthRange = (today: string) => ({
    dateFrom: `${today.slice(0, 7)}-01`,
    dateTo: today,
});

/** Har bir hisobot uchun: qaysi rollar ko'ra oladi. */
const REPORT_ROLES: Record<ReportType, string[]> = {
    today: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
    performance: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    finance: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
    debtors: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
    inventory: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST'],
    leads: ['SUPER_ADMIN', 'CLINIC_ADMIN', 'RECEPTIONIST'],
};

export type Lang = 'uz' | 'ru';

// Nom, izoh va bo'sh holat matni ikki tilda. Ilova ruschaga o'tganda hisobot
// tugmalari ham ruscha bo'lishi kerak — ilgari ular qattiq kodda o'zbekcha edi.
type Text = { title: string; hint: string; empty: string };

const TEXT: Record<ReportType, Record<Lang, Text>> = {
    today: {
        uz: { title: 'Bugungi hisobot', hint: 'Qabullar, kelmaganlar, bugungi tushum',
              empty: "Bugunga qabul ham, to'lov ham yozilmagan. Jadval bo'sh." },
        ru: { title: 'Отчёт за сегодня', hint: 'Приёмы, неявки, выручка за день',
              empty: 'На сегодня нет ни приёмов, ни платежей. Расписание пустое.' },
    },
    performance: {
        uz: { title: 'Samaradorlik', hint: 'Shifokorlar kesimida qabul va tushum',
              empty: "Bu davrda shifokorlar bo'yicha yozuv yo'q." },
        ru: { title: 'Эффективность', hint: 'Приёмы и выручка по врачам',
              empty: 'За этот период нет записей по врачам.' },
    },
    finance: {
        uz: { title: 'Moliya holati', hint: "Tushum, xarajat, to'lov usullari",
              empty: "Bu oyda hali to'lov ham, xarajat ham yozilmagan." },
        ru: { title: 'Финансы', hint: 'Выручка, расходы, способы оплаты',
              empty: 'В этом месяце ещё нет ни платежей, ни расходов.' },
    },
    debtors: {
        uz: { title: 'Qarzdorlar', hint: 'Kim qancha qarz, jami summa',
              empty: "Qarzdor bemor yo'q — hammasi to'langan." },
        ru: { title: 'Должники', hint: 'Кто сколько должен, общая сумма',
              empty: 'Должников нет — всё оплачено.' },
    },
    inventory: {
        uz: { title: 'Ombor', hint: 'Tugayotgan materiallar',
              empty: "Omborda hali material qo'shilmagan." },
        ru: { title: 'Склад', hint: 'Заканчивающиеся материалы',
              empty: 'На склад ещё не добавлены материалы.' },
    },
    leads: {
        uz: { title: 'Lidlar', hint: 'Manba, konversiya, javobsizlar',
              empty: 'Oxirgi 30 kunda lid kelmagan.' },
        ru: { title: 'Лиды', hint: 'Источник, конверсия, без ответа',
              empty: 'За последние 30 дней лидов не было.' },
    },
};

const REPORT_LIST: ReportType[] = ['today', 'performance', 'finance', 'debtors', 'inventory', 'leads'];

/** Rolga va tilga ko'ra mavjud hisobotlar. */
export const reportsForRole = (role: string, lang: Lang = 'uz') =>
    REPORT_LIST
        .filter(t => REPORT_ROLES[t].includes(role))
        .map(t => ({ type: t, title: TEXT[t][lang].title, hint: TEXT[t][lang].hint }));

// ─── Hisobot quruvchilari ────────────────────────────────────────────────────
// Har biri: kerakli tool'larni chaqiradi, metrikalarni ajratadi, jadval quradi.

type Builder = (ctx: ReportContext, today: string) => Promise<Omit<Report, 'type' | 'narrative' | 'title' | 'emptyText'>>;

const BUILDERS: Record<ReportType, Builder> = {

    today: async (ctx, today) => {
        const appts = await runTool('get_appointments', { dateFrom: today, dateTo: today }, ctx);
        const st = appts.status_kesimida || {};
        const kelmagan = st['No-Show'] || 0;

        const jami = appts.jami ?? 0;
        const metrics: Metric[] = [
            { label: 'Jami qabul', value: jami, unit: 'ta' },
            { label: 'Tasdiqlangan', value: st['Confirmed'] || 0, unit: 'ta', tone: good(st['Confirmed'] || 0) },
            { label: 'Yakunlangan', value: st['Completed'] || 0, unit: 'ta', tone: good(st['Completed'] || 0) },
            { label: 'Kelmagan', value: kelmagan, unit: 'ta', tone: warn(kelmagan) },
        ];
        const sources = ['get_appointments'];
        let tushum = 0;

        // Moliya faqat ruxsati borlar uchun.
        if (['SUPER_ADMIN', 'CLINIC_ADMIN'].includes(ctx.role)) {
            const rev = await runTool('get_revenue', { dateFrom: today, dateTo: today }, ctx);
            if (!rev.xato) {
                tushum = rev.kassaga_kirgan || 0;
                metrics.push({ label: 'Bugungi tushum', ...som(tushum), tone: good(tushum) });
                sources.push('get_revenue');
            }
        }

        return {
            period: today,
            empty: jami === 0 && tushum === 0,
            emptyText: 'Bugunga qabul ham, to\'lov ham yozilmagan. Jadval bo\'sh.',
            metrics,
            table: appts.qabullar?.length
                ? {
                    columns: ['Vaqt', 'Shifokor', 'Bemor', 'Status'],
                    rows: appts.qabullar.slice(0, 12).map((a: any) => [a.vaqt, a.shifokor, a.bemor, a.status]),
                }
                : undefined,
            sources,
        };
    },

    performance: async (ctx, today) => {
        const r = monthRange(today);
        const d = await runTool('get_doctor_stats', r, ctx);
        const docs = d.shifokorlar || [];
        const jamiTushum = docs.reduce((s: number, x: any) => s + (x.tushum || 0), 0);
        const jamiKelmagan = docs.reduce((s: number, x: any) => s + (x.kelmagan || 0), 0);
        const top = [...docs].sort((a: any, b: any) => (b.tushum || 0) - (a.tushum || 0))[0];

        return {
            period: `${r.dateFrom} — ${r.dateTo}`,
            empty: docs.length === 0 || jamiTushum === 0,
            metrics: [
                { label: 'Shifokorlar', value: docs.length, unit: 'ta' },
                { label: 'Jami tushum', ...som(jamiTushum), tone: good(jamiTushum) },
                { label: 'Yetakchi', value: top?.shifokor || '—', hint: top ? `${Math.round(top.tushum).toLocaleString('ru-RU')} so'm` : undefined },
                { label: 'Kelmaganlar', value: jamiKelmagan, unit: 'ta', tone: warn(jamiKelmagan) },
            ],
            table: docs.length
                ? {
                    columns: ['Shifokor', 'Qabul', 'Yakunlangan', 'Kelmagan', 'Tushum'],
                    rows: docs.map((x: any) => [x.shifokor, x.qabullar, x.bajarilgan, x.kelmagan, Math.round(x.tushum).toLocaleString('ru-RU')]),
                }
                : undefined,
            sources: ['get_doctor_stats'],
        };
    },

    finance: async (ctx, today) => {
        const r = monthRange(today);
        const f = await runTool('get_revenue', r, ctx);
        const usul = f.usul_kesimida || {};

        return {
            period: `${r.dateFrom} — ${r.dateTo}`,
            empty: !(f.kassaga_kirgan || f.xarajat || f.tolovlar_soni),
            metrics: [
                { label: 'Kassaga kirgan', ...som(f.kassaga_kirgan || 0), tone: good(f.kassaga_kirgan || 0) },
                { label: 'Xarajat', ...som(f.xarajat || 0), tone: bad(f.xarajat || 0) },
                { label: 'Sof', ...som(f.sof || 0), tone: (f.sof || 0) >= 0 ? 'good' : 'bad' },
                { label: 'To\'lovlar', value: f.tolovlar_soni || 0, unit: 'ta' },
            ],
            table: Object.keys(usul).length
                ? {
                    columns: ['To\'lov usuli', 'Summa'],
                    rows: Object.entries(usul)
                        .sort((a: any, b: any) => b[1] - a[1])
                        .map(([k, v]: any) => [k, Math.round(v).toLocaleString('ru-RU')]),
                }
                : undefined,
            sources: ['get_revenue'],
        };
    },

    debtors: async (ctx) => {
        const d = await runTool('get_debtors', { limit: 20 }, ctx);
        const list = d.bemorlar || [];

        return {
            period: 'Hozirgi holat',
            empty: list.length === 0,
            metrics: [
                { label: 'Qarzdorlar', value: d.topildi ?? list.length, unit: 'ta', tone: warn(d.topildi ?? list.length) },
                { label: 'Jami qarz', ...som(d.jami_qarz || 0), tone: bad(d.jami_qarz || 0) },
                { label: 'Eng katta', value: list[0]?.bemor || '—', hint: list[0] ? `${Math.round(list[0].qarz).toLocaleString('ru-RU')} so'm` : undefined },
            ],
            table: list.length
                ? {
                    columns: ['Bemor', 'Telefon', 'Qarz', 'Oxirgi tashrif'],
                    rows: list.map((x: any) => [x.bemor, x.telefon, Math.round(x.qarz).toLocaleString('ru-RU'), x.oxirgi_tashrif || '—']),
                }
                : undefined,
            sources: ['get_debtors'],
        };
    },

    inventory: async (ctx) => {
        const s = await runTool('get_low_stock', {}, ctx);
        const list = s.materiallar || [];

        return {
            period: 'Hozirgi holat',
            empty: (s.jami_pozitsiya ?? 0) === 0,
            metrics: [
                { label: 'Jami pozitsiya', value: s.jami_pozitsiya ?? 0, unit: 'ta' },
                { label: 'Tugayotgan', value: s.tugayotgan ?? 0, unit: 'ta', tone: (s.tugayotgan ?? 0) > 0 ? 'warn' : 'good' },
            ],
            table: list.length
                ? {
                    columns: ['Material', 'Qoldiq', 'Minimum', 'O\'lchov'],
                    rows: list.map((x: any) => [x.nom, x.qoldiq, x.minimum, x.olchov]),
                }
                : undefined,
            sources: ['get_low_stock'],
        };
    },

    leads: async (ctx) => {
        const l = await runTool('get_leads', { days: 30 }, ctx);
        const st = l.status_kesimida || {};
        const manba = l.manba_kesimida || {};
        const jami = l.jami || 0;
        const booked = st['Booked'] || 0;

        return {
            period: 'Oxirgi 30 kun',
            empty: jami === 0,
            metrics: [
                { label: 'Jami lid', value: jami, unit: 'ta' },
                { label: 'Bemorga aylandi', value: booked, unit: 'ta', tone: good(booked), hint: jami ? `${Math.round((booked / jami) * 100)}% konversiya` : undefined },
                { label: 'Javobsiz', value: l.javobsiz_eski_lidlar || 0, unit: 'ta', tone: warn(l.javobsiz_eski_lidlar || 0) },
            ],
            table: Object.keys(manba).length
                ? {
                    columns: ['Manba', 'Lidlar'],
                    rows: Object.entries(manba).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => [k, v]),
                }
                : undefined,
            sources: ['get_leads'],
        };
    },
};

// ─── Xulosa matni ────────────────────────────────────────────────────────────
// Model faqat shu qismni yozadi. Raqamlar unga tayyor holda beriladi, ya'ni
// u hisoblamaydi va tool tanlamaydi — faqat nimaga e'tibor berish kerakligini
// aytadi. Shuning uchun xato qilish ehtimoli minimal.

const narrativeFor = async (r: Omit<Report, 'type' | 'narrative'>, lang: Lang): Promise<string> => {
    const fakt = r.metrics
        .map(m => `${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}${m.hint ? ` (${m.hint})` : ''}`)
        .join('; ');

    try {
        return await chat(
            [
                {
                    role: 'system',
                    content:
                        'Sen stomatologiya klinikasi boshqaruvchisiga hisobot izohini yozasan. ' +
                        'Senga tayyor raqamlar beriladi — ularni QAYTA HISOBLAMA va yangi raqam ' +
                        'qo\'shma. Vazifang: 2-3 gapda eng muhim narsani ayt va e\'tibor talab ' +
                        'qiladigan bitta narsani ko\'rsat. Agar hammasi yaxshi bo\'lsa, shuni ayt. ' +
                        'Markdown, emoji va sarlavha ISHLATMA. Faqat oddiy matn, o\'zbek tilida.',
                },
                { role: 'user', content: `${r.title} (${r.period}). ${fakt}` },
            ],
            { task: 'chat', maxTokens: 220, label: 'report-narrative' }
        );
    } catch (e: any) {
        // Xulosa bo'lmasa ham hisobot o'zi qimmatli — raqamlar allaqachon tayyor.
        console.warn('[AI:report] xulosa yozilmadi:', e.message);
        return '';
    }
};

/**
 * Hisobotni quradi. Rol tekshiruvi bu yerda ham qayta amalga oshiriladi —
 * tool qatlamiga tayanib qolmaymiz.
 */
export const buildReport = async (
    type: ReportType,
    ctx: ReportContext,
    today: string,
    lang: Lang = 'uz'
): Promise<Report> => {
    const allowed = REPORT_ROLES[type];
    if (!allowed) throw new Error(`Noma'lum hisobot turi: ${type}`);
    if (!allowed.includes(ctx.role)) throw new Error('Bu hisobotga sizning rolingizda ruxsat yo\'q.');

    const txt = TEXT[type][lang];
    const base = { ...await BUILDERS[type](ctx, today), title: txt.title, emptyText: txt.empty };
    const narrative = await narrativeFor(base, lang);
    return { type, ...base, narrative };
};
