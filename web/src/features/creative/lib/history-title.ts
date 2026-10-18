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
import dayjs from '@/lib/dayjs'

/** 历史标题时间：Asia/Shanghai，格式 YYYY/MM/DD HH:mm */
export function formatCreativeHistoryTime(unixSec: number): string {
  if (!unixSec) return ''
  // UTC+8 固定偏移，避免依赖 timezone 插件
  return dayjs(unixSec * 1000)
    .utcOffset(8)
    .format('YYYY/MM/DD HH:mm')
}

export function truncateCreativeSubject(text: string, max = 12): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const chars = [...trimmed]
  if (chars.length <= max) return trimmed
  return chars.slice(0, max).join('')
}
