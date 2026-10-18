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
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { PublicLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'

import { listCreativeTypes } from './api'

export function CreativeHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['creative-types'],
    queryFn: async () => {
      const res = await listCreativeTypes()
      if (!res.success) throw new Error('failed')
      return res.data
    },
  })

  const openSuite = () => {
    void navigate({
      to: '/creative/ecommerce-suite',
      search: { tab: 'detail' },
    })
  }

  if (query.isLoading) {
    return (
      <PublicLayout>
        <LoadingState message={t('Loading...')} />
      </PublicLayout>
    )
  }

  const types = query.data ?? []
  if (types.length === 0) {
    return (
      <PublicLayout>
        <EmptyState
          title={t('No creative types enabled')}
          description={t(
            'Ask an administrator to enable the creative panel and at least one type.'
          )}
        />
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto flex w-full max-w-5xl flex-col items-center gap-6'>
        <div className='text-center'>
          <h1 className='text-2xl font-semibold'>{t('Creative Panel')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('Upload once, then let AI produce platform-ready image suites.')}
          </p>
        </div>
        <div className='grid w-full gap-4 sm:grid-cols-2'>
          {types.map((item) => (
            <div
              key={item.type_id}
              className='bg-card space-y-4 rounded-xl border p-5'
            >
              <div>
                <h2 className='text-lg font-medium'>{item.title}</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {item.description ||
                    t('One-click upload to multi-step image generation.')}
                </p>
              </div>
              <Button type='button' onClick={openSuite}>
                {t('Start')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </PublicLayout>
  )
}
