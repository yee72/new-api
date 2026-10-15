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
import type { ModelUsageType } from '../types'
import type { ModelUsageAttachmentDisplayType } from './attachments'

/** 扩写时需要说明用途的附件 */
export type PromptEnhanceAttachment = {
  name: string
  kind: ModelUsageAttachmentDisplayType
}

/** 扩写输出上限默认值（与后台 PromptEnhanceMaxTokens 一致） */
export const DEFAULT_PROMPT_ENHANCE_MAX_TOKENS = 512

/**
 * 展示用粗估：中文约 1.5 字/token。
 * 非官方 tokenizer，仅用于悬停「预计约 N tokens」。
 */
export function estimatePromptEnhanceTokens(params: {
  userText: string
  modelType: ModelUsageType
  maxTokens?: number
  attachments?: PromptEnhanceAttachment[]
}): number {
  const maxTokens =
    params.maxTokens && params.maxTokens > 0
      ? params.maxTokens
      : DEFAULT_PROMPT_ENHANCE_MAX_TOKENS
  const attachments = params.attachments ?? []
  const systemPrompt = promptEnhanceSystemPrompt(params.modelType, {
    hasAttachments: attachments.length > 0,
  })
  const userContent = promptEnhanceUserContent(params.userText, attachments)
  const inputChars = systemPrompt.length + userContent.length
  const estimatedInput = Math.max(1, Math.ceil(inputChars / 1.5))
  // 输出按上限保守估计，避免悬停低估
  return estimatedInput + maxTokens
}

/** 按附件类型给出固定用途，供扩写时写进提示词。 */
export function attachmentUsageDescription(
  attachments: PromptEnhanceAttachment[]
): string {
  if (attachments.length === 0) return ''
  const lines = attachments.map((attachment, index) => {
    const name = attachment.name.trim() || `附件${index + 1}`
    return `${index + 1}. ${name}：${attachmentUsageByKind(attachment.kind)}`
  })
  return ['附件及使用方式：', ...lines].join('\n')
}

/** 无附件时只返回正文；有附件时在末尾附上用途说明，已附带则不重复。 */
export function withAttachmentUsage(
  text: string,
  attachments: PromptEnhanceAttachment[]
): string {
  const usage = attachmentUsageDescription(attachments)
  const body = text.trim()
  if (!usage) return body
  if (!body) return usage
  if (body.endsWith(usage)) return body
  return `${body}\n\n${usage}`
}

export function promptEnhanceUserContent(
  userText: string,
  attachments: PromptEnhanceAttachment[] = []
): string {
  return withAttachmentUsage(userText, attachments)
}

function attachmentUsageByKind(kind: ModelUsageAttachmentDisplayType): string {
  switch (kind) {
    case 'image':
      return '作为画面、构图或风格参考'
    case 'video':
      return '作为镜头、动作或节奏参考'
    case 'pdf':
      return '依据文档中的内容与结构'
    case 'doc':
      return '依据文档中的文字内容'
    case 'sheet':
      return '依据表格中的数据'
    case 'ppt':
      return '依据演示文稿中的内容与结构'
    default:
      return '依据附件中的内容'
  }
}

export function promptEnhanceSystemPrompt(
  modelType: ModelUsageType,
  options?: { hasAttachments?: boolean }
): string {
  let prompt: string
  if (modelType === 'image') {
    prompt = [
      '你是图像生成提示词扩写助手。',
      '将用户的简短描述扩写为细节丰富、可直接用于文生图的中文提示词。',
      '保留用户原意与主体，补充动作、姿态、材质、光影、构图与背景，语言具体生动。',
      '只输出扩写后的提示词正文，不要解释、不要标题、不要引号。',
    ].join('')
  } else if (modelType === 'video') {
    prompt = [
      '你是视频生成提示词扩写助手。',
      '将用户的简短描述扩写为细节丰富、可直接用于文生视频的中文提示词。',
      '保留用户原意与主体，补充镜头运动、动作节奏、时长感、光影与场景 continuity。',
      '只输出扩写后的提示词正文，不要解释、不要标题、不要引号。',
    ].join('')
  } else {
    prompt = [
      '你是对话提示词优化助手。',
      '将用户输入扩写得更清晰、完整、便于模型准确理解，但不要改变核心意图。',
      '只输出优化后的文本，不要解释、不要标题、不要引号。',
    ].join('')
  }
  if (!options?.hasAttachments) return prompt
  return `${prompt}用户消息末尾列有附件及使用方式。扩写正文时要体现这些附件将如何参与生成，但不要重复输出“附件及使用方式”清单。`
}
