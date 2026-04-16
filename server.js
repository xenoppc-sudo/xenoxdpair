const express = require('express');
const cors = require('cors');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active connections and their status
const sessions = new Map();
const sessionStatusCache = new NodeCache({ stdTTL: 600 }); // Store session status for 10 minutes

app.post('/api/request-pairing', async (req, res) => {
    let { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required." });
    }

    // Clean phone number
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

    const sessionId = `XENO_${Date.now()}`;
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    
    if (!fs.existsSync('sessions')) {
        fs.mkdirSync('sessions');
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        const conn = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.0"],
            auth: state,
            markOnlineOnConnect: false
        });

        sessions.set(sessionId, conn);
        sessionStatusCache.set(sessionId, { status: 'waiting', code: null, sessionId: null });

        conn.ev.on('creds.update', saveCreds);

        conn.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(`Connection OPEN for session: ${sessionId}`);
                // Authentication successful, generate session ID base64
                const credsPath = path.join(sessionPath, 'creds.json');
                if (fs.existsSync(credsPath)) {
                    const credsData = fs.readFileSync(credsPath);
                    const base64Creds = Buffer.from(credsData).toString('base64');
                    const generatedSessionId = `XENOXD~${base64Creds}`;
                    
                    // Update cache to show success and pass the session ID
                    sessionStatusCache.set(sessionId, { status: 'success', sessionId: generatedSessionId });
                    
                    // Cleanup
                    try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
                }
                
                // End connection since we only needed it for session generation
                setTimeout(() => {
                    if (sessions.has(sessionId)) {
                        sessions.get(sessionId).end(new Error('Session generated'));
                        sessions.delete(sessionId);
                    }
                }, 2000);
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                if (reason !== DisconnectReason.loggedOut && reason !== 500) {
                     // Usually closed after generation, or failed
                     const currentStatus = sessionStatusCache.get(sessionId);
                     if (currentStatus && currentStatus.status !== 'success') {
                         sessionStatusCache.set(sessionId, { status: 'failed', error: 'Connection closed' });
                     }
                }
                try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
                sessions.delete(sessionId);
            }
        });

        // Wait for connection to initialize
        setTimeout(async () => {
            try {
                let code = await conn.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-');
                sessionStatusCache.set(sessionId, { status: 'pairing', code: code });
                
                res.json({ success: true, trackingId: sessionId, code: code });
            } catch (error) {
                console.error('Error generating pairing code:', error);
                res.status(500).json({ error: "Failed to request pairing code. Maybe you requested too many times or rate limited." });
                sessions.delete(sessionId);
                try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
            }
        }, 3000);

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: "Internal server error." });
    }
});

app.get('/api/status', (req, res) => {
    const { trackingId } = req.query;
    if (!trackingId) {
        return res.status(400).json({ error: "Tracking ID is required" });
    }

    const status = sessionStatusCache.get(trackingId);
    if (!status) {
        return res.status(404).json({ error: "Session tracking not found or expired" });
    }

    res.json(status);
});

app.listen(port, () => {
    console.log(`📡 XENO XD Session Generator running on http://localhost:${port}`);
});
