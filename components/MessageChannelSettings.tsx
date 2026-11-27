import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { Clinic } from '../types';
import { CheckCircle2, Send, Smartphone, Layers, Wallet, Loader2, ArrowRight, FlaskConical, MessageSquareWarning, type LucideIcon } from 'lucide-react';

import { useLanguage, tr } from '../context/LanguageContext';
/* ─────────────────────────────────────────────────────────────────────────────
   XABAR KANALI VA BRON TO'LOVI — XABARLAR MODULIDA.

   Ikkalasi ham Sozlamalar → Integratsiyalar da turardi va o'sha yerda
   o'rinsiz edi:

     · «SMS yoki Telegram» — bu Xabarlar bo'limining ASOSIY sozlamasi.
       Shablon yozayotgan odam u qaysi kanal orqali ketishini shu yerda
       bilishi kerak, boshqa bo'limga borib emas;

     · «Oldindan to'lov» — bot bemordan nima talab qilishi haqida, ya'ni
       yana bot xatti-harakati.

   ESKIZ MAYDONLARI HAR DOIM KO'RINADI. Ilgari ular faqat «SMS» yoki
   «Ikkalasi ham» tanlanganda chiqardi — ya'ni SMS ni oldindan ulash
   mumkin emas edi.

   TELEGRAM BOT HOLATI HAM SHU YERDA (2026-11-25). Ilgari bu sahifada faqat
   Eskiz holati bor edi; bot ulanganmi — bilish uchun boshqa bo'limga
   borish kerak edi. Bot tokeni hamon Sozlamalar → Integratsiyalar da
   (u yerda boshqa bot sozlamalari ham bor) — bu yerdan bir bosishda.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    clinicId?: string;
    currentClinic?: Clinic | null;
    /** Telegram bot tokeni kiritilganmi (ota sahifa biladi) */
    telegramConnected?: boolean;
    /** Klinika yozuvi o'zgardi — ota-ekran uni qayta o'qiydi */
    onClinicUpdated?: () => void;
}

type Mode = 'telegram_only' | 'sms_only' | 'both';

/* Eskiz login va paroli uchun. «Login + parol» juftligini brauzer XClinic'ga
   kirish formasi deb o'ylab, saqlangan XClinic login va parolini shu yerga
   o'zi yozib qo'yardi. `new-password` butun juftlikni to'ldirishni to'xtatadi;
   `data-1p-ignore` / `data-lpignore` — 1Password va LastPass uchun. */
const NO_AUTOFILL = { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' } as const;
const NO_AUTOFILL_PASSWORD = { ...NO_AUTOFILL, autoComplete: 'new-password' } as const;

// Funksiya — til almashganda yorliqlar ham almashsin
const modes = (): { key: Mode; icon: LucideIcon; title: string; hint: string }[] => [
    { key: 'telegram_only', icon: Send, title: tr('messagechannelsettings.faqat_telegram_bot'), hint: tr('messagechannelsettings.xabarlar_mijozning_telegram_profiliga') },
    { key: 'sms_only', icon: Smartphone, title: tr('messagechannelsettings.faqat_sms_eskiz'), hint: tr('messagechannelsettings.xabarlar_bevosita_telefon_raqamiga') },
    { key: 'both', icon: Layers, title: tr('messagechannelsettings.ikkalasi_ham'), hint: tr('messagechannelsettings.avval_telegram_song_qoshimcha') },
];

const StatusPill: React.FC<{ on: boolean }> = ({ on }) => {
    const { t } = useLanguage();
    return (
        <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold ${on
            ? 'bg-success-500/12 text-success'
            : 'bg-elevated text-muted'}`}>
            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-success-500' : 'bg-faint'}`} />
            {on ? t('messagechannelsettings.ulangan') : t('messagechannelsettings.ulanmagan')}
        </span>
    );
};

