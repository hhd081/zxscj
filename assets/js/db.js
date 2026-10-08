/*
 * db.js — 在线收藏夹 数据层
 * 基于 IndexedDB 的轻量 Promise 封装，无需后端，数据保存在浏览器本地。
 */
(function (global) {
  'use strict';

  const DB_NAME = 'bookmarks-db';
  const DB_VERSION = 1;
  const STORE_ITEMS = 'items';
  const STORE_SETTINGS = 'settings';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }
      const req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_ITEMS)) {
          const store = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function store(name, mode) {
    return openDB().then((db) => db.transaction(name, mode).objectStore(name));
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const Store = {
    async put(item) {
      const s = await store(STORE_ITEMS, 'readwrite');
      return reqToPromise(s.put(item));
    },
    async delete(id) {
      const s = await store(STORE_ITEMS, 'readwrite');
      return reqToPromise(s.delete(id));
    },
    async getAll() {
      const s = await store(STORE_ITEMS, 'readonly');
      const result = await reqToPromise(s.getAll());
      return result || [];
    },
    async get(id) {
      const s = await store(STORE_ITEMS, 'readonly');
      return reqToPromise(s.get(id));
    },
    async clearAll() {
      const s = await store(STORE_ITEMS, 'readwrite');
      return reqToPromise(s.clear());
    },
    async getSetting(key) {
      const s = await store(STORE_SETTINGS, 'readonly');
      const row = await reqToPromise(s.get(key));
      return row ? row.value : undefined;
    },
    async setSetting(key, value) {
      const s = await store(STORE_SETTINGS, 'readwrite');
      return reqToPromise(s.put({ key, value }));
    },
  };

  global.Store = Store;
})(window);
