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
  IMAGE_COUNT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  VIDEO_COUNT_OPTIONS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_SECONDS_MAX,
  VIDEO_SECONDS_MIN,
} from '../constants'
import type { ModelUsageItem, ModelUsageType } from '../types'
import {
  DEFAULT_IMAGE_FORM,
  DEFAULT_VIDEO_FORM,
  type GenerationFormConfig,
  type GenerationMode,
} from './generation-request'

export type RangeCapability = {
  min: number
  max: number
  default: number
  step: number
  allow_minus_one: boolean
  /** 若存在则 UI 用枚举，否则用 min–max 步进 */
  values?: number[]
}

export type GenerationCapabilityMatrix = {
  modes: GenerationMode[]
  n: RangeCapability
  aspect_ratio: string[]
  quality: string[]
  resolution: string[]
  duration_sec: RangeCapability
  output_format: string[]
  size_map: Record<string, string>
  /** references.type → max；MVP UI 不展示，仅占位 */
  references: Record<string, { max: number }>
}

/** 旧矩阵别名（测试/过渡） */
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

function rangeFromCounts(
  counts: number[],
  fallbackDefault: number
): RangeCapability {
  const sorted = [...counts].sort((a, b) => a - b)
  const min = sorted[0] ?? 1
  const max = sorted[sorted.length - 1] ?? min
  const def = sorted.includes(fallbackDefault) ? fallbackDefault : min
  return {
    min,
    max,
    default: def,
    step: 1,
    allow_minus_one: false,
    values: sorted,
  }
}

function durationRange(
  min: number,
  max: number,
  def: number,
  allowMinusOne = false
): RangeCapability {
  return {
    min,
    max,
    default: Math.min(Math.max(def, min), max),
    step: 1,
    allow_minus_one: allowMinusOne,
  }
}

const DEFAULT_IMAGE_CAPS: GenerationCapabilityMatrix = {
  modes: ['image_generate'],
  n: rangeFromCounts([...IMAGE_COUNT_OPTIONS], DEFAULT_IMAGE_FORM.n),
  aspect_ratio: ['1:1', '3:4', '16:9', '9:16'],
  quality: [...IMAGE_QUALITY_OPTIONS],
  resolution: [],
  duration_sec: durationRange(1, 1, 1),
  output_format: ['auto', 'png', 'jpeg', 'webp'],
  size_map: {},
  references: { image: { max: 0 } },
}

const DEFAULT_VIDEO_CAPS: GenerationCapabilityMatrix = {
  modes: ['video_generate'],
  n: rangeFromCounts([...VIDEO_COUNT_OPTIONS], 1),
  aspect_ratio: ['1:1', '3:4', '16:9', '9:16'],
  quality: [],
  resolution: [...VIDEO_RESOLUTION_OPTIONS],
  duration_sec: durationRange(
    VIDEO_SECONDS_MIN,
    VIDEO_SECONDS_MAX,
    DEFAULT_VIDEO_FORM.duration_sec ?? 5
  ),
  output_format: ['auto', 'mp4', 'webm'],
  size_map: {},
  references: { image: { max: 0 } },
}

type RawRange = Partial<RangeCapability> & { values?: number[] }

type RawCapabilities = {
  schema_version?: string
  modes?: GenerationMode[]
  n?: RawRange | number[]
  aspect_ratio?: string[]
  quality?: string[]
  resolution?: string[]
  duration_sec?: RawRange
  output_format?: string[]
  size_map?: Record<string, string>
  references?: Record<string, { max?: number }>
  // legacy
  image?: Record<string, unknown>
  video?: Record<string, unknown>
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

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const list = value.filter((item): item is string => typeof item === 'string')
  return list.length > 0 ? list : undefined
}

function asNumberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const list = value.filter(
    (item): item is number => typeof item === 'number' && Number.isFinite(item)
  )
  return list.length > 0 ? list : undefined
}

function parseN(
  raw: unknown,
  fallback: RangeCapability
): RangeCapability {
  if (Array.isArray(raw)) {
    const counts = asNumberList(raw)
    return counts ? rangeFromCounts(counts, fallback.default) : fallback
  }
  if (!raw || typeof raw !== 'object') return fallback
  const obj = raw as RawRange
  if (obj.values?.length) {
    return rangeFromCounts(obj.values, obj.default ?? fallback.default)
  }
  const min = typeof obj.min === 'number' ? obj.min : fallback.min
  const max = typeof obj.max === 'number' ? obj.max : fallback.max
  const def =
    typeof obj.default === 'number' ? obj.default : fallback.default
  return {
    min,
    max: Math.max(min, max),
    default: Math.min(Math.max(def, min), Math.max(min, max)),
    step: typeof obj.step === 'number' ? obj.step : 1,
    allow_minus_one: Boolean(obj.allow_minus_one),
  }
}

