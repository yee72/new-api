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
import { Link } from '@tanstack/react-router'
import { Gift, ExternalLink, Loader2, Receipt, WalletCards } from 'lucide-react'
import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { POINTS_DISPLAY_SCALE } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import { PAYMENT_CNY_MAX, PAYMENT_CNY_MIN } from '../constants'
import {
  formatPayCNY,
  getPaymentIcon,
  getMinTopupAmount,
  getMaxTopupAmount,
  isTopupAmountInBounds,
  calculatePresetPricing,
  payCnyToCreditAmount,
} from '../lib'
import type {
  PaymentMethod,
  PresetAmount,
  TopupInfo,
  CreemProduct,
  WaffoPayMethod,
} from '../types'
import { CreemProductsSection } from './creem-products-section'

interface RechargeFormCardProps {
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  selectedPreset: number | null
  onSelectPreset: (preset: PresetAmount) => void
  topupAmount: number
  onTopupAmountChange: (amount: number) => void
  paymentAmount: number
  calculating: boolean
  onPaymentMethodSelect: (method: PaymentMethod) => void
  /** 当前选中的支付方式（单选，确认后再下单） */
  selectedPaymentMethod?: PaymentMethod
  paymentLoading: string | null
  redemptionCode: string
  onRedemptionCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  topupLink?: string
  loading?: boolean
  priceRatio?: number
  usdExchangeRate?: number
  onOpenBilling?: () => void
  creemProducts?: CreemProduct[]
  enableCreemTopup?: boolean
  onCreemProductSelect?: (product: CreemProduct) => void
  enableWaffoTopup?: boolean
  waffoPayMethods?: WaffoPayMethod[]
  waffoMinTopup?: number
  onWaffoMethodSelect?: (method: WaffoPayMethod, index: number) => void
  enableWaffoPancakeTopup?: boolean
  /** 嵌入弹窗：无外层卡片标题 / 订单历史 */
  embedded?: boolean
  /** 隐藏兑换码区（由外层 Tab 承载） */
  hideRedemption?: boolean
  /** 展示协议与确认充值（确认按钮在支付方式右侧） */
  showActionFooter?: boolean
  confirming?: boolean
  onConfirmPay?: () => void
}

