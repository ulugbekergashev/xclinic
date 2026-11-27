/* ─────────────────────────────────────────────────────────────────────────────
   RAHBAR VA SHIFOKOR TELEGRAM BOTI (2026-11-27, migratsiya 0050).

   Ega so'radi: «dentalocal'dan telegram bot, AI, SMS larni ko'chirib ol …
   rahbar bilan, hisobot, shifokorga xabar yuborishlarini».

   dentalocal'dan KO'CHIRILGANI — ishlash tartibi:
     · «📊 Hisobot» — bitta xabar, tugma bosilganda o'z joyida o'zgaradi:
       davr (bugun · kecha · hafta · oy · o'tgan oy) × bo'lim (umumiy ·
       shifokorlar · kassa · qarzdorlar · kelmaganlar);
     · kunlik hisobot — yoqiq/o'chiq va vaqti sozlanadi; kompyuter o'sha
       paytda o'chiq bo'lsa ertasi «Kechagi hisobot» bo'lib keladi; bo'sh
       kun (dam olish) xabar yubormaydi;
     · «📋 Bugungi qabullar», «💾 Zaxira nusxa»;
     · shifokorga: «🗓 Ertangi qabullarim» va qabul xabari (yangi · ko'chirildi
       · boshqa shifokorga o'tdi · bekor qilindi);
     · ertalabki jadval bir martalik belgi bilan (08:00–12:00 oynasi).

   KO'CHIRILMAGANI — raqamlar. dentalocal'da qarz tranzaksiyada turadi,
   bizda xizmat qatorida. Shuning uchun hamma raqam BIZNING «Hisobot»
   modulidan (`reports.ts` → summaryReport, debtorGroups): botdagi son
   ilovadagi bilan aynan bir xil. «Kassaga tushdi» — Kassa qoidasi bilan
   (to'lov sanasi bo'yicha, avansdan yechilgani kassaga kirmaydi).

   Xabarlar HTML: bemor ismidagi «_» yoki «*» Markdown'ni buzib, xabar
   umuman ketmay qolardi (dentalocal'da shu sabab bilan o'tilgan).
   ───────────────────────────────────────────────────────────────────────────── */

import { summaryReport, debtorGroups } from './reports';
import { tashkentDateStr, tashkentNowMs } from './tashkentTime';
import { makePermChecker } from './staffPerms';

/** Registrator roli uchun ruxsatlar — ilovadagi bilan bitta manba (Ruxsatlar jadvali) */
export async function receptionPerms(prisma: any, clinicId: string) {
    const c = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { accessControl: true } });
    return makePermChecker('RECEPTIONIST', c?.accessControl);
}

export const esc = (v: unknown) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const money = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const ddmmyyyy = (d: string) => String(d).slice(0, 10).split('-').reverse().join('.');
const ddmm = (d: string) => String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('.');

