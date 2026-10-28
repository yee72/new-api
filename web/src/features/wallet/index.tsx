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
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getSelf } from '@/lib/api'

import { AffiliateRewardsCard } from './components/affiliate-rewards-card'
import { BillingHistoryDialog } from './components/dialogs/billing-history-dialog'
import { CreemConfirmDialog } from './components/dialogs/creem-confirm-dialog'
import { PaymentQrDialog } from './components/dialogs/payment-qr-dialog'
import { TransferDialog } from './components/dialogs/transfer-dialog'
import { RechargeFormCard } from './components/recharge-form-card'
import { SubscriptionPlansCard } from './components/subscription-plans-card'
import { WalletStatsCard } from './components/wallet-stats-card'
import { PAYMENT_TYPES } from './constants'
import {
  useTopupInfo,
  usePayment,
  useAffiliate,
  useRedemption,
  useCreemPayment,
  useWaffoPayment,
  useWaffoPancakePayment,
} from './hooks'
import {
  getPreferredPaymentType,
  getDefaultPayCnyAmount,
  getMinTopupAmount,
  getMaxTopupAmount,
  isTopupAmountInBounds,
  dispatchSelectedPayment,
  payCnyToCreditAmount,
} from './lib'
import type {
  UserWalletData,
  PaymentMethod,
  PresetAmount,
  CreemProduct,
  WaffoPayMethod,
} from './types'

interface WalletProps {
  initialShowHistory?: boolean
}

export function Wallet(props: WalletProps) {
  const { t } = useTranslation()
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>()
  const [selectedWaffoMethodIndex, setSelectedWaffoMethodIndex] = useState<
    number | null
  >(null)
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)
  const [redemptionCode, setRedemptionCode] = useState('')
  const [creemDialogOpen, setCreemDialogOpen] = useState(false)
  const [selectedCreemProduct, setSelectedCreemProduct] =
    useState<CreemProduct | null>(null)
  const [showSubscriptionPanel, setShowSubscriptionPanel] = useState(true)

  const { status } = useStatus()
  const { currency } = useSystemConfig()
  const { topupInfo, presetAmounts, loading: topupLoading } = useTopupInfo()
  const priceRatio = (status?.price as number) || 1

  const effectiveUsdExchangeRate = useMemo(() => {
    return currency?.quotaDisplayType === 'USD'
      ? 1
      : currency?.usdExchangeRate || 1
  }, [currency?.quotaDisplayType, currency?.usdExchangeRate])
  const {
    amount: paymentAmount,
    calculating,
    processing,
    qrSession,
    calculatePaymentAmount,
    processPayment,
    clearQrSession,
  } = usePayment()

  const toCreditAmount = useCallback(
    (payCny: number) => payCnyToCreditAmount(payCny, priceRatio),
    [priceRatio]
  )
  const {
    affiliateLink,
    loading: affiliateLoading,
    transferQuota,
    transferring,
  } = useAffiliate()
  const { redeeming, redeemCode } = useRedemption()
  const { processing: creemProcessing, processCreemPayment } = useCreemPayment()
  const { processing: waffoProcessing, processWaffoPayment } = useWaffoPayment()
  const { processing: pancakeProcessing, processWaffoPancakePayment } =
    useWaffoPancakePayment()

  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  useEffect(() => {
    if (props.initialShowHistory) {
      setBillingDialogOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [props.initialShowHistory])

  const topupAmountInitializedRef = useRef(false)
  useEffect(() => {
    if (topupInfo && !topupAmountInitializedRef.current) {
      topupAmountInitializedRef.current = true
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
      void calculatePaymentAmount(
        toCreditAmount(defaultPayCny),
        preferredType
      )
    }
  }, [topupInfo, presetAmounts, calculatePaymentAmount, toCreditAmount])

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

  const handleRedeem = async () => {
    if (!redemptionCode) return

    const success = await redeemCode(redemptionCode)
    if (success) {
      setRedemptionCode('')
      await fetchUser()
    }
  }

  const handleTransfer = async (amount: number) => {
    const success = await transferQuota(amount)
    if (success) {
      await fetchUser()
    }
    return success
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
      await fetchUser()
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

  const handleSubscriptionAvailabilityChange = useCallback(
    (available: boolean) => {
      setShowSubscriptionPanel(available)
    },
    []
  )

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
            <WalletStatsCard user={user} loading={userLoading} />

            <div
              className={
                showSubscriptionPanel
                  ? 'grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:items-start'
                  : 'grid gap-4'
              }
            >
              <div id='wallet-add-funds' className='scroll-mt-4'>
                <RechargeFormCard
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
                  redemptionCode={redemptionCode}
                  onRedemptionCodeChange={setRedemptionCode}
                  onRedeem={handleRedeem}
                  redeeming={redeeming}
                  topupLink={topupInfo?.topup_link}
                  loading={topupLoading}
                  priceRatio={priceRatio}
                  usdExchangeRate={effectiveUsdExchangeRate}
                  onOpenBilling={() => setBillingDialogOpen(true)}
                  creemProducts={topupInfo?.creem_products}
                  enableCreemTopup={topupInfo?.enable_creem_topup}
                  onCreemProductSelect={handleCreemProductSelect}
                  enableWaffoTopup={topupInfo?.enable_waffo_topup}
                  waffoPayMethods={topupInfo?.waffo_pay_methods}
                  waffoMinTopup={topupInfo?.waffo_min_topup}
                  onWaffoMethodSelect={handleWaffoMethodSelect}
                  enableWaffoPancakeTopup={
                    topupInfo?.enable_waffo_pancake_topup
                  }
                  confirming={
                    processing || waffoProcessing || pancakeProcessing
                  }
                  onConfirmPay={() => void handleConfirmPay()}
                />
              </div>

              <SubscriptionPlansCard
                topupInfo={topupInfo}
                onAvailabilityChange={handleSubscriptionAvailabilityChange}
                userQuota={user?.quota}
                onPurchaseSuccess={fetchUser}
              />
            </div>

            <AffiliateRewardsCard
              user={user}
              affiliateLink={affiliateLink}
              onTransfer={() => setTransferDialogOpen(true)}
              complianceConfirmed={
                topupInfo?.payment_compliance_confirmed !== false
              }
              loading={affiliateLoading}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <PaymentQrDialog
        open={!!qrSession}
        session={qrSession}
        onOpenChange={(open) => {
          if (!open) clearQrSession()
        }}
        onPaid={() => {
          clearQrSession()
          void fetchUser()
        }}
      />

      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onConfirm={handleTransfer}
        availableQuota={user?.aff_quota ?? 0}
        transferring={transferring}
      />

      <BillingHistoryDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
      />

      <CreemConfirmDialog
        open={creemDialogOpen}
        onOpenChange={setCreemDialogOpen}
        onConfirm={() => void handleCreemConfirm()}
        product={selectedCreemProduct}
        processing={creemProcessing}
      />
    </>
  )
}
