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
  Images,
  Loader2,
  Maximize2,
  Paperclip,
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
import { sendChatCompletion } from '@/features/playground/api'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import {
  ATTACHMENT_EXTRACT_FAILED,
  extractAttachmentText,
  isTextExtractableAttachment,
} from '../lib/attachment-text-extract'
import { displayTypeFromExt } from '../lib/attachments'
import {
  durationValues,
  nValues,
  resolveGenerationCapabilities,
} from '../lib/capabilities'
import { generationOptionLabelKey } from '../lib/generation-option-labels'
import {
  classifyPromptEnhanceAttachments,
  DEFAULT_PROMPT_ENHANCE_MAX_TOKENS,
  isDocumentAttachmentKind,
  PROMPT_ENHANCE_EXTRACT_MAX_CHARS,
  promptEnhanceSystemPrompt,
  promptEnhanceUserContent,
  type PromptEnhanceAttachment,
} from '../lib/prompt-enhance'
import type {
  ImageGenerationConfig,
  LocalAttachment,
  LocalAttachmentKind,
  ModelUsageAttachment,
  ModelUsageItem,
  ModelUsageMessage,
  ModelUsagePromptEnhance,
  ModelUsageSession,
  VideoGenerationConfig,
} from '../types'
import { ModelUsageAttachmentIcon } from './model-usage-attachment-icon'
import { ModelUsageAttachmentTooltip } from './model-usage-attachment-tooltip'
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
  promptEnhance?: ModelUsagePromptEnhance
  onSend: (
    text: string,
    attachments?: ModelUsageAttachment[],
    quoteTurnIds?: string[],
    localAttachments?: LocalAttachment[]
  ) => Promise<void>
  onDeleteTurn: (turnId: string) => void
  onRegenerate: (message: ModelUsageMessage) => Promise<void>
  onEditUserMessage: (message: ModelUsageMessage, text: string) => Promise<void>
  onImageConfigChange: (config: ImageGenerationConfig) => void
  onVideoConfigChange: (config: VideoGenerationConfig) => void
}

