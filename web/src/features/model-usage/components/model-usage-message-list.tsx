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
import { FileText, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  canPreviewModelUsageAttachment,
  isModelUsageAttachmentExpired,
} from '../lib/attachments'
import type { ModelUsageMessage } from '../types'
import {
  ModelUsageAuthImage,
  ModelUsageAuthVideo,
} from './model-usage-auth-media'
import { ModelUsageMediaPreview } from './model-usage-media-preview'

type ModelUsageMessageListProps = {
  messages: ModelUsageMessage[]
  emptyHint: string
  busy: boolean
  onDelete: (turnId: string) => void
  onRegenerate: (message: ModelUsageMessage) => void
}

export function ModelUsageMessageList(props: ModelUsageMessageListProps) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<{
    items: { url: string; kind: 'image' | 'video' }[]
    index: number
  } | null>(null)

  if (props.messages.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        {props.emptyHint}
      </p>
    )
  }

  return (
    <>
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-5'>
        {props.messages.map((message) => {
          const isUser = message.role === 'user'
          const canAct = message.status !== 'pending'
          const images = message.images?.filter(Boolean) ?? []
          const videos =
            message.videos?.filter((item) => Boolean(item.url)) ?? []
          const attachments = message.attachments ?? []
          const hasImages = images.length > 0
          const hasVideos = videos.length > 0
          const hasAttachments = attachments.length > 0
          // 已有媒体时不再展示「生成中」占位；完成态空 content 也不出气泡
          const showGenerating =
            message.status === 'pending' && !hasImages && !hasVideos
          const showTextBubble =
            showGenerating ||
            (message.status === 'error' && Boolean(message.content)) ||
            (message.status !== 'pending' &&
              Boolean(message.content) &&
              !hasImages &&
              !hasVideos) ||
            (isUser && Boolean(message.content))

          return (
            <div
              key={message.id}
              className={cn(
                'group flex w-full flex-col gap-1.5',
                isUser ? 'items-end' : 'items-start'
              )}
            >
              {showTextBubble && (
                <div
                  className={cn(
                    'max-w-[min(100%,36rem)] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                    isUser
                      ? 'bg-primary text-primary-foreground'
                      : message.status === 'error'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted'
                  )}
                >
                  {showGenerating ? (
                    <span className='inline-flex items-center gap-2'>
                      <Loader2 className='size-3.5 shrink-0 animate-spin' />
                      {message.content || t('Your work is being generated...')}
                    </span>
                  ) : (
                    message.content
                  )}
                </div>
              )}

              {hasImages && (
                <div
                  className={cn(
                    'bg-muted w-full max-w-[min(100%,36rem)] overflow-hidden rounded-2xl p-2',
                    images.length === 1
                      ? 'flex'
                      : 'grid grid-cols-2 gap-2'
                  )}
                >
                  {images.map((url, index) => (
                    <button
                      key={`${message.id}-${index}`}
                      type='button'
                      className='bg-background/40 hover:ring-primary/50 focus-visible:ring-ring block overflow-hidden rounded-xl text-left transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none'
                      onClick={() =>
                        setPreview({
                          items: images.map((url) => ({
                            url,
                            kind: 'image' as const,
                          })),
                          index,
                        })
                      }
                      aria-label={t('Image Preview')}
                    >
                      <ModelUsageAuthImage
                        url={url}
                        alt={t('Generated image')}
                        className={cn(
                          'max-h-80 bg-black/20 object-contain',
                          images.length === 1 ? 'max-w-full' : 'w-full'
                        )}
                      />
                    </button>
                  ))}
                </div>
              )}

              {hasVideos && (
                <div
                  className={cn(
                    'bg-muted w-full max-w-[min(100%,36rem)] overflow-hidden rounded-2xl p-2',
                    videos.length === 1
                      ? 'flex'
                      : 'grid grid-cols-2 gap-2'
                  )}
                >
                  {videos.map((video, index) => (
                    <button
                      key={`${message.id}-video-${index}`}
                      type='button'
                      className='bg-background/40 hover:ring-primary/50 focus-visible:ring-ring block overflow-hidden rounded-xl text-left transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none'
                      onClick={() =>
                        setPreview({
                          items: videos.map((item) => ({
                            url: item.url!,
                            kind: 'video' as const,
                          })),
                          index,
                        })
                      }
                      aria-label={t('Video Preview')}
                    >
                      <ModelUsageAuthVideo
                        url={video.url!}
                        className={cn(
                          'max-h-80 bg-black/20 object-contain',
                          videos.length === 1 ? 'max-w-full' : 'w-full'
                        )}
                        controls={false}
                        muted
                      />
                    </button>
                  ))}
                </div>
              )}

              {hasAttachments && (
                <div
                  className={cn(
                    'flex w-full max-w-[min(100%,36rem)] flex-wrap gap-2',
                    isUser ? 'justify-end' : 'justify-start'
                  )}
                >
                  {attachments.map((attachment) => {
                    const expired = isModelUsageAttachmentExpired(attachment)
                    const canPreview = canPreviewModelUsageAttachment(attachment)
                    // 过期：仅文件名标识；未过期：缩略图/图标，不展示名称类型
                    if (expired) {
                      return (
                        <div
                          key={attachment.id}
                          className='bg-muted/60 text-muted-foreground flex max-w-[14rem] items-center gap-1.5 rounded-lg border border-dashed px-2 py-1.5 text-xs opacity-70'
                          title={t('Attachment expired')}
                        >
                          <FileText className='size-3.5 shrink-0' />
                          <span className='truncate'>{attachment.name}</span>
                        </div>
                      )
                    }
                    return (
                      <button
                        key={attachment.id}
                        type='button'
                        disabled={!canPreview}
                        onClick={() => {
                          if (!canPreview || !attachment.url) return
                          setPreview({
                            items: [{ url: attachment.url, kind: 'image' }],
                            index: 0,
                          })
                        }}
                        className={cn(
                          'bg-background size-14 overflow-hidden rounded-lg border',
                          canPreview && 'hover:ring-primary/40 hover:ring-2'
                        )}
                        title={attachment.name}
                        aria-label={attachment.name}
                      >
                        {canPreview ? (
                          <ModelUsageAuthImage
                            url={attachment.url!}
                            alt=''
                            className='size-full object-cover'
                          />
                        ) : (
                          <span className='bg-muted text-muted-foreground flex size-full items-center justify-center'>
                            <FileText className='size-5' />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {canAct && (
                <div
                  className={cn(
                    'flex gap-1 opacity-70 transition-opacity group-hover:opacity-100',
                    isUser ? 'justify-end' : 'justify-start'
                  )}
                >
                  {!isUser && message.prompt && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-7 px-2 text-xs'
                      disabled={props.busy}
                      onClick={() => props.onRegenerate(message)}
                    >
                      <RefreshCw className='mr-1 size-3' />
                      {t('Regenerate')}
                    </Button>
                  )}
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='text-destructive h-7 px-2 text-xs'
                    disabled={props.busy}
                    onClick={() => props.onDelete(message.turnId)}
                  >
                    <Trash2 className='mr-1 size-3' />
                    {t('Delete')}
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ModelUsageMediaPreview
        items={preview?.items ?? []}
        index={preview?.index ?? 0}
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
        onIndexChange={(index) =>
          setPreview((current) =>
            current ? { ...current, index } : current
          )
        }
      />
    </>
  )
}
