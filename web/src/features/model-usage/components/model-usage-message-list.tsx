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
import {
  Download,
  Loader2,
  Pencil,
  Quote,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Response } from '@/components/ai-elements/response'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  attachmentDisplayUrl,
  canPreviewModelUsageAttachment,
  displayTypeFromAttachment,
  isModelUsageAttachmentExpired,
} from '../lib/attachments'
import { downloadModelUsageMedia } from '../lib/media-download'
import type { ModelUsageItem, ModelUsageMessage } from '../types'
import { ModelUsageAttachmentIcon } from './model-usage-attachment-icon'
import { ModelUsageAttachmentTooltip } from './model-usage-attachment-tooltip'
import {
  ModelUsageAuthImage,
  ModelUsageAuthVideo,
} from './model-usage-auth-media'
import { ModelUsageChatFailureCard } from './model-usage-chat-failure-card'
import { ModelUsageEmptyIntro } from './model-usage-empty-intro'
import { ModelUsageMediaPlaceholder } from './model-usage-media-placeholder'
import { ModelUsageMediaPreview } from './model-usage-media-preview'

type ModelUsageMessageListProps = {
  messages: ModelUsageMessage[]
  emptyHint: string
  /** 无消息时展示模型介绍 */
  model?: Pick<
    ModelUsageItem,
    'model_name' | 'display_name' | 'description' | 'icon' | 'vendor_icon'
  >
  busy: boolean
  /** 已引用的文本消息 id，用于按钮高亮 */
  quotedMessageIds?: ReadonlySet<string>
  /** 已引用作品的助手消息 id */
  quotedWorkMessageIds?: ReadonlySet<string>
  /** 对话文本引用（历史拼装） */
  onQuote?: (message: ModelUsageMessage) => void
  /** 作品引用 → 输入区附件 */
  onQuoteWork?: (message: ModelUsageMessage) => void
  /** 编辑用户气泡 → 回填输入区 */
  onEditToComposer?: (message: ModelUsageMessage) => void
  onDelete: (turnId: string) => void
  onRegenerate: (message: ModelUsageMessage) => void
}

