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
import { Image as ImageIcon, MessageSquare, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { MODEL_TYPE_LABEL_KEY } from '../constants'
import type { ModelUsageType } from '../types'

type ModelUsageTypeIconProps = {
  type: ModelUsageType | string
  className?: string
  iconClassName?: string
}

/** 模型类型：仅图标，对话绿 / 图片黄 / 视频紫 */
export function ModelUsageTypeIcon(props: ModelUsageTypeIconProps) {
  const { t } = useTranslation()
  const labelKey = MODEL_TYPE_LABEL_KEY[props.type] || 'Chat'
  const label = t(labelKey)

  let Icon = MessageSquare
  let colorClass = 'text-emerald-500'
  if (props.type === 'image') {
    Icon = ImageIcon
    colorClass = 'text-amber-500'
  } else if (props.type === 'video') {
    Icon = Video
    colorClass = 'text-violet-500'
  }

  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md',
        props.className
      )}
      title={label}
      aria-label={label}
    >
      <Icon
        className={cn('size-4', colorClass, props.iconClassName)}
        aria-hidden
      />
    </span>
  )
}