export const MessageChannelSettings: React.FC<Props> = ({ clinicId, currentClinic, telegramConnected, onClinicUpdated }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [mode, setMode] = useState<Mode>('telegram_only');
    const [eskizEmail, setEskizEmail] = useState('');
    const [eskizPassword, setEskizPassword] = useState('');
    const [eskizNick, setEskizNick] = useState('4546');
    const [connected, setConnected] = useState(false);
    const [hasPassword, setHasPassword] = useState(false);
    const [savingSms, setSavingSms] = useState(false);

    const [prepayEnabled, setPrepayEnabled] = useState(false);
    const [prepayCard, setPrepayCard] = useState('');
    const [prepayAmount, setPrepayAmount] = useState(0);
    const [savingPrepay, setSavingPrepay] = useState(false);
    const [labAuto, setLabAuto] = useState(false);
    const [savingLabAuto, setSavingLabAuto] = useState(false);
    /* Past baho (shikoyat) — egaga Telegram xabar (2026-11-26) */
    const [cmpAlert, setCmpAlert] = useState(false);
    const [savingCmpAlert, setSavingCmpAlert] = useState(false);

    const botOn = telegramConnected ?? !!currentClinic?.botToken;

    const load = useCallback(async () => {
        if (!clinicId) return;
        try {
            const d: any = await api.sms.getSettings(clinicId);
            setMode((d.notificationMode as Mode) || 'telegram_only');
            setEskizEmail(d.eskizEmail || '');
            setEskizNick(d.eskizNick || '4546');
            setConnected(!!d.isConnected);
            setHasPassword(!!d.hasPassword);
        } catch { /* xato toast orqali ko'rinadi */ }
    }, [clinicId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!currentClinic) return;
        setPrepayEnabled((currentClinic as any).prepaymentEnabled ?? false);
        setPrepayCard((currentClinic as any).prepaymentCardNumber || '');
        setPrepayAmount((currentClinic as any).prepaymentAmount || 0);
        setLabAuto(!!currentClinic.labResultAutoSend);
        setCmpAlert(!!(currentClinic as any).complaintAlert);
    }, [currentClinic]);

    const saveSms = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clinicId) return;
        setSavingSms(true);
        try {
            await api.sms.saveSettings(clinicId, {
                notificationMode: mode,
                eskizEmail,
                eskizPassword: eskizPassword || undefined,
                eskizNick: eskizNick || '4546',
            });
            setEskizPassword('');
            toast.success(t('ui.saqlandi'));
            await load();
        } catch (err: any) {
            toast.error(err?.data?.error || err?.message || t('ui.saqlab_bolmadi'));
        } finally {
            setSavingSms(false);
        }
    };

    const savePrepay = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!clinicId) return;
        setSavingPrepay(true);
        try {
            await api.clinics.savePrepaymentSettings(clinicId, {
                prepaymentEnabled: prepayEnabled,
                prepaymentCardNumber: prepayCard,
                prepaymentAmount: prepayAmount,
            });
            toast.success(t('ui.saqlandi'));
            onClinicUpdated?.();
        } catch (err: any) {
            toast.error(err?.data?.error || err?.message || t('ui.saqlab_bolmadi'));
        } finally {
            setSavingPrepay(false);
        }
    };

    /* Tahlil natijasi o'zi yuborilsin — bitta tugma, darhol saqlanadi */
    const toggleLabAuto = async (next: boolean) => {
        if (!clinicId || savingLabAuto) return;
        setLabAuto(next);
        setSavingLabAuto(true);
        try {
            await api.patientDocs.setLabAutoSend(clinicId, next);
            toast.success(t('ui.saqlandi'));
            onClinicUpdated?.();
        } catch (err: any) {
            setLabAuto(!next);
            toast.error(err?.data?.error || err?.message || t('ui.saqlab_bolmadi'));
        } finally {
            setSavingLabAuto(false);
        }
    };

    const toggleCmpAlert = async (next: boolean) => {
        if (!clinicId || savingCmpAlert) return;
        setCmpAlert(next);
        setSavingCmpAlert(true);
        try {
            await api.complaints.setAlert(clinicId, next);
            toast.success(t('ui.saqlandi'));
            onClinicUpdated?.();
        } catch (err: any) {
            setCmpAlert(!next);
            toast.error(err?.data?.error || err?.message || t('ui.saqlab_bolmadi'));
        } finally {
            setSavingCmpAlert(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* ── Kanal ─────────────────────────────────────────────── */}
            <section className="card p-5" aria-labelledby="mcs-channel">
                <div className="mb-4">
                    <h2 id="mcs-channel" className="text-base font-semibold text-ink">{t('messagechannelsettings.xabar_yuborish_kanali')}</h2>
                    <p className="text-sm text-muted mt-0.5">{t('messagechannelsettings.avtomatik_xabarlar_qaysi_yol')}</p>
                </div>

                <form onSubmit={saveSms} className="space-y-5">
                    <div role="radiogroup" aria-labelledby="mcs-channel" className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {modes().map(m => {
                            const on = mode === m.key;
                            return (
                                <label key={m.key}
                                    className={`relative flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40 ${on
                                        ? 'border-primary-500 bg-primary-500/[0.06]'
                                        : 'border-line hover:border-faint'}`}>
                                    <input type="radio" name="mcs-mode" className="sr-only" checked={on} onChange={() => setMode(m.key)} />
                                    <span aria-hidden="true" className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${on
                                        ? 'bg-primary-500/12 text-primary-600 dark:text-primary-300'
                                        : 'bg-elevated text-faint'}`}>
                                        <m.icon className="w-[18px] h-[18px]" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-ink">{m.title}</span>
                                        <span className="block text-xs text-muted mt-0.5">{m.hint}</span>
                                    </span>
                                    {on && <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0" aria-hidden="true" />}
                                </label>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 items-start">
                        {/* ── Telegram bot ── */}
                        <div className="rounded-xl border border-line p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                                    <Send className="w-4 h-4 text-faint" aria-hidden="true" /> Telegram bot
                                </h3>
                                <StatusPill on={botOn} />
                            </div>
                            <p className="text-xs text-muted">{botOn ? t('msg.settings.botOn') : t('msg.settings.botOff')}</p>
                            <Button type="button" size="sm" variant="secondary" onClick={() => navigate('/settings?tab=integrations')}>
                                {t('msg.settings.openIntegrations')} <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        {/* ── Eskiz — HAR DOIM ko'rinadi ─────────────────── */}
                        <div className="rounded-xl border border-line p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                                    <Smartphone className="w-4 h-4 text-faint" aria-hidden="true" /> {t('messagechannelsettings.eskiz_uz_sms_operatori')}
                                </h3>
                                <StatusPill on={connected} />
                            </div>

                            {mode === 'telegram_only' && (
                                <p className="text-xs text-muted">{t('messagechannelsettings.hozir_sms_ochiq_xabarlar')}</p>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Input label="Kabinet email" placeholder="kabinet@eskiz.uz"
                                    value={eskizEmail} onChange={e => setEskizEmail(e.target.value)} {...NO_AUTOFILL} />
                                <Input label="Kabinet paroli" type="password" {...NO_AUTOFILL_PASSWORD}
                                    placeholder={hasPassword ? t('messagechannelsettings.parol_kiritilgan_ozgartirish_uchun') : t('messagechannelsettings.parolni_kiriting')}
                                    value={eskizPassword} onChange={e => setEskizPassword(e.target.value)} />
                            </div>
                            <Input label={t('messagechannelsettings.yuboruvchi_nomi_nickname')} placeholder={t('messagechannelsettings.4546_yoki_xclinic')}
                                value={eskizNick} onChange={e => setEskizNick(e.target.value)}
                                helperText={t('messagechannelsettings.eskizda_tasdiqlangan_nomingiz_bolsa')} />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={savingSms}>
                            {savingSms && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t('messagechannelsettings.saqlash_va_ulanishni_tekshirish')}
                        </Button>
                    </div>
                </form>
            </section>

            {/* ── Tahlil natijasi o'zi yuborilsin (2026-11-26) ─────────── */}
            <section className="card p-5" aria-labelledby="mcs-labauto">
                <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="w-9 h-9 rounded-lg bg-primary-500/12 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
                        <FlaskConical className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id="mcs-labauto" className="text-base font-semibold text-ink">{t('doc.tg.autoTitle')}</h2>
                        <p className="text-sm text-muted mt-0.5">{t('doc.tg.autoHint')}</p>
                        {!botOn && <p className="text-xs text-warning-700 dark:text-warning-300 mt-1">{t('doc.tg.autoNeedsBot')}</p>}
                    </div>
                    <label className="relative shrink-0 cursor-pointer mt-1">
                        <input type="checkbox" className="sr-only peer" checked={labAuto} disabled={savingLabAuto}
                            aria-label={t('doc.tg.autoTitle')}
                            onChange={e => toggleLabAuto(e.target.checked)} />
                        <span className={`block w-10 h-6 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40 ${labAuto ? 'bg-success-500' : 'bg-line'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${labAuto ? 'translate-x-4' : ''}`} />
                        </span>
                    </label>
                </div>
            </section>

            {/* ── Past baho — egaga xabar (2026-11-26) ────────────────── */}
            <section className="card p-5" aria-labelledby="mcs-cmpalert">
                <div className="flex items-start gap-3">
                    <span aria-hidden="true" className="w-9 h-9 rounded-lg bg-warning-500/12 text-warning-700 dark:text-warning-300 flex items-center justify-center shrink-0">
                        <MessageSquareWarning className="w-[18px] h-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 id="mcs-cmpalert" className="text-base font-semibold text-ink">{t('cmp.alertTitle')}</h2>
                        <p className="text-sm text-muted mt-0.5">{t('cmp.alertHint')}</p>
                        {!botOn && <p className="text-xs text-warning-700 dark:text-warning-300 mt-1">{t('doc.tg.autoNeedsBot')}</p>}
                    </div>
                    <label className="relative shrink-0 cursor-pointer mt-1">
                        <input type="checkbox" className="sr-only peer" checked={cmpAlert} disabled={savingCmpAlert}
                            aria-label={t('cmp.alertTitle')}
                            onChange={e => toggleCmpAlert(e.target.checked)} />
                        <span className={`block w-10 h-6 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40 ${cmpAlert ? 'bg-success-500' : 'bg-line'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${cmpAlert ? 'translate-x-4' : ''}`} />
                        </span>
                    </label>
                </div>
            </section>

            {/* ── Bron uchun oldindan to'lov ─────────────────────────── */}
            <section className="card p-5" aria-labelledby="mcs-prepay">
                <form onSubmit={savePrepay} className="space-y-4">
                    <div className="flex items-start gap-3">
                        <span aria-hidden="true" className="w-9 h-9 rounded-lg bg-success-500/12 text-success flex items-center justify-center shrink-0">
                            <Wallet className="w-[18px] h-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h2 id="mcs-prepay" className="text-base font-semibold text-ink">{t('messagechannelsettings.bron_uchun_oldindan_tolov')}</h2>
                            <p className="text-sm text-muted mt-0.5">{t('messagechannelsettings.bemor_bot_orqali_qabulga')}</p>
                            {/* Tasdiqlangan chek bemor hisobiga AVANS bo'lib tushadi —
                                aytib qo'yamiz, aks holda kassir ikkinchi marta undirardi. */}
                            <p className="text-xs text-success mt-1">{t('messagechannelsettings.chek_tasdiqlanganda_summa_bemor')}</p>
                        </div>
                        <label className="relative shrink-0 cursor-pointer mt-1">
                            <input type="checkbox" className="sr-only peer" checked={prepayEnabled}
                                aria-label={t('messagechannelsettings.oldindan_tolovni_yoqish')}
                                onChange={e => setPrepayEnabled(e.target.checked)} />
                            <span className={`block w-10 h-6 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/40 ${prepayEnabled ? 'bg-success-500' : 'bg-line'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${prepayEnabled ? 'translate-x-4' : ''}`} />
                            </span>
                        </label>
                    </div>

                    {!prepayEnabled && (
                        <p className="text-xs text-muted pl-12">{t('messagechannelsettings.yoqilmasa_bot_bemordan_chek')}</p>
                    )}

                    {prepayEnabled && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-12">
                            <Input label={t('ui.karta_raqami')} placeholder="8600 1234 5678 9012"
                                value={prepayCard} onChange={e => setPrepayCard(e.target.value)} />
                            <Input label={t('messagechannelsettings.bron_summasi_som')} type="number" placeholder="50000"
                                value={prepayAmount === 0 ? '' : String(prepayAmount)}
                                onChange={e => setPrepayAmount(Number(e.target.value))} />
                            <p className="sm:col-span-2 text-xs text-muted">{t('messagechannelsettings.bemor_chekni_bot_orqali')}</p>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Button type="submit" variant="secondary" disabled={savingPrepay}>
                            {savingPrepay && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t('ui.saqlash')}
                        </Button>
                    </div>
                </form>
            </section>
        </div>
    );
};
