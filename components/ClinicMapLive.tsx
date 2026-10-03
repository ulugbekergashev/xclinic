import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Appointment, Department, Doctor, Service, Visit } from '../types';
import { api } from '../services/api';
import { todayISO } from '../utils/dateUtils';
import { useLanguage } from '../context/LanguageContext';
import { useLiveUpdates, useLiveHealthy, LiveEventType } from '../hooks/useLiveUpdates';
import { ClinicMap } from './ClinicMap';

/* Modul darajasida — har renderda qayta obuna bo'lmasin */
const LIVE_EVENTS: LiveEventType[] = ['visit.created', 'visit.status'];

/* ─────────────────────────────────────────────────────────────────────────────
   «Bugun klinikada» xaritasi — O'ZI yuklaydigan, FAQAT KO'RSATADIGAN nusxa.

   Eganing Bosh paneli uchun: u yerda bugungi qabullar ro'yxati yuklanmaydi
   (raqamlar serverdan tayyor keladi), xaritaga esa ro'yxatning o'zi kerak.

   Tugmalar yo'q: «Keldi», «Chaqirish», «Kirdi» — navbatni yuritadigan
   odamning ishi va ular Registraturada. Bosh panel — qarash uchun; ega
   aralashmoqchi bo'lsa, pastdagi havola o'sha yerga olib boradi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    clinicId: string;
    doctors: Doctor[];
    departments: Department[];
    services: Service[];
}

export const ClinicMapLive: React.FC<Props> = ({ clinicId, doctors, departments, services }) => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const [visits, setVisits] = useState<Visit[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);

    /* Bitta so'rov yiqilsa ikkinchisi ko'rsatilaveradi; ikkalasi ham yiqilsa
       ekrandagi oxirgi holat qoladi — bo'sh xarita «klinikada hech kim yo'q»
       degan yolg'on bo'lardi. */
    const load = useCallback(async () => {
        const day = todayISO();
        const [vs, as] = await Promise.all([
            api.visits.getAll({ date: day }).catch(() => null),
            api.appointments.getAll(clinicId, { from: day, to: day }).catch(() => null),
        ]);
        if (Array.isArray(vs)) setVisits(vs);
        if (Array.isArray(as)) setAppointments(as);
    }, [clinicId]);

    useEffect(() => { load(); }, [load]);
    useLiveUpdates(LIVE_EVENTS, load);

    /* Yangi yozuv uchun alohida hodisa yo'q, oqim esa uzilishi mumkin —
       Registraturadagi bilan bir xil zaxira so'rov. */
    const liveOk = useLiveHealthy();
    useEffect(() => {
        const id = setInterval(() => {
            if (document.visibilityState !== 'hidden') load();
        }, liveOk ? 60000 : 30000);
        return () => clearInterval(id);
    }, [liveOk, load]);

    return (
        <ClinicMap
            visits={visits}
            appointments={appointments}
            doctors={doctors}
            departments={departments}
            services={services}
            onPatientClick={(id) => navigate(`/patients/${id}`)}
            onOpenVisit={(v) => navigate(`/patients/${v.patientId}?visit=${v.id}`)}
            onSeeAll={() => navigate('/reception')}
            seeAllLabel={t('flow.toReception')}
        />
    );
};
