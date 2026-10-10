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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export type ModelUsagePreviewItem = {
  url: string
  kind: 'image' | 'video'
}

type ModelUsageMediaPreviewProps = {
  items: ModelUsagePreviewItem[]
  index: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onIndexChange: (index: number) => void
}

export function ModelUsageMediaPreview(props: ModelUsageMediaPreviewProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const current = props.items[props.index]
  const hasMultiple = props.items.length > 1
  const isVideo = current?.kind === 'video'

  useEffect(() => {
    if (!props.open) return
    setLoading(true)
    setFailed(false)
  }, [props.open, props.index, current?.url])

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={isVideo ? t('Video Preview') : t('Image Preview')}
      description={
        hasMultiple
          ? t('Image {{current}} of {{total}}', {
              current: props.index + 1,
              total: props.items.length,
            })
          : isVideo
            ? t('View the attached video')
            : t('View the generated image')
      }
      contentClassName='sm:max-w-6xl'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      <div className='bg-muted/40 relative flex min-h-[280px] items-center justify-center rounded-lg border p-2 sm:min-h-[420px]'>
        {(loading || failed) && !isVideo && (
          <Skeleton className='absolute inset-2 rounded-md' />
        )}
        {current?.url && isVideo ? (
          <video
            src={current.url}
            controls
            className='max-h-[min(82dvh,860px)] w-full object-contain'
            onLoadedData={() => {
              setLoading(false)
              setFailed(false)
            }}
            onError={() => {
              setLoading(false)
              setFailed(true)
            }}
          />
        ) : null}
        {current?.url && !isVideo ? (
          <img
            src={current.url}
            alt={t('Generated image')}
            className={`max-h-[min(82dvh,860px)] w-full object-contain transition-opacity ${
              loading || failed ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={() => {
              setLoading(false)
              setFailed(false)
            }}
            onError={() => {
              setLoading(false)
              setFailed(true)
            }}
          />
        ) : null}
        {failed && (
          <p className='text-muted-foreground absolute inset-0 flex items-center justify-center text-sm'>
            {t('Failed to load image')}
          </p>
        )}
        {hasMultiple && (
          <>
            <Button
              type='button'
              size='icon'
              variant='secondary'
              className='absolute top-1/2 left-2 -translate-y-1/2'
              disabled={props.index <= 0}
              onClick={() => props.onIndexChange(Math.max(0, props.index - 1))}
              aria-label={t('Previous')}
            >
              <ChevronLeft className='size-4' />
            </Button>
            <Button
              type='button'
              size='icon'
              variant='secondary'
              className='absolute top-1/2 right-2 -translate-y-1/2'
              disabled={props.index >= props.items.length - 1}
              onClick={() =>
                props.onIndexChange(
                  Math.min(props.items.length - 1, props.index + 1)
                )
              }
              aria-label={t('Next')}
            >
              <ChevronRight className='size-4' />
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
