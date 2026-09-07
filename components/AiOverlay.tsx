import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { UserRole } from '../types';
import { AiAssistant } from '../pages/AiAssistant';

/* ─────────────────────────────────────────────────────────────────────────────
   AI YORDAMCHI — SAHIFA USTIDA, SAHIFA ICHIDA EMAS.

   Ilgari u «Boshqaruv paneli» ichidagi vkladka edi va shapkadagi tugma
   `/?tab=ai` ga OLIB O'TARDI. Ya'ni savol berish uchun shifokor turgan
   ekranini tashlab ketishi kerak edi: bemor kartasida turib «bu bemorda
   qancha qarz bor?» deb so'ray olmasdi — kartadan chiqib ketardi.

   Endi u ustidan ochiladi va yopilganda o'sha joyda qolasiz. Boshqaruv
   paneli olib tashlangani uchun bu YAGONA yo'l ham.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    open: boolean;
    onClose: () => void;
    userRole: UserRole;
}

export const AiOverlay: React.FC<Props> = ({ open, onClose, userRole }) => {
    /* Escape yopadi va ochiq turganda sahifa orqada skroll qilmaydi. */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
            onClick={onClose} role="dialog" aria-modal="true">
            <div className="w-full max-w-5xl bg-gray-50 dark:bg-gray-900 rounded-2xl shadow-2xl my-auto relative"
                onClick={e => e.stopPropagation()}>
                <button onClick={onClose} aria-label="Yopish"
                    className="absolute top-3 right-3 z-10 p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800">
                    <X className="w-5 h-5" />
                </button>
                <div className="p-4 sm:p-6">
                    <AiAssistant userRole={userRole} onExit={onClose} />
                </div>
            </div>
        </div>
    );
};
