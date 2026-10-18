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
import type { ModelUsageItem, ModelUsageInvokeProtocol } from '../types'

/** 与后端一致：endpoint 优先，其次产品类型（任务视频常无 openai-video） */
export function resolveInvokeProtocol(
  model: Pick<
    ModelUsageItem,
    'invoke_protocol' | 'supported_endpoint_types' | 'model_type'
  >
): ModelUsageInvokeProtocol {
  const endpoints = model.supported_endpoint_types ?? []
  if (endpoints.includes('openai-video')) return 'videos'
  if (endpoints.includes('image-generation')) return 'images'
  if (model.model_type === 'video') return 'videos'
  // 图片类型走 chat 生图（即使用 anthropic 端点也不改）
  if (model.model_type === 'image') return 'chat'
  // 对话：声明 anthropic 时优先 Messages，兼容上游双协议
  if (endpoints.includes('anthropic')) return 'messages'
  if (
    model.invoke_protocol === 'chat' ||
    model.invoke_protocol === 'messages' ||
    model.invoke_protocol === 'images' ||
    model.invoke_protocol === 'videos'
  ) {
    return model.invoke_protocol
  }
  return 'chat'
}

const markdownImageRe = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const angleUrlRe = /<(https?:\/\/[^>\s]+)>/g
const bareUrlRe = /(https?:\/\/[^\s<>"')\]]+)/g
const dataImageRe = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+)/g

function looksLikeImageUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:image/')) return true
  // playground 网关已落库的短链
  if (trimmed.startsWith('/api/model-usage/media/')) return true
  try {
    const parsed = new URL(trimmed, 'http://localhost')
    if (parsed.pathname.startsWith('/api/model-usage/media/')) return true
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(parsed.pathname)) {
      return true
    }
    // 常见 CDN / 对象存储无扩展名路径，仍按图片候选保留
    return /image|img|media|upload|generat/i.test(
      `${parsed.hostname}${parsed.pathname}`
    )
  } catch {
    return false
  }
}

function pushImageCandidate(found: string[], raw: string) {
  const url = raw.trim().replace(/[),.;]+$/, '')
  if (!url || found.includes(url)) return
  if (url.startsWith('data:image/') || looksLikeImageUrl(url)) {
    found.push(url)
  }
}

function extractImagesFromText(text: string, found: string[]) {
  if (!text.trim()) return
  for (const match of text.matchAll(markdownImageRe)) {
    pushImageCandidate(found, match[1] ?? '')
  }
  for (const match of text.matchAll(dataImageRe)) {
    pushImageCandidate(found, (match[1] ?? '').replace(/\s+/g, ''))
  }
  for (const match of text.matchAll(angleUrlRe)) {
    pushImageCandidate(found, match[1] ?? '')
  }
  for (const match of text.matchAll(bareUrlRe)) {
    pushImageCandidate(found, match[1] ?? '')
  }
}

/** 从 chat completions 文本中提取可持久化的图片源 */
export function extractImagesFromChatContent(content: unknown): string[] {
  const found: string[] = []
  if (content == null) return found
  if (typeof content === 'string') {
    extractImagesFromText(content, found)
    return found
  }
  // 多模态 content 数组：[{type:'text',...},{type:'image_url',...}]
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const record = part as {
        type?: string
        text?: string
        image_url?: { url?: string }
      }
      if (typeof record.text === 'string') {
        extractImagesFromText(record.text, found)
      }
      const url = record.image_url?.url
      if (typeof url === 'string') {
        pushImageCandidate(found, url)
      }
    }
    return found
  }
  extractImagesFromText(String(content), found)
  return found
}

type ChatMessageImagePart = {
  type?: string
  image_url?: { url?: string }
}

/** content 文本/数组 + message.images（Gemini 等 chat 生图） */
export function extractImagesFromChatMessage(message: {
  content?: unknown
  images?: ChatMessageImagePart[] | null
}): string[] {
  const found = extractImagesFromChatContent(message?.content)
  for (const item of message?.images ?? []) {
    const url = item?.image_url?.url
    if (typeof url === 'string') pushImageCandidate(found, url)
  }
  return found
}
