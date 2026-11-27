/* ─────────────────────────────────────────────────────────────────────────────
   OLDINDAN BOSILGAN BLANKA — Sozlamalar → Umumiy → «Bosma blank» ichida.

   Ko'p klinikada tepasida nomi, logotipi va manzili bosmaxonada bosilgan
   qog'oz bor. Dastur ham o'z shapkasini chiqarsa, ikkalasi ustma-ust
   tushadi va retsept yaroqsiz bo'ladi. Shu yerda klinika:
     · dastur shapkasini o'chiradi;
     · varaqning tepa / past / yon chekkasini millimetrda beradi.

   «Namuna chop etish» SAQLANMAGAN qiymatlar bilan bosadi: blankaga bitta
   varaq urib ko'rib, keyin saqlash uchun. Punktir ramka — matn chiqadigan
   joy. Bo'sh maydon — odatiy chekka (avvalgi ko'rinish o'zgarmaydi).
   ───────────────────────────────────────────────────────────────────────────── */

import React from 'react';
import { Printer } from 'lucide-react';
import { Input, Button } from '../Common';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from '../../services/toast';
import { DEFAULT_LAYOUT, layoutFor } from '../../utils/printDocument';
import { printLayoutSample } from '../../utils/printForms';

export interface PrintLayoutValue {
    printTopMm: string;
    printBottomMm: string;
    printSideMm: string;
    printHideHeader: boolean;
}

interface Props {
    value: PrintLayoutValue;
    onChange: (next: PrintLayoutValue) => void;
    clinicName?: string;
}

/** Maydondan bazaga: bo'sh — null (odatiy chekka) */
export const mmField = (v: string): number | null =>
    v.trim() === '' ? null : Math.round(Number(v));

export function PrintLayoutFields({ value, onChange, clinicName }: Props) {
    const { t } = useLanguage();
    const set = (patch: Partial<PrintLayoutValue>) => onChange({ ...value, ...patch });

    const printSample = () => {
        const layout = layoutFor({
            printTopMm: mmField(value.printTopMm),
            printBottomMm: mmField(value.printBottomMm),
            printSideMm: mmField(value.printSideMm),
            printHideHeader: value.printHideHeader,
        });
        if (!printLayoutSample(layout, clinicName)) toast.error(t('print.popupBlocked'));
    };

    const field = (key: 'printTopMm' | 'printBottomMm' | 'printSideMm', label: string, placeholder: number, max: number) => (
        <Input
            containerClassName="w-28"
            type="number" min={0} max={max} inputMode="numeric"
            label={label}
            placeholder={String(placeholder)}
            value={value[key]}
            onChange={e => set({ [key]: e.target.value } as Partial<PrintLayoutValue>)}
        />
    );

    return (
        <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    checked={value.printHideHeader}
                    onChange={e => set({ printHideHeader: e.target.checked })}
                    className="mt-0.5 w-5 h-5 text-primary-600 border-line rounded focus:ring-primary-500"
                />
                <span>
                    <span className="block text-sm font-medium text-ink">{t('settings.print.preprinted')}</span>
                    <span className="block text-xs text-muted">{t('settings.print.preprintedHint')}</span>
                </span>
            </label>

            <div>
                <p className="text-sm font-medium text-muted">{t('settings.print.margins')}</p>
                <p className="text-xs text-faint mb-2">{t('settings.print.marginsHint')}</p>
                <div className="flex flex-wrap items-end gap-3">
                    {field('printTopMm', t('settings.print.top'), DEFAULT_LAYOUT.topMm, 80)}
                    {field('printBottomMm', t('settings.print.bottom'), DEFAULT_LAYOUT.bottomMm, 80)}
                    {field('printSideMm', t('settings.print.side'), DEFAULT_LAYOUT.sideMm, 40)}
                    <Button type="button" variant="secondary" onClick={printSample}>
                        <Printer className="w-4 h-4" /> {t('settings.print.test')}
                    </Button>
                </div>
                <p className="text-[11px] text-faint mt-1.5">{t('settings.print.testHint')}</p>
            </div>
        </div>
    );
}
