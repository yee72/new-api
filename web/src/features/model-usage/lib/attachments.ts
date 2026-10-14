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
import type { ModelUsageAttachment } from '../types'

export function isModelUsageAttachmentExpired(
  attachment: Pick<ModelUsageAttachment, 'expires_at' | 'url'>
): boolean {
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
    Boolean(attachment.url) &&
    !isModelUsageAttachmentExpired(attachment)
  )
}
