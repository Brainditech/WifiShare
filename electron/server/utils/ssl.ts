import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

interface SSLCertificate {
    key: string;
    cert: string;
}

/**
 * Generate or load a self-signed SSL certificate
 * Note: For local network use, HTTP is often sufficient and avoids certificate warnings
 */
export function generateSelfSignedCert(): SSLCertificate | null {
    const certDir = path.join(app.getPath('userData'), 'certs');
    const keyPath = path.join(certDir, 'server.key');
    const certPath = path.join(certDir, 'server.crt');

    // Check if certificates already exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
            key: fs.readFileSync(keyPath, 'utf-8'),
            cert: fs.readFileSync(certPath, 'utf-8'),
        };
    }

    // For simplicity, we'll use HTTP instead of HTTPS for local network
    // HTTPS would require users to accept self-signed certificate warnings
    return null;
}
