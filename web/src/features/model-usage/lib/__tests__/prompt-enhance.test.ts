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
  DEFAULT_PROMPT_ENHANCE_MAX_TOKENS,
  estimatePromptEnhanceTokens,
  promptEnhanceSystemPrompt,
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
})
