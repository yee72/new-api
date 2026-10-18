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
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { PublicLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ModelUsageAuthImage } from '@/features/model-usage/components/model-usage-auth-media'
import { cn } from '@/lib/utils'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getCreativeTask, listCreativeTasks } from './api'
import { CreativeResultPanel } from './components/result-panel'
import { KIND_LABELS, type CreativeAsset } from './types'

function HistoryExpandedAssets(props: { taskId: number }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['creative-history-task', props.taskId],
    queryFn: async () => {
      const res = requireServerSuccess(await getCreativeTask(props.taskId))
      return res.data
    },
  })
  if (query.isLoading) {
    return <LoadingState message={t('Loading...')} />
  }
  const assets = (query.data?.assets || []) as CreativeAsset[]
  const success = assets.filter(
    (item) =>
      item.kind !== 'reference' &&
      Boolean(item.url) &&
      (item.status === 'review' || item.status === 'approved')
  )
  if (success.length === 0) {
    return (
      <p className='text-muted-foreground px-1 py-3 text-sm'>
        {t('No successful images in this task.')}
      </p>
    )
  }
  return (
    <div className='space-y-3 pb-3'>
      <div className='flex flex-wrap gap-2'>
        {success.map((asset) => (
          <div key={asset.id} className='w-28 space-y-1'>
            <div className='aspect-square overflow-hidden rounded-lg border'>
              {asset.url ? (
                <ModelUsageAuthImage
                  url={asset.url}
                  alt=''
                  compact
                  className='size-full object-cover'
                />
              ) : null}
            </div>
            <p className='text-muted-foreground truncate text-center text-[11px]'>
              {KIND_LABELS[asset.kind] || asset.kind}
            </p>
          </div>
        ))}
      </div>
      <CreativeResultPanel assets={success} />
    </div>
  )
}

export function CreativeHistoryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [openId, setOpenId] = useState<number | null>(null)
  const query = useQuery({
    queryKey: ['creative-history'],
    queryFn: async () => {
      const res = requireServerSuccess(await listCreativeTasks())
      // 仅展示已出图任务，避免草稿/分析中占位
      return (res.data || []).filter(
        (item) => (item.success_image_count ?? 0) > 0
      )
    },
  })
  const items = query.data || []

  return (
    <PublicLayout>
      <div className='mx-auto flex w-full max-w-4xl flex-col gap-4'>
        <div className='flex items-center gap-3'>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => void navigate({ to: '/creative/ecommerce-suite' })}
          >
            <ArrowLeft className='size-4' />
            {t('Back')}
          </Button>
          <div>
            <h1 className='text-xl font-semibold'>{t('History')}</h1>
            <p className='text-muted-foreground text-sm'>
              {t('Browse past ecommerce suite generations.')}
            </p>
          </div>
        </div>

        {query.isLoading && <LoadingState message={t('Loading...')} />}
        {!query.isLoading && items.length === 0 && (
          <EmptyState
            title={t('No history yet')}
            description={t('Finished generation tasks will appear here.')}
          />
        )}
        {!query.isLoading && items.length > 0 && (
          <div className='space-y-2'>
            {items.map((item) => {
              const open = openId === item.id
              return (
                <Collapsible
                  key={item.id}
                  open={open}
                  onOpenChange={(next) => setOpenId(next ? item.id : null)}
                  className='bg-card rounded-xl border px-4'
                >
                  <CollapsibleTrigger className='flex w-full items-center justify-between gap-3 py-3 text-left'>
                    <div>
                      <p className='text-sm font-medium'>{item.title}</p>
                      <p className='text-muted-foreground mt-0.5 text-xs'>
                        {t('{{count}} images', {
                          count: item.success_image_count ?? 0,
                        })}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        'text-muted-foreground size-4 shrink-0 transition-transform',
                        open && 'rotate-180'
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {open ? <HistoryExpandedAssets taskId={item.id} /> : null}
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </div>
    </PublicLayout>
  )
}
