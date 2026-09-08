import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Select } from './Common';
import { api } from '../services/api';
import { toast } from '../services/toast';
import { Patient, Clinic, MessageTemplate } from '../types';
import { formatFullName, formatNumber } from '../utils/format';
import { Loader2, Send } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   XABAR YUBORISH — YAGONA OYNA.

   Ilgari ikkita nusxa bor edi: bemor kartasida va kalendarda. Ikkalasida
   ham matnlar KODGA YOZILGAN edi — «Qabul eslatmasi», «To'lov eslatmasi»,
   «Qoldirilgan qabul». Natijada:

     · klinika ularni o'zgartira olmasdi (Xabarlar bo'limidagi shablonlar
       bu yerga umuman tegishli emas edi);
     · ikki nusxa bir-biridan farq qilardi;
     · va eng yomoni — kartadagi «qarz» matni qarzni
       `Transaction.status === 'Pending'` dan sanardi. Bu qarzning ESKI,
       UCHINCHI ta'rifi: bunday chek endi umuman YARATILMAYDI (1-bosqich),
       ya'ni summa har doim nol chiqardi va haqiqiy qarzi bor bemor
       «Sizning qarzdorligingiz yo'q» degan SMS olardi.

   Endi: shablonlar BAZADAN (Sozlamalar → Integratsiyalar da tahrirlanadi),
   qarz esa SERVERDAN — kassadagi raqam bilan bitta manbadan.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    isOpen: boolean;
    onClose: () => void;
    patient: Patient | null;
    clinic?: Clinic | null;
    /** Yozuv konteksti — shablondagi {sana} va {vaqt} shundan */
    appointment?: { date?: string; time?: string; doctorName?: string } | null;
}

/* O'zgaruvchilar SERVERDAGI `processTemplate` bilan bir xil bo'lishi
   kerak: bu yerda faqat OLDINDAN KO'RSATISH uchun almashtiramiz, matn
   esa to'liq holda yuboriladi va server o'zi ham almashtiradi. */
function fillTokens(text: string, vars: Record<string, string>): string {
    let out = text;
    for (const [token, value] of Object.entries(vars)) {
        out = out.split(token).join(value);
    }
    return out;
}

export const SendMessageModal: React.FC<Props> = ({
    isOpen, onClose, patient, clinic, appointment,
}) => {
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [templateId, setTemplateId] = useState('');
    const [text, setText] = useState('');
    const [debt, setDebt] = useState<number | null>(null);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setTemplateId('');
        setText('');
        setDebt(null);

        if (clinic?.id) {
            api.messageTemplates.getAll(clinic.id).then(setTemplates).catch(() => setTemplates([]));
        }

        /* QARZ SERVERDAN — kassadagi raqam bilan bitta manbadan
           (`/api/reports/debtors`, to'lanmagan hisob qatorlaridan). */
        if (patient?.id) {
            api.reports.debtors()
                .then((d: any) => {
                    const row = (d?.patients || []).find((x: any) => x.patientId === patient.id);
                    setDebt(row ? Math.round(row.due || row.amount || 0) : 0);
                })
                .catch(() => setDebt(null));
        }
    }, [isOpen, clinic?.id, patient?.id]);

    const vars = useMemo(() => ({
        '{bemor_ismi}': patient?.firstName || '',
        '{bemor_familyasi}': patient?.lastName || '',
        '{sana}': appointment?.date || '',
        '{vaqt}': appointment?.time || '',
        '{klinika_nomi}': clinic?.name || '',
        '{shifokor_ismi}': appointment?.doctorName || '',
        '{qarz}': debt != null ? formatNumber(debt) : '',
    }), [patient, appointment, clinic, debt]);

    const preview = useMemo(() => fillTokens(text, vars), [text, vars]);

    const pickTemplate = (id: string) => {
        setTemplateId(id);
        const tpl = templates.find(t => t.id === id);
        if (tpl) setText(tpl.text);
    };

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!patient?.id || !preview.trim()) return;
        setSending(true);
        try {
            /* Yuboriladigan matn — ALMASHTIRILGANI: server ham o'zi
               almashtiradi, lekin bu yerda odam AYNAN nima ketishini
               ko'rgan bo'ladi. */
            await api.patients.sendMessage(patient.id, preview);
            toast.success('Xabar yuborildi');
            onClose();
        } catch (err: any) {
            const msg = err?.data?.error || err?.message || '';
            if (msg.includes('Bot not configured')) {
                toast.error('Bot sozlanmagan — Sozlamalar → Integratsiyalar');
            } else if (msg.includes('telegram not linked')) {
                toast.error('Bemor Telegram botga ulanmagan');
            } else {
                toast.error(msg || 'Xabar yuborilmadi');
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Xabar yuborish" className="max-w-lg">
            <form onSubmit={send} className="space-y-4">
                {patient && (
                    <p className="text-sm text-muted">
                        {formatFullName(patient)}
                        {debt != null && debt > 0 && (
                            <span className="ml-2 text-xs font-bold text-red-600 dark:text-red-400">
                                qarz: {formatNumber(debt)}
                            </span>
                        )}
                    </p>
                )}

                {/* Shablonlar BAZADAN. Ilgari matnlar kodga yozilgan edi va
                    klinika ularni o'zgartira olmasdi. */}
                <Select
                    label="Shablon"
                    value={templateId}
                    onChange={e => pickTemplate(e.target.value)}
                    options={[
                        { value: '', label: templates.length ? '— Erkin matn —' : 'Shablon yo\'q' },
                        ...templates.map(t => ({ value: t.id, label: t.name })),
                    ]}
                />

                <div>
                    <label className="block text-sm font-medium text-muted mb-1">
                        Matn
                    </label>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={4}
                        required
                        placeholder="Xabar matni. {bemor_ismi}, {sana}, {qarz} kabi o'zgaruvchilar ishlatiladi."
                        className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                </div>

                {/* Odam AYNAN nima ketishini ko'rsin: o'zgaruvchi
                    almashtirilmasa, bemor «Hurmatli {ism}» degan SMS oladi
                    va buni faqat u ketgandan keyin bilish mumkin edi. */}
                {text.trim() && (
                    <div className="rounded-lg bg-canvas/40 border border-line p-3">
                        <p className="text-[11px] font-bold text-faint uppercase tracking-wider mb-1">
                            Bemor shuni oladi
                        </p>
                        <p className="text-sm text-ink whitespace-pre-wrap">{preview}</p>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>Bekor</Button>
                    <Button type="submit" disabled={sending || !preview.trim()}>
                        {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                        Yuborish
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
