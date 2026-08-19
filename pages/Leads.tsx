import React, { useState } from 'react';
import {
    Search, Plus, MoreHorizontal, MessageSquare, Phone, Calendar as CalendarIcon,
    Facebook, RefreshCw, CheckCircle, X, ExternalLink, Trash2, Filter,
    ChevronDown, UserPlus, ArrowRight, Settings, Activity, Shield, Eye,
    Building2, MapPin
} from 'lucide-react';
import { Lead, Doctor, Appointment, ServiceCategory, Service, Clinic } from '../types';
import { api, isDemoMode } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

interface LeadsProps {
    leads: Lead[];
    doctors: Doctor[];
    categories: ServiceCategory[];
    services: Service[];
    currentClinic?: Clinic;
    onAddLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
    onUpdateLead: (id: string, data: Partial<Lead>) => Promise<void>;
    onDeleteLead: (id: string) => Promise<void>;
    onConvertLead: (leadId: string, appointmentData: Partial<Appointment>) => Promise<void>;
}

const STAGES = [
    { id: 'New', color: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-400' },
    { id: 'Contacted', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    { id: 'Thinking', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400' },
    { id: 'Booked', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
    { id: 'Cancelled', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' }
];

const parseNotesField = (notes: string | null | undefined, key: string): string | null => {
    if (!notes) return null;
    const line = notes.split('\n').find(l => l.startsWith(key + ':'));
    return line ? line.slice(key.length + 1).trim() : null;
};

const parseQAPairs = (notes: string | null | undefined): { q: string; a: string }[] => {
    if (!notes) return [];
    const marker = notes.indexOf('Savollar va Javoblar:');
    const section = marker >= 0 ? notes.slice(marker + 'Savollar va Javoblar:'.length) : notes;
    return section.split('\n')
        .map(l => l.trim())
        .filter(l => l.includes(':') && !l.startsWith('FB Lead'))
        .map(l => {
            const idx = l.indexOf(':');
            return { q: l.slice(0, idx).trim(), a: l.slice(idx + 1).trim() };
        })
        .filter(p => p.q && p.a);
};

const renderNotes = (notes: string | null | undefined, t: any) => {
    if (!notes) return <span className="text-gray-400 dark:text-gray-500">Izohlar yo'q</span>;

    // Check if it's formatted Q&A
    if (notes.includes('Savollar va Javoblar:') || notes.includes('Savol-Javoblar:')) {
        const lines = notes.split('\n');
        const renderedQuestions: React.ReactNode[] = [];
        let isQASection = false;

        lines.forEach((line, idx) => {
            if (line.trim().startsWith('Savollar va Javoblar:') || line.trim().startsWith('Savol-Javoblar:')) {
                isQASection = true;
                return;
            }
            if (isQASection && line.includes(':')) {
                const parts = line.split(':');
                const question = parts[0].trim();
                const answer = parts.slice(1).join(':').trim();
                if (question && answer) {
                    renderedQuestions.push(
                        <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-750 rounded-lg border border-gray-100 dark:border-gray-700/50">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{question}</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{answer}</p>
                        </div>
                    );
                }
            } else if (line.trim()) {
                renderedQuestions.push(
                    <p key={idx} className="text-xs text-gray-500 dark:text-gray-400 mt-1">{line}</p>
                );
            }
        });

        if (renderedQuestions.length > 0) {
            return <div className="space-y-2.5">{renderedQuestions}</div>;
        }
    }

    // Default plain text formatting
    return (
        <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-800 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
            {notes}
        </div>
    );
};

export const Leads: React.FC<LeadsProps> = ({
    leads,
    doctors,
    categories,
    services,
    currentClinic,
    onAddLead,
    onUpdateLead,
    onDeleteLead,
    onConvertLead
}) => {
    const { t } = useLanguage();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
    const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
    const [isFBLoading, setIsFBLoading] = useState(false);
    const [facebookPages, setFacebookPages] = useState<any[]>([]);
    const [isFBPageModalOpen, setIsFBPageModalOpen] = useState(false);
    const [selectedLeadForDetail, setSelectedLeadForDetail] = useState<Lead | null>(null);

    // Form State
    const [formData, setFormData] = useState<Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'clinicId'>>({
        name: '',
        phone: '+998',
        service: '',
        source: '',
        status: 'New',
        notes: ''
    });

    // Appt Data for Conversion
    const [apptData, setApptData] = useState({
        doctorId: '',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        type: t('leads.convertModal.procedure'),
        categoryId: '',
        duration: 60,
        notes: ''
    });

    const filteredLeads = leads.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone.includes(searchTerm)
    );

    const handleAddSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onAddLead({
            name: formData.name,
            phone: formData.phone,
            service: formData.service || undefined,
            source: formData.source || undefined,
            notes: formData.notes || undefined,
            status: 'New',
            clinicId: '' // This gets overwritten by the parent
        });
        setIsAddModalOpen(false);
        setFormData({ name: '', phone: '+998', service: '', source: '', notes: '' });
    };

    const moveLead = (leadId: string, newStatus: string) => {
        onUpdateLead(leadId, { status: newStatus as any });
    };

    const handleConvertClick = (leadId: string) => {
        setConvertingLeadId(leadId);
        setApptData(prev => ({
            ...prev,
            doctorId: doctors.length > 0 ? doctors[0].id : '',
            categoryId: categories.length > 0 ? categories[0].id : '',
        }));
        setIsConvertModalOpen(true);
    };

    const handleConvertSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!convertingLeadId) return;
        if (!apptData.doctorId) {
            alert(t('leads.alerts.selectDoctor'));
            return;
        }

        await onConvertLead(convertingLeadId, {
            doctorId: apptData.doctorId,
            date: apptData.date,
            time: apptData.time,
            type: apptData.type,
            duration: Number(apptData.duration),
        });

        setIsConvertModalOpen(false);
        setConvertingLeadId(null);
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedLeadId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);

        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '0.4';
        }
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedLeadId(null);
        if (e.target instanceof HTMLElement) {
            e.target.style.opacity = '1';
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e: React.DragEvent, statusId: string) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || draggedLeadId;

        if (id) {
            if (statusId === 'Booked') {
                handleConvertClick(id);
            } else {
                moveLead(id, statusId);
            }
        }
        setDraggedLeadId(null);
    };

    // Handle Facebook Redirect success (for popup flow)
    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'FB_CONNECTED') {
                handleFetchFBPages();
            }
        };

        window.addEventListener('message', handleMessage);

        // Also check if this instance IS a popup
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connected') === 'true' && window.opener) {
            // Give user time to see the success message
            setTimeout(() => {
                window.opener.postMessage({ type: 'FB_CONNECTED' }, '*');
                window.close();
            }, 2000);
        }

        return () => window.removeEventListener('message', handleMessage);
    }, [currentClinic?.id]);

    // Handle initial 'connected' param if page was reloaded manually (fallback)
    React.useEffect(() => {
        if (!currentClinic?.id) return;
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connected') === 'true' && !window.opener) {
            handleFetchFBPages();
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [currentClinic?.id]);

    const handleFetchFBPages = async () => {
        if (!currentClinic?.id) return;
        setIsFBLoading(true);
        try {
            const pages = await api.facebook.getPages(currentClinic.id);
            setFacebookPages(pages);
            setIsFBPageModalOpen(true);
        } catch (error: any) {
            console.error('Failed to fetch FB pages:', error);
            alert(`${t('leads.alerts.fbFetchError')}: ${error.message || ''}`);
        } finally {
            setIsFBLoading(false);
        }
    };

    const handleConnectFB = async () => {
        if (!currentClinic?.id) {
            alert(t('leads.alerts.fbConfigError'));
            return;
        }

        // In demo mode, skip real Facebook OAuth and show mock page selection
        if (isDemoMode()) {
            setIsFBLoading(true);
            try {
                const pages = await api.facebook.getPages(currentClinic.id);
                setFacebookPages(pages);
                setIsFBPageModalOpen(true);
            } catch (error: any) {
                console.error('FB Demo pages error:', error);
                alert(`${t('leads.alerts.fbFetchError')}: ${error.message || ''}`);
            } finally {
                setIsFBLoading(false);
            }
            return;
        }
        
        setIsFBLoading(true);
        try {
            const { url } = await api.facebook.getAuthUrl(currentClinic.id);
            const width = 600;
            const height = 700;
            const left = Math.max(0, (window.screen.width / 2) - (width / 2));
            const top = Math.max(0, (window.screen.height / 2) - (height / 2));
            window.open(
                url,
                'FacebookLogin',
                `width=700,height=850,left=${left},top=${top},status=yes,scrollbars=yes`
            );
        } catch (error: any) {
            console.error('FB Connect error:', error);
            alert(`${t('leads.alerts.fbConnectError')}: ${error.message || ''}`);
        } finally {
            setIsFBLoading(false);
        }
    };


    const handleSelectFBPage = async (page: any) => {
        if (!currentClinic?.id) return;
        try {
            await api.facebook.selectPage({
                clinicId: currentClinic.id,
                pageId: page.id,
                pageAccessToken: page.access_token,
                pageName: page.name
            });
            setIsFBPageModalOpen(false);
            alert(t('leads.alerts.fbSuccess'));
            window.location.reload();
        } catch (error) {
            console.error('Failed to select FB page:', error);
            alert(t('leads.alerts.fbFetchError'));
        }
    };

    // For popup flow success/auth UI
    const urlParams = new URLSearchParams(window.location.search);
    const isPopupSuccess = urlParams.get('connected') === 'true' && !!window.opener;

    if (isPopupSuccess) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 p-6 text-center">
                <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6 animate-bounce">
                    <CheckCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('leads.success.connectedTitle')}</h1>
                <p className="text-gray-500 dark:text-gray-400">{t('leads.success.connectedDesc')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm shrink-0">
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                            {t('leads.title').split(' ')[0]} <span className="text-primary dark:text-primary-400">{t('leads.title').split(' ').slice(1).join(' ')}</span>
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">{t('leads.subtitle')}</p>
                    </div>

                    {/* Facebook Integration Quick Status */}
                    <div className="hidden lg:flex items-center gap-3 pl-4 border-l border-gray-100 dark:border-gray-700">
                        {currentClinic?.facebookPageId ? (
                            <div className="flex items-center gap-2 group">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-lg text-xs font-semibold border border-primary-100/50 dark:border-primary-800/50 transition-all">
                                    <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
                                    <Facebook className="w-3.5 h-3.5 fill-current" />
                                    <span>{currentClinic.facebookPageName}</span>
                                </div>
                                <button
                                    onClick={() => handleFetchFBPages()}
                                    className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                    title={t('leads.tooltips.changePage')}
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={async () => {
                                        if (window.confirm(t('leads.alerts.fbDisconnectConfirm'))) {
                                            await api.facebook.disconnect(currentClinic!.id);
                                            window.location.reload();
                                        }
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                    title={t('leads.tooltips.disconnect')}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleConnectFB}
                                disabled={isFBLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] hover:bg-primary-600 text-white rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 active:scale-95"
                            >
                                {isFBLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4 fill-current" />}
                                <span>{t('leads.connectFb')}</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={t('leads.search')}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all dark:text-white"
                        />
                    </div>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-600 active:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">{t('leads.newLead')}</span>
                    </button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto pb-4">
                <div className="flex gap-4 min-w-max h-full">
                    {STAGES.map(stage => {
                        const columnLeads = filteredLeads.filter(l => l.status === stage.id);

                        const isDragOverTarget = draggedLeadId !== null;

                        return (
                            <div
                                key={stage.id}
                                className="w-80 flex flex-col bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-200/50 dark:border-gray-700/50"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage.id)}
                            >
                                <div className={`p-3 border-b border-gray-200/50 dark:border-gray-700/50 rounded-t-xl transition-colors ${isDragOverTarget ? 'bg-gray-100 dark:bg-gray-700/50' : ''}`}>
                                    <div className="flex items-center justify-between pointer-events-none">
                                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${stage.color}`}>
                                            {t(`leads.stages.${stage.id.toLowerCase()}`)}
                                        </span>
                                        <span className="text-xs font-medium text-gray-500 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full shadow-sm border border-gray-100 dark:border-gray-700">
                                            {columnLeads.length}
                                        </span>
                                    </div>
                                </div>

                                <div className={`flex-1 p-3 space-y-3 overflow-y-auto min-h-[500px] transition-colors ${isDragOverTarget ? 'bg-gray-100/30 dark:bg-gray-800/50 ring-2 ring-inset ring-primary-500/20 rounded-b-xl' : ''}`}>
                                    {columnLeads.map(lead => (
                                        <div
                                            key={lead.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead.id)}
                                            onDragEnd={handleDragEnd}
                                            className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow group relative cursor-grab active:cursor-grabbing"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 
                                                    onClick={() => setSelectedLeadForDetail(lead)}
                                                    className="font-bold text-gray-900 dark:text-white text-sm hover:text-primary-600 transition-colors cursor-pointer"
                                                >
                                                    {lead.name}
                                                </h4>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => setSelectedLeadForDetail(lead)}
                                                        className="text-gray-400 hover:text-primary-500 transition-all p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                                        title={t('patients.actions.details')}
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (window.confirm(t('common.confirm'))) {
                                                                onDeleteLead(lead.id);
                                                            }
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-1.5 mb-3">
                                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                                                    <Phone className="w-3.5 h-3.5 mr-1.5 text-primary-500" />
                                                    {lead.phone}
                                                </div>
                                                {(() => {
                                                    const qaPairs = parseQAPairs(lead.notes);
                                                    if (qaPairs.length > 0) {
                                                        return (
                                                            <div className="mt-1 space-y-1">
                                                                {qaPairs.slice(0, 3).map((pair, i) => (
                                                                    <div key={i} className="text-[11px] bg-gray-50 dark:bg-gray-700/50 rounded px-2 py-1">
                                                                        <span className="text-gray-400 dark:text-gray-500">{pair.q}: </span>
                                                                        <span className="font-semibold text-gray-700 dark:text-gray-200">{pair.a}</span>
                                                                    </div>
                                                                ))}
                                                                {qaPairs.length > 3 && (
                                                                    <span className="text-[10px] text-gray-400">+{qaPairs.length - 3} ta savol...</span>
                                                                )}
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                {lead.service && (
                                                    <span className="text-[11px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded w-fit">
                                                        {t('leads.service')}: {lead.service}
                                                    </span>
                                                )}
                                                {lead.source && (
                                                    <span className="text-[10px] text-gray-400">
                                                        {t('leads.source')}: {lead.source}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Stage transition buttons */}
                                            <div className="pt-3 border-t border-gray-50 dark:border-gray-700/50 flex flex-wrap gap-1">
                                                {STAGES.filter(s => s.id !== stage.id).map(s => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => s.id === 'Booked' ? handleConvertClick(lead.id) : moveLead(lead.id, s.id)}
                                                        className={`text-[10px] items-center gap-1 font-medium px-2 py-1 rounded-md transition-colors ${s.id === 'Booked'
                                                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                                                            : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`
                                                        }
                                                    >
                                                        {s.id === 'Booked' ? <UserPlus className="w-3 h-3 inline-block mr-0.5" /> : <ArrowRight className="w-3 h-3 inline-block mr-0.5" />}
                                                        {t(`leads.stages.${s.id.toLowerCase()}`)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {columnLeads.length === 0 && (
                                        <div className="h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center">
                                            <span className="text-xs text-gray-400">{t('leads.empty')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 transform transition-all">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('leads.addLeadModal.title')}</h2>
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleAddSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    {t('leads.addLeadModal.name')} *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    {t('leads.addLeadModal.phone')} *
                                </label>
                                <input
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    {t('leads.addLeadModal.service')}
                                </label>
                                <input
                                    type="text"
                                    placeholder={t('leads.addLeadModal.servicePlaceholder')}
                                    value={formData.service}
                                    onChange={(e) => setFormData({ ...formData, service: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    {t('leads.addLeadModal.source')}
                                </label>
                                <select
                                    value={formData.source}
                                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all dark:text-white"
                                >
                                    <option value="">{t('common.select')}...</option>
                                    <option value="Instagram">{t('leads.sources.instagram')}</option>
                                    <option value="Telegram">{t('leads.sources.telegram')}</option>
                                    <option value="Tavsiya">{t('leads.sources.recommendation')}</option>
                                    <option value="Tashqari">{t('leads.sources.banner')}</option>
                                    <option value="Boshqa">{t('leads.sources.other')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    {t('leads.addLeadModal.notes')}
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows={2}
                                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all dark:text-white resize-none"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                                >
                                    {t('leads.addLeadModal.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-600 font-medium shadow-sm transition-all"
                                >
                                    {t('leads.addLeadModal.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isConvertModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 transform transition-all">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('leads.convertModal.title')}</h2>
                                <p className="text-sm text-gray-500">{t('leads.convertModal.subtitle')}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsConvertModalOpen(false);
                                    setConvertingLeadId(null);
                                }}
                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleConvertSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leads.convertModal.selectDoctor')} *</label>
                                <select
                                    required
                                    value={apptData.doctorId}
                                    onChange={(e) => setApptData({ ...apptData, doctorId: e.target.value })}
                                    className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-primary-500 outline-none"
                                >
                                    <option value="">— {t('leads.convertModal.selectDoctor')} —</option>
                                    {doctors.map((d) => (
                                        <option key={d.id} value={d.id}>Dr. {d.lastName} {d.firstName}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leads.convertModal.date')} *</label>
                                    <input
                                        type="date"
                                        required
                                        value={apptData.date}
                                        onChange={e => setApptData({ ...apptData, date: e.target.value })}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leads.convertModal.time')} *</label>
                                    <input
                                        type="time"
                                        required
                                        value={apptData.time}
                                        onChange={e => setApptData({ ...apptData, time: e.target.value })}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                            </div>

                            {categories.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leads.convertModal.category')}</label>
                                    <select
                                        value={apptData.categoryId}
                                        onChange={(e) => setApptData({ ...apptData, categoryId: e.target.value, type: '' })}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-primary-500 outline-none"
                                    >
                                        <option value="">{t('leads.convertModal.allCategories')}</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leads.convertModal.procedure')}</label>
                                    <select
                                        value={apptData.type}
                                        onChange={e => {
                                            const service = services.find(s => s.name === e.target.value);
                                            setApptData({
                                                ...apptData,
                                                type: e.target.value,
                                                duration: service?.duration || apptData.duration
                                            });
                                        }}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-primary-500 outline-none"
                                    >
                                        {services
                                            .filter(s => !apptData.categoryId || (s as any).categoryId === apptData.categoryId)
                                            .map(s => (
                                                <option key={s.id} value={s.name}>{s.name}</option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leads.convertModal.duration')}</label>
                                    <input
                                        type="number"
                                        required
                                        value={apptData.duration}
                                        onChange={e => setApptData({ ...apptData, duration: Number(e.target.value) })}
                                        onWheel={e => e.currentTarget.blur()}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm dark:text-white px-3 focus:ring-2 focus:ring-primary-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t dark:border-gray-700 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsConvertModalOpen(false);
                                        setConvertingLeadId(null);
                                    }}
                                    className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors"
                                >
                                    {t('leads.convertModal.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm transition-all"
                                >
                                    {t('leads.convertModal.convert')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Facebook Page Selection Modal */}
            {isFBPageModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 transform transition-all">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('leads.fbModal.title')}</h2>
                                <p className="text-sm text-gray-500">{t('leads.fbModal.subtitle')}</p>
                            </div>
                            <button
                                onClick={() => setIsFBPageModalOpen(false)}
                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {facebookPages.map((page) => (
                                <button
                                    key={page.id}
                                    onClick={() => handleSelectFBPage(page)}
                                    className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-primary-50 dark:hover:bg-primary-900/30 border border-gray-100 dark:border-gray-700 rounded-xl transition-all group"
                                >
                                    <div className="flex items-center gap-3 text-left">
                                        <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center text-primary-600 dark:text-primary-400">
                                            <Facebook className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                                                {page.name}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">ID: {page.id}</div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center group-hover:border-primary-500 transition-colors">
                                        <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500" />
                                    </div>
                                </button>
                            ))}

                            {facebookPages.length === 0 && (
                                <div className="py-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                    <Facebook className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">{t('leads.fbModal.noPages')}</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-6 border-t dark:border-gray-700">
                            <button
                                onClick={() => setIsFBPageModalOpen(false)}
                                className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 font-bold transition-colors"
                            >
                                {t('leads.fbModal.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedLeadForDetail && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 transform transition-all max-h-[85vh] flex flex-col">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-700 mb-4 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Activity className="w-5 h-5 text-primary-500" />
                                {t('leads.detailsModal.title')}
                            </h2>
                            <button
                                onClick={() => setSelectedLeadForDetail(null)}
                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{t('leads.addLeadModal.name')}</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedLeadForDetail.name}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{t('leads.addLeadModal.phone')}</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{selectedLeadForDetail.phone}</p>
                                </div>
                                {parseNotesField(selectedLeadForDetail.notes, 'Klinika nomi') && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Klinika nomi</p>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white">{parseNotesField(selectedLeadForDetail.notes, 'Klinika nomi')}</p>
                                    </div>
                                )}
                                {parseNotesField(selectedLeadForDetail.notes, 'Shahar') && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Shahar</p>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white">{parseNotesField(selectedLeadForDetail.notes, 'Shahar')}</p>
                                    </div>
                                )}
                                {parseNotesField(selectedLeadForDetail.notes, 'Shifokorlar soni') && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Shifokorlar soni</p>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white">{parseNotesField(selectedLeadForDetail.notes, 'Shifokorlar soni')}</p>
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{t('leads.service')}</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                                        {selectedLeadForDetail.service || <span className="text-gray-400">—</span>}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{t('leads.source')}</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                                        {selectedLeadForDetail.source || <span className="text-gray-400">—</span>}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Status</p>
                                    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold ${
                                        STAGES.find(s => s.id === selectedLeadForDetail.status)?.color || 'bg-gray-100 text-gray-700'
                                    }`}>
                                        {t(`leads.stages.${selectedLeadForDetail.status.toLowerCase()}`)}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{t('leads.detailsModal.created')}</p>
                                    <p className="text-xs font-bold text-gray-900 dark:text-white">
                                        {new Date(selectedLeadForDetail.createdAt).toLocaleDateString()} {new Date(selectedLeadForDetail.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            </div>

                            {selectedLeadForDetail.notes && (() => {
                                const qaPairs = parseQAPairs(selectedLeadForDetail.notes);
                                if (qaPairs.length > 0) {
                                    return (
                                        <div className="border-t border-gray-100 dark:border-gray-700/50 pt-4">
                                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">Savol-Javoblar</p>
                                            <div className="space-y-2">
                                                {qaPairs.map((pair, i) => (
                                                    <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700/50">
                                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{pair.q}</p>
                                                        <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">{pair.a}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }
                                if (!selectedLeadForDetail.notes.startsWith('FB Lead')) {
                                    return (
                                        <div className="border-t border-gray-100 dark:border-gray-700/50 pt-4">
                                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">{t('leads.addLeadModal.notes')}</p>
                                            {renderNotes(selectedLeadForDetail.notes, t)}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700 mt-4 flex-shrink-0">
                            <button
                                onClick={() => setSelectedLeadForDetail(null)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-all text-xs"
                            >
                                {t('leads.detailsModal.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
