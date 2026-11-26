/* XABARLAR SAHIFASINING UMUMIY QISMLARI.

   Ilgari hammasi `pages/MessagesManagement.tsx` ichida (1656 qator) edi.
   Endi har tab o'z faylida, bu yerda esa ular baham ko'radigan narsalar:
   o'zgaruvchilar ro'yxati, trigger belgilari, kanal yorliqlari, Eskiz
   holati va kichik ko'rinish bo'laklari.

   EMOJI YO'Q. Ilgari kanal tugmalari «✈️→📱», qoida qatori «⏰», segment
   chiplari «👩» edi — har kompyuterda har xil chiziladi va sahifani
   o'yinchoqqa o'xshatardi. Endi hamma joyda bir xil lucide belgilar. */
import React from 'react';
import {
    AlarmClock, CalendarPlus, Cake, UserX, MessageCircle, UserPlus, Wallet,
    RotateCcw, Receipt, Zap, Send, Smartphone, type LucideIcon,
} from 'lucide-react';
import type { AudienceSegment, MessageChannel } from '../../types';
import { tr, fill } from '../../context/LanguageContext';

// ── Shablon o'zgaruvchilari (backend processTemplate bilan mos) ──
/* FUNKSIYA, jadval emas: `tr()` modul yuklanganda bir marta chaqirilsa,
   til almashganda yorliqlar eski tilda qolib ketardi. */
export const templateVars = (): { token: string; label: string }[] => [
    { token: '{bemor_ismi}', label: tr('msg.var.firstName') },
    { token: '{bemor_familyasi}', label: tr('msg.var.lastName') },
    { token: '{sana}', label: tr('msg.var.date') },
    { token: '{vaqt}', label: tr('msg.var.time') },
    { token: '{klinika_nomi}', label: tr('msg.var.clinic') },
    { token: '{shifokor_ismi}', label: tr('msg.var.doctor') },
    { token: '{qarz}', label: tr('msg.var.debt') },
];

const varLabels = (): Record<string, string> =>
    Object.fromEntries(templateVars().map(v => [v.token.slice(1, -1), v.label]));

/* NOMA'LUM TOKENLARNI TOPISH.
   Bazadagi eski shablonlar `{ism}` va `{summa}` bilan yaratilgan edi —
   ular almashtirilmaydi va bemor «Hurmatli {ism}» degan SMS oladi.
   Muharrir yozayotgan paytda ogohlantiradi: SMS ketib bo'lgandan keyin kech. */
export function unknownTokens(text: string): string[] {
    const found = new Set<string>();
    const known = varLabels();
    for (const m of String(text || '').matchAll(/\{([^{}]+)\}/g)) {
        if (!known[m[1]]) found.add(m[1]);
    }
    return Array.from(found);
}

/** Shablon matni: `{bemor_ismi}` xom qavs emas, «Bemor ismi» degan rangli
 *  bo'lak bo'lib ko'rinadi. Noma'lum token — qizil, ko'zga tashlansin. */
export const TokenText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
    const parts = String(text || '').split(/(\{[^{}]+\})/g);
    const labels = varLabels();
    return (
        <p className={`whitespace-pre-wrap break-words ${className}`}>
            {parts.map((p, i) => {
                const m = /^\{([^{}]+)\}$/.exec(p);
                if (!m) return <React.Fragment key={i}>{p}</React.Fragment>;
                const label = labels[m[1]];
                return (
                    <span key={i} title={p}
                        className={`inline-block mx-px px-1.5 rounded-md text-[0.92em] font-medium leading-[1.45] ${label
                            ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300'
                            : 'bg-danger-500/12 text-danger'}`}>
                        {label || p}
                    </span>
                );
            })}
        </p>
    );
};

/** O'zgaruvchi qo'shish tugmalari (shablon va qo'lda xabar uchun) */
export const VarButtons: React.FC<{ onInsert: (token: string) => void }> = ({ onInsert }) => (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr('msg.var.insert')}>
        {templateVars().map(v => (
            <button key={v.token} type="button" onClick={() => onInsert(v.token)} title={v.token}
                className="h-7 px-2.5 text-xs font-medium text-primary-700 dark:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 rounded-lg transition-colors">
                + {v.label}
            </button>
        ))}
    </div>
);

/** Noma'lum o'zgaruvchi ogohlantirishi — matn tagida */
export const UnknownTokenWarning: React.FC<{ text: string }> = ({ text }) => {
    const bad = unknownTokens(text);
    if (bad.length === 0) return null;
    return (
        <p role="alert" className="text-xs text-danger">
            {fill(tr('msg.unknownVar'), bad.map(b => `{${b}}`).join(', '))}
        </p>
    );
};

