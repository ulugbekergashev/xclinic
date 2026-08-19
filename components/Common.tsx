
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
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <input
        className={`flex h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-white ${props.type === 'date' ? 'cursor-pointer' : ''} ${className} ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
        {...props}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {!error && helperText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
    </div>
  );
};

// --- Select ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, children, className = '', ...props }) => (
  <div className="w-full">
    {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
    <div className="relative">
      <select
        className={`flex h-10 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-white dark:bg-gray-800 appearance-none ${className}`}
        {...props}
      >
        {options ? options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        )) : children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
        <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
      </div>
    </div>
  </div>
);

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 focus:outline-none">
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
}

export const Toast: React.FC<ToastMessage & { onClose: (id: string) => void }> = ({ id, type, message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [id, onClose]);

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
      <button onClick={() => onClose(id)} className="text-gray-400 hover:text-gray-600">
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
