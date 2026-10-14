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
  aspectRatioToSize,
  aspectRatioToVideoSize,
  type GenerationCapabilityMatrix,
  validateImageConfig,
  validateVideoConfig,
} from './capabilities'
import type {
  GenerationFormConfig,
  GenerationRequestV1,
} from './generation-request'

export type ImagesGenerationsPayload = {
  model: string
  prompt: string
  n: number
  size?: string
  quality?: string
}

export type VideosCreatePayload = {
  model: string
  prompt: string
  seconds?: number
  size?: string
}

export function validateGenerationForm(
  config: GenerationFormConfig,
  rawCapabilities?: string
): string | null {
  if (config.mode === 'video_generate') {
    return validateVideoConfig(config, rawCapabilities)
  }
  return validateImageConfig(config, rawCapabilities)
}

function resolveImageSize(
  config: GenerationFormConfig,
  caps: GenerationCapabilityMatrix
): string {
  if (config.size && config.size !== 'auto') return config.size
  const mapped = caps.size_map[config.aspect_ratio]
  if (mapped) return mapped
  return aspectRatioToSize(config.aspect_ratio)
}

function resolveVideoSize(
  config: GenerationFormConfig,
  caps: GenerationCapabilityMatrix
): string {
  if (config.size && config.size !== 'auto') return config.size
  const mapped = caps.size_map[config.aspect_ratio]
  if (mapped) return mapped
  return aspectRatioToVideoSize(
    config.aspect_ratio,
    config.resolution ?? '720p'
  )
}

/** 通用配置 → POST /pg/images/generations */
export function mapToImagesGenerations(
  req: GenerationRequestV1,
  caps: GenerationCapabilityMatrix
): ImagesGenerationsPayload {
  const payload: ImagesGenerationsPayload = {
    model: req.model,
    prompt: req.prompt,
    n: Math.min(Math.max(req.n || 1, 1), 10),
    size: resolveImageSize(req, caps),
  }
  const quality = req.quality
  if (quality && quality !== 'auto') {
    payload.quality = quality
  }
  return payload
}

/** 通用配置 → POST /pg/videos（视频强制 n=1，由调用方循环外控制） */
export function mapToVideosCreate(
  req: GenerationRequestV1,
  caps: GenerationCapabilityMatrix
): VideosCreatePayload {
  const seconds =
    req.duration_sec === -1
      ? undefined
      : (req.duration_sec ?? caps.duration_sec.default)
  return {
    model: req.model,
    prompt: req.prompt,
    seconds,
    size: resolveVideoSize(req, caps),
  }
}