/** 输入框上方展示的引用芯片 */
type QuoteChip = {
  turnId: string
  messageId: string
  preview: string
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
  const [quotes, setQuotes] = useState<QuoteChip[]>([])
  const [enhancing, setEnhancing] = useState(false)
  const [preview, setPreview] = useState<{
    items: ModelUsagePreviewItem[]
    index: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  const model = props.model
  const quotedMessageIds = useMemo(
    () => new Set(quotes.map((item) => item.messageId)),
    [quotes]
  )

  // 切换模型时清空引用，避免带到另一会话
  useEffect(() => {
    setQuotes([])
  }, [model?.model_name])

  // 被删除的轮次同步从引用芯片中移除
  useEffect(() => {
    const alive = new Set(props.session.messages.map((item) => item.id))
    setQuotes((current) => {
      const next = current.filter((item) => alive.has(item.messageId))
      return next.length === current.length ? current : next
    })
  }, [props.session.messages])
  const promptEnhance = props.promptEnhance
  const enhanceEnabled = Boolean(promptEnhance?.enabled)
  const enhanceModel = promptEnhance?.model?.trim() ?? ''
  const enhanceMaxTokens =
    promptEnhance?.max_tokens && promptEnhance.max_tokens > 0
      ? promptEnhance.max_tokens
      : DEFAULT_PROMPT_ENHANCE_MAX_TOKENS
  const imageCaps = useMemo(
    () =>
      resolveGenerationCapabilities(model?.generation_capabilities, 'image'),
    [model?.generation_capabilities]
  )
  const videoCaps = useMemo(
    () =>
      resolveGenerationCapabilities(model?.generation_capabilities, 'video'),
    [model?.generation_capabilities]
  )
  const imageCountOptions = useMemo(() => nValues(imageCaps.n), [imageCaps.n])
  const videoCountOptions = useMemo(() => nValues(videoCaps.n), [videoCaps.n])
  const videoSecondOptions = useMemo(
    () => durationValues(videoCaps.duration_sec),
    [videoCaps.duration_sec]
  )

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

  const hasAttachments = attachments.length > 0
  // 仅当前模型发送中时禁用输入，其他模型进行中的请求互不影响
  const busy = props.session.sending
  const hasPromptText = Boolean(prompt.trim())
  // 无内容时仍保持高亮外观，点击由 handler 直接 return
  const composerLocked = busy || enhancing
  const promptPlaceholder =
    model.model_type === 'image'
      ? t(
          'Recommended prompt structure: subject + scene + style + lighting + atmosphere. High resolution may take longer.'
        )
      : t('Enter your question or generation prompt')

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || (files instanceof FileList && files.length === 0)) return
    const list = [...files]
    if (list.length === 0) return

    const maxAttachments = 5
    const remaining = maxAttachments - attachments.length
    if (remaining <= 0) {
      toast.info(
        t('You can upload up to {{count}} attachments', {
          count: maxAttachments,
        })
      )
      return
    }
    const accepted = list.slice(0, remaining)
    if (accepted.length < list.length) {
      toast.info(
        t('You can upload up to {{count}} attachments', {
          count: maxAttachments,
        })
      )
    }
    const next: LocalAttachment[] = []
    for (const file of accepted) {
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
    setAttachments((current) => [...current, ...next].slice(0, maxAttachments))
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
      (
        item
      ): item is LocalAttachment & {
        kind: 'image' | 'video'
        previewUrl: string
      } =>
        (item.kind === 'image' || item.kind === 'video') &&
        Boolean(item.previewUrl)
    )
    const items: ModelUsagePreviewItem[] = media.map((item) => ({
      url: item.previewUrl,
      kind: item.kind,
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
    for (const item of items) {
      if (item.kind !== 'file') continue
      const file = item.getAsFile()
      if (file) files.push(file)
    }
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
  }

  const handleEnhancePrompt = async () => {
    const text = prompt.trim()
    if (!text || enhancing || busy) return
    if (!props.isAuthenticated) {
      props.onRequireLogin()
      return
    }
    if (!enhanceModel) {
      toast.error(t('Prompt enhance model is not configured'))
      return
    }
    if (!model) return
    const enhanceAttachments: PromptEnhanceAttachment[] = attachments.map(
      (item) => ({
        name: item.name,
        kind:
          item.kind === 'image' || item.kind === 'video'
            ? item.kind
            : displayTypeFromExt(item.ext),
      })
    )
    const mode = classifyPromptEnhanceAttachments(enhanceAttachments)
    setEnhancing(true)
    try {
      // 文档类：能抽取则先读正文再扩写；抽不出的只带文件名
      const extractedTexts: string[] = []
      if (mode === 'document' || mode === 'mixed') {
        for (let i = 0; i < attachments.length; i += 1) {
          const local = attachments[i]
          const meta = enhanceAttachments[i]
          if (!meta || !isDocumentAttachmentKind(meta.kind)) continue
          const extractKind =
            meta.kind === 'sheet' || meta.kind === 'doc' ? meta.kind : 'file'
          if (
            !isTextExtractableAttachment({
              kind: extractKind,
              name: local.name,
            })
          ) {
            continue
          }
          try {
            const result = await extractAttachmentText(
              { kind: extractKind, name: local.name },
              local.file
            )
            const capped =
              result.text.length > PROMPT_ENHANCE_EXTRACT_MAX_CHARS
                ? result.text.slice(0, PROMPT_ENHANCE_EXTRACT_MAX_CHARS)
                : result.text
            if (capped.trim()) extractedTexts.push(capped.trim())
          } catch (error) {
            if (
              !(
                error instanceof Error &&
                error.message === ATTACHMENT_EXTRACT_FAILED
              )
            ) {
              throw error
            }
          }
        }
      }

      const response = await sendChatCompletion({
        model: enhanceModel,
        messages: [
          {
            role: 'system',
            content: promptEnhanceSystemPrompt(model.model_type, { mode }),
          },
          {
            role: 'user',
            content: promptEnhanceUserContent(text, {
              attachments: enhanceAttachments,
              extractedTexts,
            }),
          },
        ],
        stream: false,
        max_tokens: enhanceMaxTokens,
        temperature: 0.7,
      })
      const raw = response.choices?.[0]?.message?.content
      let enhanced = ''
      if (typeof raw === 'string') {
        enhanced = raw.trim()
      } else if (raw != null) {
        enhanced = String(raw).trim()
      }
      if (!enhanced) {
        toast.error(t('Prompt enhance returned empty content'))
        return
      }
      // 最终只写入优化后的提示词，不再拼接附件用途清单
      setPrompt(enhanced)
      toast.success(t('Prompt optimized'))
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === ATTACHMENT_EXTRACT_FAILED
      ) {
        toast.error(t('Failed to extract attachment text'))
      } else {
        handleServerError(error, t('Failed to optimize prompt'))
      }
    } finally {
      setEnhancing(false)
    }
  }

  const toggleQuote = (message: ModelUsageMessage) => {
    setQuotes((current) => {
      if (current.some((item) => item.messageId === message.id)) {
        return current.filter((item) => item.messageId !== message.id)
      }
      // 同一轮只保留一条芯片，改为当前点选的气泡预览
      const withoutTurn = current.filter(
        (item) => item.turnId !== message.turnId
      )
      const previewText = message.content.trim().replaceAll(/\s+/g, ' ')
      return [
        ...withoutTurn,
        {
          turnId: message.turnId,
          messageId: message.id,
          preview:
            previewText.length > 48
              ? `${previewText.slice(0, 48)}…`
              : previewText,
        },
      ]
    })
  }

  const handleSubmit = () => {
    const text = prompt.trim()
    if ((!text && !hasAttachments) || busy) return
    if (!props.isAuthenticated) {
      props.onRequireLogin()
      return
    }
    const pending = [...attachments]
    const quoteTurnIds = quotes.map((item) => item.turnId)
    // 立刻清空输入区；附件预览交给会话气泡占位，上传在 onSend 内完成
    setPrompt('')
    setAttachments([])
    setQuotes([])
    void props
      .onSend(
        text,
        undefined,
        quoteTurnIds.length > 0 ? quoteTurnIds : undefined,
        pending.length > 0 ? pending : undefined
      )
      .catch((error) => {
        handleServerError(error, t('Failed to upload attachment'))
      })
  }

  let emptyHint = t('Generated videos will appear here')
  if (model.model_type === 'chat') {
    emptyHint = t('Ask anything about this model')
  } else if (model.model_type === 'image') {
    emptyHint = t('Generated images will appear here')
  }

  return (
    <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
      <div
        ref={listRef}
        className='flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4'
      >
        <ModelUsageMessageList
          messages={props.session.messages}
          emptyHint={emptyHint}
          model={model}
          busy={busy}
          quotedMessageIds={quotedMessageIds}
          onQuote={toggleQuote}
          onDelete={props.onDeleteTurn}
          onRegenerate={(message) => void props.onRegenerate(message)}
          onEditUserMessage={(message, text) =>
            props.onEditUserMessage(message, text)
          }
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
              accept='image/*,.pdf,.ppt,.pptx,.xls,.xlsx,.csv,.doc,.docx,.txt,.md'
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <div className='flex shrink-0 flex-col items-center gap-1.5 self-end'>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type='button'
                        onClick={() => fileInputRef.current?.click()}
                        aria-label={t('Upload image or file attachment')}
                        className={cn(
                          'bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground',
                          'inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-dashed transition-colors',
                          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
                        )}
                      />
                    }
                  >
                    <Paperclip className='size-4' aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('Upload image or file attachment')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {enhanceEnabled && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type='button'
                          size='icon'
                          variant='outline'
                          className='border-border size-9 rounded-md bg-white text-blue-600 hover:bg-white hover:text-blue-600 dark:bg-white dark:hover:bg-white'
                          disabled={composerLocked}
                          aria-disabled={composerLocked || !hasPromptText}
                          onClick={() => {
                            if (!hasPromptText || composerLocked) return
                            void handleEnhancePrompt()
                          }}
                          aria-label={t('AI help write prompt')}
                        />
                      }
                    >
                      {enhancing ? (
                        <Loader2
                          className='size-4 animate-spin text-blue-600'
                          aria-hidden
                        />
                      ) : (
                        <span
                          className='text-[11px] leading-none font-semibold tracking-wide text-blue-600'
                          aria-hidden
                        >
                          AI
                        </span>
                      )}
                    </TooltipTrigger>
                    <TooltipContent>{t('AI help write prompt')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className='flex min-w-0 flex-1 flex-col gap-2'>
              {quotes.length > 0 && (
                <div className='flex flex-wrap gap-1.5'>
                  {quotes.map((quote) => (
                    <div
                      key={quote.messageId}
                      className='bg-background text-muted-foreground inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs'
                    >
                      <span className='font-serif' aria-hidden>
                        "
                      </span>
                      <span className='min-w-0 truncate'>{quote.preview}</span>
                      <button
                        type='button'
                        className='hover:text-foreground shrink-0 rounded p-0.5'
                        aria-label={t('Remove quote')}
                        onClick={() =>
                          setQuotes((current) =>
                            current.filter(
                              (item) => item.messageId !== quote.messageId
                            )
                          )
                        }
                      >
                        <X className='size-3' />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {hasAttachments && (
                <div className='flex flex-wrap gap-2'>
                  {attachments.map((file) => {
                    const displayType =
                      file.kind === 'image' || file.kind === 'video'
                        ? file.kind
                        : displayTypeFromExt(file.ext)
                    let attachmentPreview = (
                      <ModelUsageAttachmentIcon type={displayType} />
                    )
                    if (file.kind === 'image' && file.previewUrl) {
                      attachmentPreview = (
                        <button
                          type='button'
                          className='size-full'
                          onClick={() => openAttachmentPreview(file)}
                          aria-label={t('Image Preview')}
                        >
                          <img
                            src={file.previewUrl}
                            alt=''
                            className='size-full object-cover'
                          />
                        </button>
                      )
                    } else if (file.kind === 'video' && file.previewUrl) {
                      attachmentPreview = (
                        <button
                          type='button'
                          className='bg-muted size-full'
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
                      )
                    }
                    return (
                      <ModelUsageAttachmentTooltip
                        key={file.id}
                        name={file.name}
                        type={displayType}
                      >
                        <div className='bg-background relative size-14 overflow-hidden rounded-lg border'>
                          {attachmentPreview}
                          <button
                            type='button'
                            className='bg-background/90 text-muted-foreground hover:text-foreground absolute top-0.5 right-0.5 rounded-full p-0.5 shadow-sm'
                            onClick={() => removeAttachment(file.id)}
                            aria-label={t('Remove attachment')}
                          >
                            <X className='size-3' />
                          </button>
                        </div>
                      </ModelUsageAttachmentTooltip>
                    )
                  })}
                </div>
              )}

              <div className='flex items-end gap-2'>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onPaste={handlePaste}
                  placeholder={promptPlaceholder}
                  rows={2}
                  className='min-h-[64px] w-full min-w-0 flex-1 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0'
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
                  variant='default'
                  className='size-9 shrink-0 rounded-md'
                  disabled={composerLocked}
                  aria-disabled={
                    composerLocked || (!hasPromptText && !hasAttachments)
                  }
                  onClick={() => {
                    if (composerLocked || (!hasPromptText && !hasAttachments)) {
                      return
                    }
                    void handleSubmit()
                  }}
                  title={t('Send')}
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

          {/* 模型类型为图片即展示（含 chat 协议生图，如 Gemini image） */}
          {model.model_type === 'image' && (
            <div className='mt-2 flex flex-wrap gap-1.5'>
              {imageCountOptions.length > 0 && (
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
                  {imageCountOptions.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
              {imageCaps.aspect_ratio.length > 0 && (
                <SettingPill
                  label={t('Aspect ratio')}
                  value={props.session.imageConfig.aspect_ratio}
                  icon={<Ratio className='size-3.5' />}
                  onValueChange={(value) =>
                    props.onImageConfigChange({
                      ...props.session.imageConfig,
                      aspect_ratio: value,
                    })
                  }
                >
                  {imageCaps.aspect_ratio.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ratio}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
              {imageCaps.quality.length > 0 && (
                <SettingPill
                  label={t('Quality')}
                  value={props.session.imageConfig.quality ?? ''}
                  icon={<Sparkles className='size-3.5 text-violet-500' />}
                  onValueChange={(value) =>
                    props.onImageConfigChange({
                      ...props.session.imageConfig,
                      quality: value,
                    })
                  }
                >
                  {imageCaps.quality.map((quality) => (
                    <SelectItem key={quality} value={quality}>
                      {t(generationOptionLabelKey(quality))}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
              {imageCaps.resolution.length > 0 && (
                <SettingPill
                  label={t('Resolution')}
                  value={props.session.imageConfig.resolution ?? ''}
                  icon={<Maximize2 className='size-3.5 text-sky-500' />}
                  onValueChange={(value) =>
                    props.onImageConfigChange({
                      ...props.session.imageConfig,
                      resolution: value,
                    })
                  }
                >
                  {imageCaps.resolution.map((resolution) => (
                    <SelectItem key={resolution} value={resolution}>
                      {t(generationOptionLabelKey(resolution))}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
            </div>
          )}

          {model.model_type === 'video' && (
            <div className='mt-2 flex flex-wrap gap-1.5'>
              {videoCountOptions.length > 1 && (
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
                  {videoCountOptions.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
              {videoCaps.aspect_ratio.length > 0 && (
                <SettingPill
                  label={t('Aspect ratio')}
                  value={props.session.videoConfig.aspect_ratio}
                  icon={<Ratio className='size-3.5' />}
                  onValueChange={(value) =>
                    props.onVideoConfigChange({
                      ...props.session.videoConfig,
                      aspect_ratio: value,
                    })
                  }
                >
                  {videoCaps.aspect_ratio.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ratio}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
              {videoCaps.resolution.length > 0 && (
                <SettingPill
                  label={t('Resolution')}
                  value={props.session.videoConfig.resolution ?? ''}
                  icon={<Maximize2 className='size-3.5 text-sky-500' />}
                  onValueChange={(value) =>
                    props.onVideoConfigChange({
                      ...props.session.videoConfig,
                      resolution: value,
                    })
                  }
                >
                  {videoCaps.resolution.map((resolution) => (
                    <SelectItem key={resolution} value={resolution}>
                      {t(generationOptionLabelKey(resolution))}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
              {videoSecondOptions.length > 0 && (
                <SettingPill
                  label={t('Seconds')}
                  value={String(props.session.videoConfig.duration_sec ?? '')}
                  icon={<Timer className='size-3.5' />}
                  onValueChange={(value) =>
                    props.onVideoConfigChange({
                      ...props.session.videoConfig,
                      duration_sec: Number(value),
                    })
                  }
                >
                  {videoSecondOptions.map((second) => (
                    <SelectItem key={second} value={String(second)}>
                      {second === -1 ? t('Auto') : `${second}s`}
                    </SelectItem>
                  ))}
                </SettingPill>
              )}
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
          setPreview((current) => (current ? { ...current, index } : current))
        }
      />
    </div>
  )
}