export function addDays(day: string, n: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** Toshkent vaqti «HH:MM» */
export const tashkentHm = () => new Date(tashkentNowMs()).toISOString().slice(11, 16);

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TELEGRAM_LIMIT = 3900;
/** Telegram 4096 belgidan uzunini qabul qilmaydi — ortig'i «…» bilan kesiladi */
export function fitTelegram(lines: string[]): string {
    let out = '';
    for (const l of lines) {
        if (out.length + l.length + 1 > TELEGRAM_LIMIT) return `${out}\n…`;
        out += (out ? '\n' : '') + l;
    }
    return out;
}

// ─── Davr va bo'lim ─────────────────────────────────────────────────────────

export const PERIODS = ['d', 'y', 'w', 'm', 'pm'] as const;
export type PeriodKey = typeof PERIODS[number];
export const SECTIONS = ['sum', 'doc', 'cash', 'debt', 'ns'] as const;
export type ReportSection = typeof SECTIONS[number];

const PERIOD_BUTTON: Record<PeriodKey, string> = { d: 'Bugun', y: 'Kecha', w: 'Hafta', m: 'Oy', pm: "O'tgan oy" };
const SECTION_BUTTON: Record<ReportSection, string> = {
    sum: 'Umumiy', doc: 'Shifokorlar', cash: 'Kassa', debt: 'Qarzdorlar', ns: 'Kelmaganlar',
};

export function periodRange(p: PeriodKey, today: string): { from: string; to: string; label: string } {
    if (p === 'y') { const y = addDays(today, -1); return { from: y, to: y, label: `Kecha, ${ddmmyyyy(y)}` }; }
    if (p === 'w') {
        const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;   // dushanba = 0
        const from = addDays(today, -dow);
        return { from, to: today, label: `Shu hafta: ${ddmm(from)} – ${ddmm(today)}` };
    }
    if (p === 'm') { const from = today.slice(0, 8) + '01'; return { from, to: today, label: `Shu oy: ${ddmm(from)} – ${ddmm(today)}` }; }
    if (p === 'pm') {
        const first = today.slice(0, 8) + '01';
        const to = addDays(first, -1);
        const from = to.slice(0, 8) + '01';
        return { from, to, label: `O'tgan oy: ${ddmmyyyy(from)} – ${ddmmyyyy(to)}` };
    }
    return { from: today, to: today, label: `Bugun, ${ddmmyyyy(today)}` };
}

export function reportKeyboard(p: PeriodKey, s: ReportSection) {
    const mark = (on: boolean, text: string) => (on ? `• ${text} •` : text);
    return {
        inline_keyboard: [
            PERIODS.map(k => ({ text: mark(k === p, PERIOD_BUTTON[k]), callback_data: `rp:${k}:${s}` })),
            (['sum', 'doc', 'cash'] as ReportSection[]).map(k => ({ text: mark(k === s, SECTION_BUTTON[k]), callback_data: `rp:${p}:${k}` })),
            (['debt', 'ns'] as ReportSection[]).map(k => ({ text: mark(k === s, SECTION_BUTTON[k]), callback_data: `rp:${p}:${k}` })),
        ],
    };
}

export function parseReportCallback(data: string): { p: PeriodKey; s: ReportSection } | null {
    const m = /^rp:([a-z]+):([a-z]+)$/.exec(data);
    if (!m) return null;
    const p = m[1] as PeriodKey, s = m[2] as ReportSection;
    if (!PERIODS.includes(p) || !SECTIONS.includes(s)) return null;
    return { p, s };
}

// ─── Ma'lumot ───────────────────────────────────────────────────────────────

/** Sana satrida ba'zan vaqt ham bor («2026-10-02T10:00») — shuning uchun «< ertasi» */
const dayWhere = (from: string, to: string) => ({ gte: from, lt: addDays(to, 1) });

const CARD = new Set(['Card', 'Terminal']);
const ONLINE = new Set(['Click', 'Payme', 'Uzum']);

/** Kassa qoidasi: to'lov sanasi bo'yicha; avansdan yechilgani kassaga YANGI pul emas */
async function cashStats(prisma: any, clinicId: string, from: string, to: string) {
    const date = dayWhere(from, to);
    const [txs, refunds, expenses] = await Promise.all([
        prisma.transaction.findMany({ where: { clinicId, date, status: 'Paid' }, select: { amount: true, type: true } }),
        prisma.cashMovement.findMany({ where: { clinicId, date, type: 'Refund' }, select: { amount: true, method: true } }),
        /* Tasdiq kutayotgan xarajat hali pul emas (0048) */
        prisma.expense.findMany({ where: { clinicId, date, status: 'Approved' }, select: { amount: true, method: true, category: true } }),
    ]);
    let cash = 0, card = 0, online = 0, other = 0, fromBalance = 0;
    for (const t of txs) {
        const a = t.amount || 0, m = String(t.type || '');
        /* Qaytarish — tushum EMAS (Bosh sahifa ham chiqarib tashlaydi:
           reports.ts, notIn Refund/Balance). Qaytarilgan pul pastda alohida. */
        if (m === 'Refund') continue;
        if (m === 'Balance') fromBalance += a;
        else if (m === 'Cash') cash += a;
        else if (CARD.has(m)) card += a;
        else if (ONLINE.has(m)) online += a;
        else other += a;
    }
    /* Avansga qaytarish (Balance) — kassadan pul chiqmaydi */
    const outRefunds = refunds.filter((r: any) => String(r.method || 'Cash') !== 'Balance');
    const refund = outRefunds.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const refundCash = outRefunds.filter((r: any) => String(r.method || 'Cash') === 'Cash').reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const expense = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
    const cashExpense = expenses.filter((e: any) => String(e.method || 'Cash') === 'Cash').reduce((s: number, e: any) => s + (e.amount || 0), 0);
    return { cash, card, online, other, fromBalance, refund, refundCash, expense, cashExpense, inTill: cash + card + online + other };
}

async function apptStats(prisma: any, clinicId: string, from: string, to: string) {
    const rows = await prisma.appointment.findMany({
        where: { clinicId, date: dayWhere(from, to), status: { not: 'Requested' } },
        select: { status: true },
    });
    const by = (s: string) => rows.filter((r: any) => r.status === s).length;
    return { total: rows.length, completed: by('Completed'), noShow: by('No-Show'), cancelled: by('Cancelled') };
}

async function peopleStats(prisma: any, clinicId: string, from: string, to: string) {
    const created = { gte: new Date(`${from}T00:00:00+05:00`), lt: new Date(`${addDays(to, 1)}T00:00:00+05:00`) };
    const [visits, newPatients] = await Promise.all([
        prisma.visit.count({ where: { clinicId, date: { gte: from, lte: to }, status: { not: 'Cancelled' } } }),
        prisma.patient.count({ where: { clinicId, createdAt: created } }),
    ]);
    return { visits, newPatients };
}

// ─── Matn bo'laklari ────────────────────────────────────────────────────────

function cashLines(c: Awaited<ReturnType<typeof cashStats>>): string[] {
    const lines = [
        `💰 Kassaga tushdi: <b>${money(c.inTill)}</b> so'm`,
        `   naqd ${money(c.cash)} · karta ${money(c.card)}${c.online ? ` · Click/Payme ${money(c.online)}` : ''}${c.other ? ` · boshqa ${money(c.other)}` : ''}`,
    ];
    if (c.fromBalance) lines.push(`↪️ Avansdan yechildi: ${money(c.fromBalance)} so'm <i>(kassaga kirmaydi)</i>`);
    if (c.refund) lines.push(`🔙 Qaytarildi: ${money(c.refund)} so'm`);
    lines.push(`💸 Xarajat: <b>${money(c.expense)}</b> so'm${c.cashExpense && c.cashExpense !== c.expense ? ` (naqd ${money(c.cashExpense)})` : ''}`);
    return lines;
}

async function summaryBody(prisma: any, clinicId: string, from: string, to: string) {
    const [sum, cash, appts, people] = await Promise.all([
        summaryReport(prisma, clinicId, from, to),
        cashStats(prisma, clinicId, from, to),
        apptStats(prisma, clinicId, from, to),
        peopleStats(prisma, clinicId, from, to),
    ]);
    const t = sum.totals;
    const empty = !t.revenue && !cash.inTill && !cash.expense && !appts.total && !people.visits && !cash.fromBalance;
    const lines = [
        `👥 Qabullar: <b>${people.visits}</b> ta · yangi bemor: ${people.newPatients}`,
    ];
    if (appts.total) {
        lines.push(`🗓 Kalendarda: ${appts.total} ta yozuv · ✅ ${appts.completed} · ❌ kelmadi ${appts.noShow} · 🚫 bekor ${appts.cancelled}`);
    }
    lines.push(
        '',
        `🧾 Xizmatlar: <b>${money(t.revenue)}</b> so'm`,
        `   shundan to'langan: ${money(t.collected)} · qolgan: ${money(t.due)}`,
        ...cashLines(cash),
        `📈 Sof foyda: <b>${money(t.netProfit)}</b> so'm <i>(xizmatlar − xarajat)</i>`,
    );
    if (t.doctorShare) lines.push(`   shifokor ulushi: ${money(t.doctorShare)} so'm`);
    lines.push(`📌 Ochiq qarz (hozir): <b>${money(sum.openDebt?.amount || 0)}</b> so'm`);
    return { lines, empty, byDoctor: sum.byDoctor as { doctorName: string; revenue: number; count: number }[] };
}

async function doctorLines(prisma: any, clinicId: string, from: string, to: string, byDoctor: { doctorName: string; revenue: number; count: number }[], top: number): Promise<string[]> {
    const visits = await prisma.visit.findMany({
        where: { clinicId, date: { gte: from, lte: to }, status: { not: 'Cancelled' } },
        select: { doctorName: true },
    });
    const seen = new Map<string, number>();
    for (const v of visits) if (v.doctorName) seen.set(v.doctorName, (seen.get(v.doctorName) || 0) + 1);
    const names = new Set([...byDoctor.map(d => d.doctorName), ...seen.keys()]);
    const rows = [...names].map(n => ({ name: n, revenue: byDoctor.find(d => d.doctorName === n)?.revenue || 0, patients: seen.get(n) || 0 }))
        .sort((a, b) => b.revenue - a.revenue || b.patients - a.patients);
    if (!rows.length) return ["Bu davrda qabul ham, xizmat ham yo'q."];
    return rows.slice(0, top).map((r, i) => `${i + 1}. ${esc(r.name)} — <b>${money(r.revenue)}</b> so'm · ${r.patients} bemor`);
}

async function debtLines(prisma: any, clinicId: string): Promise<string[]> {
    const groups: any[] = await debtorGroups(prisma, clinicId);
    if (!groups.length) return ["📌 Qarzdor bemor yo'q — hammasi to'langan. ✅"];
    const ids = groups.slice(0, 20).map(g => g.patientId).filter(Boolean);
    const phones = ids.length ? await prisma.patient.findMany({ where: { clinicId, id: { in: ids } }, select: { id: true, phone: true } }) : [];
    const phoneOf = new Map(phones.map((p: any) => [p.id, p.phone]));
    const total = groups.reduce((s, g) => s + (g.due || 0), 0);
    const lines = [
        "📌 <b>Qarzdorlar</b> — hozirgi holat (davrga bog'liq emas)",
        `Jami: <b>${groups.length}</b> ta · <b>${money(total)}</b> so'm`,
        '',
        ...groups.slice(0, 20).map((g, i) => {
            const ph = g.patientId && phoneOf.get(g.patientId) ? ` · ${esc(phoneOf.get(g.patientId))}` : '';
            return `${i + 1}. ${esc(g.patientName)} — <b>${money(g.due)}</b> · ${ddmm(g.oldestDate)} dan${ph}`;
        }),
    ];
    if (groups.length > 20) lines.push(`… yana ${groups.length - 20} ta`);
    return lines;
}

async function noShowLines(prisma: any, clinicId: string, from: string, to: string): Promise<string[]> {
    const rows = await prisma.appointment.findMany({
        where: { clinicId, status: 'No-Show', date: dayWhere(from, to) },
        orderBy: [{ date: 'desc' }, { time: 'asc' }],
        take: 30,
        select: { date: true, time: true, patientName: true, doctorName: true, patient: { select: { phone: true } } },
    });
    if (!rows.length) return ['❌ <b>Kelmaganlar</b>', "Bu davrda kelmagan bemor yo'q. ✅"];
    return ['❌ <b>Kelmaganlar</b>', ...rows.map((r: any) =>
        `• ${ddmm(r.date)} ${esc(r.time)} — ${esc(r.patientName)} (${esc(r.doctorName)})${r.patient?.phone ? ` · ${esc(r.patient.phone)}` : ''}`)];
}

// ─── Ekranlar ───────────────────────────────────────────────────────────────

type Clinic = { id: string; name: string };

/** «📊 Hisobot» ekrani: matn + tugmalar. Tugma bosilganda shu xabar o'zgaradi. */
export async function buildReportScreen(prisma: any, clinic: Clinic, p: PeriodKey, s: ReportSection, today = tashkentDateStr()) {
    const range = periodRange(p, today);
    const head = [`📊 <b>Hisobot</b> · ${esc(clinic.name)}`, `🗓 ${range.label}`, ''];
    let body: string[];
    if (s === 'debt') body = await debtLines(prisma, clinic.id);
    else if (s === 'ns') body = await noShowLines(prisma, clinic.id, range.from, range.to);
    else if (s === 'cash') {
        const c = await cashStats(prisma, clinic.id, range.from, range.to);
        body = ['💰 <b>Kassa</b>', ...cashLines(c), `🧮 Naqd farqi: ${money(c.cash - c.cashExpense - c.refundCash)} so'm <i>(naqd tushum − naqd xarajat − naqd qaytarish)</i>`];
    } else {
        const sum = await summaryBody(prisma, clinic.id, range.from, range.to);
        if (s === 'doc') body = ["👨‍⚕️ <b>Shifokorlar bo'yicha</b>", ...(await doctorLines(prisma, clinic.id, range.from, range.to, sum.byDoctor, 25))];
        else body = sum.empty ? ["Bu davrda qabul ham, to'lov ham yo'q."] : sum.lines;
    }
    return { text: fitTelegram([...head, ...body]), keyboard: reportKeyboard(p, s) };
}

// ─── G'ayrioddiy kun (0052) ─────────────────────────────────────────────────

export type DayPoint = { revenue: number; visits: number; noShow: number };
const MIN_HISTORY_DAYS = 10;
const HISTORY_DAYS = 30;

const meanStd = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
    return { m, sd: Math.sqrt(v) };
};

