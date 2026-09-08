import React, { useEffect, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Wifi, Globe, Copy, Check, AlertTriangle, Smartphone, RefreshCw, Loader2 } from 'lucide-react';
import { Card, Button } from './Common';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { toast } from '../services/toast';

/* ─────────────────────────────────────────────────────────────────────────────
   TARMOQ VA KIRISH.

   Server bu ma'lumotni ALLAQACHON berardi: `/api/network-info` manzilni,
   portni va tunnel havolasini qaytaradi, va `server.ts` dagi izohda aynan
   «Sozlamalar oynasi shu manzilni ko'rsatadi» deb yozilgan. Lekin uni
   chaqiradigan bironta ekran yo'q edi — manzil faqat Electron oynasining
   SARLAVHASIDA ko'rinardi, ya'ni brauzerdan kirgan odam uni umuman
   ko'rmasdi. `qrcode.react` ham o'rnatilgan, lekin hech qayerda
   ishlatilmagan edi.

   Endi bu yerda: Wi-Fi havolasi, QR kod (telefon uchun) va internet
   orqali kirish tumbleri.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    /** Faqat klinika egasi masofaviy kirishni yoqa oladi */
    canManageRemote: boolean;
}

const CopyRow: React.FC<{ value: string; label: string }> = ({ value, label }) => {
    const { t } = useLanguage();
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch { toast.error(t('net.copyFailed')); }
    };
    return (
        <div className="flex flex-wrap items-center gap-2">
            <a href={value} target="_blank" rel="noopener noreferrer"
                className="font-mono text-sm text-primary-700 dark:text-primary-300 hover:underline break-all">
                {value}
            </a>
            <Button variant="secondary" size="sm" onClick={copy} aria-label={label}>
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span className="ml-2">{copied ? t('net.copied') : t('net.copy')}</span>
            </Button>
        </div>
    );
};

export const NetworkAccessTab: React.FC<Props> = ({ canManageRemote }) => {
    const { t } = useLanguage();
    const [info, setInfo] = useState<{ ip: string; port: number; url: string; tunnelUrl: string | null } | null>(null);
    const [remote, setRemote] = useState<{ enabled: boolean; defaultPasswordInUse: boolean } | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [n, r] = await Promise.all([
                api.network.info(),
                canManageRemote ? api.network.getRemoteAccess() : Promise.resolve(null),
            ]);
            setInfo(n);
            if (r) setRemote({ enabled: r.enabled, defaultPasswordInUse: r.defaultPasswordInUse });
        } catch {
            /* Manzil olinmasa ham sahifa ochiladi: qolgan sozlamalar ishlaydi */
            setInfo(null);
        } finally { setLoading(false); }
    }, [canManageRemote]);

    useEffect(() => { load(); }, [load]);

    const toggleRemote = async () => {
        if (!remote) return;
        setSaving(true);
        try {
            const r = await api.network.setRemoteAccess(!remote.enabled);
            setRemote(prev => prev ? { ...prev, enabled: r.enabled } : prev);
            toast.success(t('net.restartNeeded'));
            load();
        } catch (e: any) {
            /* Standart parol turganda server 409 qaytaradi — bu ATAYLAB:
               internetga ochiq `admin/admin` — klinikaning butun bazasi. */
            toast.error(e?.data?.error || e?.message || t('net.saveFailed'));
        } finally { setSaving(false); }
    };

    if (loading) {
        return (
            <Card className="p-10 flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
            </Card>
        );
    }

    const lanUrl = info?.url || '';

    return (
        <div className="space-y-6">
            {/* ── Klinika ichida (Wi-Fi) ────────────────────────────────── */}
            <Card className="p-6">
                <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-300 shrink-0">
                        <Wifi className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-ink">{t('net.lanTitle')}</h3>
                        <p className="text-sm text-muted mb-4">{t('net.lanDesc')}</p>

                        {lanUrl ? (
                            <div className="flex flex-wrap items-start gap-6">
                                <div className="space-y-3 min-w-0">
                                    <CopyRow value={lanUrl} label={t('net.copy')} />
                                    <p className="text-xs text-muted max-w-md">{t('net.lanHint')}</p>
                                </div>
                                {/* QR — telefon uchun. Klinikada aynan shu kerak:
                                    hamshira raqamni qo'lda yozib o'tirmaydi. */}
                                <div className="text-center shrink-0">
                                    <div className="p-3 bg-surface rounded-xl border border-line inline-block">
                                        <QRCodeSVG value={lanUrl} size={132} level="M" />
                                    </div>
                                    <p className="mt-2 text-xs text-muted flex items-center justify-center gap-1">
                                        <Smartphone className="w-3.5 h-3.5" /> {t('net.scan')}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-faint">{t('net.noAddress')}</p>
                        )}
                    </div>
                    <button onClick={load} aria-label={t('common.refresh')} title={t('common.refresh')}
                        className="p-2 text-faint hover:text-muted rounded-lg shrink-0">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </Card>

            {/* ── Internet orqali ───────────────────────────────────────── */}
            {canManageRemote && remote && (
                <Card className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-300 shrink-0">
                            <Globe className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-bold text-ink">{t('net.internetTitle')}</h3>
                            <p className="text-sm text-muted mb-4">{t('net.internetDesc')}</p>

                            {/* Standart parol turganda server yoqishni RAD ETADI.
                                Sabab ochiq aytiladi, aks holda tugma «ishlamayapti»
                                bo'lib ko'rinadi. */}
                            {remote.defaultPasswordInUse && (
                                <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-700 dark:text-red-300">{t('net.defaultPassword')}</p>
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    variant={remote.enabled ? 'secondary' : 'primary'}
                                    onClick={toggleRemote}
                                    disabled={saving || (!remote.enabled && remote.defaultPasswordInUse)}
                                >
                                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    {remote.enabled ? t('net.turnOff') : t('net.turnOn')}
                                </Button>
                                <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${remote.enabled
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                    : 'bg-elevated text-muted'}`}>
                                    {remote.enabled ? t('net.on') : t('net.off')}
                                </span>
                            </div>

                            {remote.enabled && (
                                <p className="mt-3 text-xs text-muted">{t('net.restartNeeded')}</p>
                            )}

                            {info?.tunnelUrl && (
                                <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-start gap-6">
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-muted mb-1.5">{t('net.internetAddress')}</p>
                                        <CopyRow value={info.tunnelUrl} label={t('net.copy')} />
                                    </div>
                                    <div className="p-3 bg-surface rounded-xl border border-line shrink-0">
                                        <QRCodeSVG value={info.tunnelUrl} size={110} level="M" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};
