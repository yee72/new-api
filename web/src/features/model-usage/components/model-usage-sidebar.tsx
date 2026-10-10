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
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { MODEL_USAGE_TABS } from '../constants'
import type { ModelUsageItem, ModelUsageTab, ModelUsageVendor } from '../types'
import { ModelUsageCard } from './model-usage-card'

type ModelUsageSidebarProps = {
  tab: ModelUsageTab
  onTabChange: (tab: ModelUsageTab) => void
  vendors: ModelUsageVendor[]
  selectedVendorIds: number[]
  onToggleVendor: (vendorId: number) => void
  searchInput: string
  onSearchInputChange: (value: string) => void
  onSearchSubmit: () => void
  models: ModelUsageItem[]
  selectedModelName?: string
  onSelectModel: (modelName: string) => void
  isModelSending?: (modelName: string) => boolean
  isLoading?: boolean
}

export function ModelUsageSidebar(props: ModelUsageSidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className='flex max-h-[36vh] min-h-0 w-full shrink-0 flex-col gap-2.5 overflow-hidden border-b p-2.5 md:h-full md:max-h-none md:w-[260px] md:border-r md:border-b-0 lg:w-[280px]'>
      <div className='flex gap-1 rounded-lg bg-muted/60 p-1'>
        {MODEL_USAGE_TABS.map((tab) => (
          <button
            key={tab.value}
            type='button'
            onClick={() => props.onTabChange(tab.value)}
            className={cn(
              'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              props.tab === tab.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className='flex flex-wrap gap-1.5'>
        {props.vendors.map((vendor) => {
          const active = props.selectedVendorIds.includes(vendor.id)
          return (
            <button
              key={vendor.id}
              type='button'
              onClick={() => props.onToggleVendor(vendor.id)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              {vendor.name}
            </button>
          )
        })}
      </div>

      <form
        className='flex gap-2'
        onSubmit={(event) => {
          event.preventDefault()
          props.onSearchSubmit()
        }}
      >
        <div className='relative flex-1'>
          <Search className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2' />
          <Input
            value={props.searchInput}
            onChange={(event) => props.onSearchInputChange(event.target.value)}
            placeholder={t('Search model name')}
            className='pl-8'
          />
        </div>
        <Button type='submit' size='sm' variant='secondary'>
          {t('Search')}
        </Button>
      </form>

      <div className='min-h-0 flex-1 space-y-2 overflow-y-auto pr-1'>
        {props.isLoading && (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {t('Loading...')}
          </p>
        )}
        {!props.isLoading && props.models.length === 0 && (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {t('No models found')}
          </p>
        )}
        {props.models.map((model) => (
          <ModelUsageCard
            key={model.model_name}
            model={model}
            selected={props.selectedModelName === model.model_name}
            sending={props.isModelSending?.(model.model_name)}
            onSelect={props.onSelectModel}
          />
        ))}
      </div>
    </aside>
  )
}
