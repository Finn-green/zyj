// sw.js

// 核心配置：每次更新此文件时，请务必修改版本号！
const CACHE_VERSION = 'v1.1.1'; 
const CACHE_NAME = `octopus-inker-${CACHE_VERSION}`;

// 需要预缓存的核心文件（App Shell）
const urlsToCache = [
  './',
  './index.html',
  'https://unpkg.com/dexie/dist/dexie.js',
  // 如果你有manifest.json或主要JS/CSS文件，也应加在这里
  // './manifest.json',
  // './style.css',
  // './app.js' 
];

// 图片缓存的特定名称和最大数量限制
const IMAGE_CACHE_NAME = `octopus-images-${CACHE_VERSION}`;
const MAX_IMAGE_CACHE_COUNT = 150; // 最多缓存150张图片，您可以调整此数字

// 安装 Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened main cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 激活 Service Worker，并清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 如果缓存名称不是当前版本的主缓存或图片缓存，则删除它
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 截取网络请求
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // 对图片请求应用“过期后重新验证” (Stale-While-Revalidate) 策略
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(requestUrl.pathname) || requestUrl.hostname === 'image.pollinations.ai') {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // 优先返回缓存的图片（如果有），同时在后台发起网络请求更新缓存
          const fetchPromise = fetch(event.request).then(networkResponse => {
            // 请求成功后，更新缓存
            cache.put(event.request, networkResponse.clone());
            // **核心：检查并修剪图片缓存数量**
            limitCacheSize(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_COUNT);
            return networkResponse;
          });
          return response || fetchPromise;
        });
      })
    );
    return;
  }
  
  // 对其他所有请求（HTML, JS, CSS等）应用“网络优先”策略
  event.respondWith(
    fetch(event.request).catch(() => {
      // 如果网络请求失败（例如离线），则尝试从缓存中返回
      return caches.match(event.request);
    })
  );
});

// **核心辅助函数：限制缓存大小**
function limitCacheSize(cacheName, maxItems) {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxItems) {
        // 删除最早缓存的条目，直到数量达标
        cache.delete(keys[0]).then(() => limitCacheSize(cacheName, maxItems));
      }
    });
  });
}

// **新增：监听来自页面的消息，用于手动清除缓存**
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'clear_caches') {
    console.log('Received clear caches command. Deleting all caches...');
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    }).then(() => {
      console.log('All caches deleted.');
      // 向所有客户端发送成功消息
      event.ports[0].postMessage({ status: 'success' });
    });
  }
});
