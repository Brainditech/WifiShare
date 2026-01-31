// ============================================================================
// WiFiShare - Vite WebSocket Plugin
// Serveur de signaling intégré au serveur Vite (même port, HTTPS)
// ============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import type { ViteDevServer, Plugin } from 'vite';

interface Session {
    code: string;
    sender: WebSocket | null;
    receiver: WebSocket | null;
    files: { name: string; size: number; type: string }[];
    createdAt: number;
}

const sessions = new Map<string, Session>();

// Cleanup old sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [code, session] of sessions) {
        // Remove sessions older than 10 minutes
        if (now - session.createdAt > 10 * 60 * 1000) {
            sessions.delete(code);
        }
    }
}, 60000);

export function webSocketPlugin(): Plugin {
    return {
        name: 'wifishare-websocket',
        configureServer(server: ViteDevServer) {
            // Attach WebSocket to the same server (uses same port and HTTPS)
            const wss = new WebSocketServer({ noServer: true });

            // Handle upgrade requests
            server.httpServer?.on('upgrade', (request, socket, head) => {
                // Only handle our WebSocket path
                if (request.url === '/ws') {
                    wss.handleUpgrade(request, socket, head, (ws) => {
                        wss.emit('connection', ws, request);
                    });
                }
            });

            console.log('🔌 WebSocket signaling server attached to Vite (path: /ws)');

            wss.on('connection', (ws: WebSocket) => {
                let currentSession: string | null = null;
                let role: 'sender' | 'receiver' | null = null;

                ws.on('message', (data: Buffer) => {
                    try {
                        const message = JSON.parse(data.toString());

                        switch (message.type) {
                            case 'CREATE_SESSION': {
                                // Receiver creates a session
                                const code = generateCode();
                                sessions.set(code, {
                                    code,
                                    sender: null,
                                    receiver: ws,
                                    files: [],
                                    createdAt: Date.now()
                                });
                                currentSession = code;
                                role = 'receiver';

                                ws.send(JSON.stringify({
                                    type: 'SESSION_CREATED',
                                    code
                                }));
                                console.log(`📱 Session created: ${code}`);
                                break;
                            }

                            case 'JOIN_SESSION': {
                                // Sender joins a session
                                const session = findSession(message.code);
                                if (!session) {
                                    ws.send(JSON.stringify({
                                        type: 'ERROR',
                                        message: 'Session non trouvée'
                                    }));
                                    return;
                                }

                                session.sender = ws;
                                currentSession = session.code;
                                role = 'sender';

                                ws.send(JSON.stringify({
                                    type: 'SESSION_JOINED',
                                    code: session.code
                                }));

                                // Notify receiver that sender connected
                                if (session.receiver && session.receiver.readyState === WebSocket.OPEN) {
                                    session.receiver.send(JSON.stringify({
                                        type: 'SENDER_CONNECTED'
                                    }));
                                }
                                console.log(`📲 Sender joined session: ${session.code}`);
                                break;
                            }

                            case 'SEND_FILES': {
                                // Sender announces files to send
                                const session = currentSession ? sessions.get(currentSession) : null;
                                if (!session || !session.receiver) {
                                    ws.send(JSON.stringify({
                                        type: 'ERROR',
                                        message: 'Session invalide'
                                    }));
                                    return;
                                }

                                session.files = message.files;

                                // Forward to receiver
                                if (session.receiver.readyState === WebSocket.OPEN) {
                                    session.receiver.send(JSON.stringify({
                                        type: 'FILES_INCOMING',
                                        files: message.files
                                    }));
                                }
                                break;
                            }

                            case 'ACCEPT_FILES': {
                                // Receiver accepts files
                                const session = currentSession ? sessions.get(currentSession) : null;
                                if (!session || !session.sender) return;

                                if (session.sender.readyState === WebSocket.OPEN) {
                                    session.sender.send(JSON.stringify({
                                        type: 'FILES_ACCEPTED'
                                    }));
                                }
                                break;
                            }

                            case 'FILE_CHUNK': {
                                // Forward file chunk to receiver
                                const session = currentSession ? sessions.get(currentSession) : null;
                                if (!session || !session.receiver) return;

                                if (session.receiver.readyState === WebSocket.OPEN) {
                                    session.receiver.send(JSON.stringify({
                                        type: 'FILE_CHUNK',
                                        fileIndex: message.fileIndex,
                                        chunkIndex: message.chunkIndex,
                                        totalChunks: message.totalChunks,
                                        data: message.data,
                                        fileName: message.fileName
                                    }));
                                }
                                break;
                            }

                            case 'FILE_COMPLETE': {
                                // Notify receiver that file transfer is complete
                                const session = currentSession ? sessions.get(currentSession) : null;
                                if (!session || !session.receiver) return;

                                if (session.receiver.readyState === WebSocket.OPEN) {
                                    session.receiver.send(JSON.stringify({
                                        type: 'FILE_COMPLETE',
                                        fileIndex: message.fileIndex,
                                        fileName: message.fileName
                                    }));
                                }
                                break;
                            }

                            case 'TRANSFER_COMPLETE': {
                                // Notify receiver that all transfers are complete
                                const session = currentSession ? sessions.get(currentSession) : null;
                                if (!session || !session.receiver) return;

                                if (session.receiver.readyState === WebSocket.OPEN) {
                                    session.receiver.send(JSON.stringify({
                                        type: 'TRANSFER_COMPLETE'
                                    }));
                                }
                                console.log(`✅ Transfer complete for session: ${currentSession}`);
                                break;
                            }

                            case 'CHUNK_ACK': {
                                // Forward chunk acknowledgment to sender
                                const session = currentSession ? sessions.get(currentSession) : null;
                                if (!session || !session.sender) return;

                                if (session.sender.readyState === WebSocket.OPEN) {
                                    session.sender.send(JSON.stringify({
                                        type: 'CHUNK_ACK',
                                        fileIndex: message.fileIndex,
                                        chunkIndex: message.chunkIndex
                                    }));
                                }
                                break;
                            }
                        }
                    } catch (error) {
                        console.error('WebSocket message error:', error);
                    }
                });

                ws.on('close', () => {
                    if (currentSession) {
                        const session = sessions.get(currentSession);
                        if (session) {
                            if (role === 'receiver') {
                                // Notify sender if receiver disconnects
                                if (session.sender && session.sender.readyState === WebSocket.OPEN) {
                                    session.sender.send(JSON.stringify({
                                        type: 'RECEIVER_DISCONNECTED'
                                    }));
                                }
                                sessions.delete(currentSession);
                            } else if (role === 'sender') {
                                // Notify receiver if sender disconnects
                                if (session.receiver && session.receiver.readyState === WebSocket.OPEN) {
                                    session.receiver.send(JSON.stringify({
                                        type: 'SENDER_DISCONNECTED'
                                    }));
                                }
                                session.sender = null;
                            }
                        }
                    }
                });
            });

            // Cleanup on server close
            server.httpServer?.on('close', () => {
                wss.close();
            });
        }
    };
}

function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function findSession(code: string): Session | null {
    // Try exact match first
    if (sessions.has(code)) {
        return sessions.get(code)!;
    }

    // Try uppercase
    const upperCode = code.toUpperCase();
    if (sessions.has(upperCode)) {
        return sessions.get(upperCode)!;
    }

    return null;
}
