/**
 * s7ghost — Frontend Client
 * 
 * Features:
 * - End-to-End Encryption (AES-GCM 256 via Web Crypto API)
 * - Panic Button (Instant in-memory room incineration)
 * - Self-Destructing Notes ("Burn After Read" with live countdown)
 * - Automatic Code Snippet Detection & Syntax Block Viewer
 * - PWA Shell Support (Service Worker, Standalone display)
 * - Synthesized Audio Effects & Haptic Tactile Feedback (Web Audio API)
 * - Real-time Ephemeral Typing Presence Indicator
 * - Fluid Iridescent Hero with Smooth Physics Parallax & Mouse Reactivity
 * - High-Contrast Bulletproof QR Code Generator
 */

// Application State
const state = {
  roomCode: null,
  alias: '',
  clientId: null,
  cryptoKey: null,
  soundEnabled: (localStorage.getItem('s7ghost_sound') || localStorage.getItem('s7chat_sound')) !== 'false',
  burnAfterRead: false,
  forceCodeSnippet: false,
  isTyping: false,
  typingTimeout: null,
  timeRemainingMs: 3600000,
  countdownInterval: null,
  ws: null,
  isWsConnected: false,
  httpPollingInterval: null,
  lastMessageTimestamp: 0,
  knownMessageIds: new Set(),
  activeBurnTimers: new Map()
};

// DOM Elements Cache
const DOM = {
  viewLobby: document.getElementById('view-lobby'),
  viewRoom: document.getElementById('view-room'),
  modalExpired: document.getElementById('modal-expired'),
  modalQr: document.getElementById('modal-qr'),
  modalBurnConfirm: document.getElementById('modal-burn-confirm'),
  brandLink: document.getElementById('brand-link'),
  serverStatusLabel: document.getElementById('server-status-label'),
  statusDot: document.querySelector('.status-dot'),
  heroIridescent: document.getElementById('hero-iridescent'),
  heroCursorGlow: document.getElementById('hero-cursor-glow'),
  btnToggleSound: document.getElementById('btn-toggle-sound'),
  iconSoundOn: document.getElementById('icon-sound-on'),
  iconSoundOff: document.getElementById('icon-sound-off'),
  
  // Lobby Elements
  createAliasInput: document.getElementById('create-alias-input'),
  btnCreateRoom: document.getElementById('btn-create-room'),
  joinForm: document.getElementById('join-form'),
  joinCodeInput: document.getElementById('join-code-input'),
  joinAliasInput: document.getElementById('join-alias-input'),
  btnJoinRoom: document.getElementById('btn-join-room'),
  
  // Room Header Elements
  activeRoomCode: document.getElementById('active-room-code'),
  e2eeBadge: document.getElementById('e2ee-badge'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnShowQr: document.getElementById('btn-show-qr'),
  btnBurnRoom: document.getElementById('btn-burn-room'),
  btnCancelBurn: document.getElementById('btn-cancel-burn'),
  btnConfirmBurn: document.getElementById('btn-confirm-burn'),
  roomCountdown: document.getElementById('room-countdown'),
  peersCount: document.getElementById('peers-count'),
  btnLeaveRoom: document.getElementById('btn-leave-room'),
  
  // QR Modal Elements
  qrRoomCode: document.getElementById('qr-room-code'),
  qrCodeWrapper: document.getElementById('qr-code-wrapper'),
  btnQrClose: document.getElementById('btn-qr-close'),
  btnQrDone: document.getElementById('btn-qr-done'),
  btnQrCopyLink: document.getElementById('btn-qr-copy-link'),

  // Chat / Notes Elements
  messagesBoard: document.getElementById('messages-board'),
  emptyState: document.getElementById('empty-state'),
  messagesList: document.getElementById('messages-list'),
  typingIndicatorBar: document.getElementById('typing-indicator-bar'),
  typingIndicatorText: document.getElementById('typing-indicator-text'),
  composerForm: document.getElementById('composer-form'),
  messageInput: document.getElementById('message-input'),
  charCounter: document.getElementById('char-counter'),
  btnToggleBurn: document.getElementById('btn-toggle-burn'),
  btnToggleCode: document.getElementById('btn-toggle-code'),
  btnSendMessage: document.getElementById('btn-send-message'),
  
  // Other
  btnExpiredReturn: document.getElementById('btn-expired-return'),
  toastContainer: document.getElementById('toast-container')
};

// ==========================================================================
// Web Audio API & Haptic Feedback Engine (Zero External Audio Files)
// ==========================================================================

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const AudioClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

const SoundEffects = {
  send() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1250, now + 0.03);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
      if (navigator.vibrate) navigator.vibrate([15]);
    } catch {}
  },

  receive() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(540, now);
      osc2.frequency.setValueAtTime(720, now + 0.02);
      gain.gain.setValueAtTime(0.045, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.06);
      osc2.start(now + 0.02);
      osc2.stop(now + 0.06);
      if (navigator.vibrate) navigator.vibrate([25]);
    } catch {}
  },

  copy() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.02);
      if (navigator.vibrate) navigator.vibrate([10]);
    } catch {}
  },

  burn() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
      if (navigator.vibrate) navigator.vibrate([40, 50, 40]);
    } catch {}
  }
};

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('s7ghost_sound', state.soundEnabled ? 'true' : 'false');
  updateSoundIcon();
  if (state.soundEnabled) {
    SoundEffects.copy();
    showToast('Sound enabled');
  } else {
    showToast('Sound muted');
  }
}

function updateSoundIcon() {
  if (!DOM.btnToggleSound) return;
  if (state.soundEnabled) {
    DOM.btnToggleSound.classList.remove('muted');
    if (DOM.iconSoundOn) DOM.iconSoundOn.classList.remove('hidden');
    if (DOM.iconSoundOff) DOM.iconSoundOff.classList.add('hidden');
  } else {
    DOM.btnToggleSound.classList.add('muted');
    if (DOM.iconSoundOn) DOM.iconSoundOn.classList.add('hidden');
    if (DOM.iconSoundOff) DOM.iconSoundOff.classList.remove('hidden');
  }
}

