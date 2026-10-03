import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { Department } from '../types';
import { formatDateLong } from '../utils/format';
import { AttendanceTab } from '../components/AttendanceReport';
import { FinanceReport } from './FinanceReport';

/* ─────────────────────────────────────────────────────────────────────────────
   HISOBOT — klinika egasining ekrani: o'tgan davr. Ikki vkladka:

     · Hisobot — foyda, qarz, bo'limlar, chiqimlar;
     · Davomat — kim keldi, kim kelmadi, qaysi kunlar gavjum.

   TARIX. Bu sahifa «Bosh panel» edi va uchinchi — «Umumiy» — vkladkasida
   bugungi raqamlar, «Bugun hal qilinsin» ro'yxati va jonli xarita turardi.
   O'sha xarita Registraturada ham bor edi: bitta ish ikki ekranda. Endi
   bugungi hamma narsa bitta «Bugun» ekranida (`pages/Reception.tsx`),
   bu yerda esa faqat davr bo'yicha tahlil qoldi. Qoida: «Bugun» — hozir,
   «Hisobot» — o'tgan kunlar.

   Manzil `/dashboard` va modul nomi `dashboard` o'zgarmadi: eski havolalar
   (`/dashboard?tab=hisobot`, Moliyadan yo'naltirish) ishlayveradi.
   `?tab=` siz ochilsa — Hisobot.

   Faqat egaga — menyuda ham, marshrutda ham (`utils/navigation.ts`).
   Registrator `/dashboard` ni qo'lda yozsa, o'z bosh sahifasiga qaytadi.
   ───────────────────────────────────────────────────────────────────────────── */

type Tab = 'hisobot' | 'davomat';

const TABS: { key: Tab; labelKey: TranslationKey; icon: React.ElementType }[] = [
    { key: 'hisobot', labelKey: 'finance.hub.report', icon: BarChart3 },
    { key: 'davomat', labelKey: 'finance.hub.attendance', icon: CalendarCheck },
];

interface Props {
    departments: Department[];
}

export const Dashboard: React.FC<Props> = ({ departments }) => {
    const { t, language } = useLanguage();

    /* Vkladka manzilda (`?tab=davomat`) — Xodimlar va Moliya bilan bir xil
       odat: yangilanganda o'sha vkladka qoladi, havolani ulashib bo'ladi. */
    const [searchParams, setSearchParams] = useSearchParams();
    const tab: Tab = searchParams.get('tab') === 'davomat' ? 'davomat' : 'hisobot';
    const setTab = (next: Tab) => {
        const p = new URLSearchParams(searchParams);
        if (next === 'hisobot') p.delete('tab'); else p.set('tab', next);
        setSearchParams(p, { replace: true });
    };

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-ink">{t('nav.reports')}</h1>
                    {/* Sana loyihaning O'Z formatlagichidan: `toLocaleDateString('uz-UZ')`
                        Chrome da «M09 6, Sun» beradi — `uz` lokali to'liq emas. */}
                    <p className="text-sm text-muted">
                        {formatDateLong(new Date(), language === 'ru' ? 'ru' : 'uz')}
                    </p>
                </div>

                <div className="flex items-center gap-1 bg-elevated p-1 rounded-xl" role="tablist">
                    {TABS.map(x => {
                        const active = x.key === tab;
                        return (
                            <button key={x.key} type="button" role="tab" aria-selected={active}
                                onClick={() => setTab(x.key)}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${active
                                    ? 'bg-surface text-primary-600 shadow-sm'
                                    : 'text-muted hover:text-ink'}`}>
                                <x.icon className="w-4 h-4" />
                                {t(x.labelKey)}
                            </button>
                        );
                    })}
                </div>
            </div>

            {tab === 'davomat'
                ? <AttendanceTab />
                : <FinanceReport embedded departments={departments} />}
        </div>
    );
};
