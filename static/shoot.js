// Minibas v3 — "シュートラッシュ": a lane shooter mini game drawn on a canvas.
// The buddy stands at the bottom and shoots forward all the time. Shots that pass gates multiply,
// locked gates open when shot enough, buddy statues join as shooters when shot down,
// and enemy crowds and a boss march down the lane. If they reach the buddy, life goes down.
// One play costs GP (the server takes it at the start). Stages come from a fixed seed, so each
// stage is the same every time. Enemy numbers are tuned by running a built-in autopilot.
// Images are optional: when a run_*.png is missing, an existing image or a canvas drawing is used.
'use strict';

/* ================= Rules ================= */
const RUN_LIFE = 10, RUN_RATE = 6, RUN_SHOT_SPEED = 26, RUN_RANGE = 40, RUN_VIEW = 72;
const RUN_BOSSES = {
  3: { name: 'ジャイアントもくもく', img: 'run_boss1.png', fb: 'clouds.png' },
  6: { name: 'キングウルフ', img: 'run_boss2.png', fb: 'wolves.png' },
  10: { name: 'メガティラノ', img: 'run_boss3.png', fb: 'dinos.png' },
};
const RUN_KEEPER = { name: 'ゴールキーパー', img: 'run_keeper.png', fb: 'cats.png' };
// Weapons: shoot a weapon box until its number is 0. Every box adds one level, and all three kinds stack.
const RUN_WEAPONS = {
  rapid: { name: '連射ボール', icon: '⚡', text: 'レベルごとに連射＋40%' },
  spread: { name: 'ワイドボール', icon: '🔱', text: 'Lv1で3方向、Lv2で5方向' },
  power: { name: 'パワーボール', icon: '💥', text: 'レベルごとに強さ＋1' },
};
const RUN_ARM_MAX = { rapid: 3, spread: 2, power: 3 };
const runFx = r => !r.auto && r === RUN;   // effects and sound only for the game on screen, never for the autopilot runs
const RUN_TRAITS = {
  rabbit: { text: '左右の動きがはやい', lat: 3.2, rate: 1, life: 0 },
  cat: { text: 'シュートの連射がはやい', lat: 2.3, rate: 1.3, life: 0 },
  fluff: { text: 'ライフが3多い', lat: 2.3, rate: 1, life: 3 },
};
const RUN_FEATURES = [
  [1, '×と＋のゲート・武器の箱'], [2, '仲間の石像'], [3, 'カギつきゲート・ボス'], [4, '－のゲート・ダッシュする敵💨'],
  [5, '左右に分かれる敵'], [6, 'かたい敵🛡・ボスの2連投げ'], [7, '÷のゲート'], [8, '敵の大群'],
];
// The difficulty: enemy strength per stage. Measured with the built-in autopilot moving at random
// 35% of the time (a "sometimes lost" player), so that it wins about 95% of stage 1 down to 12% of stage 10
// (targets 95/85/75/65/55/45/36/28/20/12%). Raise a number to make that stage harder.
const RUN_SCALE = [0, 4.817, 1.915, 2.555, 2.826, 1.225, 1.943, 2.181, 0.88, 1.061, 1.55];   // measured with weapons, the special move and boss attacks

function runRng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const gateText = g => (g.op === '+' ? '＋' : g.op === '-' ? '－' : g.op === 'x' ? '×' : '÷') + g.v;
const gateGood = g => g.op === '+' || g.op === 'x';
function gateOn(g, w) { return Math.min(99999, g.op === '+' ? w + g.v : g.op === '-' ? w - g.v : g.op === 'x' ? w * g.v : Math.floor(w / g.v)); }

/* ================= Stage design ================= */
// Base layout with unscaled enemy strength. Every number that scales with difficulty is marked base.
function runLayout(n) {
  const R = runRng(n * 7919 + 13), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
  const gates = [], statues = [], foes = [], crates = [], allies = kindsLeft(), arms = ['rapid', 'spread', 'power'];
  const sections = 5 + n, speed = 2.6 + n * 0.12;
  let z = 14;
  for (let i = 0; i < sections; i++) {
    // gate row
    const L = { x0: -1, x1: -0.03 }, Rr = { x0: 0.03, x1: 1 }, side = R() < 0.5;
    const half = (s, g) => gates.push({ z, ...s, ...g });
    const good = () => pick(n >= 6 ? [{ op: 'x', v: 2 }, { op: 'x', v: 3 }, { op: '+', v: ri(2, 4) }] : [{ op: 'x', v: 2 }, { op: '+', v: ri(2, 3) }]);
    const bad = () => pick([...(n >= 4 ? [{ op: '-', v: ri(1, 2) }] : []), ...(n >= 7 ? [{ op: '/', v: 2 }] : []), { op: '+', v: 1 }]);
    const roll = R();
    if (n >= 2 && allies.length && (i === 1 || i === 4)) {   // a statue on one side, a gate on the other
      const k = allies.shift(), s = side ? L : Rr, o = side ? Rr : L;
      statues.push({ z: z + 2, ...s, base: 14 + i * 6, ally: k });
      half(o, good());
    } else if (n >= 3 && roll < 0.3) {                      // one wide locked gate
      gates.push({ z, x0: -1, x1: 1, op: 'x', v: n >= 6 ? 3 : 2, lockBase: 18 + i * 8 });
    } else {
      const a = good();
      let b = R() < 0.55 ? bad() : good();
      if (b.op === a.op && b.v === a.v) b = { op: '+', v: 1 };
      half(side ? L : Rr, a); half(side ? Rr : L, b);
    }
    // a weapon box every other section
    if (i % 2 === 0 && i > 0) crates.push({ z: z + 8, ...(R() < 0.5 ? { x0: -1, x1: -0.03 } : { x0: 0.03, x1: 1 }), base: 10 + i * 5, weapon: arms[Math.floor(R() * 3)] });
    // enemy wave behind the gates
    const count = (8 + i * 5) * (1 + n * 0.12);
    if (n >= 5 && R() < 0.35) {   // split wave: left and right groups
      foes.push({ z: z + 30, x0: -1, x1: -0.05, base: count * 0.55, speed: speed * 0.55, kind: 'horde' });
      foes.push({ z: z + 34, x0: 0.05, x1: 1, base: count * 0.55, speed: speed * 0.55, kind: 'horde' });
    } else if (n >= 6 && i % 3 === 1) foes.push({ z: z + 30, x0: -1, x1: 1, base: count * 0.6, speed: speed * 0.55, kind: 'horde', armor: 2 });   // armored: every ball loses 2
    else foes.push({ z: z + 30, x0: -1, x1: 1, base: count * (n >= 8 && i % 3 === 2 ? 1.8 : 1), speed: speed * (n >= 6 && i % 2 ? 0.8 : 0.55), kind: 'horde' });
    if (n >= 4 && i >= 1 && R() < 0.45) { const cx = -0.7 + R() * 1.4; foes.push({ z: z + 40, x0: cx - 0.22, x1: cx + 0.22, base: count * 0.15, speed: speed * 1.5, kind: 'runner' }); }
    z += 15;
  }
  const boss = RUN_BOSSES[n] || RUN_KEEPER;
  foes.push({ z: z + 34, x0: -0.4, x1: 0.4, base: 60 * (1 + n * 0.35) * (RUN_BOSSES[n] ? 1.4 : 1), speed: speed * 0.32, kind: 'boss' });
  foes.forEach((f, i) => { if (f.kind !== 'boss') f.drop = i % 4 === 2 ? 'heart' : i % 2 === 0 ? 'star' : null; });
  return { n, speed, gates, statues, foes, crates, stop: z + 2, boss };
  function kindsLeft() { const a = S?.data?.active || 'rabbit'; return ['rabbit', 'cat', 'fluff'].filter(k => k !== a); }
}
function runScaled(lay, s) {
  const q = x => Math.max(1, Math.round(x * s));
  return {
    ...lay,
    gates: lay.gates.map(g => ({ ...g, lock: g.lockBase ? q(g.lockBase) : 0, lockMax: g.lockBase ? q(g.lockBase) : 0 })),
    statues: lay.statues.map(t => ({ ...t, hp: q(t.base), max: q(t.base) })),
    crates: lay.crates.map(t => ({ ...t, hp: q(t.base), max: q(t.base) })),
    foes: lay.foes.map(f => ({ ...f, count: q(f.base), max: q(f.base) })),
  };
}
const RUN_STAGE_CACHE = {};
function runStage(n) {
  const key = n + ':' + (S?.data?.active || '');
  if (RUN_STAGE_CACHE[key]) return RUN_STAGE_CACHE[key];
  const st = runScaled(runLayout(n), RUN_SCALE[n]);
  st.hp = st.foes.at(-1).count;
  return RUN_STAGE_CACHE[key] = st;
}
// For tuning from the browser console: plays a stage with the autopilot (no drawing).
function runSimulate(st) {
  const r = runNew(st, 'rabbit', { lat: 2.3, rate: 1, life: 0 });
  r.phase = 'run'; r.auto = true;
  for (let i = 0; i < 20 * 400 && r.phase === 'run'; i++) runStep(r, 0.05);
  return { win: r.phase === 'win', life: r.life };
}

