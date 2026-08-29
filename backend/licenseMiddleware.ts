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

        /* TEKSHIRUV FAQAT API GA TEGISHLI.

           Ilgari bu yerda faqat `/uploads/` chetlab o'tilardi, ya'ni
           frontendning O'Z fayllari — `/assets/index-….js`, css,
           shriftlar — ham 403 olardi. Natijada aktivlashtirilmagan
           nusxada `index.html` yuklanar, lekin JS bloklangani uchun
           ekran BO'M-BO'SH oq qolardi. Xaridor aynan shuni ko'rardi
           va nima qilishni bilmasdi.

           Statik fayllar hech qanday ma'lumot bermaydi — himoya
           qilinishi kerak bo'lgan narsa API. */
        if (!req.path.startsWith('/api/')) {
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
