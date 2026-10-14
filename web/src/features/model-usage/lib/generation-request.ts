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

/** 统一生成 schema 版本 */
export const GENERATION_SCHEMA_VERSION = '1.0' as const

export type GenerationMode =
  | 'image_generate'
  | 'image_edit'
  | 'video_generate'
  | 'video_edit'

export type GenerationReferenceType =
  | 'image'
  | 'mask'
  | 'first_frame'
  | 'last_frame'
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'base_video'

export type GenerationReference = {
  type: GenerationReferenceType
  url: string
  mime?: string
}

/** 会话/表单用配置（不含 prompt/model，发送时再拼） */
export type GenerationFormConfig = {
  schema_version: typeof GENERATION_SCHEMA_VERSION
  mode: 'image_generate' | 'video_generate'
  n: number
  aspect_ratio: string
  quality?: string
  resolution?: string
  duration_sec?: number | null
  output_format?: string
  size?: string
  negative_prompt?: string
  background?: string
  audio?: string
  seed?: number | null
  references?: GenerationReference[]
  response_format?: 'url' | 'b64_json'
  extra?: Record<string, unknown>
}

/** 发给 mapper 的完整请求（MVP 子集） */
export type GenerationRequestV1 = GenerationFormConfig & {
  model: string
  prompt: string
}

export const DEFAULT_IMAGE_FORM: GenerationFormConfig = {
  schema_version: GENERATION_SCHEMA_VERSION,
  mode: 'image_generate',
  n: 1,
  aspect_ratio: '1:1',
  quality: 'medium',
  resolution: 'auto',
  output_format: 'png',
}

export const DEFAULT_VIDEO_FORM: GenerationFormConfig = {
  schema_version: GENERATION_SCHEMA_VERSION,
  mode: 'video_generate',
  n: 1,
  aspect_ratio: '16:9',
  resolution: '720p',
  duration_sec: 5,
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function pickNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/**
 * 从服务端/本地旧配置 hydrate 为 v1 表单配置。
 * 兼容 camelCase：aspectRatio、seconds、视频 quality→resolution。
 */
export function hydrateGenerationForm(
  raw: unknown,
  fallback: GenerationFormConfig
): GenerationFormConfig {
  const record = asRecord(raw)
  if (!record) return { ...fallback }

  const mode =
    record.mode === 'video_generate' || record.mode === 'image_generate'
      ? record.mode
      : fallback.mode

  const n = pickNumber(record, 'n') ?? fallback.n
  const aspectRatio =
    pickString(record, 'aspect_ratio', 'aspectRatio') ?? fallback.aspect_ratio

  if (mode === 'video_generate' || fallback.mode === 'video_generate') {
    const resolution =
      pickString(record, 'resolution') ??
      // 旧视频配置把分辨率放在 quality
      pickString(record, 'quality') ??
      fallback.resolution
    const duration =
      pickNumber(record, 'duration_sec', 'seconds') ??
      fallback.duration_sec ??
      null
    return {
      ...fallback,
      schema_version: GENERATION_SCHEMA_VERSION,
      mode: 'video_generate',
      n: 1,
      aspect_ratio: aspectRatio,
      resolution,
      duration_sec: duration,
      output_format: pickString(record, 'output_format') ?? fallback.output_format,
    }
  }

  let quality = pickString(record, 'quality') ?? fallback.quality
  const explicitResolution = pickString(record, 'resolution')
  let resolution = explicitResolution ?? fallback.resolution ?? 'auto'
  // 旧配置把 2k/4k 写在 quality 里：挪到 resolution（已有显式 resolution 时不覆盖）
  const qLower = quality?.toLowerCase() ?? ''
  if (qLower === '2k' || qLower === '4k') {
    if (!explicitResolution) resolution = qLower
    quality = fallback.quality ?? 'medium'
  }

  return {
    ...fallback,
    schema_version: GENERATION_SCHEMA_VERSION,
    mode: 'image_generate',
    n,
    aspect_ratio: aspectRatio,
    quality,
    resolution,
    output_format: pickString(record, 'output_format') ?? fallback.output_format,
    size: pickString(record, 'size') ?? fallback.size,
  }
}

/** 落库/提交用纯对象（snake_case） */
export function generationFormToRecord(
  config: GenerationFormConfig
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    schema_version: config.schema_version,
    mode: config.mode,
    n: config.n,
    aspect_ratio: config.aspect_ratio,
  }
  if (config.mode === 'image_generate') {
    if (config.quality != null) base.quality = config.quality
    if (config.resolution != null) base.resolution = config.resolution
    if (config.output_format != null) base.output_format = config.output_format
    if (config.size != null) base.size = config.size
  } else {
    if (config.resolution != null) base.resolution = config.resolution
    if (config.duration_sec != null) base.duration_sec = config.duration_sec
  }
  return base
}
