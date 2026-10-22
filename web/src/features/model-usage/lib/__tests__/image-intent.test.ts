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

import type { ModelUsageMessage } from '../../types'
import {
  findLatestCompletedImageMessage,
  imageWorkNoteFallbackKey,
  parseImagePromptIntentResponse,
  resolveIntentWorkNote,
  shouldAutoAttachLatestImageForEdit,
  shouldClassifyImagePromptIntent,
} from '../image-intent'

function imageMessage(
  overrides: Partial<ModelUsageMessage> = {}
): ModelUsageMessage {
  return {
    id: 'a1',
    turnId: 't1',
    role: 'assistant',
    content: '',
    status: 'done',
    mediaType: 'image',
    images: ['/api/model-usage/media/a.png'],
    ...overrides,
  }
}

describe('parseImagePromptIntentResponse', () => {
  it('parses plain json', () => {
    expect(
      parseImagePromptIntentResponse(
        '{"intent":"edit","confidence":0.91}'
      )
    ).toEqual({ intent: 'edit', confidence: 0.91 })
  })

  it('parses summary with intent', () => {
    expect(
      parseImagePromptIntentResponse(
        '{"intent":"edit","confidence":0.9,"summary":"基于上一张雕像图添加翅膀。"}'
      )
    ).toEqual({
      intent: 'edit',
      confidence: 0.9,
      summary: '基于上一张雕像图添加翅膀。',
    })
  })

  it('parses fenced json and clamps confidence', () => {
    expect(
      parseImagePromptIntentResponse(
        '```json\n{"intent":"new","confidence":1.5}\n```'
      )
    ).toEqual({ intent: 'new', confidence: 1 })
  })

  it('falls back to unclear on garbage', () => {
    expect(parseImagePromptIntentResponse('not json')).toEqual({
      intent: 'unclear',
      confidence: 0,
    })
  })
})

describe('resolveIntentWorkNote', () => {
  it('returns trimmed summary', () => {
    expect(
      resolveIntentWorkNote({
        intent: 'edit',
        confidence: 0.9,
        summary: '  参照上一张改图  ',
      })
    ).toBe('参照上一张改图')
  })

  it('returns undefined without summary', () => {
    expect(
      resolveIntentWorkNote({ intent: 'new', confidence: 0.8 })
    ).toBeUndefined()
  })
})

describe('imageWorkNoteFallbackKey', () => {
  it('maps kinds to i18n keys', () => {
    expect(imageWorkNoteFallbackKey('edit')).toContain('Editing previous')
    expect(imageWorkNoteFallbackKey('refs')).toContain('reference')
    expect(imageWorkNoteFallbackKey('text')).toContain('Text-to-image')
  })
})

describe('shouldAutoAttachLatestImageForEdit', () => {
  it('requires edit with enough confidence', () => {
    expect(
      shouldAutoAttachLatestImageForEdit({
        intent: 'edit',
        confidence: 0.6,
      })
    ).toBe(true)
    expect(
      shouldAutoAttachLatestImageForEdit({
        intent: 'edit',
        confidence: 0.59,
      })
    ).toBe(false)
    expect(
      shouldAutoAttachLatestImageForEdit({
        intent: 'new',
        confidence: 0.99,
      })
    ).toBe(false)
  })
})

describe('findLatestCompletedImageMessage', () => {
  it('returns the newest done image assistant bubble', () => {
    const older = imageMessage({
      id: 'old',
      turnId: 't0',
      images: ['/api/model-usage/media/old.png'],
    })
    const newer = imageMessage({
      id: 'new',
      turnId: 't1',
      images: ['/api/model-usage/media/new.png'],
    })
    expect(findLatestCompletedImageMessage([older, newer])?.id).toBe('new')
  })

  it('skips pending and non-image', () => {
    expect(
      findLatestCompletedImageMessage([
        imageMessage({ status: 'pending' }),
        {
          id: 'c',
          turnId: 't',
          role: 'assistant',
          content: 'hi',
          status: 'done',
          mediaType: 'text',
        },
      ])
    ).toBeNull()
  })
})

describe('shouldClassifyImagePromptIntent', () => {
  const enhance = {
    enabled: true,
    model: 'gemini-3.1-flash-lite',
    max_tokens: 128,
  }

  it('runs only for image flow without refs but with history', () => {
    expect(
      shouldClassifyImagePromptIntent({
        model: {
          model_type: 'image',
          supported_endpoint_types: ['image-generation'],
        },
        priorMessages: [imageMessage()],
        promptEnhance: enhance,
      })
    ).toBe(true)
  })

  it('skips when user already attached an image', () => {
    expect(
      shouldClassifyImagePromptIntent({
        model: { model_type: 'image' },
        attachments: [
          {
            id: '1',
            name: 'a.png',
            kind: 'image',
            url: '/api/model-usage/media/a.png',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        ],
        priorMessages: [imageMessage()],
        promptEnhance: enhance,
      })
    ).toBe(false)
  })

  it('skips when enhance model disabled', () => {
    expect(
      shouldClassifyImagePromptIntent({
        model: { model_type: 'image' },
        priorMessages: [imageMessage()],
        promptEnhance: { ...enhance, enabled: false },
      })
    ).toBe(false)
  })
})