/* ================= Menu (in the あそぶ screen) ================= */
let runSel = null;
function runMenu() {
  const r = S.data.shoot, C = S.catalog, gp = S.coach.gp.available, k = S.data.active, t = RUN_TRAITS[k];
  if (!runSel || runSel > r.unlocked) runSel = r.unlocked;
  const card = n => {
    const best = r.best[n], lock = n > r.unlocked, boss = RUN_BOSSES[n];
    return `<button class="rstage ${n === runSel ? 'on' : ''} ${lock ? 'lock' : ''}" data-rstage="${n}" ${lock ? 'disabled' : ''}>
      <b>${lock ? '🔒' : 'ステージ' + n}</b>${boss ? `<span class="tag">ボス</span>` : ''}
      <span class="stars">${lock ? '' : [1, 2, 3].map(i => best && best.stars >= i ? '★' : '☆').join('')}</span>
      <small>${best ? 'ベスト ' + best.score : lock ? `ステージ${n - 1}をクリア` : 'まだクリアしていない'}</small></button>`;
  };
  const sg = runStage(runSel), news = RUN_FEATURES.filter(([s]) => s === runSel).map(([, x]) => x);
  $('content').innerHTML = playTabs() + `
  <div class="grid two">
    <section class="card runhero">
      <h2>🏀 シュートラッシュ <small>1回 ${C.run_cost}GP</small></h2>
      <p>シュートは自動でどんどん飛ぶよ。ゲートを通ったボールは数がふえる！ おしよせる敵とゴール前の${esc(sg.boss.name)}をたおそう。敵が足もとまで来るとライフがへる。</p>
      <ul class="small runhow"><li>指を左右にすべらせて、ねらう列を決める</li><li>×・＋のゲートは味方、－・÷のゲートは要注意</li><li>🔒のゲートは数字ぶん当てるとカギがあく</li><li>相棒の石像に数字ぶん当てると、仲間になって一緒にシュート</li><li>📦 武器の箱をこわすと武器がレベルアップ（⚡連射・🔱ワイド・💥パワー、ぜんぶ重なる）</li><li>敵をたおすとゲージがたまり、タップで必殺「ダンクウェーブ」</li><li>たおした敵が落とす💖⭐は、同じ列に立ってキャッチ</li><li>ボスが投げるボール（！マーク）は横によける</li><li>左下の ⏸ で一時停止</li></ul>
      <div class="runner"><img src="${image(k)}" alt=""><div><b>${esc(name(k))}</b> がシュートするよ<br><small class="muted">とくい：${t.text}（相棒は「相棒」画面で切りかえ）</small></div></div>
      <p class="gpline">🪙 GP <b>${gp}</b> <span class="muted">／ あと${Math.floor(gp / C.run_cost)}回あそべる</span></p>
      <button class="primary go" id="runGo" ${gp < C.run_cost ? 'disabled' : ''}>ステージ${runSel}をスタート（${C.run_cost}GP）</button>
      ${gp < C.run_cost ? '<p class="muted">GPは、パパの家事・対戦の勝利・おねがい達成でたまるよ</p>' : ''}
      <p class="muted">ステージ${runSel}：${esc(sg.boss.name)}（HP ${sg.hp}）${news.length ? ` ／ 新しいしかけ：${news.join('・')}` : ''}<br>ライフ${RUN_LIFE + t.life}。★2はライフ${runStarLife(2, t)}以上、★3はライフをへらさずにクリア</p>
    </section>
    <section class="card"><h2>ステージ <small>クリアすると次のステージ</small></h2><div class="rstages">${Array.from({ length: C.run_stages }, (_, i) => card(i + 1)).join('')}</div>
      <p class="muted">あそんだ回数 ${r.plays}回。ステージは毎回同じなので、おぼえるほど上手になるよ。</p></section>
  </div>`;
  document.querySelectorAll('[data-rstage]').forEach(b => b.onclick = () => { runSel = Number(b.dataset.rstage); runMenu(); });
  $('runGo').onclick = () => runBegin();
}
const runStarLife = (star, t) => star === 3 ? RUN_LIFE + t.life : Math.ceil((RUN_LIFE + t.life) / 2);
// trial = a free try started from Mama's coach screen: any stage, no GP, nothing recorded.
async function runBegin(trial = false, stage = runSel) {
  if (busy || RUN) return;
  busy = true;
  try {
    const next = await req('/api/action', { action: 'run_start', game: 'shoot', stage, trial });
    S = next; hud();
    runOpen(next.event.id, next.event.stage, trial);
  } catch (e) { tell(e.message); } finally { busy = false; }
}