function parseDuration(
  raw: unknown,
  fallback: RangeCapability
): RangeCapability {
  if (!raw || typeof raw !== 'object') return fallback
  const obj = raw as RawRange
  return durationRange(
    typeof obj.min === 'number' ? obj.min : fallback.min,
    typeof obj.max === 'number' ? obj.max : fallback.max,
    typeof obj.default === 'number' ? obj.default : fallback.default,
    Boolean(obj.allow_minus_one)
  )
}

function fromLegacySource(
  source: Record<string, unknown> | null | undefined,
  kind: 'image' | 'video'
): Partial<GenerationCapabilityMatrix> {
  if (!source) return {}
  const counts = asNumberList(source.counts)
  const aspect =
    asStringList(source.aspect_ratio) ?? asStringList(source.aspectRatios)
  const qualities =
    asStringList(source.quality) ?? asStringList(source.qualities)
  const out: Partial<GenerationCapabilityMatrix> = {}
  if (counts) out.n = rangeFromCounts(counts, kind === 'video' ? 1 : 1)
  if (aspect) out.aspect_ratio = aspect
  if (kind === 'image' && qualities) out.quality = qualities
  if (kind === 'video' && qualities) out.resolution = qualities
  const secondsMin =
    typeof source.secondsMin === 'number'
      ? source.secondsMin
      : typeof source.duration_sec === 'object' &&
          source.duration_sec &&
          typeof (source.duration_sec as RawRange).min === 'number'
        ? (source.duration_sec as RawRange).min!
        : undefined
  const secondsMax =
    typeof source.secondsMax === 'number'
      ? source.secondsMax
      : typeof source.duration_sec === 'object' &&
          source.duration_sec &&
          typeof (source.duration_sec as RawRange).max === 'number'
        ? (source.duration_sec as RawRange).max!
        : undefined
  if (kind === 'video' && (secondsMin != null || secondsMax != null)) {
    out.duration_sec = durationRange(
      secondsMin ?? VIDEO_SECONDS_MIN,
      secondsMax ?? VIDEO_SECONDS_MAX,
      DEFAULT_VIDEO_FORM.duration_sec ?? 5
    )
  }
  return out
}

function mergeMatrix(
  base: GenerationCapabilityMatrix,
  patch: Partial<GenerationCapabilityMatrix>
): GenerationCapabilityMatrix {
  return {
    modes: patch.modes?.length ? patch.modes : base.modes,
    n: patch.n ?? base.n,
    aspect_ratio: patch.aspect_ratio?.length
      ? patch.aspect_ratio
      : base.aspect_ratio,
    quality: patch.quality !== undefined ? patch.quality : base.quality,
    resolution:
      patch.resolution !== undefined ? patch.resolution : base.resolution,
    duration_sec: patch.duration_sec ?? base.duration_sec,
    output_format: patch.output_format?.length
      ? patch.output_format
      : base.output_format,
    size_map: patch.size_map ?? base.size_map,
    references: patch.references ?? base.references,
  }
}

function resolveV1Shape(
  parsed: RawCapabilities,
  kind: 'image' | 'video'
): Partial<GenerationCapabilityMatrix> {
  const hasV1 =
    Array.isArray(parsed.modes) ||
    parsed.n != null ||
    parsed.aspect_ratio != null ||
    parsed.resolution != null ||
    parsed.duration_sec != null ||
    parsed.size_map != null
  if (!hasV1) return {}

  const patch: Partial<GenerationCapabilityMatrix> = {}
  if (parsed.modes?.length) patch.modes = parsed.modes
  if (parsed.n != null) {
    patch.n = parseN(
      parsed.n,
      kind === 'video' ? DEFAULT_VIDEO_CAPS.n : DEFAULT_IMAGE_CAPS.n
    )
  }
  const aspect = asStringList(parsed.aspect_ratio)
  if (aspect) patch.aspect_ratio = aspect
  const quality = asStringList(parsed.quality)
  if (quality) patch.quality = quality
  const resolution = asStringList(parsed.resolution)
  if (resolution) patch.resolution = resolution
  if (parsed.duration_sec != null) {
    patch.duration_sec = parseDuration(
      parsed.duration_sec,
      DEFAULT_VIDEO_CAPS.duration_sec
    )
  }
  const formats = asStringList(parsed.output_format)
  if (formats) patch.output_format = formats
  if (parsed.size_map && typeof parsed.size_map === 'object') {
    patch.size_map = parsed.size_map
  }
  if (parsed.references && typeof parsed.references === 'object') {
    const refs: Record<string, { max: number }> = {}
    for (const [key, value] of Object.entries(parsed.references)) {
      refs[key] = { max: typeof value?.max === 'number' ? value.max : 0 }
    }
    patch.references = refs
  }
  return patch
}

