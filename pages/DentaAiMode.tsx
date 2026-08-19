import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, ArrowUp, Loader2, AlertTriangle, Database, Inbox,
  CalendarCheck, TrendingUp, Wallet, Users, Package, Sparkles, RotateCcw,
} from 'lucide-react';
import { API_URL } from '../services/api';
import { UserRole } from '../types';
import { useLanguage } from '../context/LanguageContext';

// ─── DentaAI ─────────────────────────────────────────────────────────────────
// Bu modal EMAS. Sahifa ichida, ilova navigatsiyasi joyida turgan holda
// ochiladi — foydalanuvchi qayerdaligini yo'qotmaydi. Ilgari `fixed inset-0`
// overlay edi va ilovaning yuqori paneli ostida kesilib qolardi.
//
// Chetlar ataylab bo'sh: karta ichida karta yo'q, bo'limlar faqat bo'sh joy
// bilan ajratiladi. Yagona ko'zga tashlanadigan element — qidiruv maydoni.

// ─── Tiplar ──────────────────────────────────────────────────────────────────

interface Metric {
  label: string;
  value: number | string;
  unit?: string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

interface ReportTable {
  columns: string[];
  rows: (string | number)[][];
}

interface Report {
  type: string;
  title: string;
  period: string;
  metrics: Metric[];
  table?: ReportTable;
  narrative: string;
  sources: string[];
  empty?: boolean;
  emptyText?: string;
}

interface ReportOption {
  type: string;
  title: string;
  hint: string;
}

type Result =
  | { kind: 'report'; report: Report }
  | { kind: 'error'; message: string };

/** Suhbatning bitta almashinuvi. */
interface Turn {
  q: string;
  a: string;
  sources: string[];
}

// ─── API ─────────────────────────────────────────────────────────────────────

function authToken(): string | null {
  try {
    const raw = sessionStorage.getItem('xclinic_auth') || localStorage.getItem('xclinic_auth');
    return raw ? JSON.parse(raw)?.token ?? null : null;
  } catch {
    return null;
  }
}

async function api<T>(path: string, body?: object): Promise<T> {
  const token = authToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || `Xatolik (${res.status})`);
  return data as T;
}

// ─── Ko'rinish ───────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ElementType> = {
  today: CalendarCheck,
  performance: TrendingUp,
  finance: Wallet,
  debtors: Users,
  inventory: Package,
  leads: Sparkles,
};

// Rang ilovaning yorug'/qorong'i rejimiga moslashadi.
const TONE: Record<string, string> = {
  neutral: 'text-gray-900 dark:text-white',
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-rose-600 dark:text-rose-400',
};

const CARD = 'bg-white dark:bg-gray-800/40 ring-1 ring-gray-200/80 dark:ring-white/[0.06]';

const fmtValue = (v: number | string): string =>
  typeof v === 'number' ? v.toLocaleString('ru-RU') : v;

// "get_revenue" hech kimga hech narsa demaydi — "moliya" javob qayerdan
// kelganini tushuntiradi.
const SOURCE_LABEL: Record<string, { uz: string; ru: string }> = {
  get_appointments: { uz: 'qabullar', ru: 'приёмы' },
  get_revenue: { uz: 'moliya', ru: 'финансы' },
  get_debtors: { uz: 'qarzdorlar', ru: 'должники' },
  get_doctor_stats: { uz: 'shifokorlar', ru: 'врачи' },
  find_patient: { uz: 'bemorlar', ru: 'пациенты' },
  get_low_stock: { uz: 'ombor', ru: 'склад' },
  get_leads: { uz: 'lidlar', ru: 'лиды' },
};

const MetricCard: React.FC<{ m: Metric; i: number }> = ({ m, i }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    className={`rounded-2xl px-5 py-4 ${CARD}`}
  >
    <div className="text-[11px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 mb-2">
      {m.label}
    </div>
    <div className={`text-[26px] leading-none font-semibold tabular-nums ${TONE[m.tone || 'neutral']}`}>
      {fmtValue(m.value)}
      {m.unit && (
        <span className="text-[13px] font-normal text-gray-400 dark:text-gray-500 ml-1.5">{m.unit}</span>
      )}
    </div>
    {m.hint && <div className="text-[12px] text-gray-400 dark:text-gray-500 mt-2">{m.hint}</div>}
  </motion.div>
);