/**
 * Sof funksiya (sinovlanadi). Faqat ish kunlari (qabul yoki tushum bo'lgan)
 * solishtiriladi — yopiq kunlar o'rtachani tushirmasin. Ma'lumot kam bo'lsa
 * (10 ish kunidan oz) — hech narsa demaydi. Faqat YOMON tomonga: tushum va
 * qabullar keskin past, kelmaganlar keskin ko'p.
 */
export function detectAnomalies(today: DayPoint, history: DayPoint[]): string[] {
    const work = history.filter(d => d.visits > 0 || d.revenue > 0);
    if (work.length < MIN_HISTORY_DAYS) return [];
    const out: string[] = [];
    const low = (key: 'revenue' | 'visits', label: string, unit: string) => {
        const { m, sd } = meanStd(work.map(d => d[key]));
        const floor = m - 2 * Math.max(sd, m * 0.1);
        if (m > 0 && today[key] < floor) {
            out.push(`📉 ${label} odatdagidan ancha past: <b>${money(today[key])}</b>${unit} (odatda ~${money(m)}${unit})`);
        }
    };
    low('revenue', 'Tushum (xizmatlar)', " so'm");
    low('visits', 'Qabullar', ' ta');
    const ns = meanStd(work.map(d => d.noShow));
    if (today.noShow >= 3 && today.noShow > ns.m + 2 * Math.max(ns.sd, 1)) {
        out.push(`❌ Kelmaganlar ko'p: <b>${today.noShow}</b> ta (odatda ~${ns.m.toFixed(1).replace('.0', '')})`);
    }
    return out;
}

