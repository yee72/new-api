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
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { sendChatCompletion } from '@/features/playground/api'
import {
  handleServerError,
  markServerErrorHandled,
} from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  commitModelUsageTurn,
  fetchModelUsageSession,
  generateImages,
  generateVideo,
  refreshModelUsageVideoTurn,
  replaceModelUsageSession,
  sendAnthropicMessages,
} from '../api'
import { ATTACHMENT_EXTRACT_FAILED } from '../lib/attachment-text-extract'
import {
  resolveGenerationCapabilities,
  validateImageConfig,
  validateVideoConfig,
} from '../lib/capabilities'
import {
  buildChatUserContent,
  usableChatAttachments,
} from '../lib/chat-attachments'
import { resolveChatFailurePresentation } from '../lib/chat-failure'
import { selectChatHistoryMessages } from '../lib/chat-history'
import {
  textFromAnthropicResponse,
  toAnthropicMessages,
  type AnthropicMessagesResponse,
} from '../lib/claude-messages'
import {
  mapToImagesGenerations,
  mapToVideosCreate,
} from '../lib/generation-mapper'
import {
  generationFormToRecord,
  hydrateGenerationForm,
} from '../lib/generation-request'
import {
  extractImagesFromChatMessage,
  resolveInvokeProtocol,
} from '../lib/invoke-protocol'
import { clearModelUsageMediaCache } from '../lib/media-cache'
import {
  createEmptySession,
  markUnresumedMessages,
  mergeSessionConfigs,
  useModelUsageSessionsStore,
} from '../stores/sessions-store'
import type {
  GenerationFormConfig,
  ModelUsageAttachment,
  ModelUsageItem,
  ModelUsageMessage,
  ModelUsageSession,
} from '../types'

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extractImageUrls(data: unknown): string[] {
  const payload = data as {
    data?: Array<{ url?: string; b64_json?: string }>
  }
  return (
    payload.data
      ?.map((item) => {
        if (item.url) return item.url
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
        return ''
      })
      .filter(Boolean) ?? []
  )
}

function mediaTypeOf(model: ModelUsageItem): ModelUsageMessage['mediaType'] {
  if (model.model_type === 'image') return 'image'
  if (model.model_type === 'video') return 'video'
  return 'text'
}

function applyServerSession(
  modelName: string,
  dto: Awaited<ReturnType<typeof fetchModelUsageSession>>,
  model?: ModelUsageItem
) {
  const configs = mergeSessionConfigs(model, dto.image_config, dto.video_config)
  useModelUsageSessionsStore.getState().hydrateSession(
    modelName,
    {
      messages: dto.messages ?? [],
      sending: false,
      ...configs,
    },
    model
  )
}

async function pollVideoUntilSettled(modelName: string, turnId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const dto = await refreshModelUsageVideoTurn(modelName, turnId)
    applyServerSession(modelName, dto)
    const assistant = dto.messages.find(
      (message) =>
        message.turnId === turnId &&
        message.role === 'assistant' &&
        message.mediaType === 'video'
    )
    if (
      !assistant ||
      assistant.status === 'done' ||
      assistant.status === 'error'
    ) {
      return
    }
  }
}