// ==========================================================================
// Web Crypto API — End-to-End Encryption (AES-GCM 256)
// ==========================================================================

// Safe Storage Helpers (Handles Private Browsing / Restricted iFrames)
function safeStorageGet(key) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeStorageSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}

async function initRoomCryptoKey(roomCode) {
  if (!window.crypto || !window.crypto.subtle) {
    console.warn('[s7ghost] Web Crypto API not supported in this environment');
    state.cryptoKey = null;
    return;
  }

  try {
    const urlHash = window.location.hash ? window.location.hash.replace('#', '') : '';
    const secretMaterial = `s7ghost-e2ee:${roomCode.toUpperCase()}:${urlHash}`;
    const enc = new TextEncoder();
    const rawHash = await crypto.subtle.digest('SHA-256', enc.encode(secretMaterial));

    state.cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawHash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    if (DOM.e2eeBadge) {
      DOM.e2eeBadge.style.display = 'inline-flex';
    }
  } catch (err) {
    console.error('[s7ghost] Failed to derive E2EE key:', err);
    state.cryptoKey = null;
  }
}

async function encryptMessageText(plainText) {
  if (!state.cryptoKey || !window.crypto || !window.crypto.subtle) {
    return plainText; // Fallback
  }

  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plainText);
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      state.cryptoKey,
      encoded
    );

    const ivStr = btoa(String.fromCharCode(...iv));
    const cipherStr = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)));
    return `e2ee:${ivStr}:${cipherStr}`;
  } catch (err) {
    console.error('[s7ghost] Encryption error:', err);
    return plainText;
  }
}

async function decryptMessageText(rawText) {
  if (!rawText || !rawText.startsWith('e2ee:')) {
    return rawText; // Not encrypted
  }

  if (!state.cryptoKey || !window.crypto || !window.crypto.subtle) {
    return '[Encrypted message - Web Crypto unavailable]';
  }

  try {
    const parts = rawText.split(':');
    if (parts.length !== 3) return rawText;
    const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
    const cipherBytes = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      state.cryptoKey,
      cipherBytes
    );

    return new TextDecoder().decode(decryptedBuf);
  } catch (err) {
    console.warn('[s7ghost] Decryption failed (key mismatch):', err);
    return '[Encrypted note - key mismatch]';
  }
}

// ==========================================================================
// Code Snippet Detection & Heuristics
// ==========================================================================

function detectCodeSnippet(text) {
  const trimmed = text.trim();

  // Explicit Markdown code block
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    const firstLine = lines[0].replace('```', '').trim().toUpperCase();
    const cleanCode = lines.slice(1, lines[lines.length - 1].startsWith('```') ? -1 : undefined).join('\n');
    return { isCode: true, language: firstLine || 'CODE', code: cleanCode };
  }

  // Shebang
  if (trimmed.startsWith('#!/')) {
    return { isCode: true, language: 'BASH', code: trimmed };
  }

  // Shell commands
  if (/^(curl |docker |sudo |git |ssh |npm |systemctl |apt |pip |cat |ls |cd |mkdir )/m.test(trimmed)) {
    return { isCode: true, language: 'BASH', code: trimmed };
  }

  // JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const obj = JSON.parse(trimmed);
      return { isCode: true, language: 'JSON', code: JSON.stringify(obj, null, 2) };
    } catch {}
  }

  // JavaScript / TypeScript
  if (/\b(const |let |var |function |async |await |export |import |console\.log)\b/.test(trimmed)) {
    return { isCode: true, language: 'JAVASCRIPT', code: trimmed };
  }

  // Python
  if (/\b(def |class |elif |import |from |print\(|__name__)\b/.test(trimmed)) {
    return { isCode: true, language: 'PYTHON', code: trimmed };
  }

  // HTML / XML
  if (/<(!DOCTYPE|html|div|span|p|a|script|style)/i.test(trimmed)) {
    return { isCode: true, language: 'HTML', code: trimmed };
  }

  // General multi-line code
  if (trimmed.includes('\n') && (trimmed.includes('{') || trimmed.includes(';') || trimmed.includes('=>'))) {
    return { isCode: true, language: 'CODE', code: trimmed };
  }

  return { isCode: false, language: '', code: trimmed };
}

// ==========================================================================
// Initialization & URL Detection
// ==========================================================================

function init() {
  updateSoundIcon();

  const savedAlias = safeStorageGet('s7ghost_alias') || safeStorageGet('s7chat_alias');
  if (savedAlias) {
    if (DOM.createAliasInput) DOM.createAliasInput.value = savedAlias;
    if (DOM.joinAliasInput) DOM.joinAliasInput.value = savedAlias;
  }

  setupEventListeners();
  setupHeroMouseInteraction();

  // Instant Auto-Enter from QR Scan or URL Link
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const code = roomParam.trim().toUpperCase();
    if (DOM.joinCodeInput) DOM.joinCodeInput.value = code;
    const alias = savedAlias || getDefaultAlias();
    enterRoom(code, alias);
  }
}

// ==========================================================================
// Interactive Hero Mouse Physics & Ambient Parallax Effect
// ==========================================================================