async function anomalyLines(prisma: any, clinicId: string, day: string): Promise<string[]> {
    const from = addDays(day, -HISTORY_DAYS);
    const to = addDays(day, -1);
    const [sum, visits, noShows] = await Promise.all([
        summaryReport(prisma, clinicId, from, day),
        prisma.visit.findMany({ where: { clinicId, date: { gte: from, lte: day }, status: { not: 'Cancelled' } }, select: { date: true } }),
        prisma.appointment.findMany({ where: { clinicId, status: 'No-Show', date: dayWhere(from, day) }, select: { date: true } }),
    ]);
    const pt = new Map<string, DayPoint>();
    const at = (d: string) => { const k = String(d).slice(0, 10); if (!pt.has(k)) pt.set(k, { revenue: 0, visits: 0, noShow: 0 }); return pt.get(k)!; };
    for (const r of (sum.daily || []) as any[]) at(r.date).revenue += r.revenue || 0;
    for (const v of visits) at(v.date).visits++;
    for (const a of noShows) at(a.date).noShow++;
    const history: DayPoint[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) history.push(pt.get(d) || { revenue: 0, visits: 0, noShow: 0 });
    return detectAnomalies(pt.get(day) || { revenue: 0, visits: 0, noShow: 0 }, history);
}

/** Bir kunlik hisobot. Kun butunlay bo'sh bo'lsa (dam olish) — null: bo'sh xabar ketmaydi. */
export async function buildDailyReport(prisma: any, clinic: Clinic & { anomalyAlert?: boolean }, day: string, yesterday: boolean): Promise<string | null> {
    const sum = await summaryBody(prisma, clinic.id, day, day);
    if (sum.empty) return null;
    /* «⚠️ Diqqat» — g'ayrioddiy kun (0052). Xatosi hisobotni to'smaydi. */
    const warn = clinic.anomalyAlert === false ? [] : await anomalyLines(prisma, clinic.id, day).catch(() => [] as string[]);
    const lines = [
        `📊 <b>${yesterday ? 'Kechagi hisobot' : 'Kunlik hisobot'}</b> — ${ddmmyyyy(day)}`,
        esc(clinic.name),
        ...(warn.length ? ['', '⚠️ <b>Diqqat talab qiladi</b>', ...warn] : []),
        '',
        ...sum.lines,
    ];
    const docs = await doctorLines(prisma, clinic.id, day, day, sum.byDoctor, 5);
    if (sum.byDoctor.length || docs[0] !== "Bu davrda qabul ham, xizmat ham yo'q.") lines.push('', '👨‍⚕️ <b>Shifokorlar</b>', ...docs);
    lines.push('', 'Batafsil: «📊 Hisobot» tugmasi');
    return fitTelegram(lines);
}

