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
  extractImagesFromChatContent,
  resolveInvokeProtocol,
} from '../invoke-protocol'

describe('resolveInvokeProtocol', () => {
  it('prefers image-generation / openai-video endpoints', () => {
    expect(
      resolveInvokeProtocol({
        invoke_protocol: 'chat',
        supported_endpoint_types: ['image-generation', 'openai'],
      })
    ).toBe('images')
    expect(
      resolveInvokeProtocol({
        supported_endpoint_types: ['openai-video', 'image-generation'],
      })
    ).toBe('videos')
  })

  it('uses model_type when endpoints lack media APIs', () => {
    expect(
      resolveInvokeProtocol({
        model_type: 'video',
        invoke_protocol: 'chat',
        supported_endpoint_types: ['openai'],
      })
    ).toBe('videos')
    expect(
      resolveInvokeProtocol({
        model_type: 'image',
        supported_endpoint_types: ['openai'],
      })
    ).toBe('chat')
    expect(
      resolveInvokeProtocol({
        supported_endpoint_types: ['openai'],
      })
    ).toBe('chat')
  })
})

describe('extractImagesFromChatContent', () => {
  it('extracts markdown, data urls and http image urls', () => {
    const content = [
      '这里有图',
      '![cat](https://cdn.example.com/a/cat.png)',
      'data:image/png;base64,abc123==',
      '另见 https://cdn.example.com/media/out?id=1',
    ].join('\n')
    expect(extractImagesFromChatContent(content)).toEqual([
      'https://cdn.example.com/a/cat.png',
      'data:image/png;base64,abc123==',
      'https://cdn.example.com/media/out?id=1',
    ])
  })

  it('skips non-image bare urls', () => {
    expect(
      extractImagesFromChatContent('见文档 https://example.com/docs/guide')
    ).toEqual([])
  })

  it('extracts model-usage media short links', () => {
    const content =
      '![image](/api/model-usage/media/model-usage/1/gemini/req/0.png?access=abc)'
    expect(extractImagesFromChatContent(content)).toEqual([
      '/api/model-usage/media/model-usage/1/gemini/req/0.png?access=abc',
    ])
  })
})
