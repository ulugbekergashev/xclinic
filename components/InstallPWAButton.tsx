import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { IOSInstallModal } from './IOSInstallModal';
import { useLanguage } from '../context/LanguageContext';

export const InstallPWAButton = () => {
    const { t } = useLanguage();
    const { isInstallable, install, isIOS, isStandalone } = usePWAInstall();
    const [showIOSModal, setShowIOSModal] = useState(false);

    // Don't show if already installed
    if (isStandalone) {
        return null;
    }

    // Show on iOS (even if not "installable" via beforeinstallprompt)
    // OR if it's installable via official prompt
    const shouldShow = isInstallable || (isIOS && !isStandalone);

    if (!shouldShow) {
        return null;
    }

    const handleClick = () => {
        if (isIOS) {
            setShowIOSModal(true);
        } else {
            install();
        }
    };

    return (
        <>
            <button
                onClick={handleClick}
                className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-full shadow-lg transition-all duration-300 animate-fade-in hover:scale-105 active:scale-95"
            >
                <Download size={20} />
                <span>{t('app.install')}</span>
            </button>
            <IOSInstallModal isOpen={showIOSModal} onClose={() => setShowIOSModal(false)} />
        </>
    );
};
