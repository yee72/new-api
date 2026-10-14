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
import { api } from '@/lib/api'

/** 模型使用媒体短链：<img>/<video> 无法带 Bearer，需经 api 拉取再转 blob。 */
export function isModelUsageMediaURL(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/api/model-usage/media/')) return true
  try {
    const parsed = new URL(trimmed, window.location.origin)
    return parsed.pathname.startsWith('/api/model-usage/media/')
  } catch {
    return false
  }
}

function mediaRequestPath(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

/** 拉取媒体 blob；短链走带 Bearer 的 api，其它 URL 用 fetch。 */
export async function fetchModelUsageMediaBlob(
  url: string,
  signal?: AbortSignal
): Promise<Blob> {
  if (isModelUsageMediaURL(url)) {
    const response = await api.get<Blob>(mediaRequestPath(url), {
      responseType: 'blob',
      signal,
      disableDuplicate: true,
      skipErrorHandler: true,
      skipBusinessError: true,
    })
    return response.data
  }
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`media download failed: ${response.status}`)
  }
  return await response.blob()
}

function extensionFromBlob(blob: Blob, kind: 'image' | 'video'): string {
  const type = blob.type.toLowerCase()
  if (type.includes('png')) return 'png'
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg'
  if (type.includes('webp')) return 'webp'
  if (type.includes('gif')) return 'gif'
  if (type.includes('mp4')) return 'mp4'
  if (type.includes('webm')) return 'webm'
  if (type.includes('quicktime')) return 'mov'
  return kind === 'video' ? 'mp4' : 'png'
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url, window.location.origin)
    const base = parsed.pathname.split('/').filter(Boolean).pop()
    if (base && /\.[a-z0-9]+$/i.test(base)) return decodeURIComponent(base)
  } catch {
    // ignore
  }
  return undefined
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function downloadModelUsageMedia(
  url: string,
  options?: {
    kind?: 'image' | 'video'
    filename?: string
    signal?: AbortSignal
  }
): Promise<void> {
  const blob = await fetchModelUsageMediaBlob(url, options?.signal)
  const kind =
    options?.kind ??
    (blob.type.startsWith('video/') ? 'video' : 'image')
  const filename =
    options?.filename ??
    filenameFromUrl(url) ??
    `model-usage-${kind}-${Date.now()}.${extensionFromBlob(blob, kind)}`
  triggerBlobDownload(blob, filename)
}
