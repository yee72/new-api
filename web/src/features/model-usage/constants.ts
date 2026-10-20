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
import type { ModelUsageTab } from './types'
import {
  DEFAULT_IMAGE_FORM,
  DEFAULT_VIDEO_FORM,
  type GenerationFormConfig,
} from './lib/generation-request'
import {
  IMAGE_QUALITY_TIER_VALUES,
  IMAGE_RESOLUTION_VALUES,
} from './lib/generation-option-labels'

export const MODEL_USAGE_TABS: Array<{ value: ModelUsageTab; labelKey: string }> =
  [
    { value: 'all', labelKey: 'All' },
    { value: 'chat', labelKey: 'Chat' },
    { value: 'image', labelKey: 'Image' },
    { value: 'video', labelKey: 'Video' },
  ]

export const IMAGE_COUNT_OPTIONS = [1, 2, 4, 6, 10] as const
/** 视频强制单条生成 */
export const VIDEO_COUNT_OPTIONS = [1] as const
export const ASPECT_RATIO_OPTIONS = [
  'auto',
  '1:1',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '16:9',
  '9:16',
  '21:9',
] as const

/** 图片质量档位（精细度） */
export const IMAGE_QUALITY_OPTIONS = [...IMAGE_QUALITY_TIER_VALUES] as const
/** 图片清晰度（2k/4k，不含 1k） */
export const IMAGE_RESOLUTION_OPTIONS = [...IMAGE_RESOLUTION_VALUES] as const

export const VIDEO_RESOLUTION_OPTIONS = [
  'auto',
  '480p',
  '720p',
  '1080p',
  '2k',
  '4k',
] as const

/** @deprecated 使用 DEFAULT_IMAGE_FORM */
export const DEFAULT_IMAGE_CONFIG: GenerationFormConfig = DEFAULT_IMAGE_FORM
/** @deprecated 使用 DEFAULT_VIDEO_FORM */
export const DEFAULT_VIDEO_CONFIG: GenerationFormConfig = DEFAULT_VIDEO_FORM

export const VIDEO_SECONDS_MIN = 1
export const VIDEO_SECONDS_MAX = 15

export const MODEL_TYPE_LABEL_KEY: Record<string, string> = {
  chat: 'Chat',
  image: 'Image',
  video: 'Video',
}

/** 列表卡片右侧类型文字（对话 / 图片 / 视频） */
export const MODEL_TYPE_BADGE_LABEL_KEY: Record<string, string> = {
  chat: 'Conversation',
  image: 'Image',
  video: 'Video',
}
