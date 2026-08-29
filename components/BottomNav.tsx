import React from 'react';
import type { TranslationKey } from '../i18n/translations';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, DollarSign, Activity, Package, Settings, MoreHorizontal, MessageSquare, Wallet, BedDouble } from 'lucide-react';
import { UserRole, AccessControl } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { isModuleHidden, canSeeFinance } from '../utils/accessControl';

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

    // Full list of available items for clinic roles
    const allItems = [
        { id: 'dashboard', path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
        { id: 'patients', path: '/patients', labelKey: 'nav.patients', icon: Users, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
        { id: 'calendar', path: '/calendar', labelKey: 'nav.calendar', icon: Calendar, roles: [UserRole.CLINIC_ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST] },
        { id: 'finance', path: '/finance', labelKey: 'nav.finance', icon: Wallet, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
        { id: 'doctors', path: '/doctors', labelKey: 'nav.doctors', icon: Activity, roles: [UserRole.CLINIC_ADMIN] },
        { id: 'inventory', path: '/inventory', labelKey: 'nav.inventory', icon: Package, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
        { id: 'messages', path: '/messages', labelKey: 'nav.messages', icon: MessageSquare, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
        { id: 'settings', path: '/settings', labelKey: 'nav.settings', icon: Settings, roles: [UserRole.CLINIC_ADMIN, UserRole.RECEPTIONIST] },
        /* Pastki menyu — qisqartirilgan ro'yxat, statsionar unga kirmagan.
           Hamshira uchun esa bu yagona ekran: qo'shmasak, telefonda pastki
           menyu umuman bo'sh bo'lib qoladi. Boshqa rollarda o'zgarish yo'q. */
        { id: 'inpatient', path: '/inpatient', labelKey: 'nav.inpatient', icon: BedDouble, roles: [UserRole.NURSE] },
    ];

    // Filter items based on role + ruxsatlar (Sozlamalar → Ruxsatlar)
    const allowedItems = allItems.filter(item =>
        item.roles.includes(userRole)
        && !isModuleHidden(accessControl, userRole, item.id)
        && (item.id !== 'finance' || canSeeFinance(accessControl, userRole))
    );

    // If items <= 5, show all. If > 5, show first 4 and a "More" button.
    const showMore = allowedItems.length > 5;
    const visibleItems = showMore ? allowedItems.slice(0, 4) : allowedItems;

    const isActive = (item: typeof allItems[0]) => {
        if (item.id === 'dashboard') return location.pathname === '/';
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
                            <span className="text-[10px] font-medium mt-1 truncate max-w-full px-1">{t(item.labelKey as TranslationKey)}</span>
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
