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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  adminCopySkill,
  adminListSkills,
  adminUpdateSkill,
} from '@/features/creative/api'
import type { CreativeSkill } from '@/features/creative/types'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsCard } from '../components/settings-card'
import { SettingsSection } from '../components/settings-section'

export function CreativeSkillsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const typeId = 'ecommerce_suite'
  const query = useQuery({
    queryKey: ['creative-admin-skills', typeId],
    queryFn: async () => {
      const res = requireServerSuccess(await adminListSkills(typeId))
      return res.data
    },
  })
  const [editing, setEditing] = useState<CreativeSkill | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('none')
      return requireServerSuccess(
        await adminUpdateSkill(editing.id, editing)
      )
    },
    onSuccess: () => {
      toast.success(t('Saved'))
      setEditing(null)
      void queryClient.invalidateQueries({
        queryKey: ['creative-admin-skills', typeId],
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const copy = useMutation({
    mutationFn: async (id: number) =>
      requireServerSuccess(await adminCopySkill(id)),
    onSuccess: () => {
      toast.success(t('Copied as new version'))
      void queryClient.invalidateQueries({
        queryKey: ['creative-admin-skills', typeId],
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (query.isLoading) {
    return <LoadingState message={t('Loading...')} />
  }

  const skills = query.data || []

  return (
    <SettingsSection title={t('Skills')}>
      <div className='space-y-3'>
        {skills.map((skill) => (
          <SettingsCard
            key={skill.id}
            title={`${skill.name} · v${skill.version}`}
            description={`${skill.skill_id} · ${skill.stage}${skill.platform ? ` · ${skill.platform}` : ''}`}
          >
            <div className='flex flex-wrap gap-2'>
              <span className='text-muted-foreground text-xs'>
                {skill.enabled ? t('Enabled') : t('Disabled')}
              </span>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => setEditing(skill)}
              >
                {t('Edit')}
              </Button>
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={copy.isPending}
                onClick={() => copy.mutate(skill.id)}
              >
                {t('Copy version')}
              </Button>
            </div>
          </SettingsCard>
        ))}
      </div>

      {editing && (
        <SettingsCard
          title={t('Edit skill')}
          description={`${editing.skill_id} v${editing.version}`}
        >
          <div className='space-y-3'>
            <div className='space-y-2'>
              <Label>{t('Name')}</Label>
              <Input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label>{t('Platform (empty = all)')}</Label>
              <Input
                value={editing.platform}
                onChange={(e) =>
                  setEditing({ ...editing, platform: e.target.value })
                }
              />
            </div>
            <div className='flex items-center justify-between gap-3'>
              <Label>{t('Enabled')}</Label>
              <Switch
                checked={editing.enabled}
                onCheckedChange={(checked) =>
                  setEditing({ ...editing, enabled: checked })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label>{t('Body template')}</Label>
              <Textarea
                rows={10}
                className='font-mono text-xs'
                value={editing.body}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
              />
            </div>
            <div className='flex gap-2'>
              <Button
                type='button'
                disabled={save.isPending}
                onClick={() => save.mutate()}
              >
                {t('Save')}
              </Button>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditing(null)}
              >
                {t('Cancel')}
              </Button>
            </div>
          </div>
        </SettingsCard>
      )}
    </SettingsSection>
  )
}
