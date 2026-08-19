import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot, Send, Sparkles, RefreshCw, MessageSquare,
  Lightbulb, AlertCircle, Loader2, ChevronRight, Zap,
  Volume2, VolumeX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { API_URL, isDemoMode } from '../services/api';
import { UserRole } from '../types';

// ─── Tiplар ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

interface InsightStats {
  todayAppointments?: number;
  monthAppointments?: number;
  monthRevenue?: number;
  newLeads?: number;
  debtorsCount?: number;
  pendingRevenue?: number;
  totalPatients?: number;
  avgCheck?: number;
  unpaidCompleted?: number;
}

interface DashboardAiTabProps {
  userRole: UserRole;
  stats: InsightStats;
}

// ─── Demo javoblar ───────────────────────────────────────────────────────────

const DEMO_CHAT_RESPONSES: Record<string, string> = {
  default:
    'Klinikangizda bugun 8 ta qabul rejalashtirilgan, ulardan 3 tasi tasdiqlangan. Yangi bemorlar soni o\'tgan haftaga nisbatan 12% oshdi. Biror narsa haqida batafsil bilib olmoqchimisiz?',
  qabul:
    'Bugun jami 8 ta qabul bor. Ulardan: 3 ta — Tasdiqlangan, 2 ta — Kutilmoqda, 3 ta — Bajarilgan. Eng band vaqt — soat 10:00 dan 13:00 gacha.',
  tushum:
    'Joriy oy davomida klinika tushumlari: Naqd — 4 500 000 so\'m, Karta — 2 800 000 so\'m, Click/Payme — 1 200 000 so\'m. Jami: 8 500 000 so\'m. O\'tgan oyga nisbatan +18%.',
  bemor:
    'Faol bemorlar soni: 142 ta. Ushbu oyda yangi bemorlar: 14 ta. Eng ko\'p murojaat qilgan bemor: Karimov M. (4 marta). Arxivlashtirilganlar: 23 ta.',
  qarz:
    'Hozirda 7 ta qarzdor bemor mavjud. Umumiy qarz summasi: 1 850 000 so\'m. Eng katta qarz: Yusupova S. — 420 000 so\'m (oxirgi tashrif: 3 kun oldin).',
};

const DEMO_INSIGHTS = [
  '📈 Bemorlar soni oshmoqda: O\'tgan oyga nisbatan +12% o\'sish qayd etildi. Marketing faoliyatini davom ettiring va mavjud bemorlarni qayta jalb qilish uchun SMS yuborishni rejalashtiring.',
  '💰 Qarzdorlarni faollashtiring: 7 ta bemor jami 1 850 000 so\'m qarz. Ularga bugun Telegram/SMS orqali eslatma yuborish orqali kassa balansini yaxshilash mumkin.',
  '⏰ Bugungi to\'lanmagan qabullar: 3 ta yakunlangan qabul uchun to\'lov hali qabul qilinmagan. Reception xodimiga eslatma bering va qabullar sahifasidan to\'lovni yopish imkoniyatidan foydalaning.',
  '🦷 Eng mashhur xizmat: Karies davolash (23%) va Tozalash (18%) eng ko\'p so\'ralayotgan xizmatlar. Ushbu xizmatlarga paket taklif qilishni ko\'rib chiqing.',
  '📅 Hafta boshidagi bo\'shliqlar: Dushanba va seshanba kunlari qabul jadvalida bo\'shliqlar ko\'p. Profilaktik tekshiruv uchun chegirmali takliflar o\'tkazish orqali band qilish mumkin.',
];

// ─── Helper: API so'rov ──────────────────────────────────────────────────────

function getAuthToken(): string | null {
  try {
    const raw =
      sessionStorage.getItem('xclinic_auth') ||
      localStorage.getItem('xclinic_auth');
    if (!raw) return null;
    return JSON.parse(raw)?.token || null;
  } catch {
    return null;
  }
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data as T;
}

// ─── Asosiy komponent ────────────────────────────────────────────────────────

