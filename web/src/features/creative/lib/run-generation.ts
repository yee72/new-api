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
import { generateImages } from '@/features/model-usage/api'
import {
  extractImagesFromChatMessage,
  resolveInvokeProtocol,
} from '@/features/model-usage/lib/invoke-protocol'
import { fetchModelUsageMediaBlobCached } from '@/features/model-usage/lib/media-download'
import type { ModelUsageItem } from '@/features/model-usage/types'
import { sendChatCompletion } from '@/features/playground/api'

import {
  completeCreativeAsset,
  prepareCreativeAnalyze,
  prepareCreativeAsset,
  submitCreativeAnalyzeResult,
} from '../api'
import { PLATFORM_LABELS } from '../types'
import {
  createCreativeProcessEvent,
  kindLabelKey,
  type CreativeProcessEvent,
  type CreativeProcessStage,
} from './process-log'

type CreativeImageModelMeta = Pick<
  ModelUsageItem,
  'invoke_protocol' | 'supported_endpoint_types' | 'model_type'
>

function extractImageUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return []
  const record = data as {
    data?: Array<{ url?: string; b64_json?: string }>
  }
  const out: string[] = []
  for (const item of record.data ?? []) {
    if (item.url) out.push(item.url)
    else if (item.b64_json) out.push(`data:image/png;base64,${item.b64_json}`)
  }
  return out
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () =>
      resolve(String(reader.result || ''))
    )
    reader.addEventListener('error', () =>
      reject(reader.error ?? new Error('read failed'))
    )
    reader.readAsDataURL(blob)
  })
}

/** 短链对上游不可见，分析前转为 data URL */
async function resolveReferenceDataUrls(urls: string[]): Promise<string[]> {
  const out: string[] = []
  for (const url of urls.slice(0, 5)) {
    const trimmed = url.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('data:')) {
      out.push(trimmed)
      continue
    }
    const blob = await fetchModelUsageMediaBlobCached(trimmed)
    out.push(await blobToDataURL(blob))
  }
  return out
}

function chatErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const record = error as {
      message?: string
      response?: { data?: { error?: { message?: string }; message?: string } }
    }
    const fromBody =
      record.response?.data?.error?.message || record.response?.data?.message
    if (fromBody) return fromBody
    if (record.message) return record.message
  }
  if (error instanceof Error) return error.message
  return 'analyze failed'
}

type ProcessLogger = (event: CreativeProcessEvent) => void

function emitStage(
  onLog: ProcessLogger | undefined,
  stage: CreativeProcessStage,
  messageKey: string
) {
  onLog?.(
    createCreativeProcessEvent({
      stage,
      type: 'stage',
      messageKey,
      status: 'running',
    })
  )
}

function emitDetail(
  onLog: ProcessLogger | undefined,
  stage: CreativeProcessStage,
  messageKey: string,
  status: CreativeProcessEvent['status'] = 'running',
  params?: Record<string, string | number>,
  body?: string
) {
  onLog?.(
    createCreativeProcessEvent({
      stage,
      type: 'detail',
      messageKey,
      status,
      params,
      body,
    })
  )
}

type AnalyzeOptions = {
  group?: string
  platform?: string
  style?: string
  styleCustom?: string
  extraText?: string
  imageKind?: string
  imageCount?: number
  imageModel?: string
  onLog?: ProcessLogger
}

function emitSubmittedParameters(
  onLog: ProcessLogger | undefined,
  options: AnalyzeOptions | undefined,
  referenceCount: number
) {
  emitDetail(onLog, 'prepare', 'Submitted parameters', 'done')
  const platformKey = options?.platform?.trim()
  if (platformKey) {
    emitDetail(onLog, 'prepare', 'Platform: {{value}}', 'done', {
      value: PLATFORM_LABELS[platformKey] || platformKey,
    })
  }
  const styleRaw = options?.style?.trim()
  if (styleRaw) {
    const styleValue =
      styleRaw === '其他风格要求'
        ? options?.styleCustom?.trim() || styleRaw
        : styleRaw
    emitDetail(onLog, 'prepare', 'Style: {{value}}', 'done', {
      value: styleValue,
    })
  }
  if (options?.imageKind) {
    emitDetail(onLog, 'prepare', 'Image type: {{kind}}', 'done', {
      kind: kindLabelKey(options.imageKind),
    })
  }
  if (options?.imageCount && options.imageCount > 0) {
    emitDetail(onLog, 'prepare', 'Quantity: {{count}}', 'done', {
      count: options.imageCount,
    })
  }
  if (options?.imageModel?.trim()) {
    emitDetail(onLog, 'prepare', 'Image model: {{value}}', 'done', {
      value: options.imageModel.trim(),
    })
  }
  if (options?.group?.trim()) {
    emitDetail(onLog, 'prepare', 'Group: {{value}}', 'done', {
      value: options.group.trim(),
    })
  }
  emitDetail(onLog, 'prepare', 'Reference images: {{count}}', 'done', {
    count: referenceCount,
  })
  const requirements = options?.extraText?.trim()
  if (requirements) {
    emitDetail(
      onLog,
      'prepare',
      'Requirements',
      'done',
      undefined,
      requirements
    )
  }
}