export function RechargeFormCard({
  topupInfo,
  presetAmounts,
  selectedPreset,
  onSelectPreset,
  topupAmount,
  onTopupAmountChange,
  paymentAmount: _paymentAmount,
  calculating,
  onPaymentMethodSelect,
  selectedPaymentMethod,
  paymentLoading,
  redemptionCode,
  onRedemptionCodeChange,
  onRedeem,
  redeeming,
  topupLink,
  loading,
  priceRatio = 1,
  usdExchangeRate = 1,
  onOpenBilling,
  creemProducts,
  enableCreemTopup,
  onCreemProductSelect,
  enableWaffoTopup,
  waffoPayMethods,
  onWaffoMethodSelect,
  enableWaffoPancakeTopup,
  embedded = false,
  hideRedemption = false,
  showActionFooter = true,
  confirming = false,
  onConfirmPay,
}: RechargeFormCardProps) {
  const { t } = useTranslation()
  const [localAmount, setLocalAmount] = useState(topupAmount.toString())

  useEffect(() => {
    // Empty string must survive, otherwise the field can never be cleared
    setLocalAmount((prev) =>
      prev === '' && topupAmount === 0 ? prev : topupAmount.toString()
    )
  }, [topupAmount])

  const handleAmountChange = (value: string) => {
    // 自定义金额仅允许正整数人民币；限制位数防止溢出输入
    const trimmed = value.trim()
    if (trimmed === '') {
      setLocalAmount(value)
      onTopupAmountChange(0)
      return
    }
    if (!/^\d+$/.test(trimmed) || trimmed.length > 5) {
      return
    }
    setLocalAmount(trimmed)
    const numValue = Number.parseInt(trimmed, 10)
    if (Number.isFinite(numValue) && numValue >= 0) {
      onTopupAmountChange(numValue)
    }
  }

  const hasConfigurableTopup =
    topupInfo?.enable_online_topup ||
    topupInfo?.enable_stripe_topup ||
    enableWaffoTopup ||
    enableWaffoPancakeTopup
  const hasAnyTopup = hasConfigurableTopup || enableCreemTopup
  const hasStandardPaymentMethods =
    Array.isArray(topupInfo?.pay_methods) && topupInfo.pay_methods.length > 0
  const hasWaffoPaymentMethods =
    Array.isArray(waffoPayMethods) && waffoPayMethods.length > 0
  const minTopup = getMinTopupAmount(topupInfo)
  const maxTopup = getMaxTopupAmount()
  const amountInBounds = isTopupAmountInBounds(topupAmount, minTopup, maxTopup)
  const trimmedLocalAmount = localAmount.trim()
  const parsedLocalAmount = Number.parseInt(trimmedLocalAmount, 10)
  const creditAmount = payCnyToCreditAmount(topupAmount, priceRatio)
  const receivePointsDisplay = Number.isFinite(creditAmount)
    ? creditAmount * usdExchangeRate * POINTS_DISPLAY_SCALE
    : 0
  const customAmountError = (() => {
    if (trimmedLocalAmount === '') {
      return t('Please enter the payment amount in CNY')
    }
    if (!/^\d+$/.test(trimmedLocalAmount) || !Number.isFinite(parsedLocalAmount)) {
      return t('Please enter a positive integer')
    }
    if (parsedLocalAmount < minTopup || parsedLocalAmount > maxTopup) {
      return t('Payment amount must be an integer between {{min}} and {{max}}', {
        min: minTopup,
        max: maxTopup,
      })
    }
    return null
  })()
  const redemptionEnabled = topupInfo?.enable_redemption !== false

  if (loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4 p-3 sm:space-y-6 sm:p-5'>
          <div className='space-y-4 sm:space-y-6'>
            {/* Preset Amounts Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-16' />
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                {Array.from({ length: 8 }, (_, index) => `preset-${index}`).map(
                  (key) => (
                    <Skeleton key={key} className='h-[72px] rounded-lg' />
                  )
                )}
              </div>
            </div>

            {/* Custom Amount Input Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-28' />
              <Skeleton className='h-[42px] w-full' />
            </div>

            {/* Payment Methods Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-32' />
              <div className='flex flex-wrap gap-3'>
                {['primary', 'secondary', 'tertiary'].map((key) => (
                  <Skeleton key={key} className='h-10 w-24 rounded-lg' />
                ))}
              </div>
            </div>
          </div>

          {/* Redemption Code Section Skeleton */}
          <div className='space-y-3 border-t pt-8'>
            <Skeleton className='h-3 w-24' />
            <div className='flex gap-2'>
              <Skeleton className='h-10 flex-1' />
              <Skeleton className='h-10 w-20' />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  let redemptionSection: ReactNode = null
  if (!hideRedemption) {
    if (redemptionEnabled) {
      redemptionSection = (
        <div className='space-y-2.5 border-t pt-4 sm:space-y-3 sm:pt-6'>
          <div className='flex items-center gap-2'>
            <IconBadge tone='warning' size='xs'>
              <Gift />
            </IconBadge>
            <Label
              htmlFor='redemption-code'
              className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
            >
              {t('Have a Code?')}
            </Label>
          </div>
          <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
            <Input
              id='redemption-code'
              value={redemptionCode}
              onChange={(e) => onRedemptionCodeChange(e.target.value)}
              placeholder={t('Enter your redemption code')}
              className='h-9 min-w-0'
            />
            <Button
              onClick={onRedeem}
              disabled={redeeming}
              variant='outline'
              className='h-9 px-4'
            >
              {redeeming && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('Redeem')}
            </Button>
          </div>
          {topupLink && (
            <p className='text-muted-foreground text-xs'>
              {t('Need a redemption code?')}{' '}
              <a
                href={topupLink}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
              >
                {t('Get one here')}
                <ExternalLink className='h-3 w-3' />
              </a>
            </p>
          )}
        </div>
      )
    } else {
      redemptionSection = (
        <Alert className='border-t'>
          <AlertDescription>
            {t(
              'Redemption codes are disabled until the administrator confirms compliance terms.'
            )}
          </AlertDescription>
        </Alert>
      )
    }
  }

  const formBody = (
    <>
      {/* Online Topup Section */}
      {hasAnyTopup ? (
        <div className={cn(embedded ? 'space-y-3' : 'space-y-4 sm:space-y-6')}>
          {hasConfigurableTopup && (
            <>
              {presetAmounts.length > 0 && (
                <div className='space-y-2 sm:space-y-2.5'>
                  <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                    {t('Payment amount')}
                  </Label>
                  <div className='grid grid-cols-4 gap-1.5 sm:gap-2'>
                    {presetAmounts.map((preset) => {
                      const discount =
                        preset.discount ||
                        topupInfo?.discount?.[preset.value] ||
                        1.0
                      // 仅用于展示到账积分；不展示活动角标 / 折扣文案
                      const { displayValue } = calculatePresetPricing(
                        preset.value,
                        priceRatio,
                        discount,
                        usdExchangeRate
                      )
                      return (
                        <Button
                          key={preset.value}
                          variant='outline'
                          className={cn(
                            'flex min-h-16 flex-col items-start rounded-lg px-2.5 py-2.5 text-left whitespace-normal sm:min-h-[72px] sm:px-3 sm:py-3',
                            selectedPreset === preset.value
                              ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                              : 'border-muted'
                          )}
                          onClick={() => onSelectPreset(preset)}
                        >
                          <div className='text-base font-semibold sm:text-lg'>
                            {formatPayCNY(preset.value)}
                          </div>
                          <div className='text-muted-foreground mt-1.5 w-full truncate text-xs sm:mt-2'>
                            {t('{{amount}} credits', {
                              amount: formatNumber(displayValue),
                            })}
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className='space-y-2 sm:space-y-2.5'>
                <Label
                  htmlFor='topup-amount'
                  className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
                >
                  {t('Custom amount (¥)')}
                </Label>
                <div className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2'>
                  <Input
                    id='topup-amount'
                    type='number'
                    inputMode='numeric'
                    value={localAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    min={PAYMENT_CNY_MIN}
                    max={PAYMENT_CNY_MAX}
                    step={1}
                    maxLength={5}
                    placeholder={`${PAYMENT_CNY_MIN} – ${PAYMENT_CNY_MAX}`}
                    aria-invalid={!!customAmountError}
                    className='h-9 text-base sm:h-10 sm:text-lg'
                  />
                  <div className='bg-muted/30 flex h-9 min-w-24 items-center justify-center rounded-md border px-3 sm:h-10'>
                    {calculating ? (
                      <Skeleton className='h-5 w-14' />
                    ) : (
                      <span className='text-sm font-semibold tabular-nums'>
                        {t('{{amount}} credits', {
                          amount: formatNumber(receivePointsDisplay),
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Custom top-up supports integers from 1 to 10000 CNY'
                  )}
                </p>
                {customAmountError ? (
                  <p className='text-destructive text-xs' role='alert'>
                    {customAmountError}
                  </p>
                ) : null}
              </div>

              <div className='space-y-2 sm:space-y-2.5'>
                <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                  {t('Payment Method')}
                </Label>
                <div className='flex flex-col gap-2 sm:flex-row sm:items-stretch'>
                {hasStandardPaymentMethods ? (
                  <div className='flex min-w-0 flex-1 flex-wrap gap-1.5 sm:gap-2'>
                    {topupInfo?.pay_methods?.map((method) => {
                      // 产品边界覆盖服务端全局下限；支付方式若显式配置更高下限仍按 ¥ 生效
                      const methodMin = Math.max(
                        PAYMENT_CNY_MIN,
                        method.min_topup || 0
                      )
                      const belowMin = topupAmount < methodMin
                      const aboveMax = topupAmount > maxTopup
                      const disabled =
                        !amountInBounds || belowMin || aboveMax
                      let disabledReason: string | undefined
                      let disabledLabel: string | undefined
                      if (!amountInBounds) {
                        disabledReason = t(
                          'Payment amount must be an integer between {{min}} and {{max}}',
                          {
                            min: minTopup,
                            max: maxTopup,
                          }
                        )
                        disabledLabel = `${minTopup} – ${maxTopup}¥`
                      } else if (belowMin) {
                        disabledReason = t(
                          'Minimum top-up amount: {{amount}}¥',
                          {
                            amount: methodMin,
                          }
                        )
                        disabledLabel = `${t('Minimum:')} ${methodMin}¥`
                      } else if (aboveMax) {
                        disabledReason = t(
                          'Maximum top-up amount: {{amount}}¥',
                          {
                            amount: maxTopup,
                          }
                        )
                        disabledLabel = `${t('Maximum:')} ${maxTopup}¥`
                      }

                      const selected =
                        selectedPaymentMethod?.type === method.type
                      const button = (
                        <Button
                          key={method.type}
                          variant='outline'
                          onClick={() => onPaymentMethodSelect(method)}
                          disabled={disabled || !!paymentLoading}
                          title={disabledReason}
                          aria-pressed={selected}
                          aria-label={
                            disabledReason
                              ? `${method.name}. ${disabledReason}`
                              : method.name
                          }
                          className={cn(
                            'min-h-14 min-w-[9.5rem] flex-1 justify-start gap-2 rounded-lg px-3 py-2 text-left sm:min-w-[11rem]',
                            selected &&
                              'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40'
                          )}
                        >
                          {paymentLoading === method.type ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          ) : (
                            getPaymentIcon(
                              method.type,
                              'h-4 w-4',
                              method.icon,
                              method.name
                            )
                          )}
                          <span className='flex min-w-0 flex-1 flex-col items-start gap-0.5'>
                            <span className='max-w-full truncate'>
                              {method.name}
                            </span>
                            {disabledLabel && (
                              <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                {disabledLabel}
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              'ml-auto size-4 shrink-0 rounded-full border',
                              selected
                                ? 'border-emerald-500 bg-emerald-500'
                                : 'border-muted-foreground/40'
                            )}
                            aria-hidden
                          />
                        </Button>
                      )

                      return disabled ? (
                        <TooltipProvider key={method.type}>
                          <Tooltip>
                            <TooltipTrigger render={button} />
                            <TooltipContent>{disabledReason}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        button
                      )
                    })}
                  </div>
                ) : null}
                {showActionFooter ? (
                  <Button
                    type='button'
                    className='h-14 w-full shrink-0 bg-emerald-500 px-5 text-white hover:bg-emerald-600 sm:w-auto sm:min-w-28'
                    onClick={onConfirmPay}
                    disabled={
                      confirming ||
                      !amountInBounds ||
                      !selectedPaymentMethod ||
                      calculating
                    }
                  >
                    {confirming && (
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    )}
                    <span className='text-sm font-semibold'>
                      {t('Confirm recharge')}
                    </span>
                  </Button>
                ) : null}
                </div>
                {!hasStandardPaymentMethods && !hasWaffoPaymentMethods && (
                  <Alert>
                    <AlertDescription>
                      {t(
                        'No payment methods available. Please contact administrator.'
                      )}
                    </AlertDescription>
                  </Alert>
                )}
                {showActionFooter ? (
                  <p className='text-muted-foreground text-xs leading-relaxed'>
                    {t('By paying you agree to the')}{' '}
                    <Link
                      to='/user-agreement'
                      className='text-emerald-600 underline-offset-4 hover:underline'
                    >
                      {t('User Agreement')}
                    </Link>
                    {t(' and ')}
                    <button
                      type='button'
                      className='text-emerald-600 underline-offset-4 hover:underline'
                      onClick={() =>
                        toast.message(t('Refund policy coming soon'))
                      }
                    >
                      {t('Refund Policy')}
                    </button>
                  </p>
                ) : null}
              </div>

              {enableWaffoTopup &&
                hasWaffoPaymentMethods &&
                onWaffoMethodSelect && (
                  <div className='space-y-2.5 sm:space-y-3'>
                    <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                      {t('Waffo Payment')}
                    </Label>
                    <div className='grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-3'>
                      {waffoPayMethods?.map((method, index) => {
                        const loadingKey = `waffo-${index}`
                        const methodKey = `${method.payMethodType ?? 'unknown'}-${method.payMethodName ?? method.name}`
                        // Waffo 同样以产品下限为准，忽略服务端抬高的 min_topup
                        const waffoMin = minTopup
                        const belowMin = topupAmount < waffoMin
                        const aboveMax = topupAmount > maxTopup
                        const disabled =
                          !amountInBounds || belowMin || aboveMax
                        let disabledReason: string | undefined
                        let disabledLabel: string | undefined
                        if (!amountInBounds) {
                          disabledReason = t(
                            'Payment amount must be an integer between {{min}} and {{max}}',
                            {
                              min: minTopup,
                              max: maxTopup,
                            }
                          )
                          disabledLabel = `${minTopup} – ${maxTopup}¥`
                        } else if (belowMin) {
                          disabledReason = t(
                            'Minimum top-up amount: {{amount}}¥',
                            {
                              amount: waffoMin,
                            }
                          )
                          disabledLabel = `${t('Minimum:')} ${waffoMin}¥`
                        } else if (aboveMax) {
                          disabledReason = t(
                            'Maximum top-up amount: {{amount}}¥',
                            {
                              amount: maxTopup,
                            }
                          )
                          disabledLabel = `${t('Maximum:')} ${maxTopup}¥`
                        }

                        let methodIcon = getPaymentIcon('waffo')
                        if (paymentLoading === loadingKey) {
                          methodIcon = (
                            <Loader2 className='h-4 w-4 animate-spin' />
                          )
                        } else if (method.icon) {
                          methodIcon = (
                            <img
                              src={method.icon}
                              alt={method.name}
                              className='h-4 w-4 object-contain'
                            />
                          )
                        }

                        const button = (
                          <Button
                            key={methodKey}
                            variant='outline'
                            onClick={() => onWaffoMethodSelect(method, index)}
                            disabled={disabled || !!paymentLoading}
                            title={disabledReason}
                            aria-label={
                              disabledReason
                                ? `${method.name}. ${disabledReason}`
                                : method.name
                            }
                            className='min-h-14 min-w-0 justify-start gap-2 rounded-lg px-3 py-2 text-left'
                          >
                            {methodIcon}
                            <span className='flex min-w-0 flex-col items-start gap-0.5'>
                              <span className='max-w-full truncate'>
                                {method.name}
                              </span>
                              {disabledLabel && (
                                <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                  {disabledLabel}
                                </span>
                              )}
                            </span>
                          </Button>
                        )

                        return disabled ? (
                          <TooltipProvider key={methodKey}>
                            <Tooltip>
                              <TooltipTrigger render={button} />
                              <TooltipContent>{disabledReason}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          button
                        )
                      })}
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      ) : (
        <Alert>
          <AlertDescription>
            {t(
              'Online topup is not enabled. Please use redemption code or contact administrator.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Creem Products Section */}
      {enableCreemTopup &&
        Array.isArray(creemProducts) &&
        creemProducts.length > 0 &&
        onCreemProductSelect && (
          <div className='space-y-2.5 border-t pt-4 sm:space-y-3 sm:pt-6'>
            <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
              {t('Creem Payment')}
            </Label>
            <CreemProductsSection
              products={creemProducts}
              onProductSelect={onCreemProductSelect}
            />
          </div>
        )}

      {/* Redemption Code Section */}
      {redemptionSection}
    </>
  )

  if (embedded) {
    return <div className='space-y-3'>{formBody}</div>
  }

  return (
    <TitledCard
      title={t('Add Funds')}
      description={t('Choose a payment amount and method')}
      icon={<WalletCards className='h-4 w-4' />}
      iconTone='success'
      disableHoverEffect
      action={
        onOpenBilling ? (
          <Button
            variant='outline'
            size='sm'
            onClick={onOpenBilling}
            className='w-full gap-2 sm:w-auto'
          >
            <Receipt className='h-4 w-4' />
            {t('Order History')}
          </Button>
        ) : null
      }
      contentClassName='space-y-4 sm:space-y-6'
    >
      {formBody}
    </TitledCard>
  )
}
