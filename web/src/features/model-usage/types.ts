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
import type { GenerationFormConfig } from './lib/generation-request'

export type { GenerationFormConfig } from './lib/generation-request'

export type ModelUsageType = 'chat' | 'image' | 'video'

/** 实际调用协议：与 model_type（Tab）解耦 */
export type ModelUsageInvokeProtocol = 'chat' | 'messages' | 'images' | 'videos'

export type ModelUsageTab = 'all' | ModelUsageType

export type ModelUsageVendor = {
  id: number
  name: string
  icon?: string
  description?: string
}

export type ModelUsageItem = {
  id: number
  model_name: string
  description?: string
  icon?: string
  model_type: ModelUsageType
  /** 后端下发；缺省时前端按 endpoint 回退 */
  invoke_protocol?: ModelUsageInvokeProtocol
  vendor_id?: number
  vendor_name?: string
  vendor_icon?: string
  status: number
  endpoint_path?: string
  supported_endpoint_types?: string[]
  created_time: number
  manual_usage: number
  actual_usage_7d: number
  display_usage: number
  generation_capabilities?: string
}

/** 管理员配置的提示词扩写（润色）能力 */
export type ModelUsagePromptEnhance = {
  enabled: boolean
  model: string
  max_tokens: number
}

export type ModelUsageListData = {
  models: ModelUsageItem[]
  vendors: ModelUsageVendor[]
  prompt_enhance?: ModelUsagePromptEnhance
}

/** 生图表单配置（schema_version 1.0） */
export type ImageGenerationConfig = GenerationFormConfig
/** 生视频表单配置（schema_version 1.0） */
export type VideoGenerationConfig = GenerationFormConfig

export type LocalAttachmentKind = 'image' | 'video' | 'file'

export type LocalAttachment = {
  id: string
  name: string
  ext: string
  size: number
  type: string
  kind: LocalAttachmentKind
  file: File
  /** 本地预览地址（图片/视频） */
  previewUrl?: string
}

export type ModelUsageVideo = {
  task_id?: string
  url?: string
}

/** 用户上传附件元数据（文件在 R2，会话只存指针） */
export type ModelUsageAttachment = {
  id: string
  name: string
  mime?: string
  size?: number
  kind: 'image' | 'pdf' | 'sheet' | 'ppt' | 'doc' | 'file'
  url?: string
  expires_at: number
}

/** 单轮对话气泡（chat / image / video 共用） */
export type ModelUsageMessage = {
  id: string
  turnId: string
  role: 'user' | 'assistant'
  content: string
  status: 'pending' | 'done' | 'error'
  mediaType: 'text' | 'image' | 'video'
  images?: string[]
  videos?: ModelUsageVideo[]
  attachments?: ModelUsageAttachment[]
  /** 用户输入，供删除后重生成 */
  prompt?: string
  imageConfig?: ImageGenerationConfig
  videoConfig?: VideoGenerationConfig
}

export type ModelUsageSessionDTO = {
  model_name: string
  messages: ModelUsageMessage[]
  image_config?: Partial<ImageGenerationConfig> | Record<string, unknown>
  video_config?: Partial<VideoGenerationConfig> | Record<string, unknown>
}

/** 每个模型一份独立会话，互不影响进行中的请求 */
export type ModelUsageSession = {
  messages: ModelUsageMessage[]
  sending: boolean
  imageConfig: ImageGenerationConfig
  videoConfig: VideoGenerationConfig
}
