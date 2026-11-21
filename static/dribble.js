// Minibas v3 — "ドリブルラン": a lane runner mini game drawn on a canvas.
// One play costs GP (the server takes it at the start). Stages are generated from a fixed seed,
// so each stage is the same every time and can be learned. Results go back to the server.
// Images are optional: when a run_*.png is missing, an existing image or a canvas drawing is used.
// All names in this file start with "dr" so it can sit next to the other mini game (shoot.js).
'use strict';

/* ================= Stage design ================= */
const DR_BOSSES = {
  3: { name: 'ジャイアントもくもく', img: 'run_boss1.png', fb: 'clouds.png' },
  6: { name: 'キングウルフ', img: 'run_boss2.png', fb: 'wolves.png' },
  10: { name: 'メガティラノ', img: 'run_boss3.png', fb: 'dinos.png' },
};
const DR_KEEPER = { name: 'ゴールキーパー', img: 'run_keeper.png', fb: 'cats.png' };
const DR_TRAITS = {
  rabbit: { text: '左右の動きがはやい', lat: 2.7, cool: 0.45, shield: 0 },
  cat: { text: 'シュートを連続で打てる', lat: 2.0, cool: 0.28, shield: 0 },
  fluff: { text: '障害物に1回だけたえる', lat: 2.0, cool: 0.45, shield: 1 },
};
const DR_FEATURES = [
  [1, 'ゲート（＋・×）'], [2, 'コーン'], [3, 'ディフェンス・ボス'], [4, 'マイナスゲート・？ゲート'],
  [5, 'うごくゲート・カベ'], [6, 'ころがるボール'], [7, '÷ゲート・うごくカベ'], [8, '道いっぱいのディフェンス'],
];
function drRng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const drGateApply = (g, n) => Math.max(0, Math.min(999, g.op === '+' ? n + g.v : g.op === '-' ? n - g.v : g.op === 'x' ? n * g.v : Math.floor(n / g.v)));
const drGateText = g => g.hidden && !g.shown ? '？' : (g.op === '+' ? '＋' : g.op === '-' ? '－' : g.op === 'x' ? '×' : '÷') + g.v;
const drGateGood = g => g.op === '+' || g.op === 'x';

function drStage(n) {
  const R = drRng(n * 7919 + 13), ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const f = { cones: n >= 2, def: n >= 3, neg: n >= 4, hidden: n >= 4, moving: n >= 5, wall: n >= 5, roller: n >= 6, div: n >= 7, wallMove: n >= 7, fullDef: n >= 8 };
  const gap = 24 - Math.min(9, n * 0.9), events = [];
  let z = 40, exp = 1;   // exp: the crowd with every gate chosen well and nothing avoidable hit (upgrades not counted)
  const segs = 8 + n * 2;
  for (let i = 0; i < segs; i++) {
    const g = drGates(R, ri, exp, f, n);
    g.z = z; events.push(g); exp = g.best; z += gap;
    if (i === 0 && n === 1) continue;
    const h = drHazard(R, ri, exp, f, n, i);
    if (h) { h.z = z; events.push(h); exp = Math.max(1, exp - drBestLoss(h, exp)); z += gap; }
  }
  // extras between the gates, from their own random stream so the gates and hazards stay as they were:
  // "+N" balls to pick up and fever stars
  const R2 = drRng(n * 104729 + 7), extra = [];
  events.filter(e => e.type === 'gates' || e.type === 'mgate').forEach((g, i) => {
    const x = -0.8 + R2() * 1.6, roll = R2();
    if (i % 3 === 1) extra.push({ type: 'fstar', z: g.z + gap * 0.5, x });
    else if (roll < 0.5) extra.push({ type: 'pick', z: g.z + gap * 0.5, x, v: Math.max(1, Math.round(g.best * 0.04)) });
  });
  events.push(...extra); events.sort((a, b) => a.z - b.z);
  const boss = DR_BOSSES[n] || DR_KEEPER;
  // the boss is DR_BOSS times as strong as the plain gate maths says: the power gauge at the end multiplies the crowd by 0.8 to 2
  const hp = Math.max(3, Math.round(exp * DR_BOSS * (0.3 + 0.045 * n + (DR_BOSSES[n] ? 0.05 : 0))));
  const spare = Math.max(1, Math.round(exp * 1.5) - hp);
  return { n, speed: 13 + n * 0.9, events, end: z + 14, hp, exp, boss, s2: Math.max(1, Math.round(hp * 0.5)), s3: Math.max(2, Math.round(hp * 1.5)) };
}
function drGates(R, ri, n, f, stage) {
  const plus = () => ({ op: '+', v: ri(3, 5 + stage) });
  const times = () => ({ op: 'x', v: stage >= 6 && R() < 0.2 ? 3 : 2 });
  const minus = () => ({ op: '-', v: Math.max(1, Math.min(Math.floor(n * 0.6), ri(2, 4 + Math.round(stage * 1.5)))) });
  const div = () => ({ op: '/', v: 2 });
  let a, b;
  const roll = R();
  if (f.neg && n >= 6 && roll < 0.3) { a = minus(); b = f.div && R() < 0.5 ? div() : minus(); }   // both bad: pick the lesser evil
  else if (f.neg && n >= 4 && roll < 0.65) { a = n >= 60 ? plus() : R() < 0.5 ? plus() : times(); b = f.div && R() < 0.4 ? div() : minus(); }
  else { a = plus(); b = n >= 150 ? plus() : times(); }
  if (R() < 0.5) [a, b] = [b, a];
  if (f.hidden && R() < 0.3) (R() < 0.5 ? a : b).hidden = true;
  if (f.moving && R() < 0.25) {
    const g = drGateApply(a, n) >= drGateApply(b, n) ? a : b;
    g.hidden = false;
    return { type: 'mgate', gate: g, amp: 0.5, w: 1.2 + R() * 1.4, ph: R() * 6.28, best: drGateApply(g, n) };
  }
  return { type: 'gates', left: a, right: b, best: Math.max(1, drGateApply(a, n), drGateApply(b, n)) };
}
// The smallest loss a perfectly placed crowd of n can get from a hazard (moving parts: assume good timing).
function drBestLoss(h, n) {
  if (h.type === 'roller') return 0;
  if (h.type === 'def' && h.full) return Math.min(n, h.e);
  const spans = h.type === 'cones' ? h.xs.map(x => [x - 0.12, x + 0.12]) : h.type === 'wall' ? [[-2, h.gx - h.gw / 2], [h.gx + h.gw / 2, 2]] : [[h.x - h.w / 2, h.x + h.w / 2]];
  const lim = Math.max(0.1, 1 - drSpan(n) * 0.6);
  let best = n;
  for (let x = -lim; x <= lim + 1e-9; x += 0.02) best = Math.min(best, drHit({ x, n }, spans));
  return h.type === 'def' ? Math.min(h.e, best) : best;
}
function drHazard(R, ri, n, f, stage, i) {
  const kinds = [];
  if (f.cones) kinds.push('cones');
  if (f.def) kinds.push('def', 'def');
  if (f.wall) kinds.push('wall');
  if (f.roller) kinds.push('roller');
  if (!kinds.length || R() < 0.15) return null;
  const k = kinds[Math.floor(R() * kinds.length)];
  if (k === 'cones') return { type: 'cones', xs: Array.from({ length: ri(2, 3 + (stage >= 6 ? 1 : 0)) }, () => -0.85 + R() * 1.7) };
  if (k === 'roller') return { type: 'roller', balls: Array.from({ length: stage >= 8 ? 2 : 1 }, () => ({ amp: 0.8, w: 1.5 + R() * 1.5, ph: R() * 6.28 })) };
  if (k === 'wall') { const gw = Math.max(0.5, 0.8 - stage * 0.03); return { type: 'wall', gx: -0.6 + R() * 1.2, gw, move: f.wallMove && R() < 0.5 ? 0.35 : 0, w: 1 + R(), ph: R() * 6.28 }; }
  const e = Math.max(2, Math.round(n * (0.25 + R() * 0.25)));
  if (f.fullDef && R() < 0.35) return { type: 'def', x: 0, w: 2, e, full: true, cost: e };
  return { type: 'def', x: -0.55 + R() * 1.1, w: 0.5 + R() * 0.3, e };
}

