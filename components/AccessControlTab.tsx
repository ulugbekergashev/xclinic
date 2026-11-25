import React from 'react';
import { Clinic, UserRole } from '../types';
import { PermissionMatrix } from './access/PermissionMatrix';
import { AccessLog } from './access/AccessLog';

/* ────────────────────────────────────────────────────────────────────────────
   RUXSATLAR — FAQAT XODIMLAR BO'LIMIDA.

   Ilgari bu panel ikki joyda ochilardi: Sozlamalar → Ruxsatlar va
   Xodimlar → Ruxsatlar. Bitta narsa ikki joyda — egasi qaysi biri
   «haqiqiy» ekanini bilmasdi. Endi faqat Xodimlarda: «bu xodim nimani
   ko'radi?» degan savol xodimlar ro'yxati yonida turadi.

   Ichida ikki qism:
     · «Kim nimani ko'radi» — rollar jadvali (`access/PermissionMatrix`);
     · «Kirish jurnali» — kim qaysi kartani ochgani, yopiq turadi
       (`access/AccessLog`).

   FAQAT EGA UCHUN. Guard chaqiruvchi tomonda turadi.
   ─────────────────────────────────────────────────────────────────────────── */

interface Props {
   currentClinic?: Clinic;
   /** Saqlangandan keyin App dagi klinika yozuvini qayta o'qish */
   onClinicUpdated?: () => void;
   /** Har roldagi faol xodimlar soni — jadval ustunlarida */
   staffCounts?: Partial<Record<UserRole, number>>;
}

export const AccessControlTab: React.FC<Props> = ({ currentClinic, onClinicUpdated, staffCounts }) => (
   <div className="space-y-4">
      <PermissionMatrix currentClinic={currentClinic} onClinicUpdated={onClinicUpdated} staffCounts={staffCounts} />
      <AccessLog />
   </div>
);
