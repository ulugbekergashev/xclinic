import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { formatMoney } from '../utils/format';
import { useLanguage, fill } from '../context/LanguageContext';
import {
    Wallet, AlertTriangle, CalendarCheck, Users, ChevronRight, CheckCircle2,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   BOSH PANEL → «UMUMIY» — bugungi raqamlar va e'tibor kutayotgan ishlar.

   TARIX. Bu ilgari «Bugun» ekranining tepasidagi yig'iladigan tasma edi
   (`OwnerHome`). Registratorning ish stoli bilan eganing savoli bitta
   ekranda turardi, shuning uchun tasma sukut bo'yicha yopiq edi — navbatni
   pastga surmasin deb — va uni amalda hech kim ochmasdi. 2026-09-16 da
   ekran ikkiga bo'lindi: registratura o'z nomiga qaytdi, egaga alohida
   «Bosh panel» ochildi. Endi yig'ish shart emas — bu ekranning o'zi shu.

   Eganing savoli: «klinika qanday ketyapti va bugun nimaga aralashishim
   kerak?» Javobi olti ekranga tarqalgan edi: yopilmagan smena Kassada,
   muddati o'tgan dori Omborda, natijasi kiritilmagan tahlil
   Laboratoriyada, vedomost Xodimlarda. Har biriga KIRIB ko'rmaguncha,
   muammo borligini bilib bo'lmasdi.

   UCHTA QOIDA:

   1. Hamma raqam SERVERDAN (`/api/reports/dashboard`, `/attention`).
      Ekranga kelgan proplardan sanash mumkin edi, lekin ular oxirgi
      90 kunlik oyna — undan sanalgan «jami» jimgina yolg'on bo'lardi.

   2. Faqat HAQIQIY ish ko'rsatiladi. Nol bo'lgan band ro'yxatga
      tushmaydi: «0 ta muddati o'tgan dori» degan qator bezak, va u
      orasida haqiqiy muammo ko'rinmay qoladi.

   3. GRAFIK YO'Q. Tushum dinamikasi yonidagi «Hisobot» vkladkasida, o'z
      joyida. Uni bu yerga ham qo'yish — bitta raqam ikki joyda degani.
   ───────────────────────────────────────────────────────────────────────────── */

const LEVEL_DOT: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-primary-500',
};

const Tile: React.FC<{
    title: string; value: React.ReactNode; hint?: React.ReactNode;
    icon: React.ElementType; danger?: boolean; onClick?: () => void;
}> = ({ title, value, hint, icon: Icon, danger, onClick }) => (
    <button type="button" onClick={onClick} disabled={!onClick}
        className={`text-left p-4 rounded-xl border transition-colors ${danger
            ? 'border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-900/10'
            : 'border-line bg-surface'}
            ${onClick ? 'hover:border-primary-400 cursor-pointer' : 'cursor-default'}`}>
        <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted">{title}</p>
            <Icon className={`w-4 h-4 shrink-0 ${danger ? 'text-red-400' : 'text-faint'}`} />
        </div>
        <p className={`text-2xl font-bold tabular-nums mt-1 ${danger
            ? 'text-red-600 dark:text-red-400' : 'text-ink'}`}>
            {value}
        </p>
        {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </button>
);

export const DashboardOverview: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [data, setData] = useState<any>(null);
    const [attention, setAttention] = useState<any>(null);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        const [d, a] = await Promise.all([
            api.reports.dashboard().catch(() => null),
            api.reports.attention().catch(() => null),
        ]);
        setData(d);
        setAttention(a);
        setLoaded(true);
    }, []);

    useEffect(() => { load(); }, [load]);

    if (!loaded) {
        return (
            <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
                <div className="w-8 h-8 rounded-full border-2 border-line border-t-primary-600 animate-spin" />
                <span className="sr-only">{t('ui.yuklanmoqda')}</span>
            </div>
        );
    }
    /* Server javob bermasa — bo'sh ekran emas, aniq xabar. Tasma paytida
       bu holatda hech narsa chizilmasdi: «Bugun» ro'yxati baribir
       ko'rinib turardi. Alohida sahifada esa bo'sh joy «buzilgan» degani. */
    if (!data) {
        return (
            <div className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-muted">
                {t('ui.xatolik')}
            </div>
        );
    }

    const items = attention?.items || [];
    const debtors = data.debtors || { patients: 0, overdue30: 0, overdue30Sum: 0 };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <Tile
                    title={t('ownerhome.bugun_kassaga')} icon={Wallet}
                    value={formatMoney(data.today.revenue)}
                    hint={fill(t('ownerhome.x_ta_tolov_oy'), data.today.payments, formatMoney(data.month.revenue))}
                    onClick={() => navigate('/finance')}
                />
                <Tile
                    title={t('ownerhome.qarz')} icon={AlertTriangle}
                    danger={debtors.overdue30 > 0}
                    /* `amount`, `total` EMAS. Server (`snapshot.ts`)
                       `debt: { amount, charges, patients }` qaytaradi —
                       `debt.total` umuman yo'q, ya'ni `?? 0` HAR DOIM
                       ishlardi va karta 108 mln qarzni «0» deb
                       ko'rsatardi. Xatoni optional chaining jimgina
                       yutgan: `undefined` xato bermaydi, shunchaki
                       noto'g'ri raqam chiqaradi. */
                    value={formatMoney(data.debt?.amount ?? 0)}
                    hint={debtors.overdue30 > 0
                        ? fill(t('ownerhome.x_bemor_x_tasi'), debtors.patients, debtors.overdue30)
                        : fill(t('ownerhome.x_ta_bemor'), debtors.patients)}
                    onClick={() => navigate('/finance')}
                />
                {/* Bugungi qabullar — Registraturaga olib boradi: raqamning
                    orqasidagi odamlar o'sha yerda, navbatda turibdi. */}
                <Tile
                    title={t('ui.bugun')} icon={CalendarCheck}
                    value={`${data.today.visits} / ${data.today.appointments}`}
                    hint={t('ownerhome.qabul_ochildi_yozilgan')}
                    onClick={() => navigate('/reception')}
                />
                <Tile
                    title={t('ownerhome.bemorlar')} icon={Users}
                    value={data.patients.total}
                    hint={fill(t('ownerhome.7_kunda_x_yangi'), data.patients.newLast7Days)}
                    onClick={() => navigate('/patients')}
                />
            </div>

            {/* ── Bugun hal qilinsin ─────────────────────────────────── */}
            <div className="rounded-xl border border-line bg-surface overflow-hidden">
                <div className="px-4 py-3 border-b border-line-soft flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-ink">{t('ownerhome.bugun_hal_qilinsin')}</p>
                    <p className="text-xs text-muted">
                        {items.length === 0
                            ? t('ownerhome.etibor_kutayotgan_ish_yoq')
                            : fill(t('ownerhome.x_ta_ish_etiboringizni'), items.length)}
                    </p>
                </div>
                {items.length === 0 ? (
                    <div className="px-4 py-5 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        {t('ownerhome.ochiq_savol_yoq_smena')}
                    </div>
                ) : (
                    <div className="divide-y divide-line">
                        {items.map((it: any) => (
                            <button key={it.key} type="button" onClick={() => navigate(it.link)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-elevated">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[it.level] || 'bg-elevated'}`} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm text-ink truncate">
                                        {it.title}
                                    </span>
                                    {it.hint && (
                                        <span className="block text-[11px] text-muted truncate">
                                            {it.hint}
                                        </span>
                                    )}
                                </span>
                                <ChevronRight className="w-4 h-4 text-faint shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DashboardOverview;
