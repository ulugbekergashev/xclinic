import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, BarChart3, CalendarCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { Department } from '../types';
import { formatDateLong } from '../utils/format';
import { DashboardOverview } from '../components/DashboardOverview';
import { AttendanceTab } from '../components/AttendanceReport';
import { FinanceReport } from './FinanceReport';

/* ─────────────────────────────────────────────────────────────────────────────
   BOSH PANEL — klinika egasining ekrani. Uchta vkladka:

     · Umumiy  — bugungi raqamlar va «Bugun hal qilinsin» ro'yxati;
     · Hisobot — foyda, qarz, bo'limlar, chiqimlar;
     · Davomat — kim keldi, kim kelmadi, qaysi kunlar gavjum.

   Hisobot va Davomat Moliyadan ko'chdi. Moliya endi faqat kassa —
   registratorning ish quroli. Bosh panel — tahlil, eganing savoli. Har
   biri o'z odamiga; ilgari ikkalasi bitta bo'limda, kassaning yonidagi
   vkladkalarda turardi va registrator ularni ko'rmasa ham, ega kassa
   orqali o'tib borardi.

   NEGA ALOHIDA EKRAN. «Bugun» ekrani ikki odamning ish stoli edi:
   registrator unda qabul ochadi va navbatni ko'radi, ega esa tepadagi
   tasmadan «klinika qanday ketyapti» deb so'raydi. Bitta ekranda
   turgani uchun tasma yig'iq turardi va uni hech kim ochmasdi.
   2026-09-16 da bo'lindi: registratura o'z nomiga qaytdi, ega shu
   ekranni oldi.

   Faqat egaga — menyuda ham, marshrutda ham (`utils/navigation.ts`).
   Registrator `/dashboard` ni qo'lda yozsa, o'z bosh sahifasiga qaytadi.
   ───────────────────────────────────────────────────────────────────────────── */

type Tab = 'umumiy' | 'hisobot' | 'davomat';

const TABS: { key: Tab; labelKey: TranslationKey; icon: React.ElementType }[] = [
    { key: 'umumiy', labelKey: 'dashboard.tab.overview', icon: LayoutDashboard },
    { key: 'hisobot', labelKey: 'finance.hub.report', icon: BarChart3 },
    { key: 'davomat', labelKey: 'finance.hub.attendance', icon: CalendarCheck },
];

interface Props {
    departments: Department[];
    /** Salomlashish uchun */
    userName?: string;
}

export const Dashboard: React.FC<Props> = ({ departments, userName }) => {
    const { t, language } = useLanguage();

    /* Vkladka manzilda (`?tab=hisobot`) — Xodimlar va Moliya bilan bir xil
       odat: yangilanganda o'sha vkladka qoladi, havolani ulashib bo'ladi.
       Moliyadagi eski `?tab=hisobot` havolalari ham shu yerga tushadi. */
    const [searchParams, setSearchParams] = useSearchParams();
    const q = searchParams.get('tab');
    const tab: Tab = q === 'hisobot' || q === 'davomat' ? q : 'umumiy';
    const setTab = (next: Tab) => {
        const p = new URLSearchParams(searchParams);
        if (next === 'umumiy') p.delete('tab'); else p.set('tab', next);
        setSearchParams(p, { replace: true });
    };

    return (
        <div className="space-y-5 animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-ink">{t('nav.dashboard')}</h1>
                    {/* Sana loyihaning O'Z formatlagichidan: `toLocaleDateString('uz-UZ')`
                        Chrome da «M09 6, Sun» beradi — `uz` lokali to'liq emas. */}
                    <p className="text-sm text-muted">
                        {t('header.welcome')}{userName ? `, ${userName}` : ''}
                        {' · '}
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

            {tab === 'hisobot' ? (
                <FinanceReport embedded departments={departments} />
            ) : tab === 'davomat' ? (
                <AttendanceTab />
            ) : (
                <DashboardOverview />
            )}
        </div>
    );
};
