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

import {
  attachmentUsageDescription,
  DEFAULT_PROMPT_ENHANCE_MAX_TOKENS,
  estimatePromptEnhanceTokens,
  promptEnhanceSystemPrompt,
  promptEnhanceUserContent,
  withAttachmentUsage,
} from '../prompt-enhance'

describe('estimatePromptEnhanceTokens', () => {
  it('grows with longer user text and includes max output tokens', () => {
    const short = estimatePromptEnhanceTokens({
      userText: '一只猪',
      modelType: 'image',
      maxTokens: 100,
    })
    const long = estimatePromptEnhanceTokens({
      userText: '一只猪在草地上快速奔跑，镜头跟随',
      modelType: 'image',
      maxTokens: 100,
    })
    expect(long).toBeGreaterThan(short)
    expect(short).toBeGreaterThanOrEqual(100)
  })

  it('falls back to the default max tokens', () => {
    const total = estimatePromptEnhanceTokens({
      userText: 'hello',
      modelType: 'chat',
    })
    expect(total).toBeGreaterThanOrEqual(DEFAULT_PROMPT_ENHANCE_MAX_TOKENS)
  })
})

describe('promptEnhanceSystemPrompt', () => {
  it('returns distinct instructions for image and video', () => {
    expect(promptEnhanceSystemPrompt('image')).toContain('文生图')
    expect(promptEnhanceSystemPrompt('video')).toContain('文生视频')
    expect(promptEnhanceSystemPrompt('chat')).toContain('对话')
  })

  it('tells the model to use attachments without repeating the usage list', () => {
    const prompt = promptEnhanceSystemPrompt('image', { hasAttachments: true })
    expect(prompt).toContain('附件及使用方式')
    expect(prompt).toContain('不要重复输出')
    expect(promptEnhanceSystemPrompt('image')).not.toContain('附件及使用方式')
  })
})

describe('attachment usage description', () => {
  const attachments = [
    { name: 'ref.png', kind: 'image' as const },
    { name: 'notes.xlsx', kind: 'sheet' as const },
  ]

  it('describes how each attachment should be used', () => {
    const usage = attachmentUsageDescription(attachments)
    expect(usage).toContain('1. ref.png：作为画面、构图或风格参考')
    expect(usage).toContain('2. notes.xlsx：依据表格中的数据')
  })

  it('appends the usage block when enhancing a prompt that has attachments', () => {
    const content = promptEnhanceUserContent('一只猪', attachments)
    expect(content.startsWith('一只猪')).toBe(true)
    expect(content).toContain('附件及使用方式：')
    expect(content).toContain('ref.png')
  })

  it('leaves the prompt unchanged when there are no attachments', () => {
    expect(promptEnhanceUserContent('一只猪', [])).toBe('一只猪')
    expect(withAttachmentUsage('扩写后的提示词', [])).toBe('扩写后的提示词')
  })

  it('does not duplicate a usage block that is already present', () => {
    const once = withAttachmentUsage('扩写后的提示词', attachments)
    expect(withAttachmentUsage(once, attachments)).toBe(once)
  })
})
