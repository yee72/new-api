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
import type { ContentPart } from '@/features/playground/types'

import type { ModelUsageAttachment } from '../types'
import { isModelUsageAttachmentExpired } from './attachments'
import { fetchModelUsageMediaBlob } from './media-download'

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

/** 将 data URL 的 MIME 纠正为附件声明类型（上游常依赖正确 MIME）。 */
export function ensureDataUrlMime(dataUrl: string, mime?: string): string {
  const trimmedMime = mime?.trim().split(';')[0]
  if (!trimmedMime || !dataUrl.startsWith('data:')) return dataUrl
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return dataUrl
  const meta = dataUrl.slice(5, comma) // after "data:"
  const payload = dataUrl.slice(comma)
  const currentMime = meta.split(';')[0]
  if (
    currentMime &&
    currentMime !== 'application/octet-stream' &&
    currentMime === trimmedMime
  ) {
    return dataUrl
  }
  const isBase64 = meta.includes(';base64')
  return `data:${trimmedMime}${isBase64 ? ';base64' : ''}${payload}`
}

export function contentPartFromAttachmentData(
  attachment: Pick<ModelUsageAttachment, 'kind' | 'name'>,
  dataUrl: string
): ContentPart {
  if (attachment.kind === 'image') {
    return { type: 'image_url', image_url: { url: dataUrl } }
  }
  return {
    type: 'file',
    file: {
      filename: attachment.name,
      file_data: dataUrl,
    },
  }
}

export function usableChatAttachments(
  attachments: ModelUsageAttachment[] | undefined
): ModelUsageAttachment[] {
  if (!attachments?.length) return []
  return attachments.filter(
    (item) =>
      Boolean(item.url) &&
      !isModelUsageAttachmentExpired(item)
  )
}

/** 拉取附件并组装 chat content（图片 → image_url，其它 → file）。 */
export async function buildChatUserContent(
  text: string,
  attachments?: ModelUsageAttachment[]
): Promise<string | ContentPart[]> {
  const usable = usableChatAttachments(attachments)
  if (usable.length === 0) return text

  const mediaParts: ContentPart[] = []
  for (const attachment of usable) {
    const blob = await fetchModelUsageMediaBlob(attachment.url!)
    const dataUrl = ensureDataUrlMime(
      await blobToDataURL(blob),
      attachment.mime
    )
    mediaParts.push(contentPartFromAttachmentData(attachment, dataUrl))
  }
  return [{ type: 'text', text: text || '' }, ...mediaParts]
}
