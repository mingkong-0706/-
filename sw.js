/* ============================================================
 *  Service Worker —— 角色扮演 PWA
 *  策略：
 *   - HTML / JS / CSS：网络优先（保证代码最新）
 *   - 图片等静态资源：缓存优先（加载更快）
 *   - API 请求：不缓存
 * ============================================================ */
const CACHE_VERSION = 'v4.1.0';
const CACHE_NAME = 'roleplay-' + CACHE_VERSION;

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-180.png',
  './icon-512.png'
];

/* ---------- 安装：预缓存核心资源 ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] 预缓存失败:', url, err))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

/* ---------- 激活：清理旧版本缓存 ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('roleplay-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- 请求拦截 ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理 GET
  if (req.method !== 'GET') return;

  // 不缓存 API 请求
  if (
    url.pathname.includes('/chat/completions') ||
    url.hostname.includes('api.') ||
    url.hostname.includes('deepseek') ||
    url.hostname.includes('openai') ||
    url.hostname.includes('siliconflow') ||
    url.hostname.includes('moonshot') ||
    url.hostname.includes('bigmodel') ||
    url.hostname.includes('dashscope') ||
    url.hostname.includes('jianguoyun')
  ) return;

  // 带 Authorization 的请求不缓存（WebDAV 等）
  if (req.headers.get('authorization')) return;

  // 跨域资源不缓存
  if (url.origin !== self.location.origin) return;

  // HTML / JS / CSS：网络优先
  const isDoc = req.mode === 'navigate' || /\.(html|js|css)$/.test(url.pathname);
  if (isDoc) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('./index.html'))
        )
    );
    return;
  }

  // 其他静态资源：缓存优先
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      });
    })
  );
});

/* ---------- 消息通道（可用于手动清缓存 / 跳过等待） ---------- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});