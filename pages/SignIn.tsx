import React, { useState } from 'react';
import { Button, Input, Card } from '../components/Common';
import { UserRole } from '../types';
import { AlertCircle, Lock, User, Eye, EyeOff } from 'lucide-react';
import { api, API_BASE_URL } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

interface SignInProps {
  onLogin: (role: UserRole, name: string, clinicId?: string, doctorId?: string) => void;
}

export const SignIn: React.FC<SignInProps> = ({ onLogin }) => {
  const { t } = useLanguage();
  /* Shu bazadagi loginlar — kirish sahifasidagi eslatma.
     Parol EMAS, faqat foydalanuvchi nomlari. Server ularni faqat shu
     kompyuterdan beradi. */
  const [logins, setLogins] = useState<{ username: string; role: string; name: string }[]>([]);

  React.useEffect(() => {
    const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!local) return;
    fetch(`${API_BASE_URL}/api/local-logins`)
      .then(r => (r.ok ? r.json() : []))
      .then(list => setLogins(Array.isArray(list) ? list : []))
      .catch(() => setLogins([]));
  }, []);

  /* Nusxa olish. 127.0.0.1 xavfsiz kontekst hisoblanadi, shuning uchun
     clipboard API ishlaydi; ishlamasa eski usulga tushamiz. */
  const [copied, setCopied] = useState('');
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* qo'lda tanlansin */ }
      document.body.removeChild(ta);
    }
    setCopied(text);
    setTimeout(() => setCopied(c => (c === text ? '' : c)), 1500);
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Check if on localhost
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      // Demo mode credentials (localhost only)
      // Demo mode credentials (localhost only)
      if (isLocalhost && username === 'demoklinikaadmin' && password === 'demoklinikaparol') {
        const demoAuthData = {
          role: UserRole.CLINIC_ADMIN,
          name: 'Demo Admin',
          clinicId: 'demo-clinic-1',
          username: username,
          token: 'demo-token',
          isDemo: true,
        };

        // Har doim eslab qolinadi
        localStorage.setItem('xclinic_auth', JSON.stringify(demoAuthData));

        onLogin(UserRole.CLINIC_ADMIN, 'Demo Admin', 'demo-clinic-1');
        setIsLoading(false);
        return;
      }

      // Regular backend authentication
      const response = await api.auth.login(username, password);

      if (response.success && response.role && response.name) {
        const authData = {
          role: response.role,
          name: response.name,
          clinicId: response.clinicId,
          doctorId: response.doctorId,
          receptionistId: response.receptionistId,
          technicianId: response.technicianId,
          username: username,
          token: response.token
        };

        // Har doim eslab qolinadi (localStorage)
        localStorage.setItem('xclinic_auth', JSON.stringify(authData));

        onLogin(response.role as UserRole, response.name, response.clinicId, response.doctorId);
      } else {
        setError(response.error || t('auth.errorInvalid'));
      }
    } catch (err) {
      setError(t('auth.errorSystem'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white shadow-lg mb-4 transform rotate-3">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">{t('auth.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{t('auth.subtitle')}</p>
        </div>

        <Card className="p-8 shadow-xl border-t-4 border-t-primary-600">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-600 dark:text-red-400 text-sm animate-fade-in">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('auth.login')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  className="pl-10 block w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  placeholder={t('auth.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('auth.password')}</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="pl-10 pr-10 block w-full rounded-lg border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full py-2.5 text-base shadow-lg shadow-primary-500/30 hover:shadow-primary-500/40 transition-all"
              disabled={isLoading}
            >
              {isLoading ? t('auth.checking') : t('auth.signIn')}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
            {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <>
                {/* Shu bazadagi HAQIQIY loginlar. Parol ko'rsatilmaydi —
                    uni faqat klinika biladi. Har qiymatni NUSXA olish yoki
                    bosib maydonga qo'yish mumkin. */}
                {logins.length > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-left">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                      Shu kompyuterdagi loginlar
                    </p>
                    <div className="space-y-1.5">
                      {logins.map(l => (
                        <div key={l.username} className="flex items-center gap-2">
                          {/* Matn TANLANADI: qo'lda ham nusxa olish mumkin */}
                          <code className="px-1.5 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-800 dark:text-gray-100 select-all">
                            {l.username}
                          </code>
                          <span className="text-[11px] text-gray-400">{l.role}</span>
                          <button type="button" onClick={() => copy(l.username)}
                            title="Nusxa olish"
                            className="ml-auto px-1.5 py-0.5 rounded text-[11px] text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                            {copied === l.username ? "✓ nusxa olindi" : 'nusxa'}
                          </button>
                          <button type="button" onClick={() => setUsername(l.username)}
                            title="Login maydoniga qo'yish"
                            className="px-1.5 py-0.5 rounded text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30">
                            qo'yish
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">
                      Parol ko'rsatilmaydi. Unutgan bo'lsangiz — uni tiklash kerak.
                    </p>
                  </div>
                )}

                {/* Demo: qiymatlar NUSXA olish uchun ochiq turadi */}
                <div className="mb-4 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg text-left">
                  <p className="text-xs text-primary-700 dark:text-primary-300 font-medium mb-2">
                    🧪 Demo rejimi
                  </p>

                  {([
                    ['Login', 'demoklinikaadmin'],
                    ['Parol', 'demoklinikaparol'],
                  ] as const).map(([label, value]) => (
                    <div key={value} className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] text-primary-500 dark:text-primary-400 w-10">{label}</span>
                      <code className="px-1.5 py-0.5 rounded bg-white dark:bg-primary-900/40 border border-primary-200 dark:border-primary-800 text-xs text-primary-800 dark:text-primary-200 select-all">
                        {value}
                      </code>
                      <button type="button" onClick={() => copy(value)}
                        title="Nusxa olish"
                        className="ml-auto px-1.5 py-0.5 rounded text-[11px] text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/40">
                        {copied === value ? "✓ nusxa olindi" : 'nusxa'}
                      </button>
                    </div>
                  ))}

                  <button type="button"
                    onClick={() => { setUsername('demoklinikaadmin'); setPassword('demoklinikaparol'); }}
                    className="mt-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-primary-900/40 border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 hover:border-primary-500">
                    Ikkalasini maydonlarga qo'yish
                  </button>

                  <p className="text-[11px] text-primary-500 dark:text-primary-400 mt-2">
                    Demoda ma'lumotlar soxta va yangi ekranlar bo'sh ko'rinadi.
                    Haqiqiy ish uchun yuqoridagi login bilan kiring.
                  </p>
                </div>
              </>
            )}
            <p className="text-xs text-gray-400">
              {t('auth.support')} <br />
              <span className="font-medium text-primary-600">+998 90 824 29 92</span>
            </p>
          </div>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-8">
          &copy; {new Date().getFullYear()} XClinic. {t('auth.copyright')}
        </p>
      </div>
    </div>
  );
};
