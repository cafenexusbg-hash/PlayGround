import * as THREE from 'three';
import './style.css';

// ============================================================
// VEER: Wrath of the Asuras — God-of-War-style hack & slash
// Indian mythology · Third-person 3D · Desktop (keyboard+mouse)
// ============================================================

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const ARENA_R = 24;

// ---------------- Input ----------------
const keys = {};
let mouseDX = 0, mouseDY = 0;
let pointerLocked = false;
let dragging = false, lastMX = 0, lastMY = 0;
const input = { lightQueued: false, heavyQueued: false, dodgeQueued: false, rageQueued: false };

window.addEventListener('keydown', (e) => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (state.mode === 'story' && (e.code === 'Enter' || e.code === 'Space')) { advanceStory(); return; }
  if (state.mode === 'boon') {
    if (e.code === 'Digit1') buyBoon(0);
    else if (e.code === 'Digit2') buyBoon(1);
    else if (e.code === 'Digit3') buyBoon(2);
    else if (e.code === 'Enter' || e.code === 'Digit0' || e.code === 'Escape') skipBoon();
    return;
  }
  if (e.code === 'KeyJ') input.lightQueued = true;
  if (e.code === 'KeyK' || e.code === 'KeyF') input.heavyQueued = true;
  if (e.code === 'Space' || e.code === 'ShiftLeft') input.dodgeQueued = true;
  if (e.code === 'KeyR') input.rageQueued = true;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'Enter') {
    if (!$('title-screen').classList.contains('hidden')) startGame();
    else if (!$('death-screen').classList.contains('hidden') || !$('victory-screen').classList.contains('hidden')) startGame();
  }
  if (e.code === 'KeyF' && e.ctrlKey === false && state.mode === 'playing') { /* F is heavy, fullscreen on G */ }
  if (e.code === 'KeyG') toggleFullscreen();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
  else document.exitFullscreen?.().catch(()=>{});
}

const canvas = $('game-canvas');
canvas.addEventListener('mousedown', (e) => {
  if (state.mode === 'story') { advanceStory(); return; }
  if (state.mode !== 'playing') return;
  if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch {} }
  if (e.button === 0) input.lightQueued = true;
  if (e.button === 2) input.heavyQueued = true;
  dragging = true; lastMX = e.clientX; lastMY = e.clientY;
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    mouseDX += e.movementX; mouseDY += e.movementY;
  } else if (dragging && state.mode === 'playing') {
    mouseDX += (e.clientX - lastMX) * 2.2; mouseDY += (e.clientY - lastMY) * 2.2;
    lastMX = e.clientX; lastMY = e.clientY;
  }
});
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------- Mobile / touch controls ----------------
// Floating left-thumb joystick (move) + right-thumb drag (camera) + buttons.
// ?touch=1 forces touch mode (for desktop testing).
const IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
  || ('ontouchstart' in window)
  || (typeof location !== 'undefined' && location.search.includes('touch=1'));
const JOY_R = 60;
const touch = {
  moveId: null, lookId: null,
  ox: 0, oy: 0, dx: 0, dy: 0,   // joystick anchor + offset (px)
  lx: 0, ly: 0,                 // look last pos
  block: false,
};
if (IS_TOUCH) document.body.classList.add('touch');

function bindBtn(id, down, up) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); AudioSys.init(); down(); });
  const u = (e) => { e.preventDefault(); if (up) up(); };
  el.addEventListener('pointerup', u);
  el.addEventListener('pointercancel', u);
  el.addEventListener('lostpointercapture', () => {});
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
function setupTouch() {
  bindBtn('btn-atk', () => { input.lightQueued = true; });
  bindBtn('btn-heavy', () => { input.heavyQueued = true; });
  bindBtn('btn-dodge', () => { input.dodgeQueued = true; });
  bindBtn('btn-rage', () => { input.rageQueued = true; });
  bindBtn('btn-block', () => { touch.block = true; }, () => { touch.block = false; });
  bindBtn('btn-pause', () => togglePause());
  const joyBase = $('joy-base'), joyKnob = $('joy-knob');
  canvas.addEventListener('touchstart', (e) => {
    AudioSys.init();
    if (state.mode === 'story') { advanceStory(); return; }
    if (state.mode !== 'playing') return;
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth * 0.45 && touch.moveId === null) {
        touch.moveId = t.identifier;
        touch.ox = t.clientX; touch.oy = t.clientY;
        touch.dx = 0; touch.dy = 0;
        if (joyBase) {
          joyBase.style.left = t.clientX + 'px';
          joyBase.style.top = t.clientY + 'px';
          joyBase.classList.add('on');
        }
        if (joyKnob) joyKnob.style.transform = 'translate(0px,0px)';
      } else if (touch.lookId === null) {
        touch.lookId = t.identifier;
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.moveId) {
        let dx = t.clientX - touch.ox, dy = t.clientY - touch.oy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
        touch.dx = dx; touch.dy = dy;
        if (joyKnob) joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
      } else if (t.identifier === touch.lookId) {
        mouseDX += (t.clientX - touch.lx) * 2.4;
        mouseDY += (t.clientY - touch.ly) * 2.4;
        touch.lx = t.clientX; touch.ly = t.clientY;
      }
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.moveId) {
        touch.moveId = null; touch.dx = 0; touch.dy = 0;
        if (joyBase) joyBase.classList.remove('on');
      }
      if (t.identifier === touch.lookId) touch.lookId = null;
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
}

// ---------------- Audio (procedural, WebAudio) ----------------
const AudioSys = {
  ctx: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startDrums();
    } catch {}
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  env(g, t0, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  },
  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
    if (!this.ctx) return;
    const t = this.now();
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    this.env(g, t, vol, dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol = 0.3, filterFreq = 2000, q = 1) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = q;
    const g = this.ctx.createGain(); this.env(g, t, vol, dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  whoosh() { this.noise(0.22, 0.35, 900, 0.8); },
  heavyWhoosh() { this.noise(0.35, 0.45, 500, 0.7); },
  hit() { this.noise(0.15, 0.5, 2500, 1); this.tone(140, 0.15, 'square', 0.25, 60); },
  heavyHit() { this.noise(0.3, 0.6, 1400, 1); this.tone(90, 0.35, 'sawtooth', 0.4, 40); },
  block() { this.tone(600, 0.12, 'square', 0.2, 300); this.noise(0.1, 0.25, 4000, 2); },
  parry() { this.tone(880, 0.4, 'triangle', 0.4, 1760); this.tone(1320, 0.3, 'sine', 0.25, 660); },
  dodge() { this.noise(0.18, 0.2, 700, 1); },
  hurt() { this.tone(220, 0.25, 'sawtooth', 0.35, 90); },
  die() { this.tone(300, 0.5, 'sawtooth', 0.3, 50); this.noise(0.4, 0.3, 800, 1); },
  rage() { this.tone(65, 1.2, 'sawtooth', 0.5, 130); this.tone(98, 1.2, 'sawtooth', 0.4, 196); this.noise(1.0, 0.3, 300, 0.6); },
  roar() { this.tone(70, 1.0, 'sawtooth', 0.55, 45); this.noise(0.9, 0.4, 250, 0.8); },
  wave() { [196, 261, 329, 392].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.3), i * 110)); },
  victory() { [261, 329, 392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'triangle', 0.32), i * 150)); },
  drum(t, freq, vol) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.25);
  },
  startDrums() {
    if (!this.ctx || this._drums) return; this._drums = true;
    const loop = () => {
      if (!this.ctx) return;
      const t = this.now() + 0.05;
      const tempo = state.mode === 'playing' ? 0.32 : 0.6;
      for (let i = 0; i < 8; i++) {
        const tt = t + i * tempo;
        if (i % 4 === 0) this.drum(tt, 120, 0.28);
        else if (i % 2 === 0) this.drum(tt, 90, 0.16);
        if (state.rageActive && i % 2 === 1) this.drum(tt + tempo / 2, 150, 0.14);
      }
      setTimeout(loop, 8 * tempo * 1000);
    };
    loop();
  }
};

// ---------------- Hindi Voiceover (Web Speech API, hi-IN) ----------------
// A Hindi battle-announcer (yuddh-ghoshak). Uses the OS/browser Hindi voice
// when available (Chrome/Edge desktop ship one), otherwise falls back to the
// default voice. No network or API key needed. Toggle with the HUD button.
const VoiceSys = {
  enabled: (() => { try { return localStorage.getItem('veer_voice') !== 'off'; } catch { return true; } })(),
  voice: null,
  lastSpoken: '',
  cooldowns: {},
  init() {
    try {
      const pick = () => {
        try {
          const vs = speechSynthesis.getVoices();
          this.voice = vs.find((v) => v.lang && v.lang.toLowerCase().startsWith('hi'))
            || vs.find((v) => v.lang && v.lang.toLowerCase().includes('hi'))
            || vs.find((v) => v.name && /hindi/i.test(v.name))
            || null;
        } catch {}
      };
      pick();
      if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = pick;
      }
    } catch {}
    this.syncBtn();
  },
  syncBtn() {
    const b = $('voice-btn');
    if (b) {
      b.textContent = this.enabled ? '🔊 वाणी: ON' : '🔇 वाणी: OFF';
      b.classList.toggle('off', !this.enabled);
    }
  },
  toggle() {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('veer_voice', this.enabled ? 'on' : 'off');
      if (!this.enabled) speechSynthesis.cancel();
    } catch {}
    this.syncBtn();
    return this.enabled;
  },
  speak(text, opts = {}) {
    this.lastSpoken = text;
    if (!this.enabled) return;
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    const now = performance.now() / 1000;
    if (opts.key) {
      const last = this.cooldowns[opts.key] || -1e9;
      if (now - last < (opts.cooldown || 0)) return;
      this.cooldowns[opts.key] = now;
    }
    try {
      if (opts.interrupt) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'hi-IN';
      if (this.voice) u.voice = this.voice;
      u.rate = opts.rate || 1.0;
      u.pitch = opts.pitch != null ? opts.pitch : 0.85;
      u.volume = 1.0;
      speechSynthesis.speak(u);
    } catch {}
  }
};

const VOICE_LINES = {
  start: 'युद्ध आरंभ! धर्म की रक्षा करो, वीर!',
  wave0: 'पहली लहर! असुर आ रहे हैं! सावधान वीर!',
  wave1: 'दूसरी लहर! राक्षस आ गए हैं! डटे रहो!',
  wave2: 'हर हर महादेव! महिषासुर आ गया! अंतिम युद्ध!',
  cleared: 'शाबाश वीर! लहर समाप्त! अगली लहर के लिए तैयार रहो!',
  rageReady: 'रुद्र प्रकोप तैयार है! R दबाओ!',
  rage: 'रुद्र प्रकोप! संहार करो वीर!',
  lowHp: 'सावधान वीर! प्राण संकट में हैं!',
  parry: 'वाह! उत्तम पलटवार!',
  bossRage: 'महिषासुर क्रोधित हुआ है! संभल कर वीर!',
  victory: 'विजय! धर्म की जीत हुई! साधु! साधु!',
  death: 'वीर गिर गया... पुनर्जन्म लो, और फिर लड़ो!',
};

// ---------------- Story screenplays (cinematic cutscenes) ----------------
// Letterboxed, typewriter dialogue, Hindi voice — the emotional spine.
const CUTSCENES = {
  intro: { lines: [
    { who: 'NARRATOR', cls: 'narr', en: 'Five nights ago, Mahishasura\u2019s legion came down the ghats like a black river. By dawn, Veer\u2019s village was ash.', hi: 'पाँच रात पहले, महिषासुर की सेना काली नदी की तरह आई। सवेरे तक वीर का गाँव राख हो चुका था।' },
    { who: 'MEERA ♥', cls: 'meera', en: 'Veer\u2026 promise me. Whatever burns tonight \u2014 let dharma rise from its ashes.', hi: 'वीर\u2026 वचन दो। जो भी जले, उसकी राख से धर्म उठेगा।' },
    { who: 'VEER', cls: 'veer', en: 'I held her hand till the lamp went out. Then I picked up my father\u2019s khadga.', hi: 'दीया बुझने तक मैंने उसका हाथ थामा। फिर पिता की खड्ग उठाई।' },
    { who: 'VEER', cls: 'veer', en: 'For Meera. For every home. Tonight \u2014 I AM the fire.', hi: 'मीरा के लिए! हर घर के लिए! आज रात \u2014 मैं ही अग्नि हूँ!' },
  ] },
  preboss: { lines: [
    { who: '🐃 MAHISHASURA', cls: 'boss', en: 'Little spark. I drowned a hundred villages. What is one more widower with a sword?', hi: 'नन्ही चिंगारी! मैंने सौ गाँव डुबोए। एक और विधुर तलवार लेकर क्या करेगा?' },
    { who: 'VEER', cls: 'veer', en: 'You took my world, demon. Come \u2014 and take my blade.', hi: 'तूने मेरी दुनिया छीनी। आ \u2014 मेरी खड्ग भी ले जा।' },
  ] },
  victory: { lines: [
    { who: 'INDRA', cls: 'boss', en: 'The throne... is empty... without worship...', hi: 'सिंहासन... सूना है... पूजा बिना...' },
    { who: 'VEER', cls: 'veer', en: 'Then let silence be your hymn. This... is for Meera.', hi: 'तो सन्नाटा ही तेरा भजन होगा। ये... मीरा के लिए।' },
    { who: 'NARRATOR', cls: 'narr', en: 'Veer lit a single diya amid the ruins — for Meera. Destruction had its fill; love kept the last flame. ॥ विजय ॥', hi: 'वीर ने खंडहरों में एक दीया जलाया — मीरा के लिए। विनाश तृप्त हुआ; प्रेम ने अंतिम ज्योति बचाई।' },
  ] },
  reveal: { lines: [
    { who: '🐃 MAHISHASURA', cls: 'boss', en: 'Hold... warrior. The devas paid me in temple gold... to burn the Solar Line. Your family... was Heaven\u2019s price.', hi: 'रुक... योद्धा। देवताओं ने मुझे मंदिर का सोना दिया... सूर्यवंश को जलाने के लिए। तेरा परिवार... स्वर्ग की कीमत था।' },
    { who: 'VEER', cls: 'veer', en: 'Then Heaven will pay... in kind. Your killer thanks you — for the truth.', hi: 'तो स्वर्ग चुकाएगा... उसी सिक्के में।' },
    { who: 'NARRATOR', cls: 'narr', en: 'Veer bound his wounds, strung Meera\u2019s anklet to his chain — and turned his blade toward the sky.', hi: 'वीर ने घाव बाँधे, मीरा की पायल अपनी ज़ंजीर में गूँथी — और खड्ग आसमान की ओर उठाई।' },
  ] },
  throne: { lines: [
    { who: 'NARRATOR', cls: 'narr', en: 'Svarga\u2019s golden gates lie shattered. Above, the Storm Throne cracks the sky.', hi: 'स्वर्ग के सुनहरे द्वार टूट चुके। ऊपर, तूफ़ानी सिंहासन आसमान चीरता है।' },
    { who: '⚡ INDRA', cls: 'boss', en: 'You dare raise a mortal blade to Heaven, widower? I crown kings with storms!', hi: 'तू स्वर्ग पर नश्वर खड्ग उठाएगा, विधुर? मैं तूफ़ानों से राजाओं को ताज पहनाता हूँ!' },
    { who: 'VEER', cls: 'veer', en: 'You sent demons to do your butchery. Tonight the butcher answers — with interest.', hi: 'तूने राक्षसों से क़त्ल कराया। आज रात क़ातिल जवाब देगा — सूद समेत।' },
  ] },
  indra_pre: { lines: [
    { who: '⚡ INDRA', cls: 'boss', en: 'I am the storm that crowns kings! Kneel, mortal — and I shall make you a god.', hi: 'मैं वो तूफ़ान हूँ जो राजाओं को ताज पहनाता है! झुक जा — तुझे देवता बनाऊँगा।' },
    { who: 'VEER', cls: 'veer', en: 'I was a husband. You made me a reckoning.', hi: 'मैं पति था। तूने मुझे प्रलय बना दिया।' },
  ] },
};
const story = { id: null, idx: 0, full: '', shown: 0, timer: null, active: false, onDone: null };
function storyLine(i) {
  story.idx = i;
  const L = CUTSCENES[story.id].lines[i];
  $('dlg-speaker').textContent = L.who;
  $('dlg-speaker').className = 'spk-' + L.cls;
  story.full = L.en; story.shown = 0;
  clearInterval(story.timer);
  $('dlg-text').textContent = '';
  story.timer = setInterval(() => {
    story.shown++;
    $('dlg-text').textContent = story.full.slice(0, story.shown);
    if (story.shown >= story.full.length) clearInterval(story.timer);
  }, 22);
  VoiceSys.speak(L.hi, { interrupt: true });
}
function playCutscene(id, onDone) {
  clearQueuedInputs();
  state.mode = 'story';
  story.id = id; story.onDone = onDone || null; story.active = true;
  document.body.classList.add('cine');
  $('dialogue').classList.remove('hidden');
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  storyLine(0);
}
function advanceStory() {
  if (!story.active || state.mode !== 'story') return;
  if (story.shown < story.full.length) {
    clearInterval(story.timer);
    story.shown = story.full.length;
    $('dlg-text').textContent = story.full;
    return;
  }
  if (story.idx + 1 < CUTSCENES[story.id].lines.length) storyLine(story.idx + 1);
  else endCutscene();
}
function endCutscene() {
  clearInterval(story.timer);
  story.active = false;
  document.body.classList.remove('cine');
  $('dialogue').classList.add('hidden');
  try { speechSynthesis.cancel(); } catch {}
  const cb = story.onDone; story.onDone = null;
  if (cb) cb();
}

