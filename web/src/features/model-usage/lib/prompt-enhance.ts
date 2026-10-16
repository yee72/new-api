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

/** 扩写时用到的附件元数据 */
export type PromptEnhanceAttachment = {
  name: string
  kind: ModelUsageAttachmentDisplayType
}

/** 扩写输出上限默认值（与后台 PromptEnhanceMaxTokens 一致） */
export const DEFAULT_PROMPT_ENHANCE_MAX_TOKENS = 512

/** 扩写阶段喂给模型的附件正文上限，避免占满上下文 */
export const PROMPT_ENHANCE_EXTRACT_MAX_CHARS = 8_000

/** 按附件类型决定扩写策略 */
export type PromptEnhanceAttachmentMode =
  | 'none'
  | 'media'
  | 'document'
  | 'mixed'

export function isMediaAttachmentKind(
  kind: ModelUsageAttachmentDisplayType
): boolean {
  return kind === 'image' || kind === 'video'
}

export function isDocumentAttachmentKind(
  kind: ModelUsageAttachmentDisplayType
): boolean {
  return (
    kind === 'pdf' ||
    kind === 'sheet' ||
    kind === 'ppt' ||
    kind === 'doc' ||
    kind === 'file'
  )
}

export function classifyPromptEnhanceAttachments(
  attachments: PromptEnhanceAttachment[]
): PromptEnhanceAttachmentMode {
  if (attachments.length === 0) return 'none'
  let hasMedia = false
  let hasDocument = false
  for (const attachment of attachments) {
    if (isMediaAttachmentKind(attachment.kind)) hasMedia = true
    if (isDocumentAttachmentKind(attachment.kind)) hasDocument = true
  }
  if (hasMedia && hasDocument) return 'mixed'
  if (hasMedia) return 'media'
  if (hasDocument) return 'document'
  return 'none'
}

/**
 * 展示用粗估：中文约 1.5 字/token。
 * 非官方 tokenizer，仅用于悬停「预计约 N tokens」。
 */
export function estimatePromptEnhanceTokens(params: {
  userText: string
  modelType: ModelUsageType
  maxTokens?: number
  attachments?: PromptEnhanceAttachment[]
  extractedTexts?: string[]
}): number {
  const maxTokens =
    params.maxTokens && params.maxTokens > 0
      ? params.maxTokens
      : DEFAULT_PROMPT_ENHANCE_MAX_TOKENS
  const attachments = params.attachments ?? []
  const mode = classifyPromptEnhanceAttachments(attachments)
  const systemPrompt = promptEnhanceSystemPrompt(params.modelType, { mode })
  const userContent = promptEnhanceUserContent(params.userText, {
    attachments,
    extractedTexts: params.extractedTexts,
  })
  const inputChars = systemPrompt.length + userContent.length
  const estimatedInput = Math.max(1, Math.ceil(inputChars / 1.5))
  // 输出按上限保守估计，避免悬停低估
  return estimatedInput + maxTokens
}

/** 发给扩写模型的用户侧正文：媒体仅用户原句；文档附抽取内容。 */
export function promptEnhanceUserContent(
  userText: string,
  options?: {
    attachments?: PromptEnhanceAttachment[]
    extractedTexts?: string[]
  }
): string {
  const attachments = options?.attachments ?? []
  const mode = classifyPromptEnhanceAttachments(attachments)
  const body = userText.trim()
  if (mode === 'none' || mode === 'media') return body

  const parts: string[] = []
  if (body) parts.push(body)

  const extracted = (options?.extractedTexts ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
  if (extracted.length > 0) {
    parts.push('附件内容：')
    parts.push(...extracted)
  } else {
    const names = attachments
      .filter((item) => isDocumentAttachmentKind(item.kind))
      .map((item) => item.name.trim() || '未命名附件')
    if (names.length > 0) {
      parts.push(
        `附件文件（未能解析正文，请仅依据文件名与用户意图优化）：${names.join('、')}`
      )
    }
  }
  return parts.join('\n\n')
}

function baseSystemPrompt(modelType: ModelUsageType): string {
  if (modelType === 'image') {
    return [
      '你是图像生成提示词扩写助手。',
      '将用户的简短描述扩写为细节丰富、可直接用于文生图的中文提示词。',
      '保留用户原意与主体，补充动作、姿态、材质、光影、构图与背景，语言具体生动。',
      '只输出扩写后的提示词正文，不要解释、不要标题、不要引号。',
    ].join('')
  }
  if (modelType === 'video') {
    return [
      '你是视频生成提示词扩写助手。',
      '将用户的简短描述扩写为细节丰富、可直接用于文生视频的中文提示词。',
      '保留用户原意与主体，补充镜头运动、动作节奏、时长感、光影与场景 continuity。',
      '只输出扩写后的提示词正文，不要解释、不要标题、不要引号。',
    ].join('')
  }
  return [
    '你是对话提示词优化助手。',
    '将用户输入扩写得更清晰、完整、便于模型准确理解，但不要改变核心意图。',
    '只输出优化后的文本，不要解释、不要标题、不要引号。',
  ].join('')
}

function mediaAttachmentInstruction(modelType: ModelUsageType): string {
  if (modelType === 'image' || modelType === 'video') {
    return [
      '用户已上传图片或视频附件。',
      '以作品为主体，画面与内容以附件为准。',
      '只润色用户意图，不要编造附件中不存在的主体、场景或风格细节。',
      '不要在输出中罗列附件清单或使用说明。',
    ].join('')
  }
  return [
    '用户已上传图片或视频附件。',
    '优化提示词时以附件中的作品为主体内容，画面与内容以附件为准。',
    '不要编造附件中不存在的细节，不要在输出中罗列附件清单。',
  ].join('')
}

function documentAttachmentInstruction(): string {
  return [
    '用户已上传文档、表格或演示文稿等附件。',
    '先依据用户消息中的附件内容理解材料，再据此优化为清晰可执行的提示词。',
    '输出应是任务说明与关键约束，不要整段复述附件原文，不要罗列附件清单。',
    '若标注未能解析正文，则仅结合文件名与用户意图做有限优化，不要假装已读内容。',
  ].join('')
}

export function promptEnhanceSystemPrompt(
  modelType: ModelUsageType,
  options?: { mode?: PromptEnhanceAttachmentMode; hasAttachments?: boolean }
): string {
  // hasAttachments 兼容旧调用：有附件且未传 mode 时按 document 兜底不再适用，改为 media+document 混合提示过重；改为 none 时忽略
  let mode = options?.mode
  if (mode == null && options?.hasAttachments) {
    mode = 'mixed'
  }
  if (mode == null || mode === 'none') {
    return baseSystemPrompt(modelType)
  }

  const parts = [baseSystemPrompt(modelType)]
  if (mode === 'media' || mode === 'mixed') {
    parts.push(mediaAttachmentInstruction(modelType))
  }
  if (mode === 'document' || mode === 'mixed') {
    parts.push(documentAttachmentInstruction())
  }
  return parts.join('')
}
