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

import type {
  CreativeAsset,
  CreativeBinding,
  CreativeGlobalSettings,
  CreativeProductProfile,
  CreativeSkill,
  CreativeTask,
  CreativeTaskDetail,
  CreativeTypeCard,
  CreativeTypeRow,
} from './types'

export async function listCreativeTypes() {
  const res = await api.get('/api/creative/types')
  return res.data as { success: boolean; data: CreativeTypeCard[] }
}

export async function createCreativeTask(body: {
  type_id: string
  platform: string
  style: string
  style_custom?: string
  extra_text?: string
  image_kind?: string
  image_count?: number
}) {
  const res = await api.post('/api/creative/tasks', body)
  return res.data as { success: boolean; data: CreativeTask; message?: string }
}

export type CreativeHistoryItem = CreativeTask & {
  title: string
  type_title: string
  subject: string
  success_image_count: number
}

export async function listCreativeTasks() {
  const res = await api.get('/api/creative/tasks')
  return res.data as {
    success: boolean
    data: CreativeHistoryItem[]
    message?: string
  }
}

export async function getCreativeTask(id: number) {
  const res = await api.get(`/api/creative/tasks/${id}`)
  return res.data as { success: boolean; data: CreativeTaskDetail }
}

export async function uploadCreativeReference(taskId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post(`/api/creative/tasks/${taskId}/references`, form)
  return res.data as { success: boolean; data: CreativeAsset; message?: string }
}

export async function prepareCreativeAnalyze(
  taskId: number,
  body?: {
    platform?: string
    style?: string
    style_custom?: string
    extra_text?: string
    image_kind?: string
    image_count?: number
  }
) {
  const res = await api.post(
    `/api/creative/tasks/${taskId}/analyze/prepare`,
    body ?? {}
  )
  return res.data as {
    success: boolean
    data: {
      model: string
      fallback_model?: string
      system_prompt: string
      user_prompt: string
      references: string[]
    }
    message?: string
  }
}

export async function submitCreativeAnalyzeResult(
  taskId: number,
  body: { raw_response?: string; profile?: CreativeProductProfile }
) {
  const res = await api.post(`/api/creative/tasks/${taskId}/analyze/result`, body)
  return res.data as {
    success: boolean
    data: { task: CreativeTask; profile: CreativeProductProfile }
  }
}

export async function updateCreativeProfile(
  taskId: number,
  profile: CreativeProductProfile
) {
  const res = await api.put(`/api/creative/tasks/${taskId}/profile`, { profile })
  return res.data as {
    success: boolean
    data: { task: CreativeTask; profile: CreativeProductProfile }
  }
}

export async function confirmCreativeTask(
  taskId: number,
  body?: { image_kind?: string; image_count?: number }
) {
  const res = await api.post(`/api/creative/tasks/${taskId}/confirm`, body ?? {})
  return res.data as {
    success: boolean
    data?: {
      task: CreativeTask
      assets: CreativeAsset[]
    }
    message?: string
  }
}

export async function prepareCreativeAsset(taskId: number, assetId?: number) {
  const res = await api.post(`/api/creative/tasks/${taskId}/assets/prepare`, {
    asset_id: assetId ?? 0,
  })
  return res.data as {
    success: boolean
    data: {
      done?: boolean
      asset?: CreativeAsset
      model?: string
      prompt?: string
      width?: number
      height?: number
      references?: string[]
      max_retries?: number
    }
  }
}

export async function completeCreativeAsset(
  taskId: number,
  body: { asset_id: number; url?: string; urls?: string[]; error?: string }
) {
  const res = await api.post(
    `/api/creative/tasks/${taskId}/assets/complete`,
    body
  )
  return res.data as { success: boolean; data: CreativeAsset }
}

export async function refineCreativeAsset(
  taskId: number,
  assetId: number,
  note: string
) {
  const res = await api.post(
    `/api/creative/tasks/${taskId}/assets/${assetId}/refine`,
    { note }
  )
  return res.data as { success: boolean; data: CreativeAsset }
}

export async function approveCreativeAsset(taskId: number, assetId: number) {
  const res = await api.post(
    `/api/creative/tasks/${taskId}/assets/${assetId}/approve`
  )
  return res.data as { success: boolean; data: CreativeAsset }
}

export async function approveAllCreativeAssets(taskId: number) {
  const res = await api.post(`/api/creative/tasks/${taskId}/approve-all`)
  return res.data as {
    success: boolean
    data: { task: CreativeTask; assets: CreativeAsset[] }
  }
}

export function creativeDownloadUrl(taskId: number) {
  return `/api/creative/tasks/${taskId}/download.zip`
}

export async function adminGetCreativeGlobal() {
  const res = await api.get('/api/creative/admin/global')
  return res.data as { success: boolean; data: CreativeGlobalSettings }
}

export async function adminUpdateCreativeGlobal(body: {
  enabled?: boolean
  default_concurrency?: number
  sensitive_words_json?: string
}) {
  const res = await api.put('/api/creative/admin/global', body)
  return res.data as { success: boolean; data: CreativeGlobalSettings }
}

export async function adminListCreativeTypes() {
  const res = await api.get('/api/creative/admin/types')
  return res.data as { success: boolean; data: CreativeTypeRow[] }
}

export async function adminUpdateCreativeType(
  typeId: string,
  body: Record<string, unknown>
) {
  const res = await api.put(`/api/creative/admin/types/${typeId}`, body)
  return res.data as { success: boolean; data: CreativeTypeRow }
}

export async function adminListBindings(typeId: string) {
  const res = await api.get(`/api/creative/admin/types/${typeId}/bindings`)
  return res.data as { success: boolean; data: CreativeBinding[] }
}

export async function adminUpsertBinding(
  typeId: string,
  body: Partial<CreativeBinding>
) {
  const res = await api.put(
    `/api/creative/admin/types/${typeId}/bindings`,
    body
  )
  return res.data as { success: boolean; data: CreativeBinding }
}

export async function adminListSkills(typeId?: string) {
  const res = await api.get('/api/creative/admin/skills', {
    params: typeId ? { type_id: typeId } : undefined,
  })
  return res.data as { success: boolean; data: CreativeSkill[] }
}

export async function adminCreateSkill(body: Partial<CreativeSkill>) {
  const res = await api.post('/api/creative/admin/skills', body)
  return res.data as { success: boolean; data: CreativeSkill }
}

export async function adminUpdateSkill(id: number, body: Partial<CreativeSkill>) {
  const res = await api.put(`/api/creative/admin/skills/${id}`, body)
  return res.data as { success: boolean; data: CreativeSkill }
}

export async function adminCopySkill(id: number) {
  const res = await api.post(`/api/creative/admin/skills/${id}/copy`)
  return res.data as { success: boolean; data: CreativeSkill }
}

export async function adminListCreativeAudits() {
  const res = await api.get('/api/creative/admin/audits')
  return res.data as {
    success: boolean
    data: Array<{
      id: number
      actor_name: string
      entity_type: string
      entity_id: string
      action: string
      created_at: number
    }>
  }
}
