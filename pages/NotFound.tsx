/* 404 — mavjud bo'lmagan manzil (S5.7, audit B-37).
 *
 * MUAMMO. Ilgari bu yerda `<Navigate to="/" replace />` turardi: noto'g'ri
 * manzil JIMGINA bosh sahifaga tashlanardi. Audit buni `#/labs` bilan
 * topgan — foydalanuvchi «bosdim, boshqa joyga tushdim» deb qoladi va
 * sababini bilmaydi. Xatoni yashirish uni tuzatishdan yomonroq.
 *
 * ROLGA QARAB. «Bosh sahifaga» tugmasi hamshirani Statsionarga olib
 * boradi — uning bosh sahifasi o'sha (`App.tsx` dagi kirish yo'nalishi
 * bilan bir xil), aks holda u yana 404 ga tushardi.
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';
import { UserRole } from '../types';

interface Props {
    userRole: UserRole;
}

export const NotFound: React.FC<Props> = ({ userRole }) => {
    const location = useLocation();
    const navigate = useNavigate();

    const home = userRole === UserRole.NURSE ? '/inpatient'
        : userRole === UserRole.LAB_TECHNICIAN ? '/lab'
            : userRole === UserRole.DOCTOR ? '/today'
                : userRole === UserRole.RECEPTIONIST ? '/today'
                    : '/';

    return (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
                <FileQuestion className="w-8 h-8 text-gray-500 dark:text-gray-400" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sahifa topilmadi</h1>

            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-w-md">
                Bunday manzil yo'q:{' '}
                <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                    {location.pathname}
                </code>
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-500 max-w-md">
                Havola eskirgan bo'lishi yoki manzilda xato bo'lishi mumkin.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                               border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200
                               hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Orqaga
                </button>
                <button
                    type="button"
                    onClick={() => navigate(home, { replace: true })}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                               bg-primary-600 text-white hover:bg-primary-700"
                >
                    <Home className="w-4 h-4" />
                    Bosh sahifaga
                </button>
            </div>
        </div>
    );
};
