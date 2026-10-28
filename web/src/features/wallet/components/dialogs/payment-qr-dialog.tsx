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
import { Info, Loader2, QrCode } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'

import { getTopupStatus } from '../../api'
import { PAYMENT_TYPES } from '../../constants'
import { formatPayCNY } from '../../lib'
import type { EpayQrPaySession } from '../../types'

const POLL_INTERVAL_MS = 2500

type PaymentQrDialogProps = {
  open: boolean
  session: EpayQrPaySession | null
  onOpenChange: (open: boolean) => void
  onPaid?: () => void
}

export function PaymentQrDialog(props: PaymentQrDialogProps) {
  const { open, session, onOpenChange, onPaid } = props
  const { t } = useTranslation()
  const [polling, setPolling] = useState(false)
  const paidRef = useRef(false)
  const tradeNo = session?.tradeNo

  const isWechat = session?.paymentMethod === PAYMENT_TYPES.WECHAT
  const title = isWechat ? t('WeChat Scan to Pay') : t('Scan to Pay')
  const hint = isWechat
    ? t('Please use WeChat to scan the QR code below to complete payment')
    : t('Please scan the QR code below to complete payment')

  useEffect(() => {
    if (!open || !tradeNo) {
      setPolling(false)
      paidRef.current = false
      return
    }

    let cancelled = false
    setPolling(true)
    paidRef.current = false

    const tick = async () => {
      try {
        const response = await getTopupStatus(tradeNo)
        if (cancelled || !response?.success || !response.data) return
        if (response.data.status !== 'success') return
        if (paidRef.current) return
        paidRef.current = true
        toast.success(t('Payment successful'))
        onPaid?.()
        onOpenChange(false)
      } catch {
        // 轮询失败时继续下一次，不打断扫码
      }
    }

    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      setPolling(false)
    }
  }, [open, tradeNo, onOpenChange, onPaid, t])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={hint}
      showCloseButton
      contentClassName='sm:max-w-md'
      titleClassName='text-center'
      descriptionClassName='text-center'
      headerClassName='items-center text-center'
    >
      <div className='flex flex-col items-center gap-4 pb-2'>
        <div className='bg-primary/15 text-primary flex size-12 items-center justify-center rounded-xl'>
          <QrCode className='size-6' aria-hidden />
        </div>

        {session?.qrContent ? (
          <div className='rounded-xl bg-white p-3 shadow-sm'>
            <QRCodeSVG
              value={session.qrContent}
              size={220}
              level='M'
              marginSize={1}
            />
          </div>
        ) : (
          <div className='bg-muted flex size-[220px] items-center justify-center rounded-xl'>
            <Loader2 className='text-muted-foreground size-8 animate-spin' />
          </div>
        )}

        <p className='text-muted-foreground text-center text-sm'>
          {isWechat
            ? t('Use WeChat Scan to complete payment')
            : t('Scan the QR code to complete payment')}
        </p>

        <div className='bg-muted/40 w-full space-y-2.5 rounded-xl border px-4 py-3 text-sm'>
          {session?.tradeNo ? (
            <div className='flex items-start justify-between gap-3'>
              <span className='text-muted-foreground shrink-0'>
                {t('Order number')}
              </span>
              <span className='text-right break-all font-medium'>
                {session.tradeNo}
              </span>
            </div>
          ) : null}
          <div className='flex items-center justify-between gap-3'>
            <span className='text-muted-foreground'>{t('Payment amount')}</span>
            <span className='text-primary text-base font-semibold'>
              {formatPayCNY(session?.money ?? 0)}
            </span>
          </div>
        </div>

        <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
          {polling ? (
            <Loader2 className='size-3.5 animate-spin' aria-hidden />
          ) : (
            <Info className='size-3.5' aria-hidden />
          )}
          {t('Balance will be credited automatically after payment')}
        </p>
      </div>
    </Dialog>
  )
}
