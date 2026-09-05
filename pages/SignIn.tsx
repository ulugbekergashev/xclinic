import React, { useState } from 'react';
import { Logo } from '../components/Logo';
import { Button, Input, Card } from '../components/Common';
import { UserRole } from '../types';
import { AlertCircle, Lock, User, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';
import * as auth from '../services/authStore';
import { IS_DEMO_BUILD, DEMO_USERNAME, DEMO_PASSWORD } from '../services/demoBuild';
import { useLanguage } from '../context/LanguageContext';

interface SignInProps {
  onLogin: (role: UserRole, name: string, clinicId?: string, doctorId?: string,
            receptionistId?: string, mustChangePassword?: boolean,
            /** So'ralgan manzilda qolish — demo avtomatik kirishi uchun.
             *  Izohi `enterDemo` da. */
            keepRoute?: boolean) => void;
}

/* Demo nusxada avtomatik kirish BIR MARTA bajariladi — pastdagi
   izohga qarang. */
let autoEntered = false;

export const SignIn: React.FC<SignInProps> = ({ onLogin }) => {
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /* Demo sessiyasini ochish. Alohida funksiya, chunki ikki joydan
     chaqiriladi: forma orqali (login+parol yozilganda) va demo build'dagi
     «Demoga kirish» tugmasidan. */
  /* `keepRoute` — so'ralgan sahifada QOLISH.
     Avtomatik kirishda foydalanuvchi hech narsa yozmagan: u shunchaki
     `#/inventory` kabi havolani ochgan. `onLogin` esa har doim rolning
     bosh sahifasiga o'tkazardi — ya'ni havola tashlab yuborilardi va
     odam Boshqaruv panelida paydo bo'lardi. Tashqaridan bu «sahifa
     ochilmadi» bo'lib ko'rinadi.

     Qo'lda kirishda (login+parol yozilganda) eski xatti-harakat qoladi:
     u yerda odam ATAYLAB kirish sahifasida turgan. */
  const enterDemo = (keepRoute = false) => {
    auth.setSession({
      role: UserRole.CLINIC_ADMIN,
      name: 'Demo Admin',
      clinicId: 'demo-clinic-1',
      username: DEMO_USERNAME,
      token: 'demo-token',
      isDemo: true,
    });
    onLogin(UserRole.CLINIC_ADMIN, 'Demo Admin', 'demo-clinic-1', undefined, undefined, undefined, keepRoute);
    setIsLoading(false);
  };

  /* ── DEMO: KIRISH SAHIFASI KO'RSATILMAYDI ────────────────────────────
     Namoyish nusxasida bitta hisob bor va boshqasi bo'lishi ham mumkin
     emas: backend yo'q, ya'ni haqiqiy login tekshiriladigan joy yo'q.
     Shunday ekan kirish formasi foydalanuvchini ortiqcha qadamga
     majburlaydi va yozilgan har qanday login «bu namoyish nusxasi»
     degan xato bilan qaytadi.

     Shuning uchun demo havolasini ochgan odam to'g'ridan-to'g'ri
     ichkariga tushadi.

     `autoEntered` MODUL darajasida: chiqish tugmasi bosilganda
     komponent qayta chiziladi va shart yana bajarilardi — foydalanuvchi
     tizimdan chiqa olmay qolardi. Modul o'zgaruvchisi sahifa
     yangilangunga qadar saqlanadi, ya'ni chiqqandan keyin sahifa
     ko'rinadi, sahifa yangilansa yana avtomatik kiradi. */
  React.useEffect(() => {
    if (!IS_DEMO_BUILD || autoEntered) return;
    autoEntered = true;
    enterDemo(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      /* Demo hisobiga kirish IKKI holatda ochiq:
           • localhost — ishlab chiqish va sinov (avvaldan shunday edi);
           • `VITE_DEMO_BUILD=true` bilan qurilgan bundle — Vercel'dagi
             ommaviy demo, u yerda backend UMUMAN yo'q.
         Klinikaga tarqatiladigan build ikkalasiga ham tushmaydi, ya'ni
         demo hisobi u yerda avvalgidek yopiq qoladi. */
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      if ((isLocalhost || IS_DEMO_BUILD) && username === DEMO_USERNAME && password === DEMO_PASSWORD) {
        enterDemo();
        return;
      }

      /* Demo bundle'da backend YO'Q — boshqa login bilan tarmoqqa chiqish
         ma'nosiz va foydalanuvchiga «tizim xatosi» deb ko'rinadi. Shuning
         uchun so'rov yubormasdan, nima qilish kerakligini aytamiz. */
      if (IS_DEMO_BUILD) {
        setError('Bu — namoyish nusxasi. Pastdagi «Demoga kirish» tugmasini bosing.');
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

        /* Token DISKKA TUSHMAYDI (S1.3): `setSession` uni xotiraga oladi,
           qolgan ma'lumot `sessionStorage` da qoladi. Sessiyani sahifa
           yangilangandan keyin tiklash `httpOnly` cookie orqali bo'ladi. */
        auth.setSession(authData);

        onLogin(response.role as UserRole, response.name, response.clinicId, response.doctorId,
                response.receptionistId, response.mustChangePassword === true);
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
          <Logo className="mx-auto w-16 h-16 shadow-lg rounded-2xl mb-4" />
          {/* Sarlavhadagi bilan bir xil ikki rangli yozuv — brend ikki
              ekranda ikki xil ko'rinmasligi uchun. Nom tarjima qilinmaydi. */}
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            X<span className="text-primary dark:text-primary-400">Clinic</span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">{t('auth.subtitle')}</p>
        </div>

        <Card className="p-8 shadow-xl border-t-4 border-t-primary-600">
          {/* Demo nusxada login/parol maydonlari CHIZILMAYDI: ular
              ishlamaydi (server yo'q) va faqat chalkashtiradi. */}
          {!IS_DEMO_BUILD && (
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
                  name="username"
                  autoComplete="username"
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
                  name="password"
                  autoComplete="current-password"
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
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
            {/* NAMOYISH NUSXASI. Faqat `VITE_DEMO_BUILD=true` bilan qurilgan
                bundle'da ko'rinadi — klinikaning o'rnatmasida bu blok
                umuman chizilmaydi.

                Nima uchun tugma: demo linkini ochgan odam login va parolni
                bilmaydi va bilishi ham shart emas. Yuqoridagi izohda
                ogohlantirilgan xavf (demo hisobiga TASODIFAN tushib qolish)
                bu yerda yo'q — bu bundle'da boshqa ma'lumot yo'q, demo
                yagona mumkin bo'lgan holat. */}
            {IS_DEMO_BUILD && (
              <div className="mb-4">
                <button
                  type="button"
                  /* Bosish hodisasi `keepRoute` ga tushib qolmasin —
                     tugmadan kirilganda rolning bosh sahifasi ochiladi. */
                  onClick={() => enterDemo()}
                  className="w-full py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-base font-medium shadow-lg shadow-primary-500/30 transition-all"
                >
                  Demoga kirish
                </button>
                <p className="text-xs text-gray-400 mt-2">
                  Namoyish ma'lumotlari brauzeringizda saqlanadi. Bemor qo'shsangiz ham,
                  o'chirsangiz ham — faqat sizda ko'rinadi.
                </p>
              </div>
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
