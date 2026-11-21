// ミニバス練習ノート スマホ版：PC版のサーバーの代わり（端末の中に保存）、スマホ用の設定画面、ゲームのタッチ操作。
// PC版の画面（app.js など）の関数を、ここで同じ名前のまま差しかえている。
'use strict';

/* ================= 保存（IndexedDB） ================= */
const Store = (() => {
  let db = null;
  const open = () => db || (db = new Promise((ok, ng) => {
    const r = indexedDB.open('minibas', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ng(r.error);
  }));
  const run = (mode, fn) => open().then(d => new Promise((ok, ng) => {
    const t = d.transaction('kv', mode), req = fn(t.objectStore('kv'));
    t.oncomplete = () => ok(req.result); t.onerror = t.onabort = () => ng(t.error);
  }));
  return { get: k => run('readonly', s => s.get(k)), put: (k, v) => run('readwrite', s => s.put(v, k)) };
})();
async function saveState(d) {
  try { await Store.put('state', d); }
  catch (e) { console.error(e); throw new MinibasCore.UserError('保存に失敗しました。スマホの空き容量を確認してください。変更は確定していません。'); }
}
let ready = (async () => {
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});   // ブラウザーが勝手に消さないようにお願いする
  await MinibasCore.load(await Store.get('state'), saveState);
})();

/* ================= PC版のサーバーとのやりとりの代わり ================= */
let queue = Promise.resolve();
function req(path, body) {
  const job = queue.then(async () => {
    await ready;
    if (path === '/api/state') return MinibasCore.view();
    if (path === '/api/action') {
      try { const result = await MinibasCore.action(body, saveState); return { ...MinibasCore.view(), ...result }; }
      catch (e) {
        if (e instanceof MinibasCore.UserError) throw Error(e.message);
        console.error(e); throw Error('処理に失敗しました。バックアップを保存し、アプリを開き直してください。');
      }
    }
    return { ok: true };
  });
  queue = job.catch(() => {});
  return job;
}

/* ================= バックアップ（ファイルに保存・送る） ================= */
const backupName = () => `minibas-v3-${today()}.json`;
const backupFile = () => new File([JSON.stringify(MinibasCore.state, null, 2)], backupName(), { type: 'application/json' });
async function markBackup() { try { await Store.put('lastBackup', today()); } catch (e) { } }
async function backupData() {
  await ready;
  const u = URL.createObjectURL(backupFile()), a = document.createElement('a');
  a.href = u; a.download = backupName(); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
  await markBackup(); tell('バックアップを「ダウンロード」に保存しました'); if (tab === 'settings') render();
}
async function shareBackup() {
  await ready;
  const f = backupFile();
  try { await navigator.share({ files: [f], title: 'ミニバス練習ノートのバックアップ' }); await markBackup(); if (tab === 'settings') render(); }
  catch (e) { if (e.name !== 'AbortError') tell('送れませんでした。「ファイルに保存」をためしてください'); }
}
const canShareFile = () => { try { return !!navigator.canShare?.({ files: [new File(['{}'], 'a.json', { type: 'application/json' })] }); } catch (e) { return false; } };

