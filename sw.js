// オフラインでも開けるように、アプリのファイルをスマホに保存しておく。
// 73faa39b27f1 と ["./", "assets/cat1.png", "assets/cat2.png", "assets/cat3.png", "assets/cats.png", "assets/clouds.png", "assets/coach1.png", "assets/coach2.png", "assets/coach3.png", "assets/coach4.png", "assets/coach5.png", "assets/cutin_cat1.png", "assets/cutin_cat2.png", "assets/cutin_cat3.png", "assets/cutin_fluff1.png", "assets/cutin_fluff2.png", "assets/cutin_fluff3.png", "assets/cutin_rabbit1.png", "assets/cutin_rabbit2.png", "assets/cutin_rabbit3.png", "assets/dinos.png", "assets/fluff1.png", "assets/fluff2.png", "assets/fluff3.png", "assets/item_bottoms_1.png", "assets/item_bottoms_2.png", "assets/item_bottoms_3.png", "assets/item_bottoms_4.png", "assets/item_bottoms_5.png", "assets/item_candy.png", "assets/item_headband_1.png", "assets/item_headband_2.png", "assets/item_headband_3.png", "assets/item_headband_4.png", "assets/item_headband_5.png", "assets/item_megaphone.png", "assets/item_note.png", "assets/item_shoes_1.png", "assets/item_shoes_2.png", "assets/item_shoes_3.png", "assets/item_shoes_4.png", "assets/item_shoes_5.png", "assets/item_tops_1.png", "assets/item_tops_2.png", "assets/item_tops_3.png", "assets/item_tops_4.png", "assets/item_tops_5.png", "assets/item_wristband_1.png", "assets/item_wristband_2.png", "assets/item_wristband_3.png", "assets/item_wristband_4.png", "assets/item_wristband_5.png", "assets/rabbit1.png", "assets/rabbit2.png", "assets/rabbit3.png", "assets/shining_star_short.mp3", "assets/wolves.png", "core.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "index.html", "manifest.webmanifest", "mobile.css", "pwa.js", "static/app.css", "static/app.js", "static/dribble.js", "static/gamefx.js", "static/legacy.css", "static/legacy.js", "static/shoot.js"] は build.py が書きこむ。版が変わると新しいファイルを取りなおす。
const VERSION = '73faa39b27f1';
const FILES = ["./", "assets/cat1.png", "assets/cat2.png", "assets/cat3.png", "assets/cats.png", "assets/clouds.png", "assets/coach1.png", "assets/coach2.png", "assets/coach3.png", "assets/coach4.png", "assets/coach5.png", "assets/cutin_cat1.png", "assets/cutin_cat2.png", "assets/cutin_cat3.png", "assets/cutin_fluff1.png", "assets/cutin_fluff2.png", "assets/cutin_fluff3.png", "assets/cutin_rabbit1.png", "assets/cutin_rabbit2.png", "assets/cutin_rabbit3.png", "assets/dinos.png", "assets/fluff1.png", "assets/fluff2.png", "assets/fluff3.png", "assets/item_bottoms_1.png", "assets/item_bottoms_2.png", "assets/item_bottoms_3.png", "assets/item_bottoms_4.png", "assets/item_bottoms_5.png", "assets/item_candy.png", "assets/item_headband_1.png", "assets/item_headband_2.png", "assets/item_headband_3.png", "assets/item_headband_4.png", "assets/item_headband_5.png", "assets/item_megaphone.png", "assets/item_note.png", "assets/item_shoes_1.png", "assets/item_shoes_2.png", "assets/item_shoes_3.png", "assets/item_shoes_4.png", "assets/item_shoes_5.png", "assets/item_tops_1.png", "assets/item_tops_2.png", "assets/item_tops_3.png", "assets/item_tops_4.png", "assets/item_tops_5.png", "assets/item_wristband_1.png", "assets/item_wristband_2.png", "assets/item_wristband_3.png", "assets/item_wristband_4.png", "assets/item_wristband_5.png", "assets/rabbit1.png", "assets/rabbit2.png", "assets/rabbit3.png", "assets/shining_star_short.mp3", "assets/wolves.png", "core.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "index.html", "manifest.webmanifest", "mobile.css", "pwa.js", "static/app.css", "static/app.js", "static/dribble.js", "static/gamefx.js", "static/legacy.css", "static/legacy.js", "static/shoot.js"];
const CACHE = 'minibas-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('minibas-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 画面の「更新する」ボタンから呼ばれる
self.addEventListener('message', e => { if (e.data === 'update') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // YouTube などはそのまま
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    if (e.request.mode === 'navigate') { const home = await c.match('./'); if (home) return home; }
    return fetch(e.request);
  }));
});
