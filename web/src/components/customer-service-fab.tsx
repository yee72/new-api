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
import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useStatus } from '@/hooks/use-status'
import { resolveCustomerServiceQr } from '@/lib/customer-service'

/**
 * 右侧边缘客服入口：开启且配置了二维码时展示，点击展开扫码面板。
 */
export function CustomerServiceFab() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const qrcode = resolveCustomerServiceQr(status)

  if (!qrcode) return null

  return (
    <div className='pointer-events-none fixed inset-y-0 right-0 z-50 flex items-center'>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type='button'
              variant='default'
              aria-label={t('Customer service')}
              className='pointer-events-auto h-auto rounded-l-lg rounded-r-none px-2.5 py-3 shadow-md'
            />
          }
        >
          <span className='flex flex-col items-center gap-1.5'>
            <MessageCircle className='size-4 shrink-0' aria-hidden />
            <span
              className='text-xs font-medium'
              style={{ writingMode: 'vertical-rl' }}
            >
              {t('Support')}
            </span>
          </span>
        </PopoverTrigger>
        <PopoverContent
          side='left'
          align='center'
          sideOffset={10}
          className='w-56'
        >
          <PopoverHeader>
            <PopoverTitle>{t('Customer service')}</PopoverTitle>
            <PopoverDescription>
              {t('Scan with WeChat or your contact app')}
            </PopoverDescription>
          </PopoverHeader>
          <img
            src={qrcode}
            alt={t('Customer service QR code')}
            className='mx-auto size-44 rounded-md border bg-white object-contain p-2'
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
