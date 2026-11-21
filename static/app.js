// Minibas v3 — screens for the redesigned UI (PC only, operated by a child).
// Shared state and helpers (S, act, modal, esc, image, name, tab, date, ...) come from legacy.js.
'use strict';

let practiceTab = 'videos', playTab = 'match', recordTab = 'calendar';
let buddyView = null, showAllTeam = false, playerId = null;
let undoTimer = null, undoAction = null, rewardTimer = null;

const SKILL_STEPS = [3, 7, 15];
const label = k => kinds.find(x => x[0] === k)[1];
const isMatchPlaying = () => !!(S.match && !S.match.done);
const ytThumb = v => v.kind === 'video' || !v.kind ? `https://i.ytimg.com/vi/${encodeURIComponent(v.youtube)}/mqdefault.jpg` : '';
const ytHref = v => v.kind === 'playlist' ? 'https://www.youtube.com/playlist?list=' + encodeURIComponent(v.youtube) : 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.youtube);
const ytEmbed = v => v.kind === 'playlist' ? 'https://www.youtube.com/embed/videoseries?list=' + encodeURIComponent(v.youtube) : 'https://www.youtube.com/embed/' + encodeURIComponent(v.youtube);
const recordedOn = (videoId, type) => S.data.activities.some(a => a.video === videoId && a.type === type && a.date === date);
const practiceDays = videoId => new Set(S.data.activities.filter(a => a.video === videoId && a.type === 'practice').map(a => a.date)).size;
const jpDate = ds => `${Number(ds.slice(5, 7))}月${Number(ds.slice(8))}日（${'日月火水木金土'[new Date(ds + 'T00:00').getDay()]}）`;

