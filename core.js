// ミニバス練習ノート スマホ版：PC版 core.py のルールを JavaScript に移したもの。
// PC版とデータの形式（JSON）は同じなので、PC版のバックアップをそのまま読み込める。
// 変えたところ：最初から入っている動画（SUN's の動画リスト）はなし。保存先は端末の中（IndexedDB）。
// core.py のルールを変えたときは、ここも同じように直す。
'use strict';
(() => {
const CATS = ['基礎体力', 'ドリブル', 'ピボット', 'シュート', 'ディフェンス', 'パス', 'その他', "SUN's"];
const IDS = ['rabbit', 'cat', 'fluff'];
const LABELS = ['うさぎ', 'ねこ', 'もふもふ'];
const STAT_KEYS = ['stamina', 'dribble', 'pivot', 'shoot', 'defense', 'pass'];
const STAT_LABELS = Object.fromEntries(STAT_KEYS.map((k, i) => [k, CATS[i]]));
const SLOTS = { shoes: 'バッシュ', bottoms: 'ボトムス', tops: 'トップス', headband: 'ヘアバンド', wristband: 'リストバンド' };
const GACHA_COST = 5;
const GEAR_TIERS = ['はじめの', 'きらめく', 'スターの', 'スーパースターの', 'レジェンドの'];
const GACHA_WEIGHTS = [60, 28, 8, 3.5, 0.5];
const GACHA_TOOL_RATE = 20;
const MULTI_MIN_TIER = 3;
const MULTI_COUNT = 10;
const GEAR = {};
const GEAR_BONUS = { shoes: { stamina: 3, dribble: 2 }, bottoms: { pivot: 3, defense: 2 }, tops: { pass: 3, stamina: 2 }, headband: { shoot: 3, pivot: 2 }, wristband: { dribble: 2, shoot: 3 } };
for (const [slot, label] of Object.entries(SLOTS)) {
  GEAR_TIERS.forEach((prefix, i) => {
    const tier = i + 1, key = `${slot}_${tier}`;
    GEAR[key] = { name: prefix + label, slot, tier, bonus: Object.fromEntries(Object.entries(GEAR_BONUS[slot]).map(([k, v]) => [k, v * tier])), image: `item_${key}.png` };
  });
}
const TOOLS = {
  candy: { name: '集中キャンディ', description: 'この攻撃のシュート成功率＋15ポイント', effect: 'shoot_bonus', amount: 15, image: 'item_candy.png' },
  note: { name: '作戦ノート', description: 'この攻撃のドリブル・パス成功率＋15ポイント', effect: 'setup_bonus', amount: 15, image: 'item_note.png' },
  megaphone: { name: '応援メガホン', description: '次のCPUのシュート成功率－15ポイント', effect: 'guard_bonus', amount: 15, image: 'item_megaphone.png' } };
const SKILLS = {
  stamina: { name: 'コートをかける足', category: '基礎体力', kind: 'support', description: 'この攻撃のドリブル・パス成功率を上げる' },
  dribble: { name: '左右自在ドリブル', category: 'ドリブル', kind: 'dribble', description: '成功率の高いドリブル。成功でシュートチャンス＋10' },
  pivot: { name: 'くるくるキープ', category: 'ピボット', kind: 'support', description: '次のドリブル・パス失敗時、1回だけボールを守る' },
  shoot: { name: '虹のシュート', category: 'シュート', kind: 'shoot', description: '成功率の高いシュート。成功で2点' },
  defense: { name: 'ねばりのガード', category: 'ディフェンス', kind: 'support', description: '次のCPUの準備・シュート成功率を下げる' },
  pass: { name: 'なかまをつなぐパス', category: 'パス', kind: 'pass', description: '成功率の高いパス。成功で味方へつなぐ' } };
const ENEMIES = [
  { name: 'もくもくフレンズ', names: ['モコ', 'フワ', 'クル'], power: 24, style: 'defense', image: 'clouds' },
  { name: 'ドリームキャッツ', names: ['ミケ', 'シロ', 'チャイ'], power: 30, style: 'pass', image: 'cats' },
  { name: 'スターウルブズ', names: ['ハヤテ', 'ギン', 'クロ'], power: 37, style: 'dribble', image: 'wolves' },
  { name: 'ティラノキッズ', names: ['レックス', 'ガオ', 'チビラ'], power: 45, style: 'stamina', image: 'dinos' }];
const MEASURES = {
  freethrow: { name: 'フリースロー', unit: '本', max: 10, category: 'シュート', hint: '10本うって、入った本数を記録' },
  layup: { name: 'ゴール下シュート', unit: '本', max: 10, category: 'シュート', hint: '左右5本ずつ、合わせて入った本数を記録' },
  wing_right: { name: '45度シュート右', unit: '本', max: 10, category: 'シュート', hint: '右45度から10本うって、入った本数を記録' },
  wing_left: { name: '45度シュート左', unit: '本', max: 10, category: 'シュート', hint: '左45度から10本うって、入った本数を記録' },
  legthrough: { name: '交互レッグスルー', unit: '回', max: 500, category: 'ドリブル', hint: '左右交互のレッグスルーが何回連続でできたかを記録' } };
const REMOVED_MEASURES = new Set(['pass30', 'jumprope', 'dribble30']);
const MEASURE_FIRST = 1, MEASURE_PB = 3;
const CHORES = { cooking: { name: '料理', gp: 5, icon: '🍳' }, fold: { name: '洗濯物をたたむ', gp: 4, icon: '👕' }, dishes: { name: '食器洗い', gp: 3, icon: '🍽️' }, toilet: { name: 'トイレ掃除', gp: 3, icon: '🚽' }, bath: { name: '風呂掃除', gp: 3, icon: '🛁' }, hang: { name: '洗濯物を干す', gp: 3, icon: '☀️' }, vacuum: { name: '掃除機かけ', gp: 2, icon: '🧹' }, trash: { name: 'ゴミ出し', gp: 1, icon: '🗑️' } };
const COACH_STAGES = [
  { need: 0, name: 'ぽっちゃり監督', effect: 'ベンチでおやつ中（効果なし）' },
  { need: 10, name: 'ちょいやせ監督', effect: '対戦で味方全員の基礎体力＋2' },
  { need: 30, name: 'ジョギング監督', effect: '対戦で「タイムアウト」を1回使える（次のCPUのシュート成功率－15）' },
  { need: 60, name: 'アスリート監督', effect: '対戦で味方全員の全能力＋2' },
  { need: 100, name: 'スーパーコーチ', effect: '1日の対戦回数が3回→5回' }];
const COACH_DAILY_CAP = 3, COACH_WEEKLY_QUOTA = 7, COACH_PER_LEVEL = 5;
const REQUEST_GP = 1, REQUEST_DAYS = 2, REQUESTS_PER_DAY = 3;
const BADGES = [{ weeks: 3, name: '銅メダル', icon: '🥉', gp: 5 }, { weeks: 5, name: '銀メダル', icon: '🥈', gp: 10 }, { weeks: 10, name: '金メダル', icon: '🥇', gp: 20 }, { weeks: 20, name: 'レジェンド', icon: '🏆', gp: 30 }];
const BATTLES_PER_DAY = 3, BATTLES_PER_DAY_MAX = 5;
const WIN_GP = [1, 2, 3, 4];
const RUN_COST = 3;
const RUN_STAGES = 10, RUN_MAX_SCORE = 100000;
const RUN_GAMES = { run: 'ドリブルラン', shoot: 'シュートラッシュ' };
const RUN_PLAY = { id: null, stage: 0, t: 0, game: 'run' };
const MANAGER_SECONDS = 300, MANAGER_MAX_FAILS = 5, MANAGER_LOCKOUT = 300;
const MANAGER = { until: 0, fails: 0, blocked: 0 };
const MAX_MATCHES = 10;
let STATE = null, MATCH = null;

class UserError extends Error {}
const now = () => Date.now() / 1000;
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekday = d => (d.getDay() + 6) % 7;   // 月曜日=0（Python と同じ）
const uid = () => crypto.randomUUID().replace(/-/g, '');
const clone = x => structuredClone(x);
const len = s => [...s].length;   // Python の len() と同じく文字数で数える
const isDict = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const sameKeys = (o, keys) => { const a = Object.keys(o).sort(), b = [...keys].sort(); return a.length === b.length && a.every((k, i) => k === b[i]); };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sum = a => a.reduce((x, y) => x + y, 0);
const randrange = n => Math.floor(Math.random() * n);
const choice = a => a[randrange(a.length)];
function choices(items, weights) {
  let r = Math.random() * sum(weights);
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
  return items[items.length - 1];
}
function require(ok, msg) { if (!ok) throw new UserError(msg); }
const integer = (x, lo = 0, hi = 10 ** 9) => typeof x === 'number' && Number.isInteger(x) && lo <= x && x <= hi;
const validId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x);
function datecheck(x) {
  require(typeof x === 'string', '日付が不正です');
  require(/^\d{4}-\d{2}-\d{2}$/.test(x) && iso(parseDate(x)) === x, '日付が不正です');
  require(x <= today(), '今日以前の日付を指定してください'); return x;
}

function fresh() {
  return { version: 3, active: 'rabbit', buddies: Object.fromEntries(IDS.map(k => [k, { name: '', started: k === 'rabbit', look: null, equipment: Object.fromEntries(Object.keys(SLOTS).map(s => [s, null])) }])),
    videos: [], activities: [], matches: [], measures: [], settings: { cutin: true },
    game: { sp_spent: 0, draws: 0, legacy_rolls: 0, gear: [], tools: Object.fromEntries(Object.keys(TOOLS).map(k => [k, 0])), gacha_log: [], legacy_board_log: [], choice_draws: 0, exchanged: 0 },
    coach: freshCoach(), run: freshRun(), shoot: freshRun() };
}
const freshRun = () => ({ unlocked: 1, best: {}, plays: 0 });
const freshCoach = () => ({ chores: [], requests: [], password: null, win_gp: 0, gp_spent: 0, battles: { date: '', count: 0 } });

function upgrade(source) {
  require(isDict(source), 'JSONの形式が不正です'); const d = clone(source);
  if (d.version === 1) {
    for (const k of IDS) { require(isDict(d.buddies?.[k]), '相棒データが不正です'); d.buddies[k].equipment = Object.fromEntries(Object.keys(SLOTS).map(s => [s, null])); }
    d.game = fresh().game; d.settings = { cutin: true }; d.version = 3;
  } else if (d.version === 2) {
    const g = d.game; require(isDict(g) && integer(g.rolls) && integer(g.sp_spent) && g.rolls * 3 === g.sp_spent, '旧SPデータが不正です');
    g.legacy_rolls = g.rolls; delete g.rolls; g.draws = 0; g.gacha_log = []; g.legacy_board_log = has(g, 'board_log') ? g.board_log : []; delete g.board_log; delete g.position; d.settings = { cutin: true }; d.version = 3;
  }
  if (Array.isArray(d.matches)) d.matches.splice(MAX_MATCHES);
  if (!has(d, 'measures')) d.measures = [];
  if (!has(d, 'coach')) d.coach = freshCoach();
  if (isDict(d.coach) && !has(d.coach, 'requests')) d.coach.requests = [];
  if (!has(d, 'run')) d.run = freshRun();
  if (!has(d, 'shoot')) d.shoot = freshRun();
  if (Array.isArray(d.measures)) d.measures = d.measures.filter(r => !(isDict(r) && REMOVED_MEASURES.has(r.type)));
  return validate(d);
}

const SORT_SCOPES = ['すべて', '非表示', ...CATS];
const validSort = s => isDict(s) && sameKeys(s, ['key', 'dir']) && ['added', 'title', 'views', 'practice'].includes(s.key) && ['asc', 'desc'].includes(s.dir);
const validSorts = m => validSort(m) || (isDict(m) && Object.entries(m).every(([k, v]) => SORT_SCOPES.includes(k) && validSort(v)));
const sortMap = m => validSort(m) ? { 'すべて': m } : { ...(m || {}) };
function validate(d) {
  require(isDict(d) && d.version === 3, '対応していないデータ形式です');
  require(IDS.includes(d.active) && isDict(d.buddies) && sameKeys(d.buddies, IDS), '相棒の設定が不正です');
  for (const k of IDS) {
    const b = d.buddies[k];
    require(isDict(b) && typeof b.name === 'string' && len(b.name) <= 16 && typeof b.started === 'boolean' && [null, 1, 2, 3].includes(b.look ?? null) &&isDict(b.equipment) && sameKeys(b.equipment, Object.keys(SLOTS)), '相棒・装備欄が不正です');
  }
  require(d.buddies[d.active].started, '育成対象が不正です');
  require(isDict(d.settings) && typeof d.settings.cutin === 'boolean', '設定が不正です');
  require(!has(d.settings, 'video_sort') || validSorts(d.settings.video_sort), '動画の並び順の設定が不正です');
  require(CATS.includes(has(d.settings, 'video_category') ? d.settings.video_category : 'ドリブル'), '動画のカテゴリー設定が不正です');
  for (const key of ['videos', 'activities', 'matches', 'measures']) require(Array.isArray(d[key]) && d[key].length <= 100000, '記録の形式・件数が不正です');
  const mids = new Set();
  for (const r of d.measures) {
    require(isDict(r) && validId(r.id) && !mids.has(r.id) && has(MEASURES, r.type) && integer(r.value, 0, MEASURES[r.type].max), 'チャレンジ記録が不正です'); mids.add(r.id); datecheck(r.date);
  }
  const vids = new Set(), yt = new Set(), events = new Set(), unique = new Set();
  const menus = new Set(d.videos.filter(v => isDict(v) && v.kind === 'menu').map(v => v.id));
  for (const v of d.videos) {
    require(isDict(v) && validId(v.id) && !vids.has(v.id), '動画IDが不正です'); vids.add(v.id);
    const kind = has(v, 'kind') ? v.kind : 'video';
    if (kind === 'menu') require((has(v, 'youtube') ? v.youtube : '') === '', '練習メニューのデータが不正です');
    else {
      const pattern = kind === 'video' ? /^[A-Za-z0-9_-]{11}$/ : kind === 'playlist' ? /^[A-Za-z0-9_-]{12,80}$/ : null;
      require(pattern !== null && typeof v.youtube === 'string' && pattern.test(v.youtube) && !yt.has(kind + ' ' + v.youtube), 'YouTubeの動画・再生リストIDが不正、または重複しています'); yt.add(kind + ' ' + v.youtube);
    }
    require(CATS.includes(v.category) && typeof v.title === 'string' && len(v.title) > 0 && len(v.title) <= 120 && typeof v.memo === 'string' && len(v.memo) <= 2000 && typeof v.hidden === 'boolean', '動画の内容が不正です');
  }
  for (const a of d.activities) {
    require(isDict(a) && validId(a.id) && !events.has(a.id), '実績IDが不正です'); events.add(a.id); datecheck(a.date);
    require(IDS.includes(a.buddy) && CATS.includes(a.category) && ['watch', 'practice'].includes(a.type), '実績が不正です');
    require(a.video == null || vids.has(a.video), '実績の動画が見つかりません'); require(a.video != null || a.type === 'practice', '視聴には動画が必要です');
    require(a.type === 'practice' || !menus.has(a.video), '練習メニューには視聴記録をつけられません');
    const key = a.video ? JSON.stringify([a.date, a.type, a.video]) : JSON.stringify([a.date, a.type, null, a.category]); require(!unique.has(key), '実績が重複しています'); unique.add(key);
  }
  for (const m of d.matches) {
    require(isDict(m) && validId(m.id) && typeof m.enemy === 'string' && len(m.enemy) <= 80 && Array.isArray(m.score) && m.score.length === 2 && m.score.every(x => integer(x, 0, 20) && x % 2 === 0) && Array.isArray(m.logs) && m.logs.length <= 500 && m.logs.every(x => typeof x === 'string' && len(x) <= 1000), '試合記録が不正です'); datecheck(m.date);
  }
  const g = d.game; require(isDict(g), 'ゲームデータが不正です');
  const cd = has(g, 'choice_draws') ? g.choice_draws : 0;
  require(integer(g.sp_spent) && integer(g.draws) && integer(g.legacy_rolls) && integer(cd) && g.sp_spent === 3 * (g.draws + g.legacy_rolls) + GACHA_COST * cd, 'SPデータが不正です');
  require(integer(has(g, 'exchanged') ? g.exchanged : 0), '装備交換のSPデータが不正です');
  require(Array.isArray(g.gear) && g.gear.length <= 100000 && isDict(g.tools) && sameKeys(g.tools, Object.keys(TOOLS)) && Object.values(g.tools).every(v => integer(v)), '所持品が不正です');
  const gearids = new Map();
  for (const i of g.gear) { require(isDict(i) && validId(i.id) && !gearids.has(i.id) && has(GEAR, i.key), '装備データが不正です'); gearids.set(i.id, i.key); }
  const used = new Set();
  for (const b of Object.values(d.buddies)) {
    for (const [slot, ident] of Object.entries(b.equipment)) {
      if (ident === null) continue;
      require(typeof ident === 'string' && gearids.has(ident) && GEAR[gearids.get(ident)].slot === slot && !used.has(ident), '装備の部位・重複が不正です'); used.add(ident);
    }
  }
  require(Array.isArray(g.gacha_log) && g.gacha_log.length <= 50 && Array.isArray(g.legacy_board_log) && g.legacy_board_log.length <= 50, '獲得履歴が不正です');
  for (const e of g.gacha_log) { require(isDict(e) && (has(GEAR, e.key) || has(TOOLS, e.key)) && typeof e.new === 'boolean', 'ガチャ履歴が不正です'); datecheck(e.date); }
  const c = d.coach; require(isDict(c) && Array.isArray(c.chores) && c.chores.length <= 100000, '監督データが不正です');
  const cids = new Set();
  for (const r of c.chores) { require(isDict(r) && validId(r.id) && !cids.has(r.id) && has(CHORES, r.chore), '家事の記録が不正です'); cids.add(r.id); datecheck(r.date); }
  require(Array.isArray(c.requests) && c.requests.length <= 100000, 'おねがいのデータが不正です');
  for (const r of c.requests) { require(isDict(r) && sameKeys(r, ['id', 'date', 'chore']) && validId(r.id) && !cids.has(r.id) && has(CHORES, r.chore), 'おねがいのデータが不正です'); cids.add(r.id); datecheck(r.date); }
  const pw = c.password; require(pw === null || (isDict(pw) && sameKeys(pw, ['salt', 'hash']) && Object.values(pw).every(x => typeof x === 'string' && /^[0-9a-f]{32,128}$/.test(x))), 'パスワードのデータが不正です');
  require(integer(c.win_gp) && integer(c.gp_spent), 'GPデータが不正です');
  for (const [game, title] of Object.entries(RUN_GAMES)) {
    const r = d[game]; require(isDict(r) && sameKeys(r, ['unlocked', 'best', 'plays']) && integer(r.unlocked, 1, RUN_STAGES) && integer(r.plays) && isDict(r.best), `${title}のデータが不正です`);
    const stageKeys = Array.from({ length: RUN_STAGES }, (_, i) => String(i + 1));
    for (const [k, v] of Object.entries(r.best)) require(stageKeys.includes(k) && isDict(v) && sameKeys(v, ['score', 'stars']) && integer(v.score, 0, RUN_MAX_SCORE) && integer(v.stars, 0, 3), `${title}の記録が不正です`);
  }
  const b = c.battles; require(isDict(b) && sameKeys(b, ['date', 'count']) && integer(b.count, 0, BATTLES_PER_DAY_MAX) && (b.date === '' || datecheck(b.date)), '対戦回数のデータが不正です');
  return d;
}

const xpValue = a => a.type === 'watch' ? 1 : 5;
const stage = level => level >= 10 ? 3 : level >= 5 ? 2 : 1;
const skillRank = days => days >= 15 ? 3 : days >= 7 ? 2 : days >= 3 ? 1 : 0;
function stats(d, k) {
  const a = d.activities.filter(x => x.buddy === k), xp = sum(a.map(xpValue)), level = 1 + Math.floor(xp / 20);
  const counts = Object.fromEntries(CATS.map(c => [c, new Set(a.filter(x => x.type === 'practice' && x.category === c).map(x => x.date)).size]));
  const practice = Object.fromEntries(CATS.map(c => [c, a.filter(x => x.type === 'practice' && x.category === c).length]));
  const base = Object.fromEntries(Object.entries(STAT_LABELS).map(([s, c]) => [s, 12 + level * 2 + practice[c] * 2]));
  for (const s of { rabbit: ['stamina', 'dribble'], cat: ['shoot', 'pass'], fluff: ['defense', 'pivot'] }[k]) base[s] += 3;
  const bonus = Object.fromEntries(STAT_KEYS.map(s => [s, 0])), items = Object.fromEntries(d.game.gear.map(i => [i.id, i]));
  for (const ident of Object.values(d.buddies[k].equipment)) {
    if (ident) for (const [s, v] of Object.entries(GEAR[items[ident].key].bonus)) bonus[s] += v;
  }
  const st = stage(level), look = d.buddies[k].look;
  return { xp, level, stage: st, look: Math.min(look || st, st), days: new Set(a.filter(x => x.type === 'practice').map(x => x.date)).size, counts, practice, base, bonus,
    values: Object.fromEntries(STAT_KEYS.map(s => [s, base[s] + bonus[s]])), skills: Object.fromEntries(Object.entries(SKILLS).map(([s, t]) => [s, skillRank(counts[t.category])])) };
}
function measureFlags(d) {
  const days = new Map();
  for (const r of d.measures || []) {
    const k = r.date + '\u0000' + r.type;
    if (!days.has(k) || r.value > days.get(k).value) days.set(k, r);
  }
  const flags = {}; let bonus = 0; const best = {};
  const sorted = [...days.values()].sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : x.type < y.type ? -1 : x.type > y.type ? 1 : 0);
  for (const r of sorted) {
    if (!has(best, r.type)) { flags[r.id] = 'first'; bonus += MEASURE_FIRST; best[r.type] = r.value; }
    else if (r.value > best[r.type]) { flags[r.id] = 'pb'; bonus += MEASURE_PB; best[r.type] = r.value; }
  }
  return [flags, bonus];
}
function economy(d) {
  const exchanged = d.game.exchanged || 0, mb = measureFlags(d)[1], earned = sum(d.activities.map(xpValue)) + exchanged + mb, balance = earned - d.game.sp_spent;
  return { earned, exchanged, measure_bonus: mb, spent: d.game.sp_spent, balance, available: Math.max(0, balance), debt: Math.max(0, -balance) };
}
function coach(d) {
  const c = d.coach, nowD = new Date(), todayS = iso(nowD), per = {};
  for (const r of c.chores) per[r.date] = (per[r.date] || 0) + 1;
  const moves = Object.fromEntries(Object.entries(per).map(([day, n]) => [day, Math.min(COACH_DAILY_CAP, n)])), total = sum(Object.values(moves));
  const st = Math.max(...COACH_STAGES.map((s, i) => total >= s.need ? i + 1 : 0));
  const mon = addDays(nowD, -weekday(nowD)), last = addDays(mon, -7);
  const week = start => sum(Array.from({ length: 7 }, (_, i) => moves[iso(addDays(start, i))] || 0));
  const thisWeek = week(mon), lastWeek = week(last), days = Object.keys(per).sort(), first = days.length ? days[0] : null;
  const judged = first !== null && first < iso(last);
  const rebound = judged && lastWeek < COACH_WEEKLY_QUOTA && thisWeek < COACH_WEEKLY_QUOTA;
  const power = rebound ? 0 : st;
  const nxt = st < COACH_STAGES.length ? COACH_STAGES[st].need : null;
  const requests = requestStatus(c, nowD), streak = streaks(moves, mon);
  const badges = BADGES.map(b => ({ ...b, earned: streak.best >= b.weeks }));
  const gpChores = sum(c.chores.map(r => CHORES[r.chore].gp)), gpReq = REQUEST_GP * requests.filter(r => r.status === 'done').length, gpBadge = sum(badges.filter(b => b.earned).map(b => b.gp));
  const gp = gpChores + gpReq + gpBadge + c.win_gp - c.gp_spent;
  const limit = power >= 5 ? BATTLES_PER_DAY_MAX : BATTLES_PER_DAY, used = c.battles.date === todayS ? c.battles.count : 0;
  const since = iso(addDays(nowD, -14));
  return { total, level: 1 + Math.floor(total / COACH_PER_LEVEL), stage: st, look: rebound ? Math.max(1, st - 1) : st, name: COACH_STAGES[st - 1].name,
    next: nxt, today: moves[todayS] || 0, today_chores: per[todayS] || 0, this_week: thisWeek, last_week: lastWeek, judged, rebound, power,
    effects: { stamina: power >= 2, timeout: power >= 3, all: power >= 4, battles: power >= 5 },
    requests: requests.filter(r => r.date >= since), requests_today: requests.filter(r => r.date === todayS).length,
    streak, badges,
    gp: { chores: gpChores, requests: gpReq, badges: gpBadge, wins: c.win_gp, spent: c.gp_spent, balance: gp, available: Math.max(0, gp) },
    battles: { limit, used, left: Math.max(0, limit - used) } };
}
function requestStatus(c, nowD) {
  const chores = [...c.chores].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0), used = new Set(), out = [], todayS = iso(nowD);
  for (const r of [...c.requests].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) {
    const end = iso(addDays(parseDate(r.date), REQUEST_DAYS - 1));
    const hit = chores.find(x => x.chore === r.chore && r.date <= x.date && x.date <= end && !used.has(x.id));
    if (hit) used.add(hit.id);
    out.push({ ...r, until: end, status: hit ? 'done' : todayS <= end ? 'open' : 'expired', done_on: hit ? hit.date : null });
  }
  return out;
}
function streaks(moves, mon) {
  const keys = Object.keys(moves).sort();
  if (!keys.length) return { current: 0, best: 0, weeks: [] };
  const first = parseDate(keys[0]); let start = addDays(first, -weekday(first)); const ok = [];
  while (start <= mon) {
    ok.push(sum(Array.from({ length: 7 }, (_, i) => moves[iso(addDays(start, i))] || 0)) >= COACH_WEEKLY_QUOTA); start = addDays(start, 7);
  }
  let best = 0, run = 0;
  for (const x of ok) { run = x ? run + 1 : 0; best = Math.max(best, run); }
  let cur = 0; const past = ok[ok.length - 1] ? ok : ok.slice(0, -1);
  for (const x of [...past].reverse()) { if (!x) break; cur++; }
  return { current: cur, best, weeks: ok.slice(-12) };
}
const managerOpen = () => now() < MANAGER.until;
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = new Uint8Array(salt.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 200000, hash: 'SHA-256' }, key, 256));
}
async function checkPassword(d, pw) {
  const stored = d.coach.password; require(stored !== null, 'パスワードがまだ設定されていません');
  require(now() >= MANAGER.blocked, 'まちがいが続いたので、5分待ってからもう一度ためしてください');
  if (typeof pw === 'string' && len(pw) <= 64 && await hashPassword(pw, stored.salt) === stored.hash) { MANAGER.fails = 0; return; }
  MANAGER.fails++;
  if (MANAGER.fails >= MANAGER_MAX_FAILS) { MANAGER.fails = 0; MANAGER.blocked = now() + MANAGER_LOCKOUT; }
  throw new UserError('パスワードがちがいます');
}
async function newPassword(pw) {
  require(typeof pw === 'string' && len(pw) >= 4 && len(pw) <= 32, 'パスワードは4～32文字にしてください');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16))); return { salt, hash: await hashPassword(pw, salt) };
}
function enemyTeam(index) {
  const e = ENEMIES[index];
  return e.names.map((n, i) => {
    const v = Object.fromEntries(STAT_KEYS.map((s, j) => [s, e.power + ((i + j) % 3) * 2])); v[e.style] += 6; return { name: n, values: v };
  });
}
const chance = (a, b, bonus = 0) => Math.max(10, Math.min(90, Math.trunc(100 * a / (a + b) + bonus + 0.5)));
const avg = (team, key) => sum(team.map(p => p.values[key])) / team.length;
function probabilities(m) {
  const p = m.team[m.holder].values, v = m.opponents[m.defender].values, guard = (v.defense * 2 + v.stamina) / 3;
  return { dribble: chance((p.dribble * 2 + p.pivot) / 3, guard, 5 + m.setup_bonus), pass: chance((p.pass * 2 + avg(m.team, 'pass')) / 3, guard, 10 + m.setup_bonus), shoot: chance(p.shoot, guard, m.advantage + m.shoot_bonus) };
}
function skillOptions(m) {
  const p = m.team[m.holder], out = [];
  for (const [key, t] of Object.entries(SKILLS)) {
    const rank = p.skills[key]; let reason = '', pct = 100;
    if (!rank) reason = '未習得：このカテゴリーを3日練習しよう';
    else if (m.skill_used[p.id] >= p.stage) reason = 'このキャラの技は使用済み';
    else if (t.kind === 'support' && m.support_used) reason = '補助技は1攻撃1回まで';
    else if (['dribble', 'pass'].includes(t.kind) && m.prep >= 2) reason = '準備は2回まで';
    if (t.kind !== 'support') { const base = probabilities(m)[t.kind]; pct = Math.min(90, base + 15 + 5 * Math.max(0, rank - 1)); }
    let effect = t.description;
    if (['dribble', 'pass', 'shoot'].includes(key)) effect += `（成功率＋${15 + 5 * Math.max(0, rank - 1)}ポイント）`;
    else if (['stamina', 'defense'].includes(key)) effect += `（${10 + 5 * Math.max(0, rank - 1)}ポイント）`;
    else if (key === 'pivot') effect += '。★★以上は準備成功率も上昇';
    out.push({ key, ...t, rank, probability: pct, reason, effect });
  }
  return out;
}
function view() {
  const m = clone(MATCH);
  if (m) { m.probabilities = probabilities(m); m.skill_options = skillOptions(m); }
  const [flags, bonus] = measureFlags(STATE);
  const data = clone({ ...STATE, coach: { ...STATE.coach, password: null } });
  const manager = { has_password: STATE.coach.password !== null, open: managerOpen(), seconds: Math.max(0, Math.trunc(MANAGER.until - now())) };
  return { data, coach: coach(STATE), manager, stats: Object.fromEntries(IDS.map(k => [k, stats(STATE, k)])), economy: economy(STATE), measures: { flags, bonus },
    enemies: ENEMIES.map((e, i) => ({ ...clone(e), team: enemyTeam(i) })), match: m,
    catalog: clone({ gear: GEAR, tools: TOOLS, slots: SLOTS, stats: STAT_LABELS, skills: SKILLS, categories: CATS, gacha_cost: GACHA_COST, multi_count: MULTI_COUNT, multi_min_tier: MULTI_MIN_TIER, gacha_weights: GACHA_WEIGHTS, gacha_tool_rate: GACHA_TOOL_RATE, gear_tiers: GEAR_TIERS, measures: MEASURES, measure_bonus: { first: MEASURE_FIRST, pb: MEASURE_PB }, chores: CHORES, coach_stages: COACH_STAGES, coach_quota: COACH_WEEKLY_QUOTA, coach_cap: COACH_DAILY_CAP, coach_per_level: COACH_PER_LEVEL, win_gp: WIN_GP, run_cost: RUN_COST, run_stages: RUN_STAGES, request_gp: REQUEST_GP, request_days: REQUEST_DAYS, requests_per_day: REQUESTS_PER_DAY, badges: BADGES }) };
}
function parseVideo(url) {
  require(typeof url === 'string', 'YouTubeのURLを入力してください');
  let u; try { u = new URL(url.trim()); } catch (e) { throw new UserError('YouTubeのURLを指定してください'); }
  require(['http:', 'https:'].includes(u.protocol), 'YouTubeのURLを指定してください');
  const host = u.hostname.toLowerCase().replace(/^www\./, ''); require(['youtu.be', 'youtube.com', 'm.youtube.com'].includes(host), 'YouTubeのURLを指定してください');
  const parts = u.pathname.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
  const listId = u.searchParams.get('list') || ''; let videoId = '', playlist = false;
  if (host === 'youtu.be') videoId = parts[0] || '';
  else if (parts[0] === 'playlist' || (parts[0] === 'embed' && parts[1] === 'videoseries')) playlist = true;
  else if (parts.length > 1 && ['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1];
  else videoId = u.searchParams.get('v') || '';
  const okList = /^[A-Za-z0-9_-]{12,80}$/.test(listId), okVideo = /^[A-Za-z0-9_-]{11}$/.test(videoId);
  if (playlist || (!okVideo && okList)) { require(okList, '再生リストのURLを確認してください'); return { kind: 'playlist', youtube: listId }; }
  require(okVideo, '動画URLを確認してください'); return { kind: 'video', youtube: videoId };
}

function resetAttack(m) {
  Object.assign(m, { holder: m.round % 3, defender: m.round % 3, advantage: 0, prep: 0, shoot_bonus: 0, setup_bonus: 0, guard_bonus: 0, skill_guard: 0, keep: false, support_used: false, tool_used: false });
}
const log = (m, line) => m.logs.push(line);
function finish(m, d) {
  if (Math.max(...m.score) < 10) return false;
  m.done = true; const win = m.score[0] >= 10, gp = win ? WIN_GP[m.enemy] : 0; log(m, '試合終了！ ' + (win ? 'なかよしチームの勝利！' : '今回は相手の勝ち！') + ' また挑戦しよう！');
  if (gp) { d.coach.win_gp += gp; m.gp = gp; log(m, `勝利ボーナス！ GP＋${gp}`); }
  d.matches.unshift({ id: m.id, date: today(), enemy: ENEMIES[m.enemy].name, score: [...m.score], logs: m.logs.slice(-450), rule: 'first10_skills', gp }); d.matches.splice(MAX_MATCHES); return true;
}
function cpuAttack(m, d) {
  const actor = choice(m.opponents), v = actor.values, defense = (avg(m.team, 'defense') * 2 + avg(m.team, 'stamina')) / 3, move = v.dribble >= v.pass ? 'dribble' : 'pass';
  const attack = move === 'dribble' ? (v[move] * 2 + v.pivot) / 3 : v.pass; let pct = chance(attack, defense, (move === 'dribble' ? 5 : 10) - m.skill_guard); let ok = randrange(100) < pct;
  log(m, `相手：${actor.name}の${move === 'dribble' ? 'ドリブル' : 'パス'}（${pct}%）…` + (ok ? '成功！' : '味方が止めた！'));
  if (ok) {
    pct = chance(v.shoot, defense, (move === 'dribble' ? 10 : 7) - m.guard_bonus - m.skill_guard); ok = randrange(100) < pct; log(m, `相手：シュート（${pct}%）…` + (ok ? '決まった！ 2点！' : '外れた！'));
    if (ok) m.score[1] += 2;
  }
  if (!finish(m, d)) { m.round++; resetAttack(m); log(m, `次は${m.team[m.holder].name}の攻撃！`); }
}
function resolveMove(m, d, move, pct) {
  const actor = m.team[m.holder].name, ok = randrange(100) < pct, label = { dribble: 'ドリブル', pass: 'パス', shoot: 'シュート' }[move]; log(m, `味方：${actor}の${label}（${pct}%）…` + (ok ? '成功！' : '失敗！'));
  if (move === 'shoot') {
    if (ok) { m.score[0] += 2; log(m, 'ナイスシュート！ 2点！'); }
    if (!finish(m, d)) cpuAttack(m, d);
  } else {
    m.prep++;
    if (ok) {
      m.advantage = Math.min(20, m.advantage + (move === 'dribble' ? 10 : 7));
      if (move === 'pass') { m.holder = (m.holder + 1) % 3; m.defender = (m.defender + 1) % 3; log(m, m.team[m.holder].name + 'がパスを受け取った！'); }
      log(m, `シュートチャンス＋${m.advantage}。準備 ${m.prep}/2回。`);
    } else if (m.keep) { m.keep = false; log(m, 'くるくるキープの効果！ ボールを守った。準備回数は消費します。'); }
    else cpuAttack(m, d);
  }
}

async function action(p, save) {
  require(isDict(p), '操作が不正です'); const kind = p.action; let d = clone(STATE), m = clone(MATCH); const playing = !!(m && !m.done); let message = '保存しました', event = null;
  if (kind === 'rename') {
    const k = p.buddy, n = p.name; require(IDS.includes(k) && typeof n === 'string' && len(n.trim()) <= 16, '名前は16文字以内です'); d.buddies[k].name = n.trim();
  } else if (kind === 'switch') {
    require(!playing, '試合終了後に切り替えてください'); const k = p.buddy; require(IDS.includes(k), '相棒を選んでください'); d.active = k; d.buddies[k].started = true; message = '相棒を切り替えました';
  } else if (kind === 'measure') {
    const typ = p.type; require(has(MEASURES, typ), 'チャレンジの種類を選んでください'); const t = MEASURES[typ], val = p.value;
    require(integer(val, 0, t.max), `記録は0～${t.max}${t.unit}で入力してください`); const date = datecheck(p.date);
    const before = measureFlags(d)[1], r = { id: uid(), date, type: typ, value: val }; d.measures.push(r); const [flags, after] = measureFlags(d), gain = after - before, flag = flags[r.id];
    const best = Math.max(...d.measures.filter(x => x.type === typ).map(x => x.value));
    if (flag === 'first') message = `はじめての記録！ ${t.name} ${val}${t.unit}`;
    else if (flag === 'pb') message = `自己ベスト更新！ ${t.name} ${val}${t.unit}`;
    else message = `記録したよ！ 自己ベストは${best}${t.unit}。あと${best - val + 1}${t.unit}で更新！`;
    if (flag) message += gain > 0 ? ` ／ SP＋${gain}` : ' ／ 今日のボーナスSPは受け取り済み';
    event = { type: 'record', flag: flag || null, gain };
  } else if (kind === 'unmeasure') {
    require(d.measures.some(r => r.id === p.id), '記録が見つかりません'); d.measures = d.measures.filter(r => r.id !== p.id); message = '記録を取り消しました。SPを再計算しました';
  } else if (kind === 'look') {
    const k = p.buddy, look = p.look ?? null; require(IDS.includes(k), '相棒を選んでください'); require(look === null || (integer(look, 1, stats(d, k).stage)), 'まだ解放されていない姿です');
    d.buddies[k].look = look; message = '見た目を変更しました';
  } else if (kind === 'settings') {
    require(has(p, 'cutin') || has(p, 'video_sort'), '設定が不正です');
    if (has(p, 'cutin')) { require(typeof p.cutin === 'boolean', '設定が不正です'); d.settings.cutin = p.cutin; message = '演出設定を保存しました'; }
    if (has(p, 'video_sort')) {
      const s = p.video_sort; require(isDict(s) && SORT_SCOPES.includes(s.scope) && validSort({ key: s.key, dir: s.dir }), '並び順が不正です');
      const sorts = sortMap(d.settings.video_sort); sorts[s.scope] = { key: s.key, dir: s.dir }; d.settings.video_sort = sorts; message = '並び順を保存しました';
    }
  } else if (kind === 'video') {
    const url = p.url, parsed = typeof url === 'string' && url.trim() ? parseVideo(url) : { kind: 'menu', youtube: '' }, video = parsed.youtube, media = parsed.kind, ident = p.id || uid();
    require(validId(ident), '動画IDが不正です'); const old = d.videos.find(v => v.id === ident) || null; require(!p.id || old !== null, '動画が見つかりません');
    require(media === 'menu' || !d.videos.some(v => v.youtube === video && (v.kind || 'video') === media && v.id !== ident), '登録済みです。非表示も確認してください');
    if (old) {
      const records = d.activities.filter(a => a.video === ident);
      require((old.youtube === video && (old.kind || 'video') === media) || old.kind === 'menu' || !records.length, '実績がある動画のURLは変更できません');
      require(media !== 'menu' || !records.some(a => a.type === 'watch'), '視聴記録がある動画は練習メニューに変更できません');
    }
    const title = p.title; require(typeof title === 'string', 'タイトルを入力してください');
    const v = { id: ident, youtube: video, kind: media, title: title.trim(), category: p.category, memo: has(p, 'memo') ? p.memo : '', hidden: old ? old.hidden : false };
    d.videos = old ? d.videos.map(x => x.id === ident ? v : x) : [...d.videos, v];
    if (!old && CATS.includes(v.category)) d.settings.video_category = v.category;
  } else if (kind === 'hide') {
    const v = d.videos.find(v => v.id === p.id); require(v !== undefined, '動画が見つかりません'); v.hidden = !v.hidden;
  } else if (kind === 'record') {
    const date = datecheck(p.date), typ = p.type; require(['watch', 'practice'].includes(typ), '実績の種類が不正です'); const video = p.video ?? null, v = d.videos.find(x => x.id === video) || null;
    require(video === null || v !== null, '動画が見つかりません'); require(v !== null || typ === 'practice', '動画を選んでください'); require(typ === 'practice' || v.kind !== 'menu', '練習メニューは「練習した」で記録してください');
    const cat = v ? v.category : p.category; require(CATS.includes(cat), 'カテゴリーを選んでください');
    require(!d.activities.some(a => a.date === date && a.type === typ && (a.video ?? null) === video && (video !== null || a.category === cat)), 'この日の実績は記録済みです。別の動画は記録できます');
    const k = d.active, before = stats(d, k).level, a = { id: uid(), date, type: typ, video, category: cat, buddy: k }; d.activities.push(a); const xp = xpValue(a); message = `記録したよ！ 経験値＋${xp} ／ SP＋${xp}`;
    if (stats(d, k).level > before) message += ' ／ レベルアップ！';
  } else if (kind === 'undo') {
    require(d.activities.some(a => a.id === p.id), '実績が見つかりません'); d.activities = d.activities.filter(a => a.id !== p.id); message = '経験値・SPを再計算しました。使用済みSP超過分は次の獲得分から精算します';
  } else if (kind === 'restore') {
    require(!playing, '試合終了後に復元してください'); const pw = d.coach.password; d = upgrade(p.data); d.coach.password = pw; m = null; message = 'データを復元しました';
  } else if (kind === 'manager_setup') {
    require(d.coach.password === null, 'パスワードは設定済みです'); d.coach.password = await newPassword(p.password); MANAGER.until = now() + MANAGER_SECONDS; message = 'パスワードを設定しました';
  } else if (kind === 'manager_unlock') {
    await checkPassword(d, p.password); MANAGER.until = now() + MANAGER_SECONDS; message = '家事の記録をひらきました（5分でロック）';
  } else if (kind === 'manager_lock') { MANAGER.until = 0; message = 'ロックしました'; }
  else if (kind === 'run_start') {
    const game = has(p, 'game') ? p.game : 'run'; require(has(RUN_GAMES, game), 'ゲームを選んでください');
    const n = p.stage, trial = p.trial === true; require(integer(n, 1, RUN_STAGES), 'ステージを選んでください');
    if (trial) { require(managerOpen(), 'ためし遊びはママのパスワードが必要です'); MANAGER.until = now() + MANAGER_SECONDS; }
    else {
      require(n <= d[game].unlocked, 'まだ遊べないステージです'); require(coach(d).gp.available >= RUN_COST, `${RUN_GAMES[game]}にはGP${RUN_COST}が必要です`);
      d.coach.gp_spent += RUN_COST; d[game].plays++;
    }
    Object.assign(RUN_PLAY, { id: uid(), stage: n, t: now(), trial, game }); message = ''; event = { type: 'run', id: RUN_PLAY.id, stage: n, trial };
  } else if (kind === 'run_finish') {
    require(RUN_PLAY.id !== null && p.id === RUN_PLAY.id, 'このプレイは終わっています'); const n = RUN_PLAY.stage; RUN_PLAY.id = null;
    const cleared = p.cleared, score = p.score, stars = p.stars; require(typeof cleared === 'boolean' && integer(score, 0, RUN_MAX_SCORE) && integer(stars, 0, 3) && (stars > 0) === cleared, '結果が不正です');
    require(!cleared || now() - RUN_PLAY.t >= 8, '結果が不正です');
    if (RUN_PLAY.trial) return { message: '', event: { type: 'run_result', trial: true, stage: n, cleared, score, stars, record: false, unlocked: null } };
    const rec = d[RUN_PLAY.game], old = rec.best[String(n)] || { score: 0, stars: 0 }, nw = { score: Math.max(old.score, score), stars: Math.max(old.stars, stars) };
    if (cleared || has(rec.best, String(n))) rec.best[String(n)] = nw;
    const unlocked = cleared && n === rec.unlocked && n < RUN_STAGES;
    if (unlocked) rec.unlocked = n + 1;
    message = ''; event = { type: 'run_result', stage: n, cleared, score, stars, record: score > old.score && cleared, unlocked: unlocked ? n + 1 : null };
  } else if (kind === 'request') {
    const key = p.chore; require(has(CHORES, key), '家事を選んでください'); const co = coach(d);
    require(co.requests_today < REQUESTS_PER_DAY, `おねがいは1日${REQUESTS_PER_DAY}回までだよ`);
    require(!co.requests.some(r => r.status === 'open' && r.chore === key), 'その家事はもうおねがい中だよ');
    d.coach.requests.push({ id: uid(), date: today(), chore: key }); message = `パパに「${CHORES[key].name}」をおねがいしたよ！`;
  } else if (kind === 'request_cancel') {
    const r = coach(d).requests.find(r => r.id === p.id); require(r !== undefined && r.status === 'open', '取り消せるおねがいが見つかりません');
    d.coach.requests = d.coach.requests.filter(x => x.id !== r.id); message = 'おねがいを取り消しました';
  } else if (['chore', 'chore_undo', 'manager_password'].includes(kind)) {
    require(managerOpen(), 'ロックされています。パスワードを入力してください'); MANAGER.until = now() + MANAGER_SECONDS;
    if (kind === 'chore') {
      const key = p.chore; require(has(CHORES, key), '家事を選んでください'); const date = datecheck(p.date);
      const before = coach(d); d.coach.chores.push({ id: uid(), date, chore: key }); const after = coach(d), t = CHORES[key];
      message = `${t.name}を記録しました。GP＋${t.gp} ／ ` + (after.total > before.total ? `運動量＋${after.total - before.total}` : `この日の運動量は上限（${COACH_DAILY_CAP}）です`);
      if (after.gp.requests > before.gp.requests) message += ` ／ おねがい達成！ GP＋${REQUEST_GP}`;
      if (after.gp.badges > before.gp.badges) message += ` ／ バッジ獲得！ GP＋${after.gp.badges - before.gp.badges}`;
    } else if (kind === 'chore_undo') {
      require(d.coach.chores.some(r => r.id === p.id), '記録が見つかりません'); d.coach.chores = d.coach.chores.filter(r => r.id !== p.id); message = '家事の記録を取り消しました';
    } else { await checkPassword(d, p.old); d.coach.password = await newPassword(p.new); message = 'パスワードを変更しました'; }
  } else if (kind === 'gacha') {
    const pick = has(p, 'pick') ? p.pick : 'random'; require([...Object.keys(SLOTS), 'tool', 'random'].includes(pick), 'ガチャの種類を選んでください'); const count = has(p, 'count') ? p.count : 1; require(count === 1 || count === MULTI_COUNT, '回数が不正です');
    const cost = GACHA_COST * count; require(economy(d).available >= cost, `${count > 1 ? '10連' : ''}ガチャにはSP${cost}が必要です`); const g = d.game, tiers = GEAR_TIERS.map((_, i) => i + 1), results = [];
    for (let n = 0; n < count; n++) {
      let tier;
      if (count > 1 && n === count - 1 && pick !== 'tool') tier = choices(tiers.slice(MULTI_MIN_TIER - 1), GACHA_WEIGHTS.slice(MULTI_MIN_TIER - 1));
      else tier = has(SLOTS, pick) ? choices(tiers, GACHA_WEIGHTS) : pick === 'tool' ? 0 : choices([...tiers, 0], [...GACHA_WEIGHTS.map(w => w * (100 - GACHA_TOOL_RATE) / 100), GACHA_TOOL_RATE]);
      let key, isnew, reward;
      if (tier) { key = `${has(SLOTS, pick) ? pick : choice(Object.keys(SLOTS))}_${tier}`; isnew = !g.gear.some(i => i.key === key); g.gear.push({ id: uid(), key }); reward = GEAR[key]; }
      else { key = choice(Object.keys(TOOLS)); isnew = g.tools[key] === 0; g.tools[key]++; reward = TOOLS[key]; }
      g.gacha_log.unshift({ date: today(), key, new: isnew }); results.push({ key, new: isnew, name: reward.name, image: reward.image });
    }
    g.sp_spent += cost; g.choice_draws = (g.choice_draws || 0) + count; g.gacha_log = g.gacha_log.slice(0, 50); message = '';
    event = count === 1 ? { type: 'gacha', ...results[0] } : { type: 'gacha_multi', results, pick };
  } else if (kind === 'equip') {
    require(!playing, '試合中は装備変更できません'); const k = p.buddy, slot = p.slot, ident = p.id ?? null; require(IDS.includes(k) && has(SLOTS, slot), '装備欄が不正です');
    if (ident !== null) {
      const item = d.game.gear.find(i => i.id === ident); require(item !== undefined && GEAR[item.key].slot === slot, '装備が見つかりません');
      require(!Object.entries(d.buddies).some(([other, b]) => other !== k && b.equipment[slot] === ident), '別の相棒が装備中です。先に外してください');
    }
    d.buddies[k].equipment[slot] = ident; message = '装備を変更しました';
  } else if (kind === 'exchange') {
    require(!playing, '試合中は交換できません'); const ids = p.ids; require(Array.isArray(ids) && ids.length && ids.every(x => typeof x === 'string') && new Set(ids).size === ids.length, '交換する装備を選んでください');
    const g = d.game, items = Object.fromEntries(g.gear.map(i => [i.id, i])), worn = new Set(Object.values(d.buddies).flatMap(b => Object.values(b.equipment)).filter(Boolean));
    require(ids.every(x => has(items, x)), '装備が見つかりません'); require(!ids.some(x => worn.has(x)), '装備中のものは交換できません。先に外してください');
    const gained = sum(ids.map(x => GEAR[items[x].key].tier)), drop = new Set(ids); g.gear = g.gear.filter(i => !drop.has(i.id)); g.exchanged = (g.exchanged || 0) + gained; message = `${ids.length}個の装備を交換しました。SP＋${gained}`;
  } else if (kind === 'start') {
    require(!playing, 'すでに試合中です'); const e = p.enemy; require(integer(e, 0, 3), '相手を選んでください'); const team = [];
    const co = coach(d); require(co.battles.left > 0, `今日の対戦は${co.battles.limit}回まで。また明日あそぼう！`);
    d.coach.battles = { date: today(), count: co.battles.used + 1 };
    for (const [i, k] of IDS.entries()) {
      const s = stats(d, k); let v = { ...s.values };
      if (co.effects.stamina) v.stamina += 2;
      if (co.effects.all) v = Object.fromEntries(Object.entries(v).map(([x, n]) => [x, n + 2]));
      team.push({ id: k, name: d.buddies[k].name || LABELS[i], values: v, stage: s.stage, skills: s.skills });
    }
    const logs = ['試合開始！ 10点先取。行動を選ぼう！'], fx = [[co.effects.stamina, '基礎体力＋2'], [co.effects.all, '全能力＋2'], [co.effects.timeout, 'タイムアウト1回']].filter(([on]) => on).map(([, t]) => t);
    if (fx.length) logs.push(`${co.name}の作戦：${fx.join('・')}`);
    m = { id: uid(), enemy: e, team, opponents: enemyTeam(e), round: 0, score: [0, 0], done: false, skill_used: Object.fromEntries(IDS.map(k => [k, 0])), timeout: co.effects.timeout, timeout_used: false, logs }; resetAttack(m); message = '試合開始！';
  } else if (kind === 'cancel') { m = null; message = '試合を中止しました。使用した道具は戻りません'; }
  else if (kind === 'battle') {
    require(playing, '進行中の試合がありません'); const move = p.move; require(['dribble', 'pass', 'shoot', 'tool', 'skill', 'timeout'].includes(move), '行動を選んでください');
    if (move === 'timeout') {
      require(m.timeout && !m.timeout_used, 'タイムアウトは使えません'); m.timeout_used = true; m.guard_bonus += 15; log(m, '監督のタイムアウト！ 作戦を立て直した。次のCPUのシュート成功率－15ポイント。'); message = '';
    } else if (move === 'tool') {
      require(!m.tool_used, '道具は1攻撃1個まで'); const key = p.tool; require(has(TOOLS, key) && d.game.tools[key] > 0, 'その道具を持っていません'); d.game.tools[key]--; const t = TOOLS[key]; m[t.effect] += t.amount; m.tool_used = true; log(m, `道具：${t.name}（100%）。${t.description}。`); message = '';
    } else if (move === 'skill') {
      const key = p.skill, option = skillOptions(m).find(s => s.key === key); require(option !== undefined, '技を選んでください'); require(!option.reason, option.reason); const actor = m.team[m.holder]; m.skill_used[actor.id]++; const rank = option.rank; log(m, `${actor.name}の技『${option.name}』${'★'.repeat(rank)}！`);
      event = { type: 'cutin', buddy: actor.id, name: actor.name, skill: option.name, rank, stage: actor.stage, image: `cutin_${actor.id}${stats(d, actor.id).look}.png` };
      if (option.kind === 'support') {
        m.support_used = true;
        if (key === 'stamina') m.setup_bonus += 10 + 5 * (rank - 1);
        else if (key === 'defense') m.skill_guard += 10 + 5 * (rank - 1);
        else if (key === 'pivot') { m.keep = true; m.setup_bonus += 5 * (rank - 1); }
        log(m, '補助技発動（100%）。' + option.effect);
      } else resolveMove(m, d, option.kind, option.probability);
      message = '';
    } else {
      require(move === 'shoot' || m.prep < 2, '準備は2回までです。シュートを選んでください'); resolveMove(m, d, move, probabilities(m)[move]); message = '';
    }
    if (m.logs.length > 450) m.logs = [...m.logs.slice(0, 1), ...m.logs.slice(-400)];
  } else throw new UserError('操作が不正です');
  validate(d); await save(d); STATE = d; MATCH = m;
  return { message, event };
}

window.MinibasCore = {
  UserError, today, fresh, upgrade, validate, view, action,
  get state() { return STATE; },
  // 読み込み：保存データがあれば形式を確かめて使い、なければ新しく作る
  async load(stored, save) {
    if (stored != null) { const s = upgrade(stored); if (JSON.stringify(s) !== JSON.stringify(stored)) await save(s); STATE = s; }
    else { const s = fresh(); await save(s); STATE = s; }
  },
};
})();
