import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Volume2, VolumeX, Maximize2, MonitorPlay, Clock } from 'lucide-react';
import { API_URL, isDemoMode } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   Navbat tablosi — kutish zalidagi ekran.

   Eski "Online Navbat" navbatni localStorage'da yuritardi: har brauzerda o'z
   nusxasi bo'lib, haqiqiy qabullar bilan bog'lanmagan edi. Endi tablo bazadagi
   qabullarni ko'rsatadi.

   Ikki muhim qoida:

   1. BEMOR ISMI CHIQMAYDI — na ekranda, na ovozda. Kutish zali ochiq joy,
      u yerda kim qaysi shifokorga kelgani begonalarga eshitilmasligi kerak.
      Faqat navbat raqami va bo'lim.

   2. Ovoz brauzerning o'z sintezatori bilan — internet talab qilmaydi.
      (Eskisida Google TTS asosiy yo'l edi, ya'ni internetsiz jim qolardi.)
   ───────────────────────────────────────────────────────────────────────────── */

interface BoardEntry {
    queueNumber: number | null;
    /** «K-02» — bo'lim kodi bilan. Bo'limsiz qabulda raqamning o'zi. */
    ticket: string | null;
    status: 'Waiting' | 'Called' | 'In Progress';
    calledAt: string | null;
    department: string | null;
    color: string | null;
    // doctorName ataylab yo'q: tablo login talab qilmaydi, shuning uchun
    // server shifokor ismini yubormaydi (multiprofile.ts, queue-board)
}

/* Tablo LOGIN TALAB QILMAYDI (televizorda turadi), ya'ni hodisalar oqimiga
   ulana olmaydi — oqim autentifikatsiya so'raydi. Shuning uchun bu yerda
   polling qoladi va u yagona to'g'ri yechim. */
const REFRESH_MS = 5000;

/* Demo tablosi. Tablo LOGINSIZ ochiladi, ya'ni bu yerda demo sessiyasi
   bo'lmasligi ham mumkin — shuning uchun ro'yxat shu faylning o'zida,
   `api.ts` dagi demo ma'lumotiga bog'lanmasdan turadi. */
const demoBoard = (): BoardEntry[] => {
    const now = new Date().toISOString();
    return [
        { queueNumber: 12, ticket: 'T-12', status: 'In Progress', calledAt: now, department: 'Terapiya', color: '#2563EB' },
        { queueNumber: 13, ticket: 'T-13', status: 'Called', calledAt: now, department: 'Terapiya', color: '#2563EB' },
        { queueNumber: 14, ticket: 'X-14', status: 'Waiting', calledAt: null, department: 'Jarrohlik', color: '#DB2777' },
        { queueNumber: 15, ticket: 'X-15', status: 'Waiting', calledAt: null, department: 'Jarrohlik', color: '#DB2777' },
        { queueNumber: 16, ticket: 'L-16', status: 'Waiting', calledAt: null, department: 'Laboratoriya', color: '#0D9488' },
    ];
};

