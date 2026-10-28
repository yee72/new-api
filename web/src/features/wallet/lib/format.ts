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
import { POINTS_DISPLAY_SCALE } from '@/lib/currency'

import { DEFAULT_DISCOUNT_RATE } from '../constants'
import { payCnyToCreditAmount } from './payment'

// ============================================================================
// Wallet-specific Formatting Functions
// ============================================================================

/**
 * Format Creem price as display points (含全站展示倍率)
 */
export function formatCreemPrice(
  price: number,
  _currency?: 'USD' | 'EUR'
): string {
  return formatPointsAmount(price)
}

/**
 * Format a points amount without currency symbols ($/¥/€).
 * 含全站积分展示倍率。
 */
export function formatPointsAmount(amount: number | string): string {
  const numeric =
    typeof amount === 'number' ? amount : Number.parseFloat(String(amount))
  if (!Number.isFinite(numeric)) return '-'

  const display = numeric * POINTS_DISPLAY_SCALE
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(display) >= 1 ? 2 : 4,
  }).format(display)
}

/**
 * Format large quota numbers with K/M suffix
 */
export function formatQuotaShort(quota: number): string {
  if (quota >= 1000000) {
    return `${(quota / 1000000).toFixed(1)}M`
  }
  if (quota >= 1000) {
    return `${(quota / 1000).toFixed(1)}K`
  }
  return quota.toString()
}

/**
 * 实付人民币展示，如 10¥（不乘积分倍率）
 */
export function formatPayCNY(amount: number | string): string {
  const numeric =
    typeof amount === 'number' ? amount : Number.parseFloat(String(amount))
  if (!Number.isFinite(numeric)) return '-'

  const decimal = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(numeric) >= 1 ? 2 : 4,
  }).format(numeric)
  return `${decimal}¥`
}

/**
 * @deprecated 支付展示请用 formatPayCNY；保留别名避免旧调用瞬时报错
 */
export function formatCurrency(amount: number | string): string {
  return formatPayCNY(amount)
}

/**
 * Get discount label for display (e.g., "20% OFF")
 */
export function getDiscountLabel(discount: number): string {
  if (discount >= DEFAULT_DISCOUNT_RATE) {
    return ''
  }
  const off = Math.round((1 - discount) * 100)
  return `${off}% OFF`
}

/**
 * 人民币付款档定价：presetValue 为应付 ¥
 */
export function calculatePresetPricing(
  presetValue: number,
  priceRatio: number,
  discount: number,
  usdExchangeRate: number = 1
) {
  const creditAmount = payCnyToCreditAmount(presetValue, priceRatio)
  const originalPrice = presetValue
  const actualPrice = originalPrice * discount
  const savedAmount = originalPrice - actualPrice
  const hasDiscount = discount < 1.0
  // 展示积分 = 系统额度 × 汇率展示系数 × 全站倍率
  const displayValue =
    creditAmount * usdExchangeRate * POINTS_DISPLAY_SCALE

  return {
    displayValue,
    creditAmount,
    originalPrice,
    actualPrice,
    savedAmount,
    hasDiscount,
  }
}