/** Bemorning eslatmaga javobi (0051) — jadvalda belgisi */
const REPLY_ICON: Record<string, string> = { coming: ' · ✅ kelaman', cant: ' · ❌ kela olmayman' };

const STATUS_ICON: Record<string, string> = {
    Completed: '✅', 'No-Show': '❌', Confirmed: '🟢', 'Checked-In': '🚪', Pending: '🕐', Cancelled: '🚫',
};

/** Rahbarga: bugungi qabullar shifokorlar bo'yicha */
export async function buildTodayAppointments(prisma: any, clinic: Clinic, day = tashkentDateStr(), title = 'Bugungi qabullar'): Promise<string> {
    const [appts, walkIns] = await Promise.all([
        prisma.appointment.findMany({
            where: { clinicId: clinic.id, date: dayWhere(day, day), status: { notIn: ['Cancelled', 'Requested'] } },
            orderBy: [{ doctorName: 'asc' }, { time: 'asc' }],
            select: { time: true, patientName: true, doctorName: true, status: true, patientReply: true },
        }),
        prisma.visit.count({ where: { clinicId: clinic.id, date: day, appointmentId: null, status: { not: 'Cancelled' } } }),
    ]);
    const head = [`📋 <b>${esc(title)}</b> — ${ddmmyyyy(day)}`, esc(clinic.name), ''];
    if (!appts.length) return fitTelegram([...head, "Kalendarda yozuv yo'q.", ...(walkIns ? [`Navbatsiz kelganlar: ${walkIns} ta`] : [])]);
    const lines: string[] = [];
    let doc = '';
    for (const a of appts) {
        if (a.doctorName !== doc) { doc = a.doctorName; lines.push('', `👨‍⚕️ <b>${esc(doc || 'Shifokorsiz')}</b>`); }
        lines.push(`${STATUS_ICON[a.status] || '•'} ${esc(a.time)} — ${esc(a.patientName)}${REPLY_ICON[a.patientReply] || ''}`);
    }
    return fitTelegram([...head, `Jami: <b>${appts.length}</b> ta yozuv${walkIns ? ` · navbatsiz: ${walkIns}` : ''}`, ...lines]);
}

/** Shifokor jadvali — bugun yoki ertaga */
export async function buildDoctorSchedule(prisma: any, doctorId: string, day: string, title: string): Promise<string> {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { clinic: { select: { name: true } } } });
    if (!doctor) return "❌ Shifokor topilmadi.";
    const appts = await prisma.appointment.findMany({
        where: { doctorId, clinicId: doctor?.clinicId, date: dayWhere(day, day), status: { notIn: ['Cancelled', 'Requested'] } },
        orderBy: { time: 'asc' },
    });
    const who = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'Shifokor';
    const head = [`📅 <b>${title}</b> — ${ddmmyyyy(day)}`, `👨‍⚕️ ${esc(who)} — ${esc(doctor?.clinic?.name || '')}`, ''];
    if (!appts.length) return [...head, '✅ Yozuv yo\'q.'].join('\n');
    return fitTelegram([
        ...head,
        `Jami: <b>${appts.length}</b> ta qabul`,
        '',
        ...appts.flatMap((a: any, i: number) => [
            `${i + 1}. ${STATUS_ICON[a.status] || '🕐'} <b>${esc(a.time)}</b> — ${esc(a.patientName)}${REPLY_ICON[a.patientReply] || ''}`,
            ...(a.type ? [`   📋 ${esc(a.type)}`] : []),
            ...(a.notes ? [`   📝 ${esc(String(a.notes).slice(0, 60))}`] : []),
        ]),
    ]);
}

// ─── Shifokorga qabul xabari ───────────────────────────────────────────────

export type ApptRef = { id?: string; clinicId: string; doctorId?: string | null; patientName: string; date: string; time: string; type?: string | null; status?: string };
export type DoctorNotice = 'new' | 'moved' | 'cancelled' | 'transferredIn' | 'transferredOut';

export function doctorNoticeText(kind: DoctorNotice, a: ApptRef, before?: ApptRef): string {
    const when = (x: ApptRef) => `${ddmmyyyy(x.date)} ${esc(x.time)}`;
    const svc = a.type ? `\n📋 ${esc(a.type)}` : '';
    switch (kind) {
        case 'new': return `🆕 <b>Yangi qabul</b>\n🗓 ${when(a)}\n👤 ${esc(a.patientName)}${svc}`;
        case 'moved': return `🔄 <b>Qabul ko'chirildi</b>\n👤 ${esc(a.patientName)}\n🗓 ${before ? `<s>${when(before)}</s> → ` : ''}<b>${when(a)}</b>${svc}`;
        case 'cancelled': return `🚫 <b>Qabul bekor qilindi</b>\n🗓 ${when(a)}\n👤 ${esc(a.patientName)}`;
        case 'transferredIn': return `➡️ <b>Sizga qabul o'tkazildi</b>\n🗓 ${when(a)}\n👤 ${esc(a.patientName)}${svc}`;
        case 'transferredOut': return `↩️ <b>Qabul boshqa shifokorga o'tkazildi</b>\n🗓 ${when(before || a)}\n👤 ${esc(a.patientName)}`;
    }
}