/* ================= Images ================= */
const RUN_IMG = {};
function runImg(name, fb) {
  if (RUN_IMG[name]) return RUN_IMG[name];
  const img = new Image();
  img.onload = () => { img.ok = true; };
  img.onerror = () => { if (fb && !img.tried) { img.tried = true; img.src = 'assets/' + fb; } };
  img.src = 'assets/' + name;
  return RUN_IMG[name] = img;
}

/* ================= Game state and rules (no drawing here: the autopilot uses the same code) ================= */
let RUN = null;
function runNew(st, k, t) {
  const copy = JSON.parse(JSON.stringify({ gates: st.gates, statues: st.statues, foes: st.foes, crates: st.crates }));
  const total = st.foes.reduce((a, f) => a + f.count, 0);
  return { st, k, t, ...copy, arms: { rapid: 0, spread: 0, power: 0 }, sp: 0, spNeed: Math.max(20, Math.round(total * 0.16)), combo: 0, comboT: 0, maxCombo: 0, bonus: 0, drops: [], hazards: [], bossT: 2, x: 0, tx: 0, z: 0, time: 0, life: RUN_LIFE + t.life, allies: [], shots: [], kills: 0, fire: 0, pops: [], keys: {}, phase: 'count', count: 3, retarget: 0 };
}
const runShooters = r => [r.x, ...r.allies.map((_, i) => Math.max(-0.95, Math.min(0.95, r.x + (i ? 0.32 : -0.32))))];
function runStep(r, dt) {
  r.time += dt;
  for (const p of r.pops) p.t += dt;
  if (r.pops.length) r.pops = r.pops.filter(p => p.t < 1);
  if (r.phase === 'count') { r.count -= dt; if (r.count <= 0) r.phase = 'run'; return; }
  if (r.phase !== 'run') { runMoveShots(r, dt); return; }
  // steering
  if (r.auto) runAutopilot(r, dt);
  else {
    const dir = (r.keys.ArrowRight || r.keys.d || r.keys.D ? 1 : 0) - (r.keys.ArrowLeft || r.keys.a || r.keys.A ? 1 : 0);
    if (dir) r.tx = r.x + dir * 0.5;
  }
  r.tx = Math.max(-0.85, Math.min(0.85, r.tx));
  const d = r.tx - r.x, step = r.t.lat * dt;
  r.x += Math.abs(d) < step ? d : Math.sign(d) * step;
  // the field moves on until the last stretch
  r.z = Math.min(r.st.stop, r.z + r.st.speed * dt);
  // fire
  r.fire -= dt;
  const A = r.arms, w0 = 1 + A.power, rate = RUN_RATE * r.t.rate * (1 + 0.4 * A.rapid);
  const fan = A.spread >= 2 ? [-0.7, -0.35, 0, 0.35, 0.7] : A.spread === 1 ? [-0.45, 0, 0.45] : [0];
  while (r.fire <= 0) {
    r.fire += 1 / rate;
    for (const x of runShooters(r)) for (const vx of fan) r.shots.push({ x, vx, z: r.z + 0.8, w: w0 });
  }
  if (r.comboT > 0) { r.comboT -= dt; if (r.comboT <= 0) r.combo = 0; }
  // enemies march once they are in view
  for (const f of r.foes) {
    if (f.count <= 0) continue;
    if (f.z - r.z < RUN_VIEW) f.z -= f.speed * dt;
    if (f.z <= r.z + 0.6) {
      const hit = f.kind === 'boss' ? r.life : Math.min(r.life, f.count);
      r.life -= hit; f.count = 0; r.shake = 0.4; r.combo = 0;
      runPop(r, `ライフ－${hit}`, '#d64545', (f.x0 + f.x1) / 2, r.z + 2);
      if (runFx(r)) gfxSound('hurt');
    }
  }
  // the boss throws big balls at where the buddy stands: step aside
  const boss = r.foes.at(-1);
  if (boss.count > 0 && boss.z - r.z < 46) {
    r.bossT -= dt;
    if (r.bossT <= 0) {
      r.bossT = Math.max(1.6, 3.4 - r.st.n * 0.15);
      r.hazards.push({ x: r.x, z: boss.z - 1 });
      if (r.st.n >= 6) r.hazards.push({ x: r.x + (r.x > 0 ? -0.55 : 0.55), z: boss.z - 1 });
      if (runFx(r)) gfxSound('warn');
    }
  }
  for (const h of r.hazards) {
    h.z -= 16 * dt;
    if (h.z <= r.z + 0.4) { h.dead = true; if (Math.abs(h.x - r.x) < 0.27) { r.life -= 2; r.shake = 0.4; r.combo = 0; runPop(r, 'ライフ－2', '#d64545', r.x, r.z + 2); if (runFx(r)) gfxSound('hurt'); } }
  }
  if (r.hazards.length) r.hazards = r.hazards.filter(h => !h.dead);
  // hearts and stars left by beaten crowds roll down the lane: stand in their column to catch them
  for (const d of r.drops) {
    d.z -= 9 * dt;
    if (d.z > r.z + 0.3) continue;
    d.dead = true;
    if (Math.abs(d.x - r.x) > 0.32) continue;
    const full = RUN_LIFE + r.t.life;
    if (d.kind === 'heart' && r.life < full) { r.life++; runPop(r, 'ライフ＋1', '#e0508a', r.x, r.z + 2); }
    else { r.bonus += 200; r.sp = Math.min(r.spNeed, r.sp + r.spNeed * 0.1); runPop(r, '＋200', '#e0a000', r.x, r.z + 2); }
    if (runFx(r)) gfxSound('pickup');
  }
  if (r.drops.length) r.drops = r.drops.filter(d => !d.dead);
  runMoveShots(r, dt);
  if (r.life <= 0) { r.life = 0; r.phase = 'over'; return; }
  if (r.foes.every(f => f.count <= 0)) r.phase = 'win';
}
function runMoveShots(r, dt) {
  for (const s of r.shots) {
    const z0 = s.z; s.z += RUN_SHOT_SPEED * dt; s.x += (s.vx || 0) * dt;
    if (Math.abs(s.x) > 1) { s.w = 0; continue; }
    // everything this shot reaches this step, nearest first
    const hits = [];
    for (const g of r.gates) if (g.z > z0 && g.z <= s.z && s.x >= g.x0 && s.x <= g.x1) hits.push([g.z, 'g', g]);
    for (const t of r.statues) if (t.hp > 0 && t.z > z0 && t.z <= s.z && s.x >= t.x0 && s.x <= t.x1) hits.push([t.z, 's', t]);
    for (const t of r.crates) if (t.hp > 0 && t.z > z0 && t.z <= s.z && s.x >= t.x0 && s.x <= t.x1) hits.push([t.z, 'c', t]);
    for (const f of r.foes) if (f.count > 0 && f.z <= s.z && f.z > z0 - 1.5 && s.x >= f.x0 && s.x <= f.x1) hits.push([f.z, 'f', f]);
    hits.sort((a, b) => a[0] - b[0]);
    for (const [, kind, o] of hits) {
      if (s.w <= 0) break;
      if (kind === 'g') {
        if (o.lock > 0) { const a = Math.min(o.lock, s.w); o.lock -= a; s.w -= a; o.flash = 0.2; if (o.lock <= 0) runPop(r, 'カギがあいた！', '#2e7be0', (o.x0 + o.x1) / 2, o.z); continue; }
        s.w = gateOn(o, s.w); s.boost = (s.boost || 0) + 1;
      } else if (kind === 'c') {
        const a = Math.min(o.hp, s.w); o.hp -= a; s.w = 0; o.flash = 0.15;
        if (o.hp <= 0) {
          const lv = r.arms[o.weapon], up = lv < RUN_ARM_MAX[o.weapon], w = RUN_WEAPONS[o.weapon];
          if (up) r.arms[o.weapon] = lv + 1; else { r.bonus += 300; r.sp = r.spNeed; }
          runPop(r, up ? `${w.icon}${w.name} Lv${lv + 1}！` : `${w.icon}最大レベル！ ひっさつ満タン`, '#b5651d', (o.x0 + o.x1) / 2, o.z);
          if (runFx(r)) gfxSound('power');
        }
      } else if (kind === 's') {
        const a = Math.min(o.hp, s.w); o.hp -= a; s.w = 0; o.flash = 0.15;
        if (o.hp <= 0) { r.allies.push(o.ally); runPop(r, `${runName(o.ally)}が仲間になった！`, '#2e8a52', (o.x0 + o.x1) / 2, o.z); if (runFx(r)) gfxSound('power'); }
      } else {
        const eff = o.armor ? Math.max(0, s.w - o.armor) : s.w;
        if (eff <= 0) { s.w = 0; if (runFx(r)) gfxSound('tink'); continue; }
        const a = Math.min(o.count, eff); o.count -= a; s.w = eff - a; o.flash = 0.1;
        r.sp = Math.min(r.spNeed, r.sp + a); runKilled(r, o, a, s.x);
      }
    }
  }
  r.shots = r.shots.filter(s => s.w > 0 && s.z < r.z + RUN_RANGE);
}
function runKilled(r, f, a, x) {
  r.kills += a; r.combo += a; r.comboT = 1.6; r.maxCombo = Math.max(r.maxCombo, r.combo);
  const cx = Math.max(-0.8, Math.min(0.8, x ?? (f.x0 + f.x1) / 2));
  if (f.count <= 0 && f.drop) r.drops.push({ x: cx, z: f.z, kind: f.drop });
  if (!runFx(r)) return;
  const p = runProj(cx, f.z);
  if (p) gfxBurst(p.x, p.y - p.s * 0.4, f.kind === 'boss' ? '#ffd24d' : f.armor ? '#9aa6b8' : '#c58be0', f.count <= 0 ? 16 : 2, p.s);
  gfxSound(f.count <= 0 ? 'down' : 'hit', 1 + Math.min(1, r.combo / 400));
}
// The special move "ダンクウェーブ": when the gauge is full, Space or a click hits every enemy in view
// (half of a crowd, 12% of the boss) and clears the boss's balls. The gauge fills with every enemy beaten.
function runSpecial(r) {
  if (r.phase !== 'run' || r.sp < r.spNeed) return;
  r.sp = 0; r.hazards = []; r.wave = 0.6;
  for (const f of r.foes) {
    if (f.count <= 0 || f.z - r.z > RUN_VIEW) continue;
    const a = Math.min(f.count, Math.ceil(f.max * (f.kind === 'boss' ? 0.12 : 0.5)));
    f.count -= a; f.flash = 0.3; runKilled(r, f, a);
  }
  runPop(r, 'ダンクウェーブ！', '#f07a36', 0, r.z + 6);
  if (runFx(r)) { gfxSound('special'); r.shake = 0.3; }
}
const runName = k => (typeof name === 'function' && S ? name(k) : k);
function runPop(r, text, color, x, z) { if (!r.auto) r.pops.push({ text, color, x, z, t: 0 }); }
// The autopilot used for tuning: every 0.3 s it moves to the column whose shot comes out strongest
// through the gates ahead (a statue or lock counts while no enemy is close).
function runAutopilot(r, dt) {
  r.retarget -= dt;
  if (r.retarget > 0) return;
  r.retarget = 0.3;
  const live = r.foes.filter(f => f.count > 0), near = Math.min(...live.map(f => f.z - r.z), 99);
  // an enemy getting close comes first: only columns that hit it are considered
  const threat = live.filter(f => f.z - r.z < 20).sort((a, b) => a.z - b.z)[0];
  const danger = r.hazards.filter(h => h.z - r.z < 9), safe = x => !danger.some(h => Math.abs(h.x - x) < 0.34);
  if (r.sp >= r.spNeed && (near < 14 || live.filter(f => f.z - r.z < RUN_VIEW).length >= 3 || (live.length === 1 && near < 30))) runSpecial(r);
  let cols = [-0.7, -0.35, 0, 0.35, 0.7].filter(x => !threat || (x >= threat.x0 && x <= threat.x1));
  if (cols.some(safe)) cols = cols.filter(safe); else if (danger.length) cols = [-0.7, -0.35, 0, 0.35, 0.7].filter(safe);
  let best = -1, bx = r.x;
  for (const x of cols.length ? cols : [(threat.x0 + threat.x1) / 2]) {
    let w = 1, bonus = 0;
    const ahead = [...r.gates.filter(g => g.z > r.z + 1 && g.z < r.z + RUN_RANGE && x >= g.x0 && x <= g.x1).map(g => [g.z, g]), ...r.statues.filter(t => t.hp > 0 && t.z > r.z + 1 && x >= t.x0 && x <= t.x1).map(t => [t.z, t]), ...r.crates.filter(t => t.hp > 0 && t.z > r.z + 1 && x >= t.x0 && x <= t.x1).map(t => [t.z, t])].sort((a, b) => a[0] - b[0]);
    for (const [, o] of ahead) {
      if (o.ally) { if (near > 22) bonus += 500; break; }
      if (o.weapon) { if (near > 22) bonus += 400; break; }
      if (o.lock > 0) { if (near > 22) bonus += 300; break; }
      w = Math.max(0, gateOn(o, w));
    }
    const v = w + bonus - Math.abs(x - r.x) * 0.01;
    if (v > best) { best = v; bx = x; }
  }
  const drop = !threat && r.drops.find(d => d.z - r.z < 10 && safe(d.x));
  r.tx = drop ? drop.x : bx;
}

