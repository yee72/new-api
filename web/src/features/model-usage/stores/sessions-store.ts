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
import type {
  ImageGenerationConfig,
  ModelUsageItem,
  ModelUsageMessage,
  ModelUsageSession,
  VideoGenerationConfig,
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

/** 刷新后无法续跑的请求：清 sending，并把未完成气泡标为失败 */
function sanitizeSessions(
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
          if (message.status !== 'pending') return message
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

/** data URL 体积过大，持久化时丢弃，保留其它历史 */
function stripHeavyImages(
  sessions: Record<string, ModelUsageSession>
): Record<string, ModelUsageSession> {
  const next: Record<string, ModelUsageSession> = {}
  for (const [name, session] of Object.entries(sessions)) {
    next[name] = {
      ...session,
      sending: false,
      messages: session.messages.slice(-MAX_PERSISTED_MESSAGES).map((message) => {
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
  sessions: Record<string, ModelUsageSession>
  lastModelName: string
  setLastModelName: (modelName: string) => void
  ensureSession: (model: ModelUsageItem) => void
  patchSession: (
    modelName: string,
    updater: (current: ModelUsageSession) => ModelUsageSession,
    model?: ModelUsageItem
  ) => void
  setImageConfig: (model: ModelUsageItem, config: ImageGenerationConfig) => void
  setVideoConfig: (model: ModelUsageItem, config: VideoGenerationConfig) => void
  deleteTurn: (model: ModelUsageItem, turnId: string) => void
  getSessionSnapshot: (modelName: string, model?: ModelUsageItem) => ModelUsageSession
}

export const useModelUsageSessionsStore = create<ModelUsageSessionsState>()(
  persist(
    (set, get) => ({
      sessions: {},
      lastModelName: '',
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
      patchSession: (modelName, updater, model) => {
        const { sessions } = get()
        const previous = sessions[modelName] ?? createEmptySession(model)
        set({
          sessions: {
            ...sessions,
            [modelName]: updater(previous),
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
        sessions: stripHeavyImages(state.sessions),
        lastModelName: state.lastModelName,
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<ModelUsageSessionsState>
        return {
          ...current,
          ...raw,
          sessions: sanitizeSessions(raw.sessions ?? {}),
          lastModelName: raw.lastModelName ?? '',
        }
      },
    }
  )
)

export type { ModelUsageMessage }
