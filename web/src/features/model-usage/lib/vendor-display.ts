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
import type { ModelUsageVendor } from '../types'

/** 下拉筛选：海外厂商合并为「大厂直供」 */
export const MAJOR_VENDOR_DIRECT_VALUE = 'major_direct'

/** 国内厂商名称关键词（小写匹配） */
const DOMESTIC_VENDOR_KEYWORDS = [
  '阿里',
  '通义',
  'qwen',
  '字节',
  '豆包',
  'doubao',
  '快手',
  '可灵',
  'kling',
  'deepseek',
  '深度求索',
  'minimax',
  '海螺',
  '智谱',
  'zhipu',
  'glm',
  '月之暗面',
  'moonshot',
  'kimi',
  '百川',
  'baichuan',
  '零一',
  '01.ai',
  '商汤',
  'sense',
  '腾讯',
  '混元',
  '华为',
  '盘古',
  '百度',
  '文心',
  'ernie',
  '讯飞',
  '星火',
  '阶跃',
  'stepfun',
  'step-',
  '生数',
  'vidu',
  '秘塔',
  '面壁',
  '书生',
  '清言',
  '火山',
  'volc',
  '方舟',
  '即梦',
  'jimeng',
  '硅基',
  'silicon',
  '天工',
  'skywork',
  '万象',
]

/** 负数定价展示厂商视为海外；其余按名称关键词判断国内 */
export function isDomesticModelUsageVendor(vendor: {
  id: number
  name: string
}): boolean {
  if (vendor.id < 0) return false
  const name = vendor.name.trim().toLowerCase()
  if (!name) return false
  return DOMESTIC_VENDOR_KEYWORDS.some((keyword) =>
    name.includes(keyword.toLowerCase())
  )
}

export type ModelUsageVendorFilterOption = {
  value: string
  label: string
  vendorIds: number[]
  /** 是否为合并后的海外「大厂直供」 */
  isMajorDirect?: boolean
}

/** 构建下拉选项：全部 / 大厂直供 / 国内厂商 */
export function buildModelUsageVendorFilterOptions(
  vendors: ModelUsageVendor[],
  majorDirectLabel: string
): ModelUsageVendorFilterOption[] {
  const domestic: ModelUsageVendor[] = []
  const foreignIds: number[] = []
  for (const vendor of vendors) {
    if (isDomesticModelUsageVendor(vendor)) {
      domestic.push(vendor)
    } else {
      foreignIds.push(vendor.id)
    }
  }
  domestic.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  const options: ModelUsageVendorFilterOption[] = []
  if (foreignIds.length > 0) {
    options.push({
      value: MAJOR_VENDOR_DIRECT_VALUE,
      label: majorDirectLabel,
      vendorIds: foreignIds,
      isMajorDirect: true,
    })
  }
  for (const vendor of domestic) {
    options.push({
      value: `vendor:${vendor.id}`,
      label: vendor.name,
      vendorIds: [vendor.id],
    })
  }
  return options
}

/** 根据当前选中的 vendorIds 反推下拉值 */
export function resolveModelUsageVendorFilterValue(
  selectedVendorIds: number[],
  options: ModelUsageVendorFilterOption[]
): string {
  if (selectedVendorIds.length === 0) return 'all'
  const selected = new Set(selectedVendorIds)
  for (const option of options) {
    if (
      option.vendorIds.length === selected.size &&
      option.vendorIds.every((id) => selected.has(id))
    ) {
      return option.value
    }
  }
  // 多选残留时，优先匹配大厂直供子集
  const major = options.find((item) => item.isMajorDirect)
  if (
    major &&
    selectedVendorIds.length > 0 &&
    selectedVendorIds.every((id) => major.vendorIds.includes(id))
  ) {
    return MAJOR_VENDOR_DIRECT_VALUE
  }
  return 'all'
}
