import React, { useMemo, useState } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import { useLanguage, fill } from '../../context/LanguageContext';
import { formatMoney } from '../../utils/format';

/* ─────────────────────────────────────────────────────────────────────────────
   XIZMATLAR — KATTA TUGMALAR.

   MUAMMO (klinikadan kelgan so'rov). To'lov oynasida xizmat faqat QIDIRUV
   orqali tanlanardi: maydonga nomini yozish, sakkizta natijadan topish.
   Kompyuterda sekin yozadigan hamshira uchun bu — ukol uchun chek chiqarishda
   eng ko'p vaqt ketadigan qadam edi.

   ENDI: xizmatlar darhol ko'rinadi, bosilsa — qo'shiladi, yana bosilsa —
   miqdor oshadi. Yozish shart emas; qidiruv qoladi, lekin u yordamchi.

   KO'P ISHLATILADIGANI TEPADA. Muolaja xonasida kun bo'yi uch-to'rtta xizmat
   aylanadi. Qaysilari ekanini sozlamadan so'ramaymiz — to'lov o'tgan sari
   shu kompyuter o'zi eslab qoladi (`localStorage`) va ularni birinchi qatorga
   chiqaradi. Bu faqat TARTIB: narx va ro'yxat serverdan.
   ───────────────────────────────────────────────────────────────────────────── */

export type ServiceOption = {
    id?: number;
    name: string;
    price: number;
    category?: { id: string; name: string } | null;
};

/** Xizmatning barqaror kaliti — tanlangan qator shunga tayanadi. NARX kalitga
 *  kirmaydi: oyna ochiq turganda ega narxni tuzatsa, tanlangan qator
 *  «yo'qolib», o'rniga ikkinchisi paydo bo'lmasin. */
export const serviceKey = (s: { id?: number; name: string }) =>
    (s.id != null ? `id:${s.id}` : `name:${s.name}`);

const USAGE_KEY = 'xclinic.payment.usage.v1';
/** Ekranda bir vaqtda chiziladigan tugmalar soni — qolgani qidiruv bilan */
const MAX_TILES = 60;

function readUsage(): Record<string, number> {
    try {
        const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

/** To'lov o'tgach chaqiriladi: shu xizmatlar keyingi safar tepada turadi */
export function rememberServiceUsage(names: string[]): void {
    try {
        const usage = readUsage();
        const next = { ...usage };
        for (const name of names) next[name] = (next[name] || 0) + 1;
        localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
        /* Xotira yopiq (maxfiy rejim) — tartib oddiy qoladi, to'lovga ta'siri yo'q */
    }
}

type Props = {
    services: ServiceOption[];
    /** Xizmat kaliti → tanlangan miqdor */
    quantities: Record<string, number>;
    onAdd: (s: ServiceOption) => void;
    onRemoveOne: (s: ServiceOption) => void;
    disabled?: boolean;
};

export function ServiceTiles({ services, quantities, onAdd, onRemoveOne, disabled = false }: Props) {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [categoryId, setCategoryId] = useState('');

    /* Tartib oyna ochilganda bir marta olinadi: to'lov paytida tugmalar
       joyidan sakrab ketmasligi kerak. */
    const usage = useMemo(readUsage, []);

    const categories = useMemo(() => {
        const seen = new Map<string, string>();
        for (const s of services) {
            if (s.category?.id && !seen.has(s.category.id)) seen.set(s.category.id, s.category.name);
        }
        return Array.from(seen, ([id, name]) => ({ id, name }));
    }, [services]);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        /* Narxi yo'q xizmat ko'rsatilmaydi: server nol summali qatorni
           yaratmaydi va to'lov yarim yo'lda — qulflangan forma bilan — to'xtardi. */
        const list = services.filter(s =>
            s.price > 0
            && (!q || s.name.toLowerCase().includes(q))
            && (!categoryId || s.category?.id === categoryId));
        /* `sort` barqaror: bir xil ishlatilganlar prayslistdagi tartibida qoladi */
        return [...list].sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0));
    }, [services, query, categoryId, usage]);

    const shown = matches.slice(0, MAX_TILES);
    const hiddenCount = matches.length - shown.length;

    return (
        <div>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <input
                    value={query}
                    disabled={disabled}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t('payment.searchService')}
                    className="w-full h-11 pl-10 pr-3 rounded-xl border border-line bg-elevated text-sm text-ink placeholder:text-faint outline-none focus:border-primary-500/50 disabled:opacity-50"
                />
            </div>

            {categories.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {[{ id: '', name: t('ui.hammasi') }, ...categories].map(c => (
                        <button key={c.id || 'all'} type="button" disabled={disabled}
                            onClick={() => setCategoryId(c.id)} aria-pressed={categoryId === c.id}
                            className={`h-8 px-3 rounded-lg border text-xs font-semibold transition-colors disabled:opacity-50 ${categoryId === c.id
                                ? 'border-primary-600 bg-primary-600 text-white'
                                : 'border-line bg-surface text-muted hover:border-primary-400'}`}>
                            {c.name}
                        </button>
                    ))}
                </div>
            )}

            {shown.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t('payment.noServices')}</p>
            ) : (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-0.5">
                    {shown.map(s => {
                        const qty = quantities[serviceKey(s)] || 0;
                        const picked = qty > 0;
                        return (
                            <div key={serviceKey(s)}
                                className={`rounded-xl border transition-colors ${picked
                                    ? 'border-primary-500 bg-primary-500/10'
                                    : 'border-line bg-surface hover:border-primary-400'}`}>
                                <button type="button" disabled={disabled} onClick={() => onAdd(s)}
                                    className="w-full min-h-[64px] px-3 py-2.5 text-left disabled:opacity-50">
                                    <span className="block text-sm font-semibold text-ink leading-snug">{s.name}</span>
                                    <span className={`block mt-0.5 text-sm font-bold tabular-nums ${picked ? 'text-primary' : 'text-muted'}`}>
                                        {formatMoney(s.price)}
                                    </span>
                                </button>
                                {picked && (
                                    <div className="flex items-center justify-between px-2 pb-2">
                                        <button type="button" disabled={disabled} onClick={() => onRemoveOne(s)}
                                            aria-label={`${t('payment.less')}: ${s.name}`}
                                            className="w-9 h-9 grid place-items-center rounded-lg border border-line bg-surface text-ink hover:border-primary-400 disabled:opacity-50">
                                            <Minus className="w-4 h-4" />
                                        </button>
                                        <span className="text-base font-black tabular-nums text-primary">{qty}</span>
                                        <button type="button" disabled={disabled} onClick={() => onAdd(s)}
                                            aria-label={`${t('payment.more')}: ${s.name}`}
                                            className="w-9 h-9 grid place-items-center rounded-lg border border-line bg-surface text-ink hover:border-primary-400 disabled:opacity-50">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {hiddenCount > 0 && (
                <p className="mt-2 text-xs text-faint">{fill(t('payment.moreServices'), hiddenCount)}</p>
            )}
        </div>
    );
}