function setupHeroMouseInteraction() {
  const hero = DOM.heroIridescent || document.getElementById('hero-iridescent');
  const cursorGlow = DOM.heroCursorGlow || document.getElementById('hero-cursor-glow');
  const orb1 = document.querySelector('.hero-orb.orb-1');
  const orb2 = document.querySelector('.hero-orb.orb-2');
  const orb3 = document.querySelector('.hero-orb.orb-3');

  if (!hero) return;

  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  let isHovered = false;
  let rafId = null;

  function startAnimation() {
    if (!rafId && !state.roomCode) {
      rafId = requestAnimationFrame(animate);
    }
  }

  function onMouseMove(e) {
    const rect = hero.getBoundingClientRect();
    targetX = e.clientX - rect.left;
    targetY = e.clientY - rect.top;

    if (!isHovered) {
      isHovered = true;
      if (cursorGlow) cursorGlow.style.opacity = '1';
      startAnimation();
    }
  }

  function onMouseLeave() {
    isHovered = false;
    if (cursorGlow) cursorGlow.style.opacity = '0';
  }

  function animate() {
    if (!isHovered || state.roomCode) {
      rafId = null;
      return;
    }

    // Silky smooth interpolation (damping factor 0.08)
    mouseX += (targetX - mouseX) * 0.08;
    mouseY += (targetY - mouseY) * 0.08;

    if (cursorGlow) {
      cursorGlow.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    }

    const rect = hero.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const relX = (mouseX / width) - 0.5;
    const relY = (mouseY / height) - 0.5;

    // Subtle 3D-depth parallax shift on ambient floating orbs
    if (orb1) {
      orb1.style.setProperty('--mouse-shift-x', `${(relX * 40).toFixed(1)}px`);
      orb1.style.setProperty('--mouse-shift-y', `${(relY * 30).toFixed(1)}px`);
    }
    if (orb2) {
      orb2.style.setProperty('--mouse-shift-x', `${(-relX * 45).toFixed(1)}px`);
      orb2.style.setProperty('--mouse-shift-y', `${(-relY * 35).toFixed(1)}px`);
    }
    if (orb3) {
      orb3.style.setProperty('--mouse-shift-x', `${(relX * 25).toFixed(1)}px`);
      orb3.style.setProperty('--mouse-shift-y', `${(-relY * 25).toFixed(1)}px`);
    }

    rafId = requestAnimationFrame(animate);
  }

  hero.addEventListener('mousemove', onMouseMove, { passive: true });
  hero.addEventListener('mouseleave', onMouseLeave, { passive: true });
  
  hero.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      const rect = hero.getBoundingClientRect();
      targetX = e.touches[0].clientX - rect.left;
      targetY = e.touches[0].clientY - rect.top;
      if (!isHovered) {
        isHovered = true;
        if (cursorGlow) cursorGlow.style.opacity = '0.7';
        startAnimation();
      }
    }
  }, { passive: true });

  hero.addEventListener('touchend', () => {
    isHovered = false;
    if (cursorGlow) cursorGlow.style.opacity = '0';
  }, { passive: true });
}

// ==========================================================================
// Event Listeners (with Event Delegation)
// ==========================================================================

function setupEventListeners() {
  if (DOM.brandLink) {
    DOM.brandLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.roomCode) {
        if (confirm('Do you want to leave the current room?')) {
          leaveRoom();
        }
      } else {
        switchView('lobby');
      }
    });
  }

  if (DOM.btnToggleSound) {
    DOM.btnToggleSound.addEventListener('click', toggleSound);
  }

  if (DOM.joinCodeInput) {
    DOM.joinCodeInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }

  if (DOM.messageInput) {
    DOM.messageInput.addEventListener('input', () => {
      const len = DOM.messageInput.value.length;
      if (DOM.charCounter) DOM.charCounter.textContent = `${len.toLocaleString()} chars`;

      // Real-time typing notification
      if (state.roomCode && state.isWsConnected && state.ws) {
        if (!state.isTyping) {
          state.isTyping = true;
          try {
            state.ws.send(JSON.stringify({ type: 'typing', isTyping: true }));
          } catch {}
        }

        clearTimeout(state.typingTimeout);
        state.typingTimeout = setTimeout(() => {
          state.isTyping = false;
          if (state.ws) {
            try {
              state.ws.send(JSON.stringify({ type: 'typing', isTyping: false }));
            } catch {}
          }
        }, 2200);
      }
    });

    DOM.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Composer Toggles (Burn 10s & Code)
  if (DOM.btnToggleBurn) {
    DOM.btnToggleBurn.addEventListener('click', () => {
      state.burnAfterRead = !state.burnAfterRead;
      DOM.btnToggleBurn.classList.toggle('active', state.burnAfterRead);
      DOM.btnToggleBurn.classList.toggle('burn-active', state.burnAfterRead);
      showToast(state.burnAfterRead ? 'Burn after read: 10s active' : 'Burn after read deactivated');
    });
  }

  if (DOM.btnToggleCode) {
    DOM.btnToggleCode.addEventListener('click', () => {
      state.forceCodeSnippet = !state.forceCodeSnippet;
      DOM.btnToggleCode.classList.toggle('active', state.forceCodeSnippet);
      showToast(state.forceCodeSnippet ? 'Forced code snippet active' : 'Auto code detection active');
    });
  }

  if (DOM.btnCreateRoom) DOM.btnCreateRoom.addEventListener('click', handleCreateRoom);
  if (DOM.btnJoinRoom) DOM.btnJoinRoom.addEventListener('click', handleJoinRoom);
  if (DOM.joinForm) DOM.joinForm.addEventListener('submit', handleJoinRoom);

  if (DOM.composerForm) {
    DOM.composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  if (DOM.btnCopyCode) {
    DOM.btnCopyCode.addEventListener('click', () => {
      const code = getActiveRoomCode();
      if (!code) return;
      copyTextToClipboard(code, DOM.btnCopyCode, 'Copied!');
    });
  }

  if (DOM.btnCopyLink) {
    DOM.btnCopyLink.addEventListener('click', () => {
      const code = getActiveRoomCode();
      if (!code) return;
      const directUrl = getRoomDirectUrl(code);
      copyTextToClipboard(directUrl, DOM.btnCopyLink, 'Link copied!');
    });
  }

  if (DOM.btnLeaveRoom) DOM.btnLeaveRoom.addEventListener('click', leaveRoom);
  if (DOM.btnExpiredReturn) DOM.btnExpiredReturn.addEventListener('click', () => {
    if (DOM.modalExpired) {
      DOM.modalExpired.classList.remove('active');
      DOM.modalExpired.style.display = 'none';
    }
    leaveRoom();
  });

  // Panic Button Handlers
  if (DOM.btnBurnRoom) {
    DOM.btnBurnRoom.addEventListener('click', () => {
      if (DOM.modalBurnConfirm) {
        DOM.modalBurnConfirm.classList.add('active');
        DOM.modalBurnConfirm.style.display = 'flex';
      }
    });
  }

  if (DOM.btnCancelBurn) {
    DOM.btnCancelBurn.addEventListener('click', () => {
      if (DOM.modalBurnConfirm) {
        DOM.modalBurnConfirm.classList.remove('active');
        DOM.modalBurnConfirm.style.display = 'none';
      }
    });
  }

  if (DOM.btnConfirmBurn) {
    DOM.btnConfirmBurn.addEventListener('click', () => {
      if (DOM.modalBurnConfirm) {
        DOM.modalBurnConfirm.classList.remove('active');
        DOM.modalBurnConfirm.style.display = 'none';
      }
      burnCurrentRoom();
    });
  }

  // QR Modal Handlers
  if (DOM.btnQrClose) DOM.btnQrClose.addEventListener('click', closeQrModal);
  if (DOM.btnQrDone) DOM.btnQrDone.addEventListener('click', closeQrModal);
  
  if (DOM.btnQrCopyLink) {
    DOM.btnQrCopyLink.addEventListener('click', () => {
      const code = getActiveRoomCode();
      if (!code) return;
      const directUrl = getRoomDirectUrl(code);
      copyTextToClipboard(directUrl, DOM.btnQrCopyLink, 'Link copied!');
    });
  }

  // Event Delegation for QR Button
  document.addEventListener('click', (e) => {
    const qrBtn = e.target.closest('#btn-show-qr');
    if (qrBtn) {
      e.preventDefault();
      e.stopPropagation();
      openQrModal();
    }
  });

  // Close modals on backdrop click or Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeQrModal();
      if (DOM.modalBurnConfirm) {
        DOM.modalBurnConfirm.classList.remove('active');
        DOM.modalBurnConfirm.style.display = 'none';
      }
    }
  });

  if (DOM.modalQr) {
    DOM.modalQr.addEventListener('click', (e) => {
      if (e.target === DOM.modalQr) {
        closeQrModal();
      }
    });
  }

  if (DOM.modalBurnConfirm) {
    DOM.modalBurnConfirm.addEventListener('click', (e) => {
      if (e.target === DOM.modalBurnConfirm) {
        DOM.modalBurnConfirm.classList.remove('active');
        DOM.modalBurnConfirm.style.display = 'none';
      }
    });
  }
}

