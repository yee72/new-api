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

// 解析地址栏中的厂商筛选。负数是默认定价展示厂商（OpenAI 为 -1012），0 与非法片段丢弃。
export function parseModelUsageVendorIds(raw?: string): number[] {
  if (!raw) {
    return []
  }
  const ids: number[] = []
  for (const part of raw.split(',')) {
    const id = Number(part.trim())
    if (Number.isInteger(id) && id !== 0) {
      ids.push(id)
    }
  }
  return ids
}