export const QueueBoard: React.FC<{ clinicId?: string }> = ({ clinicId: propClinicId }) => {
    const params = useParams<{ clinicId?: string }>();
    const clinicId = propClinicId || params.clinicId || '';

    const [entries, setEntries] = useState<BoardEntry[]>([]);
    const [voiceOn, setVoiceOn] = useState(true);
    const [now, setNow] = useState(new Date());
    const announced = useRef<Set<string>>(new Set());
    const firstLoad = useRef(true);

    /** Raqamni ovoz bilan e'lon qiladi — brauzer sintezatori, internetsiz */
    const announce = useCallback((e: BoardEntry) => {
        if (!voiceOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

        const dept = e.department ? `, ${e.department} bo'limiga` : '';
        const textUz = `Navbat raqam ${e.ticket ?? e.queueNumber}${dept}, marhamat.`;
        const textRu = `Номер очереди ${e.ticket ?? e.queueNumber}${e.department ? `, в отделение ${e.department}` : ''}, пожалуйста.`;

        const voices = window.speechSynthesis.getVoices();
        const uz = voices.find(v => v.lang.toLowerCase().includes('uz'));
        const ru = voices.find(v => v.lang.toLowerCase().includes('ru'));

        // O'zbekcha ovoz bo'lmasa ruscha, u ham bo'lmasa tizim ovozi bilan o'zbekcha
        const pick = uz || ru || null;
        const text = uz ? textUz : ru ? textRu : textUz;

        const u = new SpeechSynthesisUtterance(text);
        if (pick) u.voice = pick;
        u.lang = uz ? 'uz-UZ' : ru ? 'ru-RU' : 'uz-UZ';
        u.rate = 0.85;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    }, [voiceOn]);

    const load = useCallback(async () => {
        if (!clinicId) return;
        /* Demoda tablo o'z ma'lumoti bilan ishlaydi: bugungi qabullardan
           navbat yig'iladi. Server yo'q, lekin ekran tirik ko'rinadi. */
        if (isDemoMode()) { setEntries(demoBoard()); return; }
        try {
            const res = await fetch(`${API_URL}/queue-board/${clinicId}`);
            if (!res.ok) return;
            const data: BoardEntry[] = await res.json();
            setEntries(data);

            // Yangi chaqirilganlarni ovoz bilan e'lon qilamiz.
            // Birinchi yuklashda jim turamiz — aks holda tablo yoqilganda
            // butun navbatni ketma-ket o'qib chiqadi.
            for (const e of data) {
                if (e.status !== 'Called' || !e.calledAt) continue;
                const key = `${e.queueNumber}:${e.calledAt}`;
                if (announced.current.has(key)) continue;
                announced.current.add(key);
                if (!firstLoad.current) announce(e);
            }
            firstLoad.current = false;
        } catch { /* tarmoq uzilsa tablo eski holatda turaveradi */ }
    }, [clinicId, announce]);

    useEffect(() => {
        load();
        const t = setInterval(load, REFRESH_MS);
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const called = useMemo(
        () => entries.filter(e => e.status === 'Called' || e.status === 'In Progress')
            .sort((a, b) => (b.calledAt || '').localeCompare(a.calledAt || ''))
            .slice(0, 4),
        [entries],
    );
    const waiting = useMemo(
        () => entries.filter(e => e.status === 'Waiting').sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0)),
        [entries],
    );

    const goFullscreen = () => {
        const el = document.documentElement;
        if (!document.fullscreenElement) el.requestFullscreen?.();
        else document.exitFullscreen?.();
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6 lg:p-10">
            {/* Sarlavha */}
            <div className="flex items-center gap-4 mb-8">
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">Navbat</h1>
                <div className="ml-auto flex items-center gap-4">
                    <span className="flex items-center gap-2 text-2xl lg:text-3xl font-semibold tabular-nums text-gray-300">
                        <Clock className="w-6 h-6 text-gray-500" />
                        {now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button onClick={() => setVoiceOn(v => !v)}
                        className="p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                        title={voiceOn ? "Ovozni o'chirish" : 'Ovozni yoqish'}>
                        {voiceOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </button>
                    <button aria-label="To'liq ekran" onClick={goFullscreen}
                        className="p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
                        title="To'liq ekran">
                        <Maximize2 className="w-5 h-5" />
                    </button>
                    {/* KIOSK REJIMI (S5.6, audit B-1 tablo).

                        Audit: «Hozir tablo app menyusi bilan chiqadi».
                        Menyusiz sahifa (`/board/:clinicId`) ALLAQACHON bor
                        edi — unga o'tish yo'li yo'q edi, ya'ni uni faqat
                        manzilni qo'lda yozib topish mumkin edi.

                        Yangi oynada ochiladi: tablo alohida monitorda
                        turadi, xodim esa o'z ishida qoladi. */}
                    {clinicId && (
                        <a
                            href={`#/board/${clinicId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Kiosk rejimi — alohida oynada"
                            title="Kiosk rejimi: menyusiz, alohida oynada"
                            className="p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 inline-flex"
                        >
                            <MonitorPlay className="w-5 h-5" />
                        </a>
                    )}
                </div>
            </div>

            {/* Chaqirilganlar — asosiy qism */}
            <div className="mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">Chaqirilmoqda</h2>
                {called.length === 0 ? (
                    <div className="py-16 text-center text-gray-600 text-xl">Hozircha chaqirilgan navbat yo'q</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                        {called.map((e, i) => {
                            /* TALON UZUNLIGIGA QARAB O'LCHAM.

                               O'lcham qat'iy `text-8xl` (96px) edi. Talon
                               bo'lim kodi bilan keladi («KARD-02», 7 belgi)
                               va u shu o'lchamda kartadan CHIQIB ketardi:
                               oxirgi karta o'ng chetdan kesilib, yonidagiga
                               tegib turardi. Koridordagi ekranda bu darhol
                               ko'zga tashlanadi.

                               Bo'lim kodlari turli uzunlikda («PED», «KARD»,
                               «NEVR»), shuning uchun o'lcham hisoblanadi. */
                            const ticket = String(e.ticket ?? e.queueNumber ?? '—');
                            const size = ticket.length <= 3 ? 'text-7xl lg:text-8xl'
                                : ticket.length <= 5 ? 'text-6xl lg:text-7xl'
                                : 'text-4xl lg:text-6xl';
                            return (
                            <div key={`${e.queueNumber}-${e.calledAt}-${i}`}
                                className="rounded-2xl p-6 border-2 animate-in overflow-hidden"
                                style={{
                                    borderColor: e.color || '#2563EB',
                                    background: `linear-gradient(160deg, ${(e.color || '#2563EB')}22, transparent)`,
                                }}>
                                <p className={`${size} font-black leading-none tabular-nums break-words`}>
                                    {ticket}
                                </p>
                                <p className="mt-3 text-xl font-medium text-gray-200 truncate">
                                    {e.department || '—'}
                                </p>
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Kutayotganlar */}
            <div>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">
                    Kutmoqda <span className="text-gray-600">({waiting.length})</span>
                </h2>
                {waiting.length === 0 ? (
                    <p className="text-gray-600">Navbat bo'sh</p>
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {waiting.map((e, i) => (
                            <div key={`${e.queueNumber}-${i}`}
                                className="px-5 py-3 rounded-xl bg-gray-900 border border-gray-800 min-w-[92px] text-center">
                                <p className="text-3xl font-bold tabular-nums">{e.ticket ?? e.queueNumber ?? '—'}</p>
                                <p className="text-xs text-gray-500 truncate max-w-[120px]">{e.department || ''}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <p className="mt-10 text-xs text-gray-700">
                Tablo har {REFRESH_MS / 1000} soniyada yangilanadi
            </p>
        </div>
    );
};
