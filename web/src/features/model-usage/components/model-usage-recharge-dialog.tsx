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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getSelf } from '@/lib/api'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { CreemConfirmDialog } from '@/features/wallet/components/dialogs/creem-confirm-dialog'
import { PaymentQrDialog } from '@/features/wallet/components/dialogs/payment-qr-dialog'
import { RechargeFormCard } from '@/features/wallet/components/recharge-form-card'
import { PAYMENT_TYPES } from '@/features/wallet/constants'
import {
  useCreemPayment,
  usePayment,
  useTopupInfo,
  useWaffoPancakePayment,
  useWaffoPayment,
} from '@/features/wallet/hooks'
import {
  dispatchSelectedPayment,
  getDefaultPayCnyAmount,
  getMaxTopupAmount,
  getMinTopupAmount,
  getPreferredPaymentType,
  isTopupAmountInBounds,
  payCnyToCreditAmount,
} from '@/features/wallet/lib'
import type {
  CreemProduct,
  PaymentMethod,
  PresetAmount,
  WaffoPayMethod,
} from '@/features/wallet/types'

type ModelUsageRechargeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBalanceUpdated?: () => void
}

export function ModelUsageRechargeDialog(props: ModelUsageRechargeDialogProps) {
  const { t } = useTranslation()
  const setUser = useAuthStore((state) => state.auth.setUser)
  const { status } = useStatus()
  const { currency } = useSystemConfig()
  const { topupInfo, presetAmounts, loading: topupLoading } = useTopupInfo()
  const priceRatio = (status?.price as number) || 1
  const effectiveUsdExchangeRate = useMemo(() => {
    return currency?.quotaDisplayType === 'USD'
      ? 1
      : currency?.usdExchangeRate || 1
  }, [currency?.quotaDisplayType, currency?.usdExchangeRate])

  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>()
  const [selectedWaffoMethodIndex, setSelectedWaffoMethodIndex] = useState<
    number | null
  >(null)
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [creemDialogOpen, setCreemDialogOpen] = useState(false)
  const [selectedCreemProduct, setSelectedCreemProduct] =
    useState<CreemProduct | null>(null)

  const {
    amount: paymentAmount,
    calculating,
    processing,
    qrSession,
    calculatePaymentAmount,
    processPayment,
    clearQrSession,
  } = usePayment()
  const { processing: creemProcessing, processCreemPayment } = useCreemPayment()
  const { processing: waffoProcessing, processWaffoPayment } = useWaffoPayment()
  const { processing: pancakeProcessing, processWaffoPancakePayment } =
    useWaffoPancakePayment()

  const toCreditAmount = useCallback(
    (payCny: number) => payCnyToCreditAmount(payCny, priceRatio),
    [priceRatio]
  )

  const refreshBalance = useCallback(async () => {
    try {
      const response = await getSelf()
      if (!response?.success || !response.data) return
      const current = useAuthStore.getState().auth.user
      if (!current) return
      setUser({ ...current, ...(response.data as AuthUser) })
      props.onBalanceUpdated?.()
    } catch {
      // 余额刷新失败不影响支付结果提示
    }
  }, [props, setUser])

  const initializedForOpenRef = useRef(false)
  useEffect(() => {
    if (!props.open) {
      initializedForOpenRef.current = false
      return
    }
    if (!topupInfo || initializedForOpenRef.current) return
    initializedForOpenRef.current = true

    const defaultPayCny = getDefaultPayCnyAmount(
      presetAmounts.map((item) => item.value)
    )
    setTopupAmount(defaultPayCny)
    setSelectedPreset(defaultPayCny)

    const preferredType = getPreferredPaymentType(topupInfo)
    const preferredMethod = topupInfo.pay_methods?.find(
      (method) => method.type === preferredType
    )
    if (preferredMethod) {
      setSelectedPaymentMethod(preferredMethod)
    }
    void calculatePaymentAmount(toCreditAmount(defaultPayCny), preferredType)
  }, [
    props.open,
    topupInfo,
    presetAmounts,
    calculatePaymentAmount,
    toCreditAmount,
  ])

  const getCurrentPaymentType = useCallback(() => {
    return (
      selectedPaymentMethod?.type || getPreferredPaymentType(topupInfo)
    )
  }, [selectedPaymentMethod, topupInfo])

  const handleSelectPreset = (preset: PresetAmount) => {
    setTopupAmount(preset.value)
    setSelectedPreset(preset.value)
    void calculatePaymentAmount(
      toCreditAmount(preset.value),
      getCurrentPaymentType()
    )
  }

  const handleTopupAmountChange = (amount: number) => {
    setTopupAmount(amount)
    setSelectedPreset(null)
    if (isTopupAmountInBounds(amount)) {
      void calculatePaymentAmount(
        toCreditAmount(amount),
        getCurrentPaymentType()
      )
    }
  }

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method)
    setSelectedWaffoMethodIndex(null)
    if (isTopupAmountInBounds(topupAmount)) {
      void calculatePaymentAmount(toCreditAmount(topupAmount), method.type)
    }
  }

  const handleWaffoMethodSelect = (
    method: WaffoPayMethod,
    index: number
  ) => {
    setSelectedPaymentMethod({
      name: method.name,
      type: PAYMENT_TYPES.WAFFO,
      icon: method.icon,
    })
    setSelectedWaffoMethodIndex(index)
    if (isTopupAmountInBounds(topupAmount)) {
      void calculatePaymentAmount(
        toCreditAmount(topupAmount),
        PAYMENT_TYPES.WAFFO
      )
    }
  }

  const handleConfirmPay = async () => {
    if (!selectedPaymentMethod) {
      toast.error(t('Please select a payment method'))
      return
    }
    const minTopup = getMinTopupAmount(topupInfo)
    if (!isTopupAmountInBounds(topupAmount, minTopup, getMaxTopupAmount())) {
      toast.error(t('Please enter a valid amount'))
      return
    }

    setPaymentLoading(selectedPaymentMethod.type)
    try {
      await dispatchSelectedPayment(
        selectedPaymentMethod,
        toCreditAmount(topupAmount),
        selectedWaffoMethodIndex,
        {
          regular: processPayment,
          waffo: processWaffoPayment,
          waffoPancake: processWaffoPancakePayment,
        }
      )
    } finally {
      setPaymentLoading(null)
    }
  }

  const handleCreemProductSelect = (product: CreemProduct) => {
    setSelectedCreemProduct(product)
    setCreemDialogOpen(true)
  }

  const handleCreemConfirm = async () => {
    if (!selectedCreemProduct) return
    const success = await processCreemPayment(selectedCreemProduct.productId)
    if (success) {
      setCreemDialogOpen(false)
      setSelectedCreemProduct(null)
      await refreshBalance()
    }
  }

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Recharge')}
        showCloseButton
        contentClassName='sm:max-w-lg'
        contentHeight='auto'
        bodyClassName='pt-1'
      >
        <RechargeFormCard
          embedded
          hideRedemption
          topupInfo={topupInfo}
          presetAmounts={presetAmounts}
          selectedPreset={selectedPreset}
          onSelectPreset={handleSelectPreset}
          topupAmount={topupAmount}
          onTopupAmountChange={handleTopupAmountChange}
          paymentAmount={paymentAmount}
          calculating={calculating}
          selectedPaymentMethod={selectedPaymentMethod}
          onPaymentMethodSelect={handlePaymentMethodSelect}
          paymentLoading={paymentLoading}
          redemptionCode=''
          onRedemptionCodeChange={() => undefined}
          onRedeem={() => undefined}
          redeeming={false}
          loading={topupLoading}
          priceRatio={priceRatio}
          usdExchangeRate={effectiveUsdExchangeRate}
          creemProducts={topupInfo?.creem_products}
          enableCreemTopup={topupInfo?.enable_creem_topup}
          onCreemProductSelect={handleCreemProductSelect}
          enableWaffoTopup={topupInfo?.enable_waffo_topup}
          waffoPayMethods={topupInfo?.waffo_pay_methods}
          waffoMinTopup={topupInfo?.waffo_min_topup}
          onWaffoMethodSelect={handleWaffoMethodSelect}
          enableWaffoPancakeTopup={topupInfo?.enable_waffo_pancake_topup}
          confirming={processing || waffoProcessing || pancakeProcessing}
          onConfirmPay={() => void handleConfirmPay()}
        />
      </Dialog>

      <PaymentQrDialog
        open={!!qrSession}
        session={qrSession}
        onOpenChange={(open) => {
          if (!open) clearQrSession()
        }}
        onPaid={() => {
          clearQrSession()
          void refreshBalance()
        }}
      />

      <CreemConfirmDialog
        open={creemDialogOpen}
        onOpenChange={setCreemDialogOpen}
        product={selectedCreemProduct}
        processing={creemProcessing}
        onConfirm={() => void handleCreemConfirm()}
      />
    </>
  )
}
