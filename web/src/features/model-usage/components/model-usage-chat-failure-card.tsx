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
import { ChevronDown, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type ModelUsageChatFailureCardProps = {
  title: string
  detail?: string
}

/** 对话失败卡片：默认折叠为标题，可展开接口原文 */
export function ModelUsageChatFailureCard(
  props: ModelUsageChatFailureCardProps
) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const detail = props.detail?.trim()
  const canExpand = Boolean(detail && detail !== props.title.trim())
  const body = expanded && canExpand ? detail : props.title

  return (
    <div
      className={cn(
        'border-destructive/25 bg-destructive/10 text-destructive',
        'relative max-w-[min(100%,36rem)] rounded-2xl border px-3.5 py-2.5 text-sm'
      )}
    >
      <div className='flex items-start gap-2.5'>
        <span
          className='bg-destructive text-destructive-foreground mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full'
          aria-hidden
        >
          <X className='size-2.5' strokeWidth={3} />
        </span>
        <p className='min-w-0 flex-1 whitespace-pre-wrap'>{body}</p>
      </div>
      {canExpand && (
        <button
          type='button'
          className={cn(
            'bg-destructive/15 hover:bg-destructive/25 text-destructive',
            'absolute -bottom-2.5 left-1/2 inline-flex size-5 -translate-x-1/2 items-center justify-center rounded-full',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
          )}
          aria-expanded={expanded}
          aria-label={
            expanded ? t('Hide error details') : t('Show error details')
          }
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              expanded && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
      )}
    </div>
  )
}
