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
export type CreativePlatformPackage = {
  platform: string
  hero_count: number
  hero_bg_count: number
  detail_count: number
  hero_width: number
  hero_height: number
  detail_width: number
  detail_height: number
}

export type CreativeTypePackage = {
  max_references: number
  concurrency: number
  max_auto_retries: number
  estimate_factor: number
  styles: string[]
  platforms: CreativePlatformPackage[]
  quota_per_image_est: number
  quota_analyze_est: number
}

export type CreativeTypeCard = {
  type_id: string
  title: string
  description: string
  icon?: string
  sort_order: number
  billing_mode: string
  package: CreativeTypePackage
}

export type CreativeTypeRow = {
  id: number
  type_id: string
  title: string
  enabled: boolean
  sort_order: number
  description: string
  icon: string
  billing_mode: string
  package_json: string
}

export type CreativeTask = {
  id: number
  user_id: number
  type_id: string
  status: string
  platform: string
  style: string
  style_custom: string
  extra_text: string
  product_profile: string
  image_kind?: string
  image_count?: number
  completed_at?: number
  created_at?: number
  updated_at?: number
  error_message?: string
}

export type CreativeAsset = {
  id: number
  task_id: number
  kind: string
  slot_index: number
  status: string
  width: number
  height: number
  prompt: string
  refine_note?: string
  url?: string
  retry_count: number
  qa_passed?: boolean
  qa_message?: string
  error_message?: string
}

export type CreativeProductProfile = {
  category_l1: string
  category_l2: string
  selling_points: string[]
  appearance: string
  complete?: boolean
  missing?: string[]
}

export type CreativeTaskDetail = {
  task: CreativeTask
  assets: CreativeAsset[]
  config?: {
    package: CreativeTypePackage
    bindings: Record<string, CreativeBinding>
  }
}

export type CreativeBinding = {
  id?: number
  type_id: string
  stage: string
  primary_model: string
  fallback_model: string
  temperature: number
  max_tokens: number
  extra_json?: string
  force_no_thinking?: boolean
}

export type CreativeSkill = {
  id: number
  skill_id: string
  name: string
  version: number
  type_id: string
  stage: string
  platform: string
  body: string
  enabled: boolean
}

export type CreativeGlobalSettings = {
  enabled: boolean
  default_concurrency: string
  sensitive_words_json: string
  menu_visible: boolean
}

export const PLATFORM_LABELS: Record<string, string> = {
  pdd: '拼多多',
  taobao: '淘宝',
  tmall: '天猫',
}

export const KIND_LABELS: Record<string, string> = {
  hero: '主图',
  hero_bg: '带背景主图',
  detail: '详情图',
  reference: '参考图',
}
