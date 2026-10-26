/**
 * s7ghost - In-Memory Ephemeral Room Store with Automatic Purge
 * 
 * Guarantees zero persistent storage, low memory footprint on Raspberry Pi,
 * and reliable 1-hour auto-destruction TTL.
 */

import { generateRoomCode } from './utils.js';

// 1 hour in milliseconds
export const TTL_INACTIVITY_MS = 60 * 60 * 1000;
export const TTL_MAX_LIFETIME_MS = 60 * 60 * 1000;

export class RoomManager {
  constructor({ purgeIntervalMs = 30000 } = {}) {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, { reason: string, at: number }>} */
    this.tombstones = new Map();
    
    // Background purge daemon
    this.purgeTimer = setInterval(() => {
      this.purgeExpiredRooms();
    }, purgeIntervalMs);

    // Ensure timer doesn't prevent process exit
    if (this.purgeTimer.unref) {
      this.purgeTimer.unref();
    }
  }

  /**
   * Retrieves a tombstone for a recently destroyed/burned room
   * @param {string} code
   * @returns {object|null}
   */
  getTombstone(code) {
    const tomb = this.tombstones.get(code);
    if (!tomb) return null;
    if (Date.now() - tomb.at > 120000) {
      this.tombstones.delete(code);
      return null;
    }
    return tomb;
  }

  /**
   * Generates a unique room and registers it in memory
   * @returns {string} The created room code
   */
  createRoom() {
    let code = generateRoomCode(4);
    let attempts = 0;
    while (this.rooms.has(code) && attempts < 20) {
      code = generateRoomCode(attempts > 10 ? 5 : 4);
      attempts++;
    }

    const now = Date.now();
    const room = {
      code,
      createdAt: now,
      lastActivity: now,
      messages: [],
      clients: new Set(), // Set of client objects { id, alias, ws }
    };

    this.rooms.set(code, room);
    return code;
  }

  /**
   * Checks if a room exists and is not expired
   * @param {string} code
   * @returns {boolean}
   */
  hasRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return false;
    if (this.isExpired(room)) {
      this.deleteRoom(code, 'expired');
      return false;
    }
    return true;
  }

  /**
   * Retrieves an active room or null
   * @param {string} code
   * @returns {object|null}
   */
  getRoom(code) {
    if (!this.hasRoom(code)) return null;
    return this.rooms.get(code);
  }

  /**
   * Calculates time remaining in milliseconds before room expires
   * @param {object} room
   * @returns {number}
   */
  getTimeRemaining(room) {
    const now = Date.now();
    const timeFromCreation = (room.createdAt + TTL_MAX_LIFETIME_MS) - now;
    const timeFromActivity = (room.lastActivity + TTL_INACTIVITY_MS) - now;
    return Math.max(0, Math.min(timeFromCreation, timeFromActivity));
  }

  /**
   * Determines if a room has exceeded its lifespan
   * @param {object} room
   * @returns {boolean}
   */
  isExpired(room) {
    return this.getTimeRemaining(room) <= 0;
  }

  /**
   * Adds a connected client to a room
   * @param {string} code
   * @param {object} client { id, alias, ws }
   * @returns {object|null}
   */
  addClient(code, client) {
    const room = this.getRoom(code);
    if (!room) return null;

    room.lastActivity = Date.now();
    room.clients.add(client);

    return {
      code: room.code,
      createdAt: room.createdAt,
      timeRemaining: this.getTimeRemaining(room),
      messages: room.messages,
      users: Array.from(room.clients).map(c => ({ id: c.id, alias: c.alias }))
    };
  }

  /**
   * Removes a client from a room
   * @param {string} code
   * @param {object} client
   */
  removeClient(code, client) {
    const room = this.rooms.get(code);
    if (!room) return;

    room.clients.delete(client);
    room.lastActivity = Date.now();
  }

  /**
   * Adds a message to a room and updates activity
   * @param {string} code
   * @param {string} sender
   * @param {string} text
   * @param {object} meta
   * @returns {object|null}
   */
  addMessage(code, sender, text, meta = {}) {
    const room = this.getRoom(code);
    if (!room) return null;

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender,
      text,
      timestamp: Date.now(),
      burnAfterRead: Boolean(meta.burnAfterRead),
      ttlSec: meta.ttlSec ? Number(meta.ttlSec) : 0,
      isCode: Boolean(meta.isCode)
    };

    room.messages.push(message);
    room.lastActivity = Date.now();

    // Cap message history to 500 messages per room to guarantee low memory usage on Raspberry Pi
    if (room.messages.length > 500) {
      room.messages.shift();
    }

    return message;
  }

  /**
   * Deletes a single message by ID (used by burn-after-read)
   * @param {string} code
   * @param {string} messageId
   * @returns {boolean}
   */
  deleteMessage(code, messageId) {
    const room = this.getRoom(code);
    if (!room) return false;

    const initialLen = room.messages.length;
    room.messages = room.messages.filter(m => m.id !== messageId);
    return room.messages.length < initialLen;
  }

  /**
   * Broadcasts a JSON message to all connected clients in a room
   * @param {string} code
   * @param {object} payload
   */
  broadcast(code, payload) {
    const room = this.rooms.get(code);
    if (!room) return;

    const serialized = JSON.stringify(payload);
    for (const client of room.clients) {
      if (client.ws && client.ws.readyState === 1 /* OPEN */) {
        try {
          client.ws.send(serialized);
        } catch {
          // Socket error, handled on close/error
        }
      }
    }
  }

  /**
   * Gracefully deletes a room and notifies/disconnects any clients
   * @param {string} code
   * @param {string} reason
   */
  deleteRoom(code, reason = 'expired') {
    const room = this.rooms.get(code);
    if (!room) return;

    this.tombstones.set(code, {
      reason,
      at: Date.now()
    });

    const destructionPayload = JSON.stringify({
      type: 'room_destroyed',
      code,
      reason,
      message: reason === 'burned'
        ? 'This room was incinerated on demand. All data has been permanently cleared from RAM.'
        : 'This room has expired and has been permanently cleared from RAM.'
    });

    for (const client of room.clients) {
      if (client.ws && client.ws.readyState === 1) {
        try {
          client.ws.send(destructionPayload);
          setTimeout(() => {
            try {
              client.ws.close(1000, reason === 'burned' ? 'Room burned' : 'Room destroyed');
            } catch {}
          }, 120);
        } catch {}
      }
    }

    room.clients.clear();
    room.messages = [];
    this.rooms.delete(code);
  }

  /**
   * Instantly incinerates a room on demand (Panic Button)
   * @param {string} code
   * @returns {boolean}
   */
  burnRoom(code) {
    if (!this.rooms.has(code)) return false;
    this.deleteRoom(code, 'burned');
    return true;
  }

  /**
   * Background sweep that removes all expired rooms
   */
  purgeExpiredRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (this.isExpired(room)) {
        this.deleteRoom(code, 'expired');
      } else {
        for (const client of room.clients) {
          if (!client.ws && client.lastSeen && (now - client.lastSeen > 60000)) {
            room.clients.delete(client);
          }
        }
      }
    }

    for (const [code, tomb] of this.tombstones.entries()) {
      if (now - tomb.at > 120000) {
        this.tombstones.delete(code);
      }
    }
  }

  /**
   * Total count of active rooms in memory
   */
  get activeRoomsCount() {
    return this.rooms.size;
  }

  /**
   * Shutdown cleanup
   */
  destroy() {
    clearInterval(this.purgeTimer);
    for (const code of this.rooms.keys()) {
      this.deleteRoom(code, 'server_shutdown');
    }
  }
}
