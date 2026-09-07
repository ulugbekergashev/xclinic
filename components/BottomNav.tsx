import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { UserRole, AccessControl } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { visibleNavigation, NavItemDef } from '../utils/navigation';

interface BottomNavProps {
    userRole: UserRole;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
    accessControl?: AccessControl;
}

export const BottomNav: React.FC<BottomNavProps> = ({ userRole, isSidebarOpen, setIsSidebarOpen, accessControl = {} }) => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const location = useLocation();

    /* Ro'yxat `utils/navigation.ts` dan — yon panel bilan BITTA manba.

       Ilgari bu yerda o'z ro'yxati yozilgan edi va u ajralib ketgan edi:
       Registratura, navbat, laboratoriya va diagnostika unda umuman
       yo'q edi, ya'ni registratorning va shifokorning asosiy ekranlari
       telefonda pastki menyuda ko'rinmasdi. Laborantga esa bironta ham
       punkt to'g'ri kelmasdi — pastki panel bo'sh chiziq bo'lib turardi
       va «Barchasi» tugmasi ham chiqmasdi. */
    const allowedItems = visibleNavigation(userRole, accessControl);

    /* Beshtadan ko'p bo'lsa — birinchi to'rttasi va «Barchasi».
       Bironta punkt yo'q bo'lsa ham «Barchasi» chiqadi: chiqish va til
       tanlash o'sha panelda. */
    const showMore = allowedItems.length > 5 || allowedItems.length === 0;
    const visibleItems = showMore ? allowedItems.slice(0, 4) : allowedItems;

    const isActive = (item: NavItemDef) => {
        if (item.id === 'patients') return location.pathname.startsWith('/patients');
        return location.pathname === item.path;
    };

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50 px-2 pb-safe-area-inset-bottom">
            <div className="flex justify-around items-center h-16">
                {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item);

                    return (
                        <button
                            key={item.id}
                            onClick={() => navigate(item.path)}
                            className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 relative ${active
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all duration-300 ${active ? 'bg-primary-50 dark:bg-primary-900/30 scale-110' : ''}`}>
                                <Icon className={`w-5 h-5 ${active ? 'fill-current' : ''}`} />
                            </div>
                            <span className="text-[10px] font-medium mt-1 truncate max-w-full px-1">{t(item.labelKey)}</span>
                            {active && (
                                <div className="absolute bottom-1 w-1 h-1 bg-primary-600 dark:bg-primary-400 rounded-full" />
                            )}
                        </button>
                    );
                })}

                {showMore && (
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 ${isSidebarOpen
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                    >
                        <div className={`p-1.5 rounded-xl transition-all duration-300 ${isSidebarOpen ? 'bg-primary-50 dark:bg-primary-900/30 scale-110' : ''}`}>
                            <MoreHorizontal className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-medium mt-1">{t('nav.all')}</span>
                    </button>
                )}
            </div>
        </nav>
    );
};
