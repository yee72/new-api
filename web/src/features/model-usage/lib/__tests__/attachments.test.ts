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
import { describe, expect, it } from 'vitest'

import {
  canPreviewModelUsageAttachment,
  isModelUsageAttachmentExpired,
  messagesForPersist,
  optimisticAttachmentFromLocal,
  persistableAttachments,
} from '../attachments'
import type { LocalAttachment } from '../../types'

describe('model usage attachment expiry', () => {
  it('marks attachments past expires_at as expired', () => {
    expect(
      isModelUsageAttachmentExpired({
        expires_at: Math.floor(Date.now() / 1000) - 10,
        url: '/api/model-usage/media/model-usage/attachments/1/a/x.png',
      })
    ).toBe(true)
  })

  it('keeps optimistic local attachments visible while uploading', () => {
    expect(
      isModelUsageAttachmentExpired({
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        pending: true,
      })
    ).toBe(false)
    expect(
      canPreviewModelUsageAttachment({
        id: 'local-1',
        name: 'shot.png',
        kind: 'image',
        local_preview_url: 'blob:http://localhost/preview',
        pending: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toBe(true)
  })

  it('allows image preview only when not expired', () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    expect(
      canPreviewModelUsageAttachment({
        id: '1',
        name: 'a.png',
        kind: 'image',
        url: `/api/model-usage/media/model-usage/attachments/1/a/a.png?expires=${future}`,
        expires_at: future,
      })
    ).toBe(true)
    expect(
      canPreviewModelUsageAttachment({
        id: '2',
        name: 'a.pptx',
        kind: 'ppt',
        url: `/api/model-usage/media/model-usage/attachments/1/a/a.pptx?expires=${future}`,
        expires_at: future,
      })
    ).toBe(false)
  })

  it('strips optimistic fields before persist', () => {
    const local: LocalAttachment = {
      id: 'l1',
      name: 'a.png',
      ext: 'png',
      size: 12,
      type: 'image/png',
      kind: 'image',
      file: new File(['x'], 'a.png', { type: 'image/png' }),
      previewUrl: 'blob:http://localhost/a',
    }
    const optimistic = optimisticAttachmentFromLocal(local)
    expect(optimistic.pending).toBe(true)
    expect(persistableAttachments([optimistic])).toBeUndefined()

    const future = Math.floor(Date.now() / 1000) + 3600
    const persisted = messagesForPersist([
      {
        id: 'm1',
        attachments: [
          optimistic,
          {
            id: 's1',
            name: 'a.png',
            kind: 'image' as const,
            url: `/api/model-usage/media/x.png?expires=${future}`,
            expires_at: future,
          },
        ],
      },
    ])
    expect(persisted[0]?.attachments).toHaveLength(1)
    expect(persisted[0]?.attachments?.[0]?.id).toBe('s1')
  })
})
