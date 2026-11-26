/* QO'LDA TABI — ommaviy xabar.

   IKKI USTUN. Ilgari hammasi bitta ustunda edi: kanal tugmalari, ikkita
   ogohlantirish, segment, to'rt qatorli hisob, matn, preview, test va
   yuborish tugmasi — 1280×800 ekranda tugmagacha ikki marta aylantirish
   kerak edi va «kimga» bilan «nima» bir vaqtda ko'rinmasdi.
   Endi: chapda «Kimga» (kanal, segment, ro'yxat), o'ngda «Xabar» (matn,
   bemor ko'radigan ko'rinish, xulosa va yuborish) — o'ng ustun yopishqoq.

   SEGMENTNI SAQLASH — sahifaning o'zida. Ilgari `window.prompt()` edi:
   Electron uni qo'llab-quvvatlamaydi, ya'ni dasturda tugma hech narsa
   qilmasdi. */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bookmark, Eye, Send, Users, X, Check } from 'lucide-react';
import type {
    AudiencePreview, AudienceSegment, Clinic, Doctor, MessageTemplate, SavedSegment, SegmentFieldDescriptor,
} from '../../types';
import { Button } from '../Common';
import { SegmentBuilder } from '../SegmentBuilder';
import { api } from '../../services/api';
import { confirmAction } from '../../services/confirm';
import { formatFullName, formatMoney, formatNumber } from '../../utils/format';
import { todayISO } from '../../utils/dateUtils';
import { analyzeSms, hasTypographicApostrophe, fixApostrophes } from '../../utils/sms';
import { processTemplate } from '../../utils/messageTemplate';
import { useLanguage, fill } from '../../context/LanguageContext';
import { ChannelIcon, IconButton, UnknownTokenWarning, VarButtons, inputCls, textareaCls } from './shared';

export type ManualChannel = 'sms' | 'telegram' | 'telegram_first';

interface Props {
    clinicId: string;
    active: boolean;
    currentClinic?: Clinic;
    doctors: Doctor[];
    templates: MessageTemplate[];
    segmentFields: SegmentFieldDescriptor[];
    smsConnected: boolean;
    telegramConnected: boolean;
    smsBalance: number | null;
    bulkRunning: boolean;
    /** Yuborish boshlandi — ota sahifa jarayonni kuzatadi va Tarixga o'tadi */
    onBulkStarted: (total: number) => void;
    onOpenSettings: () => void;
    addToast: (type: 'success' | 'error' | 'info', message: string) => void;
    /** Havoladan kelgan tayyor auditoriya (Hisobot → Bemorlar → «Eslatma yuborish») */
    initialSegment?: AudienceSegment | null;
}

const DEFAULT_SEGMENT: AudienceSegment = { match: 'all', conditions: [{ field: 'status', op: 'eq', value: 'Active' }] };

