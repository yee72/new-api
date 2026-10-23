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

/** 质量档位（精细度），与分辨率 2k/4k 分离 */
export const IMAGE_QUALITY_TIER_VALUES = [
  'auto',
  'low',
  'medium',
  'high',
  'standard',
  'hd',
] as const

/** 图片清晰度（像素档），不含 1k */
export const IMAGE_RESOLUTION_VALUES = ['auto', '2k', '4k'] as const

const QUALITY_TIER_SET = new Set<string>(IMAGE_QUALITY_TIER_VALUES)
const RESOLUTION_LIKE =
  /^(auto|480p|720p|1080p|\d+k)$/i

export function isQualityTierValue(value: string): boolean {
  return QUALITY_TIER_SET.has(value.toLowerCase())
}

export function isResolutionLikeValue(value: string): boolean {
  return RESOLUTION_LIKE.test(value.trim())
}

/** 将混在一起的旧 qualities 拆成档位与分辨率 */
export function splitLegacyQualityList(values: string[]): {
  quality: string[]
  resolution: string[]
} {
  const quality: string[] = []
  const resolution: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    if (!value) continue
    if (isQualityTierValue(value)) {
      quality.push(value.toLowerCase())
      continue
    }
    if (isResolutionLikeValue(value)) {
      resolution.push(value.toLowerCase())
      continue
    }
    // 未知值仍归档位，避免丢失能力表自定义项
    quality.push(value)
  }
  return { quality, resolution }
}

/** 图片比例选项文案；auto 用「自适应」与质量档位的 Auto 区分 */
export function aspectRatioOptionLabelKey(value: string): string {
  if (value.trim().toLowerCase() === 'auto') return 'Adaptive'
  return value
}

/** i18n key（英文源文案）；未知值原样返回供 t 回退 */
export function generationOptionLabelKey(value: string): string {
  switch (value.trim().toLowerCase()) {
    case 'auto':
      return 'Auto'
    case 'low':
      return 'Low'
    case 'medium':
      return 'Medium'
    case 'high':
      return 'High'
    case 'standard':
      return 'Standard'
    case 'hd':
      return 'HD'
    case '2k':
      return '2K'
    case '4k':
      return '4K'
    case '480p':
      return '480p'
    case '720p':
      return '720p'
    case '1080p':
      return '1080p'
    default:
      return value
  }
}
