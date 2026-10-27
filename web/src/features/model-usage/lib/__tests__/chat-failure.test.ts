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
import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'

import {
  isInsufficientQuotaError,
  resolveChatFailurePresentation,
} from '../chat-failure'

async function createT() {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          "This request didn't go through. Please try again later.":
            "This request didn't go through. Please try again later.",
          'Your compute balance is not enough for this chat. Top up to continue chatting~':
            'Your compute balance is not enough for this chat. Top up to continue chatting~',
        },
      },
    },
  })
  return i18n.t.bind(i18n)
}

describe('isInsufficientQuotaError', () => {
  it('detects insufficient_user_quota code', () => {
    expect(
      isInsufficientQuotaError({
        response: { data: { error: { code: 'insufficient_user_quota' } } },
      })
    ).toBe(true)
  })

  it('detects user quota message', () => {
    expect(
      isInsufficientQuotaError({
        message: 'user quota is not enough, user quota: $0, need quota: $1',
      })
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(
      isInsufficientQuotaError({
        message: 'model name does not exist',
      })
    ).toBe(false)
  })
})

describe('resolveChatFailurePresentation', () => {
  it('uses friendly copy for insufficient quota', async () => {
    const t = await createT()
    const result = resolveChatFailurePresentation(
      { message: 'user quota is not enough, user quota: $0, need quota: $1' },
      t
    )
    expect(result.title).toBe(
      'Your compute balance is not enough for this chat. Top up to continue chatting~'
    )
    expect(result.detail).toBeUndefined()
  })

  it('keeps title collapsed and API text as detail', async () => {
    const t = await createT()
    const detail =
      '当前无法提供该模型：模型名称不存在，或您所在分组下暂无可用渠道。'
    const result = resolveChatFailurePresentation({ message: detail }, t)
    expect(result.title).toBe(
      "This request didn't go through. Please try again later."
    )
    expect(result.detail).toBe(detail)
  })
})
