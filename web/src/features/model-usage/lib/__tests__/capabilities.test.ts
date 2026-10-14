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
  aspectRatioToSize,
  aspectRatioToVideoSize,
  validateImageConfig,
  validateVideoConfig,
} from '../capabilities'

describe('generation capability validation', () => {
  it('rejects unsupported image quality without coercing', () => {
    const error = validateImageConfig(
      { n: 4, aspectRatio: '16:9', quality: '4k' },
      JSON.stringify({ qualities: ['auto', '2k'] })
    )
    expect(error).toBe('Current model does not support this image quality')
  })

  it('accepts video defaults within matrix', () => {
    const error = validateVideoConfig({
      n: 1,
      aspectRatio: '16:9',
      quality: '720p',
      seconds: 5,
    })
    expect(error).toBeNull()
  })
})

describe('aspectRatioToVideoSize', () => {
  it('maps to Wan pixel sizes instead of OpenAI image sizes', () => {
    expect(aspectRatioToSize('16:9')).toBe('1792x1024')
    expect(aspectRatioToVideoSize('16:9', '720p')).toBe('1280x720')
    expect(aspectRatioToVideoSize('16:9', '1080p')).toBe('1920x1080')
    expect(aspectRatioToVideoSize('9:16', 'auto')).toBe('720x1280')
  })

  it('falls back to 720P when quality is empty', () => {
    expect(aspectRatioToVideoSize('16:9', '')).toBe('1280x720')
    expect(
      aspectRatioToVideoSize('16:9', undefined as unknown as string)
    ).toBe('1280x720')
  })
})
