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
import type {
  ImageGenerationConfig,
  ModelUsageTab,
  VideoGenerationConfig,
} from './types'

export const MODEL_USAGE_TABS: Array<{ value: ModelUsageTab; labelKey: string }> =
  [
    { value: 'all', labelKey: 'All' },
    { value: 'chat', labelKey: 'Chat' },
    { value: 'image', labelKey: 'Image' },
    { value: 'video', labelKey: 'Video' },
  ]

export const IMAGE_COUNT_OPTIONS = [1, 2, 4, 6, 10] as const
export const VIDEO_COUNT_OPTIONS = [1, 2, 4] as const
export const ASPECT_RATIO_OPTIONS = ['1:1', '3:4', '16:9', '9:16'] as const
export const IMAGE_QUALITY_OPTIONS = ['auto', '2k', '4k'] as const
export const VIDEO_QUALITY_OPTIONS = ['auto', '480p', '720p'] as const

export const DEFAULT_IMAGE_CONFIG: ImageGenerationConfig = {
  n: 4,
  aspectRatio: '16:9',
  quality: 'auto',
}

export const DEFAULT_VIDEO_CONFIG: VideoGenerationConfig = {
  n: 1,
  aspectRatio: '16:9',
  quality: '720p',
  seconds: 5,
}

export const VIDEO_SECONDS_MIN = 1
export const VIDEO_SECONDS_MAX = 15

export const MODEL_TYPE_LABEL_KEY: Record<string, string> = {
  chat: 'Chat',
  image: 'Image',
  video: 'Video',
}
