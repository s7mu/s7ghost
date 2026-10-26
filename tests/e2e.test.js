/**
 * E2E Server & WebSocket Communication Test
 */

import http from 'node:http';
import assert from 'node:assert';
import { WebSocket } from 'ws';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { RoomManager } from '../src/store.js';
import { normalizeRoomCode, isValidRoomCode, sanitizeAlias, sanitizeText } from '../src/utils.js';

const TEST_PORT = 3456;
const app = express();
app.use(express.json());

const roomManager = new RoomManager({ purgeIntervalMs: 5000 });

app.get('/health', (req, res) => res.json({ status: 'ok', activeRooms: roomManager.activeRoomsCount }));
app.post('/api/rooms', (req, res) => res.status(201).json({ code: roomManager.createRoom() }));
app.get('/api/rooms/:code', (req, res) => {
  if (!isValidRoomCode(req.params.code)) return res.status(400).json({ error: 'INVALID_ROOM_CODE' });
  const code = normalizeRoomCode(req.params.code);
  const room = roomManager.getRoom(code);
  if (!room) return res.status(404).json({ exists: false });
  res.json({ exists: true, code: room.code });
});
app.get('/api/rooms/:code/qr', async (req, res) => {
  if (!isValidRoomCode(req.params.code)) return res.status(400).send('Invalid room code format');
  const code = normalizeRoomCode(req.params.code);
  const roomUrl = `http://127.0.0.1:${TEST_PORT}/?room=${code}`;
  if (req.query.format === 'svg') {
    const svg = await QRCode.toString(roomUrl, { type: 'svg', margin: 2, color: { dark: '#000000', light: '#ffffff' } });
    return res.type('image/svg+xml').send(svg);
  }
  const buf = await QRCode.toBuffer(roomUrl, { type: 'png', width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
  res.type('image/png').send(buf);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  let currentRoomCode = null;
  let clientSession = null;

  ws.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.type === 'join') {
      const code = normalizeRoomCode(data.code);
      const alias = sanitizeAlias(data.alias);
      currentRoomCode = code;
      clientSession = { id: 'test-id-' + Math.random(), alias, ws };
      const roomData = roomManager.addClient(code, clientSession);
      ws.send(JSON.stringify({ type: 'room_state', code, users: roomData.users }));
      roomManager.broadcast(code, { type: 'user_joined', alias });
    }
    if (data.type === 'message') {
      const text = sanitizeText(data.text);
      const msg = roomManager.addMessage(currentRoomCode, clientSession.alias, text);
      roomManager.broadcast(currentRoomCode, { type: 'new_message', message: msg });
    }
    if (data.type === 'typing') {
      const room = roomManager.getRoom(currentRoomCode);
      if (room) {
        for (const c of room.clients) {
          if (c !== clientSession && c.ws && c.ws.readyState === 1) {
            c.ws.send(JSON.stringify({ type: 'typing', alias: clientSession.alias, isTyping: data.isTyping }));
          }
        }
      }
    }
    if (data.type === 'burn_room') {
      roomManager.burnRoom(currentRoomCode);
    }
  });
});

server.listen(TEST_PORT, async () => {
  console.log('📡 Test server started on port', TEST_PORT);

  try {
    // 1. Health check
    const healthRes = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    console.log('   ✓ Health check passed');

    // 2. Create room
    const createRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rooms`, { method: 'POST' });
    const createData = await createRes.json();
    const roomCode = createData.code;
    assert.strictEqual(roomCode.length, 4);
    console.log(`   ✓ Room created: ${roomCode}`);

    // 2.1 Test QR Code Endpoint (PNG binary & SVG)
    const qrRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rooms/${roomCode}/qr`);
    assert.strictEqual(qrRes.status, 200);
    assert.strictEqual(qrRes.headers.get('content-type'), 'image/png');
    const qrBytes = await qrRes.arrayBuffer();
    assert(qrBytes.byteLength > 500, 'QR PNG should be non-empty');
    console.log(`   ✓ High-contrast QR PNG generated successfully (${qrBytes.byteLength} bytes)`);

    const qrSvgRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rooms/${roomCode}/qr?format=svg`);
    assert.strictEqual(qrSvgRes.status, 200);
    assert.strictEqual(qrSvgRes.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
    const svgText = await qrSvgRes.text();
    assert(svgText.includes('<svg'), 'QR SVG output should contain <svg');
    console.log('   ✓ High-contrast QR SVG generated successfully');

    // 2.2 Test Trust Boundary & Malformed Code Rejection (DoS prevention)
    const badQrRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rooms/TOOLONGCODE123/qr`);
    assert.strictEqual(badQrRes.status, 400, 'Invalid room code in QR route must return 400 Bad Request');
    const badApiRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/rooms/A01X`);
    assert.strictEqual(badApiRes.status, 400, 'Ambiguous room code format must return 400');
    console.log('   ✓ Malformed/oversized room code queries rejected with HTTP 400');

    // 3. Connect two WebSocket clients
    const ws1 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${TEST_PORT}/ws`);

    await Promise.all([
      new Promise((resolve) => ws1.on('open', resolve)),
      new Promise((resolve) => ws2.on('open', resolve))
    ]);

    // Join room
    ws1.send(JSON.stringify({ type: 'join', code: roomCode, alias: 'PC Samu' }));
    ws2.send(JSON.stringify({ type: 'join', code: roomCode, alias: 'Raspberry Pi' }));

    // Message transfer check
    const messagePromise = new Promise((resolve) => {
      ws2.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'new_message') {
          resolve(payload.message);
        }
      });
    });

    // Wait a brief moment for both to be registered
    await new Promise((r) => setTimeout(r, 200));

    // Send note from client 1
    const testNote = 'Contraseña o comando para el servidor: sudo systemctl restart s7ghost';
    ws1.send(JSON.stringify({ type: 'message', text: testNote }));

    const received = await messagePromise;
    assert.strictEqual(received.sender, 'PC Samu');
    assert.strictEqual(received.text, testNote);
    console.log('   ✓ Instant message received on second client:', received.text);

    // 4. Test Typing Presence Notification
    const typingPromise = new Promise((resolve) => {
      ws2.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'typing') {
          resolve(payload);
        }
      });
    });

    ws1.send(JSON.stringify({ type: 'typing', isTyping: true }));
    const typingEvent = await typingPromise;
    assert.strictEqual(typingEvent.alias, 'PC Samu');
    assert.strictEqual(typingEvent.isTyping, true);
    console.log('   ✓ Typing presence notification received correctly');

    // 5. Test Panic Button: Burn Room
    const burnPromise = new Promise((resolve) => {
      ws2.on('message', (data) => {
        const payload = JSON.parse(data.toString());
        if (payload.type === 'room_destroyed') {
          resolve(payload);
        }
      });
    });

    ws1.send(JSON.stringify({ type: 'burn_room' }));
    const burnEvent = await burnPromise;
    assert.strictEqual(burnEvent.reason, 'burned');
    assert.strictEqual(roomManager.hasRoom(roomCode), false);
    const tomb = roomManager.getTombstone(roomCode);
    assert.ok(tomb, 'Tombstone should exist for burned room');
    assert.strictEqual(tomb.reason, 'burned');
    console.log('   ✓ Panic button incinerated room, registered tombstone & notified connected clients');

    // Teardown
    ws1.close();
    ws2.close();
    roomManager.destroy();
    server.close(() => {
      console.log('   ✓ All E2E tests completed successfully!');
      process.exit(0);
    });
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
});
