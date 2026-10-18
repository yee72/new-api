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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  adminGetCreativeGlobal,
  adminUpdateCreativeGlobal,
} from '@/features/creative/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsCard } from '../components/settings-card'
import { SettingsSection } from '../components/settings-section'

export function CreativeGlobalSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['creative-admin-global'],
    queryFn: async () => {
      const res = requireServerSuccess(await adminGetCreativeGlobal())
      return res.data
    },
  })
  const [enabled, setEnabled] = useState(true)
  const [concurrency, setConcurrency] = useState('3')
  const [words, setWords] = useState('[]')

  useEffect(() => {
    if (!query.data) return
    setEnabled(query.data.enabled)
    setConcurrency(String(query.data.default_concurrency || '3'))
    setWords(query.data.sensitive_words_json || '[]')
  }, [query.data])

  const save = useMutation({
    mutationFn: async () => {
      const n = Number.parseInt(concurrency, 10)
      const res = requireServerSuccess(
        await adminUpdateCreativeGlobal({
          enabled,
          default_concurrency: Number.isFinite(n) && n > 0 ? n : 3,
          sensitive_words_json: words,
        })
      )
      return res.data
    },
    onSuccess: () => {
      toast.success(t('Saved'))
      void queryClient.invalidateQueries({ queryKey: ['creative-admin-global'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (query.isLoading) {
    return <LoadingState message={t('Loading...')} />
  }

  return (
    <SettingsSection title={t('Global settings')}>
      <SettingsCard
        title={t('Creative panel')}
        description={t(
          'Master switch, default concurrency, and sensitive words for new tasks.'
        )}
      >
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <Label>{t('Enable creative panel')}</Label>
              <p className='text-muted-foreground text-xs'>
                {t('Menu visible')}:{' '}
                {query.data?.menu_visible ? t('Yes') : t('No')}
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className='space-y-2'>
            <Label>{t('Default concurrency')}</Label>
            <Input
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('Sensitive words (JSON array)')}</Label>
            <Textarea
              rows={4}
              value={words}
              onChange={(e) => setWords(e.target.value)}
            />
          </div>
          <Button
            type='button'
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('Save')}
          </Button>
        </div>
      </SettingsCard>
    </SettingsSection>
  )
}
