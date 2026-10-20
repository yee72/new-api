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
import type { LocalAttachment, ModelUsageAttachment } from '../types'

/** 展示用附件类型（图标与悬停文案） */
export type ModelUsageAttachmentDisplayType =
  | 'image'
  | 'video'
  | 'pdf'
  | 'sheet'
  | 'ppt'
  | 'doc'
  | 'file'

export function attachmentDisplayUrl(
  attachment: Pick<ModelUsageAttachment, 'url' | 'local_preview_url'>
): string | undefined {
  return attachment.local_preview_url || attachment.url || undefined
}

export function isModelUsageAttachmentExpired(
  attachment: Pick<
    ModelUsageAttachment,
    'expires_at' | 'url' | 'local_preview_url' | 'pending'
  >
): boolean {
  // 上传中的乐观附件始终可展示
  if (attachment.pending || attachment.local_preview_url) {
    return false
  }
  if (attachment.expires_at > 0 && Date.now() / 1000 > attachment.expires_at) {
    return true
  }
  if (!attachment.url) return true
  try {
    const parsed = new URL(attachment.url, window.location.origin)
    const expires = Number(parsed.searchParams.get('expires') || 0)
    return expires > 0 && Date.now() / 1000 > expires
  } catch {
    return false
  }
}

export function canPreviewModelUsageAttachment(
  attachment: ModelUsageAttachment
): boolean {
  return (
    attachment.kind === 'image' &&
    Boolean(attachmentDisplayUrl(attachment)) &&
    !isModelUsageAttachmentExpired(attachment)
  )
}

/** 发送瞬间用本地文件生成气泡占位附件 */
export function optimisticAttachmentFromLocal(
  local: LocalAttachment
): ModelUsageAttachment {
  const display =
    local.kind === 'image' ? 'image' : displayTypeFromExt(local.ext)
  const kind: ModelUsageAttachment['kind'] =
    display === 'image' ||
    display === 'pdf' ||
    display === 'sheet' ||
    display === 'ppt' ||
    display === 'doc'
      ? display
      : 'file'
  return {
    id: local.id,
    name: local.name,
    mime: local.type || undefined,
    size: local.size,
    kind,
    local_preview_url: local.previewUrl,
    pending: true,
    // 占位用远未到期时间，避免无 url 时被当成过期
    expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }
}

/** 落库前去掉仅前端字段与 blob 预览 */
export function persistableAttachments(
  attachments: ModelUsageAttachment[] | undefined
): ModelUsageAttachment[] | undefined {
  if (!attachments?.length) return undefined
  const out: ModelUsageAttachment[] = []
  for (const item of attachments) {
    if (item.pending || item.local_preview_url) continue
    const url = item.url?.trim()
    if (!url || url.startsWith('blob:')) continue
    out.push({
      id: item.id,
      name: item.name,
      mime: item.mime,
      size: item.size,
      kind: item.kind,
      url,
      expires_at: item.expires_at,
    })
  }
  return out.length > 0 ? out : undefined
}

/** 会话落库前清洗消息中的乐观附件字段 */
export function messagesForPersist<T extends { attachments?: ModelUsageAttachment[] }>(
  messages: T[]
): T[] {
  return messages.map((message) => ({
    ...message,
    attachments: persistableAttachments(message.attachments),
  }))
}

export function displayTypeFromExt(ext: string): ModelUsageAttachmentDisplayType {
  switch (ext.toLowerCase()) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'bmp':
      return 'image'
    case 'mp4':
    case 'webm':
    case 'mov':
    case 'mkv':
    case 'm4v':
      return 'video'
    case 'pdf':
      return 'pdf'
    case 'xls':
    case 'xlsx':
    case 'csv':
      return 'sheet'
    case 'ppt':
    case 'pptx':
      return 'ppt'
    case 'doc':
    case 'docx':
    case 'txt':
    case 'md':
      return 'doc'
    default:
      return 'file'
  }
}

export function displayTypeFromAttachment(
  attachment: Pick<ModelUsageAttachment, 'kind' | 'name'>
): ModelUsageAttachmentDisplayType {
  if (
    attachment.kind === 'image' ||
    attachment.kind === 'pdf' ||
    attachment.kind === 'sheet' ||
    attachment.kind === 'ppt' ||
    attachment.kind === 'doc'
  ) {
    return attachment.kind
  }
  const idx = attachment.name.lastIndexOf('.')
  const ext = idx >= 0 ? attachment.name.slice(idx + 1) : ''
  return displayTypeFromExt(ext)
}

/** i18n key for attachment type label */
export function attachmentTypeLabelKey(
  type: ModelUsageAttachmentDisplayType
): string {
  switch (type) {
    case 'image':
      return 'Image'
    case 'video':
      return 'Video'
    case 'pdf':
      return 'PDF'
    case 'sheet':
      return 'Spreadsheet'
    case 'ppt':
      return 'Presentation'
    case 'doc':
      return 'Document'
    default:
      return 'File'
  }
}