/** 调用分析模型并回写商品档案 */
export async function runCreativeAnalyze(
  taskId: number,
  options?: AnalyzeOptions
) {
  const onLog = options?.onLog
  emitStage(onLog, 'prepare', 'Prepare task')
  emitDetail(onLog, 'prepare', 'Syncing task inputs...', 'running')

  const prepared = await prepareCreativeAnalyze(taskId, {
    platform: options?.platform,
    style: options?.style,
    style_custom: options?.styleCustom,
    extra_text: options?.extraText,
    image_kind: options?.imageKind,
    image_count: options?.imageCount,
  })
  if (!prepared.success || !prepared.data) {
    emitDetail(
      onLog,
      'prepare',
      'Failed to prepare analysis: {{message}}',
      'error',
      { message: prepared.message || 'prepare analyze failed' }
    )
    throw new Error(prepared.message || 'prepare analyze failed')
  }
  emitDetail(onLog, 'prepare', 'Task inputs synced', 'done')
  const {
    model,
    fallback_model: fallbackModel,
    system_prompt,
    user_prompt,
    references,
  } = prepared.data
  const refCount = references?.length || 0
  emitSubmittedParameters(onLog, options, refCount)

  emitStage(onLog, 'analyze', 'Analyze product')
  emitDetail(onLog, 'analyze', 'Reading reference images ({{count}})', 'running', {
    count: refCount,
  })
  const imageUrls = await resolveReferenceDataUrls(references || [])
  emitDetail(
    onLog,
    'analyze',
    'Reference images ready ({{count}})',
    'done',
    { count: imageUrls.length }
  )

  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: user_prompt }]
  for (const url of imageUrls) {
    content.push({ type: 'image_url', image_url: { url } })
  }
  const candidates = [model, fallbackModel]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
  if (candidates.length === 0) {
    emitDetail(onLog, 'analyze', 'No analyze model configured', 'error')
    throw new Error('no analyze model configured')
  }

  let lastError: unknown
  for (const modelName of candidates) {
    emitDetail(
      onLog,
      'analyze',
      'Calling analyze model...',
      'running'
    )
    try {
      const res = await sendChatCompletion({
        model: modelName,
        group: options?.group || undefined,
        stream: false,
        messages: [
          { role: 'system', content: system_prompt },
          { role: 'user', content },
        ],
      })
      const raw =
        (res as { choices?: Array<{ message?: { content?: string } }> })
          ?.choices?.[0]?.message?.content || ''
      emitDetail(onLog, 'analyze', 'Parsing product profile...', 'running')
      const submitted = await submitCreativeAnalyzeResult(taskId, {
        raw_response: String(raw),
      })
      const appearance =
        submitted.data?.profile?.appearance?.trim() ||
        submitted.data?.profile?.category_l2?.trim() ||
        ''
      if (appearance) {
        emitDetail(
          onLog,
          'analyze',
          'Product analysis complete: {{subject}}',
          'done',
          { subject: appearance.slice(0, 24) }
        )
      } else {
        emitDetail(onLog, 'analyze', 'Product analysis complete', 'done')
      }
      return submitted
    } catch (error) {
      lastError = error
      emitDetail(
        onLog,
        'analyze',
        'Analyze attempt failed, trying fallback if available...',
        'error'
      )
    }
  }
  const message = chatErrorMessage(lastError)
  emitDetail(
    onLog,
    'analyze',
    'Analysis failed: {{message}}',
    'error',
    { message }
  )
  throw new Error(message)
}

type GenerationLoopOptions = {
  onProgress?: (message: string) => void
  onLog?: ProcessLogger
  /** 每张资产完成后回调，用于右侧结果跟随 */
  onAssetSettled?: () => void | Promise<void>
  /** 用户选择的生图模型，优先于管理端绑定 */
  imageModel?: string
  /** 模型协议元数据：决定走 /images 还是 chat 生图 */
  imageModelMeta?: CreativeImageModelMeta
  /** 用户选择的分组 */
  group?: string
  /** 计划生成张数，用于进度文案 */
  imageCount?: number
}

/** 按模型协议生图：Gemini 等走 chat，声明 image-generation 的走 /pg/images */
async function generateCreativeImageUrls(params: {
  modelName: string
  prompt: string
  group?: string
  width?: number
  height?: number
  references?: string[]
  modelMeta?: CreativeImageModelMeta
}): Promise<string[]> {
  const protocol = resolveInvokeProtocol(
    params.modelMeta ?? { model_type: 'image' }
  )
  if (protocol === 'images') {
    const data = await generateImages({
      model: params.modelName,
      prompt: params.prompt,
      n: 1,
      group: params.group || undefined,
      size:
        params.width && params.height
          ? `${params.width}x${params.height}`
          : undefined,
    })
    return extractImageUrls(data)
  }

  // chat 生图（Gemini flash-image 等不支持 /v1/images/generations）
  let requestPrompt = params.prompt
  if (params.width && params.height) {
    requestPrompt = `${params.prompt}\n\n[image settings: size=${params.width}x${params.height}]`
  }
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: requestPrompt }]
  const imageUrls = await resolveReferenceDataUrls(params.references || [])
  for (const url of imageUrls) {
    content.push({ type: 'image_url', image_url: { url } })
  }
  const response = await sendChatCompletion({
    model: params.modelName,
    group: params.group || undefined,
    stream: false,
    messages: [{ role: 'user', content }],
  })
  const assistantMessage = (
    response as {
      choices?: Array<{
        message?: {
          content?: unknown
          images?: Array<{ type?: string; image_url?: { url?: string } }>
        }
      }>
    }
  )?.choices?.[0]?.message
  return extractImagesFromChatMessage({
    content: assistantMessage?.content,
    images: assistantMessage?.images,
  })
}

