/**
 * s7ghost - Utilities & Helpers
 */

// Charset without ambiguous characters (no 0/O, 1/I/L)
const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Generates an easily readable short room code (e.g., "A7X9")
 * @param {number} length Default 4
 * @returns {string}
 */
export function generateRoomCode(length = 4) {
  let result = '';
  const charsetLength = CHARSET.length;
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charsetLength);
    result += CHARSET[randomIndex];
  }
  return result;
}

/**
 * Validates and normalizes room codes (strictly 4-6 chars, unambiguous charset)
 * @param {string} code
 * @returns {string}
 */
export function normalizeRoomCode(code) {
  if (!code || typeof code !== 'string') return '';
  const clean = code.trim().toUpperCase().replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '');
  return clean.slice(0, 6);
}

/**
 * Validates whether a code strictly adheres to the room code schema
 * @param {string} code
 * @returns {boolean}
 */
export function isValidRoomCode(code) {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim().toUpperCase();
  return clean.length >= 4 && clean.length <= 6 && /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/.test(clean);
}

/**
 * Sanitizes an alias string
 * @param {string} alias
 * @returns {string}
 */
export function sanitizeAlias(alias) {
  if (!alias || typeof alias !== 'string') return 'Anonymous';
  const clean = alias.trim().replace(/[\r\n\t]/g, ' ');
  return clean.slice(0, 32) || 'Anonymous';
}

/**
 * Sanitizes a message payload
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  // Limit individual message size to 64KB (plenty for notes, code snippets, logs, URLs)
  const MAX_TEXT_LEN = 65536;
  return text.slice(0, MAX_TEXT_LEN);
}