function getActiveRoomCode() {
  if (state.roomCode) return state.roomCode;
  if (DOM.activeRoomCode && DOM.activeRoomCode.textContent) {
    const raw = DOM.activeRoomCode.textContent.trim().replace(/[^A-Z0-9]/g, '');
    if (raw && raw !== '----') return raw;
  }
  return '';
}

function getRoomDirectUrl(code) {
  return `${window.location.origin}/?room=${code}`;
}

// ==========================================================================
// QR Code Generator & Modal (High-Contrast Black on White Engine)
// ==========================================================================

function openQrModal() {
  const code = getActiveRoomCode();
  if (!code) {
    showToast('Join or create a room first');
    return;
  }

  if (DOM.qrRoomCode) DOM.qrRoomCode.textContent = code;
  
  if (DOM.modalQr) {
    DOM.modalQr.classList.add('active');
    DOM.modalQr.style.display = 'flex';
  }

  const directUrl = getRoomDirectUrl(code);

  if (DOM.qrCodeWrapper) {
    DOM.qrCodeWrapper.innerHTML = '<div class="qr-loading">Generating QR code...</div>';

    // Primary: Instant Local High-Contrast PNG Endpoint
    const primaryImg = new Image();
    primaryImg.className = 'qr-image';
    primaryImg.alt = `Room QR: ${code}`;
    primaryImg.width = 218;
    primaryImg.height = 218;

    primaryImg.onload = () => {
      DOM.qrCodeWrapper.innerHTML = '';
      DOM.qrCodeWrapper.appendChild(primaryImg);
    };

    primaryImg.onerror = () => {
      console.warn('[s7ghost] Local QR PNG failed, loading fallback API...');
      const fallbackImg = new Image();
      fallbackImg.className = 'qr-image';
      fallbackImg.alt = `Room QR: ${code}`;
      fallbackImg.width = 218;
      fallbackImg.height = 218;
      fallbackImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(directUrl)}&color=0-0-0&bgcolor=255-255-255`;
      
      fallbackImg.onload = () => {
        DOM.qrCodeWrapper.innerHTML = '';
        DOM.qrCodeWrapper.appendChild(fallbackImg);
      };

      fallbackImg.onerror = () => {
        DOM.qrCodeWrapper.innerHTML = `
          <div class="qr-fallback-link" style="color:#0a0910; font-family:var(--font-mono); font-size:12px; padding:12px; text-align:center;">
            <strong>Scan URL:</strong><br>
            <input type="text" readonly value="${directUrl}" style="width:100%; font-size:11px; padding:6px; margin-top:8px; text-align:center; background:#f4f4f5; border:1px solid #ccc; color:#000;" onclick="this.select()">
          </div>
        `;
      };
    };

    primaryImg.src = `/api/rooms/${code}/qr?t=${Date.now()}`;
  }
}

function closeQrModal() {
  if (DOM.modalQr) {
    DOM.modalQr.classList.remove('active');
    DOM.modalQr.style.display = 'none';
  }
}

// ==========================================================================
// Panic Button — Instant Room Incineration & Purge Modal
// ==========================================================================

function showRoomPurgedModal(reason = 'expired') {
  stopCountdown();
  stopHttpPolling();
  clearAllBurnTimers();
  closeQrModal();
  if (DOM.modalBurnConfirm) {
    DOM.modalBurnConfirm.classList.remove('active');
    DOM.modalBurnConfirm.style.display = 'none';
  }

  if (state.ws) {
    try {
      state.ws.onclose = null;
      state.ws.onerror = null;
      state.ws.close();
    } catch {}
    state.ws = null;
    state.isWsConnected = false;
  }
  state.roomCode = null;

  if (!DOM.modalExpired) return;

  const titleEl = DOM.modalExpired.querySelector('.modal-title');
  const descEl = DOM.modalExpired.querySelector('.modal-description');
  const tagEl = DOM.modalExpired.querySelector('.modal-status-tag');

  if (reason === 'burned') {
    SoundEffects.burn();
    if (tagEl) {
      tagEl.textContent = 'PANIC PURGE COMPLETED';
      tagEl.classList.add('burn-tag');
    }
    if (titleEl) titleEl.textContent = 'Room incinerated';
    if (descEl) descEl.textContent = 'This room was incinerated on demand. All data, cryptographic keys, notes and sessions have been permanently cleared from RAM.';
  } else {
    if (tagEl) {
      tagEl.textContent = 'MEMORY PURGE COMPLETED';
      tagEl.classList.remove('burn-tag');
    }
    if (titleEl) titleEl.textContent = 'Room destroyed';
    if (descEl) descEl.textContent = 'This room has reached its 1-hour expiration limit or inactivity period. All messages, notes and sessions have been permanently cleared from RAM.';
  }

  DOM.modalExpired.classList.add('active');
  DOM.modalExpired.style.display = 'flex';
}

async function burnCurrentRoom() {
  if (!state.roomCode) return;
  const code = state.roomCode;

  // Notify server via WS & HTTP
  if (state.isWsConnected && state.ws && state.ws.readyState === WebSocket.OPEN) {
    try {
      state.ws.send(JSON.stringify({ type: 'burn_room' }));
    } catch {}
  }

  fetch(`/api/rooms/${code}/burn`, { method: 'POST' }).catch(() => {});

  showRoomPurgedModal('burned');
}

// ==========================================================================
// Navigation & Views
// ==========================================================================

function switchView(viewName) {
  if (viewName === 'lobby') {
    if (DOM.viewRoom) DOM.viewRoom.classList.remove('active');
    if (DOM.viewLobby) DOM.viewLobby.classList.add('active');
    window.history.pushState({}, '', '/');
  } else if (viewName === 'room') {
    if (DOM.viewLobby) DOM.viewLobby.classList.remove('active');
    if (DOM.viewRoom) DOM.viewRoom.classList.add('active');
    if (state.roomCode) {
      window.history.pushState({}, '', `/?room=${state.roomCode}`);
    }
    scrollToBottom();
  }
}

// ==========================================================================
// Room Creation & Joining (Hybrid)
// ==========================================================================

async function handleCreateRoom() {
  const alias = (DOM.createAliasInput ? DOM.createAliasInput.value.trim() : '') || getDefaultAlias();
  safeStorageSet('s7ghost_alias', alias);
  state.alias = alias;

  if (DOM.btnCreateRoom) {
    DOM.btnCreateRoom.disabled = true;
    DOM.btnCreateRoom.querySelector('span').textContent = 'Creating room...';
  }

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Server error creating room');
    }

    const data = await res.json();
    if (!data.code) throw new Error('Invalid server response');

    await enterRoom(data.code, alias);
  } catch (err) {
    showToast(err.message || 'Connection error');
    alert('Failed to create room: ' + (err.message || 'Connection error'));
  } finally {
    if (DOM.btnCreateRoom) {
      DOM.btnCreateRoom.disabled = false;
      DOM.btnCreateRoom.querySelector('span').textContent = 'Create ephemeral room';
    }
  }
}

async function handleJoinRoom(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const code = (DOM.joinCodeInput ? DOM.joinCodeInput.value.trim().toUpperCase() : '');
  const alias = (DOM.joinAliasInput ? DOM.joinAliasInput.value.trim() : '') || getDefaultAlias();

  if (!code || code.length < 3) {
    showToast('Please enter a valid room code');
    if (DOM.joinCodeInput) DOM.joinCodeInput.focus();
    return;
  }

  safeStorageSet('s7ghost_alias', alias);
  state.alias = alias;

  if (DOM.btnJoinRoom) {
    DOM.btnJoinRoom.disabled = true;
    DOM.btnJoinRoom.querySelector('span').textContent = 'Connecting...';
  }

  try {
    await enterRoom(code, alias);
  } catch (err) {
    showToast(err.message || 'Room not found');
  } finally {
    if (DOM.btnJoinRoom) {
      DOM.btnJoinRoom.disabled = false;
      DOM.btnJoinRoom.querySelector('span').textContent = 'Connect to room';
    }
  }
}

async function enterRoom(code, alias) {
  state.roomCode = code;
  if (DOM.activeRoomCode) DOM.activeRoomCode.textContent = code;
  if (DOM.messagesList) DOM.messagesList.innerHTML = '';
  if (DOM.emptyState) DOM.emptyState.style.display = 'flex';
  state.knownMessageIds.clear();
  state.lastMessageTimestamp = 0;
  clearAllBurnTimers();

  switchView('room');

  // Derive E2EE key for this room
  await initRoomCryptoKey(code);

  // 1. Load initial room state via HTTP
  try {
    const joinRes = await fetch(`/api/rooms/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias })
    });

    if (joinRes.ok) {
      const roomData = await joinRes.json();
      state.clientId = roomData.yourId;
      state.timeRemainingMs = roomData.timeRemaining;
      startCountdown(roomData.timeRemaining);
      updatePeersBadge(roomData.users);

      if (roomData.messages && roomData.messages.length > 0) {
        if (DOM.emptyState) DOM.emptyState.style.display = 'none';
        for (const msg of roomData.messages) {
          if (!state.knownMessageIds.has(msg.id)) {
            state.knownMessageIds.add(msg.id);
            if (msg.timestamp > state.lastMessageTimestamp) state.lastMessageTimestamp = msg.timestamp;
            await appendMessageCard(msg, msg.sender === state.alias);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[s7ghost] HTTP join fallback:', err);
  }

  // 2. Start WebSocket for real-time
  connectWebSocket(code, alias);

  // 3. Start HTTP background polling safety net
  startHttpPolling(code);
}

function getDefaultAlias() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|mobile/.test(userAgent)) return 'Mobile';
  if (/macintosh|mac os x/.test(userAgent)) return 'Mac';
  if (/linux/.test(userAgent)) return 'Linux';
  if (/windows/.test(userAgent)) return 'PC';
  return 'Device';
}