/* ================= Game screen ================= */
function runOpen(id, n, trial = false) {
  const k = S.data.active, t = RUN_TRAITS[k], st = runStage(n);
  const layer = document.createElement('div');
  layer.className = 'runlayer';
  layer.innerHTML = '<canvas id="runCanvas"></canvas><div class="runpanel hidden" id="runPanel"></div>';
  document.body.append(layer);
  document.querySelector('main').inert = true;
  const cv = layer.querySelector('canvas');
  RUN = Object.assign(runNew(st, k, t), {
    id, trial, layer, cv, ctx: cv.getContext('2d'), paused: false, last: performance.now(),
    img: {
      runner: runImg(`run_runner_${k}.png`, `${k}${S.stats[k].look}.png`),
      enemy: [runImg('run_enemy1.png'), runImg('run_enemy2.png')],
      boss: runImg(st.boss.img, st.boss.fb), bg: runImg('run_bg.png'),
      ally: Object.fromEntries(['rabbit', 'cat', 'fluff'].map(a => [a, runImg(`run_runner_${a}.png`, `${a}${S.stats[a].look}.png`)])),
      statue: Object.fromEntries(['rabbit', 'cat', 'fluff'].map(a => [a, runImg(`${a}${S.stats[a].look}.png`)])),
    },
  });
  runResize();
  window.addEventListener('resize', runResize);
  window.addEventListener('keydown', runKey);
  window.addEventListener('keyup', runKey);
  cv.addEventListener('mousemove', runMouse);
  cv.addEventListener('mousedown', e => { e.preventDefault(); if (RUN && !RUN.paused) runSpecial(RUN); });
  gfxClear();
  cv.addEventListener('contextmenu', e => e.preventDefault());
  requestAnimationFrame(runFrame);
}
function runClose() {
  if (!RUN) return;
  window.removeEventListener('resize', runResize);
  window.removeEventListener('keydown', runKey);
  window.removeEventListener('keyup', runKey);
  RUN.layer.remove();
  RUN = null;
  document.querySelector('main').inert = false;
  render();
}
// World: x in lane units (-1..1), z forward. The camera sits RUN_CAM behind the buddy and RUN_CAMH high.
const RUN_CAM = 16, RUN_CAMH = 12;
function runResize() {
  const r = RUN, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!r) return;
  r.W = window.innerWidth; r.H = window.innerHeight;
  r.cv.width = r.W * dpr; r.cv.height = r.H * dpr;
  r.cv.style.width = r.W + 'px'; r.cv.style.height = r.H + 'px';
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.hor = r.H * 0.03; r.F = (r.H * 0.9 - r.hor) * RUN_CAM / RUN_CAMH;
  r.lane = (Math.min(r.W * 0.3, r.H * 0.55)) / (r.F / RUN_CAM);
}
function runProj(x, z) {
  const r = RUN, dz = z - (r.z - RUN_CAM);
  if (dz <= 0.4) return null;
  const s = r.F / dz;
  return { x: r.W / 2 + x * r.lane * s, y: r.hor + RUN_CAMH * s, s };
}
function runKey(e) {
  const r = RUN;
  if (!r) return;
  const k = e.key;
  if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D', ' '].includes(k)) e.preventDefault();
  if (e.type === 'keyup') { r.keys[k] = false; return; }
  if (k === 'Escape') { if (r.phase === 'run' || r.phase === 'count') runPause(!r.paused); return; }
  if (k === ' ' && !e.repeat && !r.paused) runSpecial(r);
  if ((k === 'm' || k === 'M') && !e.repeat) gfxMute(!GFX.mute);
  r.keys[k] = true;
}
function runMouse(e) {
  const r = RUN;
  if (!r || r.paused) return;
  const p = runProj(0, r.z), half = runProj(1, r.z).x - p.x;
  r.tx = Math.max(-1, Math.min(1, (e.clientX - p.x) / half));
}
function runPause(on) {
  const r = RUN; r.paused = on;
  const p = $('runPanel');
  if (!on) { p.classList.add('hidden'); r.last = performance.now(); requestAnimationFrame(runFrame); return; }
  p.classList.remove('hidden');
  p.innerHTML = `<h2>一時停止</h2><p class="muted">${r.trial ? 'ためし遊び中です。' : 'やめると、このプレイのGPはもどりません。'}</p><div class="row" style="justify-content:center"><button class="primary" id="runResume">つづける</button><button id="runQuit">やめる</button></div>`;
  $('runResume').onclick = () => runPause(false);
  $('runQuit').onclick = () => { r.paused = false; r.quit = true; runEnd(false); };
  $('runResume').focus();
}
function runFrame(now) {
  const r = RUN;
  if (!r || r.paused) return;
  const dt = Math.min(0.05, (now - r.last) / 1000); r.last = now;
  const before = r.phase;
  runStep(r, dt);
  r.shake = Math.max(0, (r.shake || 0) - dt);
  if (before === 'run' && r.phase !== 'run') gfxSound(r.phase === 'win' ? 'win' : 'lose');
  if (before === 'run' && r.phase === 'win') { if (!reduceMotion.matches) confetti(); setTimeout(() => runEnd(true), 1400); }
  if (before === 'run' && r.phase === 'over') setTimeout(() => runEnd(false), 1400);
  runDraw(r);
  if (r.phase !== 'done') requestAnimationFrame(runFrame);
}
async function runEnd(cleared) {
  const r = RUN;
  if (!r || r.phase === 'done') return;
  const bossLeft = r.foes.at(-1).count, full = RUN_LIFE + r.t.life;
  r.phase = 'done';
  const life = cleared ? r.life : 0, stars = cleared ? (life >= runStarLife(3, r.t) ? 3 : life >= runStarLife(2, r.t) ? 2 : 1) : 0;
  const score = cleared ? Math.min(90000, r.kills + life * 100 + r.allies.length * 300 + stars * 500 + r.bonus + Math.min(3000, r.maxCombo * 2)) : 0;
  let ev = null;
  try { const next = await req('/api/action', { action: 'run_finish', id: r.id, cleared, score, stars }); S = next; ev = next.event; }
  catch (e) { tell(e.message); }
  runDraw(r);
  const gp = S.coach.gp.available, cost = S.catalog.run_cost, p = $('runPanel');
  p.classList.remove('hidden');
  p.innerHTML = `<h2>${cleared ? 'クリア！' : 'ざんねん…'}</h2>
    ${cleared ? `<p class="runstars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</p>
      <p>ライフ <b>${life}/${full}</b> ／ たおした敵 ${r.kills} ／ 仲間 ${r.allies.length}人 ／ 最大コンボ ${r.maxCombo}</p><p class="runscore">${score}点${ev?.record ? ' <span class="tag">ベスト更新！</span>' : ''}</p>
      ${ev?.unlocked ? `<p class="tag gp">ステージ${ev.unlocked}が遊べるようになった！</p>` : ''}
      ${stars < 3 ? `<p class="muted">★${stars + 1}は ライフ${runStarLife(stars + 1, r.t)}以上でクリア</p>` : ''}`
      : `<p>${r.quit ? 'とちゅうでやめました' : bossLeft > 0 && bossLeft < r.st.hp ? `${esc(r.st.boss.name)}のHPがあと${bossLeft}だった！` : '敵におしきられた…'}</p><p class="muted">武器の箱と石像を先にこわして、ひっさつ技はピンチまでとっておくのがコツ</p>`}
    <div class="row" style="justify-content:center">
      ${r.trial ? `<button class="primary" id="runAgain">もう1回ためす</button>${r.st.n < S.catalog.run_stages ? `<button id="runNext">ステージ${r.st.n + 1}をためす</button>` : ''}` : `
      <button class="primary" id="runAgain" ${gp < cost ? 'disabled' : ''}>もう1回（${cost}GP）</button>
      ${ev?.unlocked ? `<button class="primary" id="runNext">ステージ${ev.unlocked}へ（${cost}GP）</button>` : ''}`}
      <button id="runBack">もどる</button></div><p class="muted">${r.trial ? 'ためし遊びなので、GP・スコア・ステージの解放は変わりません' : `GP のこり ${gp}`}</p>`;
  const again = async n => { runSel = n; runClose(); goTab('play', 'shoot'); await runBegin(); };
  const retry = async n => { runClose(); await runBegin(true, n); };
  $('runAgain').onclick = () => r.trial ? retry(r.st.n) : again(r.st.n);
  if ($('runNext')) $('runNext').onclick = () => r.trial ? retry(r.st.n + 1) : again(ev.unlocked);
  $('runBack').onclick = () => { runClose(); };
  $('runBack').focus();
}

