/**
 * Automated Test Suite for s7ghost
 */

import assert from 'node:assert';
import http from 'node:http';
import { generateRoomCode, normalizeRoomCode, isValidRoomCode, sanitizeAlias, sanitizeText } from '../src/utils.js';
import { RoomManager, TTL_INACTIVITY_MS } from '../src/store.js';

console.log('🧪 Starting s7ghost tests...\n');

// 1. Test Utils & Trust Boundaries
console.log('1. Testing Utilities & Trust Boundaries:');
{
  const code = generateRoomCode(4);
  assert.strictEqual(code.length, 4, 'Code length should be 4');
  assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/, 'Code should use unambiguous charset');
  
  assert.strictEqual(normalizeRoomCode(' a7x9 '), 'A7X9', 'Normalization should trim and uppercase');
  assert.strictEqual(normalizeRoomCode('A'.repeat(500)).length, 6, 'Normalization should strictly cap code to max 6 chars');
  assert.strictEqual(normalizeRoomCode('A01IL9'), 'A9', 'Normalization should strip ambiguous chars 0, 1, I, L');

  // Room code strict format validation
  assert.strictEqual(isValidRoomCode('A7X9'), true, 'Valid 4-char code accepted');
  assert.strictEqual(isValidRoomCode('23456'), true, 'Valid 5-char code accepted');
  assert.strictEqual(isValidRoomCode('ABC'), false, 'Code under 4 chars must be rejected');
  assert.strictEqual(isValidRoomCode('ABCDEFG'), false, 'Code over 6 chars must be rejected');
  assert.strictEqual(isValidRoomCode('A0X9'), false, 'Ambiguous char 0 must be rejected');
  assert.strictEqual(isValidRoomCode('A1X9'), false, 'Ambiguous char 1 must be rejected');
  assert.strictEqual(isValidRoomCode('AOX9'), false, 'Ambiguous char O must be rejected');
  assert.strictEqual(isValidRoomCode('AIX9'), false, 'Ambiguous char I must be rejected');
  assert.strictEqual(isValidRoomCode('<script>'), false, 'Injected string must be rejected');

  // Payload bounds & sanitization
  assert.strictEqual(sanitizeAlias('  Samu <script>  '), 'Samu <script>', 'Alias should trim whitespace');
  assert.strictEqual(sanitizeAlias(''), 'Anonymous', 'Empty alias should fallback to Anonymous');
  assert.strictEqual(sanitizeAlias('A'.repeat(100)).length, 32, 'Alias must be capped at 32 chars');
  assert.strictEqual(sanitizeText('Hello world'), 'Hello world', 'Text should be preserved');
  assert.strictEqual(sanitizeText('X'.repeat(100000)).length, 65536, 'Message text must be capped at 64KB');
  console.log('   ✓ Utils and boundary validation tests passed');
}

// 2. Test Store & Ephemeral In-Memory TTL
console.log('\n2. Testing In-Memory Room Store & Auto-Destruction TTL:');
{
  const store = new RoomManager({ purgeIntervalMs: 1000 });
  const code = store.createRoom();
  assert.ok(code, 'Room code should be generated');
  assert.strictEqual(store.hasRoom(code), true, 'Store should recognize active room');

  const client1 = { id: 'c1', alias: 'Samu', ws: { readyState: 1, send: () => {} } };
  const roomData = store.addClient(code, client1);
  assert.strictEqual(roomData.code, code);
  assert.strictEqual(roomData.users.length, 1);

  // Send message with metadata
  const msg = store.addMessage(code, 'Samu', 'Prueba de nota efímera', { burnAfterRead: true, ttlSec: 10, isCode: true });
  assert.strictEqual(msg.sender, 'Samu');
  assert.strictEqual(msg.text, 'Prueba de nota efímera');
  assert.strictEqual(msg.burnAfterRead, true);
  assert.strictEqual(msg.ttlSec, 10);
  assert.strictEqual(msg.isCode, true);
  assert.strictEqual(store.getRoom(code).messages.length, 1);

  // Test single message deletion (Self-destruct)
  const deleted = store.deleteMessage(code, msg.id);
  assert.strictEqual(deleted, true, 'Message should be deleted');
  assert.strictEqual(store.getRoom(code).messages.length, 0, 'Messages list should now be empty');

  // Test Panic Button (burnRoom)
  const code2 = store.createRoom();
  assert.strictEqual(store.hasRoom(code2), true);
  const burned = store.burnRoom(code2);
  assert.strictEqual(burned, true, 'Room should be burned');
  assert.strictEqual(store.hasRoom(code2), false, 'Burned room should not exist');

  // Test expiration TTL simulation
  const room = store.getRoom(code);
  // Artificially age the room by 61 minutes
  room.lastActivity = Date.now() - (TTL_INACTIVITY_MS + 5000);
  assert.strictEqual(store.isExpired(room), true, 'Room should be marked as expired after 1h');
  
  // Store hasRoom should now return false and purge it
  assert.strictEqual(store.hasRoom(code), false, 'Expired room should be purged upon access');
  assert.strictEqual(store.activeRoomsCount, 0, 'Store should be empty after purge');

  // Test Tombstone auto-pruning (Memory leak prevention)
  assert.ok(store.getTombstone(code2), 'Tombstone should exist right after burning');
  store.tombstones.get(code2).at = Date.now() - 130000; // Artificially age tombstone beyond 2 minutes
  store.purgeExpiredRooms();
  assert.strictEqual(store.getTombstone(code2), null, 'Expired tombstone must be purged from memory');

  // Test Stale HTTP client auto-pruning
  const code3 = store.createRoom();
  const httpSession = { id: 'http-1', alias: 'WebUser', ws: null, lastSeen: Date.now() - 70000 };
  store.getRoom(code3).clients.add(httpSession);
  assert.strictEqual(store.getRoom(code3).clients.size, 1);
  store.purgeExpiredRooms();
  assert.strictEqual(store.getRoom(code3).clients.size, 0, 'Stale HTTP client (>60s) must be pruned from room');

  store.destroy();
  console.log('   ✓ Store, Panic Button & TTL auto-purge tests passed');
}

console.log('\n🎉 All unit & integration tests completed successfully!\n');