export const ManualTab: React.FC<Props> = ({
    clinicId, active, currentClinic, doctors, templates, segmentFields, smsConnected, telegramConnected,
    smsBalance, bulkRunning, onBulkStarted, onOpenSettings, addToast, initialSegment,
}) => {
    const { t } = useLanguage();
    const [channel, setChannel] = useState<ManualChannel>('telegram_first');
    // Auditoriyani SERVER hisoblaydi (backend/segments.ts) — «qarzdor» ta'rifi va
    // {qarz} summasi qo'lda ham, avtomatikada ham bir xil bo'lsin.
    const [segment, setSegment] = useState<AudienceSegment>(initialSegment || DEFAULT_SEGMENT);
    const [savedSegments, setSavedSegments] = useState<SavedSegment[]>([]);
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
    const [showRecipients, setShowRecipients] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState('');
    const [audience, setAudience] = useState<AudiencePreview | null>(null);
    const [audienceLoading, setAudienceLoading] = useState(false);
    const [showUnreachable, setShowUnreachable] = useState(false);
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [segmentName, setSegmentName] = useState<string | null>(null);

    useEffect(() => {
        if (!clinicId) return;
        api.messages.savedSegments(clinicId).then(setSavedSegments).catch(() => { });
    }, [clinicId]);

    // Filtr yoki kanal o'zgarganda qayta hisoblanadi (har bosishda so'rov ketmasin)
    useEffect(() => {
        if (!clinicId || !active) return;
        setAudienceLoading(true);
        const timer = setTimeout(() => {
            api.messages.audience(clinicId, segment, channel)
                .then(setAudience)
                .catch(() => setAudience(null))
                .finally(() => setAudienceLoading(false));
        }, 350);
        return () => clearTimeout(timer);
    }, [clinicId, active, segment, channel]);

    // Segment o'zgarsa qo'lda chiqarilganlar ro'yxati ham eskiradi
    useEffect(() => { setExcludedIds(new Set()); }, [segment, channel]);

    const allRecipients = audience?.recipients ?? [];
    const recipientIds = (audience?.patientIds ?? []).filter(id => !excludedIds.has(id));
    const recipientCount = recipientIds.length;
    const recipientSample = audience?.sample ?? [];
    const unreachableCount = audience?.unreachable ?? 0;

    const { viaTelegram, viaSms } = useMemo(() => {
        if (allRecipients.length === 0) {
            return { viaTelegram: audience?.viaTelegram ?? 0, viaSms: audience?.viaSms ?? 0 };
        }
        const kept = allRecipients.filter(r => !excludedIds.has(r.id));
        const tg = kept.filter(r => r.channel === 'telegram').length;
        return { viaTelegram: tg, viaSms: kept.length - tg };
    }, [allRecipients, excludedIds, audience]);

    const visibleRecipients = useMemo(() => {
        const q = recipientSearch.trim().toLowerCase();
        if (!q) return allRecipients;
        return allRecipients.filter(r => formatFullName(r).toLowerCase().includes(q) || r.phone.toLowerCase().includes(q));
    }, [allRecipients, recipientSearch]);

    const toggleExcluded = (id: string) => setExcludedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // ── Segmentni saqlash ──
    const handleSaveSegment = async () => {
        const name = (segmentName || '').trim();
        if (!name) return;
        try {
            const saved = await api.messages.saveSegment(clinicId, name, segment);
            setSavedSegments(prev => [saved, ...prev.filter(s => s.id !== saved.id)]);
            addToast('success', fill(t('messagesmanagement.x_saqlandi'), saved.name));
            setSegmentName(null);
        } catch (e: any) {
            addToast('error', e.message || t('ui.saqlashda_xatolik'));
        }
    };

    const handleDeleteSegment = async (s: SavedSegment) => {
        if (!await confirmAction({ title: fill(t('messagesmanagement.x_segmentini_ochirishni_tasdiqlaysizmi'), s.name), danger: true, confirmLabel: t('ui.ochirish_2') })) return;
        try {
            await api.messages.deleteSegment(clinicId, s.id);
            setSavedSegments(prev => prev.filter(x => x.id !== s.id));
        } catch (e: any) {
            addToast('error', e.message || t('ui.xatolik'));
        }
    };

    // SMS qismlari — shaxsiylashtirilgandan keyingi ENG YOMON holat bo'yicha:
    // {bemor_ismi} o'rniga eng uzun ism qo'yilsa qismlar soni oshishi mumkin.
    const smsInfo = useMemo(() => {
        const longest = (vals: (string | undefined)[]) =>
            vals.reduce<string>((a, b) => ((b || '').length > a.length ? (b || '') : a), '');
        const sample = message
            .split('{bemor_ismi}').join(longest(recipientSample.map(r => r.firstName)))
            .split('{bemor_familyasi}').join(longest(recipientSample.map(r => r.lastName)))
            .split('{klinika_nomi}').join(currentClinic?.name || '')
            .split('{sana}').join('2026-08-20')
            .split('{vaqt}').join('14:30')
            .split('{shifokor_ismi}').join(longest(doctors.map(d => formatFullName(d))))
            .split('{qarz}').join('1 500 000');
        return analyzeSms(sample);
    }, [message, recipientSample, doctors, currentClinic]);

    const totalSmsParts = smsInfo.parts * viaSms;
    const hasBadApostrophe = hasTypographicApostrophe(message);

    // ── Bemor aynan nimani ko'radi ──
    const [previewIndex, setPreviewIndex] = useState(0);
    const previewPatient = recipientSample.length > 0 ? recipientSample[previewIndex % recipientSample.length] : null;
    const previewText = useMemo(() => {
        if (!previewPatient) return '';
        return processTemplate(message, {
            patientName: formatFullName(previewPatient),
            firstName: previewPatient.firstName,
            lastName: previewPatient.lastName,
            date: todayISO(),
            time: '',
            clinicName: currentClinic?.name || '',
            doctorName: '',
            amount: 0,
        });
    }, [message, previewPatient, currentClinic]);

    // ── Test yuborish ──
    const [testOpen, setTestOpen] = useState(false);
    const [testPhone, setTestPhone] = useState('');
    const [testSending, setTestSending] = useState(false);

    const handleTestSend = async () => {
        if (!message.trim()) return;
        const testChannel: 'sms' | 'telegram' = channel === 'telegram' ? 'telegram' : 'sms';
        if (testChannel === 'sms' && !testPhone.trim()) {
            addToast('error', t('messagesmanagement.test_uchun_telefon_raqamini'));
            return;
        }
        setTestSending(true);
        try {
            await api.messages.testSend(clinicId, message, testChannel, testPhone.trim(), previewPatient?.id);
            addToast('success', testChannel === 'telegram'
                ? t('messagesmanagement.test_xabar_klinika_telegramiga')
                : fill(t('messagesmanagement.test_sms_x_raqamiga'), testPhone));
        } catch (e: any) {
            addToast('error', e.message || t('messagesmanagement.test_yuborishda_xatolik'));
        } finally {
            setTestSending(false);
        }
    };

    const handleSend = async () => {
        if (!message.trim() || recipientCount === 0) return;
        const costNote = viaSms > 0
            ? fill(t('messagesmanagement.telegram_x_ta_bepul'), viaTelegram, viaSms, smsInfo.parts, totalSmsParts)
            : t('messagesmanagement.hammasi_telegram_orqali_bepul');
        if (!await confirmAction({ title: fill(t('messagesmanagement.x_ta_bemorga_xabar'), recipientCount, costNote) })) return;
        setSending(true);
        try {
            const result = await api.messages.sendBulk(clinicId, recipientIds, message, channel);
            addToast('info', fill(t('messagesmanagement.x_ta_bemorga_yuborish'), result.total));
            setMessage('');
            onBulkStarted(result.total);
        } catch (e: any) {
            addToast('error', e.message || t('messagesmanagement.yuborishda_xatolik_yuz_berdi'));
        } finally {
            setSending(false);
        }
    };

    // Tanlangan kanal ulanganmi — bitta qator, sababi va qayerda tuzatiladi
    const channelProblem =
        channel === 'telegram' && !telegramConnected ? t('messagesmanagement.telegram_bot_ulanmagan')
            : (channel === 'sms' || channel === 'telegram_first') && !smsConnected ? t('messagesmanagement.eskiz_sms_ulanmagan')
                : null;

    const CHANNELS: { value: ManualChannel; label: string; warn: boolean }[] = [
        { value: 'telegram_first', label: t('messagesmanagement.avval_telegram'), warn: false },
        { value: 'telegram', label: 'Telegram', warn: !telegramConnected },
        { value: 'sms', label: t('messagesmanagement.faqat_sms'), warn: !smsConnected },
    ];

    // Matn yozilmaguncha qismlar soni 0 — «= 0 SMS» deb aldamaymiz
    const hasText = message.trim().length > 0;
    const costSuffix = viaSms === 0 ? ` · ${t('msg.free')}`
        : hasText ? ` · ${fill(t('msg.manual.smsCount'), totalSmsParts)}` : '';
    const sendLabel = bulkRunning
        ? t('messagesmanagement.oldingi_yuborish_davom_etmoqda')
        : fill(t('messagesmanagement.x_ta_bemorga_yuborishx'), recipientCount, costSuffix);

    const funnel = audience ? [
        audience.matched !== audience.clinicTotal
            ? fill(t('msg.manual.matched'), audience.matched, audience.clinicTotal) : null,
        unreachableCount > 0 ? fill(t('msg.manual.unreachableN'), unreachableCount) : null,
        excludedIds.size > 0 ? fill(t('msg.manual.excludedN'), excludedIds.size) : null,
    ].filter(Boolean) as string[] : [];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 items-start">
            {/* ═══ KIMGA ═══ */}
            <section className="card p-5 space-y-4 min-w-0" aria-labelledby="manual-who">
                <h2 id="manual-who" className="font-semibold text-ink flex items-center gap-2">
                    <Users className="w-[18px] h-[18px] text-faint" aria-hidden="true" /> {t('messagesmanagement.kimga_yuborish')}
                </h2>

                {/* Kanal */}
                <div>
                    <div role="group" aria-label={t('messagesmanagement.yuborish_kanali')} className="inline-flex flex-wrap items-center bg-elevated/70 rounded-xl p-1 gap-0.5">
                        {CHANNELS.map(c => (
                            <button key={c.value} type="button" aria-pressed={channel === c.value} onClick={() => setChannel(c.value)}
                                className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] transition-colors ${channel === c.value
                                    ? 'bg-surface shadow-sm text-ink font-semibold'
                                    : 'text-muted hover:text-ink font-medium'}`}>
                                <ChannelIcon channel={c.value === 'sms' ? 'sms' : 'telegram'} className="w-3.5 h-3.5" />
                                {c.label}
                                {c.warn && <AlertTriangle className="w-3.5 h-3.5 text-warning-500" aria-label={t('msg.notConnected')} />}
                            </button>
                        ))}
                    </div>
                    {channelProblem ? (
                        <p className="mt-2 text-xs text-warning-700 dark:text-warning-300 flex flex-wrap items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            {channelProblem}
                            <button type="button" onClick={onOpenSettings} className="font-semibold underline underline-offset-2 hover:text-ink">
                                {t('msg.manual.connect')}
                            </button>
                        </p>
                    ) : channel === 'telegram_first' ? (
                        <p className="mt-2 text-xs text-muted">{t('messagesmanagement.botga_ulangan_bemorga_bepul')}</p>
                    ) : null}
                </div>

                {/* Saqlangan segmentlar */}
                {savedSegments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted mr-0.5">{t('msg.manual.saved')}</span>
                        {savedSegments.map(s => (
                            <span key={s.id} className="inline-flex items-center h-7 rounded-lg bg-primary-500/10 overflow-hidden">
                                <button type="button" onClick={() => setSegment(s.segment)}
                                    className="h-full px-2.5 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/10">
                                    {s.name}
                                </button>
                                <button type="button" onClick={() => handleDeleteSegment(s)} aria-label={`${t('ui.ochirish')}: ${s.name}`}
                                    className="h-full px-1.5 text-faint hover:text-danger hover:bg-danger-500/10">
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                <SegmentBuilder value={segment} onChange={setSegment} fields={segmentFields}
                    conditionCounts={audience?.conditionCounts} />

                {(segment.conditions?.length || 0) > 0 && (
                    segmentName === null ? (
                        <button type="button" onClick={() => setSegmentName('')}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-primary-600">
                            <Bookmark className="w-3.5 h-3.5" aria-hidden="true" /> {t('messagesmanagement.shu_segmentni_saqlab_qoyish')}
                        </button>
                    ) : (
                        <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); handleSaveSegment(); }}>
                            <input autoFocus type="text" value={segmentName} onChange={e => setSegmentName(e.target.value)}
                                aria-label={t('msg.manual.segmentName')} placeholder={t('messagesmanagement.segment_nomi_masalan_8')}
                                className={`${inputCls} !h-9 flex-1 min-w-[200px]`}
                                onKeyDown={e => { if (e.key === 'Escape') setSegmentName(null); }} />
                            <Button size="sm" type="submit" disabled={!segmentName.trim()}><Check className="w-3.5 h-3.5" /> {t('ui.saqlash')}</Button>
                            <Button size="sm" variant="ghost" type="button" onClick={() => setSegmentName(null)}>{t('ui.bekor')}</Button>
                        </form>
                    )
                )}

                {/* Ro'yxat — kimga ketishini ko'rib, keraksizini olib tashlash */}
                {allRecipients.length > 0 && (
                    <div className="border border-line rounded-xl overflow-hidden">
                        <button type="button" onClick={() => setShowRecipients(v => !v)} aria-expanded={showRecipients}
                            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-elevated/60">
                            <span className="text-xs text-muted truncate">
                                {recipientSample.map(r => formatFullName(r)).join(', ')}
                                {recipientCount > recipientSample.length ? ` ${fill(t('messagesmanagement.va_yana_x_ta'), recipientCount - recipientSample.length)}` : ''}
                            </span>
                            <span className="text-xs font-semibold text-primary-600 shrink-0">
                                {showRecipients ? t('ui.yashirish') : t('messagesmanagement.toliq_royxat')}
                            </span>
                        </button>
                        {showRecipients && (
                            <div className="border-t border-line">
                                <div className="px-3.5 py-2 flex flex-wrap items-center gap-2">
                                    <input type="text" value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)}
                                        aria-label={t('messagesmanagement.ism_yoki_raqam_boyicha')}
                                        placeholder={t('messagesmanagement.ism_yoki_raqam_boyicha')}
                                        className={`${inputCls} !h-8 !text-xs flex-1 min-w-[180px]`} />
                                    {excludedIds.size > 0 && (
                                        <button type="button" onClick={() => setExcludedIds(new Set())}
                                            className="text-xs font-semibold text-primary-600 hover:text-primary-700">
                                            {excludedIds.size} {t('messagesmanagement.tasini_qaytarish')}
                                        </button>
                                    )}
                                </div>
                                <ul className="divide-y divide-line-soft max-h-72 overflow-y-auto">
                                    {visibleRecipients.map(r => {
                                        const off = excludedIds.has(r.id);
                                        return (
                                            <li key={r.id}>
                                                <label className={`flex items-center gap-3 px-3.5 py-2 text-xs cursor-pointer hover:bg-elevated/60 ${off ? 'opacity-45' : ''}`}>
                                                    <input type="checkbox" checked={!off} onChange={() => toggleExcluded(r.id)}
                                                        className="w-3.5 h-3.5 rounded border-line accent-primary-600" />
                                                    <span className="font-medium text-ink flex-1 min-w-0 truncate">{formatFullName(r)}</span>
                                                    <span className={`inline-flex items-center gap-1 ${r.channel === 'telegram' ? 'text-success' : 'text-warning-700 dark:text-warning-300'}`}>
                                                        <ChannelIcon channel={r.channel} className="w-3 h-3" />
                                                        {r.channel === 'telegram' ? t('msg.free') : 'SMS'}
                                                    </span>
                                                    {r.debt > 0 && <span className="text-faint tabular-nums">{formatNumber(r.debt)} {t('ui.som')}</span>}
                                                </label>
                                            </li>
                                        );
                                    })}
                                    {visibleRecipients.length === 0 && (
                                        <li className="px-4 py-6 text-center text-xs text-faint">{t('ui.topilmadi')}</li>
                                    )}
                                </ul>
                                {audience?.recipientsTruncated && (
                                    <p className="px-3.5 py-2 text-xs text-faint border-t border-line-soft">{t('messagesmanagement.birinchi_500_tasi_korsatilgan')}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Kimga yetib bormaydi va NIMA UCHUN — klinika tuzata olishi uchun */}
                {unreachableCount > 0 && (
                    <div className="rounded-xl bg-warning-500/10 overflow-hidden">
                        <button type="button" onClick={() => setShowUnreachable(v => !v)} aria-expanded={showUnreachable}
                            className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs text-warning-700 dark:text-warning-300">
                            <span className="flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <strong>{unreachableCount} {t('messagesmanagement.ta_bemorga')}</strong> {t('messagesmanagement.yetib_bolmaydi')}
                            </span>
                            <span className="font-semibold">{showUnreachable ? t('ui.yashirish') : t('messagesmanagement.kimlar_korsatish')}</span>
                        </button>
                        {showUnreachable && (
                            <ul className="divide-y divide-warning-500/15 max-h-56 overflow-y-auto">
                                {(audience?.unreachableList || []).map(u => (
                                    <li key={u.id} className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs">
                                        <span className="font-medium text-ink">{u.name}</span>
                                        <span className="text-warning-700 dark:text-warning-300 text-right">{u.reason}</span>
                                    </li>
                                ))}
                                {unreachableCount > (audience?.unreachableList?.length || 0) && (
                                    <li className="px-3.5 py-2 text-xs text-faint">
                                        {fill(t('messagesmanagement.va_yana_x_ta'), unreachableCount - (audience?.unreachableList?.length || 0))}
                                    </li>
                                )}
                            </ul>
                        )}
                    </div>
                )}
            </section>

            {/* ═══ XABAR ═══ */}
            <section className="card p-5 space-y-4 min-w-0 lg:sticky lg:top-4" aria-labelledby="manual-what">
                <h2 id="manual-what" className="font-semibold text-ink flex items-center gap-2">
                    <Send className="w-[18px] h-[18px] text-faint" aria-hidden="true" /> {t('messagesmanagement.xabar_matni')}
                </h2>

                {templates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-muted mr-0.5">{t('msg.manual.fromTemplate')}</span>
                        {templates.map(tpl => (
                            <button key={tpl.id} type="button" onClick={() => setMessage(tpl.text)}
                                className="h-7 px-2.5 text-xs font-medium border border-line rounded-lg text-muted hover:text-ink hover:border-faint transition-colors">
                                {tpl.name}
                            </button>
                        ))}
                    </div>
                )}

                <div className="space-y-2">
                    <textarea aria-label={t('messagesmanagement.xabar_matni')} placeholder={t('messagesmanagement.xabar_matni_2')}
                        value={message} onChange={e => setMessage(e.target.value)} rows={5} className={textareaCls} />
                    <VarButtons onInsert={token => setMessage(m => m + token)} />
                    <UnknownTokenWarning text={message} />
                    <p className="text-xs text-faint">
                        {'{sana}'}, {'{vaqt}'} {t('ui.va')} {'{shifokor_ismi}'} {t('messagesmanagement.bemorning_eng_yaqin_kelgusi')} {'{sana}'} {t('messagesmanagement.bugungi_sana_boladi_qolganlari')}
                    </p>
                </div>

                {/* SMS hisoblagichi — operator har QISM uchun alohida pul oladi */}
                {message.trim() && viaSms > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs text-muted">
                            {fill(t('msg.manual.smsMeter'), smsInfo.length, smsInfo.parts, smsInfo.encoding, smsInfo.perPart)}
                            <span className="text-faint"> · {t('messagesmanagement.keyingi_qismgacha')}: {smsInfo.remaining}</span>
                        </p>
                        {smsInfo.encoding === 'UCS-2' && (
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-warning-500/10 text-xs text-warning-700 dark:text-warning-300">
                                <span className="flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                    {hasBadApostrophe
                                        ? t('msg.manual.badApostrophe')
                                        : fill(t('msg.manual.nonGsm'), smsInfo.nonGsmChars.slice(0, 6).join(' '))}
                                </span>
                                {hasBadApostrophe && (
                                    <Button size="sm" variant="secondary" onClick={() => setMessage(m => fixApostrophes(m))}>
                                        {t('messagesmanagement.apostrofni_togrilash')}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Bemor aynan nimani ko'radi */}
                {message.trim() && previewPatient && (
                    <div className="rounded-xl bg-elevated/60 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                            <span className="flex items-center gap-1.5 font-semibold text-muted">
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" /> {t('messagesmanagement.bemor_koradigan_matn')}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="text-faint truncate">{formatFullName(previewPatient)}</span>
                                {recipientSample.length > 1 && (
                                    <button type="button" onClick={() => setPreviewIndex(i => i + 1)}
                                        className="font-semibold text-primary-600 hover:text-primary-700">
                                        {t('messagesmanagement.boshqasi')}
                                    </button>
                                )}
                            </span>
                        </div>
                        <p className="max-w-[92%] px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-surface border border-line-soft text-sm text-ink leading-relaxed whitespace-pre-wrap break-words shadow-sm">
                            {previewText}
                        </p>
                    </div>
                )}

                {/* Xulosa: nechta, qaysi kanal, qancha turadi */}
                <div className="rounded-xl border border-line p-3.5 space-y-1.5" aria-live="polite">
                    {audienceLoading && !audience ? (
                        <p className="text-sm text-muted">{t('ui.hisoblanmoqda')}</p>
                    ) : (
                        <>
                            <p className="flex items-baseline justify-between gap-3">
                                <span className="text-sm text-muted">{t('messagesmanagement.xabar_yetib_boradi')}</span>
                                <span className={`text-xl font-semibold tabular-nums text-ink ${audienceLoading ? 'opacity-50' : ''}`}>
                                    {fill(t('msg.manual.patientsN'), recipientCount)}
                                </span>
                            </p>
                            {recipientCount > 0 && (
                                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                    {viaTelegram > 0 && (
                                        <span className="inline-flex items-center gap-1 font-semibold text-success">
                                            <ChannelIcon channel="telegram" className="w-3 h-3" /> {fill(t('msg.manual.tgFree'), viaTelegram)}
                                        </span>
                                    )}
                                    {viaSms > 0 && (
                                        <span className="inline-flex items-center gap-1 font-semibold text-warning-700 dark:text-warning-300">
                                            <ChannelIcon channel="sms" className="w-3 h-3" />
                                            {fill(t('msg.manual.smsPaid'), viaSms)}
                                            {hasText && <>{smsInfo.parts > 1 ? ` × ${smsInfo.parts}` : ''} = {fill(t('msg.manual.smsCount'), totalSmsParts)}</>}
                                        </span>
                                    )}
                                    {smsBalance !== null && (
                                        <span className={totalSmsParts > smsBalance ? 'text-danger font-semibold' : 'text-faint'}>
                                            {t('messagesmanagement.eskiz_balansi')}: {formatMoney(smsBalance)}
                                            {totalSmsParts > smsBalance && ` — ${t('msg.manual.notEnough')}`}
                                        </span>
                                    )}
                                </p>
                            )}
                            {funnel.length > 0 && <p className="text-xs text-faint">{funnel.join(' · ')}</p>}
                        </>
                    )}
                </div>

                {/* Test — ko'pchilikka tarqatishdan oldin o'zingizga */}
                {message.trim() && (
                    testOpen ? (
                        <div className="rounded-xl border border-dashed border-line p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted">
                                    {channel === 'telegram' ? t('messagesmanagement.test_xabar_klinikaning_telegram') : t('messagesmanagement.test_sms_shu_raqamga')}
                                </p>
                                <IconButton label={t('common.close')} onClick={() => setTestOpen(false)}><X className="w-4 h-4" /></IconButton>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {channel !== 'telegram' && (
                                    <input type="tel" placeholder="+998 90 123 45 67" value={testPhone} aria-label={t('msg.manual.testPhone')}
                                        onChange={e => setTestPhone(e.target.value)} className={`${inputCls} flex-1 min-w-[180px]`} />
                                )}
                                <Button variant="secondary" onClick={handleTestSend} disabled={testSending}>
                                    {testSending ? t('messagesmanagement.yuborilmoqda') : t('messagesmanagement.test_yuborish')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <button type="button" onClick={() => setTestOpen(true)}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">
                            <Send className="w-3.5 h-3.5" aria-hidden="true" /> {t('messagesmanagement.avval_ozimga_test_yuborish')}
                        </button>
                    )
                )}

                <Button size="lg" className="w-full" onClick={handleSend}
                    disabled={sending || bulkRunning || !message.trim() || recipientCount === 0}>
                    {sending || bulkRunning
                        ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Send className="w-4 h-4" />}
                    {sendLabel}
                </Button>
            </section>
        </div>
    );
};
