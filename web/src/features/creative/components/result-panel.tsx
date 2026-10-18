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
import { ChevronLeft, ChevronRight, Download, ImageIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { ModelUsageAuthImage } from '@/features/model-usage/components/model-usage-auth-media'
import {
  downloadModelUsageMedia,
  fetchModelUsageMediaBlob,
  triggerBlobDownload,
} from '@/features/model-usage/lib/media-download'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import type { CreativeProcessEvent } from '../lib/process-log'
import { KIND_LABELS, type CreativeAsset } from '../types'
import { CreativeProcessTimeline } from './process-timeline'

type ResultPanelProps = {
  assets: CreativeAsset[]
  busy?: boolean
  processEvents?: CreativeProcessEvent[]
  stepLabel?: string
}

export function CreativeResultPanel(props: ResultPanelProps) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id ?? null)
  const processEvents = props.processEvents ?? []
  const slots = useMemo(
    () => props.assets.filter((item) => item.kind !== 'reference'),
    [props.assets]
  )
  const successImages = useMemo(
    () => slots.filter((item) => Boolean(item.url) && item.status !== 'failed'),
    [slots]
  )
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [logsCollapsed, setLogsCollapsed] = useState(false)

  useEffect(() => {
    setSelected(new Set(successImages.map((item) => item.id)))
    if (currentIndex >= successImages.length) {
      setCurrentIndex(0)
    }
  }, [successImages, currentIndex])

  // 有成功出图后默认折叠过程日志，突出预览
  useEffect(() => {
    if (successImages.length > 0 && !props.busy) {
      setLogsCollapsed(true)
    }
  }, [successImages.length, props.busy])

  const current = successImages[currentIndex]
  const selectedCount = selected.size
  const hasProcess = processEvents.length > 0

  const toggleSelect = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const downloadSelected = async () => {
    const targets = successImages.filter(
      (item) => selected.has(item.id) && item.url
    )
    if (targets.length === 0) {
      toast.error(t('Please select at least one image'))
      return
    }
    setDownloading(true)
    try {
      for (let i = 0; i < targets.length; i++) {
        const asset = targets[i]
        const url = asset.url
        if (!url) continue
        const filename = `creative-${asset.kind}-${asset.slot_index + 1}-${i + 1}`
        try {
          await downloadModelUsageMedia(url, {
            kind: 'image',
            filename,
            userId,
          })
        } catch {
          const blob = await fetchModelUsageMediaBlob(url)
          triggerBlobDownload(blob, `${filename}.png`)
        }
        if (i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      }
      toast.success(t('Download started'))
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Download failed')
      )
    } finally {
      setDownloading(false)
    }
  }

  const processBlock =
    hasProcess && !logsCollapsed ? (
      <CreativeProcessTimeline events={processEvents} busy={props.busy} />
    ) : null

  if (slots.length === 0) {
    return (
      <div className='bg-card flex h-full min-h-[420px] flex-col gap-3 rounded-2xl border p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <h2 className='text-base font-semibold'>{t('Generation result')}</h2>
            <p className='text-muted-foreground mt-1 text-xs'>
              {props.stepLabel ||
                t('Results appear here after generation completes.')}
            </p>
          </div>
          {hasProcess && successImages.length > 0 ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => setLogsCollapsed((v) => !v)}
            >
              {logsCollapsed ? t('Show process') : t('Hide process')}
            </Button>
          ) : null}
        </div>
        {processBlock}
        {!hasProcess && (
          <div className='text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center'>
            <div className='bg-muted flex size-16 items-center justify-center rounded-2xl'>
              {props.busy ? (
                <Spinner className='size-7' />
              ) : (
                <ImageIcon className='size-7 opacity-60' />
              )}
            </div>
            <p className='text-sm'>
              {props.busy
                ? t('Working on your request...')
                : t(
                    'Upload references and set requirements. Preview or download when complete.'
                  )}
            </p>
          </div>
        )}
        {hasProcess && props.busy && (
          <p className='text-muted-foreground text-center text-xs'>
            {t('Working on your request...')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className='bg-card flex h-full min-h-[420px] flex-col rounded-2xl border p-4'>
      <div className='mb-3 flex items-center justify-between gap-3'>
        <div>
          <h2 className='text-base font-semibold'>{t('Generation result')}</h2>
          <p className='text-muted-foreground text-xs'>
            {props.stepLabel
              ? props.stepLabel
              : t('{{count}} selected', { count: selectedCount })}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {hasProcess ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => setLogsCollapsed((v) => !v)}
            >
              {logsCollapsed ? t('Show process') : t('Hide process')}
            </Button>
          ) : null}
          {selectedCount > 0 && (
            <Button
              type='button'
              size='sm'
              disabled={downloading}
              onClick={() => void downloadSelected()}
            >
              <Download className='size-4' />
              {t('Download selected')}
            </Button>
          )}
        </div>
      </div>

      {processBlock ? <div className='mb-3'>{processBlock}</div> : null}

      {/* 全部槽位缩略图：进行中转圈，失败标注，成功可勾选 */}
      <div className='mb-3 flex gap-2 overflow-x-auto pb-1'>
        {slots.map((asset) => {
          const successIndex = successImages.findIndex(
            (item) => item.id === asset.id
          )
          const isSuccess = successIndex >= 0
          const isFailed = asset.status === 'failed'
          const isPending = !isSuccess && !isFailed
          const checked = selected.has(asset.id)
          return (
            <div
              key={asset.id}
              className={cn(
                'relative size-16 shrink-0 overflow-hidden rounded-lg border',
                isSuccess &&
                  successIndex === currentIndex &&
                  'ring-primary ring-2'
              )}
            >
              {isSuccess && asset.url ? (
                <>
                  <button
                    type='button'
                    className='size-full'
                    onClick={() => setCurrentIndex(successIndex)}
                  >
                    <ModelUsageAuthImage
                      url={asset.url}
                      alt=''
                      compact
                      className='size-full object-cover'
                    />
                  </button>
                  <div className='absolute top-1 left-1'>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleSelect(asset.id, value === true)
                      }
                      className='bg-background/90'
                    />
                  </div>
                </>
              ) : (
                <div className='bg-muted/40 text-muted-foreground flex size-full flex-col items-center justify-center gap-1 px-1 text-center'>
                  {isPending && props.busy ? (
                    <Spinner className='size-4' />
                  ) : (
                    <span className='text-[10px] leading-tight'>
                      {isFailed ? t('Failed') : t('Incomplete')}
                    </span>
                  )}
                  <span className='text-[9px] leading-tight'>
                    {KIND_LABELS[asset.kind] || asset.kind}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className='relative flex min-h-0 flex-1 flex-col items-center justify-center'>
        {current?.url ? (
          <ModelUsageAuthImage
            url={current.url}
            alt=''
            className='max-h-[480px] w-full rounded-xl object-contain'
          />
        ) : (
          <div className='text-muted-foreground flex flex-col items-center gap-2 text-sm'>
            {props.busy ? <Spinner className='size-6' /> : null}
            <p>{t('Working on your request...')}</p>
          </div>
        )}
        {successImages.length > 0 && (
          <div className='mt-4 flex items-center gap-3'>
            <Button
              type='button'
              size='icon-sm'
              variant='outline'
              disabled={currentIndex <= 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className='size-4' />
            </Button>
            <span className='text-muted-foreground min-w-16 text-center text-sm tabular-nums'>
              {currentIndex + 1} / {successImages.length}
            </span>
            <Button
              type='button'
              size='icon-sm'
              variant='outline'
              disabled={currentIndex >= successImages.length - 1}
              onClick={() =>
                setCurrentIndex((i) =>
                  Math.min(successImages.length - 1, i + 1)
                )
              }
            >
              <ChevronRight className='size-4' />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
