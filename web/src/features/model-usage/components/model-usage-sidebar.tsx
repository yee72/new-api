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
import { ChevronDown, Search, X } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { MODEL_USAGE_TABS } from '../constants'
import {
  buildModelUsageVendorFilterOptions,
  resolveModelUsageVendorFilterValue,
} from '../lib/vendor-display'
import type { ModelUsageItem, ModelUsageTab, ModelUsageVendor } from '../types'
import { ModelUsageCard } from './model-usage-card'

type ModelUsageSidebarProps = {
  tab: ModelUsageTab
  onTabChange: (tab: ModelUsageTab) => void
  vendors: ModelUsageVendor[]
  selectedVendorIds: number[]
  onVendorFilterChange: (vendorIds: number[]) => void
  searchInput: string
  onSearchInputChange: (value: string) => void
  onSearchSubmit: (query?: string) => void
  models: ModelUsageItem[]
  selectedModelName?: string
  onSelectModel: (modelName: string) => void
  isPinned?: (modelName: string) => boolean
  onTogglePin: (modelName: string) => void
  isModelSending?: (modelName: string) => boolean
  isLoading?: boolean
}

export function ModelUsageSidebar(props: ModelUsageSidebarProps) {
  const { t } = useTranslation()
  const vendorOptions = useMemo(
    () =>
      buildModelUsageVendorFilterOptions(
        props.vendors,
        t('Major vendor direct')
      ),
    [props.vendors, t]
  )
  const filterValue = resolveModelUsageVendorFilterValue(
    props.selectedVendorIds,
    vendorOptions
  )
  const filterLabel =
    filterValue === 'all'
      ? t('All vendors')
      : (vendorOptions.find((item) => item.value === filterValue)?.label ??
        t('All vendors'))

  return (
    <aside className='flex max-h-[36vh] min-h-0 w-full shrink-0 flex-col gap-2.5 overflow-hidden border-b p-2.5 md:h-full md:max-h-none md:w-[312px] md:border-r md:border-b-0 lg:w-[336px]'>
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

      <div className='flex gap-2'>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-9 max-w-[42%] shrink-0 justify-between gap-1 px-2.5'
              />
            }
          >
            <span className='truncate'>{filterLabel}</span>
            <ChevronDown className='size-3.5 opacity-70' aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='min-w-44'>
            <DropdownMenuRadioGroup
              value={filterValue}
              onValueChange={(value) => {
                if (value === 'all') {
                  props.onVendorFilterChange([])
                  return
                }
                const option = vendorOptions.find((item) => item.value === value)
                props.onVendorFilterChange(option?.vendorIds ?? [])
              }}
            >
              <DropdownMenuRadioItem value='all'>
                {t('All vendors')}
              </DropdownMenuRadioItem>
              {vendorOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <form
          className='flex min-w-0 flex-1 gap-2'
          onSubmit={(event) => {
            event.preventDefault()
            props.onSearchSubmit()
          }}
        >
          <div className='relative min-w-0 flex-1'>
            <Search className='text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2' />
            <Input
              value={props.searchInput}
              onChange={(event) =>
                props.onSearchInputChange(event.target.value)
              }
              placeholder={t('Search model name')}
              className={cn('h-9 pl-8', props.searchInput.trim() && 'pr-8')}
            />
            {props.searchInput.trim() ? (
              <button
                type='button'
                className='text-muted-foreground hover:text-foreground absolute top-1/2 right-2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-sm'
                aria-label={t('Clear')}
                onClick={() => {
                  props.onSearchInputChange('')
                  props.onSearchSubmit('')
                }}
              >
                <X className='size-3.5' aria-hidden />
              </button>
            ) : null}
          </div>
        </form>
      </div>

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
            pinned={props.isPinned?.(model.model_name)}
            onSelect={props.onSelectModel}
            onTogglePin={props.onTogglePin}
          />
        ))}
      </div>
    </aside>
  )
}
