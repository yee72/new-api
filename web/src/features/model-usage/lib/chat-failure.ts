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
import type { TFunction } from 'i18next'

import {
  getServerErrorMessage,
  getServerErrorSources,
} from '@/lib/server-error-message'

const INSUFFICIENT_QUOTA_CODES = new Set([
  'insufficient_user_quota',
  'pre_consume_token_quota_failed',
])

const INSUFFICIENT_QUOTA_PATTERNS = [
  /user quota is not enough/i,
  /token quota is not enough/i,
  /insufficient quota/i,
  /insufficient_user_quota/i,
  /wallet quota insufficient/i,
  /subscription quota insufficient/i,
  /额度不足/,
  /余额不足/,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function collectErrorCodes(error: unknown): string[] {
  const codes: string[] = []
  for (const source of getServerErrorSources(error)) {
    if (typeof source.code === 'string') codes.push(source.code)
    const nested = isRecord(source.error) ? source.error : null
    if (nested && typeof nested.code === 'string') codes.push(nested.code)
  }
  return codes
}

/** 识别账户/密钥/订阅额度不足，用于展示友好文案 */
export function isInsufficientQuotaError(error: unknown): boolean {
  if (collectErrorCodes(error).some((code) => INSUFFICIENT_QUOTA_CODES.has(code))) {
    return true
  }
  const message = getServerErrorMessage(error, '')
  return INSUFFICIENT_QUOTA_PATTERNS.some((pattern) => pattern.test(message))
}

export type ChatFailurePresentation = {
  /** 折叠态标题 / 余额不足时的友好文案 */
  title: string
  /** 接口原始错误，展开后展示；余额不足时不展示 */
  detail?: string
}

export function resolveChatFailurePresentation(
  error: unknown,
  t: TFunction
): ChatFailurePresentation {
  const detail = getServerErrorMessage(error, '').trim()
  if (isInsufficientQuotaError(error)) {
    return {
      title: t(
        'Your compute balance is not enough for this chat. Top up to continue chatting~'
      ),
    }
  }
  const title = t(
    "This request didn't go through. Please try again later."
  )
  if (!detail || detail === title) {
    return { title }
  }
  return { title, detail }
}