export function useModelSessions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.auth.user?.id ?? null)
  const previousUserIdRef = useRef(userId)
  const sessions = useModelUsageSessionsStore((state) => state.sessions)

  useEffect(() => {
    const previous = previousUserIdRef.current
    previousUserIdRef.current = userId
    if (previous === userId) return
    // 切换账号时丢掉内存中的媒体 blob，避免串号；磁盘按 userId 隔离
    queryClient.removeQueries({ queryKey: ['model-usage-media'] })
    if (previous != null && previous > 0 && userId == null) {
      void clearModelUsageMediaCache(previous)
    }
  }, [userId, queryClient])
  const lastModelName = useModelUsageSessionsStore(
    (state) => state.lastModelName
  )
  const setLastModelName = useModelUsageSessionsStore(
    (state) => state.setLastModelName
  )
  const setOwnerUserId = useModelUsageSessionsStore(
    (state) => state.setOwnerUserId
  )
  const ensureSession = useModelUsageSessionsStore(
    (state) => state.ensureSession
  )
  const hydrateSession = useModelUsageSessionsStore(
    (state) => state.hydrateSession
  )
  const patchSession = useModelUsageSessionsStore((state) => state.patchSession)
  const setImageConfig = useModelUsageSessionsStore(
    (state) => state.setImageConfig
  )
  const setVideoConfig = useModelUsageSessionsStore(
    (state) => state.setVideoConfig
  )
  const deleteTurnLocal = useModelUsageSessionsStore(
    (state) => state.deleteTurn
  )

  const getSession = useCallback(
    (model?: ModelUsageItem) => {
      if (!model) return createEmptySession()
      return sessions[model.model_name] ?? createEmptySession(model)
    },
    [sessions]
  )

  const loadServerSession = useCallback(
    async (model: ModelUsageItem) => {
      setOwnerUserId(userId)
      if (!userId) {
        ensureSession(model)
        return
      }
      const modelName = model.model_name
      const capturedRevision =
        useModelUsageSessionsStore.getState().revisions[modelName] ?? 0
      try {
        const dto = await fetchModelUsageSession(modelName)
        const messages = markUnresumedMessages(
          dto.messages ?? [],
          t('Generation failed')
        )
        const accepted = useModelUsageSessionsStore
          .getState()
          .acceptLoadedSession(
            modelName,
            {
              messages,
              sending: false,
              ...mergeSessionConfigs(model, dto.image_config, dto.video_config),
            },
            capturedRevision,
            model
          )
        // 本地仍在等上游，或快照已经过期：保留当前对话
        if (!accepted) return
        // 续拉未完成视频
        for (const message of messages) {
          if (
            message.role === 'assistant' &&
            message.mediaType === 'video' &&
            message.status === 'pending'
          ) {
            void pollVideoUntilSettled(model.model_name, message.turnId).catch(
              () => undefined
            )
          }
        }
      } catch (error) {
        ensureSession(model)
        handleServerError(error, t('Failed to load conversation'))
      }
    },
    [ensureSession, setOwnerUserId, t, userId]
  )

  const runGeneration = useCallback(
    async (
      model: ModelUsageItem,
      prompt: string,
      options?: {
        turnId?: string
        imageConfig?: GenerationFormConfig
        videoConfig?: GenerationFormConfig
        attachments?: ModelUsageAttachment[]
        /** 有值时只把这些轮次拼进上游历史（引用模式） */
        quoteTurnIds?: string[]
      }
    ) => {
      const modelName = model.model_name
      const store = useModelUsageSessionsStore.getState()
      const latest = store.sessions[modelName] ?? createEmptySession(model)
      if (latest.sending) return

      const imageConfig = options?.imageConfig ?? latest.imageConfig
      const videoConfig = options?.videoConfig ?? latest.videoConfig
      const turnId = options?.turnId ?? newId('turn')
      const isRegenerate = Boolean(options?.turnId)
      const mediaType = mediaTypeOf(model)

      const invokeProtocolEarly = resolveInvokeProtocol(model)
      // 模型类型为图片即按能力矩阵校验（含 chat 协议生图）
      if (model.model_type === 'image') {
        const errorKey = validateImageConfig(
          imageConfig,
          model.generation_capabilities
        )
        if (errorKey) {
          toast.error(t(errorKey))
          return
        }
      }
      if (model.model_type === 'video') {
        const errorKey = validateVideoConfig(
          videoConfig,
          model.generation_capabilities
        )
        if (errorKey) {
          toast.error(t(errorKey))
          return
        }
      }

      const attachments =
        options?.attachments && options.attachments.length > 0
          ? options.attachments
          : undefined
      const userMessage: ModelUsageMessage = {
        id: newId('u'),
        turnId,
        role: 'user',
        content: prompt,
        status: 'done',
        mediaType,
        prompt,
        attachments,
        imageConfig: model.model_type === 'image' ? imageConfig : undefined,
        videoConfig: model.model_type === 'video' ? videoConfig : undefined,
      }
      const assistantId = newId('a')
      const pendingAssistant: ModelUsageMessage = {
        id: assistantId,
        turnId,
        role: 'assistant',
        content:
          model.model_type === 'chat'
            ? t('Generating...')
            : t('Your work is being generated...'),
        status: 'pending',
        mediaType,
        prompt,
        imageConfig: model.model_type === 'image' ? imageConfig : undefined,
        videoConfig: model.model_type === 'video' ? videoConfig : undefined,
      }

      // 失败轮次用户附件不拼进历史；有引用时只带选中轮次，避免全量历史
      const quoteTurnIds = options?.quoteTurnIds?.filter(Boolean)
      const historyMessages = selectChatHistoryMessages(latest.messages, {
        excludeTurnId: isRegenerate ? turnId : undefined,
        includeTurnIds:
          quoteTurnIds && quoteTurnIds.length > 0 ? quoteTurnIds : undefined,
      })

      patchSession(
        modelName,
        (current) => {
          let messages = current.messages
          if (isRegenerate) {
            messages = messages.filter((message) => message.turnId !== turnId)
          }
          return {
            ...current,
            sending: true,
            messages: [...messages, userMessage, pendingAssistant],
          }
        },
        model
      )

      const failAssistant = (content: string, errorDetail?: string) => {
        patchSession(
          modelName,
          (current) => ({
            ...current,
            sending: false,
            messages: current.messages.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    status: 'error',
                    content,
                    errorDetail: errorDetail?.trim() || undefined,
                  }
                : message
            ),
          }),
          model
        )
      }

      // 上游返回前先落库，切换窗口或重新进入页面时仍能看到刚提交的对话
      const savePendingTurn = async () => {
        if (!userId) return
        const snapshot = useModelUsageSessionsStore
          .getState()
          .getSessionSnapshot(modelName, model)
        try {
          await replaceModelUsageSession(modelName, {
            model_name: modelName,
            messages: snapshot.messages,
            image_config: generationFormToRecord(snapshot.imageConfig),
            video_config: generationFormToRecord(snapshot.videoConfig),
          })
        } catch (error) {
          handleServerError(error, t('Failed to save conversation'))
        }
      }

      const invokeProtocol = invokeProtocolEarly

      try {
        if (invokeProtocol === 'chat' || invokeProtocol === 'messages') {
          // chat 协议生图：按配置张数多次请求；比例/质量写入当次调用提示（不改用户气泡原文）
          const chatImage = model.model_type === 'image'
          const requestCount = chatImage ? Math.max(1, imageConfig.n || 1) : 1
          const requestPrompt = chatImage
            ? `${prompt}\n\n[image settings: aspect_ratio=${imageConfig.aspect_ratio}, quality=${imageConfig.quality}, resolution=${imageConfig.resolution ?? 'auto'}]`
            : prompt
          const useAnthropicMessages = invokeProtocol === 'messages'

          // 附件随 chat 多模态 content 发给上游（短链需转 data URL）
          if (
            attachments &&
            attachments.length > 0 &&
            usableChatAttachments(attachments).length !== attachments.length
          ) {
            failAssistant(t('Attachment expired'))
            toast.error(t('Attachment expired'))
            return
          }
          let chatHistory: {
            role: 'user' | 'assistant'
            content: Awaited<ReturnType<typeof buildChatUserContent>>
          }[]
          let userContent: Awaited<ReturnType<typeof buildChatUserContent>>
          try {
            chatHistory = await Promise.all(
              historyMessages.map(async (message) => ({
                role: message.role,
                content: await buildChatUserContent(
                  message.content,
                  message.role === 'user' ? message.attachments : undefined,
                  { userId }
                ),
              }))
            )
            userContent = await buildChatUserContent(
              requestPrompt,
              attachments,
              { userId }
            )
          } catch (error) {
            const extractFailed =
              error instanceof Error &&
              error.message === ATTACHMENT_EXTRACT_FAILED
            const message = extractFailed
              ? t('Failed to extract attachment text')
              : t('Failed to load attachment')
            failAssistant(message)
            toast.error(message)
            return
          }

          await savePendingTurn()

          const chatImages: string[] = []
          let contentText = ''
          const openAIMessages = [
            ...chatHistory,
            { role: 'user' as const, content: userContent },
          ]
          for (let i = 0; i < requestCount; i += 1) {
            let messageImages:
              | Array<{ type?: string; image_url?: { url?: string } }>
              | undefined
            if (useAnthropicMessages) {
              const response = (await sendAnthropicMessages({
                model: modelName,
                max_tokens: 4096,
                messages: toAnthropicMessages(openAIMessages),
                stream: false,
              })) as AnthropicMessagesResponse
              contentText = textFromAnthropicResponse(response)
            } else {
              const response = await sendChatCompletion({
                model: modelName,
                messages: openAIMessages,
                stream: false,
              })
              const assistantMessage = response.choices?.[0]?.message
              const rawContent = assistantMessage?.content
              if (typeof rawContent === 'string') {
                contentText = rawContent
              } else if (rawContent == null) {
                contentText = ''
              } else {
                contentText = String(rawContent)
              }
              messageImages = assistantMessage?.images
            }
            if (chatImage) {
              for (const src of extractImagesFromChatMessage({
                content: contentText,
                images: messageImages,
              })) {
                if (!chatImages.includes(src)) chatImages.push(src)
              }
            }
          }

          // 网关已把 data: 换成短链；本地不再保留大段 base64 文本
          const displayContent =
            chatImage && chatImages.length > 0 ? '' : contentText

          if (chatImage) {
            if (!userId) {
              failAssistant(t('Please sign in to save generated works'))
              return
            }
            if (chatImages.length === 0) {
              failAssistant(contentText.trim() || t('Generation failed'))
              return
            }
            // 优先提交短链/URL；若仍有 data: 则由后端落库
            const dto = await commitModelUsageTurn(modelName, {
              user_message: userMessage,
              assistant_message: {
                ...pendingAssistant,
                content: '',
                status: 'done',
              },
              image_sources: chatImages,
              image_config: generationFormToRecord(imageConfig),
            })
            applyServerSession(modelName, dto, model)
            toast.success(t('Generation completed'))
            return
          }

          const assistantMessage: ModelUsageMessage = {
            ...pendingAssistant,
            status: 'done',
            content: displayContent || t('Empty response from model'),
          }
          if (userId) {
            const dto = await commitModelUsageTurn(modelName, {
              user_message: userMessage,
              assistant_message: assistantMessage,
            })
            applyServerSession(modelName, dto, model)
          } else {
            patchSession(
              modelName,
              (current) => ({
                ...current,
                sending: false,
                messages: current.messages.map((message) =>
                  message.id === assistantId ? assistantMessage : message
                ),
              }),
              model
            )
          }
          return
        }

        if (invokeProtocol === 'images') {
          const imageCaps = resolveGenerationCapabilities(
            model.generation_capabilities,
            'image'
          )
          await savePendingTurn()
          const data = await generateImages(
            mapToImagesGenerations(
              {
                ...imageConfig,
                mode: 'image_generate',
                model: modelName,
                prompt,
              },
              imageCaps
            )
          )
          const sources = extractImageUrls(data)
          if (!userId) {
            failAssistant(t('Please sign in to save generated works'))
            return
          }
          const dto = await commitModelUsageTurn(modelName, {
            user_message: userMessage,
            assistant_message: {
              ...pendingAssistant,
              content: '',
              status: 'done',
            },
            image_sources: sources,
            image_config: generationFormToRecord(imageConfig),
          })
          applyServerSession(modelName, dto, model)
          toast.success(t('Generation completed'))
          return
        }

        const videoCaps = resolveGenerationCapabilities(
          model.generation_capabilities,
          'video'
        )
        const videoPayload = mapToVideosCreate(
          {
            ...videoConfig,
            mode: 'video_generate',
            n: 1,
            model: modelName,
            prompt,
          },
          videoCaps
        )
        // 视频强制单任务；n 预留能力表但 MVP mapper 固定 1
        await savePendingTurn()
        const result = (await generateVideo(videoPayload)) as { id?: string }
        const taskIds = result?.id ? [result.id] : []
        if (!userId) {
          failAssistant(t('Please sign in to save generated works'))
          return
        }
        if (taskIds.length === 0) {
          failAssistant(t('Generation failed'))
          return
        }
        const dto = await commitModelUsageTurn(modelName, {
          user_message: userMessage,
          assistant_message: {
            ...pendingAssistant,
            content: t('Your work is being generated...'),
            status: 'pending',
          },
          video_task_ids: taskIds,
          video_config: generationFormToRecord(videoConfig),
        })
        applyServerSession(modelName, dto, model)
        toast.success(t('Generation completed'))
        void pollVideoUntilSettled(modelName, turnId).catch((error) => {
          handleServerError(error, t('Generation failed'))
        })
      } catch (error) {
        const isTextChat =
          (invokeProtocol === 'chat' || invokeProtocol === 'messages') &&
          model.model_type === 'chat'
        if (isTextChat) {
          // 对话失败在气泡内展示原因，避免再弹一层 toast
          markServerErrorHandled(error)
          const presentation = resolveChatFailurePresentation(error, t)
          failAssistant(presentation.title, presentation.detail)
          return
        }
        const fallback = t('Generation failed')
        handleServerError(error, fallback)
        failAssistant(fallback)
      }
    },
    [patchSession, t, userId]
  )

  const send = useCallback(
    async (
      model: ModelUsageItem,
      prompt: string,
      attachments?: ModelUsageAttachment[],
      quoteTurnIds?: string[]
    ) => {
      const text = prompt.trim()
      if (!text && (!attachments || attachments.length === 0)) return
      setLastModelName(model.model_name)
      await runGeneration(model, text || t('Attachment'), {
        attachments,
        quoteTurnIds,
      })
    },
    [runGeneration, setLastModelName, t]
  )

  const resendEdited = useCallback(
    async (model: ModelUsageItem, message: ModelUsageMessage, text: string) => {
      const prompt = text.trim()
      if (!prompt) return
      const defaults = createEmptySession(model)
      // 不传 turnId：作为最新一轮追加，原用户文本和模型输出都保留
      await runGeneration(model, prompt, {
        imageConfig: message.imageConfig
          ? hydrateGenerationForm(message.imageConfig, defaults.imageConfig)
          : undefined,
        videoConfig: message.videoConfig
          ? hydrateGenerationForm(message.videoConfig, defaults.videoConfig)
          : undefined,
      })
    },
    [runGeneration]
  )

  const regenerate = useCallback(
    async (model: ModelUsageItem, message: ModelUsageMessage) => {
      const prompt = message.prompt?.trim()
      if (!prompt) return
      const session =
        useModelUsageSessionsStore.getState().sessions[model.model_name]
      const userTurn = session?.messages.find(
        (item) => item.turnId === message.turnId && item.role === 'user'
      )
      const defaults = createEmptySession(model)
      await runGeneration(model, prompt, {
        turnId: message.turnId,
        imageConfig: message.imageConfig
          ? hydrateGenerationForm(message.imageConfig, defaults.imageConfig)
          : undefined,
        videoConfig: message.videoConfig
          ? hydrateGenerationForm(message.videoConfig, defaults.videoConfig)
          : undefined,
        attachments: userTurn?.attachments,
      })
    },
    [runGeneration]
  )

  const deleteTurn = useCallback(
    async (model: ModelUsageItem, turnId: string) => {
      deleteTurnLocal(model, turnId)
      if (!userId) return
      const session = useModelUsageSessionsStore
        .getState()
        .getSessionSnapshot(model.model_name, model)
      try {
        const dto = await replaceModelUsageSession(model.model_name, {
          model_name: model.model_name,
          messages: session.messages,
          image_config: generationFormToRecord(session.imageConfig),
          video_config: generationFormToRecord(session.videoConfig),
        })
        applyServerSession(model.model_name, dto, model)
      } catch (error) {
        handleServerError(error, t('Failed to save conversation'))
      }
    },
    [deleteTurnLocal, t, userId]
  )

  const isModelSending = useCallback(
    (modelName: string) => Boolean(sessions[modelName]?.sending),
    [sessions]
  )

  return {
    getSession,
    ensureSession,
    loadServerSession,
    hydrateSession,
    setImageConfig,
    setVideoConfig,
    send,
    deleteTurn,
    resendEdited,
    regenerate,
    isModelSending,
    lastModelName,
    setLastModelName,
  }
}

export type { ModelUsageSession }