/* ================= Shell ================= */
function render() {
  if (OP.audio && !$('dialog').open) opStop();
  document.body.classList.toggle('battle-mode', tab === 'play' && playTab === 'match' && !!S.match);
  document.querySelectorAll('.side [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  hud();
  ({ home, practice, buddy, play, gacha, record, settings, manager })[tab]();
}
function goTab(to, sub) {
  if (busy) return;
  tab = to;
  if (to === 'play' && sub) playTab = sub;
  if (to === 'practice' && sub) practiceTab = sub;
  render();
  window.scrollTo({ top: 0 });
}
function hud() {
  const k = S.data.active, s = S.stats[k], e = S.economy;
  if (!$('hudBar') || $('hud').dataset.buddy !== k) {
    $('hud').dataset.buddy = k;
    $('hud').innerHTML = `<div class="hud">
      <img class="face ${k}" id="hudFace" alt="">
      <div class="who"><b id="hudName"></b><small>${label(k)}・育成中</small></div>
      <div class="xp"><span class="lv" id="hudLv"></span><div class="xpbar"><div id="hudBar"></div></div><small id="hudNext"></small></div>
      <div class="grow"></div>
      <button class="hudcoach" id="hudCoach" title="監督（パパ）の今週の運動量"><img id="hudCoachImg" alt=""><span id="hudCoachTxt"></span></button>
      <button class="pill" id="hudGp" title="GPはゲームで使うよ"></button>
      <button class="pill" id="hudSp" title="SPはガチャで使うよ"></button>
      <button class="primary gachabtn" id="hudGacha">🎁 ガチャ</button></div>`;
    $('hudGacha').onclick = () => goTab('gacha');
    $('hudCoach').onclick = () => goTab('manager');
    $('hudGp').onclick = () => goTab('play');
    $('hudSp').onclick = () => goTab('gacha');
  }
  const c = S.coach, q = S.catalog.coach_quota;
  $('hudCoachImg').src = coachImg(c.look);
  $('hudCoachTxt').innerHTML = `パパの運動 今週 <b>${Math.min(c.this_week, q)}/${q}</b>`;
  $('hudCoach').classList.toggle('warn', c.rebound);
  $('hudCoach').classList.toggle('ok', c.this_week >= q);
  $('hudGp').textContent = `🪙 GP ${c.gp.available}`;
  $('hudFace').src = image(k);
  $('hudName').textContent = name(k);
  $('hudLv').textContent = 'Lv.' + s.level;
  $('hudBar').style.width = (s.xp % 20) * 5 + '%';
  $('hudNext').textContent = `次まで ${20 - s.xp % 20}`;
  $('hudSp').textContent = `💎 SP ${e.available}`;
}
function seg(attr, current, items) {
  return `<div class="seg">${items.map(([k, l]) => `<button data-${attr}="${k}" class="${k === current ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
const practiceTabs = () => seg('prtab', practiceTab, [['videos', '📺 動画'], ['challenge', '📏 チャレンジ']]);
// Big cards instead of a small segmented control, so the mini games are easy to notice.
function playTabs() {
  const b = S.coach.battles, cost = S.catalog.run_cost, gp = S.coach.gp.available;
  const games = [
    ['match', '⚔️', '3on3対戦', 'ライバルチームと試合', b.left ? `今日あと${b.left}回・勝つとGP` : '今日はおしまい'],
    ['run', '🏃', 'ドリブルラン', 'じゃまをかわしてゴールへ', `1回 ${cost}GP`],
    ['shoot', '🏀', 'シュートラッシュ', 'ねらってシュート連発', `1回 ${cost}GP`]];
  return `<div class="gamepick">${games.map(([k, i, t, d, n]) => `<button data-pltab="${k}" class="${k === playTab ? 'on' : ''}">
    <i>${i}</i><span><b>${t}</b><small>${d}</small><em class="${k !== 'match' && gp < cost ? 'short' : ''}">${n}</em></span></button>`).join('')}</div>`;
}
const recordTabs = () => seg('rtab', recordTab, [['calendar', '📅 カレンダー'], ['activities', '📝 練習・視聴'], ['matches', '🏆 試合']]);

/* ================= Rewards and quick undo ================= */
// Called by act() after every successful action. Returning true suppresses the plain toast.
function onActed(action, before, next) {
  if (action === 'record') {
    const known = new Set(before.data.activities.map(a => a.id));
    const added = next.data.activities.find(a => !known.has(a.id));
    if (!added) return false;
    const k = added.buddy, b = before.stats[k], n = next.stats[k], xp = added.type === 'watch' ? 1 : 5;
    const skillUps = Object.keys(n.skills).filter(s => n.skills[s] > b.skills[s]);
    // Big moments get a full-screen effect (evolution first, then each new/upgraded skill); the rest a small popup.
    if (n.stage > b.stage) celebrate(() => evolutionFx(k, b.stage, n.stage, n.level));
    else if (n.level > b.level) {
      reward(image(k), 'レベルアップ！', `${name(k)}が Lv.${n.level} になった！`, true);
      if (!reduceMotion.matches) confetti();
    } else if (!skillUps.length) reward(image(k), `＋${xp}`, '経験値とSPをゲット！');
    for (const s of skillUps) celebrate(() => skillFx(k, s, n.skills[s]));
    celebrate(() => offerUndo(`${added.type === 'watch' ? '視聴' : '練習'}を記録しました`, () => act('undo', { id: added.id })));
    if (playerId && $('playerActs')) playerButtons();
    return true;
  }
  if (action === 'measure') {
    const known = new Set(before.data.measures.map(r => r.id));
    const added = next.data.measures.find(r => !known.has(r.id));
    if (added) offerUndo('チャレンジを記録しました', () => act('unmeasure', { id: added.id }));
    return false;
  }
  if (action === 'settings' && JSON.stringify(next.data.settings.video_sort) !== JSON.stringify(before.data.settings.video_sort)) return true;
  if (action === 'chore') {
    const known = new Set(before.data.coach.chores.map(r => r.id));
    const added = next.data.coach.chores.find(r => !known.has(r.id));
    if (!added) return false;
    const b = before.coach, n = next.coach, t = S.catalog.chores[added.chore];
    if (n.stage > b.stage) celebrate(() => coachFx(b.look, n.look, `監督が「${n.name}」に進化した！`, S.catalog.coach_stages[n.stage - 1].effect));
    else if (b.rebound && !n.rebound) celebrate(() => coachFx(b.look, n.look, 'リバウンドから復活！', '監督の効果がもどったよ'));
    else if (n.level > b.level) reward(coachImg(n.look), `監督 Lv.${n.level}`, `${t.name}で運動したよ！`, true);
    else if (n.gp.requests > b.gp.requests) reward(coachImg(n.look), `GP＋${t.gp + S.catalog.request_gp}`, `おねがい達成！ ${t.name}をやってくれた！`, true);
    else reward(coachImg(n.look), `GP＋${t.gp}`, n.total > b.total ? `${t.name} ／ 運動量＋1` : `${t.name} ／ 今日の運動量は上限`);
    n.badges.forEach((x, i) => { if (x.earned && !b.badges[i].earned) celebrate(() => badgeFx(x)); });
    celebrate(() => offerUndo(`${t.name}を記録しました`, () => act('chore_undo', { id: added.id })));
    return true;
  }
  if (action === 'request') { reward(coachImg(next.coach.look), '🙏', next.message); return true; }
  if (action === 'chore_undo') { hideUndo(); tell('取り消しました'); return true; }
  if (action === 'undo' || action === 'unmeasure') {
    hideUndo();
    tell('取り消しました');
    return true;
  }
  return false;
}
function reward(img, amount, msg, big = false) {
  const el = $('reward');
  $('rewardImg').src = img;
  $('rewardAmt').textContent = amount;
  $('rewardMsg').textContent = msg;
  el.classList.toggle('levelup', big);
  el.classList.add('on');
  clearTimeout(rewardTimer);
  rewardTimer = setTimeout(() => el.classList.remove('on'), big ? 2200 : 1200);
}
function offerUndo(msg, fn) {
  $('undoMsg').textContent = msg;
  undoAction = fn;
  $('undo').classList.add('on');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, 8000);
}
function hideUndo() { $('undo').classList.remove('on'); undoAction = null; }

/* ================= Home ================= */
function nextGoals(k) {
  const s = S.stats[k], goals = [];
  for (const [key, t] of Object.entries(S.catalog.skills)) {
    const days = s.counts[t.category], step = SKILL_STEPS.find(x => x > days);
    if (step === undefined) continue;
    const prev = SKILL_STEPS[SKILL_STEPS.indexOf(step) - 1] || 0, rank = s.skills[key] + 1;
    goals.push({ name: `${t.name} ${'★'.repeat(rank)}`, skill: t.name, rank, cat: t.category, left: step - days, now: days, need: step, pct: (days - prev) / (step - prev) * 100 });
  }
  return goals.sort((a, b) => a.left - b.left || b.pct - a.pct);
}
function bubbleText(k) {
  const did = S.data.activities.some(a => a.date === today() && a.type === 'practice' && a.buddy === k);
  const g = nextGoals(k)[0];
  const head = did ? '今日も練習したね！ すごい！' : '今日も一緒にがんばろう！';
  if (!g) return [head, 'ぜんぶの技が★★★！ 最強だね！'];
  return [head, `あと${g.left}日${g.cat}を練習すると「${g.skill}」が${g.rank === 1 ? '使えるようになる' : '★' + g.rank + 'になる'}よ`];
}
function recentVideos(n) {
  const last = {};
  for (const a of S.data.activities) if (a.video && (!last[a.video] || a.date > last[a.video])) last[a.video] = a.date;
  const vs = S.data.videos.filter(v => !v.hidden);
  const used = vs.filter(v => last[v.id]).sort((a, b) => last[b.id].localeCompare(last[a.id]));
  const fresh = vs.filter(v => !last[v.id]).reverse();
  return [...used, ...fresh].slice(0, n);
}
function thumbHTML(v) {
  if (v.kind === 'menu') return '📝';
  if (v.kind === 'playlist') return '🎞️';
  return `<img src="${ytThumb(v)}" alt="" loading="lazy" onerror="this.replaceWith('🎬')">`;
}
function recordButtons(v) {
  const w = recordedOn(v.id, 'watch'), p = recordedOn(v.id, 'practice');
  const watch = v.kind === 'menu' ? '<span></span>' : `<button class="${w ? 'done' : 'watch'}" data-rec="watch" data-video="${v.id}" ${w ? 'disabled' : ''}>${w ? '✓ 見た' : '見た！ ＋1'}</button>`;
  // SUN's videos are the team's own game records: watching them counts, "practiced" does not apply.
  if (isTeamVideo(v)) return watch + '<span></span>';
  const prac = `<button class="${p ? 'done' : 'primary'}" data-rec="practice" data-video="${v.id}" ${p ? 'disabled' : ''}>${p ? '✓ 練習した' : '練習した！ ＋5'}</button>`;
  return watch + prac;
}
const isTeamVideo = v => v.category === "SUN's";
const watchCount = id => S.data.activities.filter(a => a.video === id && a.type === 'watch').length;
function home() {
  const d = S.data, k = d.active, s = S.stats[k], [say, hint] = bubbleText(k);
  const worn = Object.values(d.buddies[k].equipment).filter(Boolean).length;
  const quick = recentVideos(4);
  $('content').innerHTML = `
  <div class="homegrid">
    <div class="hero ${k}">
      <div class="switcher">${kinds.map(([b, l]) => `<button class="${b === k ? 'on' : ''}" data-switch="${b}" title="${esc(name(b))}（${l}）" ${isMatchPlaying() ? 'disabled' : ''}><img src="${image(b)}" alt="${l}"></button>`).join('')}</div>
      <div class="bubble">${esc(say)}<span class="muted">${esc(hint)}</span></div>
      <div class="duo"><img class="big-img" src="${image(k)}" alt="${esc(name(k))}">${coachMini()}</div>
      <div class="nm">${esc(name(k))}<small>${label(k)} ・ ${s.stage === 1 ? '進化前' : s.stage - 1 + '回進化'}</small></div>
      <div class="hstats"><div><b>${s.days}日</b>練習</div><div><b>${s.stage}回</b>技／試合</div><div><b>${worn}個</b>装備</div></div>
    </div>
    <section class="card today">
      <h2>✏️ 今日の練習 <span class="date">記録する日 ${datebox()}</span></h2>
      <p class="muted" style="margin:-6px 0 6px">最近の動画から、ボタン1つで記録できます</p>
      ${quick.map(v => `<div class="qrow"><button class="qthumb" data-play="${v.id}" title="再生">${thumbHTML(v)}</button><div class="t"><b title="${esc(v.title)}">${esc(v.title)}</b><span class="tag">${esc(v.category)}</span> <span class="muted">練習 ${practiceDays(v.id)}日</span></div>${recordButtons(v)}</div>`).join('') || '<p class="empty">「練習」から動画を見てみよう！</p>'}
      <div class="nomovie">
        <b>🏃 動画なしで練習した</b>
        <div class="chips">${cats.map(c => `<button class="chip ${c === category ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <button class="primary go" id="practiceNoVideo">${esc(category)}を練習した！ ＋5</button>
      </div>
    </section>
  </div>
  <div class="row3">
    ${weekCard()}
    <section class="card"><h2>🎯 次の目標</h2><div class="goal">${goalList(k)}</div></section>
    <section class="card"><h2>📊 能力 <small>装備こみ</small></h2><div class="radar">${radar(s.values)}</div></section>
  </div>`;
  wiredate();
  $('date').onchange = e => { date = e.target.value || today(); home(); };
  $('practiceNoVideo').onclick = () => act('record', { type: 'practice', video: null, category, date });
  document.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { category = b.dataset.cat; home(); });
  $('coachMini').onclick = () => goTab('manager');
}
function coachMini() {
  const c = S.coach, q = S.catalog.coach_quota;
  const ask = c.requests.find(r => r.status === 'open');
  const say = c.rebound ? 'パパ、うんどうして…' : ask ? `🙏 ${S.catalog.chores[ask.chore].name}まだ？` : c.this_week >= q ? `今週達成！${c.streak.current > 1 ? ` ${c.streak.current}週れんぞく` : ''}` : `今週 ${c.this_week}/${q}`;
  return `<button class="coachmini ${c.rebound ? 'warn' : ''}" id="coachMini" title="監督（パパ）"><span class="say">${esc(say)}</span><img src="${coachImg(c.look)}" alt="監督"><small>監督 Lv.${c.level}</small></button>`;
}
function goalList(k) {
  const s = S.stats[k], out = nextGoals(k).slice(0, 2).map(g =>
    `<div class="g"><b>${esc(g.name)}</b><span class="muted">${esc(g.cat)} ${g.now}/${g.need}日</span><div class="gbar"><div style="width:${g.pct}%"></div></div></div>`);
  if (s.stage < 3) {
    const target = s.stage === 1 ? 5 : 10, from = s.stage === 1 ? 0 : 80, need = (target - 1) * 20;
    out.push(`<div class="g"><b>${s.stage === 1 ? '1回目の進化' : '2回目の進化'}（Lv.${target}）</b><span class="muted">Lv.${s.level}</span><div class="gbar"><div style="width:${Math.min(100, (s.xp - from) / (need - from) * 100)}%"></div></div></div>`);
  }
  return out.join('') || '<p class="muted">ぜんぶ達成！</p>';
}
function weekCard() {
  const now = new Date(today() + 'T00:00'), mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() + 6) % 7);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return iso(d); });
  const lastMon = new Date(mon); lastMon.setDate(mon.getDate() - 7);
  const practiced = ds => S.data.activities.filter(a => a.date === ds && a.type === 'practice');
  let thisWeek = 0, lastWeek = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(lastMon); d.setDate(lastMon.getDate() + i); if (practiced(iso(d)).length) lastWeek++; }
  const cells = days.map((ds, i) => {
    const p = practiced(ds), w = S.data.activities.some(a => a.date === ds && a.type === 'watch');
    if (p.length) thisWeek++;
    return `<div>${'月火水木金土日'[i]}<div class="d ${p.length ? 'st-' + p[0].buddy : ''} ${ds === today() ? 'today' : ''} ${ds > today() ? 'future' : ''}">${p.length ? `<img src="${image(p[0].buddy)}" alt="">` : ''}${w ? '<span class="w">👀</span>' : ''}</div></div>`;
  }).join('');
  const diff = thisWeek - lastWeek;
  return `<section class="card"><h2>🗓️ 今週 <small>くわしくは「記録」</small></h2><div class="week">${cells}</div>
    <p class="weekmsg">今週 <b>${thisWeek}</b> 日練習！ <span class="muted">${diff > 0 ? `先週より＋${diff}日` : thisWeek ? '' : 'まずは1日目から！'}</span></p></section>`;
}
function radar(v) {
  const keys = Object.keys(S.catalog.stats), L = keys.map(x => S.catalog.stats[x]), V = keys.map(x => v[x]);
  const M = Math.max(60, Math.ceil(Math.max(...V) / 10) * 10), c = 120, R = 80;
  const pt = (i, r) => [c + r * Math.sin(i * Math.PI / 3), c - r * Math.cos(i * Math.PI / 3)].map(n => n.toFixed(1));
  let s = `<svg viewBox="0 0 240 240" role="img" aria-label="能力のグラフ">`;
  for (const f of [1, .66, .33]) s += `<polygon points="${L.map((_, i) => pt(i, R * f).join(',')).join(' ')}" fill="${f === 1 ? '#fbf5ee' : 'none'}" stroke="#eadfce"/>`;
  s += `<polygon points="${V.map((x, i) => pt(i, R * x / M).join(',')).join(' ')}" fill="#f07a3644" stroke="#f07a36" stroke-width="2.5" stroke-linejoin="round"/>`;
  L.forEach((l, i) => { const [x, y] = pt(i, R + 24); s += `<text x="${x}" y="${y - 2}" text-anchor="middle" font-size="11" fill="#7a8496">${l}</text><text x="${x}" y="${+y + 12}" text-anchor="middle" font-size="13" font-weight="900" fill="#2f3b52">${V[i]}</text>`; });
  return s + '</svg>';
}

/* ================= Practice: videos ================= */
function teamMatch(v) {
  const t = v.title.replace(/\s+/g, ' ');
  const dm = t.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
  const rest = dm ? t.slice(dm.index + dm[0].length).trim() : t;
  const score = /(\d+)\s*[-−ー－]+\s*(\d+)/.source;
  let sm = rest.match(new RegExp('vs\\.?\\s*(.+?)\\s*' + score, 'i')), what = '';
  if (sm) what = rest.slice(0, sm.index).replace(/SUN.?s\s*$/i, '').trim();
  else if ((sm = rest.match(new RegExp('^(.*?)\\s*' + score)))) {
    // "練習試合④グローリアス 49-25": the label and the opponent are written together.
    const lm = sm[1].match(/^((?:練習試合|公式戦|交流戦)[①-⑳➀-➉]?)\s*(.+)$/);
    if (lm) { what = lm[1]; sm = [sm[0], lm[2], sm[2], sm[3]]; } else sm = null;
  }
  const sub = sm && rest.match(/[（(]([^)）]*)[)）]\s*$/);
  const key = dm ? `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}` : '';
  return { key, date: dm ? `${dm[1]}.${dm[2]}.${dm[3]}` : '', what, rest, opp: sm && sm[1].trim(), us: sm && +sm[2], them: sm && +sm[3], sub: sub ? sub[1] : '' };
}
function practice() {
  if (practiceTab === 'challenge') return challenge();
  const counts = c => S.data.videos.filter(v => !v.hidden && v.category === c).length;
  $('content').innerHTML = practiceTabs() + `
  <div class="tools">
    <input class="search" id="search" placeholder="🔍 動画をさがす" value="${esc(query)}">
    <span class="date muted">記録する日 ${datebox()}</span>
    <span class="sortbox muted">並び順
      <select id="sortKey">${Object.entries(SORTS).map(([k, s]) => `<option value="${k}" ${k === videoSort().key ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      <button id="sortDir" title="昇順・降順を切り替え">${sortDirLabel()}</button></span>
    <button class="primary" id="add" style="margin-left:auto">＋ 動画・練習メニューを追加</button>
  </div>
  <div class="chips" style="margin:-6px 0 18px">${['すべて', ...cats].map(c => `<button class="chip ${c === filter ? 'on' : ''}" data-filter="${esc(c)}">${esc(c)}<em>${c === 'すべて' ? S.data.videos.filter(v => !v.hidden).length : counts(c)}</em></button>`).join('')}<button class="chip ${filter === '非表示' ? 'on' : ''}" data-filter="非表示">非表示</button></div>
  <div id="vlist"></div>`;
  wiredate();
  $('date').onchange = e => { date = e.target.value || today(); practice(); };
  $('search').oninput = e => { query = e.target.value; videoList(); };
  $('add').onclick = () => edit();
  $('sortKey').onchange = e => saveSort({ key: e.target.value, dir: SORTS[e.target.value].dir });
  $('sortDir').onclick = () => { const s = videoSort(); saveSort({ key: s.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }); };
  document.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { filter = b.dataset.filter; practice(); });
  videoList();
}
function videoList() {
  const q = query.toLowerCase();
  const visible = S.data.videos.filter(v => filter === '非表示' ? v.hidden : !v.hidden);
  const list = visible.filter(v => (filter === 'すべて' || filter === '非表示' || v.category === filter) && `${v.title} ${v.memo}`.toLowerCase().includes(q));
  const sorted = sortVideos(list), how = `${SORTS[videoSort().key].label}・${sortDirLabel()}`;
  const team = sorted.filter(isTeamVideo).map(v => ({ v, m: teamMatch(v) }));
  const drills = sorted.filter(v => !isTeamVideo(v));
  const shownTeam = showAllTeam || q ? team : team.slice(0, 9);
  $('vlist').innerHTML = `
  ${drills.length ? `<div class="sec">🏀 練習動画 <small>${drills.length}本 ・ ${how}</small></div><div class="vgrid">${drills.map(videoCard).join('')}</div>` : ''}
  ${team.length ? `<div class="sec">🌞 SUN'sの試合・練習 <small>${team.length}本 ・ ${how}</small></div><div class="plgrid">${shownTeam.map(({ v, m }) => teamCard(v, m)).join('')}</div>${shownTeam.length < team.length ? `<button class="more" id="more">もっと見る（あと${team.length - shownTeam.length}本）</button>` : ''}` : ''}
  ${!drills.length && !team.length ? `<div class="card empty">${S.data.videos.length ? '見つかりませんでした' : '「＋ 動画・練習メニューを追加」から、好きなYouTube動画や練習メニューを追加しよう！'}</div>` : ''}`;
  if ($('more')) $('more').onclick = () => { showAllTeam = true; videoList(); };
}
// Sort order is saved per category tab in data/minibas.json (settings.video_sort), so it survives restarts and backups.
// "Views" / "practiced" count the 見た / 練習した records made in this app (YouTube's own counts are not available offline).
const SORTS = {
  added: { label: '登録順', dir: 'desc', names: { asc: '古い順', desc: '新しい順' } },
  title: { label: 'タイトル順', dir: 'asc', names: { asc: '昇順（0→9・A→Z・あ→ん）', desc: '降順（ん→あ・Z→A・9→0）' } },
  views: { label: '再生回数順（見た回数）', dir: 'desc', names: { asc: '少ない順', desc: '多い順' } },
  practice: { label: '練習した回数順', dir: 'desc', names: { asc: '少ない順', desc: '多い順' } },
};
function sortMap() {
  const m = S.data.settings.video_sort;
  return m && typeof m.key === 'string' ? { 'すべて': m } : (m || {});   // the first format kept one order for everything
}
function videoSort() {
  const s = sortMap()[filter];
  return s && SORTS[s.key] && ['asc', 'desc'].includes(s.dir) ? s : { key: 'added', dir: 'desc' };
}
const sortDirLabel = () => { const s = videoSort(); return (s.dir === 'asc' ? '▲ ' : '▼ ') + SORTS[s.key].names[s.dir]; };
function saveSort(s) { showAllTeam = false; act('settings', { video_sort: { scope: filter, ...s } }); }
function sortVideos(list) {
  const { key, dir } = videoSort(), order = new Map(S.data.videos.map((v, i) => [v.id, i]));
  const byAdded = (a, b) => order.get(a.id) - order.get(b.id);
  const cmp = key === 'title' ? (a, b) => a.title.localeCompare(b.title, 'ja', { numeric: true, sensitivity: 'base' }) || byAdded(a, b)
    : key === 'views' ? (a, b) => watchCount(a.id) - watchCount(b.id) || byAdded(a, b)
    : key === 'practice' ? (a, b) => practiceDays(a.id) - practiceDays(b.id) || byAdded(a, b)
    : byAdded;
  return [...list].sort((a, b) => dir === 'asc' ? cmp(a, b) : cmp(b, a));
}
function adminButtons(v) {
  return `<div class="acts admin"><button data-edit="${v.id}">編集</button><button data-hide="${v.id}">${v.hidden ? '一覧に戻す' : '一覧から外す'}</button></div>`;
}
function videoCard(v) {
  const n = practiceDays(v.id), w = watchCount(v.id), badge = v.kind === 'menu' ? '練習メニュー' : v.kind === 'playlist' ? '再生リスト' : v.category;
  const cnt = [n ? `練習 ${n}日` : '', w ? `見た ${w}回` : ''].filter(Boolean).join(' ・ ');
  return `<div class="vcard"><button class="th" data-play="${v.id}" title="${v.kind === 'menu' ? 'メニューを見る' : v.kind === 'playlist' ? 'YouTubeでプレイリストを開く' : '再生'}">${v.kind === 'menu' || v.kind === 'playlist' ? `<span class="menuicon">${v.kind === 'menu' ? '📝' : '🎞️'}</span>` : `<img src="${ytThumb(v)}" alt="" loading="lazy" onerror="this.remove()"><span class="play">▶</span>`}<span class="badge tag">${esc(badge)}</span>${cnt ? `<span class="cnt">${cnt}</span>` : ''}</button>
    <div class="bd"><b title="${esc(v.title)}">${esc(v.title)}</b><div class="acts">${recordButtons(v)}</div>${adminButtons(v)}</div></div>`;
}
function teamCard(v, m) {
  const w = watchCount(v.id);
  const head = `<div class="top"><span>${esc(m.date)} ${esc(m.opp ? m.what : '')}</span><span>${esc(m.sub)}${w ? ` ・ 見た${w}回` : ''}</span></div>`;
  const body = m.opp ? `<div class="sc"><span>SUN's</span><strong class="${m.us > m.them ? 'win' : ''}">${m.us} - ${m.them}</strong><span title="${esc(m.opp)}">${esc(m.opp)}</span></div>` : `<div class="ttl" title="${esc(v.title)}">${esc(m.rest || v.title)}</div>`;
  return `<div class="tmcard">${head}${body}<div class="acts"><button class="open" data-play="${v.id}">${v.kind === 'playlist' ? 'プレイリストへ ↗' : v.kind === 'menu' ? '📝 メニュー' : '▶ 見る'}</button>${recordButtons(v)}</div>${adminButtons(v)}</div>`;
}
function openPlayer(id) {
  const v = S.data.videos.find(x => x.id === id);
  if (!v) return;
  // Playlists open on YouTube itself (the embedded playlist player is hard to use).
  if (v.kind === 'playlist') { window.open(ytHref(v), '_blank', 'noopener,noreferrer'); return; }
  playerId = id;
  const media = v.kind === 'menu' ? '' : `<div class="vid"><iframe title="${esc(v.title)}" src="${ytEmbed(v)}" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  modal(v.title, `<div class="player">${media}
    ${v.memo ? `<p class="memo">${esc(v.memo)}</p>` : ''}
    <div class="row section"><span class="tag">${esc(v.category)}</span><span class="muted">記録する日 ${jpDate(date)} ／ 練習 ${practiceDays(v.id)}日</span><span style="flex:1"></span>
    <span class="acts" id="playerActs" style="min-width:300px"></span>
    ${v.kind === 'menu' ? '' : `<a href="${ytHref(v)}" target="_blank" rel="noopener noreferrer">YouTubeで開く ↗</a>`}</div></div>`);
  $('dialog').classList.add('wide');
  playerButtons();
}
function playerButtons() {
  const v = S.data.videos.find(x => x.id === playerId);
  if (v && $('playerActs')) $('playerActs').innerHTML = recordButtons(v);
}

/* ================= Buddy ================= */
function buddy() {
  const d = S.data, k = buddyView || d.active, s = S.stats[k], b = d.buddies[k], playing = isMatchPlaying();
  const owner = id => kinds.find(([x]) => Object.values(d.buddies[x].equipment).includes(id))?.[0];
  $('content').innerHTML = `
  <div class="bpick">${kinds.map(([x, l]) => `<button class="${x === k ? 'on' : ''}" data-view="${x}"><img class="${x}" src="${image(x)}" alt="">${esc(name(x))}<span class="tag ${d.active === x ? '' : 'gray'}">${d.active === x ? '育成中' : d.buddies[x].started ? 'おやすみ中' : 'まだ育てていない'}</span></button>`).join('')}</div>
  <div class="bgrid">
    <section class="card bprofile ${k}">
      <img class="sprite" src="${image(k)}" alt="${esc(name(k))}">
      <div class="looks">${[1, 2, 3].map(n => n <= s.stage ? `<button class="${s.look === n ? 'on' : ''}" data-look="${n}" title="${n}段階目"><img src="assets/${k}${n}.png" alt="${n}段階目"></button>` : `<button class="lock" disabled>Lv.${n === 2 ? 5 : 10}<br>で解放</button>`).join('')}</div>
      ${b.look ? '<button class="chip" data-look="">いつも最新の姿にする</button>' : '<p class="muted" style="margin:2px 0">いつも最新の姿を表示中</p>'}
      <div class="row section"><input class="name" id="buddyName" maxlength="16" placeholder="名前をつけてね" value="${esc(b.name)}" aria-label="名前"><button id="saveName">名前を保存</button></div>
      <div class="row between section"><b class="big">Lv.${s.level}</b><span>${label(k)} ・ 練習 ${s.days}日</span></div>
      <div class="xpbar"><div style="width:${s.xp % 20 * 5}%"></div></div>
      <p class="muted">次のレベルまで ${20 - s.xp % 20} ／ 技は1試合${s.stage}回</p>
      <button class="primary" id="switchBuddy" style="width:100%" ${d.active === k || playing ? 'disabled' : ''}>${d.active === k ? '育成中' : b.started ? 'この子の育成に戻る' : 'この子をLv.1から育てる'}</button>
    </section>
    <div style="display:grid;gap:20px;min-width:0">
      <section class="card"><h2>👟 装備 <small>枠をタップして変更・自動保存</small></h2>
        ${playing ? '<p class="danger">試合中は変更できません</p>' : ''}
        <div class="slots">${Object.entries(S.catalog.slots).map(([slot, l]) => { const cur = d.game.gear.find(i => i.id === b.equipment[slot]), t = cur && S.catalog.gear[cur.key];
          return `<button class="slot ${t ? 'filled' : ''}" data-slot="${slot}" ${playing ? 'disabled' : ''}><span class="slotlabel">${l}</span>${t ? `<img src="assets/${t.image}" alt=""><span>${esc(t.name)}</span><small>${esc(bonusText(t))}</small>` : '<span class="none">＋</span><small>なし</small>'}</button>`; }).join('')}</div>
      </section>
      <section class="card"><h2>📊 能力 <small>装備こみ。緑の数字は装備の分</small></h2><div class="statwrap">${statgrid(s.values, s.bonus)}<div class="radar">${radar(s.values)}</div></div></section>
      <section class="card"><h2>✨ 技 <small>カテゴリーを3日・7日・15日練習すると★が増える</small></h2>
        <div class="skilllist">${Object.entries(S.catalog.skills).map(([key, t]) => { const r = s.skills[key], n = s.counts[t.category], step = SKILL_STEPS.find(x => x > n);
          return `<div class="skillbox ${r ? '' : 'locked'}"><span class="muted">${esc(t.category)} ${n}日</span><b>${esc(t.name)}</b><span class="stars">${r ? '★'.repeat(r) : ''}</span> <span class="muted">${step ? `あと${step - n}日で${r ? '★' + (r + 1) : '解放'}` : '最高ランク！'}</span></div>`; }).join('')}</div>
      </section>
    </div>
  </div>
  ${collectionCard()}`;
  document.querySelectorAll('[data-view]').forEach(x => x.onclick = () => { buddyView = x.dataset.view; buddy(); });
  document.querySelectorAll('[data-look]').forEach(x => x.onclick = () => act('look', { buddy: k, look: x.dataset.look ? Number(x.dataset.look) : null }));
  document.querySelectorAll('[data-slot]').forEach(x => x.onclick = () => pickGear(k, x.dataset.slot, owner));
  $('saveName').onclick = () => act('rename', { buddy: k, name: $('buddyName').value });
  $('switchBuddy').onclick = () => act('switch', { buddy: k });
  wireCollection();
}
function pickGear(k, slot, owner) {
  const d = S.data, mine = d.game.gear.filter(i => S.catalog.gear[i.key].slot === slot).sort((a, b) => S.catalog.gear[b.key].tier - S.catalog.gear[a.key].tier);
  modal(`${name(k)}の${S.catalog.slots[slot]}を選ぶ`, `
    <button class="pickitem" data-gear="">🚫 <b>何もつけない</b></button>
    ${mine.map(i => { const t = S.catalog.gear[i.key], o = owner(i.id), other = o && o !== k;
      return `<button class="pickitem ${d.buddies[k].equipment[slot] === i.id ? 'selected' : ''}" data-gear="${i.id}" ${other ? 'disabled' : ''}><img src="assets/${t.image}" alt=""><span><b>${esc(t.name)}</b> <span class="rarity">${'★'.repeat(t.tier)}</span><br><span class="small">${esc(bonusText(t))}</span>${o ? `<br><span class="tag">${esc(name(o))}が装備中</span>` : ''}</span></button>`; }).join('') || '<p class="empty">この部位の装備はまだないよ。ガチャで手に入れよう！</p>'}`);
  document.querySelectorAll('[data-gear]').forEach(b => b.onclick = async () => { if (await act('equip', { buddy: k, slot, id: b.dataset.gear || null })) closeModal(); });
}
function duplicateGear() {
  const d = S.data, owner = id => kinds.find(([b]) => Object.values(d.buddies[b].equipment).includes(id))?.[0], extras = [];
  for (const key of new Set(d.game.gear.map(i => i.key))) {
    const same = d.game.gear.filter(i => i.key === key), keep = same.find(i => owner(i.id)) || same[0];
    extras.push(...same.filter(i => i !== keep && !owner(i.id)));
  }
  return { extras, sp: extras.reduce((n, i) => n + S.catalog.gear[i.key].tier, 0), owner };
}
function collectionCard() {
  const d = S.data, { extras, sp, owner } = duplicateGear(), playing = isMatchPlaying();
  const tools = Object.entries(S.catalog.tools);
  return `<section class="card section"><div class="row between"><h2>🎒 持ち物 <small>装備${d.game.gear.length}個</small></h2>
    <button id="exchangeDup" ${playing || !extras.length ? 'disabled' : ''}>${extras.length ? `ダブり${extras.length}個をまとめてSPに交換（＋${sp}）` : 'ダブりの装備はありません'}</button></div>
    <p class="muted">余った装備は★1つにつきSP1に交換できます。装備中のものは交換できません。</p>
    <div class="collection">${tools.map(([k, t]) => `<div class="item"><img class="itemimg" src="assets/${t.image}" alt=""><div><b>${esc(t.name)} ×${d.game.tools[k]}</b><p class="small">${esc(t.description)}</p><span class="tag gray">試合で使う道具</span></div></div>`).join('')}
    ${d.game.gear.map(i => { const t = S.catalog.gear[i.key], o = owner(i.id);
      return `<div class="item"><img class="itemimg" src="assets/${t.image}" alt=""><div><b>${esc(t.name)}</b> <span class="rarity">${'★'.repeat(t.tier)}</span><p class="small">${esc(bonusText(t))}</p>${o ? `<span class="tag">${esc(name(o))}が装備中</span>` : `<button data-exchange="${i.id}" ${playing ? 'disabled' : ''} style="min-height:34px;padding:3px 10px;font-size:13px">SP＋${t.tier}に交換</button>`}</div></div>`; }).join('')}</div>
    ${d.game.gear.length ? '' : '<p class="empty">ガチャで装備を手に入れよう！</p>'}</section>`;
}
function wireCollection() {
  const { extras, sp } = duplicateGear();
  $('exchangeDup').onclick = () => { if (confirm(`ダブりの装備${extras.length}個をSP${sp}に交換しますか？ 元には戻せません。`)) act('exchange', { ids: extras.map(i => i.id) }); };
  document.querySelectorAll('[data-exchange]').forEach(b => b.onclick = () => {
    const t = S.catalog.gear[S.data.game.gear.find(i => i.id === b.dataset.exchange).key];
    if (confirm(`${t.name}をSP${t.tier}に交換しますか？ 元には戻せません。`)) act('exchange', { ids: [b.dataset.exchange] });
  });
}

/* ================= Play ================= */
function play() { return playTab === 'run' ? drMenu() : playTab === 'shoot' ? runMenu() : matchscreen(); }
function gacha() {
  const g = S.data.game, e = S.economy, cost = S.catalog.gacha_cost, multi = S.catalog.multi_count;
  const picks = [['random', 'おまかせ（装備・道具すべて）'], ...Object.entries(S.catalog.slots), ['tool', '道具']];
  $('content').innerHTML = `
  <div class="grid two">
    <section class="gachabox">
      <span class="capsule">🎁</span><h2 style="justify-content:center">わくわくアイテムガチャ</h2>
      <p>練習でためたSPで、装備や道具を手に入れよう！</p>
      <p class="big">💎 SP ${e.available}</p>
      <p class="muted">あと ${Math.floor(e.available / cost)} 回まわせるよ</p>
      <label class="row" style="justify-content:center">出す種類 <select id="pick">${picks.map(([k, l]) => `<option value="${k}" ${k === pick ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <div class="row" style="justify-content:center">
        <button class="primary drawbtn" id="draw" ${e.available < cost ? 'disabled' : ''}>ガチャを回す（SP${cost}）</button>
        <button class="primary drawbtn multi" id="draw10" ${e.available < cost * multi ? 'disabled' : ''}>${multi}連ガチャ（SP${cost * multi}）<small>${'★'.repeat(S.catalog.multi_min_tier)}以上1個確定！</small></button>
      </div>
      ${e.available < cost ? `<p class="muted">あと SP${cost - e.available} で回せるよ。練習して集めよう！</p>` : ''}
      ${e.debt ? `<p class="danger">実績取り消し分の精算待ち：${e.debt}SP</p>` : ''}
      <p><button id="catalog">出るアイテム・確率</button></p>
      <p class="muted">経験値1＝SP1。1回につき必ず1個。課金はありません。</p>
    </section>
    <section class="card"><h2>ガチャの履歴 <small>${g.draws + (g.choice_draws || 0)}回</small></h2>
      <div class="history">${g.gacha_log.map(l => { const i = itemData(l.key); return `<div class="entry row"><img class="itemimg" src="assets/${i.image}" alt=""><div><b>${esc(i.name)}</b><p class="muted">${l.date} ／ ${i.tier ? '★'.repeat(i.tier) : '道具'}</p></div></div>`; }).join('') || '<p class="empty">最初のガチャを回してみよう！</p>'}</div>
      ${g.legacy_board_log.length ? '<button id="legacyHistory">旧すごろくの獲得履歴</button>' : ''}
    </section>
  </div>`;
  $('pick').onchange = ev => pick = ev.target.value;
  $('draw').onclick = () => act('gacha', { pick });
  $('draw10').onclick = () => act('gacha', { pick, count: multi });
  $('catalog').onclick = catalog;
  if ($('legacyHistory')) $('legacyHistory').onclick = () => modal('旧すごろくの履歴', g.legacy_board_log.map(l => `<p>${esc(l.date)} ／ ${esc(l.reward)}</p>`).join(''));
}

/* ================= Record ================= */
function record() {
  const d = S.data;
  if (recordTab === 'calendar') {
    $('content').innerHTML = recordTabs() + calendarCard().replace('class="card section"', 'class="card"');
    wireCalendar();
    return;
  }
  if (recordTab === 'activities') {
    const list = [...d.activities].sort((a, b) => b.date.localeCompare(a.date));
    $('content').innerHTML = recordTabs() + `<section class="card"><h2>📝 練習・視聴の記録 <small>${list.length}件</small></h2>
      <p class="muted">取り消すと経験値・SP・能力・技を計算し直します。使用済みSPを超えた分は、次に獲得するSPから精算します。</p>
      <div class="history" style="max-height:none">${list.map(activityRow).join('') || '<p class="empty">最初の一歩を記録しよう！</p>'}</div></section>`;
  } else {
    $('content').innerHTML = recordTabs() + `<section class="card"><h2>🏆 試合の記録 <small>${d.matches.length}試合 ／ ${d.matches.filter(m => m.score[0] > m.score[1]).length}勝</small></h2>
      <div class="history" style="max-height:none">${d.matches.map(m => `<details class="entry"><summary>${m.date} 対 ${esc(m.enemy)} <b>${m.score.join('－')}</b> ${m.score[0] > m.score[1] ? '<span class="tag">勝ち</span>' : ''}</summary>${m.logs.map(l => `<p class="small">${esc(l)}</p>`).join('')}</details>`).join('') || '<p class="empty">初めての試合に挑戦しよう！</p>'}</div></section>`;
  }
  wireUndo();
}
function activityRow(a) {
  const v = S.data.videos.find(x => x.id === a.video);
  return `<div class="entry row between"><div><b>${jpDate(a.date)} · ${a.type === 'watch' ? '👀 見た' : '🏀 練習した'} · ${esc(a.category)}</b><p class="muted">${esc(name(a.buddy))} ／ ${esc(v?.title || '動画なしの練習')}</p></div><button class="danger" data-undo="${a.id}">取り消す</button></div>`;
}
function wireUndo() {
  document.querySelectorAll('[data-undo]').forEach(b => b.onclick = async () => { if (confirm('この記録を取り消しますか？')) { await act('undo', { id: b.dataset.undo }); if ($('dialog').open && b.closest('dialog')) closeModal(); } });
}
// Calendar day detail (overrides nothing in legacy.js: the original was removed there).
function dayDetail(ds) {
  const acts = S.data.activities.filter(a => a.date === ds), ms = S.data.measures.filter(r => r.date === ds), C = S.catalog.measures, F = S.measures.flags;
  modal(`${jpDate(ds)}のがんばり`, `${acts.map(activityRow).join('')}${ms.map(r => `<p class="entry">📏 ${esc(C[r.type].name)} <b>${r.value}${esc(C[r.type].unit)}</b> ${F[r.id] === 'pb' ? '👑 自己ベスト更新' : F[r.id] === 'first' ? '⭐ はじめての記録' : ''}</p>`).join('')}`);
  wireUndo();
}

/* ================= Manager (coach = Papa's house chores) ================= */
// Everyone can see the coach; only Mama (password) can record chores. The server keeps the lock (5 minutes).
const coachImg = look => `assets/coach${look}.png`;
let managerTimer = null;
function battleQuota() {
  const b = S.coach.battles;
  return `<p class="quota ${b.left ? '' : 'empty'}">⚔️ 今日の対戦 <b>あと${b.left}回</b> <span class="muted">（1日${b.limit}回まで。始めた時点で1回。監督がスーパーコーチなら5回）</span></p>`;
}
function manager() {
  const c = S.coach, M = S.manager, C = S.catalog, st = C.coach_stages, q = C.coach_quota;
  const from = st[c.stage - 1].need, pct = c.next == null ? 100 : (c.total - from) / (c.next - from) * 100;
  const chores = [...S.data.coach.chores].reverse().slice(0, 40);
  const open = c.requests.filter(r => r.status === 'open'), asked = new Set(open.map(r => r.chore));
  const askLeft = C.requests_per_day - c.requests_today;
  const reqRows = [...c.requests].reverse().slice(0, 8).map(r => { const t = C.chores[r.chore];
    return `<div class="entry row between"><div><b>${t.icon} ${esc(t.name)}</b> <span class="muted">${jpDate(r.date)}</span></div>${r.status === 'done' ? `<span class="tag">✅ やってくれた！ GP＋${C.request_gp}</span>` : r.status === 'expired' ? '<span class="tag gray">期限切れ</span>' : `<span class="row"><span class="tag gp">${r.until === today() ? '今日まで' : '明日まで'}</span><button class="small" data-reqcancel="${r.id}">取り消す</button></span>`}</div>`; }).join('');
  const s = c.streak;
  const badges = C.badges.map((b, i) => `<div class="badge ${c.badges[i].earned ? 'got' : ''}"><span>${c.badges[i].earned ? b.icon : '🔒'}</span><b>${esc(b.name)}</b><small>${b.weeks}週れんぞく ／ GP＋${b.gp}</small></div>`).join('');
  const next = C.badges.find((b, i) => !c.badges[i].earned);
  const effects = st.map((s, i) => {
    const n = i + 1, state = n === 1 || n <= c.power ? 'on' : n <= c.stage ? 'sleep' : 'lock';
    return `<li class="${state}"><span>${state === 'on' ? '✅' : state === 'sleep' ? '💤' : '🔒'}</span><div><b>${esc(s.name)}</b> <small class="muted">運動量${s.need}〜</small><br><small>${esc(s.effect)}${state === 'sleep' ? '（リバウンド中はお休み）' : ''}</small></div></li>`;
  }).join('');
  // The chore grid is always visible; only Mama (unlocked) can press it.
  const choreGrid = `<div class="chores ${M.open ? '' : 'locked'}">${Object.entries(C.chores).map(([k, t]) => `<button class="chorebtn ${asked.has(k) ? 'asked' : ''}" data-chore="${k}" ${M.open ? '' : 'disabled title="ママがパスワードでひらくと記録できます"'}>${asked.has(k) ? '<span class="askedtag">🙏 おねがい中</span>' : ''}<i>${t.icon}</i><b>${esc(t.name)}</b><small>GP＋${t.gp} ／ 運動量＋1</small></button>`).join('')}</div>`;
  let mama;
  if (!M.has_password) mama = `<form id="pwSetup" class="pwform"><p>はじめに、<b>ママ</b>がパスワードを決めてください（4〜32文字）。家事の記録はこのパスワードを知っている人だけがつけられます。</p>
      <input type="password" id="pw1" autocomplete="new-password" maxlength="32" placeholder="パスワード" aria-label="パスワード">
      <input type="password" id="pw2" autocomplete="new-password" maxlength="32" placeholder="もう一度" aria-label="もう一度">
      <button class="primary">パスワードを設定</button></form>${choreGrid}`;
  else if (!M.open) mama = `<form id="pwUnlock" class="pwform"><p>🔒 家事の記録は<b>ママだけ</b>がつけられます。</p>
      <input type="password" id="pw" autocomplete="current-password" maxlength="64" placeholder="パスワード" aria-label="パスワード">
      <button class="primary">ひらく</button></form>${choreGrid}`;
  else mama = `<div class="row between"><span class="muted">🔓 ひらいています（操作しないと5分でロック）</span><span class="row"><span class="date muted">記録する日 ${datebox()}</span><button id="pwLock">ロックする</button></span></div>
      ${choreGrid}
      <p class="muted">同じ家事を1日に何回でも記録できます（GPは毎回）。運動量は1日${C.coach_cap}まで。</p>
      <div class="trialbox"><div><b>🎮 ミニゲームのためし遊び</b><br><small class="muted">GPを使わず、スコアもステージの解放も記録しません。全ステージをためせます。</small></div>
        <select id="trialGame" aria-label="ゲーム"><option value="shoot">🏀 シュートラッシュ</option><option value="run">🏃 ドリブルラン</option></select><select id="trialStage" aria-label="ステージ">${Array.from({ length: C.run_stages }, (_, i) => `<option value="${i + 1}">ステージ${i + 1}</option>`).join('')}</select><button class="primary" id="trialGo">ためす</button></div>
      <details><summary>パスワードを変える</summary><form id="pwChange" class="pwform"><input type="password" id="pwOld" maxlength="64" placeholder="いまのパスワード" aria-label="いまのパスワード"><input type="password" id="pwNew" maxlength="32" placeholder="新しいパスワード（4〜32文字）" aria-label="新しいパスワード"><button>変更する</button></form></details>`;
  $('content').innerHTML = `
  <div class="grid two">
    <section class="card coachcard ${c.rebound ? 'warn' : ''}">
      <img class="coachbig" src="${coachImg(c.look)}" alt="監督">
      <div class="coachinfo">
        <h2>🐻 ${esc(c.rebound ? st[c.look - 1].name : c.name)} <small>Lv.${c.level}</small></h2>
        ${c.rebound ? `<p class="danger">リバウンド中！ 先週の運動量が ${c.last_week}/${q} だったので、監督の効果はお休み。今週 ${q} になったら元にもどるよ。</p>` : ''}
        <div class="meter"><span>今週の運動量</span><b>${c.this_week}/${q}</b><div class="gbar"><div style="width:${Math.min(100, c.this_week / q * 100)}%"></div></div></div>
        <div class="meter"><span>今日の運動量</span><b>${c.today}/${C.coach_cap}</b><span class="muted">家事 ${c.today_chores}回</span></div>
        <div class="meter"><span>${c.next == null ? '最高の姿！' : '次の進化まで'}</span><b>${c.next == null ? '' : `あと${c.next - c.total}`}</b><div class="gbar"><div style="width:${pct}%"></div></div></div>
        <p class="muted">累計の運動量 ${c.total} ／ 運動量${C.coach_per_level}ごとにレベルアップ。毎週 ${q} 以上うんどうしないとリバウンドします。</p>
      </div>
    </section>
    <section class="card"><h2>🎖️ 監督の効果</h2><ul class="effects">${effects}</ul>
      <p class="gpline">🪙 GP <b>${c.gp.available}</b> <span class="muted">家事 ${c.gp.chores} ／ おねがい ${c.gp.requests} ／ バッジ ${c.gp.badges} ／ 対戦の勝利 ${c.gp.wins}${c.gp.spent ? ` ／ 使った ${c.gp.spent}` : ''}。ミニゲーム1回 ${C.run_cost}GP（準備中）</span></p></section>
  </div>
  <div class="grid two section">
    <section class="card"><h2>🙏 パパにおねがい <small>だれでも押せるよ</small></h2>
      <p class="muted">やってほしい家事を押してね。パパが今日か明日やってくれたら GP＋${C.request_gp}！ ${askLeft > 0 ? `今日はあと${askLeft}回おねがいできるよ。` : '今日のおねがいはおしまい。'}</p>
      <div class="askgrid">${Object.entries(C.chores).map(([k, t]) => `<button class="askbtn ${asked.has(k) ? 'asked' : ''}" data-ask="${k}" ${asked.has(k) || askLeft <= 0 ? 'disabled' : ''}><i>${t.icon}</i>${esc(t.name)}${asked.has(k) ? '<small>おねがい中</small>' : ''}</button>`).join('')}</div>
      <div class="history" style="max-height:none;margin-top:10px">${reqRows || '<p class="empty">まだおねがいしていないよ</p>'}</div>
    </section>
    <section class="card"><h2>🏅 れんぞく達成バッジ <small>1週間の運動量${q}以上がつづくと</small></h2>
      <p class="streak">いま <b>${s.current}</b>週れんぞく <span class="muted">／ さいこう記録 ${s.best}週${next ? ` ／ 次の「${esc(next.name)}」まで あと${Math.max(0, next.weeks - s.best)}週` : ''}</span></p>
      <div class="weekdots" title="最近の週（左が古い）">${s.weeks.map((ok, i) => `<span class="${ok ? 'ok' : i === s.weeks.length - 1 ? 'now' : ''}">${ok ? '✔' : i === s.weeks.length - 1 ? '…' : ''}</span>`).join('')}</div>
      <div class="badges">${badges}</div>
      <p class="muted">バッジは一度とったら消えません。とったときにGPももらえます。</p>
    </section>
  </div>
  <section class="card section"><h2>📋 パパの家事を記録する <small>ママ専用</small></h2>${mama}</section>
  <section class="card section"><h2>🧾 家事の記録 <small>最近の${chores.length}件</small></h2>
    <div class="history" style="max-height:none">${chores.map(r => { const t = C.chores[r.chore]; return `<div class="entry row between"><div><b>${jpDate(r.date)} · ${t.icon} ${esc(t.name)}</b> <span class="muted">GP＋${t.gp}</span></div>${M.open ? `<button class="danger" data-chundo="${r.id}">取り消す</button>` : ''}</div>`; }).join('') || '<p class="empty">まだ記録がありません</p>'}</div></section>`;
  if ($('pwSetup')) $('pwSetup').onsubmit = e => { e.preventDefault(); if ($('pw1').value !== $('pw2').value) return tell('2つのパスワードがちがいます'); act('manager_setup', { password: $('pw1').value }); };
  if ($('pwUnlock')) { $('pwUnlock').onsubmit = e => { e.preventDefault(); act('manager_unlock', { password: $('pw').value }); }; $('pw').focus(); }
  if ($('pwChange')) $('pwChange').onsubmit = e => { e.preventDefault(); act('manager_password', { old: $('pwOld').value, new: $('pwNew').value }); };
  if ($('pwLock')) $('pwLock').onclick = () => act('manager_lock');
  if ($('trialGo')) $('trialGo').onclick = () => ($('trialGame').value === 'run' ? drBegin : runBegin)(true, Number($('trialStage').value));
  wiredate();
  if ($('date')) $('date').onchange = e => { date = e.target.value || today(); };
  document.querySelectorAll('[data-chore]').forEach(b => b.onclick = () => act('chore', { chore: b.dataset.chore, date }));
  document.querySelectorAll('[data-ask]').forEach(b => b.onclick = () => act('request', { chore: b.dataset.ask }));
  document.querySelectorAll('[data-reqcancel]').forEach(b => b.onclick = () => { if (confirm('このおねがいを取り消しますか？')) act('request_cancel', { id: b.dataset.reqcancel }); });
  document.querySelectorAll('[data-chundo]').forEach(b => b.onclick = () => { if (confirm('この家事の記録を取り消しますか？')) act('chore_undo', { id: b.dataset.chundo }); });
  // The server closes the lock after 5 minutes; redraw then so the screen does not look open.
  clearTimeout(managerTimer);
  if (M.open) managerTimer = setTimeout(async () => { try { S = await req('/api/state'); if (tab === 'manager') render(); } catch (e) { } }, (M.seconds + 1) * 1000);
}
function badgeFx(b) {
  if (!reduceMotion.matches) confetti();
  return fxPlay(`<div class="rays t3"></div>
    <div class="gres t3"><span class="tag">${b.weeks}週れんぞく達成！</span>
      <p class="badgebig">${b.icon}</p><h2>${esc(b.name)}をゲット！</h2>
      <p>パパが${b.weeks}週つづけてがんばったよ ／ GP＋${b.gp}</p></div>`, 4200, 'light');
}
function coachFx(from, to, title, sub) {
  if (!reduceMotion.matches) setTimeout(confetti, 1500);
  return fxPlay(`<div class="rays"></div>
    <div class="evo">
      <img class="old" src="${coachImg(from)}" alt="">
      <img class="new" src="${coachImg(to)}" alt="監督">
      <div class="evoflash"></div>
      <p class="evotext">${esc(title)}</p>
      <p class="evosub">${esc(sub)}</p>
    </div>`, 5200, 'light');
}

/* ================= Settings ================= */
function settings() {
  const e = S.economy;
  $('content').innerHTML = `
  <div class="grid two">
    <section class="card"><h2>💾 データ</h2>
      <p class="muted">記録はこのPCの data/minibas.json に自動で保存されます。PCの故障に備えて、時々USBメモリなどにもバックアップしてください。</p>
      <div class="row section"><button class="primary" id="backup">バックアップを保存</button><button id="restore">バックアップから復元</button></div>
      <p class="muted">復元すると、今の記録はすべて置き換わります。先にバックアップを保存してください。</p>
      <input type="file" id="file" accept=".json" hidden>
    </section>
    <section class="card"><h2>🎬 演出</h2>
      <label class="row"><input id="cutinSetting" type="checkbox" ${S.data.settings.cutin ? 'checked' : ''} style="width:22px;height:22px"> 試合で技を使ったときにカットインを表示する</label>
      <div class="row section"><button id="openingFromSettings">▶ オープニングを見る</button><span class="muted">約1分30秒・音が出ます</span></div>
    </section>
    <section class="card"><h2>📊 SPの内訳</h2>
      <p>今のSP <b class="big" style="font-size:22px">${e.available}</b></p>
      <p class="muted">練習・視聴でもらったSP ${e.earned} ／ チャレンジのボーナス ${e.measure_bonus} ／ 装備の交換 ${e.exchanged} ／ ガチャで使ったSP ${e.spent}${e.debt ? ` ／ 精算待ち ${e.debt}` : ''}</p>
    </section>
    <section class="card"><h2>⏻ アプリを終了</h2>
      <p class="muted">ブラウザーを閉じるだけでは終わりません。ここから終了してください。進行中の試合は保存されません。</p>
      <button class="danger" id="shutdown">アプリを終了する</button>
    </section>
  </div>`;
  $('cutinSetting').onchange = ev => act('settings', { cutin: ev.target.checked });
  $('openingFromSettings').onclick = openOpening;
  $('backup').onclick = backupData;
  $('restore').onclick = () => $('file').click();
  $('file').onchange = restoreData;
  $('shutdown').onclick = shutdownApp;
}
function openOpening() {
  if (busy || isMatchPlaying()) return;
  modal('オープニング', opCard());
  $('dialog').classList.add('wide');
  opMount();
}
async function backupData() {
  try {
    const r = await fetch('/api/backup', { headers: { 'X-App-Token': TOKEN } });
    if (!r.ok) throw Error('バックアップできません');
    const u = URL.createObjectURL(await r.blob()), a = document.createElement('a');
    a.href = u; a.download = `minibas-v3-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  } catch (e) { tell(e.message); }
}
async function restoreData(e) {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 16000000) throw Error('ファイルが大きすぎます');
    const d = JSON.parse((await f.text()).replace(/^﻿/, ''));
    if (confirm('現在の記録を置き換えます。先にバックアップしましたか？')) await act('restore', { data: d });
  } catch (err) { tell(err.message); }
  e.target.value = '';
}
async function shutdownApp() {
  if (!confirm('アプリを終了しますか？ 進行中の試合は保存されません。')) return;
  try {
    await req('/api/shutdown', {});
    showClosed('終了しました');
  } catch (e) { tell(e.message); }
}

/* ================= Celebration effects (evolution, skill unlock, gacha) ================= */
// Effects run one after another on a full-screen overlay. Click, Enter, Esc or Space skips the current one.
let fxChain = Promise.resolve();
function celebrate(fn) { fxChain = fxChain.then(fn).catch(() => {}); }
function fxPlay(html, ms, cls = '') {
  return new Promise(resolve => {
    const el = $('fx'), main = document.querySelector('main');
    el.className = 'fx ' + cls;
    el.innerHTML = html + (ms ? '<small class="fxhint">タップでとばす</small>' : '');
    main.inert = true;
    el.focus();
    let timer;
    const done = () => {
      clearTimeout(timer);
      el.onclick = el.onkeydown = null;
      el.className = 'fx hidden';
      el.innerHTML = '';
      main.inert = false;
      resolve();
    };
    el.done = done;
    el.onclick = e => { if (!e.target.closest('[data-keep]')) done(); };
    el.onkeydown = e => { if (['Enter', 'Escape', ' '].includes(e.key) && !e.target.closest('button')) { e.preventDefault(); done(); } };
    if (ms) timer = setTimeout(done, reduceMotion.matches ? Math.min(ms, 1800) : ms);
  });
}
function evolutionFx(k, from, to, level) {
  if (!reduceMotion.matches) setTimeout(confetti, 1500);
  return fxPlay(`<div class="rays"></div>
    <div class="evo">
      <img class="old" src="assets/${k}${from}.png" alt="">
      <img class="new" src="assets/${k}${to}.png" alt="${esc(name(k))}">
      <div class="evoflash"></div>
      <p class="evotext"><b>${esc(name(k))}</b>が進化した！</p>
      <p class="evosub">Lv.${level} ／ 試合で技を1試合${to}回使えるようになったよ</p>
    </div>`, 5200, 'light');
}
function skillFx(k, key, rank) {
  const t = S.catalog.skills[key], look = S.stats[k].look;
  return fxPlay(`<div class="fxpanel">
      <img src="assets/cutin_${k}${look}.png" alt="">
      <div class="fxtext">
        <p>${esc(name(k))}が${rank === 1 ? '新しい技を覚えた！' : '技がパワーアップ！'}</p>
        <h2>${esc(t.name)}</h2>
        <div class="fxstars">${Array.from({ length: rank }, (_, i) => `<span style="animation-delay:${0.45 + i * 0.25}s">★</span>`).join('')}</div>
        <small>${esc(t.category)}を${[3, 7, 15][rank - 1]}日練習した ／ ${esc(t.description)}</small>
      </div></div>`, 3200, 'dark');
}
const tierOf = key => itemData(key).tier || 0;   // 0 = tool
// Called by act() (legacy.js) before the gacha result is rendered.
function gachaAnimation(e) {
  const tier = tierOf(e.key);
  const msg = tier === 5 ? '虹色にかがやいてる…！！！' : tier === 4 ? 'まぶしい…！！ これは…！？' : tier === 3 ? 'すごい予感…！！' : tier === 2 ? 'あれ？ 光ってる…！' : '何が出るかな？';
  return fxPlay(`<div class="capwrap"><div class="cap t${tier}"><i class="top"></i><i class="bot"></i></div><p class="capmsg">${msg}</p></div>`, tier === 5 ? 2800 : tier === 4 ? 2300 : tier === 3 ? 1900 : tier === 2 ? 1500 : 1100, 'light');
}
// 10連: one card per item, best tier decides the background
function gachaMultiResult(e) {
  const top = Math.max(...e.results.map(r => tierOf(r.key))), cost = S.catalog.gacha_cost * S.catalog.multi_count, again = S.economy.available >= cost;
  if (top >= 3 && !reduceMotion.matches) { confetti(); if (top === 5) setTimeout(confetti, 600); }
  const p = fxPlay(`${top >= 2 ? `<div class="rays t${top}"></div>` : ''}
    <div class="gres multi t${top}" data-keep>
      <h2>${S.catalog.multi_count}連ガチャの結果！</h2>
      <div class="mgrid">${e.results.map((r, n) => { const i = itemData(r.key), t = tierOf(r.key); return `<div class="mcard t${t}" style="animation-delay:${n * 0.08}s">${r.new ? '<span class="mnew">NEW</span>' : ''}<img src="assets/${i.image}" alt=""><span class="rarity">${t ? '★'.repeat(t) : '道具'}</span><b>${esc(i.name)}</b></div>`; }).join('')}</div>
      <p class="muted">持ち物に入れたよ</p>
      <div class="row" style="justify-content:center"><button class="primary" id="gachaOk">OK</button>${again ? `<button class="open" id="gachaAgain">もう1回${S.catalog.multi_count}連（SP${cost}）</button>` : ''}</div>
    </div>`, 0, 'light');
  $('gachaOk').onclick = () => $('fx').done();
  if ($('gachaAgain')) $('gachaAgain').onclick = () => { $('fx').done(); act('gacha', { pick: e.pick, count: S.catalog.multi_count }); };
  $('gachaOk').focus();
  return p;
}
// Called by act() (legacy.js) after the new state is rendered.
function gachaResult(e) {
  const i = itemData(e.key), tier = tierOf(e.key), cost = S.catalog.gacha_cost, again = S.economy.available >= cost;
  if (tier >= 3 && !reduceMotion.matches) { confetti(); if (tier === 5) setTimeout(confetti, 600); }
  const p = fxPlay(`${tier >= 2 ? `<div class="rays t${tier}"></div>` : ''}
    <div class="gres t${tier}" data-keep>
      <span class="tag">${e.new ? '✨ はじめて手に入れた！' : '追加で獲得！'}</span>
      <img src="assets/${i.image}" alt="${esc(i.name)}">
      <p class="rarity">${tier ? '★'.repeat(tier) : '試合で使える道具'}</p>
      <h2>${esc(i.name)}</h2>
      <p>${esc(bonusText(i))}</p>
      <p class="muted">持ち物に入れたよ</p>
      <div class="row" style="justify-content:center"><button class="primary" id="gachaOk">OK</button>${again ? `<button class="open" id="gachaAgain">もう1回まわす（SP${cost}）</button>` : ''}</div>
    </div>`, 0, 'light');
  $('gachaOk').onclick = () => $('fx').done();
  if ($('gachaAgain')) $('gachaAgain').onclick = () => { $('fx').done(); act('gacha', { pick }); };
  $('gachaOk').focus();
  return p;
}

/* ================= Wiring ================= */
$('side').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) goTab(b.dataset.tab); };
$('content').addEventListener('click', e => {
  const t = e.target.closest('button,[data-play]');
  if (!t || t.disabled) return;
  if (t.dataset.prtab) { practiceTab = t.dataset.prtab; return render(); }
  if (t.dataset.pltab) { playTab = t.dataset.pltab; return render(); }
  if (t.dataset.rtab) { recordTab = t.dataset.rtab; return render(); }
  if (t.dataset.play) return openPlayer(t.dataset.play);
  if (t.dataset.rec) return act('record', { type: t.dataset.rec, video: t.dataset.video, date });
  if (t.dataset.switch) return act('switch', { buddy: t.dataset.switch });
  if (t.dataset.edit) return edit(S.data.videos.find(v => v.id === t.dataset.edit));
  if (t.dataset.hide) { if (confirm('表示状態を変更しますか？ 実績は残ります。')) act('hide', { id: t.dataset.hide }); }
});
$('modal').addEventListener('click', e => {
  const t = e.target.closest('[data-rec]');
  if (t && !t.disabled) act('record', { type: t.dataset.rec, video: t.dataset.video, date });
});
$('dialog').addEventListener('close', () => {
  if (OP.audio) opStop();
  playerId = null;
  $('dialog').classList.remove('wide');
  $('modal').innerHTML = '';   // stops an embedded YouTube player
});
$('undoBtn').onclick = () => { const fn = undoAction; hideUndo(); if (fn) fn(); };
$('openingBtn').onclick = openOpening;

function showClosed(title) {
  clearInterval(helloTimer);
  $('content').innerHTML = `<section class="card"><h2>${title}</h2><p>このタブを閉じてください。また遊ぶときは、アプリをもう一度起動してください。</p></section>`;
  ['side', 'hud'].forEach(id => $(id).classList.add('hidden'));
}

