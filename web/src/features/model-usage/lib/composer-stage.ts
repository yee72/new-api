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
import { MODEL_USAGE_MAX_ATTACHMENTS } from '../constants'
import type { ModelUsageAttachment, ModelUsageMessage } from '../types'
import { isModelUsageAttachmentExpired } from './attachments'

function parseExpiresAt(url: string): number {
  try {
    const parsed = new URL(url, 'http://local.invalid')
    const expires = Number(parsed.searchParams.get('expires') || 0)
    if (expires > 0) return expires
  } catch {
    // ignore
  }
  return Math.floor(Date.now() / 1000) + 24 * 60 * 60
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url, 'http://local.invalid').pathname
    const base = path.split('/').filter(Boolean).pop()
    if (base && /\.[a-z0-9]+$/i.test(base)) return decodeURIComponent(base)
  } catch {
    // ignore
  }
  return fallback
}

function isMediaUrlExpired(url: string): boolean {
  try {
    const parsed = new URL(url, 'http://local.invalid')
    const expires = Number(parsed.searchParams.get('expires') || 0)
    return expires > 0 && Date.now() / 1000 > expires
  } catch {
    return false
  }
}

/** 截断到最大附件数 */
export function takeAttachmentsUpToMax(
  items: ModelUsageAttachment[],
  max = MODEL_USAGE_MAX_ATTACHMENTS
): { items: ModelUsageAttachment[]; truncated: boolean } {
  if (items.length <= max) return { items, truncated: false }
  return { items: items.slice(0, max), truncated: true }
}

/**
 * 编辑用户气泡：收集未过期上传附件。
 * 同轮助手失败时按产品要求不带附件，只回填文本。
 */
export function stageAttachmentsForEdit(options: {
  userMessage: ModelUsageMessage
  assistantMessage?: ModelUsageMessage
}): {
  attachments: ModelUsageAttachment[]
  hadExpired: boolean
  skipAttachments: boolean
} {
  const failed = options.assistantMessage?.status === 'error'
  if (failed) {
    return { attachments: [], hadExpired: false, skipAttachments: true }
  }
  const source = options.userMessage.attachments ?? []
  const usable: ModelUsageAttachment[] = []
  let hadExpired = false
  for (const item of source) {
    if (!item.url?.trim()) {
      hadExpired = true
      continue
    }
    if (isModelUsageAttachmentExpired(item)) {
      hadExpired = true
      continue
    }
    usable.push({
      id: item.id,
      name: item.name,
      mime: item.mime,
      size: item.size,
      kind: item.kind,
      url: item.url,
      expires_at: item.expires_at,
    })
  }
  return {
    attachments: usable,
    hadExpired,
    skipAttachments: false,
  }
}

/** 引用助手作品：全部图片/视频短链转为附件（跳过过期） */
export function stageAttachmentsFromWorks(message: ModelUsageMessage): {
  attachments: ModelUsageAttachment[]
  hadExpired: boolean
} {
  const attachments: ModelUsageAttachment[] = []
  let hadExpired = false
  let index = 0
  for (const url of message.images ?? []) {
    if (!url?.trim()) continue
    if (isMediaUrlExpired(url)) {
      hadExpired = true
      continue
    }
    attachments.push({
      id: `${message.id}:image:${index}`,
      name: fileNameFromUrl(url, `work-${index + 1}.png`),
      mime: 'image/png',
      kind: 'image',
      url,
      expires_at: parseExpiresAt(url),
    })
    index += 1
  }
  for (const video of message.videos ?? []) {
    const url = video.url?.trim()
    if (!url) continue
    if (isMediaUrlExpired(url)) {
      hadExpired = true
      continue
    }
    attachments.push({
      id: `${message.id}:video:${index}`,
      name: fileNameFromUrl(url, `work-${index + 1}.mp4`),
      mime: 'video/mp4',
      // 视频作品以 file 落附件区；任务上送仍只取 kind=image
      kind: 'file',
      url,
      expires_at: parseExpiresAt(url),
    })
    index += 1
  }
  return { attachments, hadExpired }
}
