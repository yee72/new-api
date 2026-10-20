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
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { formatModelUsageDisplayName } from '../lib/model-display-name'
import type { ModelUsageItem } from '../types'

type ModelUsageEmptyIntroProps = {
  model: Pick<
    ModelUsageItem,
    'model_name' | 'display_name' | 'description' | 'icon' | 'vendor_icon'
  >
  /** 无介绍文案时的兜底提示 */
  fallbackHint: string
  className?: string
}

/** 无对话记录时：居中图标 + 模型介绍卡片 */
export function ModelUsageEmptyIntro(props: ModelUsageEmptyIntroProps) {
  const iconKey = props.model.icon || props.model.vendor_icon
  const icon = iconKey ? getLobeIcon(iconKey, 88) : null
  const displayName = formatModelUsageDisplayName(props.model)
  const description = props.model.description?.trim() || ''
  const initial = displayName.charAt(0).toUpperCase() || '?'

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-10',
        props.className
      )}
    >
      <div className='relative flex size-28 items-center justify-center'>
        <div
          className='absolute inset-2 rounded-full bg-cyan-400/15 blur-2xl'
          aria-hidden
        />
        <div className='border-cyan-400/35 bg-background/80 relative flex size-24 items-center justify-center overflow-hidden rounded-2xl border shadow-[0_0_28px_rgba(34,211,238,0.18)]'>
          {icon ?? (
            <span className='text-muted-foreground text-3xl font-semibold'>
              {initial}
            </span>
          )}
        </div>
      </div>

      {description ? (
        <div className='border-cyan-500/40 bg-card/70 w-full max-w-xl rounded-xl border px-5 py-4 shadow-[0_0_24px_rgba(34,211,238,0.1)]'>
          <p className='text-foreground mb-2 text-sm font-medium'>
            {displayName}
          </p>
          <p className='text-foreground/85 text-sm leading-relaxed whitespace-pre-wrap'>
            {description}
          </p>
        </div>
      ) : (
        <p className='text-muted-foreground max-w-md text-center text-sm'>
          {props.fallbackHint}
        </p>
      )}
    </div>
  )
}