export const DashboardAiTab: React.FC<DashboardAiTabProps> = ({ userRole, stats }) => {
  const isAdmin =
    userRole === UserRole.CLINIC_ADMIN || userRole === UserRole.SUPER_ADMIN;

  // Chat holati
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-msg',
      role: 'assistant',
      content:
        'Salom! Men XClinic AI yordamchisiman. Klinikangiz haqida savol bering — qabullar, tushum, qarzdorlar, ombor va lidlar haqida ma\'lumot bera olaman.',
    },
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Insights holati
  const [insights, setInsights] = useState<string[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  // Audio holati
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const playAiResponse = useCallback((text: string) => {
    if (!isAudioEnabled) return;

    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      // Tozalash: markdown va keraksiz belgilarni olib tashlaymiz
      const cleanText = text.replace(/[\*\#\`]/g, '');
      const googleTtsUrl = `${API_URL}/tts?text=${encodeURIComponent(cleanText)}&lang=uz`;
      const audio = new Audio(googleTtsUrl);
      currentAudioRef.current = audio;
      
      const playOfflineFallback = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'uz-UZ';
        const voices = window.speechSynthesis.getVoices();
        const uzVoice = voices.find(v => v.lang.toLowerCase().includes('uz'));
        if (uzVoice) utterance.voice = uzVoice;
        window.speechSynthesis.speak(utterance);
      };

      audio.play().catch(err => {
        console.warn("Google TTS failed, using offline fallback:", err);
        playOfflineFallback();
      });
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  }, [isAudioEnabled]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Insights — sahifa ochilganda avtomatik yuklash
  const loadInsights = useCallback(async () => {
    if (!isAdmin) return;
    setInsightsLoading(true);
    setInsightsError('');
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 1200));
        setInsights(DEMO_INSIGHTS);
      } else {
        const data = await apiPost<{ insights: string[] }>('/ai/insights', { stats });
        setInsights(data.insights || []);
      }
    } catch (e: any) {
      setInsightsError(e.message || 'Tahlil xatoligi');
    } finally {
      setInsightsLoading(false);
    }
  }, [isAdmin, stats]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  // Chat yuborish
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || chatLoading) return;

    const userMsgId = Date.now().toString();
    const loadingMsgId = (Date.now() + 1).toString();
    
    const userMsg: ChatMessage = { id: userMsgId, role: 'user', content: text };
    const loadingMsg: ChatMessage = { id: loadingMsgId, role: 'assistant', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setChatLoading(true);

    try {
      let reply = '';

      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 1500));
        const lower = text.toLowerCase();
        if (lower.includes('qabul')) reply = DEMO_CHAT_RESPONSES.qabul;
        else if (lower.includes('tushum') || lower.includes('daromad') || lower.includes('pul')) reply = DEMO_CHAT_RESPONSES.tushum;
        else if (lower.includes('bemor')) reply = DEMO_CHAT_RESPONSES.bemor;
        else if (lower.includes('qarz') || lower.includes('qarzdor')) reply = DEMO_CHAT_RESPONSES.qarz;
        else reply = DEMO_CHAT_RESPONSES.default;
      } else {
        const history = messages
          .filter(m => !m.loading)
          .concat(userMsg)
          .map(m => ({ role: m.role, content: m.content }));

        const endpoint = isAdmin ? '/ai/ask' : '/ai/chat';
        const data = await apiPost<{ reply: string }>(endpoint, { messages: history });
        reply = data.reply;
      }

      setMessages(prev => [
        ...prev.filter(m => m.id !== loadingMsgId),
        { id: Date.now().toString(), role: 'assistant', content: reply },
      ]);

      // Javobni ovozli o'qish
      playAiResponse(reply);
    } catch (e: any) {
      setMessages(prev => [
        ...prev.filter(m => m.id !== loadingMsgId),
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `Xatolik: ${e.message || 'AI bilan aloqa yo\'q. Iltimos, qayta urining.'}`,
        },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = isAdmin
    ? [
        'Bugun nechta qabul bor?',
        'Oy davomida tushum qancha?',
        'Qarzdorlar ro\'yxati',
        'Yangi lidlar soni',
      ]
    : [
        'Bugungi qabullarim',
        'Karies davolash jarayoni',
        'SMS eslatma qanday sozlanadi?',
      ];

  // ─── UI ──────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 mb-8">

      {/* CHAT PANELI (7 ustun) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="xl:col-span-7 flex flex-col bg-white/70 dark:bg-[#111318]/70 backdrop-blur-3xl rounded-[2.5rem] border border-white/20 dark:border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden relative" 
        style={{ minHeight: 600 }}
      >
        {/* Glow Effects */}
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-violet-400/20 dark:bg-violet-600/10 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3 pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-4 px-8 py-6 border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
            <Sparkles className="w-6 h-6 text-white" />
            <div className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white dark:border-gray-900"></span>
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
              DentaAI Yordamchi
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {isAdmin ? 'Ma\'lumotlar bazasi bilan bog\'langan' : 'Umumiy stomatologiya maslahatlari'}
            </p>
          </div>
          
          <button
            onClick={() => {
              setIsAudioEnabled(!isAudioEnabled);
              if (isAudioEnabled) {
                currentAudioRef.current?.pause();
                window.speechSynthesis?.cancel();
              }
            }}
            className={`ml-auto flex items-center justify-center w-10 h-10 rounded-xl transition-all ${
              isAudioEnabled 
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50' 
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            title={isAudioEnabled ? "Ovozli o'qishni o'chirish" : "Ovozli o'qishni yoqish"}
          >
            {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
        </div>

        {/* Xabarlar */}
        <div className="relative z-10 flex-1 overflow-y-auto px-8 py-6 space-y-6 custom-scrollbar" style={{ maxHeight: 420 }}>
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm flex-shrink-0 mt-1">
                    <Bot className="w-4.5 h-4.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] px-5 py-3.5 rounded-3xl text-[15px] leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-tr-sm shadow-violet-500/20'
                      : 'bg-white dark:bg-[#1C1F26] text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800 rounded-tl-sm'
                  }`}
                >
                  {msg.loading ? (
                    <div className="flex items-center gap-2 h-6 px-2">
                      <motion.span animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-2 h-2 bg-violet-400 rounded-full" />
                      <motion.span animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 bg-violet-400 rounded-full" />
                      <motion.span animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 bg-violet-400 rounded-full" />
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={chatEndRef} />
        </div>

        {/* Tezkor savollar */}
        <div className="relative z-10 px-8 py-3 flex items-center gap-3 overflow-x-auto scrollbar-hide border-t border-gray-200/30 dark:border-gray-800/50 bg-white/30 dark:bg-black/10 backdrop-blur-md">
          {quickQuestions.map((q, i) => (
            <motion.button
              key={i}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="flex-shrink-0 text-[13px] font-medium px-4 py-2 bg-white dark:bg-gray-800/80 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-gray-700 dark:text-gray-300 hover:text-violet-700 dark:hover:text-violet-300 border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 rounded-2xl transition-colors shadow-sm whitespace-nowrap"
            >
              {q}
            </motion.button>
          ))}
        </div>

        {/* Kiritish maydoni */}
        <div className="relative z-10 p-6 bg-white/50 dark:bg-[#111318]/80 backdrop-blur-xl border-t border-gray-200/50 dark:border-gray-800/50">
          <div className="relative flex items-end gap-3 bg-white dark:bg-[#1C1F26] border border-gray-200 dark:border-gray-700 rounded-[2rem] p-2 pr-2.5 shadow-sm focus-within:ring-4 focus-within:ring-violet-500/10 focus-within:border-violet-500 transition-all duration-300">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="AIni ishga soling..."
              rows={1}
              style={{ resize: 'none' }}
              className="flex-1 bg-transparent text-[15px] text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none leading-relaxed py-3 px-4 max-h-32 custom-scrollbar"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={sendMessage}
              disabled={!input.trim() || chatLoading}
              className="flex-shrink-0 w-12 h-12 rounded-[1.5rem] bg-gradient-to-br from-violet-600 to-indigo-600 disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-gray-700 dark:disabled:to-gray-800 flex items-center justify-center shadow-md disabled:shadow-none transition-all disabled:opacity-70 mb-0.5"
            >
              {chatLoading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Send className="w-5 h-5 text-white ml-1" />
              )}
            </motion.button>
          </div>
          <div className="flex justify-between items-center mt-3 px-4">
             <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium tracking-wide">
              {isDemoMode() ? 'Demo rejim faol' : 'Ma\'lumotlar to\'liq shifrlangan'}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium">
              AI xato qilishi mumkin.
            </p>
          </div>
        </div>
      </motion.div>

      {/* INSIGHTS PANELI (5 ustun) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        className="xl:col-span-5 flex flex-col bg-white/70 dark:bg-[#111318]/70 backdrop-blur-3xl rounded-[2.5rem] border border-white/20 dark:border-white/5 shadow-[0_8px_32px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden relative"
      >
        {/* Glow Effects */}
        <div className="absolute -top-32 -right-32 w-[400px] h-[400px] bg-amber-400/20 dark:bg-orange-600/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 flex items-center gap-4 px-8 py-6 border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
            <Lightbulb className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">
              Aqlli Tavsiyalar
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Biznesingizni o'stirish uchun
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.9 }}
            onClick={loadInsights}
            disabled={insightsLoading}
            className="ml-auto w-10 h-10 rounded-xl bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:border-orange-300 dark:hover:border-orange-500/50 flex items-center justify-center transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4.5 h-4.5 text-orange-500 ${insightsLoading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>

        {/* Insights content */}
        <div className="relative z-10 flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
          {!isAdmin ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
              <div className="w-16 h-16 rounded-[2rem] bg-gray-100 dark:bg-gray-800/50 flex items-center justify-center shadow-inner">
                <Zap className="w-8 h-8 text-gray-400 dark:text-gray-500" />
              </div>
              <p className="text-base font-medium text-gray-500 dark:text-gray-400 max-w-[200px]">
                Tavsiyalar faqat klinika ma'muriyatiga ko'rsatiladi
              </p>
            </div>
          ) : insightsLoading ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((i, index) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="rounded-[1.5rem] bg-white dark:bg-[#1C1F26] border border-gray-100 dark:border-gray-800 p-5 space-y-3 shadow-sm"
                >
                  <div className="h-4 bg-gray-200/50 dark:bg-gray-800 rounded-full w-2/3 animate-pulse" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800/50 rounded-full w-full animate-pulse" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-800/50 rounded-full w-4/5 animate-pulse" />
                </motion.div>
              ))}
            </div>
          ) : insightsError ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 text-center bg-red-50/50 dark:bg-red-900/10 rounded-[2rem] border border-red-100 dark:border-red-900/30 p-8"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h4 className="text-lg font-bold text-red-600 dark:text-red-400">Xatolik yuz berdi</h4>
              <p className="text-sm text-red-500 dark:text-red-300 mb-2">{insightsError}</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={loadInsights}
                className="px-6 py-2.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 font-bold rounded-xl transition-colors text-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" /> Boshqatdan urinish
              </motion.button>
            </motion.div>
          ) : insights.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-4">
              <Sparkles className="w-12 h-12 text-gray-300 dark:text-gray-700" />
              <p className="text-base text-gray-400 dark:text-gray-500 font-medium">
                Siz uchun tavsiyalar tayyor
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={loadInsights}
                className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-orange-500/20 mt-2"
              >
                Tahlilni boshlash
              </motion.button>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {insights.map((insight, i) => {
                const cleanInsight = insight.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
                const colonIdx = cleanInsight.indexOf(':');
                const header = colonIdx > -1 ? cleanInsight.slice(0, colonIdx).trim() : cleanInsight;
                const body = colonIdx > -1 ? cleanInsight.slice(colonIdx + 1).trim() : '';
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                    className="group p-5 rounded-[1.5rem] bg-white dark:bg-[#1C1F26] border border-gray-100 dark:border-gray-800 hover:border-orange-300 dark:hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-black text-sm flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-gray-900 dark:text-white leading-snug">{header}</p>
                        {body && (
                          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{body}</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats mini panel */}
        {isAdmin && (
          <div className="relative z-10 px-8 py-5 border-t border-gray-200/50 dark:border-gray-800/50 bg-gray-50/50 dark:bg-[#1C1F26]/50 backdrop-blur-md">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Oylik Bemorlar', value: stats.totalPatients ?? '—' },
                { label: 'Oy Tushumi', value: stats.monthRevenue ? `${(stats.monthRevenue / 1_000_000).toFixed(1)}M` : '—' },
                { label: 'Yangi Lidlar', value: stats.newLeads ?? '—' },
              ].map(({ label, value }, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + (idx * 0.1) }}
                  key={label} 
                  className="flex flex-col items-center justify-center py-3 bg-white dark:bg-[#111318] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm"
                >
                  <p className="text-lg font-black text-gray-900 dark:text-white tabular-nums tracking-tight">{value}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mt-0.5">{label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default DashboardAiTab;
