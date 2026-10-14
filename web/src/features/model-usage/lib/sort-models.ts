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
import type { ModelUsageItem } from '../types'
import type { ModelUsagePins } from '../stores/pins-store'

/**
 * 置顶模型靠前；多个置顶按置顶时间降序；未置顶保持接口原有使用量排序（稳定排序）。
 * 仅对当前列表内的模型生效，因此切换类型 Tab 后只会看到当前类型的置顶。
 */
export function sortModelsWithPins(
  models: ModelUsageItem[],
  pins: ModelUsagePins
): ModelUsageItem[] {
  if (models.length <= 1) return models
  return [...models].sort((a, b) => {
    const pinA = pins[a.model_name] ?? 0
    const pinB = pins[b.model_name] ?? 0
    if (pinA !== pinB) return pinB - pinA
    return 0
  })
}
