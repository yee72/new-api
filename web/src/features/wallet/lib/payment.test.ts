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
import { describe, expect, test } from 'vitest'

import {
  PAYMENT_POINTS_MAX,
  PAYMENT_POINTS_MIN,
  PAYMENT_TYPES,
} from '../constants'
import {
  dispatchSelectedPayment,
  filterPresetAmountsByBounds,
  generatePresetAmounts,
  getMaxTopupAmount,
  getMinTopupAmount,
  isStripePayment,
  isTopupAmountInBounds,
  isWaffoPayment,
  isWaffoPancakePayment,
} from './payment'

describe('payment type classification', () => {
  test('keeps Waffo and Waffo Pancake on their dedicated flows', () => {
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO)).toBe(true)
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(false)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(true)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO)).toBe(false)
    expect(isStripePayment(PAYMENT_TYPES.STRIPE)).toBe(true)
  })
})

describe('payment points bounds', () => {
  test('enforces product min and max for topup points', () => {
    expect(getMinTopupAmount(null)).toBe(PAYMENT_POINTS_MIN)
    expect(
      getMinTopupAmount({
        enable_online_topup: true,
        min_topup: 1,
        enable_stripe_topup: false,
        stripe_min_topup: 1,
        enable_waffo_topup: false,
        enable_waffo_pancake_topup: false,
        enable_creem_topup: false,
        enable_redemption: true,
        pay_methods: [],
        amount_options: [],
        discount: {},
      } as never)
    ).toBe(PAYMENT_POINTS_MIN)
    expect(getMaxTopupAmount()).toBe(PAYMENT_POINTS_MAX)
    expect(isTopupAmountInBounds(0.1, PAYMENT_POINTS_MIN)).toBe(true)
    expect(isTopupAmountInBounds(0.09, PAYMENT_POINTS_MIN)).toBe(false)
    expect(isTopupAmountInBounds(10000, PAYMENT_POINTS_MIN)).toBe(true)
    expect(isTopupAmountInBounds(10000.1, PAYMENT_POINTS_MIN)).toBe(false)
  })

  test('filters preset amounts outside the payment points bounds', () => {
    expect(
      filterPresetAmountsByBounds(
        [{ value: 0.05 }, { value: 1 }, { value: 500 }, { value: 20000 }],
        PAYMENT_POINTS_MIN
      )
    ).toEqual([{ value: 1 }, { value: 500 }])
    expect(generatePresetAmounts(PAYMENT_POINTS_MIN).every((preset) =>
      isTopupAmountInBounds(preset.value, PAYMENT_POINTS_MIN)
    )).toBe(true)
  })
})

describe('payment dispatch', () => {
  test('keeps the selected Waffo method index through confirmation', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      { name: 'Waffo Card', type: PAYMENT_TYPES.WAFFO },
      120,
      3,
      {
        regular: async () => {
          calls.push('regular')
          return false
        },
        waffo: async (amount, index) => {
          calls.push(`waffo:${amount}:${index}`)
          return true
        },
        waffoPancake: async () => {
          calls.push('pancake')
          return false
        },
      }
    )

    expect(success).toBe(true)
    expect(calls).toEqual(['waffo:120:3'])
  })

  test('does not create a Waffo order without a selected method index', async () => {
    let called = false
    const success = await dispatchSelectedPayment(
      { name: 'Waffo Card', type: PAYMENT_TYPES.WAFFO },
      120,
      null,
      {
        regular: async () => false,
        waffo: async () => {
          called = true
          return true
        },
        waffoPancake: async () => false,
      }
    )

    expect(success).toBe(false)
    expect(called).toBe(false)
  })
})
