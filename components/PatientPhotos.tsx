import React, { useState, useEffect } from 'react';
import { formatDateTime } from '../utils/format';
import { confirmAction } from '../services/confirm';
import { toast } from '../services/toast';
import { Camera, Upload, Trash2, X, ZoomIn } from 'lucide-react';
import { Button, Card, Modal, Input, Select, Badge } from './Common';
import { PatientPhoto } from '../types';
import { API_URL, getFileUrl, isDemoMode } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

// Fayl manzilini yig'ish endi BITTA joyda — services/api.ts dagi getFileUrl.
// Ilgari loyihada uch xil usul bor edi (bu yerdagi BASE_URL, getFileUrl va
// yalang'och nisbiy yo'l), va himoyani yoqishda ulardan biri e'tibordan
// qolib ketishi oson edi.

/** Demo rasmlari — sessiya davomida saqlanadi (blob manzillar). */
const DEMO_PHOTOS: PatientPhoto[] = [];

interface PatientPhotosProps {
    patientId: string;
    clinicId: string;
    token: string;
}

export const PatientPhotos: React.FC<PatientPhotosProps> = ({ patientId, clinicId, token }) => {
    const { t } = useLanguage();
    const [photos, setPhotos] = useState<PatientPhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('Before');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [viewPhoto, setViewPhoto] = useState<PatientPhoto | null>(null);

    useEffect(() => {
        fetchPhotos();
    }, [patientId]);

    const fetchPhotos = async () => {
        /* Demoda rasmlar BRAUZERDA turadi: server ham, `/uploads` papkasi
           ham yo'q. Yuklangani `blob:` manzil bilan ko'rsatiladi va sahifa
           yangilanguncha yashaydi — namoyish uchun aynan shu kerak. */
        if (isDemoMode()) { setPhotos(DEMO_PHOTOS.filter(p => p.patientId === patientId)); setLoading(false); return; }
        try {
            const response = await fetch(`${API_URL}/patients/${patientId}/photos`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setPhotos(data);
            } else {
                const text = await response.text();
                try {
                    const errorData = JSON.parse(text);
                    console.error('Fetch photos error details:', errorData);
                } catch (e) {
                    console.error('Fetch photos non-JSON error:', text);
                }
            }
        } catch (error) {
            console.error('Failed to fetch photos:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        if (isDemoMode()) {
            const photo: PatientPhoto = {
                id: `demo-photo-${Date.now()}`, patientId,
                url: URL.createObjectURL(selectedFile),
                description, category,
                date: new Date().toISOString(), createdAt: new Date().toISOString(),
            };
            DEMO_PHOTOS.push(photo);
            setPhotos(DEMO_PHOTOS.filter(p => p.patientId === patientId));
            handleCloseModal();
            setUploading(false);
            return;
        }
        const formData = new FormData();
        formData.append('photo', selectedFile);
        formData.append('description', description);
        formData.append('category', category);

        try {
            const response = await fetch(`${API_URL}/patients/${patientId}/photos`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                await fetchPhotos();
                handleCloseModal();
            } else {
                const text = await response.text();
                try {
                    const errorData = JSON.parse(text);
                    console.error('Server error details:', errorData);
                    toast.error(`Failed to upload photo: ${errorData.details || errorData.error || 'Unknown error'}`);
                } catch (e) {
                    console.error('Server non-JSON error:', text);
                    toast.error(`Failed to upload photo: Server returned non-JSON response. Check console for details.`);
                }
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Error uploading photo');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (photoId: string) => {
        if (!await confirmAction({ title: t('patients.details.photos.deleteConfirm') })) return;

        if (isDemoMode()) {
            const i = DEMO_PHOTOS.findIndex(p => p.id === photoId);
            if (i > -1) DEMO_PHOTOS.splice(i, 1);
            setPhotos(photos.filter(p => p.id !== photoId));
            if (viewPhoto?.id === photoId) setViewPhoto(null);
            return;
        }

        try {
            const response = await fetch(`${API_URL}/photos/${photoId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.ok) {
                setPhotos(photos.filter(p => p.id !== photoId));
                if (viewPhoto?.id === photoId) setViewPhoto(null);
            } else {
                toast.error('Failed to delete photo');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const handleCloseModal = () => {
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        setPreviewUrl(null);
        setDescription('');
        setCategory('Before');
    };

    const categories = [
        { value: 'Before', label: t('patients.details.photos.catBefore') },
        { value: 'After', label: t('patients.details.photos.catAfter') },
        { value: 'X-Ray', label: t('patients.details.photos.catXRay') },
        { value: 'Other', label: t('patients.details.photos.catOther') }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-ink">{t('patients.details.photos.title')}</h3>
                <Button onClick={() => setIsUploadModalOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    {t('patients.details.photos.uploadBtn')}
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-10 text-muted">{t('common.loading')}</div>
            ) : photos.length === 0 ? (
                <div className="text-center py-10 bg-elevated rounded-lg border border-dashed border-line">
                    <Camera className="w-12 h-12 mx-auto text-faint mb-3" />
                    <p className="text-muted">{t('patients.details.photos.noPhotos')}</p>
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIsUploadModalOpen(true)}>
                        {t('patients.details.photos.uploadFirst')}
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {photos.map(photo => (
                        <div key={photo.id} className="group relative aspect-square bg-elevated rounded-lg overflow-hidden border border-line hover:shadow-md transition-all">
                            <img
                                src={getFileUrl('patient-photo', photo.id)}
                                alt={photo.description || 'Patient photo'}
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => setViewPhoto(photo)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => handleDelete(photo.id)}
                                        className="p-1.5 bg-red-500/80 text-white rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div>
                                    <span className="inline-block px-2 py-1 bg-black/60 text-white text-xs rounded mb-1">
                                        {categories.find(c => c.value === photo.category)?.label || photo.category}
                                    </span>
                                    {photo.description && (
                                        <p className="text-white text-xs truncate">{photo.description}</p>
                                    )}
                                    <p className="text-faint text-[10px]">
                                        {new Date(photo.date).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Upload Modal */}
            <Modal
                isOpen={isUploadModalOpen}
                onClose={handleCloseModal}
                title={t('patients.details.photos.uploadModalTitle')}
            >
                <div className="space-y-4">
                    <div className="border-2 border-dashed border-line rounded-lg p-6 text-center hover:bg-elevated transition-colors cursor-pointer relative">
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileSelect}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        {previewUrl ? (
                            <div className="relative h-48 mx-auto">
                                <img src={previewUrl} alt="Preview" className="h-full mx-auto object-contain rounded" />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewUrl(null);
                                        setSelectedFile(null);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-sm"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="py-4">
                                <Upload className="w-12 h-12 mx-auto text-faint mb-2" />
                                <p className="text-sm text-muted">{t('patients.details.photos.clickToSelect')}</p>
                                <p className="text-xs text-faint mt-1">PNG, JPG, JPEG</p>
                            </div>
                        )}
                    </div>

                    <Select
                        label={t('patients.details.photos.category')}
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        options={categories}
                    />

                    <Input
                        label={t('patients.details.photos.description')}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('patients.details.photos.descPlaceholder')}
                    />

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={handleCloseModal}>{t('common.cancel')}</Button>
                        <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
                            {uploading ? t('common.loading') : t('patients.details.photos.uploadBtn')}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* View Photo Modal */}
            {viewPhoto && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setViewPhoto(null)}>
                    <button
                        className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
                        onClick={() => setViewPhoto(null)}
                    >
                        <X className="w-8 h-8" />
                    </button>

                    <div className="max-w-4xl max-h-[90vh] relative" onClick={e => e.stopPropagation()}>
                        <img
                            src={getFileUrl('patient-photo', viewPhoto.id)}
                            alt={viewPhoto.description || 'Full view'}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-md text-white p-4 rounded-b-lg transform translate-y-full sm:translate-y-0">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-medium text-lg">
                                        {categories.find(c => c.value === viewPhoto.category)?.label}
                                    </h4>
                                    {viewPhoto.description && (
                                        <p className="text-faint mt-1">{viewPhoto.description}</p>
                                    )}
                                    <p className="text-faint text-sm mt-1">
                                        {formatDateTime(viewPhoto.date)}
                                    </p>
                                </div>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleDelete(viewPhoto.id)}
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    {t('common.delete')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
