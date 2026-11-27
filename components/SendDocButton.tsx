import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Send, Check, Loader2 } from 'lucide-react';
import { api, SentDocsStatus } from '../services/api';
import { useLanguage, fill } from '../context/LanguageContext';
import { toast } from '../services/toast';

/* ─────────────────────────────────────────────────────────────────────────────
   «TELEGRAMGA YUBORISH» — printer tugmasi yonida (2026-11-26).

   Bir bosish: shu bitta hujjat (retsept yoki tahlil natijasi) PDF bo'lib
   bemorning Telegramiga ketadi. Oyna ham, tasdiq ham yo'q.

     · Yuborilgan bo'lsa — yashil belgi va vaqt; bosilsa qayta yuboradi.
     · Bemor botga ulanmagan — tugma xira, bosilsa nima qilish kerakligi
       yoziladi. Hech narsa to'smaydi, chop etish avvalgidek ishlaydi.
     · Klinikada bot yo'q — tugma umuman chiqmaydi (keraksiz eslatma yo'q).

   Holat bemor bo'yicha BIR marta so'raladi va shu bemorning hamma
   tugmalari bo'lishadi (ro'yxatda o'nta retsept — bitta so'rov).
   ───────────────────────────────────────────────────────────────────────────── */

type Entry = { data: SentDocsStatus | null; loading: boolean; at: number };
/* Natija o'zi yuborilgan bo'lishi mumkin — eski holat 20 soniyadan keyin qayta so'raladi */
const FRESH_MS = 20_000;
const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function load(patientId: string, force = false) {
    const cur = store.get(patientId);
    if (cur && !force && (cur.loading || (cur.data && Date.now() - cur.at < FRESH_MS))) return;
    store.set(patientId, { data: cur?.data || null, loading: true, at: cur?.at || 0 });
    emit();
    api.patientDocs.status(patientId)
        .then(data => store.set(patientId, { data, loading: false, at: Date.now() }))
        .catch(() => store.set(patientId, { data: cur?.data || null, loading: false, at: Date.now() }))
        .finally(emit);
}

function markSent(patientId: string, ref: string, sentAt: string) {
    const cur = store.get(patientId);
    if (!cur?.data) return;
    store.set(patientId, { ...cur, data: { ...cur.data, sent: { ...cur.data.sent, [ref]: sentAt } } });
    emit();
}

const hhmm = (iso: string) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    const t = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false });
    return today ? t : `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${t}`;
};

export const SendDocButton: React.FC<{
    kind: 'rx' | 'lab';
    id: string;
    patientId?: string | null;
    /** Natija yo'q va h.k. — tugma o'chiq */
    disabled?: boolean;
    disabledReason?: string;
    size?: 'sm' | 'md';
}> = ({ kind, id, patientId, disabled, disabledReason, size = 'sm' }) => {
    const { t } = useLanguage();
    const entry = useSyncExternalStore(subscribe, () => (patientId ? store.get(patientId) : undefined));
    const [busy, setBusy] = useState(false);

    useEffect(() => { if (patientId) load(patientId); }, [patientId]);

    const status = entry?.data;
    if (!patientId || !status || !status.bot) return null;

    const ref = `${kind}:${id}`;
    const sentAt = status.sent[ref];
    const linked = status.linked;

    const send = async () => {
        if (busy || disabled) return;
        if (!linked) { toast.info(t('doc.tg.notLinkedHint')); return; }
        setBusy(true);
        try {
            const r = await api.patientDocs.send(kind, id, patientId);
            markSent(patientId, ref, r.sentAt);
            toast.success(fill(t('doc.tg.sent'), hhmm(r.sentAt)));
        } catch (e: any) {
            const code = e?.data?.code;
            if (code === 'NO_TELEGRAM') {
                /* Bemor botdan chiqib ketgan bo'lishi mumkin — holatni yangilaymiz */
                load(patientId, true);
                toast.info(t('doc.tg.notLinkedHint'));
            } else {
                if (code === 'RECENT') toast.info(e.message); else toast.error(e?.message || t('ui.xatolik'));
            }
        } finally { setBusy(false); }
    };

    const title = disabled ? (disabledReason || t('doc.tg.send'))
        : !linked ? t('doc.tg.notLinked')
            : sentAt ? fill(t('doc.tg.sentTitle'), hhmm(sentAt))
                : t('doc.tg.send');
    const box = size === 'md' ? 'w-9 h-9' : 'w-7 h-7';
    const icon = size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';
    const tone = sentAt && linked ? 'text-success-600 dark:text-success-400' : 'text-faint hover:text-primary-600';

    return (
        <span className="inline-flex items-center shrink-0">
            <button type="button" onClick={send} disabled={busy || disabled} title={title} aria-label={title}
                className={`${box} grid place-items-center rounded-md hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed ${linked ? tone : 'text-faint opacity-50 hover:opacity-80'}`}>
                {busy ? <Loader2 className={`${icon} animate-spin`} aria-hidden="true" />
                    : sentAt && linked ? <Check className={icon} aria-hidden="true" />
                        : <Send className={icon} aria-hidden="true" />}
            </button>
        </span>
    );
};