/** 循环处理待生成资产：经 /pg 生图并回传，直到 done */
export async function runCreativeGenerationLoop(
  taskId: number,
  onProgressOrOptions?: ((message: string) => void) | GenerationLoopOptions
) {
  const options: GenerationLoopOptions =
    typeof onProgressOrOptions === 'function'
      ? { onProgress: onProgressOrOptions }
      : (onProgressOrOptions ?? {})
  const onLog = options.onLog
  emitStage(onLog, 'generate', 'Generate images')

  let finished = 0
  const planned = options.imageCount && options.imageCount > 0 ? options.imageCount : 0

  for (let i = 0; i < 40; i++) {
    const prepared = await prepareCreativeAsset(taskId)
    if (!prepared.success) break
    if (prepared.data.done || !prepared.data.asset) {
      options.onProgress?.('done')
      emitDetail(onLog, 'generate', 'All image slots processed', 'done')
      emitStage(onLog, 'done', 'Done')
      emitDetail(onLog, 'done', 'Generation finished', 'done')
      return
    }
    const asset = prepared.data.asset
    const modelName = options.imageModel?.trim() || prepared.data.model
    const prompt = prepared.data.prompt || ''
    const kindKey = kindLabelKey(asset.kind)
    const index = asset.slot_index + 1
    const totalLabel = planned > 0 ? planned : '?'
    const sizeLabel =
      prepared.data.width && prepared.data.height
        ? `${prepared.data.width}x${prepared.data.height}`
        : ''
    options.onProgress?.(
      `generating ${index}/${totalLabel} ${asset.kind}`
    )
    emitDetail(
      onLog,
      'generate',
      'Generating {{kind}} {{current}}/{{total}}...',
      'running',
      { kind: kindKey, current: index, total: totalLabel }
    )
    if (modelName) {
      emitDetail(onLog, 'generate', 'Using model: {{value}}', 'done', {
        value: modelName,
      })
    }
    if (sizeLabel) {
      emitDetail(onLog, 'generate', 'Output size: {{value}}', 'done', {
        value: sizeLabel,
      })
    }
    if (prompt.trim()) {
      emitDetail(
        onLog,
        'generate',
        'Model prompt ({{kind}} {{current}}/{{total}})',
        'done',
        { kind: kindKey, current: index, total: totalLabel },
        prompt.trim()
      )
    }
    if (!modelName) {
      await completeCreativeAsset(taskId, {
        asset_id: asset.id,
        error: 'no image model selected',
      })
      emitDetail(
        onLog,
        'generate',
        '{{kind}} {{current}} failed: no image model selected',
        'error',
        { kind: kindKey, current: index }
      )
      await options.onAssetSettled?.()
      continue
    }
    try {
      const urls = await generateCreativeImageUrls({
        modelName,
        prompt,
        group: options.group,
        width: prepared.data.width,
        height: prepared.data.height,
        references: prepared.data.references,
        modelMeta: options.imageModelMeta,
      })
      if (urls.length === 0) {
        await completeCreativeAsset(taskId, {
          asset_id: asset.id,
          error: 'no image in response',
        })
        emitDetail(
          onLog,
          'generate',
          '{{kind}} {{current}} failed: no image in response',
          'error',
          { kind: kindKey, current: index }
        )
      } else {
        await completeCreativeAsset(taskId, {
          asset_id: asset.id,
          url: urls[0],
          urls,
        })
        finished += 1
        emitDetail(
          onLog,
          'generate',
          '{{kind}} {{current}} completed',
          'done',
          { kind: kindKey, current: index }
        )
      }
    } catch (error) {
      const message = chatErrorMessage(error)
      await completeCreativeAsset(taskId, {
        asset_id: asset.id,
        error: message,
      })
      emitDetail(
        onLog,
        'generate',
        '{{kind}} {{current}} failed: {{message}}',
        'error',
        { kind: kindKey, current: index, message }
      )
    }
    await options.onAssetSettled?.()
  }
  emitDetail(
    onLog,
    'generate',
    'Finished {{count}} image(s)',
    'done',
    { count: finished }
  )
  emitStage(onLog, 'done', 'Done')
  emitDetail(onLog, 'done', 'Generation finished', 'done')
}
