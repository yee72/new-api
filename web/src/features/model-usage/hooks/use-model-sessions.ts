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
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { sendChatCompletion } from '@/features/playground/api'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  commitModelUsageTurn,
  fetchModelUsageSession,
  generateImages,
  generateVideo,
  refreshModelUsageVideoTurn,
  replaceModelUsageSession,
} from '../api'
import {
  buildChatUserContent,
  usableChatAttachments,
} from '../lib/chat-attachments'
import {
  resolveGenerationCapabilities,
  validateImageConfig,
  validateVideoConfig,
} from '../lib/capabilities'
import {
  mapToImagesGenerations,
  mapToVideosCreate,
} from '../lib/generation-mapper'
import {
  generationFormToRecord,
  hydrateGenerationForm,
} from '../lib/generation-request'
import {
  extractImagesFromChatContent,
  resolveInvokeProtocol,
} from '../lib/invoke-protocol'
import {
  createEmptySession,
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
  const configs = mergeSessionConfigs(
    model,
    dto.image_config,
    dto.video_config
  )
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
    if (!assistant || assistant.status === 'done' || assistant.status === 'error') {
      return
    }
  }
}

export function useModelSessions() {
  const { t } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id ?? null)
  const sessions = useModelUsageSessionsStore((state) => state.sessions)
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
  const patchSession = useModelUsageSessionsStore(
    (state) => state.patchSession
  )
  const setImageConfig = useModelUsageSessionsStore(
    (state) => state.setImageConfig
  )
  const setVideoConfig = useModelUsageSessionsStore(
    (state) => state.setVideoConfig
  )
  const deleteTurnLocal = useModelUsageSessionsStore((state) => state.deleteTurn)

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
      try {
        const dto = await fetchModelUsageSession(model.model_name)
        applyServerSession(model.model_name, dto, model)
        // 续拉未完成视频
        for (const message of dto.messages) {
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

      const historyMessages = (
        isRegenerate
          ? latest.messages.filter((message) => message.turnId !== turnId)
          : latest.messages
      ).filter(
        (message) => message.status === 'done' && message.mediaType === 'text'
      )

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

      const failAssistant = (content: string) => {
        patchSession(
          modelName,
          (current) => ({
            ...current,
            sending: false,
            messages: current.messages.map((message) =>
              message.id === assistantId
                ? { ...message, status: 'error', content }
                : message
            ),
          }),
          model
        )
      }

      const invokeProtocol = invokeProtocolEarly

      try {
        if (invokeProtocol === 'chat') {
          // chat 协议生图：按配置张数多次请求；比例/质量写入当次调用提示（不改用户气泡原文）
          const chatImage =
            model.model_type === 'image'
          const requestCount = chatImage
            ? Math.max(1, imageConfig.n || 1)
            : 1
          const requestPrompt = chatImage
            ? `${prompt}\n\n[image settings: aspect_ratio=${imageConfig.aspect_ratio}, quality=${imageConfig.quality}, resolution=${imageConfig.resolution ?? 'auto'}]`
            : prompt

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
          let chatHistory: { role: 'user' | 'assistant'; content: Awaited<
            ReturnType<typeof buildChatUserContent>
          > }[]
          let userContent: Awaited<ReturnType<typeof buildChatUserContent>>
          try {
            chatHistory = await Promise.all(
              historyMessages.map(async (message) => ({
                role: message.role,
                content: await buildChatUserContent(
                  message.content,
                  message.role === 'user' ? message.attachments : undefined
                ),
              }))
            )
            userContent = await buildChatUserContent(
              requestPrompt,
              attachments
            )
          } catch {
            failAssistant(t('Failed to load attachment'))
            toast.error(t('Failed to load attachment'))
            return
          }

          const chatImages: string[] = []
          let contentText = ''
          for (let i = 0; i < requestCount; i += 1) {
            const response = await sendChatCompletion({
              model: modelName,
              messages: [
                ...chatHistory,
                { role: 'user' as const, content: userContent },
              ],
              stream: false,
            })
            const rawContent = response.choices?.[0]?.message?.content
            contentText =
              typeof rawContent === 'string'
                ? rawContent
                : rawContent == null
                  ? ''
                  : String(rawContent)
            if (chatImage) {
              for (const src of extractImagesFromChatContent(contentText)) {
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
              failAssistant(
                contentText.trim() || t('Generation failed')
              )
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
        const fallback =
          invokeProtocol === 'chat' && model.model_type === 'chat'
            ? t('Chat request failed')
            : t('Generation failed')
        handleServerError(error, fallback)
        if (invokeProtocol === 'chat' && model.model_type === 'chat') {
          toast.error(fallback)
        }
        failAssistant(fallback)
      }
    },
    [patchSession, t, userId]
  )

  const send = useCallback(
    async (
      model: ModelUsageItem,
      prompt: string,
      attachments?: ModelUsageAttachment[]
    ) => {
      const text = prompt.trim()
      if (!text && (!attachments || attachments.length === 0)) return
      setLastModelName(model.model_name)
      await runGeneration(model, text || t('Attachment'), { attachments })
    },
    [runGeneration, setLastModelName, t]
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
    regenerate,
    isModelSending,
    lastModelName,
    setLastModelName,
  }
}

export type { ModelUsageSession }
