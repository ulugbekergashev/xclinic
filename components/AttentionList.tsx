import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import { useLanguage, fill } from '../context/LanguageContext';

/* ─────────────────────────────────────────────────────────────────────────────
   «BUGUN HAL QILINSIN» — eganing ro'yxati, «Bugun» ekranining pastida.

   TARIX. Bu ro'yxat uch joyda turdi: «Bugun» ning tepasidagi yig'iq tasmada
   (hech kim ochmasdi), keyin alohida «Bosh panel» sahifasida (2026-09-16),
   endi yana «Bugun» da — lekin tasma emas, sahifaning ochiq qismi sifatida.
   Bosh panel xaritani ham, «qabul ochish»ni ham takrorlab qo'ygan edi: bitta
   ish ikki ekranda turardi. Endi ega ham, registrator ham bitta «Bugun» ni
   ochadi; bu ro'yxat faqat egaga chiziladi.

   Eganing savoli: «bugun nimaga aralashishim kerak?» Javobi olti ekranga
   tarqalgan: yopilmagan smena Kassada, muddati o'tgan dori Omborda,
   natijasi kiritilmagan tahlil Laboratoriyada, vedomost Xodimlarda. Har
   qator o'z ekraniga olib boradi — ish o'sha yerda bajariladi, bu yerda emas.

   IKKI QOIDA:

   1. Ro'yxat SERVERDAN (`/api/reports/attention`). Ekranga kelgan
      proplardan sanash mumkin edi, lekin ular oxirgi 90 kunlik oyna —
      undan sanalgan «jami» jimgina yolg'on bo'lardi.

   2. Faqat HAQIQIY ish ko'rsatiladi. Nol bo'lgan band ro'yxatga tushmaydi:
      «0 ta muddati o'tgan dori» degan qator bezak, va u orasida haqiqiy
      muammo ko'rinmay qoladi.
   ───────────────────────────────────────────────────────────────────────────── */

export interface AttentionItem {
    key: string;
    level: string;
    title: string;
    hint?: string;
    link: string;
}

const LEVEL_DOT: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-500',
    low: 'bg-primary-500',
};

export const AttentionList: React.FC<{ items: AttentionItem[] }> = ({ items }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();

    return (
        <section className="rounded-xl border border-line bg-surface overflow-hidden" aria-labelledby="attention-title">
            <div className="px-4 py-3 border-b border-line-soft flex items-center justify-between gap-3">
                <h2 id="attention-title" className="text-sm font-bold text-ink">{t('ownerhome.bugun_hal_qilinsin')}</h2>
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
                    {items.map(it => (
                        <button key={it.key} type="button" onClick={() => navigate(it.link)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-elevated">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${LEVEL_DOT[it.level] || 'bg-elevated'}`} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm text-ink truncate">{it.title}</span>
                                {it.hint && <span className="block text-[11px] text-muted truncate">{it.hint}</span>}
                            </span>
                            <ChevronRight className="w-4 h-4 text-faint shrink-0" />
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
};

export default AttentionList;