type SendHtml = (clinicId: string, chatId: string, html: string, replyMarkup?: any) => Promise<{ success: boolean }>;

/**
 * Registrator qabulni yozdi / ko'chirdi / boshqa shifokorga o'tkazdi / bekor qildi.
 * Faqat: klinika sozlamasi yoqiq, shifokor Telegram ulagan, qabul bugun yoki
 * keyin (o'tgan kunni tahrirlash shifokorni bezovta qilmasin). Xato bo'lsa
 * jim — qabulning o'zi saqlangan.
 */
export async function notifyDoctorAppointment(prisma: any, send: SendHtml, after: ApptRef | null, before: ApptRef | null): Promise<void> {
    try {
        const ref = after || before;
        if (!ref) return;
        const clinic = await prisma.clinic.findUnique({ where: { id: ref.clinicId }, select: { doctorNotify: true, botToken: true } });
        if (!clinic?.doctorNotify || !clinic.botToken) return;
        const today = tashkentDateStr();
        const live = (x: ApptRef | null) => !!x && x.status !== 'Cancelled' && x.status !== 'Requested';
        const upcoming = (x: ApptRef | null) => !!x && String(x.date).slice(0, 10) >= today;

        const jobs: { doctorId: string; text: string }[] = [];
        if (!before && live(after) && upcoming(after) && after!.doctorId) {
            jobs.push({ doctorId: after!.doctorId, text: doctorNoticeText('new', after!) });
        } else if (before && (!after || (live(before) && !live(after)))) {
            if (before.doctorId && upcoming(before) && live(before)) jobs.push({ doctorId: before.doctorId, text: doctorNoticeText('cancelled', before) });
        } else if (before && after && !live(before) && live(after)) {
            /* Bekor qilingan qayta tiklandi yoki so'rov tasdiqlandi — shifokorga yangi qabul */
            if (after.doctorId && upcoming(after)) jobs.push({ doctorId: after.doctorId, text: doctorNoticeText('new', after) });
        } else if (before && after && live(after)) {
            if (before.doctorId !== after.doctorId) {
                if (after.doctorId && upcoming(after)) jobs.push({ doctorId: after.doctorId, text: doctorNoticeText('transferredIn', after) });
                if (before.doctorId && upcoming(before)) jobs.push({ doctorId: before.doctorId, text: doctorNoticeText('transferredOut', after, before) });
            } else if ((before.date !== after.date || before.time !== after.time) && after.doctorId && (upcoming(after) || upcoming(before))) {
                jobs.push({ doctorId: after.doctorId, text: doctorNoticeText('moved', after, before) });
            }
        }
        if (!jobs.length) return;
        const doctors = await prisma.doctor.findMany({
            where: { id: { in: jobs.map(j => j.doctorId) }, clinicId: ref.clinicId, telegramChatId: { not: null } },
            select: { id: true, telegramChatId: true },
        });
        const chatOf = new Map<string, string>(doctors.map((d: any) => [d.id, d.telegramChatId as string]));
        for (const j of jobs) {
            const chat = chatOf.get(j.doctorId);
            if (chat) await send(ref.clinicId, chat, j.text).catch(() => null);
        }
    } catch (e: any) {
        console.error('Shifokorga qabul xabari:', e?.message || e);
    }
}

// ─── Registratorga xabar ───────────────────────────────────────────────────

/**
 * Telegram ulagan faol registratorlarga. Hech kim ulanmagan bo'lsa va
 * `ownerFallback` — rahbarga (bemor «kela olmayman» degani yo'qolmasin).
 * Qaytaradi: nechta odamga yetdi.
 */
export async function notifyReception(prisma: any, send: SendHtml, clinicId: string, build: (showPhone: boolean) => string, ownerFallback = false): Promise<number> {
    try {
        const recs = await prisma.receptionist.findMany({
            where: { clinicId, status: 'Active', telegramChatId: { not: null } },
            select: { telegramChatId: true },
        });
        /* Telefon — faqat Ruxsatlarda registratorga «telefon» ochiq bo'lsa */
        const showPhone = recs.length ? (await receptionPerms(prisma, clinicId)).flag('patients', 'phone') : true;
        let n = 0;
        for (const r of recs) if ((await send(clinicId, r.telegramChatId, build(showPhone)).catch(() => ({ success: false }))).success) n++;
        if (!recs.length && ownerFallback) {
            const c = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { telegramChatId: true } });
            if (c?.telegramChatId && (await send(clinicId, c.telegramChatId, build(true)).catch(() => ({ success: false }))).success) n++;
        }
        return n;
    } catch (e: any) {
        console.error('Registratorga xabar:', e?.message || e);
        return 0;
    }
}

