
import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

// --- Buttons ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";

  const variants = {
    primary: "bg-primary text-white hover:bg-primary-700 focus:ring-primary-500 shadow-sm",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-gray-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700",
    danger: "bg-danger text-white hover:bg-danger-700 focus:ring-danger-500",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 py-2 text-sm",
    lg: "h-12 px-6 text-base",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

// --- Card ---
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
    {children}
  </div>
);

// --- Badge ---
const STATUS_TRANSLATIONS: Record<string, string> = {
  'active': 'Faol',
  'archived': 'Arxiv',
  'paid': 'To\'landi',
  'pending': 'Kutilmoqda',
  'confirmed': 'Tasdiqlandi',
  'completed': 'Yakunlandi',
  'cancelled': 'Bekor qilindi',
  'no-show': 'Kelmadi',
  'checked-in': 'Keldi',
  'overdue': 'Qarzdor',
  'healthy': 'Sog\'lom',
  'cavity': 'Karies',
  'filled': 'Plomba',
  'missing': 'Yo\'q',
  'crown': 'Qoplama'
};

export const Badge: React.FC<{ status?: string }> = ({ status = 'pending' }) => {
  let colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  const lowerStatus = (status || 'pending').toLowerCase();

  switch (lowerStatus) {
    case 'active':
    case 'paid':
    case 'confirmed':
    case 'completed':
    case 'healthy':
      colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      break;
    case 'pending':
    case 'filled':
      colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      break;
    case 'cancelled':
    case 'overdue':
    case 'cavity':
    case 'missing':
    case 'archived':
      colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      break;
    case 'no-show':
      colorClass = 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
      break;
    case 'checked-in':
      colorClass = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
      break;
    case 'crown':
      colorClass = 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      break;
  }

  const label = STATUS_TRANSLATIONS[lowerStatus] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
};

