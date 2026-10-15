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
}): number {
  const maxTokens =
    params.maxTokens && params.maxTokens > 0
      ? params.maxTokens
      : DEFAULT_PROMPT_ENHANCE_MAX_TOKENS
  const systemPrompt = promptEnhanceSystemPrompt(params.modelType)
  const inputChars = systemPrompt.length + params.userText.trim().length
  const estimatedInput = Math.max(1, Math.ceil(inputChars / 1.5))
  // 输出按上限保守估计，避免悬停低估
  return estimatedInput + maxTokens
}

export function promptEnhanceSystemPrompt(modelType: ModelUsageType): string {
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