/** Saytdan yoki botdan kelgan so'rov — registratorga */
export function bookingRequestText(a: { patientName: string; date: string; time: string; doctorName?: string | null; notes?: string | null }, showPhone = true, source: 'site' | 'bot' = 'site'): string {
    const phone = showPhone ? /(\+?\d[\d\s]{8,})/.exec(String(a.notes || ''))?.[1]?.trim() : null;
    const head = source === 'bot' ? "🤖 <b>Telegram botdan yangi so'rov</b>" : "🌐 <b>Saytdan yangi so'rov</b>";
    return `${head}\n👤 ${esc(a.patientName)}${phone ? ` · ${esc(phone)}` : ''}\n👨‍⚕️ ${esc(a.doctorName || '')}\n🗓 ${ddmmyyyy(a.date)} ${esc(a.time)}\n\nKalendar → «So'rovlar» dan tasdiqlang.`;
}

/** Bemor eslatmaga «kela olmayman» dedi — registratorga */
export function cantComeText(a: { patientName: string; date: string; time: string; doctorName?: string | null }, phone?: string | null): string {
    return `❌ <b>Bemor kela olmaydi</b>\n👤 ${esc(a.patientName)}${phone ? ` · ${esc(phone)}` : ''}\n👨‍⚕️ ${esc(a.doctorName || '')}\n🗓 ${ddmmyyyy(a.date)} ${esc(a.time)}\n\nQo'ng'iroq qilib, boshqa vaqtga yozing yoki qabulni bekor qiling.`;
}

// ─── Jadval bo'yicha yuborish ──────────────────────────────────────────────

const MORNING_FROM = '08:00';
const MORNING_UNTIL = '12:00';

/**
 * Har daqiqada. Rahbarning kunlik hisoboti — sozlangan vaqtda, bir marta.
 * O'sha paytda kompyuter o'chiq bo'lgan bo'lsa: ertasi kuni (hisobot
 * vaqtidan oldin yoqilganda) «Kechagi hisobot». Kun belgisi avval
 * «egallanadi» (shartli yangilash) — ikki jarayon bir hisobotni ikki marta
 * yubormaydi.
 */
export function decideDailyReport(sentFor: string | null, time: string, hm: string, today: string): { day: string; yesterday: boolean } | null {
    if (sentFor === today) return null;
    const t = HM_RE.test(time || '') ? time : '22:00';
    if (hm >= t) return { day: today, yesterday: false };
    const yesterday = addDays(today, -1);
    if (sentFor && sentFor < yesterday) return { day: yesterday, yesterday: true };
    return null;
}

/** Yuborilmagan hisobot uchun qayta urinishlar: «klinika:kun» → son (xotirada) */
const retries = new Map<string, number>();
const MAX_RETRIES = 60;
const mayRetry = (key: string) => {
    const n = (retries.get(key) || 0) + 1;
    retries.set(key, n);
    if (retries.size > 500) retries.clear();
    return n <= MAX_RETRIES;
};

export async function runOwnerDailyReports(prisma: any, send: SendHtml): Promise<void> {
    const clinics = await prisma.clinic.findMany({
        where: { ownerReportEnabled: true, telegramChatId: { not: null }, botToken: { not: null }, status: 'Active' },
        select: { id: true, name: true, telegramChatId: true, ownerReportTime: true, ownerReportSentFor: true, anomalyAlert: true },
    });
    const today = tashkentDateStr();
    const hm = tashkentHm();
    for (const c of clinics) {
        try {
            const pick = decideDailyReport(c.ownerReportSentFor, c.ownerReportTime, hm, today);
            if (!pick) continue;
            const { day, yesterday: isYesterday } = pick;
            const claimed = await prisma.clinic.updateMany({
                where: { id: c.id, OR: [{ ownerReportSentFor: null }, { ownerReportSentFor: { lt: day } }] },
                data: { ownerReportSentFor: day },
            });
            if (!claimed.count) continue;
            const text = await buildDailyReport(prisma, c, day, isYesterday);
            if (!text) continue;   // bo'sh kun — yubormaymiz, belgi qoladi
            const r = await send(c.id, c.telegramChatId, text);
            /* Internet yo'q yoki bot hali ko'tarilmagan — kun YO'QOLMASIN:
               belgi avvalgi holatiga qaytadi, keyingi daqiqada yana urinadi */
            if (!r.success && mayRetry(`r:${c.id}:${day}`)) {
                await prisma.clinic.updateMany({ where: { id: c.id, ownerReportSentFor: day }, data: { ownerReportSentFor: c.ownerReportSentFor } });
            }
        } catch (e: any) {
            console.error(`Kunlik hisobot (${c.id}):`, e?.message || e);
        }
    }
}

/** Har 5 daqiqada: 08:00–12:00 oralig'ida, kuniga bir marta — shifokorlarga bugungi jadval */
export async function runDoctorMorning(prisma: any, send: SendHtml): Promise<void> {
    const hm = tashkentHm();
    if (hm < MORNING_FROM || hm >= MORNING_UNTIL) return;
    const today = tashkentDateStr();
    const clinics = await prisma.clinic.findMany({
        where: { botToken: { not: null }, status: 'Active', OR: [{ doctorMorningSentOn: null }, { doctorMorningSentOn: { not: today } }] },
        select: { id: true },
    });
    for (const c of clinics) {
        const claimed = await prisma.clinic.updateMany({
            where: { id: c.id, OR: [{ doctorMorningSentOn: null }, { doctorMorningSentOn: { not: today } }] },
            data: { doctorMorningSentOn: today },
        });
        if (!claimed.count) continue;
        const doctors = await prisma.doctor.findMany({
            where: { clinicId: c.id, status: 'Active', telegramChatId: { not: null } },
            select: { id: true, telegramChatId: true },
        });
        let delivered = 0;
        for (const d of doctors) {
            try {
                const r = await send(c.id, d.telegramChatId, await buildDoctorSchedule(prisma, d.id, today, 'Bugungi jadvalingiz'));
                if (r.success) delivered++;
            } catch (e: any) {
                console.error(`Ertalabki jadval (${d.id}):`, e?.message || e);
            }
        }
        /* Hech kimga yetmadi (bot/internet yo'q) — belgi qaytadi, 5 daqiqadan keyin yana */
        if (doctors.length && !delivered && mayRetry(`m:${c.id}:${today}`)) {
            await prisma.clinic.updateMany({ where: { id: c.id, doctorMorningSentOn: today }, data: { doctorMorningSentOn: null } });
        }
    }
}

