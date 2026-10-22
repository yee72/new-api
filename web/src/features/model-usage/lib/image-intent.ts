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
import type { ChatCompletionMessage } from '@/features/playground/types'

import type {
  ModelUsageAttachment,
  ModelUsageItem,
  ModelUsageMessage,
  ModelUsagePromptEnhance,
} from '../types'
import { usableImageAttachments } from './chat-attachments'
import { resolveInvokeProtocol } from './invoke-protocol'

export type ImagePromptIntent = 'edit' | 'new' | 'unclear'

export type ImagePromptIntentResult = {
  intent: ImagePromptIntent
  confidence: number
  /** 一两句自然语言说明（生成了什么、是否参照上一张等） */
  summary?: string
}

/** 判定为「改图」所需的最低置信度 */
export const IMAGE_INTENT_EDIT_MIN_CONFIDENCE = 0.6

/** 从会话中找最近一张已完成的助手出图（用于意图路由自动参考） */
export function findLatestCompletedImageMessage(
  messages: ModelUsageMessage[]
): ModelUsageMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (!message || message.role !== 'assistant') continue
    if (message.status !== 'done' || message.mediaType !== 'image') continue
    const hasImage = message.images?.some((url) => Boolean(url?.trim()))
    if (hasImage) return message
  }
  return null
}

/** 仅图片模型、且无参考图、有历史完成图、增强模型可用时才调意图分类 */
export function shouldClassifyImagePromptIntent(options: {
  model: Pick<
    ModelUsageItem,
    'model_type' | 'invoke_protocol' | 'supported_endpoint_types'
  >
  attachments?: ModelUsageAttachment[]
  priorMessages: ModelUsageMessage[]
  promptEnhance?: ModelUsagePromptEnhance | null
}): boolean {
  const protocol = resolveInvokeProtocol(options.model)
  const isImageFlow =
    options.model.model_type === 'image' || protocol === 'images'
  if (!isImageFlow) return false
  if (usableImageAttachments(options.attachments).length > 0) return false
  if (!findLatestCompletedImageMessage(options.priorMessages)) return false
  const enhance = options.promptEnhance
  if (!enhance?.enabled || !enhance.model?.trim()) return false
  return true
}

export function buildImageIntentMessages(
  userText: string
): ChatCompletionMessage[] {
  const system = [
    '你是图片生成意图分类器。根据用户最新一句话，判断是要「改上一张图」还是「重新文生一张新图」，并写一句自然语言说明。',
    '已知会话中已有最近一张完成的生成图可供参考，但用户本轮未附带参考图。',
    '只输出一行 JSON，不要 markdown，不要解释。格式：',
    '{"intent":"edit"|"new"|"unclear","confidence":0到1的小数,"summary":"一两句中文说明"}',
    'intent=edit：基于上一张修改。包括短句改图指令，例如：长出翅膀、去除掉翅膀、换成红色、加个帽子、去掉背景、更清晰、改成油画风。',
    'intent=new：明确要另起一张全新图（再来一张、重新画、换个完全不同的主题、另画等）。',
    '意图不明时用 unclear，不要猜测为 new。',
    '短句祈使/修改指令默认倾向 edit，confidence 通常不低于 0.8。',
    'summary：用一两句说明将生成什么、是否参照上一张图；不要复述 JSON 字段名；不要超过 80 字。',
    'confidence 表示你对该分类的把握。',
  ].join('')

  return [
    { role: 'system', content: system },
    { role: 'user', content: userText.trim() || '(empty)' },
  ]
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeIntent(raw: unknown): ImagePromptIntent {
  if (raw === 'edit' || raw === 'new' || raw === 'unclear') return raw
  return 'unclear'
}

function normalizeSummary(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()
  if (!text) return undefined
  // 防止模型把整段 JSON 塞进 summary
  if (text.startsWith('{') && text.includes('"intent"')) return undefined
  return text.length > 200 ? text.slice(0, 200) : text
}

/** 解析意图模型返回；失败时返回 unclear */
export function parseImagePromptIntentResponse(
  raw: string | null | undefined
): ImagePromptIntentResult {
  const text = String(raw ?? '').trim()
  if (!text) return { intent: 'unclear', confidence: 0 }

  let jsonText = text
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    jsonText = fenced[1].trim()
  } else {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      jsonText = text.slice(start, end + 1)
    }
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      intent?: unknown
      confidence?: unknown
      summary?: unknown
    }
    return {
      intent: normalizeIntent(parsed.intent),
      confidence: clampConfidence(Number(parsed.confidence)),
      summary: normalizeSummary(parsed.summary),
    }
  } catch {
    return { intent: 'unclear', confidence: 0 }
  }
}

/** 是否应按「改图」自动带上最近完成图 */
export function shouldAutoAttachLatestImageForEdit(
  result: ImagePromptIntentResult
): boolean {
  return (
    result.intent === 'edit' &&
    result.confidence >= IMAGE_INTENT_EDIT_MIN_CONFIDENCE
  )
}

export type ImageWorkNoteFallbackKind = 'edit' | 'refs' | 'text'

/** 无模型 summary 时的英文 i18n 键与插值（由调用方 t()） */
export function imageWorkNoteFallbackKey(
  kind: ImageWorkNoteFallbackKind
): string {
  switch (kind) {
    case 'edit':
      return 'Editing previous image: {{prompt}}'
    case 'refs':
      return 'Generating with {{count}} reference image(s): {{prompt}}'
    default:
      return 'Text-to-image: {{prompt}}'
  }
}

/** 从意图结果取展示文案；无 summary 时返回空，由调用方套模板 */
export function resolveIntentWorkNote(
  result: ImagePromptIntentResult | null | undefined
): string | undefined {
  const summary = result?.summary?.trim()
  return summary || undefined
}