// ---------------- Renderer / Scene ----------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(IS_TOUCH ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0d06);
scene.fog = new THREE.Fog(0x2a1408, 30, 110);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Lights
const hemi = new THREE.HemisphereLight(0xffd9a0, 0x331505, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
sun.position.set(-18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 512 : 1024, IS_TOUCH ? 512 : 1024);
sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
sun.shadow.camera.far = 90;
scene.add(sun);
// cool cinematic rim light from behind
const rim = new THREE.DirectionalLight(0x6a8cff, 0.55);
rim.position.set(16, 14, -22);
scene.add(rim);
const torchLights = [];
for (let i = 0; i < 3; i++) {
  const pl = new THREE.PointLight(0xff7a1a, 25, 22, 1.8);
  scene.add(pl); torchLights.push(pl);
}

// ---------------- Canvas textures ----------------
function makeGroundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, 1024, 1024);
  // stone tiles
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = 60 + Math.random() * 25;
    g.fillStyle = `rgb(${v + 18},${v * 0.78},${v * 0.55})`;
    g.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
  }
  // cracks + speckle for aged realism
  g.strokeStyle = 'rgba(20,10,5,0.5)';
  for (let i = 0; i < 42; i++) {
    g.lineWidth = rand(1, 2.5);
    let x = rand(0, 1024), y = rand(0, 1024);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += rand(-40, 40); y += rand(-40, 40); g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rand(0.03, 0.09)})` : `rgba(255,230,180,${rand(0.03, 0.09)})`;
    g.fillRect(rand(0, 1024), rand(0, 1024), rand(1, 3), rand(1, 3));
  }
  const cx = 512, cy = 512;
  // big mandala rings
  const rings = [460, 420, 340, 300, 220, 180, 110, 80];
  rings.forEach((r, i) => {
    g.strokeStyle = i % 2 ? '#c98a2b' : '#8a4d12';
    g.lineWidth = i % 2 ? 5 : 9;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  });
  // petals
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 24 : 16, r0 = ring ? 300 : 180, r1 = ring ? 340 : 220;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.fillStyle = i % 2 ? '#d98a1f' : '#a33d00';
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.beginPath(); g.ellipse((r0 + r1) / 2, 0, (r1 - r0) / 2, 16, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  // rangoli dots
  g.fillStyle = '#ffd54a';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    g.beginPath(); g.arc(cx + Math.cos(a) * 420, cy + Math.sin(a) * 420, 7, 0, Math.PI * 2); g.fill();
  }
  // Om in center
  g.fillStyle = '#ff9d00'; g.font = 'bold 120px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ॐ', cx, cy);
  g.strokeStyle = '#ffe0a3'; g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, 105, 0, Math.PI * 2); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function makeFlameTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 36, 2, 32, 36, 30);
  grad.addColorStop(0, 'rgba(255,255,220,1)');
  grad.addColorStop(0.3, 'rgba(255,200,60,0.95)');
  grad.addColorStop(0.6, 'rgba(255,110,10,0.55)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const flameTex = makeFlameTexture();

// ---------------- Arena ----------------
const flames = [];
const diyaPositions = [];
let arenaGroundMat = null;
let arenaSun = null;
const actProps = { svarga: null, throne: null };
function buildArena() {
  // ground
  const gtex = makeGroundTexture();
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_R + 6, 48),
    new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.9, metalness: 0.05 })
  );
  arenaGroundMat = ground.material;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // outer dark earth
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(ARENA_R + 6, 160, 32),
    new THREE.MeshStandardMaterial({ color: 0x201209, roughness: 1 })
  );
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02;
  scene.add(outer);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8d7b66, roughness: 0.85 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x5d4c3c, roughness: 0.9 });

  // pillars ring
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = ARENA_R + 2.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const broken = (i % 4 === 3);
    const h = broken ? rand(2.5, 4) : rand(7, 9);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, h, 8), stoneMat);
    pillar.position.set(x, h / 2, z);
    pillar.castShadow = pillar.receiveShadow = true;
    scene.add(pillar);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 2.6), darkStone);
    cap.position.set(x, h + 0.4, z);
    cap.castShadow = true;
    scene.add(cap);
    if (broken) {
      const rubble = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.4), darkStone);
      rubble.position.set(x + rand(-2, 2), 0.6, z + rand(-2, 2));
      rubble.rotation.set(rand(0, 1), rand(0, 3), rand(0, 1));
      rubble.castShadow = true;
      scene.add(rubble);
    }
    // diya bowls on intact pillars' inner side
    if (!broken && i % 2 === 0) {
      const diya = makeDiya(x * 0.88, z * 0.88);
      scene.add(diya);
    }
  }

  // temple gate (spawn backdrop, north)
  const gateMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 0.8 });
  [-4, 4].forEach((x) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.8, 12, 1.8), gateMat);
    p.position.set(x, 6, -ARENA_R - 4);
    p.castShadow = true;
    scene.add(p);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(12, 1.8, 2.2), gateMat);
  lintel.position.set(0, 12.5, -ARENA_R - 4);
  lintel.castShadow = true;
  scene.add(lintel);
  // trishul emblem on lintel
  const gold = new THREE.MeshStandardMaterial({ color: 0xd99a1f, emissive: 0x552200, roughness: 0.4, metalness: 0.7 });
  const tri = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6), gold);
  tri.add(shaft);
  [-0.7, 0, 0.7].forEach((x, i) => {
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.16, i === 1 ? 1.4 : 1.0, 6), gold);
    prong.position.set(x, i === 1 ? 2.2 : 1.9, 0);
    tri.add(prong);
  });
  tri.position.set(0, 14.6, -ARENA_R - 4);
  scene.add(tri);

  // banyan trees outside
  for (let i = 0; i < 8; i++) {
    const a = rand(0, Math.PI * 2), r = rand(38, 60);
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 7, 7), new THREE.MeshStandardMaterial({ color: 0x4a2f18, roughness: 1 }));
    trunk.position.y = 3.5; trunk.castShadow = true; t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(rand(2, 3.6), 7, 6), new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 1 }));
      leaf.position.set(rand(-3, 3), rand(6, 9.5), rand(-3, 3));
      t.add(leaf);
    }
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scene.add(t);
  }

  // mountains backdrop
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(rand(10, 20), rand(18, 34), 5),
      new THREE.MeshStandardMaterial({ color: 0x3a2415, roughness: 1, flatShading: true })
    );
    m.position.set(Math.cos(a) * 110, 6, Math.sin(a) * 110);
    scene.add(m);
  }
  // giant sun disc + floating dust handled in animate

  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xff8a2a, fog: false }));
  sunDisc.position.set(-60, 34, -95);
  sunDisc.lookAt(0, 8, 0);
  scene.add(sunDisc);
  arenaSun = sunDisc;

  // saffron banners on gate
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0xe65100, side: THREE.DoubleSide, roughness: 0.9 });
  [-2.5, 2.5].forEach((x) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 5, 1, 4), bannerMat);
    b.position.set(x, 9.5, -ARENA_R - 3.8);
    b.userData.isBanner = true;
    scene.add(b); flames.push(b);
  });

  // ---- act-specific set dressing ----
  actProps.svarga = new THREE.Group();
  const goldM = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.8, roughness: 0.3 });
  const whiteM = new THREE.MeshStandardMaterial({ color: 0xf5f0dc, roughness: 0.8 });
  for (const gx of [-8, 8]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 14, 8), whiteM);
    col.position.set(gx, 7, -ARENA_R - 8); col.castShadow = true;
    actProps.svarga.add(col);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(8, 1.0, 8, 20, Math.PI), goldM);
  arch.position.set(0, 6, -ARENA_R - 8);
  actProps.svarga.add(arch);
  for (let ci = 0; ci < 6; ci++) {
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false }));
    cl.position.set(rand(-50, 50), rand(18, 30), rand(-70, -30));
    cl.scale.set(rand(14, 26), rand(6, 10), 1);
    actProps.svarga.add(cl);
  }
  actProps.svarga.visible = false;
  scene.add(actProps.svarga);
  actProps.throne = new THREE.Group();
  const rockM = new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 1, flatShading: true });
  for (let ri = 0; ri < 9; ri++) {
    const a = (ri / 9) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(rand(1.5, 3), rand(6, 14), 5), rockM);
    rock.position.set(Math.cos(a) * (ARENA_R + 7), rand(1, 3), Math.sin(a) * (ARENA_R + 7));
    rock.rotation.z = rand(-0.3, 0.3);
    rock.castShadow = true;
    actProps.throne.add(rock);
  }
  actProps.throne.visible = false;
  scene.add(actProps.throne);
}

function applyActMood(i) {
  state.stormT = 4;
  if (i === 1) {
    // Svarga — blinding celestial gold
    scene.background.set(0x87b5e0); scene.fog.color.set(0xcfe0f0); scene.fog.near = 40; scene.fog.far = 150;
    hemi.color.set(0xfff6e0); hemi.groundColor.set(0x8a7a5a); hemi.intensity = 1.15;
    sun.color.set(0xfff5d6); sun.intensity = 1.5;
    if (arenaGroundMat) arenaGroundMat.color.set(0xf7e8c8);
    if (arenaSun) { arenaSun.material.color.set(0xfff3c4); arenaSun.position.set(30, 55, -90); }
  } else if (i === 2) {
    // Storm Throne — bruised violet dark
    scene.background.set(0x0d0a18); scene.fog.color.set(0x1a1430); scene.fog.near = 22; scene.fog.far = 95;
    hemi.color.set(0x8a7bd8); hemi.groundColor.set(0x0d0a18); hemi.intensity = 0.6;
    sun.color.set(0x9a8cff); sun.intensity = 1.0;
    if (arenaGroundMat) arenaGroundMat.color.set(0x8a8aa0);
    if (arenaSun) { arenaSun.material.color.set(0x6a5acd); arenaSun.position.set(0, 20, -100); }
  } else {
    // Temple of Agni — ember dusk
    scene.background.set(0x1a0d06); scene.fog.color.set(0x2a1408); scene.fog.near = 30; scene.fog.far = 110;
    hemi.color.set(0xffd9a0); hemi.groundColor.set(0x331505); hemi.intensity = 0.95;
    sun.color.set(0xffb36b); sun.intensity = 1.9;
    if (arenaGroundMat) arenaGroundMat.color.set(0xffffff);
    if (arenaSun) { arenaSun.material.color.set(0xff8a2a); arenaSun.position.set(-60, 34, -95); }
  }
  if (actProps.svarga) actProps.svarga.visible = i === 1;
  if (actProps.throne) actProps.throne.visible = i === 2;
}

function makeDiya(x, z) {
  const grp = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x6d4c2f, roughness: 0.7 }));
  bowl.position.y = 0.35; bowl.castShadow = true;
  grp.add(bowl);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x4a3520 }));
  stand.position.y = -0.2; grp.add(stand);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.y = 1.0; flame.scale.set(0.9, 1.3, 1);
  grp.add(flame);
  grp.position.set(x, 0.6, z);
  grp.userData.flame = flame;
  flames.push(grp);
  diyaPositions.push(new THREE.Vector3(x, 1.5, z));
  return grp;
}

// ---------------- Particles (single Points cloud) ----------------
const PMAX = 600;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3);
const pCol = new Float32Array(PMAX * 3);
const pVel = new Float32Array(PMAX * 3);
const pLife = new Float32Array(PMAX);
const pMaxLife = new Float32Array(PMAX);
const pGrav = new Float32Array(PMAX);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
const points = new THREE.Points(pGeo, pMat);
points.frustumCulled = false;
scene.add(points);
let pCursor = 0;
function spawnParticles(pos, n, color, speed = 6, life = 0.7, grav = -9, up = 3) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const k = pCursor; pCursor = (pCursor + 1) % PMAX;
    pPos[k * 3] = pos.x + rand(-0.3, 0.3);
    pPos[k * 3 + 1] = pos.y + rand(-0.2, 0.4);
    pPos[k * 3 + 2] = pos.z + rand(-0.3, 0.3);
    const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
    pVel[k * 3] = Math.cos(a) * s;
    pVel[k * 3 + 1] = rand(up * 0.3, up);
    pVel[k * 3 + 2] = Math.sin(a) * s;
    const shade = rand(0.7, 1.3);
    pCol[k * 3] = clamp(c.r * shade, 0, 1);
    pCol[k * 3 + 1] = clamp(c.g * shade, 0, 1);
    pCol[k * 3 + 2] = clamp(c.b * shade, 0, 1);
    pLife[k] = pMaxLife[k] = life * rand(0.6, 1.2);
    pGrav[k] = grav;
  }
}
function updateParticles(dt) {
  for (let k = 0; k < PMAX; k++) {
    if (pLife[k] <= 0) { pPos[k * 3 + 1] = -100; continue; }
    pLife[k] -= dt;
    pVel[k * 3 + 1] += pGrav[k] * dt;
    pPos[k * 3] += pVel[k * 3] * dt;
    pPos[k * 3 + 1] += pVel[k * 3 + 1] * dt;
    pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt;
    if (pPos[k * 3 + 1] < 0.05 && pVel[k * 3 + 1] < 0) { pVel[k * 3 + 1] *= -0.4; pPos[k * 3 + 1] = 0.05; }
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

// shockwave rings pool
const rings = [];
function spawnRing(pos, color = 0xff9d00, maxR = 6) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.0, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.copy(pos); m.position.y = Math.max(0.15, pos.y * 0.3);
  m.userData = { t: 0, maxR };
  scene.add(m); rings.push(m);
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const m = rings[i];
    m.userData.t += dt * 2.4;
    const t = m.userData.t;
    const s = 1 + t * m.userData.maxR;
    m.scale.set(s, s, 1);
    m.material.opacity = 0.9 * (1 - t);
    if (t >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); rings.splice(i, 1); }
  }
}

// slash arcs pool
const slashes = [];
function spawnSlash(pos, yaw, big = false, color = 0xffe0a3) {
  const geo = new THREE.TorusGeometry(big ? 2.6 : 1.9, big ? 0.28 : 0.18, 8, 20, Math.PI * 1.1);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(pos);
  m.rotation.set(0, yaw, 0.35);
  m.userData = { t: 0 };
  scene.add(m); slashes.push(m);
}
function updateSlashes(dt) {
  for (let i = slashes.length - 1; i >= 0; i--) {
    const m = slashes[i];
    m.userData.t += dt * 5;
    m.scale.multiplyScalar(1 + dt * 3);
    m.material.opacity = 0.95 * (1 - m.userData.t);
    if (m.userData.t >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); slashes.splice(i, 1); }
  }
}

// ---------------- Damage numbers ----------------
const dmgLayer = $('dmg-layer');
const dmgPool = [];
function spawnDmgNum(worldPos, text, cls = '') {
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return;
  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
  let el = dmgPool.pop();
  if (!el) { el = document.createElement('div'); }
  el.className = 'dmg-num ' + cls;
  el.textContent = text;
  el.style.left = (x + rand(-14, 14)) + 'px';
  el.style.top = (y - 10) + 'px';
  dmgLayer.appendChild(el);
  setTimeout(() => { el.remove(); dmgPool.push(el); }, 820);
}

// ---------------- Character factory ----------------
function lambert(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1, ...opts }); }
function basicMesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function buildHumanoid(o = {}) {
  // o: { kind: hero|grunt|brute|boss|deva|elite|indra, skin, cloth, trim, scale }
  // Semi-realistic proportions: defined limbs, armored torso, detailed face.
  const kind = o.kind || (o.boss ? 'boss' : o.brute ? 'brute' : o.enemy ? 'grunt' : 'hero');
  const isHero = kind === 'hero';
  const isBoss = kind === 'boss' || kind === 'indra';
  const isBrute = kind === 'brute' || kind === 'elite';
  const isDeva = kind === 'deva' || kind === 'elite' || kind === 'indra';
  const g = new THREE.Group();
  const s = o.scale || 1;
  const skin = new THREE.MeshStandardMaterial({ color: o.skin ?? 0xb5773f, roughness: 0.55, metalness: 0.05 });
  const cloth = new THREE.MeshStandardMaterial({ color: o.cloth ?? 0xc62828, roughness: 0.95, metalness: 0 });
  const trim = new THREE.MeshStandardMaterial({ color: o.trim ?? 0xffb300, metalness: 0.85, roughness: 0.32 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a93a0, metalness: 0.9, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241209, roughness: 0.9 });
  const hairM = new THREE.MeshStandardMaterial({ color: isDeva ? 0x1a1a22 : 0x120b06, roughness: 0.95 });

  // ---- legs: thigh + shin + sandaled foot ----
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.20 * s, 1.04 * s, 0); legR.position.set(0.20 * s, 1.04 * s, 0);
  for (const leg of [legL, legR]) {
    const thigh = basicMesh(new THREE.CapsuleGeometry(0.15 * s, 0.30 * s, 3, 6), skin, 0, -0.24 * s, 0);
    leg.add(thigh);
    const knee = basicMesh(new THREE.SphereGeometry(0.11 * s, 6, 5), skin, 0, -0.46 * s, 0.02 * s);
    leg.add(knee);
    const shin = basicMesh(new THREE.CapsuleGeometry(0.105 * s, 0.30 * s, 3, 6), skin, 0, -0.66 * s, 0);
    leg.add(shin);
    if (isHero || isDeva) { // greave guard
      const gr = basicMesh(new THREE.BoxGeometry(0.16 * s, 0.3 * s, 0.06 * s), isHero ? trim : steel, 0, -0.64 * s, 0.11 * s);
      leg.add(gr);
    }
    const foot = basicMesh(new THREE.BoxGeometry(0.16 * s, 0.09 * s, 0.32 * s), dark, 0, -0.90 * s, 0.06 * s);
    leg.add(foot);
    g.add(leg);
  }
  // dhoti wrap + front pleat
  const dhoti = basicMesh(new THREE.CylinderGeometry(0.35 * s, 0.46 * s, 0.52 * s, 10), cloth, 0, 1.04 * s, 0);
  g.add(dhoti);
  const pleat = basicMesh(new THREE.BoxGeometry(0.17 * s, 0.56 * s, 0.07 * s), cloth, 0, 0.82 * s, 0.40 * s);
  pleat.rotation.x = 0.08;
  g.add(pleat);
  const belt = basicMesh(new THREE.TorusGeometry(0.36 * s, 0.045 * s, 6, 12), trim, 0, 1.28 * s, 0);
  belt.rotation.x = Math.PI / 2;
  g.add(belt);

  // ---- torso: waist + muscled chest + armor ----
  const waist = basicMesh(new THREE.CylinderGeometry(0.27 * s, 0.32 * s, 0.35 * s, 10), skin, 0, 1.48 * s, 0);
  g.add(waist);
  const chest = basicMesh(new THREE.SphereGeometry(0.34 * s, 10, 8), skin, 0, 1.80 * s, 0);
  chest.scale.set(1.12, 0.92, 0.82);
  g.add(chest);
  // pectoral definition
  for (const px of [-0.13, 0.13]) {
    const pec = basicMesh(new THREE.SphereGeometry(0.13 * s, 7, 6), skin, px * s, 1.86 * s, 0.24 * s);
    pec.scale.set(1, 0.8, 0.6);
    g.add(pec);
  }
  // kavach (breastplate) for hero / devas / bosses
  if (isHero || isDeva || isBoss) {
    const plate = basicMesh(new THREE.CylinderGeometry(0.375 * s, 0.33 * s, 0.42 * s, 10, 1, true, -Math.PI * 0.7, Math.PI * 1.4),
      isHero ? trim : isDeva ? steel : trim, 0, 1.76 * s, 0);
    plate.material = plate.material.clone();
    plate.material.side = THREE.DoubleSide;
    g.add(plate);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 6, 5),
      new THREE.MeshBasicMaterial({ color: kind === 'indra' ? 0x9fd8ff : 0xff3d00 }));
    gem.position.set(0, 1.82 * s, 0.35 * s);
    g.add(gem);
  }
  // sacred thread / sash
  const thread = basicMesh(new THREE.TorusGeometry(0.33 * s, 0.035 * s, 6, 12, Math.PI * 1.1), isHero ? trim : cloth, 0, 1.78 * s, 0.05 * s);
  thread.rotation.z = Math.PI * 0.95; thread.rotation.x = 0.2; thread.rotation.y = 0.35;
  g.add(thread);
  // shoulder guards
  if (isHero || isDeva || isBrute || isBoss) {
    for (const px of [-0.46, 0.46]) {
      const pad = basicMesh(new THREE.SphereGeometry(0.17 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
        isDeva ? steel : trim, px * s, 2.02 * s, 0);
      g.add(pad);
    }
  }

  // ---- arms: upper + elbow + forearm + fist ----
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.47 * s, 1.98 * s, 0); armR.position.set(0.47 * s, 1.98 * s, 0);
  for (const [arm] of [[armL], [armR]]) {
    const upper = basicMesh(new THREE.CapsuleGeometry(0.12 * s, 0.26 * s, 3, 6), skin, 0, -0.18 * s, 0);
    arm.add(upper);
    const bic = basicMesh(new THREE.SphereGeometry(0.125 * s, 7, 6), skin, 0, -0.22 * s, 0.02 * s);
    arm.add(bic);
    const elbow = basicMesh(new THREE.SphereGeometry(0.095 * s, 6, 5), skin, 0, -0.38 * s, 0);
    arm.add(elbow);
    const fore = basicMesh(new THREE.CapsuleGeometry(0.10 * s, 0.28 * s, 3, 6), skin, 0, -0.55 * s, 0);
    arm.add(fore);
    const fist = basicMesh(new THREE.SphereGeometry(0.115 * s, 7, 6), skin, 0, -0.78 * s, 0.01 * s);
    fist.scale.set(0.9, 1.1, 0.95);
    arm.add(fist);
    const bang = basicMesh(new THREE.TorusGeometry(0.115 * s, 0.028 * s, 6, 10), trim, 0, -0.66 * s, 0);
    bang.rotation.x = Math.PI / 2;
    arm.add(bang);
  }
  g.add(armL); g.add(armR);

  // ---- head: skull + jaw + nose + eyes + hair ----
  const headG = new THREE.Group();
  headG.position.set(0, 2.34 * s, 0);
  const neck = basicMesh(new THREE.CylinderGeometry(0.11 * s, 0.13 * s, 0.18 * s, 8), skin, 0, -0.26 * s, 0);
  headG.add(neck);
  const skull = basicMesh(new THREE.SphereGeometry(0.23 * s, 12, 10), skin, 0, 0, 0);
  skull.scale.set(0.95, 1.06, 0.98);
  headG.add(skull);
  const jaw = basicMesh(new THREE.BoxGeometry(0.26 * s, 0.15 * s, 0.20 * s), skin, 0, -0.15 * s, 0.05 * s);
  headG.add(jaw);
  const nose = basicMesh(new THREE.ConeGeometry(0.045 * s, 0.12 * s, 5), skin, 0, -0.03 * s, 0.235 * s);
  nose.rotation.x = Math.PI / 2 - 0.25;
  headG.add(nose);
  // brow ridge (fierce for asuras, noble for hero/devas)
  const brow = basicMesh(new THREE.BoxGeometry(0.30 * s, 0.05 * s, 0.06 * s), skin, 0, 0.09 * s, 0.20 * s);
  brow.rotation.x = (kind === 'grunt' || kind === 'brute' || kind === 'boss') ? 0.25 : -0.08;
  headG.add(brow);
  // eyes: white + pupil (glow for demons & gods)
  const whiteM = new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.3 });
  const pupM = (kind === 'grunt' || kind === 'brute' || kind === 'boss')
    ? new THREE.MeshBasicMaterial({ color: 0xffd54a })
    : (kind === 'indra' || kind === 'deva' || kind === 'elite')
      ? new THREE.MeshBasicMaterial({ color: 0x9fd8ff })
      : new THREE.MeshStandardMaterial({ color: 0x1a0d06, roughness: 0.2 });
  for (const px of [-0.088, 0.088]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.052 * s, 7, 6), whiteM);
    w.position.set(px * s, 0.015 * s, 0.185 * s);
    w.scale.set(1, 0.85, 0.6);
    headG.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.023 * s, 6, 5), pupM);
    p.position.set(px * s, 0.015 * s, 0.228 * s);
    headG.add(p);
  }
  // hair mass + styles
  // hair mass sits back on the skull so the face stays clear
  const hairBack = basicMesh(new THREE.SphereGeometry(0.225 * s, 9, 7), hairM, 0, 0.04 * s, -0.10 * s);
  hairBack.scale.set(0.98, 1.02, 0.72);
  headG.add(hairBack);
  if (isHero) {
    const knot = basicMesh(new THREE.SphereGeometry(0.10 * s, 8, 6), hairM, 0, 0.30 * s, -0.06 * s);
    headG.add(knot);
    const beard = basicMesh(new THREE.BoxGeometry(0.20 * s, 0.16 * s, 0.06 * s), hairM, 0, -0.26 * s, 0.13 * s);
    beard.rotation.x = 0.15;
    headG.add(beard);
    for (const px of [-0.10, 0.10]) { // warrior mustache
      const mo = basicMesh(new THREE.BoxGeometry(0.10 * s, 0.035 * s, 0.04 * s), hairM, px * s, -0.10 * s, 0.22 * s);
      mo.rotation.z = px > 0 ? -0.25 : 0.25;
      headG.add(mo);
    }
    const tilak = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.15 * s, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    tilak.position.set(0, 0.05 * s, 0.232 * s);
    headG.add(tilak);
    for (const px of [-0.24, 0.24]) { // gold earrings
      const er = basicMesh(new THREE.TorusGeometry(0.045 * s, 0.014 * s, 5, 8), trim, px * s, -0.08 * s, 0.02 * s);
      headG.add(er);
    }
    const scarf = new THREE.Mesh(new THREE.PlaneGeometry(0.5 * s, 1.0 * s, 1, 3),
      new THREE.MeshStandardMaterial({ color: 0xff6d00, side: THREE.DoubleSide, roughness: 1 }));
    scarf.position.set(0, -0.30 * s, -0.32 * s);
    scarf.rotation.x = 0.4;
    headG.add(scarf);
    headG.userData.scarf = scarf;
  } else if (kind === 'boss') {
    const snout = basicMesh(new THREE.BoxGeometry(0.34 * s, 0.24 * s, 0.32 * s), lambert(0x4a2c14), 0, -0.14 * s, 0.22 * s);
    headG.add(snout);
    for (const nx of [-0.08, 0.08]) {
      const nos = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 5, 4), new THREE.MeshBasicMaterial({ color: 0x1a0b00 }));
      nos.position.set(nx * s, -0.16 * s, 0.38 * s);
      headG.add(nos);
    }
    for (const fx of [-0.09, 0.09]) { // fangs
      const fang = basicMesh(new THREE.ConeGeometry(0.035 * s, 0.16 * s, 5), lambert(0xe8dcc0), fx * s, -0.28 * s, 0.30 * s);
      fang.rotation.x = Math.PI;
      headG.add(fang);
    }
    for (const side of [-1, 1]) {
      const horn = basicMesh(new THREE.TorusGeometry(0.44 * s, 0.095 * s, 6, 10, Math.PI * 1.2), lambert(0xe8dcc0), side * 0.32 * s, 0.18 * s, -0.05 * s);
      horn.rotation.z = side * -1.2; horn.rotation.y = side * 0.5;
      headG.add(horn);
    }
    const crown = basicMesh(new THREE.CylinderGeometry(0.2 * s, 0.27 * s, 0.32 * s, 8), trim, 0, 0.34 * s, 0);
    headG.add(crown);
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.95 * s, 1.5 * s),
      new THREE.MeshStandardMaterial({ color: 0x7b0000, side: THREE.DoubleSide, roughness: 1 }));
    cape.position.set(0, -0.75 * s, -0.34 * s);
    cape.rotation.x = 0.15;
    headG.add(cape);
    headG.userData.cape = cape;
  } else if (kind === 'indra') {
    // jeweled mukut + divine halo
    const mukut = basicMesh(new THREE.CylinderGeometry(0.19 * s, 0.25 * s, 0.30 * s, 8), trim, 0, 0.34 * s, 0);
    headG.add(mukut);
    for (let iI = 0; iI < 5; iI++) {
      const spike = basicMesh(new THREE.ConeGeometry(0.045 * s, 0.22 * s, 5), trim, (iI - 2) * 0.11 * s, 0.55 * s, 0);
      headG.add(spike);
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42 * s, 0.045 * s, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(0, 0.05 * s, -0.18 * s);
    headG.add(halo);
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(1.0 * s, 1.6 * s),
      new THREE.MeshStandardMaterial({ color: 0xf5f0dc, side: THREE.DoubleSide, roughness: 0.9 }));
    cape.position.set(0, -0.8 * s, -0.36 * s);
    cape.rotation.x = 0.15;
    headG.add(cape);
    headG.userData.cape = cape;
  } else if (isDeva) {
    const knot = basicMesh(new THREE.SphereGeometry(0.09 * s, 8, 6), hairM, 0, 0.29 * s, -0.04 * s);
    headG.add(knot);
    const helm = basicMesh(new THREE.ConeGeometry(0.10 * s, 0.42 * s, 6),
      new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.7 }), 0, 0.42 * s, -0.05 * s);
    helm.rotation.x = -0.35; // plume crest sweeping back
    headG.add(helm);
  } else {
    // asura wild hair + horns + fangs
    for (let iH = -2; iH <= 2; iH++) {
      const spike = basicMesh(new THREE.ConeGeometry(0.06 * s, (isBrute ? 0.42 : 0.30) * s, 5), hairM, iH * 0.11 * s, 0.30 * s, -0.04 * s);
      spike.rotation.z = -iH * 0.25;
      headG.add(spike);
    }
    for (const side of [-1, 1]) {
      const horn = basicMesh(new THREE.ConeGeometry(0.07 * s, (isBrute ? 0.48 : 0.32) * s, 6), dark, side * 0.20 * s, 0.22 * s, 0);
      horn.rotation.z = side * -0.55;
      headG.add(horn);
    }
    for (const fx of [-0.08, 0.08]) {
      const fang = basicMesh(new THREE.ConeGeometry(0.03 * s, 0.11 * s, 4), lambert(0xe8dcc0), fx * s, -0.22 * s, 0.19 * s);
      fang.rotation.x = Math.PI;
      headG.add(fang);
    }
  }
  g.add(headG);

  // ---- right-hand weapon rig ----
  const hand = new THREE.Group();
  hand.position.set(0, -0.80 * s, 0.06 * s);
  armR.add(hand);
  let weapon = hand;
  let chainAnchor = null;
  if (isHero) {
    // Blades of Agni: chain wrapped on forearm, blade head flies (scene-level rig)
    for (let iW = 0; iW < 3; iW++) {
      const wrap = basicMesh(new THREE.TorusGeometry(0.115 * s, 0.030 * s, 6, 10), steel, 0, (-0.52 - iW * 0.09) * s, 0);
      wrap.rotation.x = Math.PI / 2;
      armR.add(wrap);
    }
    const grip = basicMesh(new THREE.CylinderGeometry(0.055 * s, 0.055 * s, 0.30 * s, 6), dark, 0, -0.72 * s, 0.06 * s);
    armR.add(grip);
    chainAnchor = new THREE.Group();
    chainAnchor.position.set(0, -0.70 * s, 0.10 * s);
    armR.add(chainAnchor);
    weapon = hand;
  } else if (kind === 'indra') {
    // Vajra thunderbolt mace
    const shaft = basicMesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 1.1 * s, 6), dark, 0, 0.45 * s, 0);
    hand.add(shaft);
    const hub = basicMesh(new THREE.SphereGeometry(0.16 * s, 8, 6), trim, 0, 1.05 * s, 0);
    hand.add(hub);
    for (let iV = 0; iV < 4; iV++) {
      const prong = basicMesh(new THREE.ConeGeometry(0.06 * s, 0.42 * s, 5), trim, 0, 1.05 * s, 0);
      prong.position.x = Math.cos(iV / 4 * Math.PI * 2) * 0.16 * s;
      prong.position.z = Math.sin(iV / 4 * Math.PI * 2) * 0.16 * s;
      prong.rotation.z = -Math.cos(iV / 4 * Math.PI * 2) * 0.9;
      prong.rotation.x = Math.sin(iV / 4 * Math.PI * 2) * 0.9;
      hand.add(prong);
    }
    const spike = basicMesh(new THREE.ConeGeometry(0.09 * s, 0.5 * s, 6), trim, 0, 1.45 * s, 0);
    hand.add(spike);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0x9fd8ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    glow.scale.set(1.2 * s, 1.2 * s, 1);
    glow.position.set(0, 1.1 * s, 0);
    hand.add(glow);
    weapon = hand;
  } else if (kind === 'boss') {
    const handle = basicMesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 2.2 * s, 6), dark, 0, 0.6 * s, 0);
    hand.add(handle);
    const blade = basicMesh(new THREE.BoxGeometry(0.9 * s, 0.7 * s, 0.12 * s), trim, 0.3 * s, 1.5 * s, 0);
    hand.add(blade);
    weapon = hand;
  } else if (isBrute) {
    const handle = basicMesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 1.4 * s, 6), dark, 0, 0.4 * s, 0);
    hand.add(handle);
    const headM = basicMesh(new THREE.SphereGeometry(0.3 * s, 8, 6), lambert(0x3d3d4d), 0, 1.15 * s, 0);
    hand.add(headM);
    for (let i = 0; i < 5; i++) {
      const sp = basicMesh(new THREE.ConeGeometry(0.07 * s, 0.28 * s, 5), trim, 0, 1.15 * s, 0);
      sp.position.x = Math.cos(i / 5 * Math.PI * 2) * 0.28 * s;
      sp.position.z = Math.sin(i / 5 * Math.PI * 2) * 0.28 * s;
      sp.rotation.z = -Math.cos(i / 5 * Math.PI * 2) * 1.2;
      sp.rotation.x = Math.sin(i / 5 * Math.PI * 2) * 1.2;
      hand.add(sp);
    }
    weapon = hand;
  } else if (kind === 'deva') {
    // celestial spear + pennant
    const shaft = basicMesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 2.3 * s, 6), lambert(0x6d4c2f), 0, 0.75 * s, 0);
    hand.add(shaft);
    const tip = basicMesh(new THREE.ConeGeometry(0.11 * s, 0.5 * s, 6), steel, 0, 2.05 * s, 0);
    hand.add(tip);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4 * s, 0.28 * s),
      new THREE.MeshStandardMaterial({ color: 0xffb300, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(0.22 * s, 1.7 * s, 0);
    hand.add(flag);
    weapon = hand;
  } else {
    // asura jagged blade
    const blade = basicMesh(new THREE.BoxGeometry(0.1 * s, 1.1 * s, 0.22 * s), lambert(0x30303c, { metalness: 0.5, roughness: 0.5 }), 0, 0.7 * s, 0);
    hand.add(blade);
    const tip = basicMesh(new THREE.ConeGeometry(0.13 * s, 0.3 * s, 4), lambert(0x30303c), 0, 1.4 * s, 0);
    hand.add(tip);
    weapon = hand;
  }
  // shield on left arm for hero / heavy foes / devas
  if (isHero || isBrute || kind === 'deva') {
    const sh = basicMesh(new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.08 * s, 12), isHero ? trim : (kind === 'deva' ? steel : dark), 0, -0.62 * s, 0.22 * s);
    sh.rotation.x = Math.PI / 2;
    armL.add(sh);
    armL.userData.shield = sh;
  }

  // hp bar billboard
  let hpBg = null, hpFg = null;
  if (!isHero) {
    const barY = (isBoss ? 2.85 : isBrute ? 2.9 : 2.78) * s;
    const barColor = (kind === 'boss') ? 0xd500ff : (kind === 'indra') ? 0x40c4ff : isDeva ? 0xffd54a : 0x76ff03;
    hpBg = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * s, 0.14 * s), new THREE.MeshBasicMaterial({ color: 0x220000, depthWrite: false, transparent: true }));
    hpFg = new THREE.Mesh(new THREE.PlaneGeometry(1.2 * s, 0.14 * s), new THREE.MeshBasicMaterial({ color: barColor, depthWrite: false, transparent: true }));
    hpBg.position.y = barY;
    hpFg.position.y = barY;
    hpFg.position.z = 0.01;
    g.add(hpBg); g.add(hpFg);
  }

  g.userData = { ...g.userData, legL, legR, armL, armR, headG, weapon, hpBg, hpFg, scale: s, chainAnchor, kind };
  return g;
}

// ---------------- Game state ----------------
const state = {
  mode: 'title', // title | playing | paused | dead | victory
  time: 0,
  hitStop: 0,
  shake: 0,
  slowMo: 1,
  wave: 0,
  score: 0,
  kills: 0,
  combo: 0,
  comboTimer: 0,
  rage: 0,
  rageActive: 0,
  enemies: [],
  spawnQueue: [],
  spawnTimer: 0,
  waveState: 'idle',
  waveDelay: 0,
  boss: null,
  playTime: 0,
  act: 0,
  actTransition: false,
  flash: 0,
  stormT: 4,
  tejas: 0,
  up: { dmg: 1, dmgLvl: 0, rage: 1, rageDur: 8, hpLvl: 0 },
  pendingWave: 0,
  pickupTimer: 14,
  camYaw: Math.PI,
  camPitch: 0.32,
  camDist: 8,
};

const player = {
  mesh: null,
  pos: new THREE.Vector3(0, 0, 8),
  vel: new THREE.Vector3(),
  yaw: Math.PI,
  hp: 200, maxHp: 200,
  speed: 7.2,
  state: 'idle', // idle|run|attack|heavy|dodge|block|hit|dead
  stateT: 0,
  combo: 0, // 0..2 chain index
  comboWindow: 0,
  didHit: false,
  dodgeCD: 0,
  dodgeDir: new THREE.Vector3(),
  iframes: 0,
  blockStart: -9,
  walkPhase: 0,
  attackCD: 0,
  dead: false,
};

function playerParts() { return player.mesh.userData; }

// waves definition
// ---------------- The Saga: three acts ----------------
const ACTS = [
  { name: 'ACT I · WRATH OF THE ASURAS', foe: 'ASURAS', waves: [
    { name: 'WAVE 1 · ASURA SPAWNS', list: ['grunt', 'grunt', 'grunt', 'grunt'] },
    { name: 'WAVE 2 · RAKSHASA BRUTES', list: ['grunt', 'grunt', 'brute', 'grunt', 'grunt', 'brute', 'grunt'] },
    { name: 'FINAL WAVE · MAHISHASURA', list: ['boss', 'grunt', 'grunt'] },
  ] },
  { name: 'ACT II · TREACHERY OF SVARGA', foe: 'DEVAS', waves: [
    { name: 'WAVE 1 · DEVA SENA', list: ['deva', 'deva', 'deva', 'deva', 'deva'] },
    { name: 'WAVE 2 · CELESTIAL WRATH', list: ['deva', 'deva', 'elite', 'deva', 'deva'] },
    { name: 'WAVE 3 · GATEKEEPERS', list: ['elite', 'deva', 'deva', 'deva', 'deva', 'elite'] },
  ] },
  { name: 'ACT III · DOOM OF THE DECEIVERS', foe: 'DEVAS', waves: [
    { name: 'WAVE 1 · STORM GUARD', list: ['elite', 'deva', 'deva', 'elite'] },
    { name: 'FINAL WAVE · INDRA', list: ['indra', 'deva', 'deva'] },
  ] },
];
function startAct(i) {
  state.act = i;
  state.actTransition = false;
  for (const e of state.enemies) scene.remove(e.mesh);
  state.enemies = []; state.spawnQueue = []; state.boss = null;
  for (const p of pickups) scene.remove(p);
  pickups.length = 0;
  for (const b of bolts) scene.remove(b.m);
  bolts.length = 0;
  player.hp = clamp(player.hp + 60, 0, player.maxHp);
  player.pos.set(0, 0, 8); player.yaw = Math.PI;
  player.state = 'idle'; player.stateT = 0;
  state.camYaw = Math.PI; state.camPitch = 0.32;
  applyActMood(i);
  $('boss-wrap').classList.add('hidden');
  state.mode = 'playing';
  announce(ACTS[i].name);
  AudioSys.wave();
  updateHUD();
  startWave(0);
}
// route to the next wave: boon shrine, boss cutscene, or straight in
function routeWave(next) {
  const waves = ACTS[state.act].waves;
  if (next >= waves.length) return;
  const bossType = waves[next].list.find((t) => t === 'boss' || t === 'indra');
  if (state.tejas >= 5) { state.pendingWave = next; showBoon(); }
  else if (bossType) playCutscene(bossType === 'boss' ? 'preboss' : 'indra_pre', () => { state.mode = 'playing'; startWave(next); });
  else startWave(next);
}

// ---------------- Boons: GoW-style weapon upgrades ----------------
// Tejas (✨) orbs drop from the slain. Between waves the gods offer boons.
const BOONS = [
  { id: 'dmg', icon: '🔥', name: 'KHADGA OF AGNI', desc: '+18% blade damage per level. The sword begins to burn.', max: 4, cost: [6, 10, 15, 22], lvl: 0 },
  { id: 'hp', icon: '🛡️', name: 'KAVACH OF SURYA', desc: '+30 max health & heal 30 per level. Skin turns to sunlight.', max: 3, cost: [6, 12, 18], lvl: 0 },
  { id: 'rage', icon: '🌀', name: 'TEJAS OF VAYU', desc: '+25% rage gain & +1.5s Rudra Rage per level.', max: 3, cost: [5, 10, 16], lvl: 0 },
];
function clearQueuedInputs() {
  input.lightQueued = input.heavyQueued = input.dodgeQueued = input.rageQueued = false;
  touch.block = false;
}
function renderBoon() {
  $('boon-tejas').textContent = state.tejas;
  const wrap = $('boon-cards');
  wrap.innerHTML = '';
  BOONS.forEach((b, i) => {
    const maxed = b.lvl >= b.max;
    const cost = maxed ? null : b.cost[b.lvl];
    const afford = !maxed && state.tejas >= cost;
    const card = document.createElement('div');
    card.className = 'boon-card';
    card.innerHTML = `<div class="bicon">${b.icon}</div><h3>${b.name}</h3><p>${b.desc}</p>` +
      `<div class="pips">${'●'.repeat(b.lvl)}${'○'.repeat(b.max - b.lvl)}</div>` +
      `<button data-boon="${i}" ${afford ? '' : 'disabled'}>${maxed ? 'MAX ✦' : `BUY · ${cost} ✨ [${i + 1}]`}</button>`;
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('[data-boon]').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); buyBoon(Number(btn.dataset.boon)); });
  });
}
function showBoon() {
  if (state.mode !== 'playing') return;
  clearQueuedInputs();
  state.mode = 'boon';
  renderBoon();
  $('boon-screen').classList.remove('hidden');
  VoiceSys.speak('देवताओं का वरदान चुनो, वीर!', {});
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
}
function buyBoon(i) {
  if (state.mode !== 'boon') return;
  const b = BOONS[i];
  if (!b || b.lvl >= b.max) return;
  const cost = b.cost[b.lvl];
  if (state.tejas < cost) { AudioSys.block(); return; }
  state.tejas -= cost; b.lvl++;
  if (b.id === 'dmg') { state.up.dmg = 1 + 0.18 * b.lvl; state.up.dmgLvl = b.lvl; }
  if (b.id === 'hp') { state.up.hpLvl = b.lvl; player.maxHp += 30; player.hp = clamp(player.hp + 30, 0, player.maxHp); }
  if (b.id === 'rage') { state.up.rage = 1 + 0.25 * b.lvl; state.up.rageDur = 8 + 1.5 * b.lvl; }
  AudioSys.wave();
  announce(`${b.icon} ${b.name} — LV ${b.lvl}`);
  VoiceSys.speak({
    dmg: 'अग्नि का वरदान! खड्ग प्रज्वलित!',
    hp: 'सूर्य का कवच! शरीर वज्र समान!',
    rage: 'वायु का तेज! प्रकोप अजेय!',
  }[b.id], {});
  renderBoon(); updateHUD();
}
function skipBoon() {
  if (state.mode !== 'boon') return;
  $('boon-screen').classList.add('hidden');
  clearQueuedInputs();
  state.mode = 'playing';
  const next = state.pendingWave || 0;
  const waves = ACTS[state.act].waves;
  if (next >= waves.length) return;
  const bossType = waves[next].list.find((t) => t === 'boss' || t === 'indra');
  if (bossType) playCutscene(bossType === 'boss' ? 'preboss' : 'indra_pre', () => { state.mode = 'playing'; startWave(next); });
  else startWave(next);
}

buildArena();

// player mesh
player.mesh = buildHumanoid({ kind: 'hero', skin: 0xc68642, cloth: 0xb71c1c, trim: 0xffb300, scale: 1.05 });
scene.add(player.mesh);
// ---- Blades of Agni: chained blade rig (Blade-of-Chaos style) ----
player.chain = { links: [], head: null, tip: null, ext: 0.85, vel: new THREE.Vector3() };
function buildChainRig() {
  const s = 1.05;
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a7078, metalness: 0.9, roughness: 0.35 });
  const emberM = new THREE.MeshStandardMaterial({ color: 0x3a1c08, emissive: 0xff5a00, emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.4 });
  const head = new THREE.Group();
  // curved khanda blade: base + swept tip
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.07), steel);
  base.castShadow = true;
  head.add(base);
  const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.06), steel);
  sweep.position.set(0.16, 0.6, 0);
  sweep.rotation.z = -0.6;
  sweep.castShadow = true;
  head.add(sweep);
  const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.35, 6), steel);
  tipCone.position.set(0.32, 0.82, 0);
  tipCone.rotation.z = -0.6;
  head.add(tipCone);
  // burning edge (also drives rage/ready glow via hand.userData.edgeGlow)
  const edgeGlow = new THREE.Mesh(new THREE.BoxGeometry(0.20, 1.0, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
  edgeGlow.position.set(0.05, 0.35, 0);
  head.add(edgeGlow);
  playerParts().weapon.userData.edgeGlow = edgeGlow;
  // chain ring at pommel
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 10), steel);
  ring.position.set(0, -0.5, 0);
  head.add(ring);
  // divine flame at the blade
  player.tipFlame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0xffcc33, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  player.tipFlame.position.set(0.1, 0.5, 0);
  player.tipFlame.scale.set(0.5, 0.7, 1);
  player.tipFlame.visible = false;
  head.add(player.tipFlame);
  const tip = new THREE.Object3D();
  tip.position.set(0.3, 0.85, 0);
  head.add(tip);
  scene.add(head);
  // chain links (world-space, posed every frame)
  const linkGeo = new THREE.TorusGeometry(0.085, 0.028, 5, 8);
  for (let i = 0; i < 9; i++) {
    const link = new THREE.Mesh(linkGeo, steel);
    link.castShadow = true;
    scene.add(link);
    player.chain.links.push(link);
  }
  player.chain.head = head;
  player.chain.tip = tip;
  // start coiled at the hand
  const a = new THREE.Vector3();
  playerParts().weapon.getWorldPosition(a);
  head.position.copy(a).add(new THREE.Vector3(0, -0.4, -0.3));
}
const _chainA = new THREE.Vector3(), _chainT = new THREE.Vector3(), _chainD = new THREE.Vector3(), _chainP = new THREE.Vector3();
function updateChain(dt) {
  const ch = player.chain;
  if (!ch.head || !playerParts().weapon) return;
  playerParts().weapon.getWorldPosition(_chainA);
  // extension: blade launches on attacks, coils at rest
  const st = player.state;
  let target = 0.85;
  if (st === 'attack') target = 2.6;
  else if (st === 'heavy') target = 3.2;
  else if (st === 'finisher') target = 4.3;
  else if (st === 'dash') target = 3.0;
  if (state.rageActive > 0) target += 0.6;
  ch.ext = lerp(ch.ext, target, 1 - Math.pow(0.0001, dt));
  // sweep direction: across the swing arc while attacking
  let ang = player.yaw + 0.55;
  if ((st === 'attack' || st === 'heavy' || st === 'finisher' || st === 'dash') && player.curDef) {
    const p = clamp(player.stateT / player.curDef.time, 0, 1);
    ang = player.yaw - 1.0 + p * 2.0;
  }
  _chainT.set(
    _chainA.x + Math.sin(ang) * ch.ext,
    _chainA.y + 0.55 + Math.sin(state.time * 3) * 0.06,
    _chainA.z + Math.cos(ang) * ch.ext
  );
  if (ch.ext < 1.2) { // coiled rest: dangle near the hand
    _chainT.set(_chainA.x - Math.sin(player.yaw) * 0.45, _chainA.y - 0.55, _chainA.z - Math.cos(player.yaw) * 0.45);
  }
  const k = 1 - Math.pow(0.000001, dt);
  _chainD.copy(_chainT).sub(ch.head.position);
  ch.vel.lerp(_chainD.multiplyScalar(1 / Math.max(dt, 0.001)), k * 0.35);
  ch.head.position.addScaledVector(ch.vel, dt * 0.55);
  ch.head.position.y = Math.max(0.25, ch.head.position.y);
  if (ch.vel.lengthSq() > 0.5) {
    _chainP.copy(ch.head.position).add(ch.vel);
    ch.head.lookAt(_chainP);
  }
  // links: catenary-ish sag between anchor and head
  const sag = clamp(1.5 - ch.ext * 0.28, 0.15, 1.1);
  const n = ch.links.length;
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / (n + 1);
    const link = ch.links[i];
    link.position.lerpVectors(_chainA, ch.head.position, f);
    link.position.y -= Math.sin(f * Math.PI) * sag * 0.45;
    const f2 = (i + 2) / (n + 1);
    _chainP.lerpVectors(_chainA, ch.head.position, Math.min(1, f2));
    link.lookAt(_chainP);
    link.rotateX(Math.PI / 2 + (i % 2) * Math.PI / 2);
  }
  // embers trail while the blade flies
  const flying = ch.ext > 1.6;
  if (flying && Math.random() < 0.85 && ch.tip) {
    ch.tip.getWorldPosition(_chainP);
    spawnParticles(_chainP, 2, Math.random() < 0.5 ? 0xff7a1a : 0xffd54a, 2.5, 0.5, -3, 2);
  }
}
buildChainRig();

// ---------------- Enemy class ----------------
let eid = 0;
class Enemy {
  constructor(type, spawnPos) {
    this.id = eid++;
    this.type = type;
    const cfg = {
      grunt: { hp: 65, dmg: 11, speed: 4.2, scale: 1.0, skin: 0x8e2b1d, cloth: 0x2b2b33, score: 100, range: 2.4 },
      brute: { hp: 170, dmg: 24, speed: 2.7, scale: 1.45, skin: 0x5b4a6e, cloth: 0x1a1a22, score: 250, range: 2.9 },
      boss: { hp: 950, dmg: 30, speed: 3.4, scale: 1.9, skin: 0x6e3b12, cloth: 0x3a0a0a, score: 2000, range: 3.6 },
      deva: { hp: 90, dmg: 14, speed: 5.4, scale: 1.02, skin: 0xd9a066, cloth: 0xf5f0dc, score: 150, range: 3.2 },
      elite: { hp: 230, dmg: 26, speed: 3.2, scale: 1.5, skin: 0xc89558, cloth: 0x7b1fa2, score: 350, range: 3.0 },
      indra: { hp: 1250, dmg: 34, speed: 3.8, scale: 1.85, skin: 0xc98d4b, cloth: 0xfff3d6, score: 3000, range: 3.8 },
    }[type];
    Object.assign(this, cfg);
    this.maxHp = this.hp;
    this.pos = spawnPos.clone();
    this.yaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.state = 'spawn'; this.stateT = 0;
    this.walkPhase = rand(0, 6);
    this.attackCD = rand(0.5, 1.5);
    this.didHit = false;
    this.flash = 0;
    this.dead = false;
    this.deadT = 0;
    this.enraged = false;
    this.mesh = buildHumanoid({
      kind: type, skin: cfg.skin, cloth: cfg.cloth,
      trim: type === 'boss' ? 0xffd54a : type === 'indra' ? 0xffe9a3 : 0x777788,
      scale: cfg.scale, enemy: true,
    });
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = -2.2; // rise from ground
    scene.add(this.mesh);
    spawnParticles(new THREE.Vector3(this.pos.x, 0.5, this.pos.z), 22, 0xff5722, 5, 0.8, -4, 5);
    spawnRing(new THREE.Vector3(this.pos.x, 0, this.pos.z), 0xff3d00, 3);
    if (type === 'boss' || type === 'indra') {
      AudioSys.roar();
      const titles = { boss: '🐃 MAHISHASURA 🐃', indra: '⚡ INDRA · KING OF DEVAS ⚡' };
      const barNames = { boss: '🐃 MAHISHASURA · BUFFALO KING', indra: '⚡ INDRA · KING OF DEVAS' };
      announce(titles[type]);
      $('boss-name').textContent = barNames[type];
      $('boss-wrap').classList.remove('hidden');
      state.boss = this;
    }
  }
  hurt(dmg, fromPos, heavy = false, isRage = false, knockMul = 1) {
    if (this.dead || this.state === 'spawn') return;
    this.hp -= dmg;
    this.flash = 1;
    this.stateT = Math.min(this.stateT, 0.35);
    if (this.state !== 'hit' && this.type !== 'boss') { this.state = 'hit'; this.stateT = 0; }
    // knockback
    const dir = this.pos.clone().sub(fromPos).setY(0).normalize();
    this.pos.addScaledVector(dir, (heavy ? 1.6 : 0.55) * (knockMul || 1));
    this.pos.x = clamp(this.pos.x, -ARENA_R, ARENA_R);
    this.pos.z = clamp(this.pos.z, -ARENA_R, ARENA_R);
    spawnDmgNum(new THREE.Vector3(this.pos.x, 2.4 * this.mesh.userData.scale, this.pos.z), Math.round(dmg), heavy ? 'crit' : '');
    spawnParticles(new THREE.Vector3(this.pos.x, 1.5, this.pos.z), heavy ? 22 : 12, heavy ? 0xff3d00 : 0xffc107, heavy ? 9 : 6, 0.6, -9, 4);
    if (this.hp <= 0) this.kill(heavy);
    else AudioSys.hit();
  }
  kill(heavy) {
    this.dead = true; this.deadT = 0; this.state = 'dead';
    state.kills++;
    state.score += this.score * (1 + Math.min(state.combo, 20) * 0.05);
    state.combo += 1; state.comboTimer = 3;
    state.rage = clamp(state.rage + (this.type === 'boss' ? 60 : this.type === 'brute' ? 18 : 10) * state.up.rage, 0, 100);
    // Tejas orbs (upgrade currency) + prasad drops
    const tj = this.type === 'indra' ? 40 : this.type === 'boss' ? 25 : this.type === 'elite' ? 8 : this.type === 'brute' ? 6 : this.type === 'deva' ? 3 : 2;
    state.tejas += tj;
    const pp = new THREE.Vector3(this.pos.x, 2.0 * this.mesh.userData.scale, this.pos.z);
    spawnDmgNum(pp, '+' + tj + ' ✨', 'tejas');
    spawnParticles(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), 8, 0xb388ff, 5, 0.7, -3, 5);
    if (this.type === 'boss' || this.type === 'indra') {
      spawnPickup('amrit', this.pos.clone().add(new THREE.Vector3(2, 0, 0)));
      spawnPickup('amrit', this.pos.clone().add(new THREE.Vector3(-2, 0, 1)));
      spawnPickup('soma', this.pos.clone().add(new THREE.Vector3(0, 0, -2.5)));
    } else if ((this.type === 'brute' || this.type === 'elite') && Math.random() < 0.45) {
      spawnPickup('amrit', this.pos.clone());
    } else if (Math.random() < 0.12) {
      spawnPickup('soma', this.pos.clone());
    }
    spawnParticles(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), this.type === 'boss' ? 80 : 30, 0xff6d00, 9, 1.0, -7, 7);
    spawnParticles(new THREE.Vector3(this.pos.x, 1.2, this.pos.z), 16, 0xffe0a3, 5, 0.8, -2, 5);
    spawnRing(new THREE.Vector3(this.pos.x, 0, this.pos.z), 0xffb300, this.type === 'boss' ? 10 : 4);
    AudioSys.die();
    if (this.type === 'boss' || this.type === 'indra') {
      $('boss-bar').style.width = '0%';
      state.slowMo = 0.25; setTimeout(() => state.slowMo = 1, 1200);
      state.actTransition = true;
      if (this.type === 'boss') {
        state.rage = 100; // grief becomes fuel
        playCutscene('reveal', () => startAct(1));
      } else {
        playCutscene('ending', () => showVictoryScreen());
      }
    }
    updateHUD();
  }
  update(dt) {
    const u = this.mesh.userData;
    this.stateT += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    // flash emissive
    this.mesh.traverse((m) => {
      if (m.isMesh && m.material && m.material.emissive) {
        m.material.emissive.setRGB(this.flash * 0.9, this.flash * 0.15, this.flash * 0.05);
      }
    });
    if (this.dead) {
      this.deadT += dt;
      this.mesh.rotation.x = lerp(this.mesh.rotation.x, -Math.PI / 2.2, dt * 4);
      this.mesh.position.y = lerp(this.mesh.position.y, 0.25, dt * 4);
      if (this.deadT > 1.6) {
        scene.remove(this.mesh);
        return false; // remove
      }
      return true;
    }
    if (this.state === 'spawn') {
      this.mesh.position.y = lerp(-2.2, 0, this.stateT / 1.0);
      if (this.stateT >= 1.0) { this.state = 'chase'; this.mesh.position.y = 0; }
      this.mesh.position.x = this.pos.x; this.mesh.position.z = this.pos.z;
      return true;
    }
    const toPlayer = player.pos.clone().sub(this.pos).setY(0);
    const dist = toPlayer.length();
    const dir = dist > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const targetYaw = Math.atan2(dir.x, dir.z);
    const yawDiff = ((targetYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

    if (this.state === 'chase') {
      this.yaw += clamp(yawDiff, -3 * dt, 3 * dt);
      this.attackCD -= dt;
      if (dist > this.range) {
        const sp = this.speed * (state.rageActive > 0 ? 0.9 : 1) * (this.type === 'boss' && this.hp < this.maxHp * 0.5 ? 1.25 : 1);
        this.pos.addScaledVector(dir, sp * dt);
        this.walkPhase += dt * 8;
      } else if (this.attackCD <= 0 && !player.dead) {
        // choose attack
        this.state = 'windup'; this.stateT = 0; this.didHit = false;
        if (this.type === 'boss') this.chosenAttack = pickBossAttack(dist);
        else if (this.type === 'indra') this.chosenAttack = pickIndraAttack(dist);
        else this.chosenAttack = ((this.type === 'brute' || this.type === 'elite') && Math.random() < 0.35 ? 'slam' : 'swipe');
      }
      // separation from other enemies
      for (const o of state.enemies) {
        if (o === this || o.dead) continue;
        const d = this.pos.clone().sub(o.pos); d.y = 0;
        const l = d.length();
        if (l < 1.6 && l > 0.001) this.pos.addScaledVector(d.normalize(), (1.6 - l) * dt * 2);
      }
      this.pos.x = clamp(this.pos.x, -ARENA_R, ARENA_R);
      this.pos.z = clamp(this.pos.z, -ARENA_R, ARENA_R);
    } else if (this.state === 'windup') {
      this.yaw += clamp(yawDiff, -2 * dt, 2 * dt);
      const windupTime = (this.type === 'boss' || this.type === 'indra') ? 0.7 : this.type === 'brute' ? 0.65 : this.type === 'elite' ? 0.6 : this.type === 'deva' ? 0.38 : 0.45;
      if (this.stateT >= windupTime) { this.state = 'strike'; this.stateT = 0; AudioSys.whoosh(); }
    } else if (this.state === 'strike') {
      const strikeTime = this.chosenAttack === 'bolt' ? 0.4 : 0.28;
      // lunge (not for ranged bolts)
      if (this.chosenAttack !== 'bolt') {
        this.pos.addScaledVector(dir, (this.chosenAttack === 'charge' ? 14 : 3.5) * dt);
        this.pos.x = clamp(this.pos.x, -ARENA_R, ARENA_R);
        this.pos.z = clamp(this.pos.z, -ARENA_R, ARENA_R);
      }
      if (!this.didHit && this.stateT > 0.1) {
        this.didHit = true;
        if (this.chosenAttack === 'bolt') {
          // Indra hurls a fan of thunderbolts
          for (let bi = -1; bi <= 1; bi++) {
            const aim = player.pos.clone();
            aim.x += Math.cos(player.yaw) * bi * 1.6;
            aim.z += -Math.sin(player.yaw) * bi * 1.6;
            fireBolt(this.pos, aim, 18, 0x9fd8ff);
          }
          thunderCrack();
          state.shake = Math.min(1, state.shake + 0.35);
        } else if (this.chosenAttack === 'storm') {
          // triple storm rings — dodge out!
          for (let ri = 0; ri < 3; ri++) {
            setTimeout(() => spawnRing(this.pos.clone(), ri === 1 ? 0x40c4ff : 0x9fd8ff, 5 + ri * 2), ri * 140);
          }
          spawnParticles(this.pos.clone().setY(0.5), 30, 0x9fd8ff, 9, 0.7, -8, 6);
          const d = player.pos.clone().sub(this.pos).setY(0).length();
          if (d < 6.5 && player.iframes <= 0 && !player.dead) damagePlayer(this.dmg * 1.1, this.pos);
          thunderCrack();
          state.shake = Math.min(1, state.shake + 0.6);
        } else {
          const d = player.pos.clone().sub(this.pos).setY(0).length();
          const hitRange = this.chosenAttack === 'slam' ? 4.5 : this.range + 0.7;
          if (d < hitRange && player.iframes <= 0 && !player.dead) damagePlayer(this.dmg * (this.chosenAttack === 'slam' ? 1.25 : 1), this.pos);
        }
        if (this.chosenAttack === 'slam' || ((this.type === 'boss' || this.type === 'indra') && (this.chosenAttack === 'swipe' || this.chosenAttack === 'storm'))) {
          spawnRing(this.pos.clone(), this.type === 'indra' ? 0x40c4ff : 0xff1744, (this.type === 'boss' || this.type === 'indra') ? 8 : 4);
          spawnParticles(this.pos.clone().setY(0.5), 26, this.type === 'indra' ? 0x9fd8ff : 0xff5722, 8, 0.7, -8, 6);
          state.shake = Math.min(1, state.shake + 0.5);
        }
      }
      if (this.stateT >= strikeTime) {
        this.state = 'recover'; this.stateT = 0;
        this.attackCD = this.type === 'boss' ? rand(0.8, 1.6) : this.type === 'brute' ? rand(1.2, 2.0) : rand(0.9, 1.8);
        // boss summons at half hp
        if ((this.type === 'boss' || this.type === 'indra') && !this.enraged && this.hp < this.maxHp * 0.5) {
          this.enraged = true;
          const minion = this.type === 'indra' ? 'deva' : 'grunt';
          announce(this.type === 'indra' ? 'INDRA CALLS HIS HOST!' : 'MAHISHASURA CALLS HIS LEGION!');
          if (this.type === 'indra') VoiceSys.speak(VOICE_LINES.bossRage, { interrupt: true });
          else AudioSys.roar();
          for (let i = 0; i < 2; i++) queueSpawn(minion);
        }
      }
    } else if (this.state === 'recover' || this.state === 'hit') {
      const t = this.state === 'hit' ? 0.35 : (this.type === 'boss' ? 0.5 : 0.7);
      if (this.stateT >= t) this.state = 'chase';
    }

    // pose / animate
    this.mesh.position.x = this.pos.x; this.mesh.position.z = this.pos.z;
    this.mesh.rotation.y = this.yaw;
    const moving = this.state === 'chase' && dist > this.range;
    const sw = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = moving ? -sw * 0.7 : lerp(u.armL.rotation.x, 0, dt * 6);
    if (this.state === 'windup') {
      const w = this.stateT / 0.6;
      u.armR.rotation.x = lerp(-0.3, -2.4, Math.min(1, w));
    } else if (this.state === 'strike') {
      const w = this.stateT / 0.28;
      u.armR.rotation.x = lerp(-2.4, 1.2, w);
    } else if (this.state === 'hit') {
      u.armR.rotation.x = 0.4;
      this.mesh.rotation.z = Math.sin(this.stateT * 30) * 0.08;
    } else {
      u.armR.rotation.x = lerp(u.armR.rotation.x, moving ? sw * 0.7 : 0.15, dt * 8);
      this.mesh.rotation.z = 0;
    }
    // hp bar billboard
    if (u.hpFg) {
      const f = clamp(this.hp / this.maxHp, 0, 1);
      u.hpFg.scale.x = Math.max(0.001, f);
      u.hpFg.position.x = -(1 - f) * 0.6 * u.scale;
      u.hpBg.quaternion.copy(camera.quaternion);
      u.hpFg.quaternion.copy(camera.quaternion);
    }
    if ((this.type === 'boss' || this.type === 'indra') && this.hp >= 0) {
      const f = clamp(this.hp / this.maxHp, 0, 1);
      if ($('boss-bar')) $('boss-bar').style.width = (f * 100) + '%';
    }
    return true;
  }
}
function pickBossAttack(dist) {
  const r = Math.random();
  if (dist > 9 && r < 0.45) return 'charge';
  if (r < 0.4) return 'slam';
  return 'swipe';
}
function pickIndraAttack(dist) {
  const r = Math.random();
  if (dist > 10) return r < 0.55 ? 'bolt' : 'charge';
  if (r < 0.35) return 'storm';
  if (r < 0.6) return 'bolt';
  return 'swipe';
}
// ---------------- Thunderbolts (Indra's ranged wrath) ----------------
const bolts = [];
function fireBolt(from, targetPos, dmg, color = 0x9fd8ff) {
  const dir = targetPos.clone().sub(from).setY(0);
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
  dir.normalize();
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.30),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  m.scale.set(1, 1, 2.8);
  m.position.copy(from); m.position.y = 1.9;
  m.lookAt(targetPos.x, 1.3, targetPos.z);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  glow.scale.set(1.6, 1.6, 1);
  m.add(glow);
  scene.add(m);
  bolts.push({ m, vel: dir.multiplyScalar(17), life: 3.2, dmg });
}
function thunderCrack() {
  AudioSys.noise(0.5, 0.5, 300, 0.6);
  AudioSys.tone(55, 0.6, 'sawtooth', 0.4, 30);
}
function updateBolts(dt) {
  const pp = player.pos.clone(); pp.y = 1.4;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    b.m.position.addScaledVector(b.vel, dt);
    if (Math.random() < 0.7) spawnParticles(b.m.position, 1, 0x9fd8ff, 1.5, 0.35, 0, 0);
    if (!player.dead && player.iframes <= 0 && b.m.position.distanceTo(pp) < 1.15) {
      damagePlayer(b.dmg, b.m.position);
      spawnParticles(b.m.position, 16, 0x9fd8ff, 7, 0.5, -5, 4);
      b.life = 0;
    }
    if (b.life <= 0 || b.m.position.y < 0 || Math.hypot(b.m.position.x, b.m.position.z) > 70) {
      scene.remove(b.m);
      bolts.splice(i, 1);
    }
  }
}
function queueSpawn(type) { state.spawnQueue.push(type); }

// ---------------- Prasad pickups (health) ----------------
// Soma fruit restores 30 prana; rare Amrit Kalash restores 60 + 25 rage.
const pickups = [];
function findPickupSpot() {
  for (let t = 0; t < 16; t++) {
    const a = rand(0, Math.PI * 2), r = rand(6, ARENA_R - 3);
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (p.distanceTo(player.pos) > 5) return p;
  }
  return new THREE.Vector3(0, 0, -6);
}
function spawnPickup(type, pos) {
  if (pickups.length > 8 || !pos) return;
  const g = new THREE.Group();
  if (type === 'soma') {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0x662200, roughness: 0.4 }));
    fruit.castShadow = true; g.add(fruit);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0x2e7d32 }));
    leaf.position.y = 0.42; g.add(leaf);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0x9dff57, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    glow.scale.set(1.5, 1.5, 1); g.add(glow);
  } else {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 10),
      new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7, roughness: 0.3 }));
    pot.castShadow = true; g.add(pot);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: 0x7df9ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    glow.scale.set(1.9, 1.9, 1); g.add(glow);
  }
  g.position.copy(pos); g.position.y = 0.8;
  g.userData = { type, t: rand(0, 6), life: 30 };
  scene.add(g); pickups.push(g);
  spawnParticles(g.position, 10, type === 'soma' ? 0x9dff57 : 0x7df9ff, 3, 0.6, -2, 3);
}
function collectPickup(type, pos) {
  if (type === 'soma') {
    player.hp = clamp(player.hp + 30, 0, player.maxHp);
    spawnDmgNum(pos.clone().setY(2.2), '+30 प्राण', 'heal');
    AudioSys.tone(523, 0.2, 'triangle', 0.3);
    setTimeout(() => AudioSys.tone(784, 0.3, 'triangle', 0.3), 90);
    VoiceSys.speak('सोम रस! शक्ति मिली!', { key: 'soma', cooldown: 45 });
  } else {
    player.hp = clamp(player.hp + 60, 0, player.maxHp);
    state.rage = clamp(state.rage + 25 * state.up.rage, 0, 100);
    spawnDmgNum(pos.clone().setY(2.2), '+60 अमृत!', 'heal');
    AudioSys.tone(523, 0.18, 'triangle', 0.3);
    setTimeout(() => AudioSys.tone(659, 0.18, 'triangle', 0.3), 90);
    setTimeout(() => AudioSys.tone(784, 0.3, 'triangle', 0.32), 180);
    spawnRing(player.pos.clone(), 0x7df9ff, 4);
    VoiceSys.speak('अमृत! अमर शक्ति मिली!', { key: 'amrit', cooldown: 45 });
  }
  spawnParticles(pos, 20, 0xfff176, 5, 0.8, -3, 5);
  updateHUD();
}
function updatePickups(dt) {
  const pp = player.pos.clone(); pp.y = 0.8;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.userData.t += dt; p.userData.life -= dt;
    p.position.y = 0.8 + Math.sin(p.userData.t * 3) * 0.15;
    p.rotation.y += dt * 2;
    if (p.userData.life < 5) p.visible = Math.sin(p.userData.t * 12) > -0.2;
    if (p.userData.life <= 0) { scene.remove(p); pickups.splice(i, 1); continue; }
    if (player.dead) continue;
    const d = p.position.distanceTo(pp);
    if (d < 3.4) {
      const dir = pp.clone().sub(p.position).normalize();
      p.position.addScaledVector(dir, ((3.4 - d) * 3 + 1.5) * dt);
    }
    if (d < 1.5) {
      collectPickup(p.userData.type, p.position);
      scene.remove(p); pickups.splice(i, 1);
    }
  }
}

// ---------------- Player combat ----------------
const LIGHT = [
  { dmg: 16, time: 0.40, range: 2.9, arc: 1.2 },
  { dmg: 18, time: 0.40, range: 2.9, arc: 1.2 },
  { dmg: 24, time: 0.48, range: 3.1, arc: 1.4 },
  { dmg: 34, time: 0.62, range: 3.4, arc: 1.7, name: 'AGNI PLUME', knock: 2.4 },
];
const HEAVY = { dmg: 52, time: 0.75, range: 3.4, arc: 1.8 };
const FINISHER = { dmg: 70, time: 0.9, range: 4.0, arc: 2.4, name: 'RUDRA PRAHAR', knock: 2.0 };
const DASHATK = { dmg: 26, time: 0.38, range: 3.2, arc: 1.5, name: 'VAJRA DASH', knock: 1.2 };

let moveNameTO = null;
function showMoveName(t) {
  const el = $('move-name');
  if (!el) return;
  el.textContent = t;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(moveNameTO);
  moveNameTO = setTimeout(() => el.classList.remove('show'), 950);
}

function tryStartAttack(kind) {
  if (player.dead || player.state === 'dodge' || player.state === 'hit') return;
  // dodge-cancel → Vajra Dash (gap closer)
  if (kind === 'light' && player.dashWindow > 0 && player.state !== 'attack' && player.state !== 'heavy' && player.state !== 'finisher' && player.state !== 'dash') {
    player.dashWindow = 0;
    player.state = 'dash'; player.stateT = 0;
    player.curDef = DASHATK; player.didHit = false;
    player.comboQueued = false;
    AudioSys.whoosh();
    showMoveName('VAJRA DASH');
    return;
  }
  if (player.state === 'attack') {
    if (kind === 'light') {
      // queue next chain hit
      if (player.stateT > player.curDef.time * 0.45) player.comboQueued = true;
      return;
    }
    // heavy cancels the light chain → Rudra Prahar finisher
    if (player.stateT > player.curDef.time * 0.3) {
      player.state = 'finisher'; player.stateT = 0;
      player.curDef = FINISHER; player.didHit = false;
      player.comboQueued = false;
      AudioSys.heavyWhoosh();
      showMoveName('RUDRA PRAHAR');
    }
    return;
  }
  if (player.state === 'heavy' || player.state === 'finisher' || player.state === 'dash') return;
  if (blocking()) return;
  if (kind === 'light') {
    player.state = 'attack'; player.stateT = 0;
    player.combo = (player.comboQueued || player.comboWindow <= 0) ? 0 : player.combo;
    if (player.comboWindow <= 0) player.combo = 0;
    player.combo = clamp(player.combo, 0, 3);
    player.curDef = LIGHT[player.combo];
    player.didHit = false;
    AudioSys.whoosh();
  } else {
    player.state = 'heavy'; player.stateT = 0;
    player.curDef = HEAVY;
    player.didHit = false;
    AudioSys.heavyWhoosh();
  }
  player.attackCD = 0.15;
}
function blocking() { return (keys['KeyQ'] || keys['KeyE'] || touch.block) && player.state !== 'dodge' && !player.dead; }

function playerAttackHitCheck(def, heavy) {
  const rageMult = state.rageActive > 0 ? 1.8 : 1;
  const dmgBase = def.dmg * rageMult * rand(0.9, 1.15) * state.up.dmg;
  let hitAny = false;
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  for (const e of state.enemies) {
    if (e.dead) continue;
    const to = e.pos.clone().sub(player.pos); to.y = 0;
    const d = to.length();
    if (d > def.range + (e.type === 'boss' ? 1.2 : 0.3)) continue;
    const ang = fwd.angleTo(to.normalize());
    if (ang > def.arc) continue;
    // damage falloff at edge
    const dmg = dmgBase * (d > def.range * 0.8 ? 0.8 : 1);
    e.hurt(dmg, player.pos, heavy, state.rageActive > 0, def.knock || 1);
    hitAny = true;
    state.rage = clamp(state.rage + (heavy ? 12 : 8) * state.up.rage, 0, 100);
    if (state.rageActive > 0) player.hp = clamp(player.hp + dmg * 0.15, 0, player.maxHp);
  }
  if (hitAny) {
    const isFin = def === FINISHER;
    state.combo += 1; state.comboTimer = 3;
    if (state.combo === 8) showMoveName('PRACHANDA!');
    if (state.combo === 15) {
      showMoveName('MAHA-PRALAYA!');
      VoiceSys.speak('अद्भुत वीर! रुको मत!', { key: 'combo15', cooldown: 30 });
    }
    state.hitStop = isFin ? 0.14 : heavy ? 0.09 : 0.05;
    state.shake = Math.min(1, state.shake + (isFin ? 0.7 : heavy ? 0.45 : 0.22));
    spawnSlash(new THREE.Vector3(player.pos.x, 1.5, player.pos.z).addScaledVector(fwd, 1.4), player.yaw, heavy, heavy ? 0xff6d00 : 0xffe0a3);
    if (heavy) {
      AudioSys.heavyHit();
      spawnRing(player.pos.clone(), isFin ? 0xff3d00 : 0xffb300, isFin ? 6 : 3);
    }
    else AudioSys.hit();
    updateHUD();
  }
}

function damagePlayer(dmg, fromPos) {
  if (player.dead || player.iframes > 0) return;
  const isBlocking = blocking();
  const facingDot = (() => {
    const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const toAtk = fromPos.clone().sub(player.pos).setY(0).normalize();
    return fwd.dot(toAtk);
  })();
  // parry: block pressed within last 0.28s and facing attacker
  const timeSinceBlock = state.time - player.blockStart;
  if (isBlocking && facingDot > 0.25) {
    if (timeSinceBlock < 0.28) {
      // PERFECT PARRY
      spawnDmgNum(new THREE.Vector3(player.pos.x, 2.6, player.pos.z), 'PARRY!', 'blocked');
      spawnParticles(new THREE.Vector3(player.pos.x, 1.6, player.pos.z), 30, 0x9fd8ff, 8, 0.7, -4, 5);
      spawnRing(player.pos.clone(), 0x9fd8ff, 4);
      AudioSys.parry();
      VoiceSys.speak(VOICE_LINES.parry, { key: 'parry', cooldown: 6 });
      state.rage = clamp(state.rage + 20 * state.up.rage, 0, 100);
      state.hitStop = 0.12;
      // stagger nearby enemies
      for (const e of state.enemies) {
        const d = e.pos.distanceTo(player.pos);
        if (d < 5) { e.state = 'hit'; e.stateT = 0; e.attackCD = Math.max(e.attackCD, 1.2); }
      }
      updateHUD();
      return;
    }
    dmg *= 0.25;
    spawnDmgNum(new THREE.Vector3(player.pos.x, 2.6, player.pos.z), 'BLOCKED ' + Math.round(dmg), 'blocked');
    AudioSys.block();
    spawnParticles(new THREE.Vector3(player.pos.x, 1.5, player.pos.z), 10, 0x9fd8ff, 5, 0.5, -5, 3);
    player.hp -= dmg;
  } else {
    if (state.rageActive > 0) dmg *= 0.6;
    player.hp -= dmg;
    spawnDmgNum(new THREE.Vector3(player.pos.x, 2.6, player.pos.z), '-' + Math.round(dmg), 'player');
    spawnParticles(new THREE.Vector3(player.pos.x, 1.5, player.pos.z), 14, 0xd50000, 6, 0.6, -8, 4);
    $('hit-flash').classList.add('on');
    setTimeout(() => $('hit-flash').classList.remove('on'), 140);
    AudioSys.hurt();
    state.shake = Math.min(1, state.shake + 0.5);
    state.rage = clamp(state.rage + 6, 0, 100);
    // interrupt light attacks, not dodge
    if (player.state !== 'dodge') { player.state = 'hit'; player.stateT = 0; }
  }
  state.combo = 0;
  if (player.hp > 0 && player.hp <= player.maxHp * 0.3) {
    VoiceSys.speak(VOICE_LINES.lowHp, { key: 'lowhp', cooldown: 22 });
  }
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; player.state = 'dead'; player.stateT = 0;
    AudioSys.die();
    setTimeout(() => gameOver(), 1400);
  }
  updateHUD();
}

function updatePlayer(dt) {
  const u = playerParts();
  player.stateT += dt;
  player.iframes = Math.max(0, player.iframes - dt);
  player.dodgeCD = Math.max(0, player.dodgeCD - dt);
  player.attackCD = Math.max(0, player.attackCD - dt);
  player.comboWindow = Math.max(0, (player.comboWindow || 0) - dt);
  player.dashWindow = Math.max(0, (player.dashWindow || 0) - dt);
  const rageMult = state.rageActive > 0 ? 1.25 : 1;

  // rage timer
  if (state.rageActive > 0) {
    state.rageActive -= dt;
    u.weapon.userData.edgeGlow.material.opacity = 0.7 + Math.sin(state.time * 20) * 0.3;
    u.weapon.userData.edgeGlow.material.color.setHex(0xff3d00);
    if (state.rageActive <= 0) {
      $('rage-vignette').classList.remove('on');
      u.weapon.userData.edgeGlow.material.opacity = 0;
    }
  }

  // queued inputs
  if (input.rageQueued) {
    input.rageQueued = false;
    if (state.rage >= 100 && state.rageActive <= 0 && !player.dead) {
      state.rageActive = state.up.rageDur; state.rage = 0;
      state._rageVoiced = true;
      VoiceSys.speak(VOICE_LINES.rage, { interrupt: true });
      $('rage-vignette').classList.add('on');
      AudioSys.rage();
      announce('🔥 RUDRA RAGE 🔥');
      spawnRing(player.pos.clone(), 0xff3d00, 9);
      spawnParticles(player.pos.clone().setY(1), 60, 0xff5722, 9, 1, -3, 8);
      state.shake = 1;
    }
  }
  if (input.dodgeQueued) {
    input.dodgeQueued = false;
    if (!player.dead && player.dodgeCD <= 0 && player.state !== 'dodge') {
      player.state = 'dodge'; player.stateT = 0;
      player.dodgeCD = 0.75;
      player.iframes = 0.42;
      // dodge dir = move input or facing
      const mv = getMoveVec();
      player.dodgeDir.copy(mv.lengthSq() > 0.01 ? mv : new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)));
      AudioSys.dodge();
      spawnParticles(player.pos.clone().setY(0.6), 12, 0xcfd8dc, 4, 0.5, -2, 2);
    }
  }
  if (input.lightQueued) { input.lightQueued = false; if (state.mode === 'playing') tryStartAttack('light'); }
  if (input.heavyQueued) { input.heavyQueued = false; if (state.mode === 'playing') tryStartAttack('heavy'); }

  // track block start for parry
  if ((keys['KeyQ'] || keys['KeyE'] || touch.block) && !player._wasBlocking) player.blockStart = state.time;
  player._wasBlocking = !!(keys['KeyQ'] || keys['KeyE'] || touch.block);

  const mv = getMoveVec();

  if (player.dead) {
    player.mesh.rotation.x = lerp(player.mesh.rotation.x, -Math.PI / 2.3, dt * 3);
  } else if (player.state === 'dodge') {
    const t = player.stateT / 0.45;
    player.pos.addScaledVector(player.dodgeDir, 11.5 * dt * (1 - t * 0.4));
    player.mesh.rotation.x = lerp(player.mesh.rotation.x, Math.PI * 1.6 * Math.min(1, t), dt * 18);
    player.yaw = Math.atan2(player.dodgeDir.x, player.dodgeDir.z);
    if (t >= 1) { player.state = 'idle'; player.stateT = 0; player.mesh.rotation.x = 0; player.dashWindow = 0.5; }
  } else if (player.state === 'attack' || player.state === 'heavy' || player.state === 'finisher' || player.state === 'dash') {
    const def = player.curDef;
    const t = player.stateT / def.time;
    const isDash = player.state === 'dash';
    const isFin = player.state === 'finisher';
    // face nearest enemy slightly (soft lock like GoW)
    const near = nearestEnemy(7, def.arc + 0.6);
    if (near && t < 0.4) {
      const want = Math.atan2(near.pos.x - player.pos.x, near.pos.z - player.pos.z);
      let d = ((want - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      player.yaw += clamp(d, -6 * dt, 6 * dt);
    }
    // forward step (dash lunges hard)
    const stepSpd = isDash ? 13 : isFin ? 4.2 : player.state === 'heavy' ? 3.2 : 2.2;
    player.pos.addScaledVector(new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)), stepSpd * dt * (1 - t * 0.4));
    if (isDash && Math.random() < 0.7) spawnParticles(player.pos.clone().setY(0.7), 1, 0x9fd8ff, 2, 0.35, -1, 1);
    const heavyFlag = player.state === 'heavy' || isFin;
    if (!player.didHit && t > (isDash ? 0.25 : 0.35)) { player.didHit = true; playerAttackHitCheck(def, heavyFlag); }
    if (t >= 1) {
      if (player.state === 'attack' && player.comboQueued && player.combo < 3) {
        player.combo += 1; player.comboQueued = false;
        player.curDef = LIGHT[player.combo];
        player.stateT = 0; player.didHit = false;
        AudioSys.whoosh();
        if (player.curDef.name) showMoveName(player.curDef.name);
      } else {
        if (player.state === 'attack') player.combo = player.combo >= 3 ? 0 : player.combo + 1;
        else player.combo = 0;
        player.comboWindow = (isFin || isDash) ? 0.8 : 1.2;
        player.comboQueued = false;
        player.state = 'idle'; player.stateT = 0;
      }
    }
  } else if (player.state === 'hit') {
    if (player.stateT > 0.38) { player.state = 'idle'; player.stateT = 0; }
  } else {
    // free move
    if (mv.lengthSq() > 0.001 && !blocking()) {
      player.pos.addScaledVector(mv, player.speed * rageMult * dt);
      // face movement (GoW: face move dir when moving, else face camera-forward in combat)
      const want = Math.atan2(mv.x, mv.z);
      let d = ((want - player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      player.yaw += clamp(d, -10 * dt, 10 * dt);
      player.state = 'run';
      player.walkPhase += dt * 11;
    } else {
      player.state = blocking() ? 'block' : 'idle';
      if (!blocking()) player.walkPhase += dt * 2;
    }
  }

  // arena clamp
  const r = Math.hypot(player.pos.x, player.pos.z);
  if (r > ARENA_R) { player.pos.x *= ARENA_R / r; player.pos.z *= ARENA_R / r; }

  // mesh transform + procedural anim
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.yaw;
  if (player.state !== 'dodge' && !player.dead) player.mesh.rotation.x = lerp(player.mesh.rotation.x, 0, dt * 10);
  const running = player.state === 'run';
  const sw = running ? Math.sin(player.walkPhase) * 0.65 : Math.sin(state.time * 2) * 0.05;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  if (player.state === 'attack' || player.state === 'heavy' || player.state === 'finisher' || player.state === 'dash') {
    const t = clamp(player.stateT / player.curDef.time, 0, 1);
    // overhead diagonal slash keyframes
    u.armR.rotation.x = lerp(-2.6, 1.0, t < 0.4 ? t / 0.4 * 0.9 : 0.9 + (t - 0.4) / 0.6 * 0.1);
    u.armR.rotation.z = lerp(0.7, -0.6, t);
    u.armL.rotation.x = lerp(u.armL.rotation.x, -0.5, dt * 10);
  } else if (player.state === 'block' || blocking()) {
    u.armL.rotation.x = -1.4; u.armL.rotation.z = 0.5;
    u.armR.rotation.x = -0.6;
  } else if (player.state === 'hit') {
    u.armR.rotation.x = 0.8;
    player.mesh.rotation.z = Math.sin(player.stateT * 26) * 0.06;
  } else {
    u.armR.rotation.x = lerp(u.armR.rotation.x, running ? -sw * 0.6 : -0.1, dt * 10);
    u.armR.rotation.z = lerp(u.armR.rotation.z || 0, 0, dt * 10);
    u.armL.rotation.x = lerp(u.armL.rotation.x, running ? sw * 0.6 : 0.05, dt * 10);
    player.mesh.rotation.z = 0;
  }
  // scarf wave
  if (u.headG.userData.scarf) {
    u.headG.userData.scarf.rotation.x = 0.4 + Math.sin(state.time * (running ? 10 : 4)) * (running ? 0.5 : 0.2);
  }
  // dodge / rage trail
  if (player.state === 'dodge' && Math.random() < 0.6) {
    spawnParticles(player.pos.clone().setY(0.8), 2, 0xffb300, 2, 0.4, -1, 1);
  }
}

function getMoveVec() {
  // camera-relative WASD
  let x = 0, z = 0;
  if (keys['KeyW'] || keys['ArrowUp']) z -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) z += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) x += 1;
  // mobile joystick (analog)
  if (touch.moveId !== null && (touch.dx || touch.dy)) {
    x += clamp(touch.dx / JOY_R, -1, 1);
    z += clamp(touch.dy / JOY_R, -1, 1);
  }
  if (x === 0 && z === 0) return new THREE.Vector3();
  const yaw = state.camYaw;
  // camera forward on ground = direction from camera to player
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const v = new THREE.Vector3().addScaledVector(fwd, -z).addScaledVector(right, x);
  if (v.lengthSq() > 1) v.normalize();
  return v;
}
function nearestEnemy(maxD = 7, arc = 2.5) {
  let best = null, bd = maxD;
  const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  for (const e of state.enemies) {
    if (e.dead) continue;
    const to = e.pos.clone().sub(player.pos); to.y = 0;
    const d = to.length();
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---------------- Waves ----------------
function startWave(i) {
  state.wave = i;
  const w = ACTS[state.act].waves[i];
  state.spawnQueue = [...w.list];
  state.spawnTimer = 0.5;
  state.waveState = 'spawning';
  announce(w.name);
  AudioSys.wave();
  VoiceSys.speak(VOICE_LINES['wave' + Math.min(i, 2)] || VOICE_LINES.wave0, { interrupt: true });
  $('wave-banner').textContent = w.name;
  const hasBoss = w.list.some((t) => t === 'boss' || t === 'indra');
  if (hasBoss) $('boss-wrap').classList.remove('hidden');
  else $('boss-wrap').classList.add('hidden');
  // small heal between waves
  if (i > 0) {
    player.hp = clamp(player.hp + 40, 0, player.maxHp);
    spawnDmgNum(player.pos.clone().setY(2.5), '+40', 'heal');
  }
  // prasad offerings scattered for the warrior
  if (i < 2) for (let k = 0; k < 2; k++) spawnPickup('soma', findPickupSpot());
  updateHUD();
}
function randomSpawnPos() {
  for (let t = 0; t < 20; t++) {
    const a = rand(0, Math.PI * 2), r = rand(10, ARENA_R - 2);
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (p.distanceTo(player.pos) > 9) return p;
  }
  return new THREE.Vector3(0, 0, -ARENA_R + 4);
}
function updateWaves(dt) {
  // staggered spawning, max 6 alive
  const alive = state.enemies.filter((e) => !e.dead).length;
  const waves = ACTS[state.act].waves;
  if (state.spawnQueue.length > 0 && alive < 6) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = waves[state.wave].list.some((t) => t === 'boss' || t === 'indra') ? 1.2 : 0.8;
      const t = state.spawnQueue.shift();
      state.enemies.push(new Enemy(t, randomSpawnPos()));
      updateHUD();
    }
  } else if (state.spawnQueue.length === 0 && alive === 0) {
    // wave cleared — a boss death owns its own transition
    if (state.actTransition) { state.waveDelay = 0; return; }
    if (state.wave < waves.length - 1) {
      state.waveDelay += dt;
      if (state.waveDelay > 0.1 && !state._wavePending) {
        state._wavePending = true;
        state.waveDelay = 0;
        setTimeout(() => {
          state._wavePending = false;
          if (state.mode !== 'playing') return;
          routeWave(state.wave + 1);
        }, 2200);
        announce('WAVE CLEARED!');
        VoiceSys.speak(VOICE_LINES.cleared, { key: 'cleared', cooldown: 2 });
        state.score += 300;
      }
    } else if (state.act === 1 && !state._wavePending) {
      // Svarga has fallen — ascend to the Storm Throne
      state._wavePending = true;
      setTimeout(() => {
        state._wavePending = false;
        if (state.mode !== 'playing') return;
        playCutscene('throne', () => startAct(2));
      }, 2200);
      announce('SVARGA BURNS!');
      VoiceSys.speak('स्वर्ग जल उठा! अब तूफ़ानी सिंहासन!', { key: 'svargaBurns', cooldown: 2 });
      state.score += 500;
    }
  } else {
    state.waveDelay = 0;
  }
  const totalLeft = alive + state.spawnQueue.length;
  const foeWord = ACTS[state.act].foe;
  if (state.boss && !state.boss.dead) {
    $('enemies-left').textContent = state.boss.type === 'indra' ? 'SLAY INDRA!' : 'SLAY MAHISHASURA!';
  } else {
    $('enemies-left').textContent = `${foeWord} LEFT: ${totalLeft}`;
  }
}

// ---------------- Camera (GoW shoulder cam) ----------------
function updateCamera(dt) {
  state.camYaw -= mouseDX * 0.0028;
  state.camPitch = clamp(state.camPitch + mouseDY * 0.0022, -0.15, 1.0);
  mouseDX = 0; mouseDY = 0;
  // Q/E-free: arrow left/right also rotate for trackpads
  if (keys['ArrowLeft'] && !keys['KeyA']) state.camYaw += 1.8 * dt;
  if (keys['ArrowRight'] && !keys['KeyD']) state.camYaw -= 1.8 * dt;

  const dist = state.camDist * (state.rageActive > 0 ? 0.92 : 1)
    * (window.innerHeight > window.innerWidth ? 1.28 : 1); // pull back in portrait
  const cx = player.pos.x + Math.sin(state.camYaw) * Math.cos(state.camPitch) * dist;
  const cz = player.pos.z + Math.cos(state.camYaw) * Math.cos(state.camPitch) * dist;
  const cy = 2.4 + Math.sin(state.camPitch) * dist;
  const desired = new THREE.Vector3(cx, Math.max(1.2, cy), cz);
  camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
  // shoulder offset
  const right = new THREE.Vector3(Math.cos(state.camYaw), 0, -Math.sin(state.camYaw));
  const look = player.pos.clone().add(new THREE.Vector3(0, 2.0, 0))
    .addScaledVector(right, 1.1)
    .addScaledVector(new THREE.Vector3(-Math.sin(state.camYaw), 0, -Math.cos(state.camYaw)), 2.2);
  // shake
  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt * 2.2);
    const s = state.shake * state.shake * 0.7;
    camera.position.x += rand(-s, s);
    camera.position.y += rand(-s, s);
    camera.position.z += rand(-s, s);
  }
  camera.lookAt(look);
}

// ---------------- HUD / UI ----------------
function updateHUD() {
  const f = clamp(player.hp / player.maxHp, 0, 1);
  $('hp-bar').style.width = (f * 100) + '%';
  $('hp-ghost').style.width = (f * 100) + '%';
  $('hp-text').textContent = Math.ceil(player.hp) + ' / ' + player.maxHp;
  $('rage-bar').style.width = (state.rageActive > 0 ? (state.rageActive / state.up.rageDur * 100) : state.rage) + '%';
  $('rage-text').textContent = state.rageActive > 0 ? '🔥 RUDRA RAGE ACTIVE 🔥' : (state.rage >= 100 ? '✨ PRESS R — RUDRA RAGE READY ✨' : `RUDRA RAGE [R] ${Math.floor(state.rage)}%`);
  $('score').textContent = Math.floor(state.score);
  $('kills').textContent = state.kills;
  $('tejas').textContent = state.tejas;
  $('combo-count').textContent = state.combo >= 2 ? `${state.combo} HITS!` : 'DHARMA';
  $('combo-fill').style.width = (clamp(state.comboTimer / 3, 0, 1) * 100) + '%';
  if (state.mode === 'playing' && state.rageActive <= 0) {
    if (state.rage >= 100 && !state._rageVoiced) {
      state._rageVoiced = true;
      VoiceSys.speak(VOICE_LINES.rageReady, { key: 'rageReady', cooldown: 25 });
    } else if (state.rage < 100) {
      state._rageVoiced = false;
    }
  }
}
function announce(text) {
  const el = $('announce');
  el.textContent = text;
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

// ---------------- Flow ----------------
function resetGame() {
  for (const e of state.enemies) scene.remove(e.mesh);
  state.enemies = [];
  state.spawnQueue = [];
  state.wave = 0; state.score = 0; state.kills = 0;
  state.combo = 0; state.comboTimer = 0;
  state.rage = 0; state.rageActive = 0;
  state.boss = null; state.playTime = 0;
  state._wavePending = false; state.waveDelay = 0;
  state.shake = 0; state.slowMo = 1; state.hitStop = 0;
  state._rageVoiced = false;
  state.act = 0; state.actTransition = false;
  applyActMood(0);
  state.tejas = 0;
  state.up = { dmg: 1, dmgLvl: 0, rage: 1, rageDur: 8, hpLvl: 0 };
  state.pendingWave = 0;
  state.pickupTimer = 14;
  BOONS.forEach((b) => { b.lvl = 0; });
  for (const p of pickups) scene.remove(p);
  pickups.length = 0;
  for (const b of bolts) scene.remove(b.m);
  bolts.length = 0;
  clearInterval(story.timer);
  story.active = false; story.onDone = null;
  document.body.classList.remove('cine');
  $('dialogue').classList.add('hidden');
  $('boon-screen').classList.add('hidden');
  player.pos.set(0, 0, 8); player.yaw = Math.PI;
  player.hp = player.maxHp; player.dead = false;
  player.state = 'idle'; player.stateT = 0;
  player.combo = 0; player.comboWindow = 0; player.comboQueued = false;
  player.iframes = 0; player.dodgeCD = 0;
  state.camYaw = Math.PI; state.camPitch = 0.32;
  $('boss-wrap').classList.add('hidden');
  $('rage-vignette').classList.remove('on');
  updateHUD();
}
function startGame() {
  AudioSys.init();
  if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') AudioSys.ctx.resume();
  if (IS_TOUCH) {
    try { const p = document.documentElement.requestFullscreen?.(); if (p && p.catch) p.catch(() => {}); } catch {}
    try { const o = screen.orientation; if (o && o.lock) { const r = o.lock('landscape'); if (r && r.catch) r.catch(() => {}); } } catch {}
  }
  resetGame();
  state.mode = 'playing'; state.time = 0;
  $('title-screen').classList.add('hidden');
  $('death-screen').classList.add('hidden');
  $('victory-screen').classList.add('hidden');
  $('pause-screen').classList.add('hidden');
  $('hud').classList.remove('hidden');
  VoiceSys.init();
  // the story comes first — the yuddha begins when the tale is told
  playCutscene('intro', () => {
    state.mode = 'playing';
    startWave(0);
    announce('⚔️ YUDDHA BEGINS ⚔️');
    VoiceSys.speak(VOICE_LINES.start, { interrupt: true });
  });
}
function togglePause() {
  if (state.mode === 'playing') {
    state.mode = 'paused';
    $('pause-screen').classList.remove('hidden');
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  } else if (state.mode === 'paused') {
    state.mode = 'playing';
    $('pause-screen').classList.add('hidden');
  }
}
function gameOver() {
  if (state.mode !== 'playing') return;
  state.mode = 'dead';
  $('death-stats').textContent = `Waves faced: ${state.wave + 1} · Asuras slain: ${state.kills} · Punya: ${Math.floor(state.score)} · Time: ${Math.floor(state.playTime)}s`;
  $('death-screen').classList.remove('hidden');
  VoiceSys.speak(VOICE_LINES.death, { interrupt: true });
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
}
function showVictoryScreen() {
  state.mode = 'victory';
  AudioSys.victory();
  $('victory-title').textContent = 'INDRA HAS FALLEN!';
  $('victory-stats').textContent = `Asuras slain: ${state.kills} · Punya: ${Math.floor(state.score)} · Time: ${Math.floor(state.playTime)}s · HP left: ${Math.ceil(player.hp)}`;
  $('victory-screen').classList.remove('hidden');
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  announce('॥ VIJAYA ॥ DHARMA PREVAILS');
  VoiceSys.speak(VOICE_LINES.victory, { interrupt: true });
  // festival of lights — every diya flares for the fallen
  for (const d of diyaPositions) {
    spawnParticles(new THREE.Vector3(d.x, d.y, d.z), 14, 0xffd54a, 4, 1.2, -2, 5);
  }
  spawnRing(player.pos.clone(), 0xffd54a, 10);
}

$('start-btn').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', togglePause);
$('restart-btn-1').addEventListener('click', startGame);
$('reborn-btn').addEventListener('click', startGame);
$('again-btn').addEventListener('click', startGame);
$('boon-skip').addEventListener('click', skipBoon);
// tapping the shrine backdrop also continues (extra escape hatch)
$('boon-screen').addEventListener('click', (e) => { if (e.target === $('boon-screen')) skipBoon(); });
$('dialogue').addEventListener('click', advanceStory);
$('dlg-skip').addEventListener('click', (e) => { e.stopPropagation(); endCutscene(); });
$('voice-btn').addEventListener('click', (e) => { e.stopPropagation(); AudioSys.init(); VoiceSys.toggle(); });
canvas.addEventListener('click', () => { AudioSys.init(); });

// torch flicker anchors
function updateAmbient(dt) {
  state.time += dt;
  // diya flames flicker
  for (const f of flames) {
    if (f.userData.flame) {
      const fl = f.userData.flame;
      const s = 1 + Math.sin(state.time * 11 + f.position.x) * 0.15 + Math.random() * 0.06;
      fl.scale.set(0.9 * s, 1.3 * (2 - s) * 0.9 + 0.35, 1);
    } else if (f.userData.isBanner) {
      f.rotation.y = Math.sin(state.time * 1.6 + f.position.x) * 0.25;
    }
  }
  // torch point lights follow first 3 diyas
  for (let i = 0; i < torchLights.length; i++) {
    const d = diyaPositions[(i * 2) % Math.max(1, diyaPositions.length)];
    if (d) {
      torchLights[i].position.set(d.x, d.y + 0.5, d.z);
      torchLights[i].intensity = 22 + Math.sin(state.time * 9 + i * 2) * 5 + Math.random() * 2;
    }
  }
  // edge glow pulse when rage ready
  if (player.mesh && state.rageActive <= 0) {
    const g = playerParts().weapon.userData.edgeGlow;
    if (g) {
      const target = state.rage >= 100 ? 0.45 + Math.sin(state.time * 8) * 0.25 : 0;
      g.material.opacity = lerp(g.material.opacity, target, dt * 6);
    }
  }
  // upgraded khadga burns brighter
  if (player.tipFlame) {
    const l = (state.up && state.up.dmgLvl) || 0;
    player.tipFlame.visible = l >= 2 && (state.mode === 'playing' || state.mode === 'story');
    const fs = 0.55 + l * 0.28 + Math.sin(state.time * 13) * 0.08;
    player.tipFlame.scale.set(fs, fs * 1.5, 1);
  }
  // storm-throne lightning
  if (state.flash > 0) {
    state.flash = Math.max(0, state.flash - dt * 6);
    const base = state.act === 2 ? 0.6 : state.act === 1 ? 1.15 : 0.95;
    hemi.intensity = base + state.flash * 2.4;
  }
  if (state.act === 2 && (state.mode === 'playing' || state.mode === 'story')) {
    state.stormT -= dt;
    if (state.stormT <= 0) {
      state.stormT = rand(3, 7);
      state.flash = 1;
      thunderCrack();
      state.shake = Math.min(1, state.shake + 0.25);
      spawnParticles(new THREE.Vector3(rand(-20, 20), 18, rand(-20, 20)), 20, 0xbfa8ff, 4, 0.5, 0, 0);
    }
  }
}

// ---------------- Main loop ----------------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  let rawDt = Math.min(clock.getDelta(), 0.05);
  // hit-stop freeze
  if (state.hitStop > 0) {
    state.hitStop -= rawDt;
    rawDt *= 0.05;
  }
  const dt = rawDt * state.slowMo;

  if (state.mode === 'playing') {
    state.playTime += dt;
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer <= 0) state.combo = 0;
    updatePlayer(dt);
    updateWaves(dt);
    updateBolts(dt);
    updatePickups(dt);
    // the gods leave prasad when the warrior bleeds
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      state.pickupTimer = 16;
      if (player.hp < player.maxHp * 0.7 && pickups.filter((p) => p.userData.type === 'soma').length < 2) {
        spawnPickup('soma', findPickupSpot());
      }
    }
    // enemies
    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const alive = state.enemies[i].update(dt);
      if (!alive) state.enemies.splice(i, 1);
    }
    updateCamera(rawDt);
    // combo HUD decay refresh (cheap, every frame ok)
    $('combo-fill').style.width = (clamp(state.comboTimer / 3, 0, 1) * 100) + '%';
    $('combo-count').textContent = state.combo >= 2 ? `${state.combo} HITS!` : 'DHARMA';
    if (state.rageActive > 0) {
      $('rage-bar').style.width = (state.rageActive / state.up.rageDur * 100) + '%';
      $('rage-text').textContent = '🔥 RUDRA RAGE ACTIVE 🔥';
    }
  } else if (state.mode === 'title') {
    // cinematic orbit around temple
    const t = state.time;
    camera.position.set(Math.sin(t * 0.12) * 26, 9 + Math.sin(t * 0.2) * 2, Math.cos(t * 0.12) * 26);
    camera.lookAt(0, 3, 0);
    // idle hero pose at center for backdrop
    player.pos.set(0, 0, 4);
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = Math.sin(t * 0.3) * 0.4 + Math.PI;
    const u = playerParts();
    u.armR.rotation.x = -0.2 + Math.sin(t * 1.2) * 0.08;
    // a couple of demo asuras circling
  } else if (state.mode === 'story') {
    // slow cinematic orbit around the warrior while the tale is told
    const t = state.time;
    const px = player.pos.x, pz = player.pos.z;
    camera.position.lerp(
      new THREE.Vector3(px + Math.sin(t * 0.22) * 9.5, 3.6, pz + Math.cos(t * 0.22) * 9.5),
      1 - Math.pow(0.001, rawDt)
    );
    camera.lookAt(px, 1.9, pz);
  }
  updateAmbient(dt || rawDt);
  updateParticles(dt || 0.016);
  updateRings(dt || 0.016);
  updateSlashes(dt || 0.016);
  updateChain(dt || 0.016);
  renderer.render(scene, camera);
}

// boot
$('loading').style.display = 'none';
setupTouch();
VoiceSys.init();
updateHUD();
frame();

// auto-expose for testing
window.__veer = { state, player, startGame, startAct, voice: VoiceSys, lines: VOICE_LINES, touch, isTouch: IS_TOUCH,
  pickups, boons: BOONS, spawnPickup, showBoon, buyBoon, skipBoon, playCutscene, endCutscene, CUTSCENES };