/* ================= Menu (in the あそぶ screen) ================= */
let drSel = null;
function drMenu() {
  const r = S.data.run, C = S.catalog, gp = S.coach.gp.available, k = S.data.active, t = DR_TRAITS[k];
  if (!drSel || drSel > r.unlocked) drSel = r.unlocked;
  const card = n => {
    const best = r.best[n], lock = n > r.unlocked, boss = DR_BOSSES[n];
    return `<button class="rstage ${n === drSel ? 'on' : ''} ${lock ? 'lock' : ''}" data-rstage="${n}" ${lock ? 'disabled' : ''}>
      <b>${lock ? '🔒' : 'ステージ' + n}</b>${boss ? `<span class="tag">ボス</span>` : ''}
      <span class="stars">${lock ? '' : [1, 2, 3].map(i => best && best.stars >= i ? '★' : '☆').join('')}</span>
      <small>${best ? 'ベスト ' + best.score : lock ? `ステージ${n - 1}をクリア` : 'まだクリアしていない'}</small></button>`;
  };
  const sg = drStage(drSel), news = DR_FEATURES.filter(([s]) => s === drSel).map(([, x]) => x);
  $('content').innerHTML = playTabs() + `
  <div class="grid two">
    <section class="card runhero">
      <h2>🏃 ドリブルラン <small>1回 ${C.run_cost}GP</small></h2>
      <p>ゲートを選んで仲間をふやし、ゴール前の${esc(sg.boss.name)}をたおそう！ 仲間が0人になったら負け。</p>
      <ul class="small runhow"><li>指を左右にすべらせて動く</li><li>タップでシュート：＋・－のゲートに当てると数字が1ふえる</li><li>上にスワイプでジャンプ：コーンと転がるボールをとびこえる</li><li>青い＋ボールで仲間がふえ、⭐やいいゲートでフィーバーゲージがたまる</li><li>フィーバー中は障害物をふきとばして進む</li><li>ボスの前のパワーゲージをまん中で止めると仲間が2倍</li><li>人数が多いほど列が広がって、障害物をよけにくくなる</li><li>左下の ⏸ で一時停止</li></ul>
      <div class="runner"><img src="${image(k)}" alt=""><div><b>${esc(name(k))}</b> が走るよ<br><small class="muted">とくい：${t.text}（相棒は「相棒」画面で切りかえ）</small></div></div>
      <p class="gpline">🪙 GP <b>${gp}</b> <span class="muted">／ あと${Math.floor(gp / C.run_cost)}回あそべる</span></p>
      <button class="primary go" id="drGo" ${gp < C.run_cost ? 'disabled' : ''}>ステージ${drSel}をスタート（${C.run_cost}GP）</button>
      ${gp < C.run_cost ? '<p class="muted">GPは、パパの家事・対戦の勝利・おねがい達成でたまるよ</p>' : ''}
      <p class="muted">ステージ${drSel}：ボス ${esc(sg.boss.name)}（HP ${sg.hp}）${news.length ? ` ／ 新しいしかけ：${news.join('・')}` : ''}<br>★2は${sg.s2}人、★3は${sg.s3}人残してクリア</p>
    </section>
    <section class="card"><h2>ステージ <small>クリアすると次のステージ</small></h2><div class="rstages">${Array.from({ length: C.run_stages }, (_, i) => card(i + 1)).join('')}</div>
      <p class="muted">あそんだ回数 ${r.plays}回。ステージは毎回同じなので、おぼえるほど上手になるよ。</p></section>
  </div>`;
  document.querySelectorAll('[data-rstage]').forEach(b => b.onclick = () => { drSel = Number(b.dataset.rstage); drMenu(); });
  $('drGo').onclick = () => drBegin();
}
// trial = a free try started from Mama's coach screen: any stage, no GP, nothing recorded.
async function drBegin(trial = false, stage = drSel) {
  if (busy || DR) return;
  busy = true;
  try {
    const next = await req('/api/action', { action: 'run_start', game: 'run', stage, trial });
    S = next; hud();
    drOpen(next.event.id, next.event.stage, trial);
  } catch (e) { tell(e.message); } finally { busy = false; }
}

/* ================= Images ================= */
const DR_IMG = {};
function drImg(name, fb) {
  if (DR_IMG[name]) return DR_IMG[name];
  const img = new Image();
  img.onload = () => { img.ok = true; };
  img.onerror = () => { if (fb && !img.tried) { img.tried = true; img.src = 'assets/' + fb; } };
  img.src = 'assets/' + name;
  return DR_IMG[name] = img;
}

