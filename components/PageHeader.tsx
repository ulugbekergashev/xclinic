import React from 'react';

interface PageHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

// Barcha sahifalar uchun yagona sarlavha bloki: chapda sarlavha+subtitle, o'ngda amal tugmalari.
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, icon, actions, className = '' }) => (
    <div className={`flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${className}`}>
        <div className="flex items-center gap-3">
            {icon && <div className="shrink-0">{icon}</div>}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h1>
                {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">{actions}</div>}
    </div>
);
