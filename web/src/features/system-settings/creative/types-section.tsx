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
  adminListCreativeTypes,
  adminUpdateCreativeType,
} from '@/features/creative/api'
import type { CreativeTypePackage } from '@/features/creative/types'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsCard } from '../components/settings-card'
import { SettingsSection } from '../components/settings-section'

export function CreativeTypesSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['creative-admin-types'],
    queryFn: async () => {
      const res = requireServerSuccess(await adminListCreativeTypes())
      return res.data
    },
  })
  const row = query.data?.find((item) => item.type_id === 'ecommerce_suite')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [packageJson, setPackageJson] = useState('')

  useEffect(() => {
    if (!row) return
    setTitle(row.title)
    setDescription(row.description)
    setEnabled(row.enabled)
    setPackageJson(row.package_json || '')
  }, [row])

  const save = useMutation({
    mutationFn: async () => {
      let pkg: CreativeTypePackage | undefined
      if (packageJson.trim()) {
        pkg = JSON.parse(packageJson) as CreativeTypePackage
      }
      return requireServerSuccess(
        await adminUpdateCreativeType('ecommerce_suite', {
          title,
          description,
          enabled,
          package: pkg,
        })
      )
    },
    onSuccess: () => {
      toast.success(t('Saved'))
      void queryClient.invalidateQueries({ queryKey: ['creative-admin-types'] })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (query.isLoading) {
    return <LoadingState message={t('Loading...')} />
  }

  if (!row) {
    return (
      <SettingsSection title={t('Creative types')}>
        <p className='text-muted-foreground text-sm'>
          {t('No ecommerce suite type found. Restart server to seed defaults.')}
        </p>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection title={t('Ecommerce image suite')}>
      <SettingsCard
        title={t('Type & package')}
        description={t(
          'Enable the type, edit copy, and configure platforms / styles / retries.'
        )}
      >
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-3'>
            <Label>{t('Enabled')}</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className='space-y-2'>
            <Label>{t('Title')}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label>{t('Description')}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label>{t('Package JSON')}</Label>
            <Textarea
              rows={14}
              className='font-mono text-xs'
              value={packageJson}
              onChange={(e) => setPackageJson(e.target.value)}
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
