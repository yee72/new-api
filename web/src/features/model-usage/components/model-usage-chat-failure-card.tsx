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

/** 对话失败气泡：标题右侧可展开，展开后保留标题并追加无底细节行 */
export function ModelUsageChatFailureCard(
  props: ModelUsageChatFailureCardProps
) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const detail = props.detail?.trim()
  const canExpand = Boolean(detail && detail !== props.title.trim())
  const showDetail = expanded && canExpand

  return (
    <div
      className={cn(
        'border-destructive/25 max-w-[min(100%,36rem)] overflow-hidden rounded-2xl border text-sm',
        // 折叠时整块粉底；展开时仅首行粉底，细节行无底
        !showDetail && 'bg-destructive/10'
      )}
    >
      <div
        className={cn(
          'text-destructive flex items-start gap-2 px-3.5 py-2.5',
          showDetail && 'bg-destructive/10'
        )}
      >
        <span
          className='bg-destructive text-destructive-foreground mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full'
          aria-hidden
        >
          <X className='size-2.5' strokeWidth={3} />
        </span>
        <p className='min-w-0 flex-1 whitespace-pre-wrap'>{props.title}</p>
        {canExpand && (
          <button
            type='button'
            className={cn(
              'text-destructive hover:bg-destructive/15',
              'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md',
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
      {showDetail && (
        <div className='text-destructive flex items-start gap-2 bg-transparent px-3.5 pb-2.5'>
          <span className='size-4 shrink-0' aria-hidden />
          <p className='min-w-0 flex-1 whitespace-pre-wrap'>{detail}</p>
        </div>
      )}
    </div>
  )
}