/* ================= Game ================= */
let DR = null;
function drOpen(id, n, trial = false) {
  const k = S.data.active, t = DR_TRAITS[k], st = drStage(n);
  for (const e of st.events) { if (e.type === 'gates') { e.left = { ...e.left }; e.right = { ...e.right }; } if (e.type === 'mgate') e.gate = { ...e.gate }; }
  const layer = document.createElement('div');
  layer.className = 'runlayer';
  layer.innerHTML = '<canvas id="drCanvas"></canvas><div class="runpanel hidden" id="drPanel"></div>';
  document.body.append(layer);
  document.querySelector('main').inert = true;
  const cv = layer.querySelector('canvas');
  DR = {
    id, st, k, t, trial, layer, cv, ctx: cv.getContext('2d'),
    n: 1, x: 0, tx: 0, z: 0, time: 0, phase: 'count', count: 3, ei: 0,
    balls: [], pops: [], cool: 0, shield: t.shield, hits: 0, keys: {}, paused: false,
    jump: 0, jumpCd: 0, fg: 0, feverT: 0, streak: 0, picks: 0, mult: 0,
    bossHp: st.hp, bossT: 0, result: null, last: performance.now(),
    runner: drImg(`run_runner_${k}.png`, `${k}${S.stats[k].look}.png`),
    member: drImg('run_member.png'), defender: [drImg('run_defender1.png'), drImg('run_defender2.png')],
    boss: drImg(st.boss.img, st.boss.fb), bg: drImg('run_bg.png'),
  };
  drResize();
  window.addEventListener('resize', drResize);
  window.addEventListener('keydown', drKey);
  window.addEventListener('keyup', drKey);
  cv.addEventListener('mousemove', drMouse);
  cv.addEventListener('mousedown', e => { e.preventDefault(); if (DR && !DR.paused) (e.button === 2 ? drJump : drShoot)(); });
  gfxClear();
  cv.addEventListener('contextmenu', e => e.preventDefault());
  requestAnimationFrame(drFrame);
}
function drClose() {
  if (!DR) return;
  window.removeEventListener('resize', drResize);
  window.removeEventListener('keydown', drKey);
  window.removeEventListener('keyup', drKey);
  DR.layer.remove();
  DR = null;
  document.querySelector('main').inert = false;
  render();
}
function drResize() {
  const r = DR, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!r) return;
  r.W = window.innerWidth; r.H = window.innerHeight;
  r.cv.width = r.W * dpr; r.cv.height = r.H * dpr;
  r.cv.style.width = r.W + 'px'; r.cv.style.height = r.H + 'px';
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.hor = r.H * 0.3; r.F = (r.H * 0.86 - r.hor) * DR_CAM / 3; r.lane = Math.min(4, r.W / r.H * 2.4);
}
function drKey(e) {
  const r = DR;
  if (!r) return;
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'a', 'd', 'A', 'D', 'w', 'W', ' '].includes(k)) e.preventDefault();
  if (e.type === 'keyup') { r.keys[k] = false; return; }
  if (k === 'Escape') { if (r.phase === 'run' || r.phase === 'count') drPause(!r.paused); return; }
  if (k === ' ' && !e.repeat && !r.paused) drShoot();
  if (['ArrowUp', 'w', 'W'].includes(k) && !e.repeat && !r.paused) drJump();
  if ((k === 'm' || k === 'M') && !e.repeat) gfxMute(!GFX.mute);
  r.keys[k] = true; r.mouse = false;
}
function drMouse(e) {
  const r = DR;
  if (!r || r.paused) return;
  const p = drProj(0, r.z), half = drProj(1, r.z).x - p.x;
  r.tx = Math.max(-1, Math.min(1, (e.clientX - p.x) / half)); r.mouse = true;
}
function drShoot() {
  const r = DR;
  if (r.phase === 'boss' && r.bossT >= 0.8 && !r.mult) return drPower(r);
  if (r.phase !== 'run' || r.cool > 0) return;
  r.balls.push({ x: r.x, z: r.z + 1, h: 0 });
  r.cool = r.t.cool; gfxSound('shot');
}
// Jump: the whole crowd hops over cones and rolling balls (not over walls or defenders).
const DR_JUMP = 0.45;
const DR_BOSS = 2.2;   // boss strength. Raise to make every stage harder
const drJumpY = r => r.jump > 0 ? Math.sin(Math.PI * (1 - r.jump / DR_JUMP)) * 1.3 : 0;
function drJump() {
  const r = DR;
  if (r.phase !== 'run' || r.jumpCd > 0) return;
  r.jump = DR_JUMP; r.jumpCd = 1; gfxSound('jump');
}
// The power gauge before the boss: stop the marker near the middle. The crowd is multiplied by 0.8 to 2.
const drGaugePos = r => 0.5 + 0.5 * Math.sin((r.bossT - 0.8) * (3 + r.st.n * 0.25));
function drPower(r, late) {
  const acc = late ? 0 : 1 - Math.abs(drGaugePos(r) - 0.5) * 2;
  r.mult = acc > 0.85 ? 2 : acc > 0.6 ? 1.5 : acc > 0.3 ? 1.1 : 0.8;
  r.n = Math.max(1, Math.min(999, Math.round(r.n * r.mult)));
  drPop(r, r.mult >= 2 ? 'パーフェクト！ ×2' : r.mult >= 1.5 ? 'ナイスパワー！ ×1.5' : r.mult > 1 ? 'パワー ×1.1' : 'おしい… ×0.8', r.mult >= 1.5 ? '#f07a36' : '#5b6578');
  gfxSound(r.mult >= 1.5 ? 'power' : 'bad');
}
function drGateResult(r, nice) {
  if (!nice) { r.streak = 0; gfxSound('bad'); return; }
  r.streak++; r.fg = Math.min(100, r.fg + 5 + Math.min(5, r.streak));
  if (r.streak >= 2) drPop(r, `ナイス！×${r.streak}`, '#f0a020', r.x + (r.x < 0 ? 0.4 : -0.4));
  gfxSound('gate', 1 + Math.min(0.8, r.streak * 0.08));
}
function drPick(r, e) {
  if (Math.abs(r.x - e.x) > 0.16 + drSpan(r.n)) return;
  e.got = true; r.picks++;
  if (e.type === 'fstar') { r.fg = Math.min(100, r.fg + 25); drPop(r, '⭐フィーバー＋', '#e0a000', e.x); }
  else { r.n = Math.min(999, r.n + e.v); r.fg = Math.min(100, r.fg + 3); }
  gfxSound('pickup');
  const q = drProj(e.x, e.z + 0.5); if (q) gfxBurst(q.x, q.y - q.s * 0.6, e.type === 'fstar' ? '#ffd24d' : '#6fb1ff', 10, q.s);
}
function drPause(on) {
  const r = DR; r.paused = on;
  const p = $('drPanel');
  if (!on) { p.classList.add('hidden'); r.last = performance.now(); requestAnimationFrame(drFrame); return; }
  p.classList.remove('hidden');
  p.innerHTML = `<h2>一時停止</h2><p class="muted">${r.trial ? 'ためし遊び中です。' : 'やめると、このプレイのGPはもどりません。'}</p><div class="row" style="justify-content:center"><button class="primary" id="drResume">つづける</button><button id="drQuit">やめる</button></div>`;
  $('drResume').onclick = () => drPause(false);
  $('drQuit').onclick = () => { r.paused = false; r.quit = true; drEnd(false); };
  $('drResume').focus();
}
// World: x in lane units (-1..1), z forward. Camera DR_CAM units behind the leader, 3 units high.
const DR_CAM = 9;
function drProj(x, z) {
  const r = DR, dz = z - (r.z - DR_CAM);
  if (dz <= 0.4) return null;
  const s = r.F / dz;
  return { x: r.W / 2 + x * r.lane * s, y: r.hor + 3 * s, s };
}
// Crowd formation: slots on a sunflower spiral just ahead of the leader.
function drSlots(n) {
  const out = [{ dx: 0, dz: 0 }], m = Math.min(n, 60);
  for (let i = 1; i < m; i++) { const a = i * 2.39996, rad = 0.058 * Math.sqrt(i); out.push({ dx: rad * Math.cos(a), dz: 0.7 + rad * 5 * Math.abs(Math.sin(a)) }); }
  return out;
}
const drSpan = n => 0.058 * Math.sqrt(Math.min(n, 60)) + 0.04;
const DR_RANGE = 22;   // how far a shot flies (world units): only gates close ahead can be powered up
const DR_STOP = 13;   // the crowd stops this far before the boss
// How many members a set of blocked intervals takes away (each slot stands for n / slots members).
function drHit(r, spans) {
  const slots = drSlots(r.n);
  let hit = 0;
  for (const s of slots) { const x = r.x + s.dx; if (spans.some(([a, b]) => x + 0.04 > a && x - 0.04 < b)) hit++; }
  return hit ? Math.max(1, Math.ceil(hit * r.n / slots.length)) : 0;
}
function drLose(r, loss, why, x) {
  if (!loss) return;
  if (r.feverT > 0) { r.n = Math.min(999, r.n + 1); drPop(r, 'スマッシュ！＋1', '#e0508a', x); gfxSound('down'); return; }
  if (r.shield > 0 && why !== 'def') { r.shield--; drPop(r, 'ガード！', '#2e8a52'); return; }
  r.n = Math.max(0, r.n - loss); r.shake = 0.25; r.streak = 0; gfxSound('hurt');
  drPop(r, `－${loss}`, '#d64545', x);
}
function drPop(r, text, color, x = r.x) { r.pops.push({ text, color, x, z: r.z + 1.5, t: 0 }); }

