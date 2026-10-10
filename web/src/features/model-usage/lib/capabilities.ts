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
import {
  ASPECT_RATIO_OPTIONS,
  DEFAULT_IMAGE_CONFIG,
  DEFAULT_VIDEO_CONFIG,
  IMAGE_COUNT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  VIDEO_COUNT_OPTIONS,
  VIDEO_QUALITY_OPTIONS,
  VIDEO_SECONDS_MAX,
  VIDEO_SECONDS_MIN,
} from '../constants'
import type {
  ImageGenerationConfig,
  VideoGenerationConfig,
} from '../types'

export type ImageCapabilityMatrix = {
  counts: number[]
  aspectRatios: string[]
  qualities: string[]
}

export type VideoCapabilityMatrix = {
  counts: number[]
  aspectRatios: string[]
  qualities: string[]
  secondsMin: number
  secondsMax: number
}

const DEFAULT_IMAGE_MATRIX: ImageCapabilityMatrix = {
  counts: [...IMAGE_COUNT_OPTIONS],
  aspectRatios: [...ASPECT_RATIO_OPTIONS],
  qualities: [...IMAGE_QUALITY_OPTIONS],
}

const DEFAULT_VIDEO_MATRIX: VideoCapabilityMatrix = {
  counts: [...VIDEO_COUNT_OPTIONS],
  aspectRatios: [...ASPECT_RATIO_OPTIONS],
  qualities: [...VIDEO_QUALITY_OPTIONS],
  secondsMin: VIDEO_SECONDS_MIN,
  secondsMax: VIDEO_SECONDS_MAX,
}

type RawCapabilities = {
  image?: Partial<ImageCapabilityMatrix>
  video?: Partial<VideoCapabilityMatrix>
  counts?: number[]
  aspectRatios?: string[]
  qualities?: string[]
  secondsMin?: number
  secondsMax?: number
}

function parseRaw(raw?: string): RawCapabilities | null {
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as RawCapabilities
  } catch {
    return null
  }
}

export function resolveImageCapabilities(
  raw?: string
): ImageCapabilityMatrix {
  const parsed = parseRaw(raw)
  const source = parsed?.image ?? parsed
  return {
    counts:
      source?.counts && source.counts.length > 0
        ? source.counts
        : DEFAULT_IMAGE_MATRIX.counts,
    aspectRatios:
      source?.aspectRatios && source.aspectRatios.length > 0
        ? source.aspectRatios
        : DEFAULT_IMAGE_MATRIX.aspectRatios,
    qualities:
      source?.qualities && source.qualities.length > 0
        ? source.qualities
        : DEFAULT_IMAGE_MATRIX.qualities,
  }
}

export function resolveVideoCapabilities(
  raw?: string
): VideoCapabilityMatrix {
  const parsed = parseRaw(raw)
  const source = parsed?.video ?? parsed
  return {
    counts:
      source?.counts && source.counts.length > 0
        ? source.counts
        : DEFAULT_VIDEO_MATRIX.counts,
    aspectRatios:
      source?.aspectRatios && source.aspectRatios.length > 0
        ? source.aspectRatios
        : DEFAULT_VIDEO_MATRIX.aspectRatios,
    qualities:
      source?.qualities && source.qualities.length > 0
        ? source.qualities
        : DEFAULT_VIDEO_MATRIX.qualities,
    secondsMin: source?.secondsMin ?? DEFAULT_VIDEO_MATRIX.secondsMin,
    secondsMax: source?.secondsMax ?? DEFAULT_VIDEO_MATRIX.secondsMax,
  }
}

export function validateImageConfig(
  config: ImageGenerationConfig,
  rawCapabilities?: string
): string | null {
  const matrix = resolveImageCapabilities(rawCapabilities)
  if (!matrix.counts.includes(config.n)) {
    return 'Current model does not support this image count'
  }
  if (!matrix.aspectRatios.includes(config.aspectRatio)) {
    return 'Current model does not support this aspect ratio'
  }
  if (!matrix.qualities.includes(config.quality)) {
    return 'Current model does not support this image quality'
  }
  return null
}

export function validateVideoConfig(
  config: VideoGenerationConfig,
  rawCapabilities?: string
): string | null {
  const matrix = resolveVideoCapabilities(rawCapabilities)
  if (!matrix.counts.includes(config.n)) {
    return 'Current model does not support this video count'
  }
  if (!matrix.aspectRatios.includes(config.aspectRatio)) {
    return 'Current model does not support this aspect ratio'
  }
  if (!matrix.qualities.includes(config.quality)) {
    return 'Current model does not support this video quality'
  }
  if (
    config.seconds < matrix.secondsMin ||
    config.seconds > matrix.secondsMax
  ) {
    return 'Current model does not support this video duration'
  }
  return null
}

export function clampImageConfigToMatrix(
  rawCapabilities?: string
): ImageGenerationConfig {
  const matrix = resolveImageCapabilities(rawCapabilities)
  return {
    n: matrix.counts.includes(DEFAULT_IMAGE_CONFIG.n)
      ? DEFAULT_IMAGE_CONFIG.n
      : matrix.counts[0],
    aspectRatio: matrix.aspectRatios.includes(DEFAULT_IMAGE_CONFIG.aspectRatio)
      ? DEFAULT_IMAGE_CONFIG.aspectRatio
      : matrix.aspectRatios[0],
    quality: matrix.qualities.includes(DEFAULT_IMAGE_CONFIG.quality)
      ? DEFAULT_IMAGE_CONFIG.quality
      : matrix.qualities[0],
  }
}

export function clampVideoConfigToMatrix(
  rawCapabilities?: string
): VideoGenerationConfig {
  const matrix = resolveVideoCapabilities(rawCapabilities)
  const seconds = Math.min(
    Math.max(DEFAULT_VIDEO_CONFIG.seconds, matrix.secondsMin),
    matrix.secondsMax
  )
  return {
    n: matrix.counts.includes(DEFAULT_VIDEO_CONFIG.n)
      ? DEFAULT_VIDEO_CONFIG.n
      : matrix.counts[0],
    aspectRatio: matrix.aspectRatios.includes(DEFAULT_VIDEO_CONFIG.aspectRatio)
      ? DEFAULT_VIDEO_CONFIG.aspectRatio
      : matrix.aspectRatios[0],
    quality: matrix.qualities.includes(DEFAULT_VIDEO_CONFIG.quality)
      ? DEFAULT_VIDEO_CONFIG.quality
      : matrix.qualities[0],
    seconds,
  }
}

/** 将比例映射为 OpenAI 常见 size 字符串 */
export function aspectRatioToSize(ratio: string): string {
  switch (ratio) {
    case '1:1':
      return '1024x1024'
    case '3:4':
      return '1024x1536'
    case '9:16':
      return '1024x1792'
    case '16:9':
    default:
      return '1792x1024'
  }
}
