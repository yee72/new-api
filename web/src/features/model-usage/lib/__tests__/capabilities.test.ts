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
  resolveGenerationCapabilities,
  resolveImageCapabilities,
  resolveVideoCapabilities,
  validateImageConfig,
  validateVideoConfig,
} from '../capabilities'
import {
  DEFAULT_IMAGE_FORM,
  DEFAULT_VIDEO_FORM,
  hydrateGenerationForm,
} from '../generation-request'

describe('generation capability validation', () => {
  it('rejects unsupported image quality without coercing', () => {
    const error = validateImageConfig(
      {
        ...DEFAULT_IMAGE_FORM,
        n: 4,
        aspect_ratio: '16:9',
        quality: 'ultra',
        resolution: 'auto',
      },
      JSON.stringify({ qualities: ['auto', 'medium', '2k'] })
    )
    expect(error).toBe('Current model does not support this image quality')
  })

  it('rejects unsupported image resolution without coercing', () => {
    const error = validateImageConfig(
      {
        ...DEFAULT_IMAGE_FORM,
        n: 1,
        aspect_ratio: '1:1',
        quality: 'medium',
        resolution: '4k',
      },
      JSON.stringify({ qualities: ['medium'], resolution: ['auto', '2k'] })
    )
    expect(error).toBe('Current model does not support this image resolution')
  })

  it('splits legacy image qualities into tier and resolution', () => {
    const matrix = resolveGenerationCapabilities(
      JSON.stringify({ qualities: ['auto', 'medium', '2k', '4k'] }),
      'image'
    )
    expect(matrix.quality).toEqual(['auto', 'medium'])
    expect(matrix.resolution).toEqual(['auto', '2k', '4k'])
  })

  it('accepts video defaults within matrix', () => {
    const error = validateVideoConfig({
      ...DEFAULT_VIDEO_FORM,
      n: 1,
      aspect_ratio: '16:9',
      resolution: '720p',
      duration_sec: 5,
    })
    expect(error).toBeNull()
  })

  it('parses legacy and v1 capability JSON equivalently for video', () => {
    const legacy = resolveVideoCapabilities(
      JSON.stringify({
        counts: [1, 2],
        aspectRatios: ['16:9'],
        qualities: ['720p'],
        secondsMin: 3,
        secondsMax: 10,
      })
    )
    const v1 = resolveGenerationCapabilities(
      JSON.stringify({
        schema_version: '1.0',
        modes: ['video_generate'],
        n: { min: 1, max: 2, default: 1 },
        aspect_ratio: ['16:9'],
        resolution: ['720p'],
        duration_sec: { min: 3, max: 10, default: 5 },
      }),
      'video'
    )
    // 视频强制 n=1
    expect(legacy.counts).toEqual([1])
    expect(v1.n.values ?? [v1.n.min]).toEqual([1])
    expect(legacy.aspectRatios).toEqual(v1.aspect_ratio)
    expect(legacy.qualities).toEqual(v1.resolution)
    expect(legacy.secondsMin).toBe(v1.duration_sec.min)
    expect(legacy.secondsMax).toBe(v1.duration_sec.max)
  })

  it('parses nested image capabilities', () => {
    const matrix = resolveImageCapabilities(
      JSON.stringify({
        image: {
          counts: [1, 2],
          aspectRatios: ['1:1'],
          qualities: ['medium'],
        },
      })
    )
    expect(matrix.counts).toEqual([1, 2])
    expect(matrix.aspectRatios).toEqual(['1:1'])
    expect(matrix.qualities).toEqual(['medium'])
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

describe('hydrateGenerationForm', () => {
  it('maps legacy camelCase image/video configs', () => {
    expect(
      hydrateGenerationForm(
        { n: 2, aspectRatio: '16:9', quality: '2k' },
        DEFAULT_IMAGE_FORM
      )
    ).toMatchObject({
      mode: 'image_generate',
      n: 2,
      aspect_ratio: '16:9',
      quality: 'medium',
      resolution: '2k',
    })
    expect(
      hydrateGenerationForm(
        { n: 4, aspectRatio: '9:16', quality: '1080p', seconds: 8 },
        DEFAULT_VIDEO_FORM
      )
    ).toMatchObject({
      mode: 'video_generate',
      n: 1,
      aspect_ratio: '9:16',
      resolution: '1080p',
      duration_sec: 8,
    })
  })
})