function drFrame(now) {
  const r = DR;
  if (!r || r.paused) return;
  const dt = Math.min(0.05, (now - r.last) / 1000); r.last = now;
  drStep(r, dt);
  if (!DR) return;
  drDraw(r);
  if (r.phase !== 'done') requestAnimationFrame(drFrame);
}
function drStep(r, dt) {
  r.time += dt;
  r.cool = Math.max(0, r.cool - dt); r.shake = Math.max(0, (r.shake || 0) - dt);
  r.jump = Math.max(0, r.jump - dt); r.jumpCd = Math.max(0, r.jumpCd - dt); r.feverT = Math.max(0, r.feverT - dt);
  // fever: 4 seconds of smashing through every obstacle, a bit faster
  if (r.fg >= 100 && r.feverT <= 0 && r.phase === 'run') { r.fg = 0; r.feverT = 4; drPop(r, 'フィーバー！', '#e0508a'); gfxSound('special'); }
  for (const p of r.pops) p.t += dt;
  r.pops = r.pops.filter(p => p.t < 1);
  if (r.phase === 'count') { r.count -= dt; if (r.count <= 0) r.phase = 'run'; return; }
  if (r.phase === 'boss') return drBoss(r, dt);
  if (r.phase !== 'run') return;
  // steering
  const dir = (r.keys.ArrowRight || r.keys.d || r.keys.D ? 1 : 0) - (r.keys.ArrowLeft || r.keys.a || r.keys.A ? 1 : 0);
  if (dir) r.tx = Math.max(-1, Math.min(1, r.x + dir * 0.5));
  const lim = Math.max(0.1, 1 - drSpan(r.n) * 0.6);
  r.tx = Math.max(-lim, Math.min(lim, r.tx));
  const d = r.tx - r.x, step = r.t.lat * dt;
  r.x += Math.abs(d) < step ? d : Math.sign(d) * step;
  // forward
  const z0 = r.z, sp = r.st.speed * Math.min(1, 0.4 + r.time * 0.6) * (r.feverT > 0 ? 1.25 : 1);
  r.z += sp * dt;
  // balls
  for (const b of r.balls) {
    const bz0 = b.z; b.z += 45 * dt; b.h += dt;
    for (const e of r.st.events) {
      if (b.dead || e.done || e.z <= bz0 || e.z > b.z) continue;
      if (e.type === 'gates') { const g = b.x < 0 ? e.left : e.right; drUpgrade(r, g, b); }
      else if (e.type === 'mgate') { const cx = Math.sin(r.time * e.w + e.ph) * e.amp; if (Math.abs(b.x - cx) < 0.45) drUpgrade(r, e.gate, b); }
      else if (e.type === 'def' && Math.abs(b.x - e.x) < e.w / 2 && e.e > 0) { e.e--; b.dead = true; r.hits++; }
    }
    if (b.z > r.z + DR_RANGE) b.dead = true;
  }
  r.balls = r.balls.filter(b => !b.dead);
  // events the leader passes this frame
  for (const e of r.st.events) {
    if (e.done || e.z > r.z || e.z <= z0) continue;
    e.done = true;
    drEvent(r, e);
    if (r.n <= 0) { r.phase = 'over'; setTimeout(() => drEnd(false), 1200); return; }
  }
  if (r.z >= r.st.end - DR_STOP) { r.z = r.st.end - DR_STOP; r.phase = 'boss'; r.bossT = 0; }
}
function drUpgrade(r, g, b) {
  b.dead = true; r.hits++;
  if (g.hidden) g.shown = true;
  if (g.op === '+') g.v++;
  else if (g.op === '-') { g.v--; if (g.v <= 0) { g.op = '+'; g.v = 0; } }
  else { g.tink = 0.3; return; }   // × and ÷ gates are too hard to change
  g.flash = 0.25;
}
function drEvent(r, e) {
  const before = r.n;
  if (e.type === 'gates') {
    const g = r.x < 0 ? e.left : e.right, o = r.x < 0 ? e.right : e.left; g.shown = true;
    drGateResult(r, drGateApply(g, r.n) >= drGateApply(o, r.n));
    r.n = drGateApply(g, r.n); r.flash = drGateGood(g) ? 'good' : 'bad';
  } else if (e.type === 'mgate') {
    const cx = Math.sin(r.time * e.w + e.ph) * e.amp;
    if (Math.abs(r.x - cx) < 0.45) { r.n = drGateApply(e.gate, r.n); r.flash = 'good'; drGateResult(r, true); }
    else drPop(r, 'とれなかった…', '#7a8496');
  } else if (e.type === 'pick' || e.type === 'fstar') drPick(r, e);
  else if ((e.type === 'cones' || e.type === 'roller') && r.jump > 0 && r.feverT <= 0) { drPop(r, 'ジャンプ成功！', '#2e8a52'); r.fg = Math.min(100, r.fg + 4); }
  else if (e.type === 'cones') drLose(r, drHit(r, e.xs.map(x => [x - 0.12, x + 0.12])), 'cone');
  else if (e.type === 'roller') drLose(r, drHit(r, e.balls.map(b => { const x = Math.sin(r.time * b.w + b.ph) * b.amp; return [x - 0.16, x + 0.16]; })), 'roller');
  else if (e.type === 'wall') { const gx = e.gx + (e.move ? Math.sin(r.time * e.w + e.ph) * e.move : 0); drLose(r, drHit(r, [[-2, gx - e.gw / 2], [gx + e.gw / 2, 2]]), 'wall'); }
  else if (e.type === 'def' && e.e > 0) {
    const met = drHit(r, [[e.x - e.w / 2, e.x + e.w / 2]]), loss = Math.min(e.e, met);
    if (loss) { if (r.feverT > 0) e.e = 0; else e.e -= loss; drLose(r, loss, 'def'); }
  }
  const diff = r.n - before;
  if (diff > 0) drPop(r, `＋${diff}`, '#2e7be0');
  else if (diff < 0 && (e.type === 'gates' || e.type === 'mgate')) drPop(r, `${diff}`, '#d64545');
}
function drBoss(r, dt) {
  r.bossT += dt;
  for (const b of r.balls) { b.z += 30 * dt; b.h += dt; if (b.z > r.z + DR_STOP) b.dead = true; }
  r.balls = r.balls.filter(b => !b.dead);
  if (r.bossT < 0.8) return;
  if (!r.mult) { if (r.bossT > 6.8) drPower(r, true); return; }   // waiting for the power gauge
  if (r.n > 0 && r.bossHp > 0 && Math.random() < 0.6) r.balls.push({ x: r.x + (Math.random() - 0.5) * drSpan(r.n) * 2, z: r.z + 1, h: Math.random() });
  // both sides shrink together, then whoever is left wins
  const rate = Math.max(6, (r.st.hp) / 1.6) * dt;
  r.acc = (r.acc || 0) + rate;
  while (r.acc >= 1 && r.n > 0 && r.bossHp > 0) { r.acc -= 1; r.n--; r.bossHp--; }
  if (r.bossHp <= 0 && r.n > 0) { r.phase = 'win'; gfxSound('win'); setTimeout(() => drEnd(true), 1300); if (!reduceMotion.matches) confetti(); }
  else if (r.n <= 0) { r.phase = 'over'; setTimeout(() => drEnd(false), 1300); }
}
async function drEnd(cleared) {
  const r = DR;
  if (!r || r.phase === 'done') return;
  const atBoss = r.bossHp < r.st.hp && r.bossHp > 0;
  r.phase = 'done';
  const left = cleared ? r.n : 0, stars = cleared ? (left >= r.st.s3 ? 3 : left >= r.st.s2 ? 2 : 1) : 0;
  const score = cleared ? Math.min(90000, left * 100 + r.hits * 5 + r.picks * 50 + stars * 300) : 0;
  let ev = null;
  try { const next = await req('/api/action', { action: 'run_finish', id: r.id, cleared, score, stars }); S = next; ev = next.event; }
  catch (e) { tell(e.message); }
  drDraw(r);
  const gp = S.coach.gp.available, cost = S.catalog.run_cost, p = $('drPanel');
  p.classList.remove('hidden');
  p.innerHTML = `<h2>${cleared ? 'クリア！' : 'ざんねん…'}</h2>
    ${cleared ? `<p class="runstars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</p>
      <p>のこった仲間 <b>${left}</b>人 ／ パワー ×${r.mult || 1} ／ アイテム ${r.picks}こ ／ シュート命中 ${r.hits}回</p><p class="runscore">${score}点${ev?.record ? ' <span class="tag">ベスト更新！</span>' : ''}</p>
      ${ev?.unlocked ? `<p class="tag gp">ステージ${ev.unlocked}が遊べるようになった！</p>` : ''}
      ${stars < 3 ? `<p class="muted">★${stars + 1}は ${stars === 1 ? r.st.s2 : r.st.s3}人のこしてクリア</p>` : ''}`
      : `<p>${r.quit ? 'とちゅうでやめました' : atBoss ? `${esc(r.st.boss.name)}のHPがあと${r.bossHp}だった！` : '仲間がいなくなった…'}</p><p class="muted">＋ボールをひろって、さいごのパワーゲージをまん中で止めるのがコツ</p>`}
    <div class="row" style="justify-content:center">
      ${r.trial ? `<button class="primary" id="drAgain">もう1回ためす</button>${r.st.n < S.catalog.run_stages ? `<button id="drNext">ステージ${r.st.n + 1}をためす</button>` : ''}` : `
      <button class="primary" id="drAgain" ${gp < cost ? 'disabled' : ''}>もう1回（${cost}GP）</button>
      ${ev?.unlocked ? `<button class="primary" id="drNext">ステージ${ev.unlocked}へ（${cost}GP）</button>` : ''}`}
      <button id="drBack">もどる</button></div><p class="muted">${r.trial ? 'ためし遊びなので、GP・スコア・ステージの解放は変わりません' : `GP のこり ${gp}`}</p>`;
  const again = async n => { drSel = n; drClose(); goTab('play', 'run'); await drBegin(); };
  const retry = async n => { drClose(); await drBegin(true, n); };
  $('drAgain').onclick = () => r.trial ? retry(r.st.n) : again(r.st.n);
  if ($('drNext')) $('drNext').onclick = () => r.trial ? retry(r.st.n + 1) : again(ev.unlocked);
  $('drBack').onclick = () => { drClose(); };
  $('drBack').focus();
}

