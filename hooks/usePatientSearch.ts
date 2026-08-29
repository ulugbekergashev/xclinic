import { useEffect, useRef, useState } from 'react';
import { Patient } from '../types';
import { api } from '../services/api';

/* ─────────────────────────────────────────────────────────────────────────────
   Bemor qidiruvi — SERVER tomonda.

   NIMA UCHUN KERAK BO'LDI. Serverda to'g'ri yozilgan qidiruv allaqachon bor
   edi (`GET /api/patients/search`): ism, familiya, telefon, KARTA RAQAMI,
   JSHSHIR, telefonni raqamlarga ajratib qidirish, 50 ta chegara.

   Undan hech kim foydalanmasdi. Registratura ham, Bemorlar ro'yxati ham
   brauzerdagi massivni filtrlardi va faqat ism + telefon bo'yicha. Ya'ni
   registrator karta raqami bo'yicha bemorni UMUMAN topa olmasdi, garchi
   server buni qila olsa ham.

   Ikkinchi foydasi keyinroq ko'rinadi: brauzerdagi to'liq ro'yxatga tayanish
   15 000 bemorda ishlamay qoladi (FIX-PLAN, 10-reliz). Qidiruv serverga
   o'tgani bilan o'sha ko'chishning eng ko'p ishlatiladigan qismi allaqachon
   tayyor bo'ladi.

   DEBOUNCE. Har harfda so'rov yuborish — sekin yozadigan registratorda
   o'nlab keraksiz so'rov. 250 ms — yozishni to'xtatgani bilinadigan, lekin
   sezilmaydigan oraliq.
   ───────────────────────────────────────────────────────────────────────────── */

export interface PatientSearchResult {
    /** Serverdan kelgan natijalar (yoki qidiruvsiz holatda bo'sh) */
    results: Patient[];
    loading: boolean;
    error: string | null;
    /** Qidiruv faol (kamida 2 belgi kiritilgan) */
    active: boolean;
}

const MIN_CHARS = 2;

export function usePatientSearch(term: string, opts?: {
    /** Debounce, ms. Skaner uchun 0 berish mumkin. */
    delayMs?: number;
    /** O'chirilgan bo'lsa so'rov yuborilmaydi (masalan modal yopiq) */
    enabled?: boolean;
}): PatientSearchResult {
    const delay = opts?.delayMs ?? 250;
    const enabled = opts?.enabled ?? true;

    const [results, setResults] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* Kechikkan javob yangisini bosib ketmasligi kerak: sekin so'rov tez
       so'rovdan keyin kelsa, ro'yxatda ESKI natija qolib ketardi. */
    const seq = useRef(0);

    const q = term.trim();
    const active = enabled && q.length >= MIN_CHARS;

    useEffect(() => {
        if (!active) {
            setResults([]);
            setLoading(false);
            setError(null);
            return;
        }

        const mine = ++seq.current;
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const found = await api.patients.search(q);
                if (seq.current !== mine) return;      // eskirgan javob
                setResults(found || []);
                setError(null);
            } catch (e: any) {
                if (seq.current !== mine) return;
                setResults([]);
                setError(e?.message || "Qidirib bo'lmadi");
            } finally {
                if (seq.current === mine) setLoading(false);
            }
        }, delay);

        return () => clearTimeout(timer);
    }, [q, active, delay]);

    return { results, loading, error, active };
}