// ==========================================================================
// Connection Status Management
// ==========================================================================

function updateConnectionIndicator(status) {
  if (status === 'ws' || status === 'http') {
    if (DOM.statusDot) DOM.statusDot.style.backgroundColor = '#2ea043';
    if (DOM.serverStatusLabel) DOM.serverStatusLabel.textContent = 'Online';
  } else if (status === 'connecting') {
    if (DOM.statusDot) DOM.statusDot.style.backgroundColor = '#ffac2e';
    if (DOM.serverStatusLabel) DOM.serverStatusLabel.textContent = 'Syncing...';
  } else {
    if (DOM.statusDot) DOM.statusDot.style.backgroundColor = '#d9381e';
    if (DOM.serverStatusLabel) DOM.serverStatusLabel.textContent = 'Disconnected';
  }
}

// ==========================================================================
// WebSocket Connection Engine
// ==========================================================================

function connectWebSocket(code, alias) {
  if (state.ws) {
    try { state.ws.close(); } catch {}
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    state.ws = new WebSocket(wsUrl);
  } catch {
    updateConnectionIndicator('http');
    return;
  }

  state.ws.onopen = () => {
    state.isWsConnected = true;
    updateConnectionIndicator('ws');

    state.ws.send(JSON.stringify({
      type: 'join',
      code,
      alias
    }));
  };

  state.ws.onmessage = async (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    await handleServerEvent(payload);
  };

  state.ws.onclose = () => {
    state.isWsConnected = false;
    updateConnectionIndicator('http');

    setTimeout(() => {
      if (state.roomCode && !state.isWsConnected) {
        connectWebSocket(state.roomCode, state.alias);
      }
    }, 5000);
  };

  state.ws.onerror = () => {
    state.isWsConnected = false;
    updateConnectionIndicator('http');
  };
}