// ── Triggerlar ──
// Ro'yxat backenddan keladi (backend/triggers.ts) — bu yerda faqat belgilar.
const TRIGGER_ICONS: Record<string, LucideIcon> = {
    appointment_booked: CalendarPlus,
    before_appointment: AlarmClock,
    birthday: Cake,
    no_show: UserX,
    after_appointment: MessageCircle,
    new_patient: UserPlus,
    payment_received: Wallet,
    recall: RotateCcw,
    debt_reminder: Receipt,
};
export const triggerIcon = (id: string): LucideIcon => TRIGGER_ICONS[id] || Zap;

export const offsetUnitLabel = (unit: 'hour' | 'day' | 'month') =>
    unit === 'hour' ? tr('visit.hours') : unit === 'day' ? tr('ui.kun') : tr('msg.unit.month');

/** «2 soat» / «Darhol» */
export const offsetText = (value: number, unit: 'hour' | 'day' | 'month') =>
    value === 0 ? tr('msg.offset.now') : `${value} ${offsetUnitLabel(unit)}`;

// ── Kanallar ──
export const channelOptions = (): { value: MessageChannel; label: string; hint: string }[] => [
    { value: 'telegram_first', label: tr('messagesmanagement.avval_telegram'), hint: tr('messagesmanagement.bemor_botga_ulangan_bolsa') },
    { value: 'telegram', label: 'Telegram', hint: tr('messagesmanagement.faqat_telegram_botga_ulanmagan') },
    { value: 'sms', label: 'SMS', hint: tr('messagesmanagement.faqat_sms_har_bir') },
    { value: 'both', label: tr('msg.channel.both'), hint: tr('messagesmanagement.telegram_va_sms_ikkalasi') },
];

export const channelLabel = (c: MessageChannel | string): string =>
    c === 'sms' ? 'SMS'
        : c === 'telegram' ? 'Telegram'
            : c === 'telegram_first' ? tr('messagesmanagement.avval_telegram_keyin_sms')
                : 'Telegram + SMS';

/** Kanal belgisi: Telegram — qog'oz samolyot, SMS — telefon */
export const ChannelIcon: React.FC<{ channel: MessageChannel | string; className?: string }> = ({ channel, className = 'w-3.5 h-3.5' }) =>
    channel === 'sms' ? <Smartphone className={className} aria-hidden="true" /> : <Send className={className} aria-hidden="true" />;

/** Kichik kanal yorlig'i — qoida va tarix qatorlarida */
export const ChannelTag: React.FC<{ channel: MessageChannel | string }> = ({ channel }) => (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-elevated text-xs font-medium text-muted">
        <ChannelIcon channel={channel} className="w-3 h-3" />
        {channelLabel(channel)}
    </span>
);

/** Xabar manbai — Tarix qatorida. Noma'lum bo'lsa — hech narsa
 *  (ilgari «SMS ()» degan bo'sh qavs chiqardi). */
const sourceLabels = (): Record<string, string> => ({
    manual: tr('msg.source.manual'),
    bulk: tr('msg.source.manual'),
    auto: tr('messagesmanagement.avtomatik'),
    scheduled: tr('messagesmanagement.jadval_boyicha'),
    appointment_booked: tr('messages.trigger.booked'),
    before_appointment: tr('messagesmanagement.qabuldan_oldin'),
    after_appointment: tr('messagesmanagement.qabuldan_keyin'),
    new_patient: tr('reception.newPatient'),
    payment_received: tr('msg.source.payment'),
    recall: tr('msg.source.recall'),
    debt_reminder: tr('messagesmanagement.qarz_eslatma'),
    debt: tr('messagesmanagement.qarz_eslatma'),
    birthday: tr('messagesmanagement.tugilgan_kun'),
    noshow: tr('messagesmanagement.kelmagan_bemor'),
    no_show: tr('messagesmanagement.kelmagan_bemor'),
    test: 'Test',
    retry: tr('messagesmanagement.qayta_yuborish'),
    // Eski yozuvlarda manba o'rniga tur (type) turadi
    Reminder: tr('msg.source.reminder'),
    Birthday: tr('messagesmanagement.tugilgan_kun'),
    DebtReminder: tr('messagesmanagement.qarz_eslatma'),
    Followup: tr('messagesmanagement.qabuldan_keyin'),
    Manual: tr('msg.source.manual'),
});
export const sourceLabel = (source?: string | null, type?: string | null): string => {
    const labels = sourceLabels();
    return (source && (labels[source] || source)) || (type && labels[type]) || '';
};

// ── Eskiz holati ──
/* Eskiz'dan qaytgan xom holatni o'qiladigan yorliqqa aylantiradi.
   moderation / inproccess — moderatsiyada; service / reklama — tasdiqlangan.
   Hujjatda yo'q yozilishlar kalit so'zlar bo'yicha taxmin qilinadi
   (backend/eskizTemplates.ts dagi isApprovedStatus bilan bir xil qoida). */
