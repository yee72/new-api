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
  ChevronDown,
  FileText,
  Images,
  Loader2,
  Plus,
  Ratio,
  Send,
  Sparkles,
  Timer,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { MODEL_TYPE_LABEL_KEY } from '../constants'
import {
  resolveImageCapabilities,
  resolveVideoCapabilities,
} from '../lib/capabilities'
import { resolveInvokeProtocol } from '../lib/invoke-protocol'
import type {
  ImageGenerationConfig,
  LocalAttachment,
  LocalAttachmentKind,
  ModelUsageItem,
  ModelUsageMessage,
  ModelUsageSession,
  VideoGenerationConfig,
} from '../types'
import {
  ModelUsageMediaPreview,
  type ModelUsagePreviewItem,
} from './model-usage-media-preview'
import { ModelUsageMessageList } from './model-usage-message-list'

type ModelUsageWorkspaceProps = {
  model?: ModelUsageItem
  session: ModelUsageSession
  isAuthenticated: boolean
  onRequireLogin: () => void
  onSend: (text: string) => Promise<void>
  onDeleteTurn: (turnId: string) => void
  onRegenerate: (message: ModelUsageMessage) => Promise<void>
  onImageConfigChange: (config: ImageGenerationConfig) => void
  onVideoConfigChange: (config: VideoGenerationConfig) => void
}

function fileExt(name: string) {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

function attachmentKind(file: File): LocalAttachmentKind {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  const ext = fileExt(file.name)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return 'image'
  }
  if (['mp4', 'webm', 'mov', 'mkv', 'm4v'].includes(ext)) return 'video'
  return 'file'
}

function SettingPill(props: {
  label: string
  value: string
  icon: ReactNode
  children: ReactNode
  onValueChange: (value: string) => void
}) {
  return (
    <Select
      value={props.value}
      onValueChange={(value) => {
        if (value == null) return
        props.onValueChange(value)
      }}
    >
      <SelectTrigger
        size='sm'
        className={cn(
          'bg-muted/50 hover:bg-muted h-8 max-w-full gap-1.5 rounded-lg border-transparent px-2.5 shadow-none',
          // 隐藏默认上下展开图标，改用单向下箭头
          '[&>svg:last-child]:hidden'
        )}
      >
        <span className='text-muted-foreground flex shrink-0 items-center'>
          {props.icon}
        </span>
        <span className='text-muted-foreground text-xs'>{props.label}</span>
        <SelectValue className='flex-none font-medium' />
        <ChevronDown className='text-muted-foreground size-3.5 opacity-70' />
      </SelectTrigger>
      <SelectContent align='start'>{props.children}</SelectContent>
    </Select>
  )
}

