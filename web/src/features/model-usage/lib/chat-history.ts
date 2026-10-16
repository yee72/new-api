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
import type { ModelUsageMessage } from '../types'

/**
 * 选出可拼进上游 chat/messages 的历史气泡。
 * 仅保留 done 文本；失败轮次（无成功助手回复）的用户附件不带上，避免 PPT 等污染后续请求。
 * 传入 includeTurnIds 时只保留这些轮次（引用模式），用于减少全量历史开销。
 */
export function selectChatHistoryMessages(
  messages: ModelUsageMessage[],
  options?: { excludeTurnId?: string; includeTurnIds?: string[] }
): ModelUsageMessage[] {
  const base = options?.excludeTurnId
    ? messages.filter((message) => message.turnId !== options.excludeTurnId)
    : messages
  const successfulTurnIds = new Set(
    base
      .filter(
        (message) =>
          message.role === 'assistant' && message.status === 'done'
      )
      .map((message) => message.turnId)
  )
  const includeTurnIds = options?.includeTurnIds
  const allowedTurns =
    includeTurnIds && includeTurnIds.length > 0
      ? new Set(includeTurnIds)
      : null
  return base
    .filter(
      (message) =>
        message.status === 'done' &&
        message.mediaType === 'text' &&
        (allowedTurns == null || allowedTurns.has(message.turnId))
    )
    .map((message) => {
      if (
        message.role !== 'user' ||
        !message.attachments?.length ||
        successfulTurnIds.has(message.turnId)
      ) {
        return message
      }
      return { ...message, attachments: undefined }
    })
}
