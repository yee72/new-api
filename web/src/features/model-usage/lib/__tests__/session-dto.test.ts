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

import type { ModelUsageMessage, ModelUsageSessionDTO } from '../../types'

function messagesFromDTO(dto: ModelUsageSessionDTO): ModelUsageMessage[] {
  return dto.messages ?? []
}

describe('model usage session dto mapping', () => {
  it('keeps stable media urls and video task ids from the server', () => {
    const dto: ModelUsageSessionDTO = {
      model_name: 'flux',
      messages: [
        {
          id: 'u1',
          turnId: 't1',
          role: 'user',
          content: 'draw a cat',
          status: 'done',
          mediaType: 'image',
        },
        {
          id: 'a1',
          turnId: 't1',
          role: 'assistant',
          content: '',
          status: 'done',
          mediaType: 'image',
          images: ['/api/model-usage/media/model-usage%2F1%2Fflux%2Fa1%2F0.png?access=abc'],
        },
        {
          id: 'a2',
          turnId: 't2',
          role: 'assistant',
          content: 'generating',
          status: 'pending',
          mediaType: 'video',
          videos: [{ task_id: 'task_123' }],
        },
      ],
    }

    const messages = messagesFromDTO(dto)
    expect(messages[1].images?.[0]).toContain('/api/model-usage/media/')
    expect(messages[2].videos?.[0].task_id).toBe('task_123')
    expect(messages[2].status).toBe('pending')
  })
})