// ─── Sozlamalar: kim ulangan, kunlik hisobot, shifokorga xabar ─────────────

export function registerOwnerBotRoutes(app: any, deps: {
    prisma: any; authenticateToken: any; getScopedClinicId: (req: any) => string | null;
    botUsername: (clinicId: string) => Promise<string | null>;
}) {
    const { prisma, authenticateToken: auth, getScopedClinicId } = deps;
    const isOwner = (req: any) => req?.user?.role === 'CLINIC_ADMIN';

    /** Telegram bot kartasi: rahbar va shifokorlar ulanganmi, sozlamalar */
    app.get('/api/clinics/:id/telegram-bot', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId || clinicId !== req.params.id || !isOwner(req)) return res.status(403).json({ error: "Ruxsat yo'q" });
            const [c, doctors, receptionists] = await Promise.all([
                prisma.clinic.findUnique({
                    where: { id: clinicId },
                    select: { botToken: true, telegramChatId: true, ownerPhone: true, ownerReportEnabled: true, ownerReportTime: true, doctorNotify: true, anomalyAlert: true },
                }),
                prisma.doctor.findMany({
                    where: { clinicId, status: 'Active' },
                    select: { id: true, firstName: true, lastName: true, phone: true, telegramChatId: true },
                    orderBy: { lastName: 'asc' },
                }),
                prisma.receptionist.findMany({
                    where: { clinicId, status: 'Active' },
                    select: { id: true, firstName: true, lastName: true, phone: true, telegramChatId: true },
                    orderBy: { lastName: 'asc' },
                }),
            ]);
            res.json({
                botConnected: !!c?.botToken,
                botUsername: c?.botToken ? await deps.botUsername(clinicId).catch(() => null) : null,
                owner: { linked: !!c?.telegramChatId, phone: c?.ownerPhone || null },
                doctors: doctors.map((d: any) => ({ id: d.id, name: `${d.firstName} ${d.lastName}`.trim(), hasPhone: !!d.phone, linked: !!d.telegramChatId })),
                receptionists: receptionists.map((d: any) => ({ id: d.id, name: `${d.firstName} ${d.lastName}`.trim(), hasPhone: !!d.phone, linked: !!d.telegramChatId })),
                ownerReportEnabled: !!c?.ownerReportEnabled,
                ownerReportTime: c?.ownerReportTime || '22:00',
                doctorNotify: !!c?.doctorNotify,
                anomalyAlert: !!c?.anomalyAlert,
            });
        } catch (e: any) {
            res.status(500).json({ error: e?.message || 'Xatolik' });
        }
    });

    /** Botga ketadigan hisobot namunasi — xuddi shu matn (HTML) */
    app.get('/api/clinics/:id/telegram-bot/preview', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId || clinicId !== req.params.id || !isOwner(req)) return res.status(403).json({ error: "Ruxsat yo'q" });
            const p = PERIODS.includes(req.query.p) ? req.query.p : 'd';
            const s = SECTIONS.includes(req.query.s) ? req.query.s : 'sum';
            const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
            const screen = await buildReportScreen(prisma, clinic, p, s);
            res.json({ html: screen.text });
        } catch (e: any) {
            res.status(500).json({ error: e?.message || 'Xatolik' });
        }
    });

    app.put('/api/clinics/:id/telegram-bot', auth, async (req: any, res: any) => {
        try {
            const clinicId = getScopedClinicId(req);
            if (!clinicId || clinicId !== req.params.id || !isOwner(req)) return res.status(403).json({ error: "Ruxsat yo'q" });
            const b = req.body || {};
            const data: any = {};
            if (b.ownerReportEnabled !== undefined) data.ownerReportEnabled = b.ownerReportEnabled === true;
            if (b.doctorNotify !== undefined) data.doctorNotify = b.doctorNotify === true;
            if (b.anomalyAlert !== undefined) data.anomalyAlert = b.anomalyAlert === true;
            if (b.ownerReportTime !== undefined) {
                if (!HM_RE.test(String(b.ownerReportTime))) return res.status(400).json({ error: "Vaqt noto'g'ri (masalan 22:00)" });
                data.ownerReportTime = String(b.ownerReportTime);
            }
            const c = await prisma.clinic.update({
                where: { id: clinicId }, data,
                select: { ownerReportEnabled: true, ownerReportTime: true, doctorNotify: true, anomalyAlert: true },
            });
            res.json({ success: true, ...c });
        } catch (e: any) {
            res.status(500).json({ error: e?.message || 'Xatolik' });
        }
    });
}