function formatMessageTime(unixSec?: number): string | null {
  if (!unixSec || unixSec <= 0) return null
  return dayjs.unix(unixSec).format('YYYY-MM-DD HH:mm:ss')
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
  const [pendingDeleteTurnId, setPendingDeleteTurnId] = useState<string | null>(
    null
  )

  if (props.messages.length === 0) {
    if (props.model) {
      return (
        <ModelUsageEmptyIntro
          model={props.model}
          fallbackHint={props.emptyHint}
        />
      )
    }
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        {props.emptyHint}
      </p>
    )
  }

  return (
    <>
      {/* 多轮气泡间距：原 gap-5(1.25rem) 增加 70% → 2.125rem */}
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-[2.125rem]'>
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
          // 可复制正文：文本气泡或失败卡片；失败优先复制接口原文
          let copyText = ''
          if (
            message.status === 'error' &&
            (message.errorDetail?.trim() || message.content.trim())
          ) {
            copyText = message.errorDetail?.trim() || message.content.trim()
          } else if (
            showTextBubble &&
            !showGeneratingText &&
            message.content.trim()
          ) {
            copyText = message.content
          }
          const showCopy = Boolean(copyText)
          // 生成结果图/视频可下载（按需拉 blob，不预取）
          const downloadItems: { url: string; kind: 'image' | 'video' }[] = [
            ...images.map((url) => ({ url, kind: 'image' as const })),
            ...videos.flatMap((item) =>
              item.url ? [{ url: item.url, kind: 'video' as const }] : []
            ),
          ]
          const showDownload = downloadItems.length > 0
          // 对话文本引用（拼上游历史）
          const canQuoteText =
            Boolean(props.onQuote) &&
            message.status === 'done' &&
            message.mediaType === 'text' &&
            Boolean(message.content.trim())
          // 生成作品引用 → 输入区附件
          const canQuoteWork =
            Boolean(props.onQuoteWork) &&
            !isUser &&
            message.status === 'done' &&
            (hasImages || hasVideos)
          const isQuoted = Boolean(props.quotedMessageIds?.has(message.id))
          const isWorkQuoted = Boolean(
            props.quotedWorkMessageIds?.has(message.id)
          )
          const canQuote = canQuoteText || canQuoteWork
          const showActions = canAct || showCopy || showDownload || canQuote
          const downloading = downloadingMessageId === message.id
          const canEdit =
            isUser &&
            canAct &&
            Boolean(props.onEditToComposer) &&
            (Boolean(message.content.trim()) || hasAttachments)
          let bubbleTone = 'bg-muted'
          if (isUser) {
            bubbleTone = 'bg-primary text-primary-foreground'
          } else if (message.status === 'error') {
            bubbleTone = 'bg-destructive/10 text-destructive'
          }
          const showFailureCard =
            !isUser &&
            message.status === 'error' &&
            Boolean(message.content.trim())
          const timeLabel = !isUser
            ? formatMessageTime(message.created_at)
            : null
          // 生图/生视频：作品上方优先展示意图摘要 workNote，否则回退用户原文 prompt
          const workPrompt = !isUser
            ? message.workNote?.trim() || message.prompt?.trim()
            : ''
          const showWorkPrompt =
            Boolean(workPrompt) &&
            (hasImages || hasVideos || showGeneratingMedia)

          return (
            <div
              key={message.id}
              className={cn(
                'group flex w-full flex-col gap-1.5',
                isUser ? 'items-end' : 'items-start'
              )}
            >
              {showFailureCard && (
                <ModelUsageChatFailureCard
                  title={message.content}
                  detail={message.errorDetail}
                />
              )}
              {!showFailureCard && showTextBubble && (
                <div
                  className={cn(
                    'rounded-2xl px-3.5 py-2 text-sm',
                    // 助手 Markdown 表格需更宽并可横向滚动；用户气泡仍限宽纯文本
                    isUser
                      ? 'max-w-[min(100%,36rem)] whitespace-pre-wrap'
                      : 'max-w-[min(100%,48rem)] overflow-x-auto',
                    bubbleTone
                  )}
                >
                  {showGeneratingText && !message.content.trim() ? (
                    <span className='inline-flex items-center gap-2'>
                      <Loader2 className='size-3.5 shrink-0 animate-spin' />
                      {t('Generating...')}
                    </span>
                  ) : isUser ? (
                    message.content
                  ) : (
                    <Response
                      final={message.status === 'done'}
                      parserId={`model-usage-${message.id}`}
                      className={cn(
                        'text-sm leading-relaxed [&_pre]:max-w-full',
                        // muted 气泡上抬高表格对比度，避免表头与底色糊成一片
                        '[&_thead]:bg-background/80 [&_tbody_tr]:bg-background/40',
                        '[&_th]:text-foreground/80 [&_td]:text-foreground'
                      )}
                    >
                      {message.content}
                    </Response>
                  )}
                </div>
              )}

              {showWorkPrompt && (
                <p className='text-muted-foreground max-w-[min(100%,36rem)] text-sm leading-relaxed whitespace-pre-wrap'>
                  {workPrompt}
                </p>
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
                    const attachmentUrl = attachmentDisplayUrl(attachment)
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

              {/* 操作按钮与发起时间同一水平：左操作、右时间 */}
              {(showActions || timeLabel) && (
                <div
                  className={cn(
                    'flex w-full max-w-[min(100%,36rem)] items-center gap-2',
                    isUser && 'justify-end'
                  )}
                >
                  {showActions && (
                    <TooltipProvider>
                      <div className='flex gap-1 opacity-70 transition-opacity group-hover:opacity-100'>
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
                                  onClick={() =>
                                    props.onEditToComposer?.(message)
                                  }
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
                        {canQuote && (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='icon-sm'
                                  disabled={props.busy}
                                  aria-label={t('Quote')}
                                  aria-pressed={
                                    canQuoteWork ? isWorkQuoted : isQuoted
                                  }
                                  className={cn(
                                    (canQuoteWork
                                      ? isWorkQuoted
                                      : isQuoted) &&
                                      'bg-accent text-accent-foreground'
                                  )}
                                  onClick={() => {
                                    if (canQuoteWork) {
                                      props.onQuoteWork?.(message)
                                      return
                                    }
                                    props.onQuote?.(message)
                                  }}
                                >
                                  {/* 镂空双引号，略大于同行图标以便辨认 */}
                                  <Quote
                                    className='size-4'
                                    strokeWidth={1.75}
                                    aria-hidden
                                  />
                                </Button>
                              }
                            />
                            <TooltipContent>
                              <p>{t('Quote')}</p>
                            </TooltipContent>
                          </Tooltip>
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
                                          await downloadModelUsageMedia(
                                            item.url,
                                            {
                                              kind: item.kind,
                                              userId,
                                            }
                                          )
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
                                  onClick={() =>
                                    props.onRegenerate(message)
                                  }
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
                                  onClick={() =>
                                    setPendingDeleteTurnId(message.turnId)
                                  }
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
                  {timeLabel && (
                    <time
                      dateTime={dayjs
                        .unix(message.created_at!)
                        .toISOString()}
                      className='text-muted-foreground ml-auto shrink-0 text-[10px] leading-none tabular-nums'
                    >
                      {timeLabel}
                    </time>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteTurnId)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteTurnId(null)
        }}
        title={t('Delete this turn?')}
        desc={t(
          'This will delete the question and its reply. This action cannot be undone.'
        )}
        confirmText={t('Delete')}
        destructive
        handleConfirm={() => {
          if (!pendingDeleteTurnId) return
          props.onDelete(pendingDeleteTurnId)
          setPendingDeleteTurnId(null)
        }}
      />

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
