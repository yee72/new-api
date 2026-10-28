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
  PAYMENT_TYPES,
  DEFAULT_PRESET_MULTIPLIERS,
  DEFAULT_PAYMENT_TYPE,
  DEFAULT_MIN_TOPUP,
  PAYMENT_CNY_MIN,
  PAYMENT_CNY_MAX,
  PAYMENT_CNY_PRESETS,
  PAYMENT_POINTS_MIN,
  PAYMENT_POINTS_MAX,
} from '../constants'
import type { PaymentMethod, PresetAmount, TopupInfo } from '../types'

// ============================================================================
// Payment Processing Functions
// ============================================================================

/**
 * Check if browser is Safari
 */
function isSafariBrowser(): boolean {
  return (
    navigator.userAgent.includes('Safari') &&
    !navigator.userAgent.includes('Chrome')
  )
}

/**
 * Submit payment form (for non-Stripe payments)
 */
export function submitPaymentForm(
  url: string,
  params: Record<string, unknown>
): void {
  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'

  // Don't open in new tab for Safari
  if (!isSafariBrowser()) {
    form.target = '_blank'
  }

  // Add form parameters
  Object.entries(params).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = String(value)
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

/**
 * Check if payment method is Stripe
 */
export function isStripePayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.STRIPE
}

/**
 * Check if payment method is Waffo
 */
export function isWaffoPayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.WAFFO
}

/**
 * Check if payment method is Waffo Pancake
 *
 * Pancake is a metered-style payment that goes through a dedicated checkout
 * URL flow rather than the generic epay form submission, so it must be
 * special-cased in payment dispatch logic.
 */
export function isWaffoPancakePayment(paymentType: string): boolean {
  return paymentType === PAYMENT_TYPES.WAFFO_PANCAKE
}

export interface PaymentProcessors {
  regular: (topupAmount: number, paymentType: string) => Promise<boolean>
  waffo: (topupAmount: number, payMethodIndex: number) => Promise<boolean>
  waffoPancake: (topupAmount: number) => Promise<boolean>
}

export async function dispatchSelectedPayment(
  paymentMethod: PaymentMethod,
  topupAmount: number,
  waffoMethodIndex: number | null,
  processors: PaymentProcessors
): Promise<boolean> {
  if (isWaffoPayment(paymentMethod.type)) {
    if (waffoMethodIndex === null) {
      return false
    }
    return processors.waffo(topupAmount, waffoMethodIndex)
  }

  if (isWaffoPancakePayment(paymentMethod.type)) {
    return processors.waffoPancake(topupAmount)
  }

  return processors.regular(topupAmount, paymentMethod.type)
}

/**
 * Get default payment type from topup info
 */
export function getDefaultPaymentType(topupInfo: TopupInfo | null): string {
  if (!topupInfo) {
    return DEFAULT_PAYMENT_TYPE
  }

  // Return first available payment method or default
  if (topupInfo.pay_methods?.length > 0) {
    return topupInfo.pay_methods[0].type
  }

  if (topupInfo.enable_stripe_topup) {
    return PAYMENT_TYPES.STRIPE
  }

  if (topupInfo.enable_waffo_topup) {
    return PAYMENT_TYPES.WAFFO
  }

  if (topupInfo.enable_waffo_pancake_topup) {
    return PAYMENT_TYPES.WAFFO_PANCAKE
  }

  return DEFAULT_PAYMENT_TYPE
}

/**
 * 优先微信支付；不可用时尝试支付宝，再回退 getDefaultPaymentType
 */
export function getPreferredPaymentType(topupInfo: TopupInfo | null): string {
  const wechat = topupInfo?.pay_methods?.find(
    (method) => method.type === PAYMENT_TYPES.WECHAT
  )
  if (wechat) {
    return PAYMENT_TYPES.WECHAT
  }
  const alipay = topupInfo?.pay_methods?.find(
    (method) => method.type === PAYMENT_TYPES.ALIPAY
  )
  if (alipay) {
    return PAYMENT_TYPES.ALIPAY
  }
  return getDefaultPaymentType(topupInfo)
}

/**
 * 默认人民币付款档（10¥）；不在预设内则回退最低档
 */
