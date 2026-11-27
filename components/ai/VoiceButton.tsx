/* OVOZ BILAN SAVOL (2026-11-27). Bosiladi — yozadi, yana bosiladi — to'xtaydi
   va serverda matnga aylanadi (backend/ai/speech.ts). Matn so'rov maydoniga
   tushadi: foydalanuvchi o'qib, kerak bo'lsa tuzatib, o'zi yuboradi. */

import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { authFetch, isDemoMode } from '../../services/api';
import { useLanguage, tr } from '../../context/LanguageContext';

const MAX_RECORD_MS = 90_000;

export function VoiceButton({ onText, onError, disabled }: {
    onText: (text: string) => void;
    onError: (message: string) => void;
    disabled?: boolean;
}) {
    const { t, language } = useLanguage();
    const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle');
    const rec = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const timer = useRef<number | null>(null);

    useEffect(() => () => {
        if (timer.current) window.clearTimeout(timer.current);
        rec.current?.stream.getTracks().forEach(tr => tr.stop());
    }, []);

    const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
    if (!supported) return null;

    const send = async (blob: Blob) => {
        setState('busy');
        try {
            const res = await authFetch(`/ai/transcribe?mime=${encodeURIComponent(blob.type || 'audio/webm')}&lang=${language === 'ru' ? 'ru' : 'uz'}`, {
                method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.message || t('aivoice.failed'));
            onText(String(data.text || ''));
        } catch (e: any) {
            onError(e?.message || t('aivoice.failed'));
        } finally { setState('idle'); }
    };

    const start = async () => {
        if (isDemoMode()) return onError(tr('aiassistant.ai_yordamchisi_namoyish_nusxasida'));
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
            const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
            chunks.current = [];
            mr.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
            mr.onstop = () => {
                stream.getTracks().forEach(tr => tr.stop());
                if (timer.current) window.clearTimeout(timer.current);
                const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
                if (blob.size < 1000) { setState('idle'); return onError(t('aivoice.tooShort')); }
                void send(blob);
            };
            rec.current = mr;
            mr.start();
            setState('rec');
            timer.current = window.setTimeout(() => mr.state === 'recording' && mr.stop(), MAX_RECORD_MS);
        } catch {
            onError(t('aivoice.noMic'));
        }
    };
    const stop = () => { if (rec.current?.state === 'recording') rec.current.stop(); };

    const label = state === 'rec' ? t('aivoice.stop') : t('aivoice.start');
    return (
        <button type="button" onClick={state === 'rec' ? stop : start} disabled={disabled || state === 'busy'}
            aria-label={label} title={label} aria-pressed={state === 'rec'}
            className={`w-9 h-9 grid place-items-center rounded-xl transition-colors disabled:opacity-50 ${state === 'rec'
                ? 'bg-red-600 text-white animate-pulse'
                : 'text-muted hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20'}`}>
            {state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : state === 'rec' ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-4 h-4" />}
        </button>
    );
}
