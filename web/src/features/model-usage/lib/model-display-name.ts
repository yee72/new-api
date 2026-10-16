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

/**
 * 列表短名：去掉第一个 `-` 及之前的前缀。
 * 例如 `claude-fable-5-1` → `fable-5-1`；无 `-` 时返回原名。
 */
export function formatModelUsageShortName(modelName: string): string {
  const trimmed = modelName.trim()
  if (!trimmed) return trimmed
  const dashIndex = trimmed.indexOf('-')
  if (dashIndex < 0 || dashIndex === trimmed.length - 1) {
    return trimmed
  }
  return trimmed.slice(dashIndex + 1)
}