// --- Input ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, helperText, className = '', containerClassName = 'w-full', ...props }) => {
  /* YORLIQ MAYDONGA BOG'LANADI (S4.6).

     Bu yerda ilgari `<label>` da `htmlFor`, `<input>` da esa `id` YO'Q edi.
     Ko'z bilan qaraganda hammasi joyida ko'rinadi, lekin:
       • ekran o'quvchi maydonni «edit text» deb o'qiydi, nomsiz;
       • yorliqni bosganda fokus maydonga o'tmaydi;
       • avtomatik sinov maydonni yorliq bo'yicha topa olmaydi — brauzer
         E2E sinovi aynan shu yerda to'xtab qolgan edi.

     `useId` — React ning o'zi beradigan noyob id; qo'lda hisoblash yoki
     tasodifiy son kerak emas va SSR bilan ham mos. Tashqaridan `id`
     berilgan bo'lsa, u ustun turadi. */
  const autoId = React.useId();
  const inputId = props.id || autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const helpId = !error && helperText ? `${inputId}-help` : undefined;

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    props.onClick?.(e);
  };

  // number maydonlarda sichqoncha g'ildiragi qiymatni sezdirmasdan o'zgartirmasligi uchun
  // (masalan 150000 -> 149999) fokusni olib tashlaymiz
  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (props.type === 'number') {
      e.currentTarget.blur();
    }
    props.onWheel?.(e);
  };

  return (
    <div className={`${containerClassName} relative z-10`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        className={`flex h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-white ${props.type === 'date' ? 'cursor-pointer' : ''} ${className} ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        {...props}
        id={inputId}
        /* Xato matni maydonga bog'lanadi — ekran o'quvchi uni maydon
           nomidan keyin darhol o'qiydi, sahifaning boshqa joyida emas. */
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId || helpId}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      {error && <p id={errorId} className="mt-1 text-xs text-red-500">{error}</p>}
      {!error && helperText && <p id={helpId} className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
    </div>
  );
};

// --- Select ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /* `disabled` — variant ko'rinadi, lekin tanlanmaydi. Masalan
     «Balansdan to'lash»: bemorning balansi bo'sh bo'lsa u ko'rinib
     tursin (nima uchun yo'qligi tushunarli bo'lsin), lekin tanlanmasin.

     Chaqiruvchilar buni ALLAQACHON uzatardi, lekin e'londa ham,
     renderda ham yo'q edi — ya'ni jimgina tashlab yuborilardi va
     variant baribir tanlanardi. */
  options?: { value: string; label: string; disabled?: boolean }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, children, className = '', ...props }) => {
  // Yorliq maydonga bog'lanadi — `Input` dagi bilan bir xil sabab (S4.6)
  const autoId = React.useId();
  const selectId = props.id || autoId;
  return (
  <div className="w-full">
    {label && (
      <label htmlFor={selectId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
    )}
    <div className="relative">
      <select
        className={`flex h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-white dark:bg-gray-800 appearance-none ${className}`}
        {...props}
        id={selectId}
      >
        {options ? options.map(opt => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
        )) : children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
        <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
      </div>
    </div>
  </div>
  );
};

// --- SearchableSelect ---
interface SearchableSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ label, value, onChange, options, placeholder = 'Tanlang...', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`w-full relative ${className}`} ref={wrapperRef}>
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <div
        className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-white dark:bg-gray-800"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? 'truncate' : 'text-gray-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 flex flex-col pt-2 mb-2">
          <div className="px-2 pb-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:text-white"
              placeholder="Qidirish..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">Topilmadi</div>
            ) : (
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  className={`px-3 py-2 text-sm cursor-pointer rounded-lg truncate ${opt.value === value ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200 font-medium' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Modal ---
export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ isOpen, onClose, title, children, className = 'max-w-lg' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className={`relative w-full ${className} transform rounded-2xl bg-white dark:bg-gray-900 shadow-2xl transition-all overflow-hidden max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 p-4 sm:px-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button aria-label="Yopish" onClick={onClose} className="text-gray-400 hover:text-gray-500 focus:outline-none">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 sm:px-6 py-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Toast Notifications ---
export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  /** «Bekor qilish» kabi amal (S3.6). Bosilganda toast yopiladi. */
  action?: { label: string; run: () => void };
  /** Ko'rinib turish vaqti. Berilmasa: amalli toast 8 s, oddiysi 4 s. */
  durationMs?: number;
}

export const Toast: React.FC<ToastMessage & { onClose: (id: string) => void }> = ({ id, type, message, action, durationMs, onClose }) => {
  /* «Bekor qilish» li toast UZOQROQ turadi (S3.6): o'chirishni qaytarish
     uchun 4 soniya kam — foydalanuvchi xabarni o'qib, qaror qilishi kerak. */
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, durationMs ?? (action ? 8000 : 4000));
    return () => clearTimeout(timer);
  }, [id, onClose, action, durationMs]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <AlertCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-primary-500" />
  };

  const styles = {
    success: 'border-green-100 bg-green-50 dark:bg-green-900/20 dark:border-green-900',
    error: 'border-red-100 bg-red-50 dark:bg-red-900/20 dark:border-red-900',
    info: 'border-primary-100 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-900'
  };

  return (
    <div className={`flex items-center gap-3 p-4 rounded-lg border shadow-lg transform transition-all animate-fade-in mb-3 w-80 ${styles[type]}`}>
      {icons[type]}
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{message}</p>
      {action && (
        <button
          onClick={() => { action.run(); onClose(id); }}
          className="text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline shrink-0"
        >
          {action.label}
        </button>
      )}
      <button onClick={() => onClose(id)} className="text-gray-400 hover:text-gray-600" aria-label="Yopish">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<{ toasts: ToastMessage[], removeToast: (id: string) => void }> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onClose={removeToast} />
      ))}
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   Yuklanish va bo'sh holat.

   MUAMMO. Ekranlar ma'lumot kelguncha bo'sh turardi yoki "Yuklanmoqda..."
   degan bitta satr ko'rsatardi. Ikkalasi ham yomon: birinchisida foydalanuvchi
   dastur qotib qoldi deb o'ylaydi, ikkinchisida ma'lumot kelganda sahifa
   SAKRAYDI — matn yo'qolib, o'rniga ro'yxat chiqadi.

   Skelet ikkalasini ham hal qiladi: joy oldindan band qilinadi, harakat esa
   "ishlayapti" degan signal beradi.
   ───────────────────────────────────────────────────────────────────────────── */

/** Bitta kulrang chiziq. `h` — balandlik sinfi (Tailwind). */
export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />
);

/**
 * Ro'yxat skeleti — kelayotgan qatorlarning o'rnini egallaydi.
 * `rows` haqiqiy ro'yxatga yaqin bo'lsin, aks holda baribir sakraydi.
 */
export const SkeletonList: React.FC<{ rows?: number; className?: string }> = ({ rows = 5, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-busy="true" aria-live="polite">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            {/* Turli uzunlik — bir xil chiziqlar jadval kabi ko'rinadi */}
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * Bo'sh holat — ikona, sarlavha va (ixtiyoriy) amal.
 *
 * `hint` MUHIM: "hech narsa yo'q" degan xabar foydalanuvchini nima qilishni
 * bilmagan holda qoldiradi. Nima qilish kerakligini aytish kerak.
 */
export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, hint, action, className = '' }) => (
  <div className={`text-center py-14 px-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 ${className}`}>
    {icon && <div className="flex justify-center mb-3 text-gray-300 dark:text-gray-600">{icon}</div>}
    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</p>
    {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 max-w-sm mx-auto">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
