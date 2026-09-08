import React from 'react';
import { X, Share, PlusSquare, Smartphone } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface IOSInstallModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const IOSInstallModal: React.FC<IOSInstallModalProps> = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
                <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg text-primary-600 dark:text-primary-400">
                                <Smartphone size={24} />
                            </div>
                            <h2 className="text-xl font-bold text-ink">{t('app.install')}</h2>
                        </div>
                        <button aria-label="Yopish"
                            onClick={onClose}
                            className="p-1 hover:bg-elevated rounded-full transition-colors text-muted"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <p className="text-muted">
                            iPhone yoki iPad-ga o'rnatish uchun ushbu amallarni bajaring:
                        </p>

                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold">1</div>
                                <div className="flex items-center gap-2 text-muted">
                                    Brauzerda <Share size={20} className="text-primary-500" /> tugmasini bosing
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 flex items-center justify-center font-bold">2</div>
                                <div className="flex items-center gap-2 text-muted">
                                    Pastga tushib <PlusSquare size={20} className="text-primary-500" /> <b>"Add to Home Screen"</b> (Ekraniga qo'shish) ni tanlang
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-8 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold shadow-lg shadow-primary-600/20 transition-all active:scale-95"
                    >
                        Tushunarli
                    </button>
                </div>
            </div>
        </div>
    );
};