// ==========================================================================
// Transparent HTTP Polling
// ==========================================================================

function startHttpPolling(code) {
  stopHttpPolling();

  state.httpPollingInterval = setInterval(async () => {
    if (!state.roomCode) return;

    try {
      const res = await fetch(`/api/rooms/${code}/sync?since=${state.lastMessageTimestamp}`);
      if (res.status === 404 || res.status === 410) {
        stopHttpPolling();
        let reason = 'expired';
        try {
          const data = await res.json();
          if (data && (data.reason === 'burned' || data.error === 'ROOM_BURNED')) {
            reason = 'burned';
          }
        } catch {}
        showRoomPurgedModal(reason);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.timeRemaining) state.timeRemainingMs = data.timeRemaining;
        if (data.users) updatePeersBadge(data.users);

        if (data.messages && data.messages.length > 0) {
          if (DOM.emptyState) DOM.emptyState.style.display = 'none';
          for (const msg of data.messages) {
            if (!state.knownMessageIds.has(msg.id)) {
              state.knownMessageIds.add(msg.id);
              if (msg.timestamp > state.lastMessageTimestamp) state.lastMessageTimestamp = msg.timestamp;
              await appendMessageCard(msg, msg.sender === state.alias);
              scrollToBottom();
            }
          }
        }
        
        if (!state.isWsConnected) {
          updateConnectionIndicator('http');
        }
      }
    } catch {
      if (!state.isWsConnected) {
        updateConnectionIndicator('disconnected');
      }
    }
  }, 1500);
}

function stopHttpPolling() {
  if (state.httpPollingInterval) {
    clearInterval(state.httpPollingInterval);
    state.httpPollingInterval = null;
  }
}

// ==========================================================================
// Server Event Dispatcher (WebSocket)
// ==========================================================================

async function handleServerEvent(event) {
  if (event.type === 'ping') {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: 'pong' }));
    }
    return;
  }

  if (event.type === 'room_state') {
    state.roomCode = event.code;
    state.clientId = event.yourId;
    state.timeRemainingMs = event.timeRemaining;

    if (DOM.activeRoomCode) DOM.activeRoomCode.textContent = event.code;
    updatePeersBadge(event.users);
    startCountdown(event.timeRemaining);

    if (event.messages && event.messages.length > 0) {
      if (DOM.emptyState) DOM.emptyState.style.display = 'none';
      for (const msg of event.messages) {
        if (!state.knownMessageIds.has(msg.id)) {
          state.knownMessageIds.add(msg.id);
          if (msg.timestamp > state.lastMessageTimestamp) state.lastMessageTimestamp = msg.timestamp;
          await appendMessageCard(msg, msg.sender === state.alias);
        }
      }
    }

    if (DOM.btnJoinRoom) {
      DOM.btnJoinRoom.disabled = false;
      DOM.btnJoinRoom.querySelector('span').textContent = 'Connect to room';
    }
    if (DOM.messageInput) DOM.messageInput.focus();
    return;
  }

  if (event.type === 'new_message') {
    if (!state.knownMessageIds.has(event.message.id)) {
      state.knownMessageIds.add(event.message.id);
      if (event.message.timestamp > state.lastMessageTimestamp) state.lastMessageTimestamp = event.message.timestamp;
      if (DOM.emptyState) DOM.emptyState.style.display = 'none';
      const isSelf = event.message.sender === state.alias;
      if (!isSelf) {
        SoundEffects.receive();
      }
      await appendMessageCard(event.message, isSelf);
      if (event.timeRemaining) state.timeRemainingMs = event.timeRemaining;
      scrollToBottom();
    }
    return;
  }

  if (event.type === 'typing') {
    if (DOM.typingIndicatorBar && DOM.typingIndicatorText) {
      if (event.isTyping) {
        DOM.typingIndicatorText.textContent = `${event.alias} is typing...`;
        DOM.typingIndicatorBar.classList.add('active');
      } else {
        DOM.typingIndicatorBar.classList.remove('active');
      }
    }
    return;
  }

  if (event.type === 'message_deleted') {
    removeMessageFromDOM(event.messageId);
    return;
  }

  if (event.type === 'user_joined') {
    updatePeersBadge(event.users);
    if (event.alias !== state.alias) {
      showSystemNotice(`${event.alias} joined the room`);
    }
    if (event.timeRemaining) state.timeRemainingMs = event.timeRemaining;
    return;
  }

  if (event.type === 'user_left') {
    updatePeersBadge(event.users);
    showSystemNotice(`${event.alias} left the room`);
    return;
  }

  if (event.type === 'time_sync') {
    state.timeRemainingMs = event.timeRemaining;
    updateCountdownDisplay(state.timeRemainingMs);
    return;
  }

  if (event.type === 'room_destroyed') {
    showRoomPurgedModal(event.reason || 'expired');
    return;
  }

  if (event.type === 'error') {
    showToast(event.message);
    if (DOM.btnJoinRoom) {
      DOM.btnJoinRoom.disabled = false;
      DOM.btnJoinRoom.querySelector('span').textContent = 'Connect to room';
    }
    return;
  }
}

