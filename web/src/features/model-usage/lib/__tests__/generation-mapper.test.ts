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

import { resolveGenerationCapabilities } from '../capabilities'
import {
  mapToImagesGenerations,
  mapToVideosCreate,
} from '../generation-mapper'
import { DEFAULT_IMAGE_FORM, DEFAULT_VIDEO_FORM } from '../generation-request'

describe('generation mapper', () => {
  it('maps image generate with size_map and omits auto quality', () => {
    const caps = resolveGenerationCapabilities(
      JSON.stringify({
        size_map: { '1:1': '1024x1024' },
        quality: ['auto', 'medium'],
        aspect_ratio: ['1:1'],
      }),
      'image'
    )
    expect(
      mapToImagesGenerations(
        {
          ...DEFAULT_IMAGE_FORM,
          model: 'flux',
          prompt: 'a cat',
          aspect_ratio: '1:1',
          quality: 'auto',
        },
        caps
      )
    ).toEqual({
      model: 'flux',
      prompt: 'a cat',
      n: 1,
      size: '1024x1024',
    })
    expect(
      mapToImagesGenerations(
        {
          ...DEFAULT_IMAGE_FORM,
          model: 'flux',
          prompt: 'a cat',
          aspect_ratio: '1:1',
          quality: 'medium',
        },
        caps
      ).quality
    ).toBe('medium')
  })

  it('omits size when image aspect_ratio is auto', () => {
    const caps = resolveGenerationCapabilities(undefined, 'image')
    expect(
      mapToImagesGenerations(
        {
          ...DEFAULT_IMAGE_FORM,
          model: 'flux',
          prompt: 'a cat',
          aspect_ratio: 'auto',
          quality: 'auto',
        },
        caps
      )
    ).toEqual({
      model: 'flux',
      prompt: 'a cat',
      n: 1,
    })
  })

  it('maps video generate using resolution and duration_sec', () => {
    const caps = resolveGenerationCapabilities(undefined, 'video')
    expect(
      mapToVideosCreate(
        {
          ...DEFAULT_VIDEO_FORM,
          model: 'wan',
          prompt: 'waves',
          aspect_ratio: '16:9',
          resolution: '720p',
          duration_sec: 5,
        },
        caps
      )
    ).toEqual({
      model: 'wan',
      prompt: 'waves',
      seconds: 5,
      size: '1280x720',
    })
  })

  it('forces image n into 1–10', () => {
    const caps = resolveGenerationCapabilities(undefined, 'image')
    expect(
      mapToImagesGenerations(
        {
          ...DEFAULT_IMAGE_FORM,
          model: 'x',
          prompt: 'y',
          aspect_ratio: '1:1',
          n: 99,
        },
        caps
      ).n
    ).toBe(10)
  })

  it('forwards reference images for image and video tasks', () => {
    const imageCaps = resolveGenerationCapabilities(undefined, 'image')
    const videoCaps = resolveGenerationCapabilities(undefined, 'video')
    expect(
      mapToImagesGenerations(
        {
          ...DEFAULT_IMAGE_FORM,
          model: 'qwen-image',
          prompt: 'add wings',
          aspect_ratio: '1:1',
        },
        imageCaps,
        {
          images: [
            'data:image/png;base64,abc',
            '  ',
            'https://cdn.example/ref.png',
          ],
        }
      ).images
    ).toEqual(['data:image/png;base64,abc', 'https://cdn.example/ref.png'])
    expect(
      mapToVideosCreate(
        {
          ...DEFAULT_VIDEO_FORM,
          model: 'wan',
          prompt: 'animate',
          aspect_ratio: '16:9',
          resolution: '720p',
          duration_sec: 5,
        },
        videoCaps,
        { images: ['data:image/png;base64,frame'] }
      ).images
    ).toEqual(['data:image/png;base64,frame'])
  })
})
