/* TELEGRAM BOT: RAHBAR VA SHIFOKORLAR — Sozlamalar → Integratsiyalar, bot
   tokeni ostida (faqat ega, 2026-11-27, migratsiya 0050).

   Ilgari bu yerda bitta yashil satr edi: «Bot faol, har kuni 22:00 da
   hisobot» — vaqtini o'zgartirib ham, o'chirib ham bo'lmasdi, qaysi
   shifokor ulangani esa umuman ko'rinmasdi. Endi: rahbar ulanganmi,
   kunlik hisobot (yoqiq/vaqt), shifokorlar ro'yxati (ulangan / yo'q) va
   «shifokorga qabul xabari» belgisi. Ulash yo'li — botning o'zida, telefon
   raqami bilan (yangi qadam yo'q). */

import React, { useEffect, useState } from 'react';
import { Send, Check, Clock, ExternalLink } from 'lucide-react';
import { Card } from '../Common';
import { api, TelegramBotInfo } from '../../services/api';
import { toast } from '../../services/toast';
import { useLanguage, fill } from '../../context/LanguageContext';

export function TelegramBotCard({ clinicId }: { clinicId: string }) {
    const { t } = useLanguage();
    const [info, setInfo] = useState<TelegramBotInfo | null>(null);
    const [time, setTime] = useState('22:00');
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        api.telegramBot.get(clinicId).then(i => { setInfo(i); setTime(i.ownerReportTime); }).catch(() => setInfo(null));
    }, [clinicId]);
    if (!info) return null;

    const save = async (patch: Partial<Pick<TelegramBotInfo, 'ownerReportEnabled' | 'ownerReportTime' | 'doctorNotify' | 'anomalyAlert'>>) => {
        const prev = info;
        setInfo({ ...info, ...patch });
        try {
            await api.telegramBot.save(clinicId, patch);
            toast.success(t('ui.saqlandi'));
        } catch (e: any) {
            setInfo(prev);
            setTime(prev.ownerReportTime);
            toast.error(e?.data?.error || e?.message || t('ui.saqlab_bolmadi'));
        }
    };

    if (!info.botConnected) {
        return <p className="text-sm text-muted p-4 rounded-xl border border-line">{t('tgbot.noBot')}</p>;
    }
    const linked = info.doctors.filter(d => d.linked).length;
    const pill = (on: boolean) => on
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
        : 'bg-elevated text-muted';

    return (
        <Card className="p-5 space-y-5" aria-labelledby="tgbot-title">
            <div className="flex flex-wrap items-center gap-3">
                <h3 id="tgbot-title" className="flex items-center gap-2 font-bold text-ink">
                    <Send className="w-4 h-4 text-sky-600" /> {t('tgbot.title')}
                </h3>
                {info.botUsername && (
                    <a href={`https://t.me/${info.botUsername}`} target="_blank" rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline">
                        @{info.botUsername} <ExternalLink className="w-3 h-3" />
                    </a>
                )}
            </div>

            {/* Rahbar */}
            <section className="space-y-3">
                <div className="flex items-start gap-3">
                    <span className={`shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-bold ${pill(info.owner.linked)}`}>
                        {info.owner.linked && <Check className="w-3 h-3" />}{t('tgbot.owner')}
                    </span>
                    <p className="text-sm text-muted">{info.owner.linked ? t('tgbot.ownerLinked') : t('tgbot.ownerNot')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-1">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-primary-600" checked={info.ownerReportEnabled}
                            onChange={e => save({ ownerReportEnabled: e.target.checked })} />
                        {t('tgbot.daily')}
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-sm text-muted">
                        <Clock className="w-4 h-4" />
                        <input type="time" value={time} disabled={!info.ownerReportEnabled} aria-label={t('tgbot.daily')}
                            onChange={e => setTime(e.target.value)}
                            onBlur={() => { if (time && time !== info.ownerReportTime) save({ ownerReportTime: time }); }}
                            className="h-8 px-2 rounded-lg border border-line bg-surface text-ink text-sm disabled:opacity-50" />
                    </label>
                    <p className="w-full text-xs text-faint">{t('tgbot.dailyHint')}</p>
                    <label className="w-full inline-flex items-start gap-2 text-sm text-ink cursor-pointer">
                        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-primary-600" checked={info.anomalyAlert !== false}
                            disabled={!info.ownerReportEnabled} onChange={e => save({ anomalyAlert: e.target.checked })} />
                        <span>{t('tgbot.anomaly')}<span className="block text-xs text-faint">{t('tgbot.anomalyHint')}</span></span>
                    </label>
                    <button type="button" className="text-xs font-semibold text-primary-700 dark:text-primary-300 hover:underline"
                        onClick={async () => {
                            if (preview !== null) return setPreview(null);
                            try { setPreview((await api.telegramBot.preview(clinicId)).html); }
                            catch (e: any) { toast.error(e?.data?.error || e?.message || t('ui.xatolik_yuz_berdi')); }
                        }}>
                        {preview !== null ? t('tgbot.hidePreview') : t('tgbot.preview')}
                    </button>
                    {preview !== null && (
                        <pre aria-label={t('tgbot.preview')} className="w-full whitespace-pre-wrap rounded-xl bg-elevated p-3 text-xs text-ink font-sans">
                            {preview.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')}
                        </pre>
                    )}
                </div>
            </section>

            {/* Shifokorlar */}
            <section className="space-y-3 pt-4 border-t border-line-soft">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink">{t('tgbot.doctors')}</span>
                    <span className="text-xs text-muted">{fill(t('tgbot.doctorsLinked'), linked, info.doctors.length)}</span>
                </div>
                {info.doctors.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                        {info.doctors.map(d => (
                            <li key={d.id} className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold ${pill(d.linked)}`}
                                title={!d.linked && !d.hasPhone ? t('tgbot.noPhone') : undefined}>
                                {d.linked && <Check className="w-3 h-3" />}{d.name}
                                {!d.linked && !d.hasPhone && <span className="text-amber-700 dark:text-amber-400"> · {t('tgbot.noPhone')}</span>}
                            </li>
                        ))}
                    </ul>
                )}
                <p className="text-xs text-faint">{t('tgbot.doctorHow')}</p>
                <label className="inline-flex items-start gap-2 text-sm font-semibold text-ink cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-primary-600" checked={info.doctorNotify}
                        onChange={e => save({ doctorNotify: e.target.checked })} />
                    {t('tgbot.doctorNotify')}
                </label>
            </section>

            {/* Registratorlar (0051) */}
            {!!info.receptionists?.length && (
                <section className="space-y-3 pt-4 border-t border-line-soft">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink">{t('tgbot.reception')}</span>
                        <span className="text-xs text-muted">{fill(t('tgbot.doctorsLinked'), info.receptionists.filter(r => r.linked).length, info.receptionists.length)}</span>
                    </div>
                    <ul className="flex flex-wrap gap-1.5">
                        {info.receptionists.map(d => (
                            <li key={d.id} className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold ${pill(d.linked)}`}>
                                {d.linked && <Check className="w-3 h-3" />}{d.name}
                                {!d.linked && !d.hasPhone && <span className="text-amber-700 dark:text-amber-400"> · {t('tgbot.noPhone')}</span>}
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-faint">{t('tgbot.receptionHow')}</p>
                </section>
            )}
        </Card>
    );
}
