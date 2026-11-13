import React from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import { Patient } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { usePatientSearch } from '../../hooks/usePatientSearch';
import { formatUzPhone } from '../../shared/validation';

/* ─────────────────────────────────────────────────────────────────────────────
   TO'LOV OYNASIDAGI BEMOR — QIDIRISH YOKI SHU YERDA KIRITISH.

   MUAMMO. To'lov oynasi faqat BAZADAGI bemorni tanlay olardi. Birinchi marta
   ukolga kelgan odam uchun yo'l shunday edi: oynani yopish → «Bemorlar» →
   to'liq forma → qaytib kelish → kassa → to'lov. Besh ekran, bitta ukol.

   ENDI shu oynaning o'zida: familiya, ism, jins (telefon ixtiyoriy). Bemor
   to'lov bilan BIRGA yaratiladi — alohida «saqlash» qadami yo'q.

   BEMORSIZ CHEK YO'Q, ataylab. «Shunchaki chek» qulayroq ko'rinardi, lekin
   pul hech kimga bog'lanmagan qator bo'lib qolardi: qaytarish kimga,
   ertangi muolajada tarix qayerda — javobsiz. Uchta maydon shu savollarni
   yopadi. Qoida serverniki bilan bitta (`shared/validation.ts`).
   ───────────────────────────────────────────────────────────────────────────── */

export type PatientDraft = {
    lastName: string;
    firstName: string;
    phone: string;
    gender: '' | 'Male' | 'Female';
};

export const EMPTY_DRAFT: PatientDraft = { lastName: '', firstName: '', phone: '', gender: '' };

type Props = {
    enabled: boolean;
    /** Tanlangan (yoki hozirgina yaratilgan) bemor */
    picked: Patient | null;
    onPick: (p: Patient | null) => void;
    isNew: boolean;
    onToggleNew: (isNew: boolean) => void;
    draft: PatientDraft;
    onDraftChange: (d: PatientDraft) => void;
    /** Server «shunday bemor bor» dedi — tanlov odamda */
    duplicates: Patient[];
    onForceNew: () => void;
    locked: boolean;
    /** So'rov ketyapti — «baribir yangi» ikkinchi marta bosilmasin */
    busy?: boolean;
};

const inputCls = 'w-full h-11 px-3 rounded-xl border border-line bg-elevated text-sm text-ink placeholder:text-faint outline-none focus:border-primary-500/50';

export function QuickPatient({
    enabled, picked, onPick, isNew, onToggleNew, draft, onDraftChange, duplicates, onForceNew, locked, busy = false,
}: Props) {
    const { t } = useLanguage();
    const [search, setSearch] = React.useState('');
    const { results, loading: isSearching } = usePatientSearch(search, { enabled: enabled && !picked && !isNew });

    if (picked) {
        return (
            <div className="flex items-center gap-3 p-3 rounded-xl border border-line bg-elevated">
                <div className="w-9 h-9 rounded-full bg-primary-500/12 text-primary grid place-items-center font-bold text-xs">
                    {picked.firstName?.[0]}{picked.lastName?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{picked.lastName} {picked.firstName}</p>
                    <p className="text-xs text-faint">{formatUzPhone(picked.phone || '')}</p>
                </div>
                <button type="button" onClick={() => onPick(null)} disabled={locked} aria-label={t('common.change')}
                    className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-surface disabled:opacity-40">
                    <X className="w-4 h-4" />
                </button>
            </div>
        );
    }

    if (isNew) {
        const set = (patch: Partial<PatientDraft>) => onDraftChange({ ...draft, ...patch });
        return (
            <div className="p-3 rounded-xl border border-primary-500/30 bg-primary-500/5 space-y-2.5">
                <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" />
                    <p className="text-sm font-semibold text-ink flex-1">{t('payment.newPatient')}</p>
                    <button type="button" onClick={() => onToggleNew(false)}
                        className="text-xs font-medium text-primary hover:underline">
                        {t('payment.backToSearch')}
                    </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input autoFocus value={draft.lastName} onChange={e => set({ lastName: e.target.value })}
                        placeholder={t('patients.familiya')} aria-label={t('patients.familiya')} className={inputCls} />
                    <input value={draft.firstName} onChange={e => set({ firstName: e.target.value })}
                        placeholder={t('patients.ism')} aria-label={t('patients.ism')} className={inputCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div role="group" aria-label={t('reception.gender')} className="grid grid-cols-2 gap-2">
                        {([['Male', t('ui.erkak')], ['Female', t('ui.ayol')]] as const).map(([value, label]) => (
                            <button key={value} type="button" onClick={() => set({ gender: value })}
                                aria-pressed={draft.gender === value}
                                className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${draft.gender === value
                                    ? 'border-primary-600 bg-primary-600 text-white'
                                    : 'border-line bg-surface text-muted hover:border-primary-400'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <input value={draft.phone} onChange={e => set({ phone: e.target.value })} inputMode="tel"
                        placeholder={t('payment.phoneOptional')} aria-label={t('ui.telefon')} className={inputCls} />
                </div>

                {duplicates.length > 0 && (
                    <div className="pt-1">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">{t('payment.dupFound')}</p>
                        <div className="border border-line rounded-xl divide-y divide-line bg-surface">
                            {duplicates.map(p => (
                                <button key={p.id} type="button" onClick={() => onPick(p)}
                                    className="w-full text-left px-3 py-2.5 hover:bg-elevated">
                                    <p className="text-sm font-medium text-ink">{p.lastName} {p.firstName}</p>
                                    <p className="text-xs text-faint">{formatUzPhone(p.phone || '')}</p>
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={onForceNew} disabled={busy}
                            className="mt-2 text-xs font-medium text-primary hover:underline disabled:opacity-50">
                            {t('payment.dupForce')}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                    <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                        placeholder={t('advance.searchPatient')} className={`${inputCls} pl-10`} />
                </div>
                <button type="button" onClick={() => onToggleNew(true)}
                    className="shrink-0 h-11 px-3.5 inline-flex items-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-ink hover:border-primary-400">
                    <UserPlus className="w-4 h-4" /> {t('payment.newPatient')}
                </button>
            </div>
            {isSearching && <p className="text-xs text-faint mt-2">…</p>}
            {results.length > 0 && (
                <div className="mt-2 border border-line rounded-xl divide-y divide-line max-h-48 overflow-y-auto">
                    {results.map(p => (
                        <button key={p.id} type="button" onClick={() => { onPick(p); setSearch(''); }}
                            className="w-full text-left px-3 py-2.5 hover:bg-elevated">
                            <p className="text-sm font-medium text-ink">{p.lastName} {p.firstName}</p>
                            <p className="text-xs text-faint">{formatUzPhone(p.phone || '')}</p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
