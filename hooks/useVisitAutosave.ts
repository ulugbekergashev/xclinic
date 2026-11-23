import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Visit } from '../types';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   QABUL VARAG'IDAGI MATN O'ZI SAQLANADI.

   Shikoyat va ko'rik «Saqlash» tugmasisiz yoziladi: oxirgi harfdan bir oz
   keyin, maydondan chiqilganda, «Yakunlash» oldidan, boshqa qabulga
   o'tilganda va oyna yopilayotganda. Ilgari ko'rikning alohida «Saqlash»
   tugmasi bor edi va shifokor uni bosmay qabulni yopsa, yozilgani yo'qolardi.

   Uch qoida — har biri bitta aniq xatoning oldini oladi:

   1. QORALAMA O'Z QABULI BILAN. Yozilgan, lekin hali ketmagan qiymat qaysi
      qabulniki ekani bilan birga turadi. Usiz bir qabulning ketmay qolgan
      matni varaq boshqa qabulga o'tgach o'shanisiga yozilib ketardi.

   2. YOZUVLAR NAVBAT BILAN. Ikki yozuv bir vaqtda ketsa, serverga qaysi biri
      oxirgi yetib borishi noma'lum — eski matn yangisining ustiga tushishi
      mumkin. «Yakunlash» ham shu navbatni kutadi.

   3. HOLAT — FAQAT «Kutmoqda → Qabulda», BIR MARTA. Har saqlashda joriy
      holatni qayta yuborsak, server uni yangi o'tish deb qabul qilardi:
      «Chaqirilgan» bemor tabloda har ikki soniyada qayta e'lon qilinar,
      «Natija kutilmoqda» taymeri nolga tushar, eskirgan holat esa boshqa
      kompyuterda yopilgan qabulni qayta ochib qo'yardi.
   ───────────────────────────────────────────────────────────────────────────── */

export type SaveState = { state: 'idle' | 'typing' | 'saving' | 'error' } | { state: 'saved'; at: Date };

/** Oxirgi harfdan keyin shuncha kutib saqlaymiz — har harfda so'rov ketmasin */
const AUTOSAVE_MS = 2000;

interface Options {
    visit: Visit | null;
    /** Varaqda turishi kerak bo'lgan qabul (yuklanib ulgurmagan bo'lishi mumkin) */
    visitId: string | null;
    onError: (message?: string) => void;
}

export interface VisitAutosave {
    complaint: string;
    onComplaintChange: (text: string) => void;
    onComplaintBlur: () => void;
    /** Shifokor xulosasi va tavsiyalari (`Visit.treatmentPlan`) — shikoyat qoidalari bilan */
    conclusion: string;
    onConclusionChange: (text: string) => void;
    onConclusionBlur: () => void;
    onExamChange: (data: Record<string, any>, templateId: string | undefined, invalidKeys: string[]) => void;
    /** Taymerdagi va yo'ldagi hamma yozuvni yuboradi. `false` — nimadir saqlanmadi. */
    flush: () => Promise<boolean>;
    save: SaveState;
    /** Ko'rikda chegaradan tashqari qiymat bor (yorliq uchun) */
    examInvalid: boolean;
    /** Xuddi shu — tugma bosilgan PAYTDAGI qiymat (holat emas, `ref`) */
    isExamInvalid: () => boolean;
    /** O'zimiz serverga yozgan sari oshadi — varaq eskirgan javobni shundan taniydi */
    writeEpoch: MutableRefObject<number>;
}

