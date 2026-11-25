/*
 * Service worker: simpan semua berkas aplikasi agar simulator bisa dipakai tanpa internet.
 * Ganti CACHE setiap rilis supaya versi lama dibersihkan.
 */
const CACHE = 'ut-sim-v1.1.0';
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './docs/panduan.html',
  './docs/guide-en.html',
  './docs/guide.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  "./src/calibration.js",
  "./src/config.js",
  "./src/corrosion.js",
  "./src/dac.js",
  "./src/defects.js",
  "./src/edu.js",
  "./src/editor.js",
  "./src/exam.js",
  "./src/geometry.js",
  "./src/i18n-lessons-en.js",
  "./src/i18n.js",
  "./src/imaging.js",
  "./src/main.js",
  "./src/physics.js",
  "./src/raypath.js",
  "./src/rekap.js",
  "./src/render-tubular.js",
  "./src/render-ascan.js",
  "./src/render-images.js",
  "./src/render-section.js",
  "./src/render-topview.js",
  "./src/report.js",
  "./src/scanplan.js",
  "./src/specimens.js",
  "./src/tubular.js",
  "./src/tutorial.js",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ut-sim-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache dulu, lalu jaringan (berkas baru dari jaringan ikut disimpan)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }))
  );
});
