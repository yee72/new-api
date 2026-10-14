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
import {
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  Film,
  Image as ImageIcon,
  Presentation,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import type { ModelUsageAttachmentDisplayType } from '../lib/attachments'

const TYPE_STYLE: Record<
  ModelUsageAttachmentDisplayType,
  { icon: typeof FileText; className: string }
> = {
  image: { icon: ImageIcon, className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  video: { icon: Film, className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
  pdf: { icon: FileType, className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  sheet: {
    icon: FileSpreadsheet,
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  ppt: {
    icon: Presentation,
    className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  doc: { icon: FileText, className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  file: { icon: File, className: 'bg-muted text-muted-foreground' },
}

type ModelUsageAttachmentIconProps = {
  type: ModelUsageAttachmentDisplayType
  className?: string
  iconClassName?: string
}

export function ModelUsageAttachmentIcon(props: ModelUsageAttachmentIconProps) {
  const style = TYPE_STYLE[props.type] ?? TYPE_STYLE.file
  const Icon = style.icon
  return (
    <span
      className={cn(
        'flex size-full items-center justify-center',
        style.className,
        props.className
      )}
    >
      <Icon className={cn('size-5', props.iconClassName)} />
    </span>
  )
}
