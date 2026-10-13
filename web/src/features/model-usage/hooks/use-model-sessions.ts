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
  aspectRatioToSize,
  validateImageConfig,
  validateVideoConfig,
} from '../lib/capabilities'
import {
  extractImagesFromChatContent,
  resolveInvokeProtocol,
} from '../lib/invoke-protocol'
import {
  createEmptySession,
  useModelUsageSessionsStore,
} from '../stores/sessions-store'
import type {
  ImageGenerationConfig,
  ModelUsageItem,
  ModelUsageMessage,
  ModelUsageSession,
  VideoGenerationConfig,
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
  const defaults = createEmptySession(model)
  const savedImage = dto.image_config as Partial<ImageGenerationConfig> | undefined
  const savedVideo = dto.video_config as Partial<VideoGenerationConfig> | undefined
  useModelUsageSessionsStore.getState().hydrateSession(
    modelName,
    {
      messages: dto.messages ?? [],
      sending: false,
      imageConfig: {
        ...defaults.imageConfig,
        ...savedImage,
      },
      videoConfig: {
        ...defaults.videoConfig,
        ...savedVideo,
      },
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
        imageConfig?: ImageGenerationConfig
        videoConfig?: VideoGenerationConfig
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
      // Images API 才校验 size/quality；chat 协议生图只用提示词
      if (model.model_type === 'image' && invokeProtocolEarly === 'images') {
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

      const userMessage: ModelUsageMessage = {
        id: newId('u'),
        turnId,
        role: 'user',
        content: prompt,
        status: 'done',
        mediaType,
        prompt,
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

      const chatHistory = (
        isRegenerate
          ? latest.messages.filter((message) => message.turnId !== turnId)
          : latest.messages
      )
        .filter(
          (message) =>
            message.status === 'done' && message.mediaType === 'text'
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        }))

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
          const response = await sendChatCompletion({
            model: modelName,
            messages: [
              ...chatHistory,
              { role: 'user' as const, content: prompt },
            ],
            stream: false,
          })
          const rawContent = response.choices?.[0]?.message?.content
          const contentText =
            typeof rawContent === 'string'
              ? rawContent
              : rawContent == null
                ? ''
                : String(rawContent)
          const chatImages =
            model.model_type === 'image'
              ? extractImagesFromChatContent(contentText)
              : []
          // 网关已把 data: 换成短链；本地不再保留大段 base64 文本
          const displayContent =
            model.model_type === 'image' && chatImages.length > 0
              ? ''
              : contentText

          if (model.model_type === 'image') {
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
              image_config: imageConfig as unknown as Record<string, unknown>,
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
          const data = await generateImages({
            model: modelName,
            prompt,
            n: imageConfig.n,
            size: aspectRatioToSize(imageConfig.aspectRatio),
            quality:
              imageConfig.quality === 'auto'
                ? undefined
                : imageConfig.quality,
          })
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
            image_config: imageConfig as unknown as Record<string, unknown>,
          })
          applyServerSession(modelName, dto, model)
          toast.success(t('Generation completed'))
          return
        }

        const taskIds: string[] = []
        for (let i = 0; i < videoConfig.n; i += 1) {
          const result = (await generateVideo({
            model: modelName,
            prompt,
            seconds: videoConfig.seconds,
            size: aspectRatioToSize(videoConfig.aspectRatio),
          })) as { id?: string }
          if (result?.id) taskIds.push(result.id)
        }
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
          video_config: videoConfig as unknown as Record<string, unknown>,
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
    async (model: ModelUsageItem, prompt: string) => {
      const text = prompt.trim()
      if (!text) return
      setLastModelName(model.model_name)
      await runGeneration(model, text)
    },
    [runGeneration, setLastModelName]
  )

  const regenerate = useCallback(
    async (model: ModelUsageItem, message: ModelUsageMessage) => {
      const prompt = message.prompt?.trim()
      if (!prompt) return
      await runGeneration(model, prompt, {
        turnId: message.turnId,
        imageConfig: message.imageConfig,
        videoConfig: message.videoConfig,
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
          image_config: session.imageConfig as unknown as Record<
            string,
            unknown
          >,
          video_config: session.videoConfig as unknown as Record<
            string,
            unknown
          >,
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