/* ================= 設定画面（スマホ用） ================= */
let lastBackup = null;
function settings() {
  const e = S.economy;
  Store.get('lastBackup').then(v => { if (v !== lastBackup) { lastBackup = v || ''; if (tab === 'settings') settings(); } }).catch(() => {});
  $('content').innerHTML = `
  <div class="grid two">
    <section class="card"><h2>💾 データ</h2>
      <p class="muted">記録はこのスマホの中だけに保存されます。機種変更・アプリの削除・ブラウザーのデータ削除で消えるので、ときどきバックアップしてください。</p>
      <p>${lastBackup ? `さいごのバックアップ：<b>${esc(jpDate(lastBackup))}</b>` : lastBackup === '' ? '<b class="danger">まだバックアップしていません</b>' : ''}</p>
      <div class="row section">${canShareFile() ? '<button class="primary" id="share">📤 バックアップを送る</button>' : ''}<button ${canShareFile() ? '' : 'class="primary"'} id="backup">⬇ ファイルに保存</button></div>
      <p class="muted">${canShareFile() ? '「送る」はLINE・メール・Googleドライブなどに保存できます。' : ''}「ファイルに保存」は「ダウンロード」フォルダーに入ります。</p>
      <div class="row section"><button id="restore">バックアップから復元</button></div>
      <p class="muted">復元すると、今の記録はすべて置き換わります。PC版のバックアップも読み込めます。</p>
      <input type="file" id="file" accept=".json,application/json" hidden>
    </section>
    <section class="card"><h2>🎬 演出</h2>
      <label class="row"><input id="cutinSetting" type="checkbox" ${S.data.settings.cutin ? 'checked' : ''} style="width:22px;height:22px"> 試合で技を使ったときにカットインを表示する</label>
      <div class="row section"><button id="openingFromSettings">▶ オープニングを見る</button><span class="muted">約1分30秒・音が出ます</span></div>
    </section>
    <section class="card"><h2>📊 SPの内訳</h2>
      <p>今のSP <b class="big" style="font-size:22px">${e.available}</b></p>
      <p class="muted">練習・視聴でもらったSP ${e.earned} ／ チャレンジのボーナス ${e.measure_bonus} ／ 装備の交換 ${e.exchanged} ／ ガチャで使ったSP ${e.spent}${e.debt ? ` ／ 精算待ち ${e.debt}` : ''}</p>
    </section>
    <section class="card"><h2>📱 このアプリ</h2>
      <p class="muted">ホーム画面に追加すると、アプリのように開けます（Chromeのメニュー「︙」→「ホーム画面に追加」）。一度開けば、電波がなくても動画以外は使えます。</p>
      <div class="row"><button id="checkUpdate">更新をたしかめる</button><span class="muted" id="updateMsg"></span></div>
    </section>
  </div>`;
  $('cutinSetting').onchange = ev => act('settings', { cutin: ev.target.checked });
  $('openingFromSettings').onclick = openOpening;
  $('backup').onclick = backupData;
  if ($('share')) $('share').onclick = shareBackup;
  $('restore').onclick = () => $('file').click();
  $('file').onchange = restoreData;
  $('checkUpdate').onclick = checkUpdate;
}

/* ================= 更新（新しい版が公開されたとき） ================= */
let swReg = null;
function showUpdate() {
  if ($('updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar'; bar.className = 'updatebar';
  bar.innerHTML = '<span>新しいバージョンがあります</span><button class="primary" id="updateNow">更新する</button><button id="updateLater" aria-label="あとで">あとで</button>';
  document.body.append(bar);
  $('updateNow').onclick = () => { if (DR || RUN || isMatchPlaying()) return tell('ゲームや試合が終わってから更新してね'); swReg?.waiting?.postMessage('update'); };
  $('updateLater').onclick = () => bar.remove();
}
async function checkUpdate() {
  const msg = $('updateMsg');
  if (!swReg) { if (msg) msg.textContent = 'この開き方では更新を確かめられません'; return; }
  if (msg) msg.textContent = '確かめています…';
  try { await swReg.update(); } catch (e) { if (msg) msg.textContent = '電波のあるところで、もう一度ためしてね'; return; }
  setTimeout(() => { if ($('updateMsg')) $('updateMsg').textContent = swReg.waiting || swReg.installing ? '新しいバージョンを準備しています' : '最新です'; }, 1500);
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // はじめて開いたとき（まだ古い版がない）は読みこみ直さない。「更新する」で新しい版に切りかわったときだけ読みこみ直す。
  let reloading = false; const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading && hadController) { reloading = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    const watch = w => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(); });
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate();
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(e => console.warn('service worker', e));
}

