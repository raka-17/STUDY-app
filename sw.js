/* ── CSE 2027 Study App Service Worker v3.0 ── */
const CACHE_NAME = 'studyapp-v3';
const STATIC_ASSETS = ['./index.html', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-144.png', './icons/icon-96.png'];

/* ── INSTALL: cache all assets ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => {
      return Promise.allSettled(STATIC_ASSETS.map(url =>
        c.add(url).catch(() => console.log('Cache miss (ok):', url))
      ));
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: clean old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: offline-first strategy ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

/* ── PUSH NOTIFICATIONS ── */
self.addEventListener('push', e => {
  let data = { title: '📚 Study Reminder', body: "Time to study! Your goals are waiting.", icon: './icons/icon-192.png' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icons/icon-192.png',
      badge: './icons/icon-96.png',
      tag: 'study-reminder',
      renotify: true,
      requireInteraction: false,
      silent: false,
      vibrate: [200, 100, 200],
      data: { url: data.url || './' },
      actions: [
        { action: 'start', title: '▶ Start Session' },
        { action: 'dismiss', title: '✕ Dismiss' }
      ]
    })
  );
});

/* ── NOTIFICATION CLICK ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'start') {
    e.waitUntil(clients.openWindow(e.notification.data?.url || './index.html#sessions'));
  } else {
    e.waitUntil(clients.openWindow('./index.html'));
  }
});

/* ── PERIODIC BACKGROUND SYNC: check scheduled reminders ── */
self.addEventListener('periodicsync', e => {
  if (e.tag === 'study-reminders') {
    e.waitUntil(checkScheduledReminders());
  }
});

/* ── BACKGROUND SYNC ── */
self.addEventListener('sync', e => {
  if (e.tag === 'check-reminders') {
    e.waitUntil(checkScheduledReminders());
  }
});

/* ── MESSAGE from app: schedule notification ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'SCHEDULE_NOTIFICATION') {
    scheduleLocalNotification(e.data.payload);
  }
  if (e.data?.type === 'SHOW_NOTIFICATION') {
    const p = e.data.payload || {};
    self.registration.showNotification(p.title || '📚 Study Reminder', {
      body: p.body || 'Time to study!',
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      tag: p.tag || 'reminder',
      vibrate: [200, 100, 200],
      requireInteraction: false
    });
  }
});

/* ── Open IndexedDB for reminder storage ── */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('studyapp_db', 5);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = ev => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains('scheduled_notifs')) {
        db.createObjectStore('scheduled_notifs', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function checkScheduledReminders() {
  try {
    const db = await openDB();
    const tx = db.transaction('scheduled_notifs', 'readwrite');
    const store = tx.objectStore('scheduled_notifs');
    const all = await new Promise(r => { const req = store.getAll(); req.onsuccess = () => r(req.result); });
    const now = Date.now();
    for (const notif of all) {
      if (notif.scheduledAt <= now && !notif.fired) {
        await self.registration.showNotification(notif.title || '📚 Study Reminder', {
          body: notif.body || 'Time to study!',
          icon: './icons/icon-192.png',
          badge: './icons/icon-96.png',
          tag: notif.tag || 'scheduled',
          vibrate: [200, 100, 200]
        });
        store.delete(notif.id);
      }
    }
  } catch {}
}

function scheduleLocalNotification(payload) {
  openDB().then(db => {
    const tx = db.transaction('scheduled_notifs', 'readwrite');
    tx.objectStore('scheduled_notifs').add({ ...payload, fired: false });
  }).catch(() => {});
}

console.log('[SW] CSE 2027 Study App Service Worker v3.0 loaded');
