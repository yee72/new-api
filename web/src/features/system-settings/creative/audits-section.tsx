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
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/loading-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { adminListCreativeAudits } from '@/features/creative/api'
import { toIntlLocale } from '@/i18n/languages'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsSection } from '../components/settings-section'

export function CreativeAuditsSection() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['creative-admin-audits'],
    queryFn: async () => {
      const res = requireServerSuccess(await adminListCreativeAudits())
      return res.data
    },
  })

  if (query.isLoading) {
    return <LoadingState message={t('Loading...')} />
  }

  const rows = query.data || []

  return (
    <SettingsSection title={t('Audit log')}>
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Time')}</TableHead>
              <TableHead>{t('Actor')}</TableHead>
              <TableHead>{t('Entity')}</TableHead>
              <TableHead>{t('Action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className='text-muted-foreground'>
                  {t('No audit entries yet')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className='whitespace-nowrap text-xs'>
                    {new Date(row.created_at * 1000).toLocaleString(locale)}
                  </TableCell>
                  <TableCell>{row.actor_name || row.id}</TableCell>
                  <TableCell className='text-xs'>
                    {row.entity_type}:{row.entity_id}
                  </TableCell>
                  <TableCell>{row.action}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SettingsSection>
  )
}
