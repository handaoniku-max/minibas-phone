// Minibas v3 — shared effects for the mini games: sound made with WebAudio (no files) and screen particles.
// M toggles the sound in a game; the choice is kept in this browser.
'use strict';
const GFX = { ctx: null, mute: false, last: {}, parts: [], t: 0 };
try { GFX.mute = localStorage.getItem('minibas_mute') === '1'; } catch (e) { }
function gfxMute(on) { GFX.mute = on; try { localStorage.setItem('minibas_mute', on ? '1' : '0'); } catch (e) { } }
// name: [wave, start Hz, end Hz, seconds, volume, shortest gap between two plays in ms]
const GFX_SOUNDS = {
  shot: ['sine', 500, 300, 0.06, 0.03, 80], hit: ['square', 520, 260, 0.05, 0.025, 50], down: ['triangle', 300, 900, 0.12, 0.07, 80],
  pickup: ['sine', 660, 1320, 0.12, 0.08, 60], power: ['sawtooth', 220, 880, 0.3, 0.06, 100], hurt: ['sawtooth', 200, 60, 0.3, 0.11, 100],
  special: ['square', 150, 1200, 0.5, 0.08, 200], warn: ['square', 880, 880, 0.08, 0.05, 150], gate: ['sine', 520, 780, 0.1, 0.07, 60],
  bad: ['square', 200, 120, 0.15, 0.06, 100], jump: ['sine', 300, 600, 0.15, 0.06, 100], tink: ['square', 1200, 900, 0.03, 0.02, 80],
};
const GFX_TUNES = { win: [523, 659, 784, 1047], lose: [392, 330, 262] };
function gfxTone(wave, f0, f1, dur, vol, delay = 0) {
  try {
    GFX.ctx = GFX.ctx || new (window.AudioContext || window.webkitAudioContext)();
    const a = GFX.ctx; if (a.state === 'suspended') a.resume();
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
    o.type = wave; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { }
}
function gfxSound(name, pitch = 1) {
  if (GFX.mute) return;
  if (GFX_TUNES[name]) { GFX_TUNES[name].forEach((f, i) => gfxTone('triangle', f, f, 0.22, 0.09, i * 0.14)); return; }
  const d = GFX_SOUNDS[name], now = performance.now();
  if (!d || now - (GFX.last[name] || 0) < d[5]) return;
  GFX.last[name] = now;
  gfxTone(d[0], d[1] * pitch, d[2] * pitch, d[3], d[4]);
}
// Particles live in screen pixels. size is the projected scale of the spot they come from.
function gfxBurst(x, y, color, n, size = 30) {
  if (GFX.parts.length > 400) return;
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = (0.5 + Math.random()) * size * 2.2; GFX.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - size, t: 0, life: 0.35 + Math.random() * 0.3, color, r: Math.max(2, size * (0.05 + Math.random() * 0.06)) }); }
}
function gfxClear() { GFX.parts = []; }
function gfxDraw(c) {
  const now = performance.now(), dt = Math.min(0.05, (now - (GFX.t || now)) / 1000); GFX.t = now;
  for (const p of GFX.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; }
  GFX.parts = GFX.parts.filter(p => p.t < p.life);
  for (const p of GFX.parts) { c.globalAlpha = 1 - p.t / p.life; c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }
  c.globalAlpha = 1;
}
