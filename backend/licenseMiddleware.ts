import { Request, Response, NextFunction } from 'express';
import { verifyLicense } from './licenseService';

export const createLicenseMiddleware = (prisma: any) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Paths that are ALWAYS allowed (activation, health, etc.)
        const allowedPaths = [
            '/',
            '/health',
            '/api/license/status',
            '/api/license/activate',
            '/api/license/setup',
            '/api/auth/login',
            '/api/network-info'
        ];

        // Static files (photos) should probably be allowed so the activation screen can look nice
        if (req.path.startsWith('/uploads/')) {
            return next();
        }

        if (allowedPaths.includes(req.path)) {
            return next();
        }

        try {
            const clinic = await prisma.clinic.findFirst();
            
            if (!clinic || !clinic.licenseKey || !verifyLicense(clinic.licenseKey)) {
                return res.status(403).json({ 
                    error: 'LICENSE_REQUIRED', 
                    message: 'Dastur aktivlashtirilmagan. Iltimos, administrator bilan bog\'laning.' 
                });
            }

            next();
        } catch (error) {
            console.error('License check error:', error);
            // If DB check fails, we err on the side of caution and block
            res.status(500).json({ error: 'License check error' });
        }
    };
};
