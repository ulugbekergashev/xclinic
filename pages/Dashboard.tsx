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
    const initial = searchParams.get('tab') === 'davomat' ? 'attendance' : 'summary';

    return (
        <div className="space-y-5 animate-fade-in">
            <div>
                <h1 className="text-2xl font-bold text-ink">{t('nav.reports')}</h1>
                <p className="text-sm text-muted">{t('moliya.reportHint')}</p>
            </div>
            <FinanceReport embedded departments={departments} initialView={initial} />
        </div>
    );
};
