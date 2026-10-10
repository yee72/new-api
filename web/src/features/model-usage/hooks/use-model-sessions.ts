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

import { generateImages, generateVideo } from '../api'
import {
  aspectRatioToSize,
  validateImageConfig,
  validateVideoConfig,
} from '../lib/capabilities'
import {
  createEmptySession,
  useModelUsageSessionsStore,
} from '../stores/sessions-store'
import type {
  ImageGenerationConfig,
  ModelUsageItem,
  ModelUsageMessage,
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

function mediaTypeOf(
  model: ModelUsageItem
): ModelUsageMessage['mediaType'] {
  if (model.model_type === 'image') return 'image'
  if (model.model_type === 'video') return 'video'
  return 'text'
}

export function useModelSessions() {
  const { t } = useTranslation()
  const sessions = useModelUsageSessionsStore((state) => state.sessions)
  const lastModelName = useModelUsageSessionsStore(
    (state) => state.lastModelName
  )
  const setLastModelName = useModelUsageSessionsStore(
    (state) => state.setLastModelName
  )
  const ensureSession = useModelUsageSessionsStore(
    (state) => state.ensureSession
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
  const deleteTurn = useModelUsageSessionsStore((state) => state.deleteTurn)

  const getSession = useCallback(
    (model?: ModelUsageItem) => {
      if (!model) return createEmptySession()
      return sessions[model.model_name] ?? createEmptySession(model)
    },
    [sessions]
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
      const latest =
        store.sessions[modelName] ?? createEmptySession(model)
      if (latest.sending) return

      const imageConfig = options?.imageConfig ?? latest.imageConfig
      const videoConfig = options?.videoConfig ?? latest.videoConfig
      const turnId = options?.turnId ?? newId('turn')
      const isRegenerate = Boolean(options?.turnId)
      const mediaType = mediaTypeOf(model)

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

      const completeAssistant = (patch: Partial<ModelUsageMessage>) => {
        patchSession(
          modelName,
          (current) => ({
            ...current,
            sending: false,
            messages: current.messages.map((message) =>
              message.id === assistantId
                ? { ...message, status: 'done', ...patch }
                : message
            ),
          }),
          model
        )
      }

      try {
        if (model.model_type === 'chat') {
          const response = await sendChatCompletion({
            model: modelName,
            messages: [
              ...chatHistory,
              { role: 'user' as const, content: prompt },
            ],
            stream: false,
          })
          const content =
            response.choices?.[0]?.message?.content ||
            t('Empty response from model')
          completeAssistant({
            content:
              typeof content === 'string' ? content : String(content),
          })
          return
        }

        if (model.model_type === 'image') {
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
          const urls = extractImageUrls(data)
          completeAssistant({
            content: urls.length > 0 ? '' : t('Empty response from model'),
            images: urls,
          })
          toast.success(t('Generation completed'))
          return
        }

        const tasks: unknown[] = []
        for (let i = 0; i < videoConfig.n; i += 1) {
          const result = await generateVideo({
            model: modelName,
            prompt,
            seconds: videoConfig.seconds,
            size: aspectRatioToSize(videoConfig.aspectRatio),
          })
          tasks.push(result)
        }
        const first = tasks[0] as { id?: string; status?: string }
        completeAssistant({
          content: first?.id
            ? t('Video task submitted: {{id}}', { id: first.id })
            : t('Video task submitted'),
        })
        toast.success(t('Generation completed'))
      } catch (error) {
        const fallback =
          model.model_type === 'chat'
            ? t('Chat request failed')
            : t('Generation failed')
        handleServerError(error, fallback)
        if (model.model_type === 'chat') {
          toast.error(fallback)
        }
        failAssistant(fallback)
      }
    },
    [patchSession, t]
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

  const isModelSending = useCallback(
    (modelName: string) => Boolean(sessions[modelName]?.sending),
    [sessions]
  )

  return {
    getSession,
    ensureSession,
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
