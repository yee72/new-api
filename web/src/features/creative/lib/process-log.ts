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

/** 创作面板右侧过程时间线：大步骤 + 明细 */
export type CreativeProcessStage =
  | 'prepare'
  | 'analyze'
  | 'plan'
  | 'generate'
  | 'done'

export type CreativeProcessStatus = 'running' | 'done' | 'error'

export type CreativeProcessEvent = {
  id: string
  stage: CreativeProcessStage
  /** stage=大步骤分隔标题；detail=执行明细 */
  type: 'stage' | 'detail'
  messageKey: string
  params?: Record<string, string | number>
  /** 长文本：提交参数摘要、模型提示词等，原样展示 */
  body?: string
  status: CreativeProcessStatus
  at: number
}

let processEventSeq = 0

export function createCreativeProcessEvent(
  partial: Omit<CreativeProcessEvent, 'id' | 'at'> & {
    id?: string
    at?: number
  }
): CreativeProcessEvent {
  processEventSeq += 1
  return {
    id: partial.id || `pe-${Date.now()}-${processEventSeq}`,
    at: partial.at || Date.now(),
    stage: partial.stage,
    type: partial.type,
    messageKey: partial.messageKey,
    params: partial.params,
    body: partial.body,
    status: partial.status,
  }
}

export function kindLabelKey(kind: string): string {
  switch (kind) {
    case 'hero':
      return 'Main image'
    case 'hero_bg':
      return 'Hero with background'
    case 'detail':
      return 'Detail image'
    default:
      return kind
  }
}
