/* Tasdiqlash oynasi — `services/confirm.ts` ning ko'rinadigan qismi (S3.6).
 *
 * Ilovada BIR MARTA joylashtiriladi (`App.tsx`), qolgan hamma joy uni
 * `confirmAction()` orqali chaqiradi. Shuning uchun bu komponentda prop
 * yo'q: u o'zini modulga ulaydi va so'rov kelishini kutadi.
 *
 * Klaviatura: Esc — bekor, Enter — tasdiq. `window.confirm` da ham
 * shunday edi va odat buzilmasligi kerak.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { connectConfirm, disconnectConfirm, type ConfirmOptions } from '../services/confirm';

export const ConfirmDialog: React.FC = () => {
    const [opts, setOpts] = useState<ConfirmOptions | null>(null);
    const resolver = useRef<((v: boolean) => void) | null>(null);
    const confirmBtn = useRef<HTMLButtonElement | null>(null);

    const close = useCallback((answer: boolean) => {
        setOpts(null);
        const r = resolver.current;
        resolver.current = null;
        r?.(answer);
    }, []);

    useEffect(() => {
        connectConfirm((o) => new Promise<boolean>((resolve) => {
            /* Oldingi so'rov javobsiz qolmasin: ikkita tasdiq ketma-ket
               so'ralsa, birinchisi «bekor» deb yopiladi. */
            resolver.current?.(false);
            resolver.current = resolve;
            setOpts(o);
        }));
        return () => disconnectConfirm();
    }, []);

    useEffect(() => {
        if (!opts) return;
        // Fokus tasdiq tugmasida — klaviatura bilan ishlash uchun (S4.2 bilan bir yo'nalishda)
        confirmBtn.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); close(false); }
            if (e.key === 'Enter') { e.preventDefault(); close(true); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [opts, close]);

    if (!opts) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={() => close(false)}
        >
            <div
                className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700 p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    {opts.danger && (
                        <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <h3 id="confirm-title" className="text-base font-semibold text-gray-900 dark:text-white">
                            {opts.title}
                        </h3>
                        {opts.body && (
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{opts.body}</p>
                        )}
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => close(false)}
                        className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600
                                   text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800
                                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                    >
                        {opts.cancelLabel || 'Bekor qilish'}
                    </button>
                    <button
                        ref={confirmBtn}
                        type="button"
                        onClick={() => close(true)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold text-white
                                    focus-visible:outline-2 focus-visible:outline-offset-2
                                    ${opts.danger
                                ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600'
                                : 'bg-primary-600 hover:bg-primary-700 focus-visible:outline-primary-600'}`}
                    >
                        {opts.confirmLabel || 'Tasdiqlash'}
                    </button>
                </div>
            </div>
        </div>
    );
};
