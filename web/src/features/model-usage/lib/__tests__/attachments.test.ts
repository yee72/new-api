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
} from '../attachments'

describe('model usage attachment expiry', () => {
  it('marks attachments past expires_at as expired', () => {
    expect(
      isModelUsageAttachmentExpired({
        expires_at: Math.floor(Date.now() / 1000) - 10,
        url: '/api/model-usage/media/model-usage/attachments/1/a/x.png',
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
})
