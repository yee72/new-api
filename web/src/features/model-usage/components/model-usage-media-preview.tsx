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
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { downloadModelUsageMedia } from '../lib/media-download'
import {
  ModelUsageAuthImage,
  ModelUsageAuthVideo,
} from './model-usage-auth-media'

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
  const [downloading, setDownloading] = useState(false)
  const current = props.items[props.index]
  const hasMultiple = props.items.length > 1
  const isVideo = current?.kind === 'video'

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
      footer={
        current?.url ? (
          <Button
            type='button'
            variant='outline'
            disabled={downloading}
            onClick={() => {
              setDownloading(true)
              void downloadModelUsageMedia(current.url, {
                kind: current.kind,
              })
                .catch(() => {
                  toast.error(t('Download failed'))
                })
                .finally(() => {
                  setDownloading(false)
                })
            }}
          >
            {downloading ? (
              <Loader2 className='mr-1 size-4 animate-spin' />
            ) : (
              <Download className='mr-1 size-4' />
            )}
            {t('Download')}
          </Button>
        ) : null
      }
    >
      <div className='bg-muted/40 relative flex min-h-[280px] items-center justify-center rounded-lg border p-2 sm:min-h-[420px]'>
        {!current?.url ? (
          <Skeleton className='absolute inset-2 rounded-md' />
        ) : isVideo ? (
          <ModelUsageAuthVideo
            url={current.url}
            className='max-h-[min(82dvh,860px)] w-full object-contain'
            controls
          />
        ) : (
          <ModelUsageAuthImage
            url={current.url}
            alt={t('Generated image')}
            className='max-h-[min(82dvh,860px)] w-full object-contain'
          />
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
