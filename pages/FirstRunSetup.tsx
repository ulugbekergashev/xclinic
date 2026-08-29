/* BIRINCHI ISHGA TUSHIRISH — klinikani sozlash va aktivatsiya.
 *
 * Yangi o'rnatmada baza bo'sh bo'ladi: klinika ham, admin ham yo'q.
 * Ilgari bunday holatda xaridor kirish sahifasini ko'rar, lekin hech
 * qanday login mavjud bo'lmagani uchun ichkariga kira olmasdi — bu
 * mahsulotni sotishga to'sqinlik qiladigan asosiy narsa edi.
 *
 * Ekran ikki qismdan iborat:
 *   1. MASHINA IDENTIFIKATORI — xaridor uni sotuvchiga yuboradi
 *   2. Klinika nomi, admin login/paroli va olingan kalit
 *
 * Kalit shu kompyuterga bog'langan, ya'ni dastur nusxasi boshqa
 * mashinada ochilmaydi.
 */
import React, { useState } from 'react';
import { Card, Button, Input } from '../components/Common';
import { Logo } from '../components/Logo';
import { AlertCircle, Copy, Check, KeyRound, Building2, ArrowRight } from 'lucide-react';
import { API_BASE_URL } from '../services/api';

interface Props {
    machineId: string;
    /** Klinika bor, lekin kalit yo'q yoki eskirgan — faqat aktivatsiya kerak */
    activateOnly?: boolean;
    onDone: () => void;
}

export const FirstRunSetup: React.FC<Props> = ({ machineId, activateOnly = false, onDone }) => {
    const [clinicName, setClinicName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [phone, setPhone] = useState('+998');
    const [key, setKey] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const copyId = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
        } catch {
            /* Xavfsiz bo'lmagan kontekstda clipboard ishlamaydi —
               eski usul bilan nusxa olamiz, aks holda xaridor uzun
               kodni qo'lda ko'chirishga majbur bo'lardi. */
            const ta = document.createElement('textarea');
            ta.value = machineId;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch { /* qo'lda ko'chiradi */ }
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!activateOnly) {
            if (!clinicName.trim()) return setError('Klinika nomini kiriting');
            if (!username.trim()) return setError('Admin loginini kiriting');
            if (password.length < 8) return setError('Parol kamida 8 belgidan iborat bo\'lsin');
            if (password !== password2) return setError('Parollar mos kelmadi');
        }
        if (!key.trim()) return setError('Aktivatsiya kalitini kiriting');

        setBusy(true);
        try {
            const url = activateOnly ? '/api/license/activate' : '/api/license/setup';
            const body = activateOnly
                ? { key: key.trim() }
                : {
                    clinicName: clinicName.trim(),
                    username: username.trim().toLowerCase(),
                    password,
                    phone: phone.trim(),
                    key: key.trim(),
                };
            const r = await fetch(API_BASE_URL + url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) {
                setError(data?.error || 'Sozlashda xatolik yuz berdi');
                return;
            }
            onDone();
        } catch {
            setError('Serverga ulanib bo\'lmadi. Dastur ishlab turganini tekshiring.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
            <div className="w-full max-w-lg">
                <div className="text-center mb-6">
                    <Logo className="mx-auto w-16 h-16 shadow-lg rounded-2xl mb-4" />
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                        X<span className="text-primary dark:text-primary-400">Clinic</span>
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        {activateOnly ? 'Dasturni aktivlashtirish' : 'Birinchi sozlash'}
                    </p>
                </div>

                {/* ── Mashina identifikatori ─────────────────────────── */}
                <Card className="p-5 mb-4 border-l-4 border-l-primary-600">
                    <div className="flex items-start gap-3">
                        <KeyRound className="w-5 h-5 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                1-qadam: kodni sotuvchiga yuboring
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
                                Aktivatsiya kaliti shu kompyuter uchun alohida tayyorlanadi.
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 font-mono text-sm text-gray-900 dark:text-gray-100 break-all">
                                    {machineId}
                                </code>
                                <button
                                    type="button"
                                    onClick={copyId}
                                    title="Nusxa olish"
                                    className="shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                                >
                                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 shadow-xl">
                    <form onSubmit={submit} className="space-y-4">
                        {error && (
                            <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}

                        {!activateOnly && (
                            <>
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                    <Building2 className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                                    2-qadam: klinika va administrator
                                </div>
                                <Input
                                    label="Klinika nomi"
                                    value={clinicName}
                                    onChange={e => setClinicName(e.target.value)}
                                    placeholder="Shifo Klinikasi"
                                />
                                <Input
                                    label="Telefon (ixtiyoriy)"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    placeholder="+998 90 123 45 67"
                                />
                                <Input
                                    label="Administrator logini"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="admin"
                                    autoComplete="username"
                                />
                                <Input
                                    label="Parol"
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="kamida 8 belgi"
                                    autoComplete="new-password"
                                />
                                <Input
                                    label="Parolni takrorlang"
                                    type="password"
                                    value={password2}
                                    onChange={e => setPassword2(e.target.value)}
                                    autoComplete="new-password"
                                />
                            </>
                        )}

                        <Input
                            label={activateOnly ? 'Aktivatsiya kaliti' : '3-qadam: aktivatsiya kaliti'}
                            value={key}
                            onChange={e => setKey(e.target.value.toUpperCase())}
                            placeholder="XXXXXXXXXXXXXXXXXXXXXXXX"
                            className="font-mono"
                        />

                        <Button type="submit" disabled={busy} className="w-full justify-center">
                            {busy ? 'Tekshirilmoqda…' : (
                                <>
                                    {activateOnly ? 'Aktivlashtirish' : 'Sozlashni yakunlash'}
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </Button>
                    </form>
                </Card>

                <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
                    Kalit yo'qolsa yoki kompyuter almashsa — sotuvchiga murojaat qiling.
                </p>
            </div>
        </div>
    );
};
