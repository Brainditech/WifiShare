"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSessionCode = generateSessionCode;
exports.isValidSessionCode = isValidSessionCode;
const crypto_1 = require("crypto");
/**
 * Generate a random session code for secure connections
 */
function generateSessionCode(length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters (0, O, 1, I)
    let code = '';
    const bytes = (0, crypto_1.randomBytes)(length);
    for (let i = 0; i < length; i++) {
        code += chars[bytes[i] % chars.length];
    }
    return code;
}
/**
 * Validate a session code format
 */
function isValidSessionCode(code) {
    if (!code || typeof code !== 'string')
        return false;
    return /^[A-Z0-9]{6}$/.test(code);
}