export function useVisitAutosave({ visit, visitId, onError }: Options): VisitAutosave {
    const [complaint, setComplaint] = useState('');
    const [conclusion, setConclusion] = useState('');
    const [save, setSave] = useState<SaveState>({ state: 'idle' });
    /* `save` dan ALOHIDA: u yorliq holati va keyingi har qanday saqlash uni
       o'zgartiradi — to'siq esa qiymat tuzatilmaguncha turishi shart. */
    const [examInvalid, setExamInvalid] = useState(false);
    const examInvalidRef = useRef(false);

    /* `null` — ketadigan narsa yo'q */
    const complaintDraft = useRef<{ visitId: string; text: string } | null>(null);
    const examDraft = useRef<{ visitId: string; data: Record<string, any>; templateId?: string } | null>(null);
    const examTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const complaintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const conclusionDraft = useRef<{ visitId: string; text: string } | null>(null);
    const conclusionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const writeEpoch = useRef(0);
    const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
    /** «Kutmoqda → Qabulda» o'tishi yuborilgan qabullar */
    const promoted = useRef(new Set<string>());

    const visitRef = useRef(visit);
    visitRef.current = visit;
    const visitIdRef = useRef(visitId);
    visitIdRef.current = visitId;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    /** `keepalive` — sahifa yopilayotganda: brauzer so'rovni oxiriga yetkazadi */
    const quietSave = useCallback((targetId: string, patch: Record<string, unknown>, keepalive = false): Promise<boolean> => {
        const run = async (): Promise<boolean> => {
            // Yorliq faqat shu qabul hali varaqda bo'lsa o'zgaradi
            const onScreen = () => visitIdRef.current === targetId;
            if (onScreen()) setSave({ state: 'saving' });
            try {
                await api.visits.update(targetId, patch as Partial<Visit>, keepalive ? { keepalive: true } : undefined);
                writeEpoch.current += 1;
                if (onScreen()) setSave({ state: 'saved', at: new Date() });
                return true;
            } catch (e: any) {
                if (onScreen()) setSave({ state: 'error' });
                onErrorRef.current(e?.message);
                return false;
            }
        };
        const next = saveQueue.current.then(run, run);
        saveQueue.current = next;
        return next;
    }, []);

    const saveExam = useCallback(async (keepalive = false): Promise<boolean> => {
        clearTimeout(examTimer.current);
        const draft = examDraft.current;
        if (!draft) return true;
        examDraft.current = null;
        const current = visitRef.current;
        const promote = current?.id === draft.visitId && current.status === 'Waiting' && !promoted.current.has(draft.visitId);
        const ok = await quietSave(draft.visitId, {
            examData: JSON.stringify(draft.data), templateId: draft.templateId,
            // Ko'rik yozila boshladi — bemor kabinetda
            ...(promote ? { status: 'In Progress' } : {}),
        }, keepalive);
        if (ok && promote) promoted.current.add(draft.visitId);
        /* Ketmadi — qiymat yo'qolmasin: keyingi urinish yana shuni yuboradi.
           Faqat o'sha qabul hali varaqda bo'lsa va yangiroq qoralama yo'q bo'lsa. */
        if (!ok && !examDraft.current && visitIdRef.current === draft.visitId) examDraft.current = draft;
        return ok;
    }, [quietSave]);

    const saveComplaint = useCallback(async (keepalive = false): Promise<boolean> => {
        clearTimeout(complaintTimer.current);
        const draft = complaintDraft.current;
        if (!draft) return true;
        const ok = await quietSave(draft.visitId, { complaints: draft.text.trim() }, keepalive);
        // Saqlash davomida yana yozilgan bo'lsa — u keyingi safar ketadi
        if (ok && complaintDraft.current === draft) complaintDraft.current = null;
        return ok;
    }, [quietSave]);

    const saveConclusion = useCallback(async (keepalive = false): Promise<boolean> => {
        clearTimeout(conclusionTimer.current);
        const draft = conclusionDraft.current;
        if (!draft) return true;
        const ok = await quietSave(draft.visitId, { treatmentPlan: draft.text.trim() }, keepalive);
        if (ok && conclusionDraft.current === draft) conclusionDraft.current = null;
        return ok;
    }, [quietSave]);

    const markTyping = () => setSave(s => (s.state === 'typing' ? s : { state: 'typing' }));

    const onExamChange = (data: Record<string, any>, templateId: string | undefined, invalidKeys: string[]) => {
        clearTimeout(examTimer.current);
        const invalid = invalidKeys.length > 0;
        examInvalidRef.current = invalid;
        setExamInvalid(invalid);
        const current = visitRef.current;
        if (!current) return;
        /* Chegaradan tashqari qiymat YUBORILMAYDI (server ham rad etadi), lekin
           qolgan maydonlar saqlanadi: bitta xato raqam tufayli undan keyin
           yozilgan butun ko'rik yo'qolmasin. Qabulni yopish esa qiymat
           tuzatilmaguncha to'siladi (`isExamInvalid`). */
        const clean = invalid
            ? Object.fromEntries(Object.entries(data).filter(([key]) => !invalidKeys.includes(key)))
            : data;
        examDraft.current = { visitId: current.id, data: clean, templateId };
        markTyping();
        examTimer.current = setTimeout(() => { void saveExam(); }, AUTOSAVE_MS);
    };

    const onComplaintChange = (text: string) => {
        setComplaint(text);
        clearTimeout(complaintTimer.current);
        const current = visitRef.current;
        if (!current) return;
        complaintDraft.current = { visitId: current.id, text };
        markTyping();
        complaintTimer.current = setTimeout(() => { void saveComplaint(); }, AUTOSAVE_MS);
    };

    const onConclusionChange = (text: string) => {
        setConclusion(text);
        clearTimeout(conclusionTimer.current);
        const current = visitRef.current;
        if (!current) return;
        conclusionDraft.current = { visitId: current.id, text };
        markTyping();
        conclusionTimer.current = setTimeout(() => { void saveConclusion(); }, AUTOSAVE_MS);
    };

    const flush = useCallback(async (): Promise<boolean> => {
        const examSaved = await saveExam();
        const complaintSaved = await saveComplaint();
        const conclusionSaved = await saveConclusion();
        // Taymer oldinroq yuborgan yozuv hali yo'lda bo'lishi mumkin — u ham kutiladi
        return examSaved && complaintSaved && conclusionSaved && await saveQueue.current;
    }, [saveExam, saveComplaint, saveConclusion]);

    /* Serverdagi shikoyat — faqat bu yerda saqlanmagan qiymat bo'lmasa olinadi:
       aks holda kechikkan javob yozilayotgan matnning o'rniga tushardi. */
    useEffect(() => {
        if (complaintDraft.current === null) setComplaint(visit?.complaints || '');
    }, [visit?.id, visit?.complaints]);
    useEffect(() => {
        if (conclusionDraft.current === null) setConclusion(visit?.treatmentPlan || '');
    }, [visit?.id, visit?.treatmentPlan]);

    /* Boshqa qabulga o'tilganda yoki kartadan chiqilganda — yozilgani ketsin.
       Qoralamalar o'z qabulining id si bilan ketadi, keyin tozalanadi. */
    useEffect(() => () => {
        void saveExam();
        void saveComplaint();
        void saveConclusion();
        complaintDraft.current = null;
        conclusionDraft.current = null;
        examInvalidRef.current = false;
        setExamInvalid(false);
        setSave({ state: 'idle' });
    }, [visitId, saveExam, saveComplaint, saveConclusion]);

    /* Oyna yopilayotgan yoki sahifa qayta yuklanayotgan bo'lsa — oxirgi
       soniyada yozilgani ham ketsin (taymer hali ishlamagan bo'lishi mumkin). */
    useEffect(() => {
        const onLeave = () => { void saveExam(true); void saveComplaint(true); void saveConclusion(true); };
        window.addEventListener('pagehide', onLeave);
        return () => window.removeEventListener('pagehide', onLeave);
    }, [saveExam, saveComplaint, saveConclusion]);

    return {
        complaint, onComplaintChange,
        onComplaintBlur: () => { void saveComplaint(); },
        conclusion, onConclusionChange,
        onConclusionBlur: () => { void saveConclusion(); },
        onExamChange, flush, save, examInvalid,
        isExamInvalid: () => examInvalidRef.current,
        writeEpoch,
    };
}
