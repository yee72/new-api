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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type {
  ModelUsageAttachment,
  ModelUsageListData,
  ModelUsageMessage,
  ModelUsageSessionDTO,
  ModelUsageTab,
} from './types'

export async function fetchModelUsageModels(params: {
  type: ModelUsageTab
  q?: string
  vendorIds?: number[]
}): Promise<ModelUsageListData> {
  const search = new URLSearchParams()
  search.set('type', params.type)
  if (params.q?.trim()) {
    search.set('q', params.q.trim())
  } else if (params.vendorIds && params.vendorIds.length > 0) {
    search.set('vendor_ids', params.vendorIds.join(','))
  }
  const res = await api.get(`/api/model-usage/models?${search.toString()}`, {
    skipAuthRefresh: true,
  } as Record<string, unknown>)
  requireServerSuccess(res.data)
  return res.data.data as ModelUsageListData
}

export async function fetchModelUsageSession(
  modelName: string
): Promise<ModelUsageSessionDTO> {
  const res = await api.get(
    `/api/model-usage/sessions/${encodeURIComponent(modelName)}`
  )
  requireServerSuccess(res.data)
  return res.data.data as ModelUsageSessionDTO
}

export async function replaceModelUsageSession(
  modelName: string,
  payload: ModelUsageSessionDTO
): Promise<ModelUsageSessionDTO> {
  const res = await api.put(
    `/api/model-usage/sessions/${encodeURIComponent(modelName)}`,
    payload
  )
  requireServerSuccess(res.data)
  return res.data.data as ModelUsageSessionDTO
}

export async function commitModelUsageTurn(
  modelName: string,
  payload: {
    user_message: ModelUsageMessage
    assistant_message: ModelUsageMessage
    image_sources?: string[]
    video_task_ids?: string[]
    image_config?: Record<string, unknown>
    video_config?: Record<string, unknown>
  }
): Promise<ModelUsageSessionDTO> {
  const res = await api.post(
    `/api/model-usage/sessions/${encodeURIComponent(modelName)}/turns`,
    payload
  )
  requireServerSuccess(res.data)
  return res.data.data as ModelUsageSessionDTO
}

export async function refreshModelUsageVideoTurn(
  modelName: string,
  turnId: string
): Promise<ModelUsageSessionDTO> {
  const res = await api.post(
    `/api/model-usage/sessions/${encodeURIComponent(modelName)}/turns/${encodeURIComponent(turnId)}/refresh-video`
  )
  requireServerSuccess(res.data)
  return res.data.data as ModelUsageSessionDTO
}

export async function uploadModelUsageAttachment(
  file: File
): Promise<ModelUsageAttachment> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post('/api/model-usage/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  requireServerSuccess(res.data)
  return res.data.data as ModelUsageAttachment
}

/** Anthropic Messages（Playground /pg/messages） */
export async function sendAnthropicMessages(
  payload: {
    model: string
    max_tokens: number
    messages: unknown[]
    stream?: boolean
  },
  signal?: AbortSignal
): Promise<unknown> {
  const res = await api.post('/pg/messages', payload, {
    signal,
    skipErrorHandler: true,
    headers: {
      'anthropic-version': '2023-06-01',
    },
  } as Record<string, unknown>)
  return res.data
}

export async function generateImages(payload: {
  model: string
  prompt: string
  n: number
  size?: string
  quality?: string
  group?: string
}): Promise<unknown> {
  // 与 Playground 一致：走 UserAuth 的 /pg 入口，避免 /v1 TokenAuth 401 被踢到登录页
  const res = await api.post('/pg/images/generations', payload, {
    skipErrorHandler: true,
    skipAuthRefresh: true,
  } as Record<string, unknown>)
  return res.data
}

export async function generateVideo(payload: {
  model: string
  prompt: string
  seconds?: number
  size?: string
}): Promise<unknown> {
  const res = await api.post('/pg/videos', payload, {
    skipErrorHandler: true,
    skipAuthRefresh: true,
  } as Record<string, unknown>)
  return res.data
}
