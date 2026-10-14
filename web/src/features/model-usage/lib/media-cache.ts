/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

const DB_NAME = 'model-usage-media-cache'
const DB_VERSION = 1
const STORE_NAME = 'blobs'

/** 单条约 50MB；总容量约 200MB，超出按最久未用淘汰 */
const MAX_ENTRY_BYTES = 50 * 1024 * 1024
const MAX_TOTAL_BYTES = 200 * 1024 * 1024
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type CachedMediaRecord = {
  cacheKey: string
  userId: number
  blob: Blob
  size: number
  cachedAt: number
  lastAccessAt: number
  /** URL 上的 expires（秒）；0 表示无附件过期 */
  urlExpiresAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' })
        store.createIndex('userId', 'userId', { unique: false })
        store.createIndex('lastAccessAt', 'lastAccessAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('indexedDB open failed'))
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('indexedDB request failed'))
  })
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () =>
      reject(tx.error ?? new Error('indexedDB transaction failed'))
    tx.onabort = () =>
      reject(tx.error ?? new Error('indexedDB transaction aborted'))
  })
}

/** 稳定缓存键：去掉 access 等易变参数，保留 pathname（含用户隔离的对象路径）。 */
export function modelUsageMediaCacheKey(url: string): string {
  try {
    const parsed = new URL(url, 'https://model-usage.local')
    return parsed.pathname
  } catch {
    return url.trim()
  }
}

/** 从媒体 URL 读取 expires（秒）；无效则 0。 */
export function modelUsageMediaUrlExpiresAt(url: string): number {
  try {
    const parsed = new URL(url, 'https://model-usage.local')
    const raw = parsed.searchParams.get('expires')
    if (!raw) return 0
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

function recordCacheKey(userId: number, pathKey: string): string {
  return `${userId}:${pathKey}`
}

function isRecordFresh(record: CachedMediaRecord, nowMs: number): boolean {
  if (nowMs - record.cachedAt > MAX_AGE_MS) return false
  if (record.urlExpiresAt > 0 && nowMs / 1000 > record.urlExpiresAt) {
    return false
  }
  return true
}

async function listAllRecords(
  store: IDBObjectStore
): Promise<CachedMediaRecord[]> {
  return idbRequest(store.getAll() as IDBRequest<CachedMediaRecord[]>)
}

async function evictIfNeeded(
  store: IDBObjectStore,
  incomingSize: number
): Promise<void> {
  const records = await listAllRecords(store)
  let total = records.reduce((sum, item) => sum + (item.size || 0), 0) + incomingSize
  if (total <= MAX_TOTAL_BYTES) return

  const ordered = [...records].sort(
    (a, b) => (a.lastAccessAt || 0) - (b.lastAccessAt || 0)
  )
  for (const item of ordered) {
    if (total <= MAX_TOTAL_BYTES) break
    store.delete(item.cacheKey)
    total -= item.size || 0
  }
}

export async function getCachedModelUsageMedia(
  userId: number,
  url: string
): Promise<Blob | null> {
  if (userId <= 0) return null
  const pathKey = modelUsageMediaCacheKey(url)
  if (!pathKey) return null
  const urlExpiresAt = modelUsageMediaUrlExpiresAt(url)
  const nowMs = Date.now()
  if (urlExpiresAt > 0 && nowMs / 1000 > urlExpiresAt) {
    return null
  }

  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const key = recordCacheKey(userId, pathKey)
      const record = (await idbRequest(
        store.get(key)
      )) as CachedMediaRecord | undefined
      if (!record?.blob) {
        await idbTransactionDone(tx)
        return null
      }
      if (!isRecordFresh(record, nowMs)) {
        store.delete(key)
        await idbTransactionDone(tx)
        return null
      }
      store.put({
        ...record,
        lastAccessAt: nowMs,
      })
      await idbTransactionDone(tx)
      return record.blob
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function putCachedModelUsageMedia(
  userId: number,
  url: string,
  blob: Blob
): Promise<void> {
  if (userId <= 0 || !blob || blob.size <= 0) return
  if (blob.size > MAX_ENTRY_BYTES) return
  const pathKey = modelUsageMediaCacheKey(url)
  if (!pathKey) return
  const urlExpiresAt = modelUsageMediaUrlExpiresAt(url)
  const nowMs = Date.now()
  if (urlExpiresAt > 0 && nowMs / 1000 > urlExpiresAt) return

  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      await evictIfNeeded(store, blob.size)
      const record: CachedMediaRecord = {
        cacheKey: recordCacheKey(userId, pathKey),
        userId,
        blob,
        size: blob.size,
        cachedAt: nowMs,
        lastAccessAt: nowMs,
        urlExpiresAt,
      }
      store.put(record)
      await idbTransactionDone(tx)
    } finally {
      db.close()
    }
  } catch {
    // 持久化失败不影响展示
  }
}

/** 清理指定用户（或全部）的媒体磁盘缓存。 */
export async function clearModelUsageMediaCache(
  userId?: number
): Promise<void> {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      if (userId == null || userId <= 0) {
        store.clear()
        await idbTransactionDone(tx)
        return
      }
      const index = store.index('userId')
      const keys = await idbRequest(
        index.getAllKeys(IDBKeyRange.only(userId))
      )
      for (const key of keys) {
        store.delete(key)
      }
      await idbTransactionDone(tx)
    } finally {
      db.close()
    }
  } catch {
    // ignore
  }
}
