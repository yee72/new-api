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
  classifyPromptEnhanceAttachments,
  DEFAULT_PROMPT_ENHANCE_MAX_TOKENS,
  estimatePromptEnhanceTokens,
  promptEnhanceSystemPrompt,
  promptEnhanceUserContent,
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

describe('classifyPromptEnhanceAttachments', () => {
  it('classifies media, document and mixed attachment sets', () => {
    expect(classifyPromptEnhanceAttachments([])).toBe('none')
    expect(
      classifyPromptEnhanceAttachments([{ name: 'a.png', kind: 'image' }])
    ).toBe('media')
    expect(
      classifyPromptEnhanceAttachments([{ name: 'a.xlsx', kind: 'sheet' }])
    ).toBe('document')
    expect(
      classifyPromptEnhanceAttachments([
        { name: 'a.png', kind: 'image' },
        { name: 'a.xlsx', kind: 'sheet' },
      ])
    ).toBe('mixed')
  })
})

describe('promptEnhanceSystemPrompt', () => {
  it('returns distinct instructions for image and video', () => {
    expect(promptEnhanceSystemPrompt('image')).toContain('文生图')
    expect(promptEnhanceSystemPrompt('video')).toContain('文生视频')
    expect(promptEnhanceSystemPrompt('chat')).toContain('对话')
  })

  it('uses media-first wording for image and video attachments', () => {
    const prompt = promptEnhanceSystemPrompt('image', { mode: 'media' })
    expect(prompt).toContain('以作品为主体')
    expect(prompt).toContain('以附件为准')
    expect(prompt).not.toContain('附件及使用方式')
  })

  it('uses document-first wording when text attachments are present', () => {
    const prompt = promptEnhanceSystemPrompt('chat', { mode: 'document' })
    expect(prompt).toContain('先依据用户消息中的附件内容')
    expect(prompt).toContain('不要整段复述附件原文')
  })
})

describe('promptEnhanceUserContent', () => {
  it('keeps only the user text for media attachments', () => {
    expect(
      promptEnhanceUserContent('一只猪', {
        attachments: [{ name: 'ref.png', kind: 'image' }],
      })
    ).toBe('一只猪')
  })

  it('appends extracted document text for document attachments', () => {
    const content = promptEnhanceUserContent('总结这份表', {
      attachments: [{ name: 'notes.xlsx', kind: 'sheet' }],
      extractedTexts: ['## file: notes.xlsx\na,b'],
    })
    expect(content.startsWith('总结这份表')).toBe(true)
    expect(content).toContain('附件内容：')
    expect(content).toContain('notes.xlsx')
  })

  it('falls back to filenames when document text cannot be extracted', () => {
    const content = promptEnhanceUserContent('总结这份材料', {
      attachments: [{ name: 'deck.pptx', kind: 'ppt' }],
    })
    expect(content).toContain('未能解析正文')
    expect(content).toContain('deck.pptx')
  })

  it('leaves plain text unchanged when there are no attachments', () => {
    expect(promptEnhanceUserContent('一只猪', {})).toBe('一只猪')
  })
})
