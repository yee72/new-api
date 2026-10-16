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
import { selectChatHistoryMessages } from '../chat-history'

function msg(
  partial: Partial<ModelUsageMessage> &
    Pick<ModelUsageMessage, 'id' | 'turnId' | 'role' | 'content' | 'status'>
): ModelUsageMessage {
  return {
    mediaType: 'text',
    ...partial,
  }
}

describe('selectChatHistoryMessages', () => {
  it('keeps attachments only for turns with a successful assistant reply', () => {
    const attachment = {
      id: 'a1',
      name: 'deck.pptx',
      kind: 'ppt' as const,
      expires_at: Date.now() / 1000 + 3600,
      url: '/api/model-usage/media/x.pptx',
    }
    const messages = [
      msg({
        id: 'u1',
        turnId: 't1',
        role: 'user',
        content: '看这个 ppt',
        status: 'done',
        attachments: [attachment],
      }),
      msg({
        id: 'a1',
        turnId: 't1',
        role: 'assistant',
        content: 'Chat request failed',
        status: 'error',
      }),
      msg({
        id: 'u2',
        turnId: 't2',
        role: 'user',
        content: '你好',
        status: 'done',
        attachments: [attachment],
      }),
      msg({
        id: 'a2',
        turnId: 't2',
        role: 'assistant',
        content: '你好！',
        status: 'done',
      }),
    ]

    const history = selectChatHistoryMessages(messages)
    expect(history).toHaveLength(3)
    expect(history[0]?.attachments).toBeUndefined()
    expect(history[0]?.content).toBe('看这个 ppt')
    expect(history[1]?.content).toBe('你好')
    expect(history[1]?.attachments).toEqual([attachment])
    expect(history[2]?.content).toBe('你好！')
  })

  it('excludes the regenerate turn and strips orphan user attachments', () => {
    const attachment = {
      id: 'a1',
      name: 'a.pptx',
      kind: 'ppt' as const,
      expires_at: Date.now() / 1000 + 3600,
      url: '/media/a.pptx',
    }
    const messages = [
      msg({
        id: 'u1',
        turnId: 't1',
        role: 'user',
        content: '带附件',
        status: 'done',
        attachments: [attachment],
      }),
      msg({
        id: 'u2',
        turnId: 't2',
        role: 'user',
        content: '重生成中',
        status: 'done',
        attachments: [attachment],
      }),
      msg({
        id: 'a2',
        turnId: 't2',
        role: 'assistant',
        content: '旧回复',
        status: 'done',
      }),
    ]

    const history = selectChatHistoryMessages(messages, {
      excludeTurnId: 't2',
    })
    expect(history).toHaveLength(1)
    expect(history[0]?.turnId).toBe('t1')
    expect(history[0]?.attachments).toBeUndefined()
  })

  it('keeps only quoted turns when includeTurnIds is set', () => {
    const messages = [
      msg({
        id: 'u1',
        turnId: 't1',
        role: 'user',
        content: '第一轮',
        status: 'done',
      }),
      msg({
        id: 'a1',
        turnId: 't1',
        role: 'assistant',
        content: '答复一',
        status: 'done',
      }),
      msg({
        id: 'u2',
        turnId: 't2',
        role: 'user',
        content: '第二轮',
        status: 'done',
      }),
      msg({
        id: 'a2',
        turnId: 't2',
        role: 'assistant',
        content: '答复二',
        status: 'done',
      }),
    ]

    const history = selectChatHistoryMessages(messages, {
      includeTurnIds: ['t2'],
    })
    expect(history.map((item) => item.id)).toEqual(['u2', 'a2'])
  })
})
