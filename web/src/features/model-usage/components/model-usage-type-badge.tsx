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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { MODEL_TYPE_BADGE_LABEL_KEY } from '../constants'
import type { ModelUsageType } from '../types'

type ModelUsageTypeBadgeProps = {
  type: ModelUsageType | string
  className?: string
}

/** 模型类型文字标签：对话 / 图片 / 视频 */
export function ModelUsageTypeBadge(props: ModelUsageTypeBadgeProps) {
  const { t } = useTranslation()
  const labelKey = MODEL_TYPE_BADGE_LABEL_KEY[props.type] || 'Conversation'
  const label = t(labelKey)

  let colorClass =
    'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
  if (props.type === 'image') {
    colorClass =
      'bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
  } else if (props.type === 'video') {
    colorClass =
      'bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        colorClass,
        props.className
      )}
    >
      {label}
    </span>
  )
}