export function ModelUsageWorkspace(props: ModelUsageWorkspaceProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [preview, setPreview] = useState<{
    items: ModelUsagePreviewItem[]
    index: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  const model = props.model
  const invokeProtocol = useMemo(
    () => (model ? resolveInvokeProtocol(model) : 'chat'),
    [model]
  )
  const imageCaps = useMemo(
    () => resolveImageCapabilities(model?.generation_capabilities),
    [model?.generation_capabilities]
  )
  const videoCaps = useMemo(
    () => resolveVideoCapabilities(model?.generation_capabilities),
    [model?.generation_capabilities]
  )
  const videoSecondOptions = useMemo(() => {
    const options: number[] = []
    for (
      let second = videoCaps.secondsMin;
      second <= videoCaps.secondsMax;
      second += 1
    ) {
      options.push(second)
    }
    return options
  }, [videoCaps.secondsMin, videoCaps.secondsMax])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [props.session.messages.length, props.session.sending])

  useEffect(() => {
    return () => {
      for (const item of attachmentsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
    }
  }, [])

  if (!model) {
    return (
      <div className='text-muted-foreground flex flex-1 items-center justify-center p-8 text-sm'>
        {t('Select a model to start')}
      </div>
    )
  }

  const iconKey = model.icon || model.vendor_icon
  const icon = iconKey ? getLobeIcon(iconKey, 32) : null
  const typeLabel = t(MODEL_TYPE_LABEL_KEY[model.model_type] || 'Chat')
  const hasAttachments = attachments.length > 0
  // 仅当前模型发送中时禁用输入，其他模型进行中的请求互不影响
  const busy = props.session.sending
  const promptPlaceholder =
    model.model_type === 'image'
      ? t(
          'Recommended prompt structure: subject + scene + style + lighting + atmosphere. High resolution may take longer.'
        )
      : t('Enter your question or generation prompt')

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || (files instanceof FileList && files.length === 0)) return
    const list = Array.from(files)
    if (list.length === 0) return

    const next: LocalAttachment[] = []
    for (const file of list) {
      const kind = attachmentKind(file)
      const previewUrl =
        kind === 'image' || kind === 'video'
          ? URL.createObjectURL(file)
          : undefined
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        ext: fileExt(file.name),
        size: file.size,
        type: file.type,
        kind,
        file,
        previewUrl,
      })
    }
    setAttachments((current) => [...current, ...next])
  }

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const openAttachmentPreview = (attachment: LocalAttachment) => {
    if (attachment.kind === 'file' || !attachment.previewUrl) return
    const media = attachments.filter(
      (item) =>
        (item.kind === 'image' || item.kind === 'video') && item.previewUrl
    )
    const items: ModelUsagePreviewItem[] = media.map((item) => ({
      url: item.previewUrl!,
      kind: item.kind === 'video' ? 'video' : 'image',
    }))
    const index = media.findIndex((item) => item.id === attachment.id)
    setPreview({ items, index: Math.max(0, index) })
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardFiles = event.clipboardData?.files
    if (clipboardFiles && clipboardFiles.length > 0) {
      event.preventDefault()
      addFiles(clipboardFiles)
      return
    }
    const items = event.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
  }

  const handleSubmit = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    if (!props.isAuthenticated) {
      props.onRequireLogin()
      return
    }
    if (hasAttachments) {
      toast.info(t('Attachments are not available yet'))
      return
    }
    setPrompt('')
    await props.onSend(text)
  }

  const emptyHint =
    model.model_type === 'chat'
      ? t('Ask anything about this model')
      : model.model_type === 'image'
        ? t('Generated images will appear here')
        : t('Generated videos will appear here')

  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
      <div className='flex shrink-0 items-center gap-2.5 border-b px-4 py-2'>
        <div className='bg-muted flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md'>
          {icon}
        </div>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <h2 className='truncate text-sm font-semibold'>{model.model_name}</h2>
          <Badge className='h-5 px-1.5 text-[10px]'>{typeLabel}</Badge>
          {busy && (
            <Badge variant='outline' className='h-5 gap-1 px-1.5 text-[10px]'>
              <Loader2 className='size-3 animate-spin' />
              {t('Your work is being generated...')}
            </Badge>
          )}
        </div>
      </div>

      <div ref={listRef} className='min-h-0 flex-1 overflow-y-auto px-4 py-4'>
        <ModelUsageMessageList
          messages={props.session.messages}
          emptyHint={emptyHint}
          busy={busy}
          onDelete={props.onDeleteTurn}
          onRegenerate={(message) => void props.onRegenerate(message)}
        />
      </div>

      <div className='bg-background shrink-0 border-t px-3 py-2.5 sm:px-4'>
        <div className='bg-muted/30 rounded-xl border p-2.5 sm:p-3'>
          <div className='flex items-stretch gap-2.5 sm:gap-3'>
            <input
              ref={fileInputRef}
              type='file'
              className='hidden'
              multiple
              accept='image/*,video/*,.ppt,.pptx,.csv'
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type='button'
                      onClick={() => fileInputRef.current?.click()}
                      aria-label={t('Reference image')}
                      className={cn(
                        'bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground',
                        'flex h-[72px] w-[58px] shrink-0 -skew-x-12 flex-col items-center justify-center gap-1 rounded-md border border-dashed transition-colors',
                        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
                      )}
                    />
                  }
                >
                  <span className='flex skew-x-12 flex-col items-center gap-0.5'>
                    <Plus className='size-5' strokeWidth={2.25} />
                    <span className='text-[10px] leading-none'>
                      {t('Reference image')}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {t('Supported attachments: image, video, ppt, csv')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className='flex min-w-0 flex-1 flex-col gap-2'>
              {hasAttachments && (
                <div className='flex flex-wrap gap-2'>
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className='bg-background relative flex max-w-[11rem] items-center gap-2 rounded-lg border p-1.5'
                    >
                      {file.kind === 'image' && file.previewUrl ? (
                        <button
                          type='button'
                          className='size-10 shrink-0 overflow-hidden rounded-md'
                          onClick={() => openAttachmentPreview(file)}
                          aria-label={t('Image Preview')}
                        >
                          <img
                            src={file.previewUrl}
                            alt={file.name}
                            className='size-full object-cover'
                          />
                        </button>
                      ) : file.kind === 'video' && file.previewUrl ? (
                        <button
                          type='button'
                          className='bg-muted relative size-10 shrink-0 overflow-hidden rounded-md'
                          onClick={() => openAttachmentPreview(file)}
                          aria-label={t('Video Preview')}
                        >
                          <video
                            src={file.previewUrl}
                            className='size-full object-cover'
                            muted
                            playsInline
                            preload='metadata'
                          />
                        </button>
                      ) : (
                        <div className='bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md'>
                          <FileText className='size-4' />
                        </div>
                      )}
                      <div className='min-w-0 flex-1 pr-4'>
                        <p className='truncate text-xs font-medium'>
                          {file.name}
                        </p>
                        <p className='text-muted-foreground text-[10px] uppercase'>
                          {file.ext || t('File')}
                        </p>
                      </div>
                      <button
                        type='button'
                        className='text-muted-foreground hover:text-foreground absolute top-1 right-1 rounded-sm p-0.5'
                        onClick={() => removeAttachment(file.id)}
                        aria-label={t('Remove attachment')}
                      >
                        <X className='size-3' />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className='flex items-end gap-2'>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onPaste={handlePaste}
                  placeholder={promptPlaceholder}
                  rows={2}
                  className='min-h-[64px] flex-1 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0'
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSubmit()
                    }
                  }}
                />
                <Button
                  type='button'
                  size='icon'
                  className='rounded-full'
                  disabled={busy || !prompt.trim() || hasAttachments}
                  onClick={() => void handleSubmit()}
                  title={
                    hasAttachments
                      ? t('Attachments are not available yet')
                      : t('Send')
                  }
                >
                  {busy ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <Send className='size-4' />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Images API 才展示张数/比例/质量；chat 协议生图仅用提示词 */}
          {model.model_type === 'image' && invokeProtocol === 'images' && (
            <div className='mt-2 flex flex-wrap gap-1.5'>
              <SettingPill
                label={t('Image count')}
                value={String(props.session.imageConfig.n)}
                icon={<Images className='size-3.5 text-amber-500' />}
                onValueChange={(value) =>
                  props.onImageConfigChange({
                    ...props.session.imageConfig,
                    n: Number(value),
                  })
                }
              >
                {imageCaps.counts.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count}
                  </SelectItem>
                ))}
              </SettingPill>
              <SettingPill
                label={t('Aspect ratio')}
                value={props.session.imageConfig.aspectRatio}
                icon={<Ratio className='size-3.5' />}
                onValueChange={(value) =>
                  props.onImageConfigChange({
                    ...props.session.imageConfig,
                    aspectRatio: value,
                  })
                }
              >
                {imageCaps.aspectRatios.map((ratio) => (
                  <SelectItem key={ratio} value={ratio}>
                    {ratio}
                  </SelectItem>
                ))}
              </SettingPill>
              <SettingPill
                label={t('Quality')}
                value={props.session.imageConfig.quality}
                icon={<Sparkles className='size-3.5 text-violet-500' />}
                onValueChange={(value) =>
                  props.onImageConfigChange({
                    ...props.session.imageConfig,
                    quality: value,
                  })
                }
              >
                {imageCaps.qualities.map((quality) => (
                  <SelectItem key={quality} value={quality}>
                    {quality}
                  </SelectItem>
                ))}
              </SettingPill>
            </div>
          )}

          {model.model_type === 'video' && (
            <div className='mt-2 flex flex-wrap gap-1.5'>
              <SettingPill
                label={t('Video count')}
                value={String(props.session.videoConfig.n)}
                icon={<Images className='size-3.5 text-amber-500' />}
                onValueChange={(value) =>
                  props.onVideoConfigChange({
                    ...props.session.videoConfig,
                    n: Number(value),
                  })
                }
              >
                {videoCaps.counts.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count}
                  </SelectItem>
                ))}
              </SettingPill>
              <SettingPill
                label={t('Aspect ratio')}
                value={props.session.videoConfig.aspectRatio}
                icon={<Ratio className='size-3.5' />}
                onValueChange={(value) =>
                  props.onVideoConfigChange({
                    ...props.session.videoConfig,
                    aspectRatio: value,
                  })
                }
              >
                {videoCaps.aspectRatios.map((ratio) => (
                  <SelectItem key={ratio} value={ratio}>
                    {ratio}
                  </SelectItem>
                ))}
              </SettingPill>
              <SettingPill
                label={t('Quality')}
                value={props.session.videoConfig.quality}
                icon={<Sparkles className='size-3.5 text-violet-500' />}
                onValueChange={(value) =>
                  props.onVideoConfigChange({
                    ...props.session.videoConfig,
                    quality: value,
                  })
                }
              >
                {videoCaps.qualities.map((quality) => (
                  <SelectItem key={quality} value={quality}>
                    {quality}
                  </SelectItem>
                ))}
              </SettingPill>
              <SettingPill
                label={t('Seconds')}
                value={String(props.session.videoConfig.seconds)}
                icon={<Timer className='size-3.5' />}
                onValueChange={(value) =>
                  props.onVideoConfigChange({
                    ...props.session.videoConfig,
                    seconds: Number(value),
                  })
                }
              >
                {videoSecondOptions.map((second) => (
                  <SelectItem key={second} value={String(second)}>
                    {second}s
                  </SelectItem>
                ))}
              </SettingPill>
            </div>
          )}
        </div>
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
    </div>
  )
}