export type Tone = 'success' | 'warning' | 'danger' | 'neutral';
export function eskizStatusBadge(status?: string | null): { label: string; tone: Tone } | null {
    if (!status) return null;
    const s = status.trim().toLowerCase();
    if (s === 'error') return { label: tr('messagesmanagement.yuborishda_xatolik'), tone: 'danger' };
    if (s === 'not_found') return { label: tr('messagesmanagement.eskizda_topilmadi'), tone: 'neutral' };
    if (s === 'service') return { label: tr('messages.eskiz.approvedService'), tone: 'success' };
    if (s === 'reklama') return { label: tr('messages.eskiz.approvedAd'), tone: 'success' };
    if (s === 'moderation' || s === 'inproccess' || s === 'inprocess') return { label: tr('messages.eskiz.moderation'), tone: 'warning' };
    if (/(declin|reject|rad)/.test(s)) return { label: fill(tr('messagesmanagement.rad_etildi_x'), status), tone: 'danger' };
    if (/\b(confirm|approv|activ|tasdiq)/.test(s)) return { label: fill(tr('messages.eskiz.approvedX'), status), tone: 'success' };
    return { label: fill(tr('messages.eskiz.moderationX'), status), tone: 'warning' };
}

const TONE_CLS: Record<Tone, string> = {
    success: 'bg-success-500/12 text-success',
    warning: 'bg-warning-500/15 text-warning-700 dark:text-warning-300',
    danger: 'bg-danger-500/12 text-danger',
    neutral: 'bg-elevated text-muted',
};

/** Holat yorlig'i — rang yolg'iz emas, doim so'z bilan */
export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; icon?: LucideIcon; title?: string }> = ({ tone, children, icon: Icon, title }) => (
    <span title={title} className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-semibold whitespace-nowrap ${TONE_CLS[tone]}`}>
        {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
        {children}
    </span>
);

/** Yoqish/o'chirish tugmasi. O'chiq holati `bg-line` — ilgari `bg-elevated`
 *  edi va oq fonda deyarli ko'rinmasdi. */
export const Toggle: React.FC<{ on: boolean; onChange: () => void; label: string; disabled?: boolean }> = ({ on, onChange, label, disabled }) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={onChange} disabled={disabled}
        className={`relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${on ? 'bg-success-500' : 'bg-line'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
);

// ── Forma uslublari ──
export const inputCls = 'w-full h-10 px-3 bg-surface border border-line rounded-xl text-sm text-ink outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 placeholder:text-faint';
export const textareaCls = 'w-full px-3 py-2.5 bg-surface border border-line rounded-xl text-sm text-ink leading-relaxed outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 placeholder:text-faint';
export const labelCls = 'block text-xs font-semibold text-muted mb-1.5';

/** Ikonali kichik tugma (tahrirlash / o'chirish) */
export const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; label: string }> = ({ danger, label, className = '', children, ...props }) => (
    <button type="button" aria-label={label} title={label} {...props}
        className={`w-8 h-8 inline-flex items-center justify-center rounded-lg text-faint transition-colors disabled:opacity-50 ${danger
            ? 'hover:text-danger hover:bg-danger-500/10'
            : 'hover:text-ink hover:bg-elevated'} ${className}`}>
        {children}
    </button>
);

/**
 * Eski formatdagi segmentni shartlar ro'yxatiga aylantiradi.
 * Server ham shunday qiladi (backend/segments.ts normalizeSegment) —
 * bu yerda faqat forma to'g'ri ko'rinishi uchun.
 */
export function toConditionSegment(seg?: AudienceSegment | null): AudienceSegment {
    if (seg && Array.isArray(seg.conditions)) return seg;
    const conditions: AudienceSegment['conditions'] = [];
    if (!seg || seg.status !== 'All') conditions.push({ field: 'status', op: 'eq', value: 'Active' });
    if (seg?.doctorId) conditions.push({ field: 'doctorId', op: 'eq', value: seg.doctorId });
    if (seg?.inactiveMonths) {
        conditions.push({
            field: 'lastVisit',
            op: seg.includeNeverVisited ? 'before_or_never' : 'before',
            value: seg.inactiveMonths,
        });
    }
    if (seg?.debtors) conditions.push({ field: 'hasDebt', op: 'is_true' });
    if (seg?.birthdayToday) conditions.push({ field: 'birthdayToday', op: 'is_true' });
    if (seg?.birthdayMonth) conditions.push({ field: 'birthdayMonth', op: 'eq', value: 'current' });
    return { match: 'all', conditions };
}

/** Bo'sh holat — tab hali to'ldirilmagan */
export const EmptyState: React.FC<{ icon: LucideIcon; title: string; hint?: string; action?: React.ReactNode }> = ({ icon: Icon, title, hint, action }) => (
    <div className="card px-6 py-12 flex flex-col items-center text-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-elevated flex items-center justify-center text-faint">
            <Icon className="w-6 h-6" aria-hidden="true" />
        </span>
        <div>
            <p className="font-semibold text-ink">{title}</p>
            {hint && <p className="text-sm text-muted mt-1 max-w-md">{hint}</p>}
        </div>
        {action}
    </div>
);
