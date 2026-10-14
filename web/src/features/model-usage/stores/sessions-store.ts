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
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  clampImageConfigToMatrix,
  clampVideoConfigToMatrix,
} from '../lib/capabilities'
import {
  DEFAULT_IMAGE_FORM,
  DEFAULT_VIDEO_FORM,
  hydrateGenerationForm,
} from '../lib/generation-request'
import type {
  GenerationFormConfig,
  ModelUsageItem,
  ModelUsageMessage,
  ModelUsageSession,
} from '../types'

const MAX_PERSISTED_MESSAGES = 80

export function createEmptySession(model?: ModelUsageItem): ModelUsageSession {
  return {
    messages: [],
    sending: false,
    imageConfig: clampImageConfigToMatrix(model?.generation_capabilities),
    videoConfig: clampVideoConfigToMatrix(model?.generation_capabilities),
  }
}

/** 合并服务端/本地草稿配置，兼容旧 camelCase */
export function mergeSessionConfigs(
  model: ModelUsageItem | undefined,
  imageRaw?: unknown,
  videoRaw?: unknown
): Pick<ModelUsageSession, 'imageConfig' | 'videoConfig'> {
  const defaults = createEmptySession(model)
  return {
    imageConfig: hydrateGenerationForm(imageRaw, defaults.imageConfig),
    videoConfig: hydrateGenerationForm(videoRaw, defaults.videoConfig),
  }
}

/** 刷新后无法续跑的请求：清 sending，并把未完成气泡标为失败 */
function sanitizeSessions(
  sessions: Record<string, ModelUsageSession>
): Record<string, ModelUsageSession> {
  const next: Record<string, ModelUsageSession> = {}
  for (const [name, session] of Object.entries(sessions)) {
    next[name] = {
      ...session,
      sending: false,
      imageConfig: hydrateGenerationForm(
        session.imageConfig,
        DEFAULT_IMAGE_FORM
      ),
      videoConfig: hydrateGenerationForm(
        session.videoConfig,
        DEFAULT_VIDEO_FORM
      ),
      messages: session.messages
        .slice(-MAX_PERSISTED_MESSAGES)
        .map((message) => {
          if (message.status !== 'pending') return message
          // 视频仍可能在服务端续拉，保留 pending
          if (message.mediaType === 'video') return message
          return {
            ...message,
            status: 'error' as const,
            content: message.content || 'Generation failed',
          }
        }),
    }
  }
  return next
}

/**
 * 重新进入页面时，chat/image 无法续跑上游请求。
 * 保留用户气泡，并把未完成的助手气泡标成失败。
 * 已有任务号的视频仍交给服务端轮询；还没拿到任务号的不能续跑。
 */
export function markUnresumedMessages(
  messages: ModelUsageMessage[],
  interruptedContent: string
): ModelUsageMessage[] {
  return messages.map((message) => {
    if (message.status !== 'pending') return message
    const hasVideoTask =
      message.mediaType === 'video' &&
      message.videos?.some((video) => Boolean(video.task_id))
    if (hasVideoTask) return message
    return {
      ...message,
      status: 'error' as const,
      content: interruptedContent,
    }
  })
}

/** data URL 体积过大，本地草稿持久化时丢弃 */
function stripHeavyImages(
  sessions: Record<string, ModelUsageSession>
): Record<string, ModelUsageSession> {
  const next: Record<string, ModelUsageSession> = {}
  for (const [name, session] of Object.entries(sessions)) {
    next[name] = {
      ...session,
      sending: false,
      messages: session.messages
        .slice(-MAX_PERSISTED_MESSAGES)
        .map((message) => {
          if (!message.images?.length) return message
          const images = message.images.filter(
            (url) => !url.startsWith('data:')
          )
          return { ...message, images: images.length > 0 ? images : undefined }
        }),
    }
  }
  return next
}

