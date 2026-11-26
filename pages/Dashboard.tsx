import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { Department } from '../types';
import { FinanceReport } from './FinanceReport';

/* ─────────────────────────────────────────────────────────────────────────────
   HISOBOT — klinika egasining ekrani: o'tgan davr.

   Qoida (2026-11-22, olti maslahatchi muhokamasi): KASSA — bitta kunning naqd
   puli (tushdi, chiqdi, yashikda, kun yopildi); HISOBOT — har qanday davr
   bo'yicha tahlil (xizmatlar, olingan pul, xarajat, foyda, qarz, shifokor,
   bo'lim). Har raqam bitta joyda va bitta ma'noda. DentaCRM da alohida hisobot
   moduli yo'q — shuning uchun ular hisobotni Moliya ichida tab qilgan; bizda
   esa u shu modul.

   TABLAR BITTA QATORDA: Umumiy · Shifokorlar · Bo'limlar · Ombor isrofi ·
   Davomat. Ilgari tepada «Hisobot | Davomat» va ostida yana beshta tab —
   ikki qavat edi.

   TARIX. Bu sahifa «Bosh panel» edi; bugungi narsalar endi «Bugun» ekranida.
   Manzil `/dashboard` va modul nomi `dashboard` o'zgarmadi: eski havolalar
   (`?tab=hisobot`, `?tab=davomat`, Kassadan yo'naltirish) ishlayveradi.
   Faqat egaga — menyuda ham, marshrutda ham (`utils/navigation.ts`).
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    departments: Department[];
}

export const Dashboard: React.FC<Props> = ({ departments }) => {
    const { t } = useLanguage();
    const [searchParams] = useSearchParams();
    const tab = searchParams.get('tab');
    const initial = tab === 'davomat' ? 'attendance' : tab === 'bemorlar' ? 'patients' : tab === 'xizmatlar' ? 'services' : 'summary';

    return (
        <div className="animate-fade-in">
            {/* Ko'rinadigan sarlavha — davrning katta sanasi (`PeriodBar`);
                «Hisobot» so'zi menyuda bor, bu yerda faqat ekran o'quvchi uchun. */}
            <h1 className="sr-only">{t('nav.reports')}</h1>
            <FinanceReport departments={departments} initialView={initial} />
        </div>
    );
};
