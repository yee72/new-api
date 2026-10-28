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
*/
import { describe, expect, test } from 'vitest'

import {
  PAYMENT_CNY_MAX,
  PAYMENT_CNY_MIN,
  PAYMENT_CNY_PRESETS,
  PAYMENT_TYPES,
} from '../constants'
import {
  filterPresetAmountsByBounds,
  generateCnyPresetAmounts,
  getDefaultPayCnyAmount,
  getMaxTopupAmount,
  getMinTopupAmount,
  getPreferredPaymentType,
  isTopupAmountInBounds,
  payCnyToCreditAmount,
  resolveCnyPresetAmounts,
} from './payment'

describe('payment CNY bounds', () => {
  test('enforces product min and max for topup CNY integers', () => {
    expect(getMinTopupAmount(null)).toBe(PAYMENT_CNY_MIN)
    expect(
      getMinTopupAmount({
        enable_online_topup: true,
        min_topup: 5,
        enable_stripe_topup: false,
        stripe_min_topup: 1,
        enable_waffo_topup: false,
        waffo_min_topup: 1,
        enable_waffo_pancake_topup: false,
        waffo_pancake_min_topup: 1,
        enable_creem_topup: false,
        enable_redemption: true,
        pay_methods: [],
        amount_options: [],
        discount: {},
      } as never)
    ).toBe(PAYMENT_CNY_MIN)
    expect(getMaxTopupAmount()).toBe(PAYMENT_CNY_MAX)
    expect(isTopupAmountInBounds(1, PAYMENT_CNY_MIN)).toBe(true)
    expect(isTopupAmountInBounds(0, PAYMENT_CNY_MIN)).toBe(false)
    expect(isTopupAmountInBounds(1.5, PAYMENT_CNY_MIN)).toBe(false)
    expect(isTopupAmountInBounds(10000, PAYMENT_CNY_MIN)).toBe(true)
    expect(isTopupAmountInBounds(10001, PAYMENT_CNY_MIN)).toBe(false)
  })

  test('generates fixed CNY payment presets', () => {
    const presets = generateCnyPresetAmounts()
    expect(presets.map((item) => item.value)).toEqual([...PAYMENT_CNY_PRESETS])
    expect(
      presets.every((preset) =>
        isTopupAmountInBounds(preset.value, PAYMENT_CNY_MIN)
      )
    ).toBe(true)
    expect(
      filterPresetAmountsByBounds(presets, PAYMENT_CNY_MIN).length
    ).toBe(PAYMENT_CNY_PRESETS.length)
  })

  test('prefers gateway amount options over product defaults', () => {
    const presets = resolveCnyPresetAmounts([30, 10, 50], { 50: 0.9 })
    expect(presets.map((item) => item.value)).toEqual([10, 30, 50])
    expect(presets.find((item) => item.value === 50)?.discount).toBe(0.9)
    expect(resolveCnyPresetAmounts([]).map((item) => item.value)).toEqual([
      ...PAYMENT_CNY_PRESETS,
    ])
  })

  test('converts pay CNY to credit amount by price ratio', () => {
    expect(payCnyToCreditAmount(10, 1)).toBe(10)
    expect(payCnyToCreditAmount(70, 7)).toBe(10)
    expect(payCnyToCreditAmount(10, 0)).toBe(10)
  })

  test('defaults dialog pay amount to 10¥ when present in presets', () => {
    expect(getDefaultPayCnyAmount([10, 50, 100])).toBe(10)
    expect(getDefaultPayCnyAmount([50, 100])).toBe(50)
    expect(getDefaultPayCnyAmount([])).toBe(PAYMENT_CNY_MIN)
  })

  test('prefers wechat when listed in pay methods', () => {
    expect(
      getPreferredPaymentType({
        enable_online_topup: true,
        min_topup: 1,
        enable_stripe_topup: true,
        stripe_min_topup: 1,
        enable_waffo_topup: false,
        waffo_min_topup: 1,
        enable_waffo_pancake_topup: false,
        waffo_pancake_min_topup: 1,
        enable_creem_topup: false,
        enable_redemption: true,
        pay_methods: [
          { name: 'Alipay', type: PAYMENT_TYPES.ALIPAY },
          { name: 'WeChat', type: PAYMENT_TYPES.WECHAT },
          { name: 'Stripe', type: PAYMENT_TYPES.STRIPE },
        ],
        amount_options: [],
        discount: {},
      } as never)
    ).toBe(PAYMENT_TYPES.WECHAT)
  })
})
