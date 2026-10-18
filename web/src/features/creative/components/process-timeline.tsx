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
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import type { CreativeProcessEvent } from '../lib/process-log'

type ProcessTimelineProps = {
  events: CreativeProcessEvent[]
  busy?: boolean
  className?: string
}

export function CreativeProcessTimeline(props: ProcessTimelineProps) {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [props.events.length])

  if (props.events.length === 0) {
    return null
  }

  const messageOf = (event: CreativeProcessEvent) => {
    const params: Record<string, string | number> = {
      ...event.params,
    }
    if (typeof params.kind === 'string') {
      params.kind = t(params.kind)
    }
    return t(event.messageKey, params)
  }

  return (
    <div
      className={cn(
        'bg-muted/30 max-h-96 space-y-3 overflow-y-auto rounded-xl border px-3 py-3',
        props.className
      )}
    >
      {props.events.map((event) => {
        if (event.type === 'stage') {
          return (
            <div key={event.id} className='pt-1'>
              <div className='flex items-center gap-2'>
                <span className='bg-border h-px flex-1' />
                <span className='text-foreground shrink-0 text-xs font-semibold tracking-wide'>
                  {messageOf(event)}
                </span>
                <span className='bg-border h-px flex-1' />
              </div>
            </div>
          )
        }
        return (
          <div
            key={event.id}
            className={cn(
              'flex items-start gap-2 text-xs leading-relaxed',
              event.status === 'error' && 'text-destructive',
              event.status === 'done' && 'text-muted-foreground',
              event.status === 'running' && 'text-foreground'
            )}
          >
            <span className='mt-1.5 size-1.5 shrink-0 rounded-full bg-current opacity-60' />
            <div className='min-w-0 flex-1 space-y-1'>
              <div className='flex items-start gap-2'>
                <span className='min-w-0 flex-1'>{messageOf(event)}</span>
                {event.status === 'running' && props.busy ? (
                  <Spinner className='mt-0.5 size-3 shrink-0' />
                ) : null}
              </div>
              {event.body ? (
                <pre className='bg-background/80 text-muted-foreground max-h-36 overflow-auto rounded-md border px-2 py-1.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap'>
                  {event.body}
                </pre>
              ) : null}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
