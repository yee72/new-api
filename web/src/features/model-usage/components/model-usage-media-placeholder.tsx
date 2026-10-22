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
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

type ModelUsageMediaPlaceholderProps = {
  label: string
  className?: string
}

/** 图/视频作品的统一占位框架：加载中或生成中共用 */
export function ModelUsageMediaPlaceholder(
  props: ModelUsageMediaPlaceholderProps
) {
  return (
    <div
      role='status'
      aria-live='polite'
      aria-label={props.label}
      className={cn(
        'bg-muted/70 text-muted-foreground flex aspect-video w-full min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed',
        props.className
      )}
    >
      <Loader2 className='size-5 shrink-0 animate-spin' aria-hidden />
      <span className='px-3 text-center text-xs'>{props.label}</span>
    </div>
  )
}
