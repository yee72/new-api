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
import { SSE } from 'sse.js'

import { getFreshAuthHeaders } from '@/lib/api'

import { API_ENDPOINTS } from '@/features/playground/constants'
import { createStreamRequestController } from '@/features/playground/hooks/use-stream-request'
import type { ChatCompletionRequest } from '@/features/playground/types'

export type ChatStreamResult = {
  content: string
  reasoning: string
}

/**
 * 模型使用页对话：走 /pg/chat/completions SSE，边收边回调。
 */
export function streamModelUsageChatCompletion(
  payload: ChatCompletionRequest,
  options?: {
    onUpdate?: (type: 'reasoning' | 'content', chunk: string) => void
  }
): Promise<ChatStreamResult> {
  return new Promise((resolve, reject) => {
    let content = ''
    let reasoning = ''
    let settled = false

    const controller = createStreamRequestController({
      getHeaders: getFreshAuthHeaders,
      createSource: (body, headers) =>
        new SSE(API_ENDPOINTS.CHAT_COMPLETIONS, {
          headers,
          method: 'POST',
          payload: JSON.stringify(body),
        }),
      setStreaming: () => {},
    })

    void controller.send(
      { ...payload, stream: true },
      {
        onUpdate: (type, chunk) => {
          if (type === 'content') content += chunk
          else reasoning += chunk
          options?.onUpdate?.(type, chunk)
        },
        onComplete: () => {
          if (settled) return
          settled = true
          controller.dispose()
          resolve({ content, reasoning })
        },
        onError: (error) => {
          if (settled) return
          settled = true
          controller.dispose()
          reject(new Error(error))
        },
      }
    )
  })
}
