import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   Xato to'sig'i.

   React'da bitta komponentdagi xato butun daraxtni yiqitadi — ekran oppoq
   bo'lib qoladi va foydalanuvchi nima bo'lganini bila olmaydi. Klinikada bu
   qabul o'rtasida ishni to'xtatadi.

   Bu to'siq xatoni ushlab, o'qiladigan xabar va ikkita chiqish yo'lini beradi.
   Xato matni ekranda ko'rsatiladi — shunda foydalanuvchi uni aytib bera oladi.
   ───────────────────────────────────────────────────────────────────────────── */

interface Props {
    children: React.ReactNode;
    /** Sahifa almashganda to'siqni tozalash uchun */
    key?: string;
    /** Qaysi bo'limda yuz berdi — xabarda ko'rsatiladi */
    section?: string;
}

interface State {
    error: Error | null;
    info: string;
}

/* Xato to'sig'ini hook bilan yozib bo'lmaydi, shuning uchun klass shart.

   Ilgari bu yerda `React.Component` qo'lda tiplab olinardi, chunki
   loyihada `@types/react` UMUMAN o'rnatilmagan edi (denta7 dan shunday
   kelgan). O'sha yo'qlik butun frontendni tekshiruvsiz qoldirgan edi:
   har bir komponentning proplari `any` bo'lib, `noImplicitAny` yoqilsa
   10 524 xato chiqardi. Turlar o'rnatilgach bu chetlab o'tish keraksiz
   qoldi va u JSX da ishlashga xalaqit berardi. */
export class ErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null, info: '' };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: any) {
        // Konsolga to'liq stek — dasturchi uchun
        console.error('[XClinic] Sahifa xatosi:', error, info.componentStack);
        this.setState({ info: (info.componentStack || '').split('\n').slice(0, 4).join('\n') });
    }

    private reset = () => this.setState({ error: null, info: '' });

    private goHome = () => {
        this.reset();
        window.location.hash = '#/';
    };

    render() {
        const { error, info } = this.state;
        if (!error) return this.props.children;

        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6">
                <div className="max-w-lg w-full bg-surface rounded-xl border border-red-200 dark:border-red-800 overflow-hidden">
                    <div className="flex items-start gap-3 p-5 border-b border-line">
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="font-semibold text-ink">
                                {this.props.section ? `"${this.props.section}" bo'limida xatolik` : 'Sahifada xatolik'}
                            </h2>
                            <p className="text-sm text-muted mt-0.5">
                                Ma'lumotlaringiz saqlanib qoldi — hech narsa yo'qolmadi.
                            </p>
                        </div>
                    </div>

                    <div className="p-5 space-y-3">
                        <div className="bg-canvas border border-line rounded-lg p-3 overflow-x-auto">
                            <p className="font-mono text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
                                {error.message || String(error)}
                            </p>
                            {info && (
                                <p className="font-mono text-[11px] text-faint mt-2 whitespace-pre-wrap">
                                    {info}
                                </p>
                            )}
                        </div>
                        <p className="text-xs text-muted">
                            Xato takrorlansa, shu matnni ko'chirib bering.
                        </p>
                    </div>

                    <div className="p-5 border-t border-line flex gap-3">
                        <button onClick={this.reset}
                            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700">
                            <RefreshCw className="w-4 h-4" /> Qayta urinish
                        </button>
                        <button onClick={this.goHome}
                            className="flex items-center gap-2 px-4 py-2 border border-line rounded-lg text-sm font-medium text-muted hover:bg-elevated">
                            <Home className="w-4 h-4" /> Bosh sahifa
                        </button>
                        <button onClick={() => window.location.reload()}
                            className="ml-auto px-4 py-2 text-sm font-medium text-muted hover:text-muted">
                            Sahifani yangilash
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
