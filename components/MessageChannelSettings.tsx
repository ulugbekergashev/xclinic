import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { Clinic } from '../types';
import { MessageSquare, CheckCircle, Activity, DollarSign, Loader2 } from 'lucide-react';

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
   mumkin emas edi: avval rejimni almashtirib saqlash, keyin qaytib kelib
   login kiritish kerak bo'lardi. Foydalanuvchi esa oddiygina «kiritadigan
   joy yo'q» deb o'ylaydi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    clinicId?: string;
    currentClinic?: Clinic | null;
    /** Klinika yozuvi o'zgardi — ota-ekran uni qayta o'qiydi */
    onClinicUpdated?: () => void;
}

type Mode = 'telegram_only' | 'sms_only' | 'both';

const MODES: { key: Mode; icon: string; title: string; hint: string }[] = [
    { key: 'telegram_only', icon: '🤖', title: tr('messagechannelsettings.faqat_telegram_bot'), hint: tr('messagechannelsettings.xabarlar_mijozning_telegram_profiliga') },
    { key: 'sms_only', icon: '📱', title: tr('messagechannelsettings.faqat_sms_eskiz'), hint: tr('messagechannelsettings.xabarlar_bevosita_telefon_raqamiga') },
    { key: 'both', icon: '🤖📱', title: tr('messagechannelsettings.ikkalasi_ham'), hint: tr('messagechannelsettings.avval_telegram_song_qoshimcha') },
];

export const MessageChannelSettings: React.FC<Props> = ({ clinicId, currentClinic, onClinicUpdated }) => {
    const { t } = useLanguage();
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

    return (
        <div className="space-y-6">
            {/* ── Kanal ─────────────────────────────────────────────── */}
            <Card className="p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 shrink-0">
                        <MessageSquare className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-ink">{t('messagechannelsettings.xabar_yuborish_kanali')}</h2>
                        <p className="text-sm text-muted">
                            {t('messagechannelsettings.avtomatik_xabarlar_qaysi_yol')}
                        </p>
                    </div>
                </div>

                <form onSubmit={saveSms} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {MODES.map(m => (
                            <label key={m.key}
                                className={`relative flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-colors ${mode === m.key
                                    ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-900/20'
                                    : 'border-line hover:border-primary-300'}`}>
                                <input type="radio" className="sr-only" checked={mode === m.key}
                                    onChange={() => setMode(m.key)} />
                                <span className="text-lg leading-none">{m.icon}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-ink">{m.title}</span>
                                    <span className="block text-xs text-muted mt-1">{m.hint}</span>
                                </span>
                                {mode === m.key && <CheckCircle className="w-5 h-5 text-primary-600 shrink-0" />}
                            </label>
                        ))}
                    </div>

                    {/* ── Eskiz — HAR DOIM ko'rinadi ─────────────────── */}
                    <div className="rounded-2xl border border-line p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-ink">{t('messagechannelsettings.eskiz_uz_sms_operatori')}</h3>
                            <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${connected
                                ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                {connected ? <CheckCircle className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                                {connected ? t('messagechannelsettings.ulangan') : t('messagechannelsettings.ulanmagan')}
                            </span>
                        </div>

                        {mode === 'telegram_only' && (
                            <p className="text-xs text-muted">
                                {t('messagechannelsettings.hozir_sms_ochiq_xabarlar')}
                            </p>
                        )}

                        <Input label="Kabinet email" placeholder="kabinet@eskiz.uz"
                            value={eskizEmail} onChange={e => setEskizEmail(e.target.value)} />
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-muted">Kabinet paroli</label>
                            <input type="password"
                                className="w-full px-3 py-2 border border-line rounded-lg bg-surface text-ink text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                                placeholder={hasPassword ? t('messagechannelsettings.parol_kiritilgan_ozgartirish_uchun') : t('messagechannelsettings.parolni_kiriting')}
                                value={eskizPassword} onChange={e => setEskizPassword(e.target.value)} />
                        </div>
                        <Input label={t('messagechannelsettings.yuboruvchi_nomi_nickname')} placeholder={t('messagechannelsettings.4546_yoki_xclinic')}
                            value={eskizNick} onChange={e => setEskizNick(e.target.value)}
                            helperText={t('messagechannelsettings.eskizda_tasdiqlangan_nomingiz_bolsa')} />
                    </div>

                    <Button type="submit" disabled={savingSms}>
                        {savingSms && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t('messagechannelsettings.saqlash_va_ulanishni_tekshirish')}
                    </Button>
                </form>
            </Card>

            {/* ── Bron uchun oldindan to'lov ─────────────────────────── */}
            <Card className="p-6">
                <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 shrink-0">
                        <DollarSign className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-ink">{t('messagechannelsettings.bron_uchun_oldindan_tolov')}</h2>
                        <p className="text-sm text-muted">
                            {t('messagechannelsettings.bemor_bot_orqali_qabulga')}
                        </p>
                        {/* Ilgari tasdiq faqat qabul holatini o'zgartirardi va pul hech
                            qayerda qolmasdi. Endi u bemor hisobiga AVANS bo'lib tushadi —
                            buni aytib qo'yamiz, aks holda kassir ikkinchi marta undirardi. */}
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                            {t('messagechannelsettings.chek_tasdiqlanganda_summa_bemor')}
                        </p>
                    </div>
                </div>

                <form onSubmit={savePrepay} className="space-y-5">
                    <label className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-line cursor-pointer">
                        <span>
                            <span className="block text-sm font-semibold text-ink">{t('messagechannelsettings.oldindan_tolovni_yoqish')}</span>
                            <span className="block text-xs text-muted mt-0.5">
                                {t('messagechannelsettings.yoqilmasa_bot_bemordan_chek')}
                            </span>
                        </span>
                        <span className="relative w-12 h-6 shrink-0">
                            <input type="checkbox" className="sr-only" checked={prepayEnabled}
                                onChange={e => setPrepayEnabled(e.target.checked)} />
                            <span className={`block w-12 h-6 rounded-full transition-colors ${prepayEnabled ? 'bg-emerald-500' : 'bg-elevated'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-surface rounded-full shadow transition-transform ${prepayEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                            </span>
                        </span>
                    </label>

                    {prepayEnabled && (
                        <div className="space-y-4">
                            <Input label={t('ui.karta_raqami')} placeholder="8600 1234 5678 9012"
                                value={prepayCard} onChange={e => setPrepayCard(e.target.value)} />
                            <Input label={t('messagechannelsettings.bron_summasi_som')} type="number" placeholder="50000"
                                value={prepayAmount === 0 ? '' : String(prepayAmount)}
                                onChange={e => setPrepayAmount(Number(e.target.value))} />
                            <p className="text-xs text-muted">
                                {t('messagechannelsettings.bemor_chekni_bot_orqali')}
                            </p>
                        </div>
                    )}

                    <Button type="submit" disabled={savingPrepay}>
                        {savingPrepay && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t('ui.saqlash')}
                    </Button>
                </form>
            </Card>
        </div>
    );
};