type ModelUsageSessionsState = {
  ownerUserId: number | null
  sessions: Record<string, ModelUsageSession>
  /** 每次改写消息后递增，用来丢掉切换窗口期间返回的旧会话快照 */
  revisions: Record<string, number>
  lastModelName: string
  setOwnerUserId: (userId: number | null) => void
  setLastModelName: (modelName: string) => void
  ensureSession: (model: ModelUsageItem) => void
  hydrateSession: (
    modelName: string,
    session: ModelUsageSession,
    model?: ModelUsageItem
  ) => void
  acceptLoadedSession: (
    modelName: string,
    session: ModelUsageSession,
    capturedRevision: number,
    model?: ModelUsageItem
  ) => boolean
  patchSession: (
    modelName: string,
    updater: (current: ModelUsageSession) => ModelUsageSession,
    model?: ModelUsageItem
  ) => void
  setImageConfig: (model: ModelUsageItem, config: GenerationFormConfig) => void
  setVideoConfig: (model: ModelUsageItem, config: GenerationFormConfig) => void
  deleteTurn: (model: ModelUsageItem, turnId: string) => void
  getSessionSnapshot: (
    modelName: string,
    model?: ModelUsageItem
  ) => ModelUsageSession
}

export const useModelUsageSessionsStore = create<ModelUsageSessionsState>()(
  persist(
    (set, get) => ({
      ownerUserId: null,
      sessions: {},
      revisions: {},
      lastModelName: '',
      setOwnerUserId: (userId) => {
        const current = get().ownerUserId
        if (current === userId) return
        // 切换账号时清空内存会话，避免串号；未登录草稿单独保留在 null 桶
        if (current !== null && userId !== current) {
          set({
            ownerUserId: userId,
            sessions: {},
            lastModelName: '',
            revisions: {},
          })
          return
        }
        set({ ownerUserId: userId })
      },
      setLastModelName: (modelName) =>
        set((state) =>
          state.lastModelName === modelName
            ? state
            : { lastModelName: modelName }
        ),
      ensureSession: (model) => {
        const { sessions } = get()
        if (sessions[model.model_name]) return
        set({
          sessions: {
            ...sessions,
            [model.model_name]: createEmptySession(model),
          },
        })
      },
      hydrateSession: (modelName, session, model) => {
        const { sessions, revisions } = get()
        const previous = sessions[modelName] ?? createEmptySession(model)
        set({
          revisions: {
            ...revisions,
            [modelName]: (revisions[modelName] ?? 0) + 1,
          },
          sessions: {
            ...sessions,
            [modelName]: {
              ...previous,
              ...session,
            },
          },
        })
      },
      acceptLoadedSession: (modelName, session, capturedRevision, model) => {
        const current = get().sessions[modelName]
        const revision = get().revisions[modelName] ?? 0
        // 正在等上游，或本地已经写过更新的一轮：不要用切换前拉到的旧历史覆盖
        if (current?.sending || capturedRevision !== revision) return false
        get().hydrateSession(modelName, session, model)
        return true
      },
      patchSession: (modelName, updater, model) => {
        const { sessions, revisions } = get()
        const previous = sessions[modelName] ?? createEmptySession(model)
        const next = updater(previous)
        const messagesChanged = next.messages !== previous.messages
        set({
          revisions: messagesChanged
            ? {
                ...revisions,
                [modelName]: (revisions[modelName] ?? 0) + 1,
              }
            : revisions,
          sessions: {
            ...sessions,
            [modelName]: next,
          },
        })
      },
      setImageConfig: (model, config) => {
        get().patchSession(
          model.model_name,
          (session) => ({ ...session, imageConfig: config }),
          model
        )
      },
      setVideoConfig: (model, config) => {
        get().patchSession(
          model.model_name,
          (session) => ({ ...session, videoConfig: config }),
          model
        )
      },
      deleteTurn: (model, turnId) => {
        get().patchSession(
          model.model_name,
          (session) => ({
            ...session,
            messages: session.messages.filter(
              (message) => message.turnId !== turnId
            ),
          }),
          model
        )
      },
      getSessionSnapshot: (modelName, model) => {
        return get().sessions[modelName] ?? createEmptySession(model)
      },
    }),
    {
      name: 'model-usage-sessions',
      partialize: (state) => ({
        // 仅缓存未登录草稿；登录会话以服务端为准
        ownerUserId: state.ownerUserId,
        sessions:
          state.ownerUserId == null ? stripHeavyImages(state.sessions) : {},
        lastModelName: state.ownerUserId == null ? state.lastModelName : '',
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<ModelUsageSessionsState>
        return {
          ...current,
          ...raw,
          ownerUserId: raw.ownerUserId ?? null,
          sessions: sanitizeSessions(raw.sessions ?? {}),
          lastModelName: raw.lastModelName ?? '',
          revisions: current.revisions ?? {},
        }
      },
    }
  )
)

export type { ModelUsageMessage }