/* ================= ゲームのタッチ操作 ================= */
// 指を左右にすべらせて動く（指の動いた分だけ相棒が動く）、タップでシュート、上にスワイプでジャンプ。左下の ⏸ で一時停止、🔊 で音の切りかえ。
function touchControls(r, o) {
  const cv = r.cv, touches = new Map();
  let steer = null;
  const halfLane = () => { const p = o.proj(0, r.z), q = o.proj(1, r.z); return p && q ? Math.max(20, q.x - p.x) : 80; };
  cv.style.touchAction = 'none';
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = { x0: t.clientX, y0: t.clientY, t0: performance.now(), moved: false, swiped: false, tx0: r.x };
      touches.set(t.identifier, s);
      if (steer === null) steer = t.identifier;
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    if (r.paused) return;
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); if (!s) continue;
      const dx = t.clientX - s.x0, dy = t.clientY - s.y0;
      if (!s.moved && Math.hypot(dx, dy) > 12) s.moved = true;
      if (o.up && !s.swiped && dy < -45 && Math.abs(dy) > Math.abs(dx) * 1.3) { s.swiped = true; o.up(); }
      if (t.identifier === steer && s.moved && !s.swiped) o.steer(Math.max(-1, Math.min(1, s.tx0 + dx * 1.2 / halfLane())));
    }
  }, { passive: false });
  const end = e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); touches.delete(t.identifier);
      if (t.identifier === steer) steer = null;
      if (s && !s.moved && e.type === 'touchend' && performance.now() - s.t0 < 350 && !r.paused) o.tap();
    }
  };
  cv.addEventListener('touchend', end, { passive: false });
  cv.addEventListener('touchcancel', end, { passive: false });
  const btn = document.createElement('button');
  btn.className = 'gamepause'; btn.setAttribute('aria-label', '一時停止'); btn.textContent = '⏸';
  btn.onclick = () => { if (!r.paused && o.canPause()) o.pause(); };
  r.layer.append(btn);
  const snd = document.createElement('button');
  snd.className = 'gamesound'; snd.setAttribute('aria-label', '音の切りかえ'); snd.textContent = GFX.mute ? '🔇' : '🔊';
  snd.onclick = () => { gfxMute(!GFX.mute); snd.textContent = GFX.mute ? '🔇' : '🔊'; };
  r.layer.append(snd);
  const hint = document.createElement('div');
  hint.className = 'rotatehint'; hint.innerHTML = '<b>📱↻</b><p>スマホを横向きにしてね</p>';
  r.layer.append(hint);
  // 縦向きのあいだは一時停止しておく（横向きにしてから「つづける」）
  const portrait = matchMedia('(orientation: portrait)');
  const onTurn = () => {
    if (!r.layer.isConnected) return portrait.removeEventListener('change', onTurn);
    if (portrait.matches && !r.paused && o.canPause()) o.pause();
  };
  portrait.addEventListener('change', onTurn);
  setTimeout(onTurn, 600);   // 横向きへの切りかえが間に合わなかったとき
  landscape(true);
}
// ゲーム中は全画面・横向きにする（できない機種では「横向きにしてね」と出す）
async function landscape(on) {
  try {
    if (on) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape');
    } else {
      screen.orientation?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen();
    }
  } catch (e) { }
}
const pauseWhenHidden = () => {
  if (document.visibilityState !== 'hidden') return;
  if (DR && !DR.paused && (DR.phase === 'run' || DR.phase === 'count')) drPause(true);
  if (RUN && !RUN.paused && (RUN.phase === 'run' || RUN.phase === 'count')) runPause(true);
};
document.addEventListener('visibilitychange', pauseWhenHidden);

const pcDrOpen = drOpen, pcDrClose = drClose, pcRunOpen = runOpen, pcRunClose = runClose;
drOpen = function (...a) {
  pcDrOpen(...a);
  const r = DR;
  touchControls(r, { proj: drProj, steer: tx => { r.tx = tx; r.mouse = true; }, tap: () => drShoot(), up: () => drJump(),
    pause: () => drPause(true), canPause: () => r.phase === 'run' || r.phase === 'count' });
};
drClose = function (...a) { pcDrClose(...a); landscape(false); };
runOpen = function (...a) {
  pcRunOpen(...a);
  const r = RUN;
  touchControls(r, { proj: runProj, steer: tx => { r.tx = tx; }, tap: () => runSpecial(r),
    pause: () => runPause(true), canPause: () => r.phase === 'run' || r.phase === 'count' });
};
runClose = function (...a) { pcRunClose(...a); landscape(false); };

/* ================= 起動 ================= */
// PC版 app.js の最後にあった起動処理（build.py で外している）の代わり
req('/api/state').then(d => {
  S = d;
  for (const [k] of kinds) for (let stage = 1; stage <= 3; stage++) new Image().src = `assets/cutin_${k}${stage}.png`;
  render();
}).catch(e => { $('content').innerHTML = `<section class="card"><h2>データを読み込めませんでした</h2><p>${esc(e.message)}</p><p class="muted">記録は消していません。アプリを開き直してください。</p></section>`; });