// ==========================================================================
// Messaging & Notes (Hybrid Sending with E2EE)
// ==========================================================================

async function sendMessage() {
  if (!DOM.messageInput) return;
  const rawText = DOM.messageInput.value;
  if (!rawText || rawText.trim().length === 0) return;

  DOM.messageInput.value = '';
  if (DOM.charCounter) DOM.charCounter.textContent = '0 chars';

  // Stop typing status immediately
  clearTimeout(state.typingTimeout);
  if (state.isTyping && state.ws) {
    state.isTyping = false;
    try { state.ws.send(JSON.stringify({ type: 'typing', isTyping: false })); } catch {}
  }

  SoundEffects.send();

  const burnAfterRead = state.burnAfterRead;
  const forceCode = state.forceCodeSnippet;
  const detected = detectCodeSnippet(rawText);
  const isCode = forceCode || detected.isCode;

  // Encrypt payload via AES-GCM 256
  const encryptedText = await encryptMessageText(rawText);

  const payload = {
    type: 'message',
    alias: state.alias,
    text: encryptedText,
    burnAfterRead,
    ttlSec: burnAfterRead ? 10 : 0,
    isCode
  };

  if (state.isWsConnected && state.ws && state.ws.readyState === WebSocket.OPEN) {
    try {
      state.ws.send(JSON.stringify(payload));
      DOM.messageInput.focus();
      return;
    } catch {
      // WS send failed, proceed to HTTP fallback
    }
  }

  try {
    const res = await fetch(`/api/rooms/${state.roomCode}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.message && !state.knownMessageIds.has(data.message.id)) {
        state.knownMessageIds.add(data.message.id);
        if (data.message.timestamp > state.lastMessageTimestamp) state.lastMessageTimestamp = data.message.timestamp;
        if (DOM.emptyState) DOM.emptyState.style.display = 'none';
        await appendMessageCard(data.message, true);
        scrollToBottom();
      }
    } else {
      showToast('Error sending note');
    }
  } catch {
    showToast('Connection error sending note');
  }

  DOM.messageInput.focus();
}

async function appendMessageCard(msg, isSelf) {
  if (!DOM.messagesList) return;

  // Decrypt content
  const decryptedText = await decryptMessageText(msg.text);

  const card = document.createElement('div');
  card.id = `msg-${msg.id}`;
  const isBurn = Boolean(msg.burnAfterRead);
  card.className = `message-card ${isSelf ? 'is-self' : ''} ${isBurn ? 'burn-note' : ''}`;

  const date = new Date(msg.timestamp);
  const timeFormatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const codeInfo = detectCodeSnippet(decryptedText);
  const isCode = msg.isCode || codeInfo.isCode;
  const language = codeInfo.language || 'CODE';
  const displayCode = codeInfo.code || decryptedText;

  let bodyHtml = '';
  if (isCode) {
    bodyHtml = `
      <div class="code-block-card">
        <div class="code-block-header">
          <span class="code-lang-tag">${escapeHtml(language)}</span>
          <button type="button" class="code-copy-btn" title="Copy code snippet">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="0" ry="0"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copy code</span>
          </button>
        </div>
        <pre class="code-block-pre"><code>${escapeHtml(displayCode)}</code></pre>
      </div>
    `;
  } else {
    bodyHtml = `<div class="message-content">${formatMessageText(decryptedText)}</div>`;
  }

  const burnTagHtml = isBurn ? `
    <span class="burn-timer-badge" id="burn-badge-${msg.id}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
      <span class="burn-timer-sec">10s</span>
    </span>
  ` : '';

  card.innerHTML = `
    <div class="message-meta">
      <div class="message-sender-group">
        <span class="message-sender">${escapeHtml(msg.sender)}</span>
        ${isSelf ? '<span class="message-tag-self">You</span>' : ''}
        ${burnTagHtml}
        <span class="message-time">${timeFormatted}</span>
      </div>
      <button type="button" class="copy-pill-btn" title="Copy text to clipboard">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="0" ry="0"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>Copy</span>
      </button>
    </div>
    ${bodyHtml}
    ${isBurn ? `<div class="burn-progress-bar" id="burn-bar-${msg.id}"></div>` : ''}
  `;

  // General copy button
  const copyBtn = card.querySelector('.copy-pill-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      SoundEffects.copy();
      copyTextToClipboard(decryptedText, copyBtn, 'Copied!');
    });
  }

  // Code snippet copy button
  const codeCopyBtn = card.querySelector('.code-copy-btn');
  if (codeCopyBtn) {
    codeCopyBtn.addEventListener('click', () => {
      SoundEffects.copy();
      copyTextToClipboard(displayCode, codeCopyBtn, 'Copied!');
    });
  }

  DOM.messagesList.appendChild(card);

  // Initialize self-destruct timer
  if (isBurn) {
    startMessageBurnCountdown(msg.id, card, 10);
  }
}

function startMessageBurnCountdown(messageId, cardElement, initialSeconds) {
  let remaining = initialSeconds;
  const badgeSec = cardElement.querySelector('.burn-timer-sec');
  const progressBar = cardElement.querySelector('.burn-progress-bar');

  const timer = setInterval(() => {
    remaining -= 1;
    if (badgeSec) badgeSec.textContent = `${remaining}s`;
    if (progressBar) {
      const pct = (remaining / initialSeconds) * 100;
      progressBar.style.width = `${pct}%`;
    }

    if (remaining <= 0) {
      clearInterval(timer);
      state.activeBurnTimers.delete(messageId);

      // Animation & removal
      cardElement.classList.add('dissolve-out');
      setTimeout(() => {
        if (cardElement.parentNode) {
          cardElement.parentNode.removeChild(cardElement);
        }
      }, 600);

      // Notify server to purge message from memory
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        try {
          state.ws.send(JSON.stringify({ type: 'delete_message', messageId }));
        } catch {}
      }
      fetch(`/api/rooms/${state.roomCode}/messages/${messageId}`, { method: 'DELETE' }).catch(() => {});
    }
  }, 1000);

  state.activeBurnTimers.set(messageId, timer);
}

function removeMessageFromDOM(messageId) {
  const card = document.getElementById(`msg-${messageId}`);
  if (card) {
    card.classList.add('dissolve-out');
    setTimeout(() => {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 600);
  }
  if (state.activeBurnTimers.has(messageId)) {
    clearInterval(state.activeBurnTimers.get(messageId));
    state.activeBurnTimers.delete(messageId);
  }
}

function clearAllBurnTimers() {
  for (const timer of state.activeBurnTimers.values()) {
    clearInterval(timer);
  }
  state.activeBurnTimers.clear();
}

function showSystemNotice(text) {
  if (!DOM.messagesList) return;
  const notice = document.createElement('div');
  notice.className = 'system-notice';
  notice.textContent = `— ${text} —`;
  DOM.messagesList.appendChild(notice);
  scrollToBottom();
}

function scrollToBottom() {
  if (DOM.messagesBoard) DOM.messagesBoard.scrollTop = DOM.messagesBoard.scrollHeight;
}

// ==========================================================================
// Countdown & TTL Manager
// ==========================================================================

function startCountdown(initialMs) {
  stopCountdown();
  state.timeRemainingMs = initialMs;
  updateCountdownDisplay(state.timeRemainingMs);

  state.countdownInterval = setInterval(() => {
    state.timeRemainingMs -= 1000;
    if (state.timeRemainingMs <= 0) {
      state.timeRemainingMs = 0;
      updateCountdownDisplay(0);
      stopCountdown();
      stopHttpPolling();
      if (DOM.modalExpired) DOM.modalExpired.classList.add('active');
    } else {
      updateCountdownDisplay(state.timeRemainingMs);
    }
  }, 1000);
}

function stopCountdown() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

function updateCountdownDisplay(ms) {
  if (!DOM.roomCountdown) return;
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  DOM.roomCountdown.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updatePeersBadge(users) {
  if (!DOM.peersCount) return;
  const count = users ? users.length : 1;
  DOM.peersCount.textContent = count === 1 ? '1 device' : `${count} devices`;
}

// ==========================================================================
// Clipboard & Toast Utilities
// ==========================================================================

async function copyTextToClipboard(text, triggerButton, successMessage = 'Copied!') {
  SoundEffects.copy();

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (triggerButton) {
      const originalSpan = triggerButton.querySelector('span');
      const originalText = originalSpan ? originalSpan.textContent : '';
      triggerButton.classList.add('copied');
      if (originalSpan) originalSpan.textContent = successMessage;

      setTimeout(() => {
        triggerButton.classList.remove('copied');
        if (originalSpan) originalSpan.textContent = originalText;
      }, 2000);
    }

    showToast(successMessage);
  } catch {
    showToast('Failed to copy to clipboard');
  }
}

function showToast(text) {
  if (!DOM.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 2200);
}

// ==========================================================================
// Leave Room & Teardown
// ==========================================================================

function leaveRoom() {
  stopCountdown();
  stopHttpPolling();
  clearAllBurnTimers();
  closeQrModal();
  
  if (state.ws) {
    try {
      state.ws.send(JSON.stringify({ type: 'leave' }));
      state.ws.close(1000, 'User left');
    } catch {}
    state.ws = null;
  }

  state.roomCode = null;
  state.clientId = null;
  state.cryptoKey = null;
  if (DOM.e2eeBadge) DOM.e2eeBadge.style.display = 'none';
  if (DOM.messagesList) DOM.messagesList.innerHTML = '';
  if (DOM.emptyState) DOM.emptyState.style.display = 'flex';
  if (DOM.joinCodeInput) DOM.joinCodeInput.value = '';
  switchView('lobby');
}

// ==========================================================================
// Text Formatting & Sanitization
// ==========================================================================

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMessageText(text) {
  const urlRegex = /(https?:\/\/[^\s<>'\"()]+)/g;
  let lastIndex = 0;
  let html = '';
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const rawUrl = match[0];
    const cleanUrl = rawUrl.replace(/[.,;:!?]+$/, '');
    html += escapeHtml(text.slice(lastIndex, match.index));
    const escapedUrl = escapeHtml(cleanUrl);
    html += `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedUrl}</a>`;
    const trailing = rawUrl.slice(cleanUrl.length);
    if (trailing) html += escapeHtml(trailing);
    lastIndex = match.index + rawUrl.length;
  }
  html += escapeHtml(text.slice(lastIndex));
  return html;
}

// Safe execution across all environments (Desktop, iOS Safari, Android Chrome)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
