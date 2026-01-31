import { randomBytes } from 'crypto';

/**
 * Generate a random session code for secure connections
 */
export function generateSessionCode(length: number = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters (0, O, 1, I)
    let code = '';
    const bytes = randomBytes(length);

    for (let i = 0; i < length; i++) {
        code += chars[bytes[i] % chars.length];
    }

    return code;
}

/**
 * Validate a session code format
 */
export function isValidSessionCode(code: string): boolean {
    if (!code || typeof code !== 'string') return false;
    return /^[A-Z0-9]{6}$/.test(code);
}
