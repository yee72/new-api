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
  textFromAnthropicResponse,
  toAnthropicContent,
  toAnthropicMessages,
} from '../claude-messages'

describe('toAnthropicContent', () => {
  it('keeps plain text and converts image data urls', () => {
    expect(toAnthropicContent('hello')).toBe('hello')
    expect(
      toAnthropicContent([
        { type: 'text', text: '看图' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,abc' },
        },
      ])
    ).toEqual([
      { type: 'text', text: '看图' },
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'abc' },
      },
    ])
  })
})

describe('toAnthropicMessages', () => {
  it('merges consecutive same-role messages', () => {
    expect(
      toAnthropicMessages([
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: 'c' },
      ])
    ).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
    ])
  })
})

describe('textFromAnthropicResponse', () => {
  it('joins text blocks', () => {
    expect(
      textFromAnthropicResponse({
        content: [
          { type: 'text', text: '你好' },
          { type: 'text', text: '世界' },
        ],
      })
    ).toBe('你好\n世界')
  })
})