export function resolveGenerationCapabilities(
  raw: string | undefined,
  kind: 'image' | 'video'
): GenerationCapabilityMatrix {
  const base = kind === 'video' ? DEFAULT_VIDEO_CAPS : DEFAULT_IMAGE_CAPS
  const parsed = parseRaw(raw)
  if (!parsed) return base

  const nested =
    kind === 'video'
      ? (parsed.video as Record<string, unknown> | undefined)
      : (parsed.image as Record<string, unknown> | undefined)

  // 优先 v1；否则 nested legacy；再否则根级 legacy
  const v1 = resolveV1Shape(
    nested && typeof nested === 'object'
      ? ({ ...parsed, ...nested } as RawCapabilities)
      : parsed,
    kind
  )
  const legacy = fromLegacySource(nested ?? (parsed as Record<string, unknown>), kind)

  let matrix = mergeMatrix(base, { ...legacy, ...v1 })
  // 视频强制 n=1
  if (kind === 'video') {
    matrix = {
      ...matrix,
      n: rangeFromCounts([1], 1),
      modes: matrix.modes.includes('video_generate')
        ? matrix.modes
        : ['video_generate'],
    }
  }
  return matrix
}

export function resolveCapabilitiesForModel(
  model?: Pick<ModelUsageItem, 'model_type' | 'generation_capabilities'>
): GenerationCapabilityMatrix {
  if (model?.model_type === 'video') {
    return resolveGenerationCapabilities(model.generation_capabilities, 'video')
  }
  return resolveGenerationCapabilities(model?.generation_capabilities, 'image')
}

export function resolveImageCapabilities(raw?: string): ImageCapabilityMatrix {
  const matrix = resolveGenerationCapabilities(raw, 'image')
  return {
    counts: nValues(matrix.n),
    aspectRatios: matrix.aspect_ratio,
    qualities: matrix.quality,
  }
}

export function resolveVideoCapabilities(raw?: string): VideoCapabilityMatrix {
  const matrix = resolveGenerationCapabilities(raw, 'video')
  return {
    counts: nValues(matrix.n),
    aspectRatios: matrix.aspect_ratio,
    qualities: matrix.resolution,
    secondsMin: matrix.duration_sec.min,
    secondsMax: matrix.duration_sec.max,
  }
}

export function nValues(range: RangeCapability): number[] {
  if (range.values?.length) return range.values
  const out: number[] = []
  for (let i = range.min; i <= range.max; i += range.step || 1) {
    out.push(i)
  }
  return out.length > 0 ? out : [range.default]
}

export function durationValues(range: RangeCapability): number[] {
  const values = nValues(range)
  if (range.allow_minus_one && !values.includes(-1)) {
    return [-1, ...values]
  }
  return values
}

function pickInList(preferred: string | undefined, list: string[]): string {
  if (preferred && list.includes(preferred)) return preferred
  return list[0] ?? preferred ?? ''
}

export function clampImageConfigToMatrix(
  rawCapabilities?: string
): GenerationFormConfig {
  const matrix = resolveGenerationCapabilities(rawCapabilities, 'image')
  const counts = nValues(matrix.n)
  return {
    ...DEFAULT_IMAGE_FORM,
    n: counts.includes(DEFAULT_IMAGE_FORM.n)
      ? DEFAULT_IMAGE_FORM.n
      : (counts[0] ?? matrix.n.default),
    aspect_ratio: pickInList(
      DEFAULT_IMAGE_FORM.aspect_ratio,
      matrix.aspect_ratio
    ),
    quality: pickInList(DEFAULT_IMAGE_FORM.quality, matrix.quality),
    output_format: pickInList(
      DEFAULT_IMAGE_FORM.output_format,
      matrix.output_format
    ),
  }
}

