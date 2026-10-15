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
import { Download, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  canPreviewModelUsageAttachment,
  displayTypeFromAttachment,
  isModelUsageAttachmentExpired,
} from '../lib/attachments'
import { downloadModelUsageMedia } from '../lib/media-download'
import type { ModelUsageMessage } from '../types'
import { ModelUsageAttachmentIcon } from './model-usage-attachment-icon'
import { ModelUsageAttachmentTooltip } from './model-usage-attachment-tooltip'
import {
  ModelUsageAuthImage,
  ModelUsageAuthVideo,
} from './model-usage-auth-media'
import { ModelUsageMediaPlaceholder } from './model-usage-media-placeholder'
import { ModelUsageMediaPreview } from './model-usage-media-preview'

type ModelUsageMessageListProps = {
  messages: ModelUsageMessage[]
  emptyHint: string
  busy: boolean
  onDelete: (turnId: string) => void
  onRegenerate: (message: ModelUsageMessage) => void
  onEditUserMessage: (message: ModelUsageMessage, text: string) => Promise<void>
}

export function ModelUsageMessageList(props: ModelUsageMessageListProps) {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id ?? null)
  const [preview, setPreview] = useState<{
    items: { url: string; kind: 'image' | 'video' }[]
    index: number
  } | null>(null)
  const [downloadingMessageId, setDownloadingMessageId] = useState<
    string | null
  >(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

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
          // 图/视频生成中用媒体框架占位；对话仍用文本气泡
          const showGeneratingMedia =
            message.status === 'pending' &&
            !hasImages &&
            !hasVideos &&
            (message.mediaType === 'image' || message.mediaType === 'video')
          const showGeneratingText =
            message.status === 'pending' &&
            !hasImages &&
            !hasVideos &&
            !showGeneratingMedia
          const showTextBubble =
            showGeneratingText ||
            (message.status === 'error' && Boolean(message.content)) ||
            (message.status !== 'pending' &&
              Boolean(message.content) &&
              !hasImages &&
              !hasVideos) ||
            (isUser && Boolean(message.content))
          // 可复制正文：仅对可见文本气泡；生成中占位与纯图/视频结果不复制
          const copyText =
            showTextBubble && !showGeneratingText && message.content.trim()
              ? message.content
              : ''
          const showCopy = Boolean(copyText)
          // 生成结果图/视频可下载（按需拉 blob，不预取）
          const downloadItems: { url: string; kind: 'image' | 'video' }[] = [
            ...images.map((url) => ({ url, kind: 'image' as const })),
            ...videos.flatMap((item) =>
              item.url ? [{ url: item.url, kind: 'video' as const }] : []
            ),
          ]
          const showDownload = downloadItems.length > 0
          const showActions = canAct || showCopy || showDownload
          const downloading = downloadingMessageId === message.id
          const isEditing = editingMessageId === message.id
          const canEdit =
            isUser && canAct && Boolean(message.content.trim()) && !isEditing
          let bubbleTone = 'bg-muted'
          if (isUser) {
            bubbleTone = 'bg-primary text-primary-foreground'
          } else if (message.status === 'error') {
            bubbleTone = 'bg-destructive/10 text-destructive'
          }

          return (
            <div
              key={message.id}
              className={cn(
                'group flex w-full flex-col gap-1.5',
                isUser ? 'items-end' : 'items-start'
              )}
            >
              {isEditing ? (
                <div className='flex w-full max-w-[min(100%,36rem)] flex-col gap-2'>
                  <Textarea
                    value={editDraft}
                    aria-label={t('Edit')}
                    rows={3}
                    disabled={props.busy}
                    onChange={(event) => setEditDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setEditingMessageId(null)
                        return
                      }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        if (!editDraft.trim() || props.busy) return
                        void props
                          .onEditUserMessage(message, editDraft.trim())
                          .then(() => setEditingMessageId(null))
                      }
                    }}
                  />
                  <div className='flex justify-end gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setEditingMessageId(null)}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      disabled={props.busy || !editDraft.trim()}
                      onClick={() => {
                        if (!editDraft.trim() || props.busy) return
                        void props
                          .onEditUserMessage(message, editDraft.trim())
                          .then(() => setEditingMessageId(null))
                      }}
                    >
                      {t('Submit')}
                    </Button>
                  </div>
                </div>
              ) : (
                showTextBubble && (
                  <div
                    className={cn(
                      'max-w-[min(100%,36rem)] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                      bubbleTone
                    )}
                  >
                    {showGeneratingText ? (
                      <span className='inline-flex items-center gap-2'>
                        <Loader2 className='size-3.5 shrink-0 animate-spin' />
                        {message.content ||
                          t('Your work is being generated...')}
                      </span>
                    ) : (
                      message.content
                    )}
                  </div>
                )
              )}

              {showGeneratingMedia && (
                <div className='bg-muted w-full max-w-[min(100%,36rem)] overflow-hidden rounded-2xl p-2'>
                  <ModelUsageMediaPlaceholder
                    label={t('Waiting to generate...')}
                  />
                </div>
              )}

              {hasImages && (
                <div
                  className={cn(
                    'bg-muted max-w-[min(100%,36rem)] overflow-hidden rounded-2xl p-2',
                    // 单图气泡随作品尺寸收缩，避免右侧大块空白
                    images.length === 1
                      ? 'w-fit'
                      : 'grid w-full grid-cols-2 gap-2'
                  )}
                >
                  {images.map((url) => (
                    <button
                      key={`${message.id}-${url}`}
                      type='button'
                      className={cn(
                        'bg-background/40 hover:ring-primary/50 focus-visible:ring-ring block overflow-hidden rounded-xl text-left transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none',
                        images.length === 1 ? 'w-fit max-w-full' : 'w-full'
                      )}
                      onClick={() =>
                        setPreview({
                          items: images.map((item) => ({
                            url: item,
                            kind: 'image' as const,
                          })),
                          index: images.indexOf(url),
                        })
                      }
                      aria-label={t('Image Preview')}
                    >
                      <ModelUsageAuthImage
                        url={url}
                        alt={t('Generated image')}
                        fitContent={images.length === 1}
                        className={images.length === 1 ? undefined : 'w-full'}
                      />
                    </button>
                  ))}
                </div>
              )}

              {hasVideos && (
                <div
                  className={cn(
                    'bg-muted max-w-[min(100%,36rem)] overflow-hidden rounded-2xl p-2',
                    videos.length === 1
                      ? 'w-fit'
                      : 'grid w-full grid-cols-2 gap-2'
                  )}
                >
                  {videos.map((video) => {
                    const url = video.url
                    if (!url) return null
                    const playable = videos.flatMap((item) =>
                      item.url ? [item.url] : []
                    )
                    return (
                      <button
                        key={`${message.id}-video-${url}`}
                        type='button'
                        className={cn(
                          'bg-background/40 hover:ring-primary/50 focus-visible:ring-ring block overflow-hidden rounded-xl text-left transition hover:ring-2 focus-visible:ring-2 focus-visible:outline-none',
                          videos.length === 1 ? 'w-fit max-w-full' : 'w-full'
                        )}
                        onClick={() =>
                          setPreview({
                            items: playable.map((item) => ({
                              url: item,
                              kind: 'video' as const,
                            })),
                            index: playable.indexOf(url),
                          })
                        }
                        aria-label={t('Video Preview')}
                      >
                        <ModelUsageAuthVideo
                          url={url}
                          fitContent={videos.length === 1}
                          className={videos.length === 1 ? undefined : 'w-full'}
                          controls={false}
                          muted
                        />
                      </button>
                    )
                  })}
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
                    const canPreview =
                      canPreviewModelUsageAttachment(attachment)
                    const displayType = displayTypeFromAttachment(attachment)
                    const attachmentUrl = attachment.url
                    // 过期：文件名标识；未过期：类型图标/缩略图，悬停看名称与类型
                    if (expired) {
                      return (
                        <ModelUsageAttachmentTooltip
                          key={attachment.id}
                          name={attachment.name}
                          type={displayType}
                          hint={t('Attachment expired')}
                        >
                          <div className='bg-muted/60 text-muted-foreground flex size-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed opacity-70'>
                            <ModelUsageAttachmentIcon
                              type={displayType}
                              className='size-auto bg-transparent'
                              iconClassName='size-4 opacity-70'
                            />
                            <span className='max-w-[3.25rem] truncate px-1 text-[9px]'>
                              {attachment.name}
                            </span>
                          </div>
                        </ModelUsageAttachmentTooltip>
                      )
                    }
                    return (
                      <ModelUsageAttachmentTooltip
                        key={attachment.id}
                        name={attachment.name}
                        type={displayType}
                      >
                        <button
                          type='button'
                          disabled={!canPreview}
                          onClick={() => {
                            if (!canPreview || !attachmentUrl) return
                            setPreview({
                              items: [{ url: attachmentUrl, kind: 'image' }],
                              index: 0,
                            })
                          }}
                          className={cn(
                            'bg-background size-14 overflow-hidden rounded-lg border',
                            canPreview && 'hover:ring-primary/40 hover:ring-2'
                          )}
                          aria-label={attachment.name}
                        >
                          {canPreview && attachmentUrl ? (
                            <ModelUsageAuthImage
                              url={attachmentUrl}
                              alt=''
                              compact
                              className='size-full object-cover'
                            />
                          ) : (
                            <ModelUsageAttachmentIcon type={displayType} />
                          )}
                        </button>
                      </ModelUsageAttachmentTooltip>
                    )
                  })}
                </div>
              )}

              {showActions && (
                <TooltipProvider>
                  <div
                    className={cn(
                      'flex gap-1 opacity-70 transition-opacity group-hover:opacity-100',
                      isUser ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {canEdit && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              disabled={props.busy}
                              aria-label={t('Edit')}
                              onClick={() => {
                                setEditingMessageId(message.id)
                                setEditDraft(message.content)
                              }}
                            >
                              <Pencil className='size-3.5' />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          <p>{t('Edit')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {showCopy && (
                      <CopyButton
                        value={copyText}
                        size='icon-sm'
                        variant='ghost'
                        tooltip={t('Copy')}
                        aria-label={t('Copy')}
                        iconClassName='size-3.5'
                      />
                    )}
                    {showDownload && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              disabled={downloading}
                              aria-label={t('Download')}
                              onClick={() => {
                                setDownloadingMessageId(message.id)
                                void (async () => {
                                  try {
                                    for (const item of downloadItems) {
                                      await downloadModelUsageMedia(item.url, {
                                        kind: item.kind,
                                        userId,
                                      })
                                    }
                                  } catch {
                                    toast.error(t('Download failed'))
                                  } finally {
                                    setDownloadingMessageId(null)
                                  }
                                })()
                              }}
                            >
                              {downloading ? (
                                <Loader2 className='size-3.5 animate-spin' />
                              ) : (
                                <Download className='size-3.5' />
                              )}
                            </Button>
                          }
                        />
                        <TooltipContent>
                          <p>{t('Download')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {canAct && !isUser && message.prompt && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              disabled={props.busy}
                              aria-label={t('Regenerate')}
                              onClick={() => props.onRegenerate(message)}
                            >
                              <RefreshCw className='size-3.5' />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          <p>{t('Regenerate')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {canAct && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon-sm'
                              className='text-destructive'
                              disabled={props.busy}
                              aria-label={t('Delete')}
                              onClick={() => props.onDelete(message.turnId)}
                            >
                              <Trash2 className='size-3.5' />
                            </Button>
                          }
                        />
                        <TooltipContent>
                          <p>{t('Delete')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>
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
          setPreview((current) => (current ? { ...current, index } : current))
        }
      />
    </>
  )
}
