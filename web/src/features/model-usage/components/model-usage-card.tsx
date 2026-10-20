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
import { Check, Loader2, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { formatModelUsageDisplayName } from '../lib/model-display-name'
import type { ModelUsageItem } from '../types'
import { ModelUsageTypeBadge } from './model-usage-type-badge'

type ModelUsageCardProps = {
  model: ModelUsageItem
  selected: boolean
  sending?: boolean
  pinned?: boolean
  onSelect: (modelName: string) => void
  onTogglePin: (modelName: string) => void
}

export function ModelUsageCard(props: ModelUsageCardProps) {
  const { t } = useTranslation()
  const iconKey = props.model.icon || props.model.vendor_icon
  const icon = iconKey ? getLobeIcon(iconKey, 28) : null
  const fullName = props.model.model_name
  const displayName = formatModelUsageDisplayName(props.model)
  const description = props.model.description?.trim() || ''
  const initial = displayName?.charAt(0).toUpperCase() || '?'
  const pinLabel = props.pinned ? t('Unpin model') : t('Pin model')
  const tooltipLabel =
    displayName !== fullName ? `${displayName} (${fullName})` : fullName

  return (
    <div
      role='button'
      tabIndex={0}
      onClick={() => props.onSelect(fullName)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          props.onSelect(fullName)
        }
      }}
      aria-pressed={props.selected}
      aria-label={displayName}
      className={cn(
        'relative w-full cursor-pointer rounded-lg border bg-card p-3 text-left transition-colors',
        'hover:bg-accent/40 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        props.selected
          ? 'border-primary ring-primary/20 ring-1'
          : 'border-border'
      )}
    >
      <div className='flex items-start gap-3'>
        <div className='relative size-10 shrink-0'>
          <div className='bg-muted flex size-10 items-center justify-center overflow-hidden rounded-md'>
            {icon ?? (
              <span className='text-muted-foreground text-sm font-semibold'>
                {initial}
              </span>
            )}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type='button'
                    className={cn(
                      'absolute -top-1.5 -left-1.5 z-10 inline-flex size-5 items-center justify-center rounded-full border bg-background shadow-sm transition-colors',
                      'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                      props.pinned
                        ? 'border-amber-500 text-amber-500'
                        : 'border-muted-foreground/50 text-muted-foreground/70 hover:border-foreground/50 hover:text-foreground'
                    )}
                    aria-label={pinLabel}
                    aria-pressed={Boolean(props.pinned)}
                    onClick={(event) => {
                      event.stopPropagation()
                      props.onTogglePin(fullName)
                    }}
                  />
                }
              >
                <Star className='size-2.5 fill-none' aria-hidden />
              </TooltipTrigger>
              <TooltipContent side='right'>{pinLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<div className='min-w-0 flex-1' />}
            >
              <div className='flex items-center gap-2'>
                <span className='truncate text-sm font-medium'>
                  {displayName}
                </span>
                {props.sending && (
                  <Loader2
                    className='text-muted-foreground size-3.5 shrink-0 animate-spin'
                    aria-label={t('Your work is being generated...')}
                  />
                )}
              </div>
              {description ? (
                <p className='text-muted-foreground mt-0.5 line-clamp-2 text-xs'>
                  {description}
                </p>
              ) : null}
            </TooltipTrigger>
            <TooltipContent side='right'>{tooltipLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <ModelUsageTypeBadge
          type={props.model.model_type}
          className='mt-0.5'
        />
      </div>
      {props.selected && (
        <span
          className='bg-primary text-primary-foreground absolute right-2 bottom-2 flex size-5 items-center justify-center rounded-full'
          aria-hidden='true'
        >
          <Check className='size-3' />
        </span>
      )}
    </div>
  )
}
