/**
 * s7ghost - Main Server
 * Optimized for Raspberry Pi & Cloudflare Proxy
 * Supports WebSockets, Transparent HTTP Fallback & High-Contrast QR Code Generation
 */

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
import { RoomManager } from './store.js';
import { normalizeRoomCode, isValidRoomCode, sanitizeAlias, sanitizeText } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.set('trust proxy', true);

app.use(express.json({ limit: '64kb' }));
app.use(express.static(publicDir));

const roomManager = new RoomManager({ purgeIntervalMs: 20000 });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    activeRooms: roomManager.activeRoomsCount,
    timestamp: new Date().toISOString()
  });
});

// Create new room endpoint
app.post('/api/rooms', (req, res) => {
  try {
    const code = roomManager.createRoom();
    console.log(`[s7ghost] Room created: ${code}`);
    res.status(201).json({ code });
  } catch (err) {
    console.error('[s7ghost] Error creating room:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Check if a room exists and get its status
app.get('/api/rooms/:code', (req, res) => {
  if (!isValidRoomCode(req.params.code)) {
    return res.status(400).json({ error: 'INVALID_ROOM_CODE', message: 'Invalid room code format' });
  }
  const code = normalizeRoomCode(req.params.code);

  const room = roomManager.getRoom(code);
  if (!room) {
    const tomb = roomManager.getTombstone(code);
    const reason = tomb ? tomb.reason : 'expired';
    return res.status(404).json({
      exists: false,
      error: reason === 'burned' ? 'ROOM_BURNED' : 'ROOM_EXPIRED',
      reason,
      message: reason === 'burned' ? 'This room was incinerated on demand.' : 'Room not found or expired'
    });
  }

  res.json({
    exists: true,
    code: room.code,
    timeRemaining: roomManager.getTimeRemaining(room),
    userCount: room.clients.size
  });
});

// QR Code Generator Endpoint (High-Contrast Black on White PNG for Camera Scanning)
app.get('/api/rooms/:code/qr', async (req, res) => {
  if (!isValidRoomCode(req.params.code)) {
    return res.status(400).send('Invalid room code format');
  }
  const code = normalizeRoomCode(req.params.code);

  const host = req.get('host') || 'localhost:3000';
  const isHttps = req.headers['x-forwarded-proto'] === 'https' || req.secure;
  const proto = isHttps ? 'https' : 'http';
  const roomUrl = `${proto}://${host}/?room=${code}`;

  try {
    if (req.query.format === 'svg') {
      const svg = await QRCode.toString(roomUrl, {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
      res.type('image/svg+xml').send(svg);
      return;
    }

    const pngBuffer = await QRCode.toBuffer(roomUrl, {
      type: 'png',
      width: 280,
      margin: 2,
      color: {
        dark: '#000000',  // Pure black modules for instant scanner acquisition
        light: '#ffffff'  // Pure solid white background
      }
    });

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(pngBuffer);
  } catch (err) {
    console.error(`[s7ghost] QR generation error for room ${code}:`, err);
    res.status(500).send('Error generating QR code');
  }
});

// HTTP Fallback: Join room
app.post('/api/rooms/:code/join', (req, res) => {
  if (!isValidRoomCode(req.params.code)) {
    return res.status(400).json({ error: 'INVALID_ROOM_CODE', message: 'Invalid room code format' });
  }
  const code = normalizeRoomCode(req.params.code);
  const alias = sanitizeAlias(req.body.alias);

  const room = roomManager.getRoom(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  const clientId = `http-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clientSession = { id: clientId, alias, ws: null, lastSeen: Date.now() };
  room.clients.add(clientSession);
  room.lastActivity = Date.now();

  res.json({
    code: room.code,
    yourId: clientId,
    timeRemaining: roomManager.getTimeRemaining(room),
    messages: room.messages,
    users: Array.from(room.clients).map(c => ({ id: c.id, alias: c.alias }))
  });
});

// HTTP Fallback: Send message
app.post('/api/rooms/:code/messages', (req, res) => {
  if (!isValidRoomCode(req.params.code)) {
    return res.status(400).json({ error: 'INVALID_ROOM_CODE', message: 'Invalid room code format' });
  }
  const code = normalizeRoomCode(req.params.code);
  const alias = sanitizeAlias(req.body.alias);
  const text = sanitizeText(req.body.text);
  const meta = {
    burnAfterRead: req.body.burnAfterRead,
    ttlSec: req.body.ttlSec,
    isCode: req.body.isCode
  };

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ error: 'Empty message' });
  }

  const room = roomManager.getRoom(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found or expired' });
  }

  const message = roomManager.addMessage(code, alias, text, meta);
  if (!message) {
    return res.status(500).json({ error: 'Failed to record message' });
  }

  roomManager.broadcast(code, {
    type: 'new_message',
    message,
    timeRemaining: roomManager.getTimeRemaining(room)
  });

  res.status(201).json({
    success: true,
    message,
    timeRemaining: roomManager.getTimeRemaining(room)
  });
});

// Panic Button: Instantly incinerate room on demand
app.post('/api/rooms/:code/burn', (req, res) => {
  if (!isValidRoomCode(req.params.code)) {
    return res.status(400).json({ error: 'INVALID_ROOM_CODE', message: 'Invalid room code format' });
  }
  const code = normalizeRoomCode(req.params.code);
  const success = roomManager.burnRoom(code);
  if (!success) {
    return res.status(404).json({ error: 'Room not found or already purged' });
  }
  console.log(`[s7ghost] Room incinerated via Panic Button: ${code}`);
  res.json({ success: true, message: 'Room incinerated from memory' });
});

// Single Message Destruction (Self-destructing notes)
app.delete('/api/rooms/:code/messages/:messageId', (req, res) => {
  if (!isValidRoomCode(req.params.code)) {
    return res.status(400).json({ error: 'INVALID_ROOM_CODE', message: 'Invalid room code format' });
  }
  const code = normalizeRoomCode(req.params.code);
  const messageId = req.params.messageId;

  const deleted = roomManager.deleteMessage(code, messageId);
  if (deleted) {
    roomManager.broadcast(code, {
      type: 'message_deleted',
      messageId
    });
  }
  res.json({ success: true, messageId });
});

// HTTP Fallback: Sync messages & state
app.get('/api/rooms/:code/sync', (req, res) => {
  if (!isValidRoomCode(req.params.code)) {
    return res.status(400).json({ error: 'INVALID_ROOM_CODE', message: 'Invalid room code format' });
  }
  const code = normalizeRoomCode(req.params.code);

  const since = parseInt(req.query.since || '0', 10);

  const room = roomManager.getRoom(code);
  if (!room) {
    const tomb = roomManager.getTombstone(code);
    const reason = tomb ? tomb.reason : 'expired';
    return res.status(404).json({
      error: reason === 'burned' ? 'ROOM_BURNED' : 'ROOM_EXPIRED',
      reason,
      message: reason === 'burned' ? 'This room was incinerated on demand.' : 'Room has expired'
    });
  }

  const newMessages = room.messages.filter(m => m.timestamp > since);

  res.json({
    timeRemaining: roomManager.getTimeRemaining(room),
    users: Array.from(room.clients).map(c => ({ id: c.id, alias: c.alias })),
    messages: newMessages
  });
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Create HTTP Server
const server = http.createServer(app);

// Create WebSocket Server
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 128 * 1024
});

// Upgrade ALL requests to WebSocket unconditionally
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Cloudflare Keep-Alive: 30-second ping interval
const heartbeatInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    } catch {}
  }
}, 30000);

heartbeatInterval.unref();

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  let currentRoomCode = null;
  let clientSession = null;

  ws.on('message', (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.type === 'pong') {
      ws.isAlive = true;
      return;
    }

    if (data.type === 'ping') {
      ws.isAlive = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
      return;
    }

    // Join room
    if (data.type === 'join') {
      if (currentRoomCode) {
        cleanupClient();
      }

      if (!isValidRoomCode(data.code)) {
        ws.send(JSON.stringify({
          type: 'error',
          code: 'INVALID_ROOM_CODE',
          message: 'Room code must be 4 to 6 valid characters.'
        }));
        return;
      }

      const code = normalizeRoomCode(data.code);

      const alias = sanitizeAlias(data.alias);

      if (!roomManager.hasRoom(code)) {
        ws.send(JSON.stringify({
          type: 'error',
          code: 'ROOM_NOT_FOUND',
          message: 'The specified room does not exist or has expired.'
        }));
        return;
      }

      currentRoomCode = code;
      const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      clientSession = { id: clientId, alias, ws };

      const roomData = roomManager.addClient(code, clientSession);
      if (!roomData) {
        ws.send(JSON.stringify({
          type: 'error',
          code: 'ROOM_JOIN_FAILED',
          message: 'Could not join room.'
        }));
        return;
      }

      ws.send(JSON.stringify({
        type: 'room_state',
        code: roomData.code,
        timeRemaining: roomData.timeRemaining,
        messages: roomData.messages,
        users: roomData.users,
        yourId: clientId
      }));

      roomManager.broadcast(code, {
        type: 'user_joined',
        alias,
        users: Array.from(roomManager.getRoom(code).clients).map(c => ({ id: c.id, alias: c.alias })),
        timeRemaining: roomManager.getTimeRemaining(roomManager.getRoom(code))
      });
      return;
    }

    // Send message
    if (data.type === 'message') {
      if (!currentRoomCode || !clientSession) {
        ws.send(JSON.stringify({
          type: 'error',
          code: 'NOT_IN_ROOM',
          message: 'You must join a room to send messages.'
        }));
        return;
      }

      const text = sanitizeText(data.text);
      if (!text || text.trim().length === 0) return;

      const room = roomManager.getRoom(currentRoomCode);
      if (!room) {
        ws.send(JSON.stringify({
          type: 'error',
          code: 'ROOM_EXPIRED',
          message: 'The room has expired.'
        }));
        return;
      }

      const meta = {
        burnAfterRead: data.burnAfterRead,
        ttlSec: data.ttlSec,
        isCode: data.isCode
      };

      const message = roomManager.addMessage(currentRoomCode, clientSession.alias, text, meta);
      if (message) {
        roomManager.broadcast(currentRoomCode, {
          type: 'new_message',
          message,
          timeRemaining: roomManager.getTimeRemaining(room)
        });
      }
      return;
    }

    // Real-time typing presence indicator
    if (data.type === 'typing') {
      if (!currentRoomCode || !clientSession) return;
      const room = roomManager.getRoom(currentRoomCode);
      if (!room) return;

      const payload = JSON.stringify({
        type: 'typing',
        alias: clientSession.alias,
        isTyping: Boolean(data.isTyping)
      });

      for (const client of room.clients) {
        if (client !== clientSession && client.ws && client.ws.readyState === 1) {
          try {
            client.ws.send(payload);
          } catch {}
        }
      }
      return;
    }

    // Panic Button: Incinerate room immediately
    if (data.type === 'burn_room') {
      if (!currentRoomCode) return;
      console.log(`[s7ghost] Room burned via WS Panic Button: ${currentRoomCode}`);
      roomManager.burnRoom(currentRoomCode);
      return;
    }

    // Destroy single message (Self-destruct)
    if (data.type === 'delete_message') {
      if (!currentRoomCode || !data.messageId) return;
      const deleted = roomManager.deleteMessage(currentRoomCode, data.messageId);
      if (deleted) {
        roomManager.broadcast(currentRoomCode, {
          type: 'message_deleted',
          messageId: data.messageId
        });
      }
      return;
    }

    // Leave
    if (data.type === 'leave') {
      cleanupClient();
    }
  });

  function cleanupClient() {
    if (currentRoomCode && clientSession) {
      const room = roomManager.getRoom(currentRoomCode);
      roomManager.removeClient(currentRoomCode, clientSession);

      if (room && room.clients.size > 0) {
        roomManager.broadcast(currentRoomCode, {
          type: 'user_left',
          alias: clientSession.alias,
          users: Array.from(room.clients).map(c => ({ id: c.id, alias: c.alias }))
        });
      }
      currentRoomCode = null;
      clientSession = null;
    }
  }

  ws.on('close', cleanupClient);
  ws.on('error', cleanupClient);
});

// Periodic broadcast of timeRemaining every 10 seconds
const syncTimer = setInterval(() => {
  for (const [code, room] of roomManager.rooms.entries()) {
    const remaining = roomManager.getTimeRemaining(room);
    roomManager.broadcast(code, {
      type: 'time_sync',
      timeRemaining: remaining
    });
  }
}, 10000);

syncTimer.unref();

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n[s7ghost] Received ${signal}. Purging memory...`);
  clearInterval(heartbeatInterval);
  clearInterval(syncTimer);
  roomManager.destroy();
  wss.close(() => {
    server.close(() => {
      console.log('[s7ghost] Shutdown complete.');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log(`===============================================`);
  console.log(`  s7ghost — Ephemeral Note Transfer Server     `);
  console.log(`  Listening on http://${HOST}:${PORT}           `);
  console.log(`  Hybrid Engine: WebSockets + HTTP Fallback    `);
  console.log(`  QR Generator: /api/rooms/:code/qr enabled    `);
  console.log(`===============================================`);
});
