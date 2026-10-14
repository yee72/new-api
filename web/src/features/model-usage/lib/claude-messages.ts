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

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source:
        | { type: 'base64'; media_type: string; data: string }
        | { type: 'url'; url: string }
    }

export type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

export type AnthropicMessagesRequest = {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  stream?: boolean
}

export type AnthropicMessagesResponse = {
  content?: Array<{ type?: string; text?: string }>
  error?: { message?: string; type?: string }
}

function parseDataUrl(dataUrl: string): {
  mediaType: string
  data: string
} | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  return {
    mediaType: match[1]?.trim() || 'image/png',
    data: (match[2] || '').replace(/\s+/g, ''),
  }
}

/** OpenAI 风格 content → Anthropic content blocks */
export function toAnthropicContent(
  content: string | ContentPart[]
): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content
  const blocks: AnthropicContentBlock[] = []
  for (const part of content) {
    if (part.type === 'text') {
      const text = part.text ?? ''
      if (text) blocks.push({ type: 'text', text })
      continue
    }
    if (part.type === 'image_url') {
      const url = part.image_url?.url?.trim()
      if (!url) continue
      const parsed = parseDataUrl(url)
      if (parsed) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: parsed.mediaType,
            data: parsed.data,
          },
        })
        continue
      }
      blocks.push({
        type: 'image',
        source: { type: 'url', url },
      })
      continue
    }
    if (part.type === 'file') {
      const name = part.file?.filename?.trim() || 'file'
      // Anthropic Messages 对通用 file part 支持不一致，降级为文本说明
      blocks.push({
        type: 'text',
        text: `[Attachment: ${name}]`,
      })
    }
  }
  if (blocks.length === 0) return ''
  if (blocks.length === 1 && blocks[0]?.type === 'text') {
    return blocks[0].text
  }
  return blocks
}

function appendContent(
  current: string | AnthropicContentBlock[],
  next: string | AnthropicContentBlock[]
): string | AnthropicContentBlock[] {
  if (current === '' || current == null) return next
  if (next === '' || next == null) return current
  if (typeof current === 'string' && typeof next === 'string') {
    return `${current}\n\n${next}`
  }
  const left: AnthropicContentBlock[] =
    typeof current === 'string'
      ? current
        ? [{ type: 'text', text: current }]
        : []
      : current
  const right: AnthropicContentBlock[] =
    typeof next === 'string'
      ? next
        ? [{ type: 'text', text: next }]
        : []
      : next
  return [...left, ...right]
}

/**
 * 转为 Anthropic messages，并合并连续同角色（API 要求 user/assistant 交替）。
 */
export function toAnthropicMessages(
  messages: Array<{
    role: 'user' | 'assistant'
    content: string | ContentPart[]
  }>
): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const message of messages) {
    const content = toAnthropicContent(message.content)
    const last = out[out.length - 1]
    if (last && last.role === message.role) {
      last.content = appendContent(last.content, content)
      continue
    }
    out.push({ role: message.role, content })
  }
  return out.filter((message) => {
    if (typeof message.content === 'string') return message.content.length > 0
    return message.content.length > 0
  })
}

/** 从 Anthropic Messages 响应提取纯文本 */
export function textFromAnthropicResponse(
  response: AnthropicMessagesResponse | null | undefined
): string {
  if (!response?.content?.length) return ''
  const parts: string[] = []
  for (const block of response.content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}
