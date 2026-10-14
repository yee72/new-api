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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  attachmentTypeLabelKey,
  type ModelUsageAttachmentDisplayType,
} from '../lib/attachments'

type ModelUsageAttachmentTooltipProps = {
  name: string
  type: ModelUsageAttachmentDisplayType
  children: ReactNode
  /** 过期等额外说明 */
  hint?: string
}

export function ModelUsageAttachmentTooltip(
  props: ModelUsageAttachmentTooltipProps
) {
  const { t } = useTranslation()
  const typeLabel = t(attachmentTypeLabelKey(props.type))
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={<span className='inline-flex max-w-full' />}
        >
          {props.children}
        </TooltipTrigger>
        <TooltipContent side='top' className='max-w-xs'>
          <p className='truncate font-medium'>{props.name}</p>
          <p className='text-background/80 text-[11px]'>
            {props.hint ? `${typeLabel} · ${props.hint}` : typeLabel}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
