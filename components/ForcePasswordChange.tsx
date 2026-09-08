import React, { useState } from 'react';
import { KeyRound, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import * as auth from '../services/authStore';

/* ─────────────────────────────────────────────────────────────────────────────
   Standart parol bilan kirilganda ko'rsatiladigan YAGONA ekran.

   Nima uchun bu shunchaki "tavsiya" emas. Birinchi ishga tushishda
   `admin` / `admin` hisobi yaratiladi. Klinika uni almashtirmasa — va
   almashtirmaydi, chunki hech kim majburlamaydi — server standart parol bilan
   ochiq qoladi.

   Server tomonda ham to'siq bor: bunday holatda beriladigan token
   `scope: 'password-change'` bilan chegaralangan va boshqa hech qanday
   endpointga yaramaydi. Ya'ni bu ekranni chetlab o'tish (localStorage ni
   tahrirlash, `curl`) hech narsa bermaydi — ikkala to'siq birga ishlaydi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    onDone: () => void;
    onLogout: () => void;
    addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const ForcePasswordChange: React.FC<Props> = ({ onDone, onLogout, addToast }) => {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [repeat, setRepeat] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const tooShort = next.length > 0 && next.length < 8;
    const mismatch = repeat.length > 0 && next !== repeat;
    const canSubmit = current.length > 0 && next.length >= 8 && next === repeat && !busy;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        setError('');
        try {
            const r = await api.auth.changePassword(current, next);

            /* Yangi TO'LIQ token xotiraga olinadi — aks holda foydalanuvchi
               parolni almashtirgach yana login qilishga majbur bo'lardi.
               Yangilash cookie'sini server shu javobda qo'ydi. */
            auth.setToken(r.token);

            addToast('success', 'Parol almashtirildi');
            onDone();
        } catch (err: any) {
            setError(err?.message || "Parolni almashtirib bo'lmadi");
        } finally {
            setBusy(false);
        }
    };

    const inputCls = 'w-full px-4 py-2.5 pr-11 border border-line rounded-lg '
        + 'bg-surface text-ink '
        + 'focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none';

    return (
        <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
            <div className="w-full max-w-md bg-surface rounded-2xl shadow-xl p-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 rounded-xl">
                        <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h1 className="text-xl font-bold text-ink">
                        Parolni almashtiring
                    </h1>
                </div>

                <p className="text-sm text-muted mb-6">
                    Siz standart parol bilan kirdingiz. Uni almashtirmaguncha dasturdan
                    foydalanib bo'lmaydi — bemorlar ma'lumoti himoyasiz qolmasligi kerak.
                </p>

                <form onSubmit={submit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-muted mb-1.5">
                            Joriy parol
                        </label>
                        <input
                            type={show ? 'text' : 'password'}
                            value={current}
                            onChange={(e) => setCurrent(e.target.value)}
                            autoFocus
                            autoComplete="current-password"
                            className={inputCls}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-muted mb-1.5">
                            Yangi parol
                        </label>
                        <div className="relative">
                            <input
                                type={show ? 'text' : 'password'}
                                value={next}
                                onChange={(e) => setNext(e.target.value)}
                                autoComplete="new-password"
                                className={inputCls}
                            />
                            <button
                                type="button"
                                onClick={() => setShow((v) => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted"
                                title={show ? 'Yashirish' : "Ko'rsatish"}
                            >
                                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {tooShort && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                Kamida 8 belgi bo'lishi kerak
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-muted mb-1.5">
                            Yangi parolni takrorlang
                        </label>
                        <input
                            type={show ? 'text' : 'password'}
                            value={repeat}
                            onChange={(e) => setRepeat(e.target.value)}
                            autoComplete="new-password"
                            className={inputCls}
                        />
                        {mismatch && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                Parollar mos kelmadi
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700
                                   disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    >
                        <KeyRound className="w-4 h-4" />
                        {busy ? 'Saqlanmoqda…' : 'Parolni saqlash'}
                    </button>
                </form>

                <button
                    onClick={onLogout}
                    className="w-full mt-3 px-6 py-2.5 text-sm text-muted hover:text-ink transition-colors"
                >
                    Chiqish
                </button>
            </div>
        </div>
    );
};
