import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

/* ─────────────────────────────────────────────────────────────────────────────
   `/visit/:visitId` — ENDI ALOHIDA EKRAN EMAS.

   Qabul ish stoli bemor kartasining ichiga ko'chdi (`components/VisitPanel`).
   Sabab oddiy: shifokor tashxis qo'yish uchun bitta ekranga, bemorning
   tarixini ko'rish uchun boshqasiga borishi kerak edi, va kartadan qabulga
   o'tish yo'li umuman yo'q edi.

   Bu marshrut saqlanadi va kartaga yo'naltiradi — talonlar, eski havolalar
   va «Mening navbatim» dagi tugmalar ishlashda davom etsin. */

export const VisitWorkspace: React.FC = () => {
    const { t } = useLanguage();
    const { visitId } = useParams<{ visitId: string }>();
    const [patientId, setPatientId] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        if (!visitId) { setFailed(true); return; }
        api.visits.getById(visitId)
            .then(v => { if (alive) setPatientId(v.patientId); })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [visitId]);

    /* Qabul topilmasa bugungi ekranga — bemor kartasi manzili noma'lum. */
    if (failed) return <Navigate to="/today" replace />;
    if (patientId) return <Navigate to={`/patients/${patientId}?visit=${visitId}`} replace />;

    return (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            <p className="text-sm text-muted">{t('common.loading')}</p>
        </div>
    );
};