export function clampVideoConfigToMatrix(
  rawCapabilities?: string
): GenerationFormConfig {
  const matrix = resolveGenerationCapabilities(rawCapabilities, 'video')
  const duration = Math.min(
    Math.max(
      DEFAULT_VIDEO_FORM.duration_sec ?? matrix.duration_sec.default,
      matrix.duration_sec.min
    ),
    matrix.duration_sec.max
  )
  return {
    ...DEFAULT_VIDEO_FORM,
    n: 1,
    aspect_ratio: pickInList(
      DEFAULT_VIDEO_FORM.aspect_ratio,
      matrix.aspect_ratio
    ),
    resolution: pickInList(
      DEFAULT_VIDEO_FORM.resolution,
      matrix.resolution
    ),
    duration_sec: duration,
  }
}

export function validateImageConfig(
  config: GenerationFormConfig,
  rawCapabilities?: string
): string | null {
  const matrix = resolveGenerationCapabilities(rawCapabilities, 'image')
  const counts = nValues(matrix.n)
  if (!counts.includes(config.n)) {
    return 'Current model does not support this image count'
  }
  if (!matrix.aspect_ratio.includes(config.aspect_ratio)) {
    return 'Current model does not support this aspect ratio'
  }
  if (
    matrix.quality.length > 0 &&
    config.quality &&
    !matrix.quality.includes(config.quality)
  ) {
    return 'Current model does not support this image quality'
  }
  return null
}

export function validateVideoConfig(
  config: GenerationFormConfig,
  rawCapabilities?: string
): string | null {
  const matrix = resolveGenerationCapabilities(rawCapabilities, 'video')
  if (config.n !== 1) {
    return 'Current model does not support this video count'
  }
  if (!matrix.aspect_ratio.includes(config.aspect_ratio)) {
    return 'Current model does not support this aspect ratio'
  }
  if (
    matrix.resolution.length > 0 &&
    config.resolution &&
    !matrix.resolution.includes(config.resolution)
  ) {
    return 'Current model does not support this video quality'
  }
  const seconds = config.duration_sec
  if (seconds == null) {
    return 'Current model does not support this video duration'
  }
  if (seconds === -1) {
    if (!matrix.duration_sec.allow_minus_one) {
      return 'Current model does not support this video duration'
    }
    return null
  }
  if (
    seconds < matrix.duration_sec.min ||
    seconds > matrix.duration_sec.max
  ) {
    return 'Current model does not support this video duration'
  }
  return null
}

export function defaultModeForModelType(
  modelType: ModelUsageType
): GenerationFormConfig['mode'] | null {
  if (modelType === 'image') return 'image_generate'
  if (modelType === 'video') return 'video_generate'
  return null
}

/** 将比例映射为 OpenAI 图片常见 size 字符串 */
export function aspectRatioToSize(ratio: string): string {
  switch (ratio) {
    case '1:1':
      return '1024x1024'
    case '3:4':
    case '2:3':
      return '1024x1536'
    case '9:16':
      return '1024x1792'
    case '3:2':
    case '4:3':
    case '16:9':
    case '21:9':
    case 'auto':
    default:
      return '1792x1024'
  }
}

/** Wan 等任务视频认的像素表（与 alibaba 插件 LEGACY/MODERN_SIZES 对齐，x 会被转成 *） */
const VIDEO_SIZE_BY_RESOLUTION: Record<string, Record<string, string>> = {
  '480P': {
    '16:9': '832x480',
    '9:16': '480x832',
    '1:1': '624x624',
  },
  '720P': {
    '16:9': '1280x720',
    '9:16': '720x1280',
    '1:1': '960x960',
    '4:3': '1088x832',
    '3:4': '832x1088',
  },
  '1080P': {
    '16:9': '1920x1080',
    '9:16': '1080x1920',
    '1:1': '1440x1440',
    '4:3': '1632x1248',
    '3:4': '1248x1632',
  },
}

function normalizeVideoResolution(quality: string): string {
  // 兼容异常/旧会话里 quality 缺失，避免 .trim 抛错；缺省回落 720P
  const q = String(quality ?? '').trim().toLowerCase()
  if (!q || q === 'auto') return '720P'
  if (q.endsWith('p')) return q.toUpperCase()
  if (q === '2k' || q === '4k') return '1080P'
  return `${q.toUpperCase()}P`
}

/** 将比例 + 清晰度映射为任务视频可接受的 size（如 1280x720） */
export function aspectRatioToVideoSize(ratio: string, quality: string): string {
  const resolution = normalizeVideoResolution(quality)
  const byRatio =
    VIDEO_SIZE_BY_RESOLUTION[resolution] ?? VIDEO_SIZE_BY_RESOLUTION['720P']
  return byRatio[ratio] ?? byRatio['16:9'] ?? '1280x720'
}