/* ================= Drawing ================= */
function runDraw(r) {
  const c = r.ctx, W = r.W, H = r.H;
  c.save();
  if (r.shake) c.translate((Math.random() - 0.5) * 14 * r.shake, 0);
  // background: deep sky over water, or run_bg.png
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1d2f55'); bg.addColorStop(1, '#2e5d8c');
  c.fillStyle = bg; c.fillRect(-20, 0, W + 40, H);
  if (r.img.bg.ok) c.drawImage(r.img.bg, 0, 0, W, H);
  // the lane: a raised court with rails
  const zc = r.z - RUN_CAM, far = r.z + RUN_VIEW + 10;
  const n0 = runProj(-1.08, zc + 0.5), n1 = runProj(1.08, zc + 0.5), f0 = runProj(-1.08, far), f1 = runProj(1.08, far);
  c.fillStyle = '#4b5d78'; c.beginPath(); c.moveTo(n0.x - 18, n0.y); c.lineTo(f0.x - 2, f0.y); c.lineTo(f1.x + 2, f1.y); c.lineTo(n1.x + 18, n1.y); c.fill();
  for (let zz = Math.floor(far / 3) * 3; zz > zc + 0.5; zz -= 3) {
    const a = runProj(-1, zz), b = runProj(1, zz), z2 = Math.max(zc + 0.5, zz - 3), a2 = runProj(-1, z2), b2 = runProj(1, z2);
    if (!a || !a2) continue;
    c.fillStyle = (Math.floor(zz / 3) % 2) ? '#f2c590' : '#eebc84';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(b2.x, b2.y); c.lineTo(a2.x, a2.y); c.fill();
  }
  const m0 = runProj(0, zc + 0.5), m1 = runProj(0, far);
  c.strokeStyle = '#ffffff66'; c.lineWidth = 2; c.setLineDash([10, 12]); c.beginPath(); c.moveTo(m0.x, m0.y); c.lineTo(m1.x, m1.y); c.stroke(); c.setLineDash([]);
  c.strokeStyle = '#dfe6ef'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(runProj(-1, zc + 0.5).x, n0.y); c.lineTo(runProj(-1, far).x, f0.y); c.moveTo(runProj(1, zc + 0.5).x, n1.y); c.lineTo(runProj(1, far).x, f1.y); c.stroke();
  // things on the lane, far to near
  const items = [];
  for (const g of r.gates) if (g.z > r.z - 2 && g.z < far) items.push([g.z, () => runDrawGate(r, g)]);
  for (const t of r.statues) if (t.hp > 0 && t.z > r.z - 2 && t.z < far) items.push([t.z, () => runDrawStatue(r, t)]);
  for (const t of r.crates) if (t.hp > 0 && t.z > r.z - 2 && t.z < far) items.push([t.z, () => runDrawCrate(r, t)]);
  for (const f of r.foes) if (f.count > 0 && f.z < far) items.push([f.z, () => runDrawFoe(r, f)]);
  items.sort((a, b) => b[0] - a[0]);
  for (const [, draw] of items) draw();
  for (const s of r.shots) runDrawShot(r, s);
  for (const d of r.drops) { const q = runProj(d.x, d.z); if (!q) continue; c.font = `${Math.round(q.s * 0.7)}px sans-serif`; c.textAlign = 'center'; c.fillText(d.kind === 'heart' ? '💖' : '⭐', q.x, q.y - q.s * 0.2 - Math.abs(Math.sin(r.time * 6 + d.x * 9)) * q.s * 0.25); }
  for (const h of r.hazards) {
    const q = runProj(h.x, h.z), m = runProj(h.x, r.z);
    if (m) { c.fillStyle = `rgba(229,72,77,${0.25 + 0.2 * Math.sin(r.time * 14)})`; c.beginPath(); c.ellipse(m.x, m.y, m.s * 0.27 * r.lane, m.s * 0.3, 0, 0, 7); c.fill(); runLabel(c, '！', m.x, m.y - m.s * 0.1, m.s * 0.5, '#fff', '#c0392b'); }
    if (q) { c.fillStyle = '#5b2a86'; c.beginPath(); c.arc(q.x, q.y - q.s * 0.6, q.s * 0.45, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, q.s * 0.06); c.stroke(); }
  }
  runDrawPlayer(r);
  gfxDraw(c);
  if (r.wave > 0) { c.fillStyle = `rgba(255,236,170,${r.wave})`; c.fillRect(-20, 0, W + 40, H); r.wave -= 0.03; }
  for (const p of r.pops) {
    const q = runProj(p.x, p.z); if (!q) continue;
    const f = Math.round(Math.max(18, Math.min(40, q.s * 0.5)));
    c.globalAlpha = 1 - p.t; c.font = `900 ${f}px sans-serif`; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = '#fff';
    c.strokeText(p.text, q.x, q.y - q.s * (1.6 + p.t)); c.fillStyle = p.color; c.fillText(p.text, q.x, q.y - q.s * (1.6 + p.t)); c.globalAlpha = 1;
  }
  c.restore();
  runHud(r);
}
function runBall(c, x, y, rad) {
  c.fillStyle = '#e97d40'; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
  c.strokeStyle = '#7a3a12'; c.lineWidth = Math.max(1, rad / 5); c.beginPath(); c.moveTo(x - rad, y); c.lineTo(x + rad, y); c.moveTo(x, y - rad); c.lineTo(x, y + rad); c.stroke();
}
function runSprite(c, img, x, y, h) {
  if (!img || !img.ok) return false;
  const w = h * img.naturalWidth / img.naturalHeight;
  c.save(); c.globalCompositeOperation = 'multiply'; c.drawImage(img, x - w / 2, y - h, w, h); c.restore();
  return true;
}
function runLabel(c, text, x, y, size, fill, stroke = '#2f3b52') {
  c.font = `900 ${Math.round(size)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = Math.max(3, size * 0.16); c.strokeStyle = stroke; c.strokeText(text, x, y); c.fillStyle = fill; c.fillText(text, x, y); c.textBaseline = 'alphabetic';
}
function runDrawGate(r, g) {
  const c = r.ctx, a = runProj(g.x0, g.z), b = runProj(g.x1, g.z);
  if (!a || !b) return;
  const h = a.s * 0.9, locked = g.lock > 0, good = gateGood(g);
  const col = locked ? '#8a93a6' : good ? '#3d8bf0' : '#e5484d';
  c.fillStyle = col + (g.flash > 0 ? 'ee' : '99'); c.fillRect(a.x, a.y - h, b.x - a.x, h);
  c.fillStyle = col; c.fillRect(a.x, a.y - h - a.s * 0.08, b.x - a.x, a.s * 0.12);
  c.fillRect(a.x - a.s * 0.05, a.y - h, a.s * 0.1, h); c.fillRect(b.x - a.s * 0.05, a.y - h, a.s * 0.1, h);
  runLabel(c, locked ? `🔒${g.lock}` : gateText(g), (a.x + b.x) / 2, a.y - h / 2, Math.min(a.s * 0.75, (b.x - a.x) * 0.4), '#fff', '#0006');
  if (locked) runLabel(c, `→ ${gateText(g)}`, (a.x + b.x) / 2, a.y - h - a.s * 0.35, a.s * 0.4, '#ffe066');
  if (g.flash > 0) g.flash -= 0.016;
}
function runDrawStatue(r, t) {
  const c = r.ctx, p = runProj((t.x0 + t.x1) / 2, t.z), a = runProj(t.x0, t.z), b = runProj(t.x1, t.z);
  if (!p) return;
  c.fillStyle = '#9aa3b2'; c.fillRect(a.x + (b.x - a.x) * 0.15, p.y - p.s * 0.5, (b.x - a.x) * 0.7, p.s * 0.5);
  c.save(); c.filter = 'grayscale(1) brightness(1.1)'; if (!runSprite(c, r.img.statue[t.ally], p.x, p.y - p.s * 0.45, p.s * 1.9)) { c.fillStyle = '#b8c0cc'; c.beginPath(); c.arc(p.x, p.y - p.s * 1.3, p.s * 0.6, 0, 7); c.fill(); } c.restore();
  runLabel(c, String(t.hp), p.x, p.y - p.s * 0.22, p.s * 0.5, t.flash > 0 ? '#ffe066' : '#fff');
  if (t.flash > 0) t.flash -= 0.016;
}
function runDrawCrate(r, t) {
  const c = r.ctx, a = runProj(t.x0 + 0.25, t.z), b = runProj(t.x1 - 0.25, t.z), w = RUN_WEAPONS[t.weapon];
  if (!a || !b) return;
  const h = a.s * 0.75, x = a.x, wd = b.x - a.x;
  c.fillStyle = t.flash > 0 ? '#e7b26a' : '#b9773a'; c.fillRect(x, a.y - h, wd, h);
  c.strokeStyle = '#7a4a1e'; c.lineWidth = Math.max(2, a.s * 0.05); c.strokeRect(x, a.y - h, wd, h);
  c.beginPath(); c.moveTo(x, a.y - h); c.lineTo(x + wd, a.y); c.moveTo(x + wd, a.y - h); c.lineTo(x, a.y); c.stroke();
  runLabel(c, `${w.icon}${t.hp}`, x + wd / 2, a.y - h / 2, Math.min(a.s * 0.5, wd * 0.3), '#fff', '#7a4a1e');
  runLabel(c, w.name, x + wd / 2, a.y - h - a.s * 0.25, a.s * 0.28, '#ffe066');
  if (t.flash > 0) t.flash -= 0.016;
}
function runDrawFoe(r, f) {
  const c = r.ctx;
  if (f.kind === 'boss') {
    const p = runProj(0, f.z); if (!p) return;
    const h = p.s * 5;
    if (!runSprite(c, r.img.boss, p.x, p.y, h)) { c.fillStyle = '#6b4aa0'; c.beginPath(); c.arc(p.x, p.y - h / 2, h / 2.3, 0, 7); c.fill(); }
    const w = p.s * 2.6, y = p.y - h - p.s * 0.35;
    c.fillStyle = '#0007'; c.fillRect(p.x - w / 2, y, w, p.s * 0.28);
    c.fillStyle = '#e5484d'; c.fillRect(p.x - w / 2, y, w * f.count / f.max, p.s * 0.28);
    runLabel(c, `${r.st.boss.name}  ${f.count}`, p.x, y - p.s * 0.3, Math.max(14, p.s * 0.38), '#fff');
    return;
  }
  // a crowd: rows across its part of the lane, more rows for more enemies
  const per = Math.max(3, Math.round((f.x1 - f.x0) / 0.2)), rows = Math.min(14, Math.ceil(f.count / per));
  for (let row = rows - 1; row >= 0; row--) {
    const inRow = row === rows - 1 && rows < 14 ? f.count - per * (rows - 1) : per;
    for (let i = 0; i < inRow; i++) {
      const x = f.x0 + (f.x1 - f.x0) * (i + 0.5) / per, q = runProj(x, f.z + row * 0.45);
      if (!q) continue;
      const h = q.s * 1.05, bob = Math.abs(Math.sin(r.time * 8 + i + row)) * q.s * 0.05;
      if (!runSprite(c, r.img.enemy[(i + row) % 2], q.x, q.y - bob, h)) {
        c.fillStyle = f.armor ? ((i + row) % 2 ? '#6b7688' : '#8592a6') : f.kind === 'runner' ? ((i + row) % 2 ? '#e67e22' : '#f39c12') : (i + row) % 2 ? '#8e44ad' : '#a55bc4'; c.beginPath(); c.roundRect(q.x - h * 0.3, q.y - h * 0.75 - bob, h * 0.6, h * 0.75, h * 0.2); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(q.x - h * 0.12, q.y - h * 0.55 - bob, h * 0.08, 0, 7); c.arc(q.x + h * 0.12, q.y - h * 0.55 - bob, h * 0.08, 0, 7); c.fill();
      }
    }
  }
  const p = runProj((f.x0 + f.x1) / 2, f.z);
  if (p) runLabel(c, (f.armor ? '🛡' : f.kind === 'runner' ? '💨' : '') + f.count, p.x, p.y - p.s * 0.95, Math.max(16, p.s * 0.55), f.flash > 0 ? '#ffe066' : '#fff', '#c0392b');
  if (f.flash > 0) f.flash -= 0.016;
}
function runDrawShot(r, s) {
  const p = runProj(s.x, s.z);
  if (!p) return;
  const k = Math.min(5, Math.ceil(Math.log2(s.w + 1))), rad = p.s * 0.13;
  for (let i = 0; i < k; i++) runBall(r.ctx, p.x + (i - (k - 1) / 2) * rad * 1.6, p.y - p.s * 0.45 - (i % 2) * rad, rad);
  if (s.w >= 4) runLabel(r.ctx, String(s.w), p.x, p.y - p.s * 0.8, Math.max(11, p.s * 0.22), s.boost ? '#ffe066' : '#fff');
}
function runDrawPlayer(r) {
  const c = r.ctx, xs = runShooters(r);
  r.allies.forEach((k, i) => { const q = runProj(xs[i + 1], r.z); if (q) runSprite(c, r.img.ally[k], q.x, q.y, q.s * 1.35); });
  const q = runProj(r.x, r.z);
  if (!q) return;
  if (!runSprite(c, r.img.runner, q.x, q.y, q.s * 1.6)) { c.fillStyle = '#f07a36'; c.beginPath(); c.arc(q.x, q.y - q.s * 0.6, q.s * 0.4, 0, 7); c.fill(); }
}
function runHud(r) {
  const c = r.ctx, W = r.W, full = RUN_LIFE + r.t.life, boss = r.foes.at(-1), prog = Math.min(1, r.z / r.st.stop);
  c.fillStyle = '#2f3b52dd'; c.beginPath(); c.roundRect(16, 14, W - 32, 50, 16); c.fill();
  c.fillStyle = '#fff'; c.font = '900 18px sans-serif'; c.textAlign = 'left'; c.fillText(`ステージ${r.st.n}${r.trial ? '（ためし）' : ''}`, 34, 46);
  c.font = '20px sans-serif'; c.fillText('❤'.repeat(Math.max(0, r.life)) , 210, 47);
  c.fillStyle = '#ffffff55'; c.fillText('❤'.repeat(Math.max(0, full - r.life)), 210 + c.measureText('❤'.repeat(Math.max(0, r.life))).width, 47);
  c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = '700 14px sans-serif';
  c.fillText(`${Object.entries(r.arms).filter(([, v]) => v).map(([k, v]) => RUN_WEAPONS[k].icon + 'Lv' + v).join(' ')}　仲間 ${r.allies.length} ／ たおした ${r.kills} ／ ${r.st.boss.name} ${boss.count}`, W - 34, 45);
  c.fillStyle = '#ffffff33'; c.fillRect(34, 56, W - 68, 4); c.fillStyle = '#ffcc4d'; c.fillRect(34, 56, (W - 68) * prog, 4);
  // special gauge and combo
  const gw = Math.min(360, W * 0.4), gx = W / 2 - gw / 2, gy = r.H - 30, fullSp = r.sp >= r.spNeed;
  c.fillStyle = '#2f3b52cc'; c.beginPath(); c.roundRect(gx - 10, gy - 22, gw + 20, 42, 12); c.fill();
  c.fillStyle = '#ffffff33'; c.fillRect(gx, gy, gw, 10);
  c.fillStyle = fullSp ? `hsl(${r.time * 500 % 360} 95% 60%)` : '#ffb347'; c.fillRect(gx, gy, gw * Math.min(1, r.sp / r.spNeed), 10);
  c.fillStyle = '#fff'; c.font = '700 13px sans-serif'; c.textAlign = 'center';
  c.fillText(fullSp ? '★ タップで ダンクウェーブ！ ★' : 'ひっさつゲージ（敵をたおすとたまる）', W / 2, gy - 6);
  if (r.combo >= 10) { c.textAlign = 'right'; c.font = `900 ${Math.min(54, 26 + r.combo / 12)}px sans-serif`; c.lineWidth = 6; c.strokeStyle = '#2f3b52'; c.strokeText(`${r.combo} コンボ`, W - 30, r.H * 0.3); c.fillStyle = '#ffe066'; c.fillText(`${r.combo} コンボ`, W - 30, r.H * 0.3); }
  c.textAlign = 'left'; c.font = '700 12px sans-serif'; c.fillStyle = '#ffffffaa'; 
  c.textAlign = 'center';
  const big = (t, col) => { c.font = '900 84px sans-serif'; c.lineWidth = 10; c.strokeStyle = '#fff'; c.strokeText(t, W / 2, r.H * 0.45); c.fillStyle = col; c.fillText(t, W / 2, r.H * 0.45); };
  if (r.phase === 'count') big(String(Math.ceil(r.count)), '#f07a36');
  if (r.phase === 'win') big('クリア！', '#f07a36');
  if (r.phase === 'over') big('ざんねん…', '#5b6578');
}
