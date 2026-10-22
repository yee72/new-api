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

import type { ModelUsageMessage } from '../../types'
import {
  stageAttachmentsForEdit,
  stageAttachmentsFromWorks,
  takeAttachmentsUpToMax,
} from '../composer-stage'

function msg(
  overrides: Partial<ModelUsageMessage> &
    Pick<ModelUsageMessage, 'id' | 'turnId' | 'role'>
): ModelUsageMessage {
  return {
    content: '',
    status: 'done',
    mediaType: 'image',
    ...overrides,
  }
}

describe('composer-stage', () => {
  it('edit skips attachments when assistant failed', () => {
    const user = msg({
      id: 'u1',
      turnId: 't1',
      role: 'user',
      content: 'a pig',
      attachments: [
        {
          id: 'a',
          name: 'ref.png',
          kind: 'image',
          url: 'https://example.com/a.png',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      ],
    })
    const assistant = msg({
      id: 'a1',
      turnId: 't1',
      role: 'assistant',
      status: 'error',
      content: 'failed',
    })
    const staged = stageAttachmentsForEdit({
      userMessage: user,
      assistantMessage: assistant,
    })
    expect(staged.skipAttachments).toBe(true)
    expect(staged.attachments).toEqual([])
  })

  it('edit drops expired user attachments and flags them', () => {
    const expired = Math.floor(Date.now() / 1000) - 10
    const user = msg({
      id: 'u1',
      turnId: 't1',
      role: 'user',
      content: 'hi',
      attachments: [
        {
          id: 'ok',
          name: 'ok.png',
          kind: 'image',
          url: 'https://example.com/ok.png',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        {
          id: 'old',
          name: 'old.png',
          kind: 'image',
          url: 'https://example.com/old.png',
          expires_at: expired,
        },
      ],
    })
    const staged = stageAttachmentsForEdit({ userMessage: user })
    expect(staged.hadExpired).toBe(true)
    expect(staged.attachments).toHaveLength(1)
    expect(staged.attachments[0]?.id).toBe('ok')
  })

  it('quotes all assistant works and truncates to max', () => {
    const assistant = msg({
      id: 'a1',
      turnId: 't1',
      role: 'assistant',
      images: [
        'https://example.com/1.png',
        'https://example.com/2.png',
        'https://example.com/3.png',
      ],
    })
    const staged = stageAttachmentsFromWorks(assistant)
    expect(staged.attachments).toHaveLength(3)
    const limited = takeAttachmentsUpToMax(staged.attachments, 2)
    expect(limited.truncated).toBe(true)
    expect(limited.items).toHaveLength(2)
  })
})