const DataTable: React.FC<{ t: ReportTable }> = ({ t }) => (
  <div className={`rounded-2xl overflow-hidden ${CARD}`}>
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] min-w-[480px]">
        <thead>
          <tr className="bg-gray-50/80 dark:bg-white/[0.03]">
            {t.columns.map(c => (
              <th
                key={c}
                className="text-left font-medium px-4 py-2.5 whitespace-nowrap text-[11px]
                           uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-white/[0.04]">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-2.5 whitespace-nowrap ${
                    j === 0
                      ? 'text-gray-800 dark:text-gray-200'
                      : 'text-gray-500 dark:text-gray-400 tabular-nums'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SourcePills: React.FC<{ sources: string[]; label: string; lang: 'uz' | 'ru' }> = ({ sources, label, lang }) => {
  const uniq: string[] = sources.filter((s, i) => s && sources.indexOf(s) === i);
  if (!uniq.length) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Database className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
      <span className="text-[11px] text-gray-400 dark:text-gray-500">{label}</span>
      {uniq.map(s => (
        <span
          key={s}
          className="text-[11px] rounded-full px-2.5 py-0.5 text-gray-500 dark:text-gray-400
                     bg-gray-100 dark:bg-white/[0.05]"
        >
          {SOURCE_LABEL[s]?.[lang] || s}
        </span>
      ))}
    </div>
  );
};

// ─── Asosiy komponent ────────────────────────────────────────────────────────

interface Props {
  userRole: UserRole;
  /** Sahifa ichida ishlagani uchun ixtiyoriy — tab bo'lsa kerak emas. */
  onExit?: () => void;
}

export const DentaAiMode: React.FC<Props> = ({ onExit }) => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  // Suhbat tarixi. Modelga oldingi almashinuvlar ham yuboriladi, aks holda
  // "va o'tgan oychi?" kabi davomiy savol kontekstsiz qoladi.
  const [thread, setThread] = useState<Turn[]>([]);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasResult = result !== null || busy || thread.length > 0;

  // Ro'yxat serverdan keladi — frontendda qattiq yozilsa, ruxsati yo'q rol
  // tugmani ko'rib, bosib, 403 olardi.
  useEffect(() => {
    api<{ reports: ReportOption[] }>(`/ai/reports?lang=${language}`)
      .then(d => setReports(d.reports || []))
      .catch(() => setReports([]));
  }, [language]);

  // Yangi javob kelganda oxiriga suriladi.
  useEffect(() => {
    if (thread.length) threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (result || thread.length)) reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [result, thread.length]);

  const runReport = useCallback(async (type: string, title: string) => {
    setBusy(true);
    setBusyLabel(title);
    setActiveReport(type);
    setResult(null);
    setThread([]);
    try {
      const d = await api<{ report: Report }>('/ai/report', { type, lang: language });
      setResult({ kind: 'report', report: d.report });
    } catch (e: any) {
      setResult({ kind: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }, []);

  const ask = useCallback(async () => {
    const q = query.trim();
    if (!q || busy) return;
    setBusy(true);
    setBusyLabel('Ma\'lumot izlanmoqda');
    setActiveReport(null);
    setResult(null);
    setQuery('');
    try {
      // Oldingi almashinuvlar + yangi savol. Server oxirgi 10 tasini oladi.
      const history = thread.flatMap(t => ([
        { role: 'user', content: t.q },
        { role: 'assistant', content: t.a },
      ]));
      const d = await api<{ reply: string; sources?: string[] }>('/ai/ask', {
        messages: [...history, { role: 'user', content: q }],
        lang: language,
      });
      setThread(prev => [...prev, { q, a: d.reply, sources: d.sources || [] }]);
    } catch (e: any) {
      setResult({ kind: 'error', message: e.message });
    } finally {
      setBusy(false);
    }
  }, [query, busy, language, t, thread]);

  const reset = () => {
    setResult(null);
    setActiveReport(null);
    setThread([]);
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="w-full">
      {/* Bosh holat: markazda, nafas oladigan bo'sh joy bilan.
          Natija chiqqach yuqoriga siljiydi — motion layout buni silliq qiladi. */}
      <motion.div layout transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
        <AnimatePresence>
          {!hasResult && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-center pt-10 pb-8"
            >
              <h2 className="text-[26px] sm:text-[32px] font-bold tracking-tight text-gray-900 dark:text-white">
                {t('ai.heroTitle')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-[15px]">
                {t('ai.heroSub')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Qidiruv — sahifadagi yagona urg'uli element */}
        <div className="max-w-2xl mx-auto relative group">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none
                       text-gray-400 dark:text-gray-500 group-focus-within:text-violet-500 transition-colors"
          />
          <textarea
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
            }}
            rows={1}
            placeholder={t('ai.placeholder')}
            className="w-full rounded-2xl pl-14 pr-14 py-[18px] text-[15.5px] resize-none outline-none
                       bg-white dark:bg-gray-800/60
                       ring-1 ring-gray-200 dark:ring-white/[0.08]
                       focus:ring-2 focus:ring-violet-500/60
                       focus:shadow-[0_0_0_5px_rgba(139,92,246,0.07)]
                       placeholder:text-gray-400 dark:placeholder:text-gray-500
                       text-gray-900 dark:text-white transition-shadow shadow-sm"
          />
          <button
            onClick={ask}
            disabled={!query.trim() || busy}
            aria-label={t('ai.send')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center
                       rounded-xl bg-violet-600 text-white transition-colors
                       disabled:bg-gray-100 dark:disabled:bg-white/[0.06]
                       disabled:text-gray-300 dark:disabled:text-gray-600"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </motion.div>

      {/* Natija ochiq — hisobotlar chip qatoriga aylanadi va JOYIDA qoladi.
          Ilgari ular yo'qolardi va boshqasini ko'rish uchun qayta boshlash kerak edi. */}
      {hasResult && reports.length > 0 && (
        <div className="max-w-2xl mx-auto mt-3 flex items-center gap-2 overflow-x-auto pb-1
                        [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {reports.map(r => {
            const Icon = ICONS[r.type] || Sparkles;
            const on = activeReport === r.type;
            return (
              <button
                key={r.type}
                onClick={() => runReport(r.type, r.title)}
                disabled={busy}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px]
                            font-medium transition-colors disabled:opacity-40 ${
                  on
                    ? 'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-400/30'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {r.title}
              </button>
            );
          })}
          {(result || thread.length > 0) && (
            <button
              onClick={reset}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px]
                         text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300
                         hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors ml-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {t('ai.restart')}
            </button>
          )}
        </div>
      )}

      {/* Bosh ekran: kengaytirilgan hisobot kartalari */}
      <AnimatePresence>
        {!hasResult && reports.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.08 }}
            className="max-w-3xl mx-auto mt-10 pb-6"
          >
            <div className="text-[11px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 mb-3">
              {t('ai.oneClick')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {reports.map((r, i) => {
                const Icon = ICONS[r.type] || Sparkles;
                return (
                  <motion.button
                    key={r.type}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.035 }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => runReport(r.type, r.title)}
                    className={`text-left rounded-2xl p-4 flex items-start gap-3.5 transition-colors
                                group hover:ring-violet-300 dark:hover:ring-violet-400/30 ${CARD}`}
                  >
                    {/* Ikona alohida maydonchada — ro'yxatni ko'z bilan tez
                        skanerlashga yordam beradi, yalang'och ikona esa
                        matnga qo'shilib ketadi. */}
                    <span className="shrink-0 w-9 h-9 rounded-xl grid place-items-center transition-colors
                                     bg-gray-100 dark:bg-white/[0.05]
                                     group-hover:bg-violet-50 dark:group-hover:bg-violet-500/15">
                      <Icon className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400
                                       group-hover:text-violet-500 dark:group-hover:text-violet-300
                                       transition-colors" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-gray-900 dark:text-white mb-0.5">
                        {r.title}
                      </span>
                      <span className="block text-[12.5px] text-gray-500 dark:text-gray-400 leading-snug">
                        {r.hint}
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suhbat. Hisobotdan farqi: bu yerda tarix saqlanadi va modelga
          yuboriladi, shuning uchun "va o'tgan oychi?" kabi davomiy savol
          ishlaydi. Har bir almashinuv joyida qoladi — foydalanuvchi nima
          so'raganini va nima javob olganini ko'rib turadi. */}
      {thread.length > 0 && !result && (
        <div className="mt-8 space-y-7">
          {thread.map((turn, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                <div className="text-[15px] font-medium text-gray-900 dark:text-white">
                  {turn.q}
                </div>
              </div>
              <p className="text-[15.5px] leading-relaxed text-gray-700 dark:text-gray-300
                            whitespace-pre-wrap max-w-2xl pl-4">
                {turn.a}
              </p>
              <div className="pl-4">
                <SourcePills sources={turn.sources} label={t('ai.source')} lang={language} />
              </div>
            </motion.div>
          ))}
          <div ref={threadEndRef} />
        </div>
      )}

      {/* Yuklanmoqda */}
      <AnimatePresence>
        {busy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-8">
            <div className="flex items-center gap-2.5 text-[13px] text-gray-500 dark:text-gray-400 mb-5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
              {busyLabel}…
            </div>
            {/* Hisobot kutilayotganda kartalar skeleti, suhbatda esa
                matn qatorlari — kelayotgan narsaning shakliga mos. */}
            {activeReport ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={`rounded-2xl px-5 py-4 ${CARD}`}>
                    <div className="h-2 w-14 bg-gray-200 dark:bg-white/[0.07] rounded mb-3.5 animate-pulse" />
                    <div className="h-6 w-20 bg-gray-200 dark:bg-white/[0.07] rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2.5 max-w-2xl pl-4">
                <div className="h-3.5 w-11/12 bg-gray-200 dark:bg-white/[0.07] rounded animate-pulse" />
                <div className="h-3.5 w-4/5 bg-gray-200 dark:bg-white/[0.07] rounded animate-pulse" />
                <div className="h-3.5 w-2/3 bg-gray-200 dark:bg-white/[0.07] rounded animate-pulse" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Natija */}
      <AnimatePresence mode="wait">
        {result && !busy && (
          <motion.div
            key={result.kind + (activeReport || '')}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 space-y-5"
          >
            {result.kind === 'error' && (
              <div className="rounded-2xl px-5 py-4 flex items-start gap-3
                              ring-1 ring-rose-200 dark:ring-rose-500/25
                              bg-rose-50 dark:bg-rose-500/[0.07]">
                <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[14px] font-semibold text-rose-700 dark:text-rose-200 mb-0.5">
                    {t('ai.errorTitle')}
                  </div>
                  <div className="text-[13px] text-rose-600/80 dark:text-rose-200/70">{result.message}</div>
                </div>
              </div>
            )}

            {result.kind === 'report' && (
              <>
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <h3 className="text-[20px] font-bold tracking-tight text-gray-900 dark:text-white">
                    {result.report.title}
                  </h3>
                  <span className="text-[12px] text-gray-400 dark:text-gray-500 tabular-nums">
                    {result.report.period}
                  </span>
                </div>

                {/* Nol devori xatodek tuyuladi — o'rniga holatni ochiq aytamiz. */}
                {result.report.empty ? (
                  <div className={`rounded-2xl px-6 py-12 text-center ${CARD}`}>
                    <div className="w-10 h-10 rounded-xl grid place-items-center mx-auto mb-3.5
                                    bg-gray-100 dark:bg-white/[0.05]">
                      <Inbox className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="text-[15px] text-gray-700 dark:text-gray-300 mb-1">{t('ai.noData')}</div>
                    <div className="text-[13px] text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                      {result.report.emptyText || t('ai.noDataFallback')}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {result.report.metrics.map((m, i) => <MetricCard key={m.label} m={m} i={i} />)}
                    </div>

                    {result.report.narrative && (
                      <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300
                                    max-w-2xl whitespace-pre-wrap">
                        {result.report.narrative}
                      </p>
                    )}

                    {result.report.table && <DataTable t={result.report.table} />}
                  </>
                )}
                <SourcePills sources={result.report.sources} label={t('ai.source')} lang={language} />
              </>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DentaAiMode;
