import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { formatMoney } from '../utils/format';
import {
    Wallet, AlertTriangle, CalendarCheck, Users, ChevronRight,
    ChevronDown, ChevronUp, CheckCircle2,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   EGANING TASMASI — «Bugun» ekranining tepasida.

   MUAMMO. Klinika egasi kirganda birinchi ko'radigan ekran «Bugun», ya'ni
   REGISTRATORNING ish stoli: navbat, kim keldi, kim kutmoqda. Eganing
   savoli esa boshqa — «klinika qanday ketyapti va bugun nimaga
   aralashishim kerak?»

   Bu savolning javobi olti ekranga tarqalgan edi: yopilmagan smena
   Kassada, muddati o'tgan dori Omborda, natijasi kiritilmagan tahlil
   Laboratoriyada, vedomost Xodimlarda. Har biriga KIRIB ko'rmaguncha,
   muammo borligini bilib bo'lmasdi.

   UCHTA QOIDA:

   1. Hamma raqam SERVERDAN (`/api/reports/dashboard`, `/attention`).
      Ekranga kelgan proplardan sanash mumkin edi, lekin ular oxirgi
      90 kunlik oyna — undan sanalgan «jami» jimgina yolg'on bo'lardi.

   2. Faqat HAQIQIY ish ko'rsatiladi. Nol bo'lgan band ro'yxatga
      tushmaydi: «0 ta muddati o'tgan dori» degan qator bezak, va u
      orasida haqiqiy muammo ko'rinmay qoladi.

   3. GRAFIK YO'Q. Tushum dinamikasi Moliya → Hisobotda, o'z joyida.
      Uni bu yerga ham qo'yish — bitta raqam ikki joyda degani.
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

export const OwnerHome: React.FC<{ userName?: string }> = ({ userName }) => {
    const navigate = useNavigate();
    const [data, setData] = useState<any>(null);
    const [attention, setAttention] = useState<any>(null);
    const [open, setOpen] = useState(true);

    const load = useCallback(async () => {
        const [d, a] = await Promise.all([
            api.reports.dashboard().catch(() => null),
            api.reports.attention().catch(() => null),
        ]);
        setData(d);
        setAttention(a);
    }, []);

    useEffect(() => { load(); }, [load]);

    /* Ma'lumot kelmaguncha tasma UMUMAN chizilmaydi — bo'sh skelet
       «Bugun» ro'yxatini pastga surib, registratorning ishini
       sekinlashtirardi. */
    if (!data) return null;

    const items = attention?.items || [];
    const debtors = data.debtors || { patients: 0, overdue30: 0, overdue30Sum: 0 };

    return (
        <div className="mb-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold text-ink">
                        Xush kelibsiz{userName ? `, ${userName}` : ''}
                    </h2>
                    <p className="text-sm text-muted">
                        {items.length === 0
                            ? 'E\'tibor kutayotgan ish yo\'q'
                            : `${items.length} ta ish e'tiboringizni kutmoqda`}
                    </p>
                </div>
                <button type="button" onClick={() => setOpen(v => !v)}
                    className="flex items-center gap-1 text-xs font-medium text-muted hover:text-primary-600 px-2 py-1 rounded-lg">
                    {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {open ? 'Yig\'ish' : 'Ochish'}
                </button>
            </div>

            {open && (
                <>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                        <Tile
                            title="Bugun kassaga" icon={Wallet}
                            value={formatMoney(data.today.revenue)}
                            hint={`${data.today.payments} ta to'lov · oy boshidan ${formatMoney(data.month.revenue)}`}
                            onClick={() => navigate('/finance')}
                        />
                        <Tile
                            title="Qarz" icon={AlertTriangle}
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
                                ? `${debtors.patients} bemor · ${debtors.overdue30} tasi 30 kundan oshgan`
                                : `${debtors.patients} ta bemor`}
                            onClick={() => navigate('/finance')}
                        />
                        <Tile
                            title="Bugun" icon={CalendarCheck}
                            value={`${data.today.visits} / ${data.today.appointments}`}
                            hint="qabul ochildi / yozilgan"
                        />
                        <Tile
                            title="Bemorlar" icon={Users}
                            value={data.patients.total}
                            hint={`7 kunda +${data.patients.newLast7Days} yangi`}
                            onClick={() => navigate('/patients')}
                        />
                    </div>

                    {/* ── Bugun hal qilinsin ─────────────────────────────── */}
                    <div className="rounded-xl border border-line bg-surface overflow-hidden">
                        <div className="px-4 py-3 border-b border-line-soft">
                            <p className="text-sm font-bold text-ink">Bugun hal qilinsin</p>
                        </div>
                        {items.length === 0 ? (
                            <div className="px-4 py-5 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-4 h-4" />
                                Ochiq savol yo'q — smena yopilgan, muddat va natijalar joyida.
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
                </>
            )}
        </div>
    );
};

export default OwnerHome;
