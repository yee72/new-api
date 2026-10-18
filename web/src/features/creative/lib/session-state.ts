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
import {
  createCreativeProcessEvent,
  kindLabelKey,
  type CreativeProcessEvent,
} from './process-log'
import { PLATFORM_LABELS, type CreativeAsset, type CreativeTask } from '../types'

const processKey = (taskId: number) => `creative-suite-process-v1-${taskId}`
const ACTIVE_TASK_KEY = 'creative-suite-active-task-v1'

export function getActiveCreativeTaskId(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(ACTIVE_TASK_KEY)
    if (!raw) return null
    const id = Number(raw)
    return Number.isFinite(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function setActiveCreativeTaskId(taskId: number | null) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (taskId && taskId > 0) {
      sessionStorage.setItem(ACTIVE_TASK_KEY, String(taskId))
    } else {
      sessionStorage.removeItem(ACTIVE_TASK_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function loadCreativeProcessEvents(
  taskId: number
): CreativeProcessEvent[] {
  if (typeof sessionStorage === 'undefined' || taskId <= 0) return []
  try {
    const raw = sessionStorage.getItem(processKey(taskId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as CreativeProcessEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCreativeProcessEvents(
  taskId: number,
  events: CreativeProcessEvent[]
) {
  if (typeof sessionStorage === 'undefined' || taskId <= 0) return
  try {
    sessionStorage.setItem(processKey(taskId), JSON.stringify(events))
  } catch {
    /* ignore quota */
  }
}

export function clearCreativeProcessEvents(taskId: number) {
  if (typeof sessionStorage === 'undefined' || taskId <= 0) return
  try {
    sessionStorage.removeItem(processKey(taskId))
  } catch {
    /* ignore */
  }
}

/** 无会话日志时，按任务状态拼一条可回看的简版时间线 */
export function buildRestoredProcessEvents(
  task: CreativeTask,
  assets: CreativeAsset[]
): CreativeProcessEvent[] {
  const references = assets.filter((item) => item.kind === 'reference')
  const generated = assets.filter((item) => item.kind !== 'reference')
  const events: CreativeProcessEvent[] = [
    createCreativeProcessEvent({
      stage: 'prepare',
      type: 'stage',
      messageKey: 'Prepare task',
      status: 'done',
    }),
    createCreativeProcessEvent({
      stage: 'prepare',
      type: 'detail',
      messageKey: 'Restored task from history',
      status: 'done',
    }),
    createCreativeProcessEvent({
      stage: 'prepare',
      type: 'detail',
      messageKey: 'Submitted parameters',
      status: 'done',
    }),
  ]
  if (task.platform) {
    events.push(
      createCreativeProcessEvent({
        stage: 'prepare',
        type: 'detail',
        messageKey: 'Platform: {{value}}',
        status: 'done',
        params: {
          value: PLATFORM_LABELS[task.platform] || task.platform,
        },
      })
    )
  }
  const styleValue =
    task.style === '其他风格要求'
      ? task.style_custom || task.style
      : task.style
  if (styleValue) {
    events.push(
      createCreativeProcessEvent({
        stage: 'prepare',
        type: 'detail',
        messageKey: 'Style: {{value}}',
        status: 'done',
        params: { value: styleValue },
      })
    )
  }
  if (task.image_kind) {
    events.push(
      createCreativeProcessEvent({
        stage: 'prepare',
        type: 'detail',
        messageKey: 'Image type: {{kind}}',
        status: 'done',
        params: { kind: kindLabelKey(task.image_kind) },
      })
    )
  }
  if (task.image_count && task.image_count > 0) {
    events.push(
      createCreativeProcessEvent({
        stage: 'prepare',
        type: 'detail',
        messageKey: 'Quantity: {{count}}',
        status: 'done',
        params: { count: task.image_count },
      })
    )
  }
  events.push(
    createCreativeProcessEvent({
      stage: 'prepare',
      type: 'detail',
      messageKey: 'Reference images: {{count}}',
      status: 'done',
      params: { count: references.length },
    })
  )
  if (task.extra_text?.trim()) {
    events.push(
      createCreativeProcessEvent({
        stage: 'prepare',
        type: 'detail',
        messageKey: 'Requirements',
        status: 'done',
        body: task.extra_text.trim(),
      })
    )
  }
  if (task.status === 'draft') return events

  events.push(
    createCreativeProcessEvent({
      stage: 'analyze',
      type: 'stage',
      messageKey: 'Analyze product',
      status: 'done',
    }),
    createCreativeProcessEvent({
      stage: 'analyze',
      type: 'detail',
      messageKey: 'Product analysis complete',
      status: 'done',
    })
  )
  if (
    task.status === 'analyzing' ||
    task.status === 'awaiting_confirm' ||
    task.status === 'generating' ||
    task.status === 'reviewing' ||
    task.status === 'done' ||
    task.status === 'failed'
  ) {
    events.push(
      createCreativeProcessEvent({
        stage: 'plan',
        type: 'stage',
        messageKey: 'Confirm plan',
        status: 'done',
      })
    )
  }
  if (
    task.status === 'generating' ||
    task.status === 'reviewing' ||
    task.status === 'done' ||
    task.status === 'failed'
  ) {
    const success = generated.filter(
      (item) => item.url && item.status !== 'failed'
    ).length
    const planned =
      task.image_count && task.image_count > 0
        ? task.image_count
        : generated.length
    events.push(
      createCreativeProcessEvent({
        stage: 'generate',
        type: 'stage',
        messageKey: 'Generate images',
        status:
          task.status === 'generating'
            ? 'running'
            : task.status === 'failed'
              ? 'error'
              : 'done',
      })
    )
    for (const asset of generated) {
      const prompt = asset.prompt?.trim()
      if (!prompt) continue
      const index = asset.slot_index + 1
      events.push(
        createCreativeProcessEvent({
          stage: 'generate',
          type: 'detail',
          messageKey: 'Model prompt ({{kind}} {{current}}/{{total}})',
          status: 'done',
          params: {
            kind: kindLabelKey(asset.kind),
            current: index,
            total: planned > 0 ? planned : '?',
          },
          body: prompt,
        })
      )
    }
    events.push(
      createCreativeProcessEvent({
        stage: 'generate',
        type: 'detail',
        messageKey: 'Finished {{count}} image(s)',
        status: 'done',
        params: { count: success },
      })
    )
  }
  if (task.status === 'reviewing' || task.status === 'done') {
    events.push(
      createCreativeProcessEvent({
        stage: 'done',
        type: 'stage',
        messageKey: 'Done',
        status: 'done',
      }),
      createCreativeProcessEvent({
        stage: 'done',
        type: 'detail',
        messageKey: 'Generation finished',
        status: 'done',
      })
    )
  }
  return events
}

export type CreativeSuiteStep =
  | 'input'
  | 'analyze'
  | 'confirm'
  | 'generate'
  | 'review'

export function stepFromTaskStatus(status: string): CreativeSuiteStep {
  switch (status) {
    case 'analyzing':
      return 'analyze'
    case 'awaiting_confirm':
      return 'confirm'
    case 'generating':
      return 'generate'
    case 'reviewing':
    case 'done':
    case 'failed':
    case 'cancelled':
      return 'review'
    default:
      return 'input'
  }
}

export function hasPendingGenerationAssets(assets: CreativeAsset[]): boolean {
  return assets.some((item) => {
    if (item.kind === 'reference') return false
    return (
      item.status === 'pending' ||
      item.status === 'generating' ||
      item.status === 'retrying' ||
      item.status === 'refining' ||
      item.status === 'qa'
    )
  })
}
