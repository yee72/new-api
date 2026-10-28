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
import { ChevronRight, Plus, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useUserDisplay } from '@/hooks/use-user-display'
import { getSelf } from '@/lib/api'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { ModelUsageRechargeDialog } from './model-usage-recharge-dialog'

/** 固定在模型列表右下角：遮挡滚动内容，用户入口占比更大 */
export function ModelUsageAccountFooter() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const setUser = useAuthStore((state) => state.auth.setUser)
  const { displayName } = useUserDisplay(user)
  const isWalletVisible = useIsSidebarModuleVisible('/wallet')
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const avatarName = user?.username || displayName
  const avatarFallback = getUserAvatarFallback(avatarName)
  const avatarFallbackStyle = useMemo(
    () => getUserAvatarStyle(avatarName),
    [avatarName]
  )
  const balanceLabel = formatQuotaWithCurrency(user?.quota ?? 0, {
    showSymbol: false,
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: true,
  })

  const userId = user?.id
  // 进入模型使用页时按用户刷新一次余额，避免侧栏展示过旧额度
  useEffect(() => {
    if (userId == null) return
    let cancelled = false
    void getSelf()
      .then((response) => {
        if (cancelled || !response?.success || !response.data) return
        const current = useAuthStore.getState().auth.user
        if (!current) return
        setUser({ ...current, ...(response.data as AuthUser) })
      })
      .catch(() => {
        // 余额刷新失败时保留现有登录态数据
      })
    return () => {
      cancelled = true
    }
  }, [userId, setUser])

  if (!user) return null

  return (
    <>
      <div
        className={cn(
          'bg-background absolute inset-x-0 bottom-0 z-10 flex gap-2 border-t px-0.5 pt-2 pb-0.5',
          'shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.35)]'
        )}
      >
        <Link
          to='/dashboard'
          className={cn(
            'bg-muted/80 hover:bg-muted flex min-h-14 min-w-0 flex-[3] items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
          )}
          aria-label={t('Go to Dashboard')}
        >
          <Avatar size='sm' className='size-9 shrink-0'>
            <AvatarFallback
              className='text-xs font-semibold text-white'
              style={avatarFallbackStyle}
            >
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm leading-tight font-medium'>
              {displayName}
            </p>
            <p className='mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-500 tabular-nums'>
              <Zap className='size-3 shrink-0 fill-current' aria-hidden />
              <span className='truncate'>{balanceLabel}</span>
            </p>
          </div>
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden
          />
          <span className='sr-only'>{t('View more')}</span>
        </Link>

        {isWalletVisible ? (
          <button
            type='button'
            onClick={() => setRechargeOpen(true)}
            className={cn(
              'hover:bg-destructive/5 flex min-h-14 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/80 px-2 transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
            )}
            aria-label={t('Recharge')}
          >
            <span
              className='inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-black'
              aria-hidden
            >
              <Plus className='size-3 stroke-[3]' />
            </span>
            <span className='text-sm font-semibold text-amber-400'>
              {t('Recharge')}
            </span>
          </button>
        ) : null}
      </div>

      <ModelUsageRechargeDialog
        open={rechargeOpen}
        onOpenChange={setRechargeOpen}
      />
    </>
  )
}