export function getDefaultPayCnyAmount(presetValues: number[]): number {
  if (presetValues.includes(10)) {
    return 10
  }
  return presetValues[0] ?? PAYMENT_CNY_MIN
}

/**
 * Get server-configured minimum topup (未套用产品上下限)
 */
export function getServerMinTopupAmount(topupInfo: TopupInfo | null): number {
  if (!topupInfo) {
    return DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_online_topup) {
    return topupInfo.min_topup
  }

  if (topupInfo.enable_stripe_topup) {
    return topupInfo.stripe_min_topup
  }

  if (topupInfo.enable_waffo_topup) {
    return topupInfo.waffo_min_topup || DEFAULT_MIN_TOPUP
  }

  if (topupInfo.enable_waffo_pancake_topup) {
    return topupInfo.waffo_pancake_min_topup || DEFAULT_MIN_TOPUP
  }

  return DEFAULT_MIN_TOPUP
}

/**
 * 有效最低充值人民币（正整数）
 */
export function getMinTopupAmount(_topupInfo: TopupInfo | null): number {
  return PAYMENT_CNY_MIN
}

/**
 * 有效最高充值人民币
 */
export function getMaxTopupAmount(): number {
  return PAYMENT_CNY_MAX
}

/**
 * 人民币充值金额是否为 1～10000 的正整数
 */
export function isTopupAmountInBounds(
  amount: number,
  minAmount: number = PAYMENT_CNY_MIN,
  maxAmount: number = PAYMENT_CNY_MAX
): boolean {
  return (
    Number.isFinite(amount) &&
    Number.isInteger(amount) &&
    amount >= minAmount &&
    amount <= maxAmount
  )
}

/**
 * 人民币付款额 → 后端充值额度单位（Amount）
 * payMoney ≈ Amount × priceRatio，故 Amount = payCNY / priceRatio
 */
export function payCnyToCreditAmount(
  payCny: number,
  priceRatio: number = 1
): number {
  const ratio = Number.isFinite(priceRatio) && priceRatio > 0 ? priceRatio : 1
  return payCny / ratio
}

/**
 * 按充值边界过滤预设档位
 */
export function filterPresetAmountsByBounds(
  presets: PresetAmount[],
  minAmount: number,
  maxAmount: number = PAYMENT_CNY_MAX
): PresetAmount[] {
  return presets.filter(
    (preset) =>
      Number.isFinite(preset.value) &&
      preset.value >= minAmount &&
      preset.value <= maxAmount
  )
}

/**
 * 生成产品固定人民币付款档，并套用折扣表（键为付款档金额）
 */
export function generateCnyPresetAmounts(
  discounts: Record<number, number> = {}
): PresetAmount[] {
  return resolveCnyPresetAmounts([], discounts)
}

/**
 * 优先使用支付网关「充值金额选项」；为空时回退产品默认档
 */
export function resolveCnyPresetAmounts(
  amountOptions: number[] = [],
  discounts: Record<number, number> = {}
): PresetAmount[] {
  const source =
    amountOptions.length > 0
      ? [...amountOptions].sort((a, b) => a - b)
      : [...PAYMENT_CNY_PRESETS]
  return filterPresetAmountsByBounds(
    source.map((value) => ({
      value,
      discount: discounts[value] || 1.0,
    })),
    PAYMENT_CNY_MIN
  )
}

/**
 * Generate preset amounts based on minimum topup
 * @deprecated 优先使用 generateCnyPresetAmounts
 */
export function generatePresetAmounts(minAmount: number): PresetAmount[] {
  return filterPresetAmountsByBounds(
    DEFAULT_PRESET_MULTIPLIERS.map((multiplier) => ({
      value: minAmount * multiplier,
    })),
    minAmount
  )
}

/**
 * Merge custom preset amounts with discounts
 */
export function mergePresetAmounts(
  amountOptions: number[],
  discounts: Record<number, number>
): PresetAmount[] {
  if (!amountOptions || amountOptions.length === 0) {
    return []
  }

  return amountOptions.map((amount) => ({
    value: amount,
    discount: discounts[amount] || 1.0,
  }))
}

// 兼容旧测试 / 引用
export { PAYMENT_POINTS_MIN, PAYMENT_POINTS_MAX, PAYMENT_CNY_MIN, PAYMENT_CNY_MAX }
