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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

export type CreativePrimaryTab = 'hero' | 'detail'

const TABS: { id: CreativePrimaryTab; labelKey: string }[] = [
  { id: 'hero', labelKey: 'Main image' },
  { id: 'detail', labelKey: 'Detail image' },
]

type PrimaryTabsProps = {
  value: CreativePrimaryTab
  onChange: (value: CreativePrimaryTab) => void
  className?: string
}

export function CreativePrimaryTabs(props: PrimaryTabsProps) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'bg-muted/60 inline-flex items-center gap-1 rounded-full p-1',
        props.className
      )}
    >
      {TABS.map((tab) => {
        const active = props.value === tab.id
        return (
          <button
            key={tab.id}
            type='button'
            onClick={() => props.onChange(tab.id)}
            className={cn(
              'rounded-full px-5 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