/* ================= Drawing ================= */
function drDraw(r) {
  const c = r.ctx, W = r.W, H = r.H;
  c.save();
  if (r.shake) c.translate((Math.random() - 0.5) * 10 * r.shake / 0.25, 0);
  // sky and far stands
  const sky = c.createLinearGradient(0, 0, 0, r.hor);
  sky.addColorStop(0, '#8fd0f7'); sky.addColorStop(1, '#e6f6ff');
  c.fillStyle = sky; c.fillRect(-20, 0, W + 40, r.hor + 2);
  if (r.bg.ok) c.drawImage(r.bg, 0, 0, W, r.hor + 2);
  else { c.fillStyle = '#c9d8e6'; for (let i = 0; i < 14; i++) c.fillRect(i * W / 14, r.hor - 30 - (i % 3) * 8, W / 14 - 4, 40); }
  c.fillStyle = '#7fbf6a'; c.fillRect(-20, r.hor, W + 40, H - r.hor);
  // court: bands every 4 units, far to near
  const zc = r.z - DR_CAM, far = zc + 150;
  for (let zz = Math.floor(far / 4) * 4; zz > zc + 0.5; zz -= 4) {
    const a = drProj(-1, zz), b = drProj(1, zz), a2 = drProj(-1, Math.max(zc + 0.45, zz - 4)) || { x: W / 2 - r.lane * r.F / 0.45, y: H * 3 }, b2 = drProj(1, Math.max(zc + 0.45, zz - 4)) || { x: W / 2 + r.lane * r.F / 0.45, y: H * 3 };
    if (!a || !b) continue;
    c.fillStyle = (Math.floor(zz / 4) % 2) ? '#f2c590' : '#eebc84';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(b2.x, b2.y); c.lineTo(a2.x, a2.y); c.fill();
  }
  // side lines
  const n0 = drProj(-1, zc + 0.45), n1 = drProj(1, zc + 0.45), f0 = drProj(-1, far), f1 = drProj(1, far);
  c.strokeStyle = '#ffffffdd'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(n0.x, n0.y); c.lineTo(f0.x, f0.y); c.moveTo(n1.x, n1.y); c.lineTo(f1.x, f1.y); c.stroke();
  // goal line
  const gl = drProj(-1, r.st.end), gr = drProj(1, r.st.end);
  if (gl) { c.fillStyle = '#fff'; c.fillRect(gl.x, gl.y - gl.s * 0.1, gr.x - gl.x, gl.s * 0.2); }
  // objects: far first, the crowd at its depth, then the ones already passed
  const list = r.st.events.filter(e => e.z > r.z - 2.5 && e.z < r.z + 150);
  for (const e of list.filter(e => e.z >= r.z).sort((a, b) => b.z - a.z)) drDrawEvent(r, e);
  drDrawBoss(r);
  for (const b of r.balls) { const p = drProj(b.x, b.z); if (p) drBall(c, p.x, p.y - p.s * (1.2 + Math.sin(b.h * 12) * 0.2), p.s * 0.28); }
  drDrawCrowd(r);
  for (const e of list.filter(e => e.z < r.z).sort((a, b) => b.z - a.z)) drDrawEvent(r, e);
  for (const p of r.pops) { const q = drProj(p.x, p.z); if (!q) continue; c.globalAlpha = 1 - p.t; c.font = `900 ${Math.round(Math.min(46, q.s * 0.9))}px sans-serif`; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = '#fff'; c.strokeText(p.text, q.x, q.y - q.s * (3 + p.t * 1.5)); c.fillStyle = p.color; c.fillText(p.text, q.x, q.y - q.s * (3 + p.t * 1.5)); c.globalAlpha = 1; }
  c.restore();
  drHud(r);
}
function drBall(c, x, y, rad) {
  c.fillStyle = '#e97d40'; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
  c.strokeStyle = '#7a3a12'; c.lineWidth = Math.max(1, rad / 6); c.beginPath(); c.moveTo(x - rad, y); c.lineTo(x + rad, y); c.moveTo(x, y - rad); c.lineTo(x, y + rad); c.stroke();
}
function drSprite(c, img, x, y, h, flip) {
  if (!img.ok) return false;
  const w = h * img.naturalWidth / img.naturalHeight;
  c.save(); c.globalCompositeOperation = 'multiply';
  if (flip) { c.translate(x, 0); c.scale(-1, 1); c.drawImage(img, -w / 2, y - h, w, h); } else c.drawImage(img, x - w / 2, y - h, w, h);
  c.restore(); return true;
}
function drGatePanel(c, r, x0, x1, z, g) {
  const a = drProj(x0, z), b = drProj(x1, z);
  if (!a || !b) return;
  const h = a.s * 2.4, good = g.hidden && !g.shown ? null : drGateGood(g);
  const col = good === null ? '#8a93a6' : good ? '#3d8bf0' : '#e5484d';
  c.fillStyle = col + (g.flash > 0 ? 'ee' : '88'); c.fillRect(a.x, a.y - h, b.x - a.x, h);
  c.fillStyle = col; c.fillRect(a.x - a.s * 0.08, a.y - h, a.s * 0.16, h); c.fillRect(b.x - a.s * 0.08, a.y - h, a.s * 0.16, h); c.fillRect(a.x, a.y - h - a.s * 0.1, b.x - a.x, a.s * 0.2);
  c.font = `900 ${Math.round(a.s * 0.95)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = Math.max(2, a.s * 0.12); c.strokeStyle = '#0005'; c.strokeText(drGateText(g), (a.x + b.x) / 2, a.y - h / 2);
  c.fillStyle = '#fff'; c.fillText(drGateText(g), (a.x + b.x) / 2, a.y - h / 2); c.textBaseline = 'alphabetic';
  if (g.flash > 0) g.flash -= 0.016;
}
function drDrawEvent(r, e) {
  const c = r.ctx;
  if (e.type === 'gates') { if (!e.done || e.z > r.z - 3) { drGatePanel(c, r, -1, -0.02, e.z, e.left); drGatePanel(c, r, 0.02, 1, e.z, e.right); } }
  else if (e.type === 'pick' || e.type === 'fstar') {
    const p = e.got ? null : drProj(e.x, e.z); if (!p) return;
    const y = p.y - p.s * (0.9 + Math.sin(r.time * 5 + e.x * 9) * 0.15);
    if (e.type === 'fstar') { c.font = `${Math.round(p.s * 1.1)}px sans-serif`; c.textAlign = 'center'; c.fillText('⭐', p.x, y + p.s * 0.4); }
    else { c.fillStyle = '#3d8bf0'; c.beginPath(); c.arc(p.x, y, p.s * 0.55, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, p.s * 0.08); c.stroke(); c.font = `900 ${Math.round(p.s * 0.5)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(`＋${e.v}`, p.x, y); c.textBaseline = 'alphabetic'; }
  }
  else if (e.type === 'mgate') { const cx = Math.sin(r.time * e.w + e.ph) * e.amp; drGatePanel(c, r, cx - 0.45, cx + 0.45, e.z, e.gate); }
  else if (e.type === 'cones') for (const x of e.xs) { const p = drProj(x, e.z); if (!p) continue; c.fillStyle = '#f07a1a'; c.beginPath(); c.moveTo(p.x, p.y - p.s * 1.1); c.lineTo(p.x + p.s * 0.45, p.y); c.lineTo(p.x - p.s * 0.45, p.y); c.fill(); c.fillStyle = '#fff'; c.fillRect(p.x - p.s * 0.22, p.y - p.s * 0.55, p.s * 0.44, p.s * 0.14); }
  else if (e.type === 'roller') for (const b of e.balls) { const x = Math.sin(r.time * b.w + b.ph) * b.amp, p = drProj(x, e.z); if (p) drBall(c, p.x, p.y - p.s * 0.6, p.s * 0.6); }
  else if (e.type === 'wall') {
    const gx = e.gx + (e.move ? Math.sin(r.time * e.w + e.ph) * e.move : 0);
    for (const [x0, x1] of [[-1, gx - e.gw / 2], [gx + e.gw / 2, 1]]) { if (x1 <= x0) continue; const a = drProj(x0, e.z), b = drProj(x1, e.z); if (!a) continue; c.fillStyle = '#c0392b'; c.fillRect(a.x, a.y - a.s * 1.3, b.x - a.x, a.s * 1.3); c.fillStyle = '#ffffff55'; for (let i = 0; i < 4; i++) c.fillRect(a.x, a.y - a.s * (0.25 + i * 0.3), b.x - a.x, a.s * 0.06); }
  } else if (e.type === 'def' && e.e > 0) {
    const p = drProj(e.x, e.z); if (!p) return;
    const shown = Math.min(e.e, 18), cols = Math.max(1, Math.ceil(Math.sqrt(shown * 2)));
    for (let i = shown - 1; i >= 0; i--) {
      const row = Math.floor(i / cols), col = i % cols, q = drProj(e.x - e.w / 2 + e.w * (col + 0.5) / cols, e.z + row * 0.8);
      if (!q) continue;
      if (!drSprite(c, r.defender[i % 2], q.x, q.y, q.s * 1.6)) { c.fillStyle = '#d64545'; c.beginPath(); c.arc(q.x, q.y - q.s * 0.8, q.s * 0.35, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(q.x - q.s * 0.12, q.y - q.s * 0.85, q.s * 0.08, 0, 7); c.arc(q.x + q.s * 0.12, q.y - q.s * 0.85, q.s * 0.08, 0, 7); c.fill(); }
    }
    drBadge(c, p.x, p.y - p.s * 2.4, e.e, '#d64545', p.s);
  }
}
function drBadge(c, x, y, n, col, s) {
  const f = Math.round(Math.max(14, Math.min(40, s * 0.7)));
  c.font = `900 ${f}px sans-serif`; c.textAlign = 'center';
  const w = c.measureText(String(n)).width + f;
  c.fillStyle = col; c.beginPath(); c.roundRect(x - w / 2, y - f, w, f * 1.3, f * 0.6); c.fill();
  c.fillStyle = '#fff'; c.fillText(String(n), x, y + f * 0.05);
}
function drDrawBoss(r) {
  const p = drProj(0, r.st.end);
  if (!p) return;
  const c = r.ctx, h = p.s * 4.5;
  if (!drSprite(c, r.boss, p.x, p.y, h)) { c.fillStyle = '#6b4aa0'; c.beginPath(); c.arc(p.x, p.y - h / 2, h / 2.4, 0, 7); c.fill(); }
  const w = p.s * 5, y = p.y - h - p.s * 0.6;
  c.fillStyle = '#0006'; c.fillRect(p.x - w / 2, y, w, p.s * 0.5);
  c.fillStyle = '#e5484d'; c.fillRect(p.x - w / 2, y, w * r.bossHp / r.st.hp, p.s * 0.5);
  c.font = `900 ${Math.round(Math.max(13, p.s * 0.55))}px sans-serif`; c.textAlign = 'center'; c.fillStyle = '#fff'; c.lineWidth = 4; c.strokeStyle = '#2f3b52';
  const label = `${r.st.boss.name} HP ${r.bossHp}`;
  c.strokeText(label, p.x, y - p.s * 0.2); c.fillText(label, p.x, y - p.s * 0.2);
}
function drDrawCrowd(r) {
  const c = r.ctx, slots = drSlots(r.n).slice(1).sort((a, b) => b.dz - a.dz);
  const bounce = Math.abs(Math.sin(r.time * 9));
  // the members run just ahead of the leader: draw them first, the leader on top
  const lead = drProj(r.x, r.z);
  if (lead) lead.y -= drJumpY(r) * lead.s;
  for (const s of slots) drMember(r, s);
  if (lead) {
    if (!drSprite(c, r.runner, lead.x, lead.y, lead.s * 1.6, false)) { c.fillStyle = '#f07a36'; c.beginPath(); c.arc(lead.x, lead.y - lead.s, lead.s * 0.5, 0, 7); c.fill(); }
    drBall(c, lead.x + lead.s * 0.42, lead.y - lead.s * (0.2 + bounce * 0.4), lead.s * 0.17);
    drBadge(c, lead.x, lead.y - lead.s * 2, r.n, r.flash === 'bad' ? '#e5484d' : '#2f3b52', lead.s);
    if (r.shield > 0) { c.font = `${Math.round(lead.s * 0.6)}px sans-serif`; c.fillText('🛡️', lead.x - lead.s, lead.y - lead.s * 2); }
  }
}
function drMember(r, s) {
  const c = r.ctx, q = drProj(r.x + s.dx, r.z + s.dz);
  if (!q) return;
  const h = q.s * 0.85, y = q.y - Math.abs(Math.sin(r.time * 10 + s.dx * 40)) * q.s * 0.12 - drJumpY(r) * q.s;
  if (drSprite(c, r.member, q.x, y, h)) return;
  c.fillStyle = '#3d7be0'; c.beginPath(); c.roundRect(q.x - h * 0.22, y - h * 0.55, h * 0.44, h * 0.5, h * 0.12); c.fill();
  c.fillStyle = '#ffe1c4'; c.beginPath(); c.arc(q.x, y - h * 0.72, h * 0.22, 0, 7); c.fill();
  c.fillStyle = '#5a3a22'; c.beginPath(); c.arc(q.x, y - h * 0.78, h * 0.2, Math.PI, 0); c.fill();
}
function drHud(r) {
  const c = r.ctx, W = r.W, prog = Math.min(1, r.z / (r.st.end - DR_STOP));
  c.fillStyle = '#2f3b52dd'; c.beginPath(); c.roundRect(16, 14, W - 32, 46, 16); c.fill();
  c.fillStyle = '#fff'; c.font = '900 18px sans-serif'; c.textAlign = 'left'; c.fillText(`ステージ${r.st.n}${r.trial ? '（ためし）' : ''}`, 34, 44);
  c.fillStyle = '#ffffff33'; c.fillRect(230, 32, W - 510, 10);
  c.fillStyle = '#ffcc4d'; c.fillRect(230, 32, (W - 510) * prog, 10);
  c.textAlign = 'right'; c.font = '700 14px sans-serif';
  c.fillText(`タップ：シュート　上スワイプ：ジャンプ${r.jumpCd > 0 ? '（準備中）' : ''}`, W - 120, 43);
  
  // fever gauge
  const fw = Math.min(320, W * 0.36), fx = W / 2 - fw / 2, fy = r.H - 30, fever = r.feverT > 0;
  c.fillStyle = '#2f3b52cc'; c.beginPath(); c.roundRect(fx - 10, fy - 22, fw + 20, 42, 12); c.fill();
  c.fillStyle = '#ffffff33'; c.fillRect(fx, fy, fw, 10);
  c.fillStyle = fever ? `hsl(${r.time * 500 % 360} 95% 60%)` : '#ff7ab0'; c.fillRect(fx, fy, fw * (fever ? r.feverT / 4 : r.fg / 100), 10);
  c.fillStyle = '#fff'; c.font = '700 13px sans-serif'; c.textAlign = 'center';
  c.fillText(fever ? '★ フィーバー中！ 障害物をふきとばせ ★' : 'フィーバーゲージ（いいゲート・⭐・ジャンプでたまる）', W / 2, fy - 6);
  if (fever) { c.strokeStyle = `hsl(${r.time * 500 % 360} 95% 60%)`; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, r.H - 10); }
  c.textAlign = 'left'; c.font = '700 12px sans-serif'; c.fillStyle = '#ffffffcc'; 
  // power gauge before the boss
  if (r.phase === 'boss' && r.bossT >= 0.8 && !r.mult) {
    const pw = Math.min(520, W * 0.6), px = W / 2 - pw / 2, py = r.H * 0.6, zone = (a, b, col) => { c.fillStyle = col; c.fillRect(px + pw * a, py, pw * (b - a), 34); };
    c.fillStyle = '#2f3b52ee'; c.beginPath(); c.roundRect(px - 16, py - 50, pw + 32, 110, 18); c.fill();
    zone(0, 1, '#8a93a6'); zone(0.15, 0.85, '#ffd24d'); zone(0.3, 0.7, '#7dd48b'); zone(0.425, 0.575, '#f07a36');
    const mx = px + pw * drGaugePos(r); c.fillStyle = '#fff'; c.fillRect(mx - 4, py - 8, 8, 50); c.strokeStyle = '#2f3b52'; c.lineWidth = 2; c.strokeRect(mx - 4, py - 8, 8, 50);
    c.fillStyle = '#fff'; c.font = '900 20px sans-serif'; c.textAlign = 'center'; c.fillText('タップで パワーをきめろ！', W / 2, py - 20);
    c.font = '700 13px sans-serif'; c.fillText('まん中のオレンジ＝仲間×2 ／ みどり×1.5 ／ きいろ×1.1 ／ はしっこ×0.8', W / 2, py + 54);
  }
  gfxDraw(c);
  c.textAlign = 'center';
  if (r.phase === 'count') { c.font = '900 120px sans-serif'; c.lineWidth = 10; c.strokeStyle = '#fff'; const t = String(Math.ceil(r.count)); c.strokeText(t, W / 2, r.H * 0.5); c.fillStyle = '#f07a36'; c.fillText(t, W / 2, r.H * 0.5); }
  if (r.phase === 'win' || r.phase === 'over') { c.font = '900 72px sans-serif'; c.lineWidth = 10; c.strokeStyle = '#fff'; const t = r.phase === 'win' ? 'クリア！' : 'ざんねん…'; c.strokeText(t, W / 2, r.H * 0.45); c.fillStyle = r.phase === 'win' ? '#f07a36' : '#5b6578'; c.fillText(t, W / 2, r.H * 0.45); }
}
