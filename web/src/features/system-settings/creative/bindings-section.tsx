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
import {
  adminListBindings,
  adminUpsertBinding,
} from '@/features/creative/api'
import type { CreativeBinding } from '@/features/creative/types'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsCard } from '../components/settings-card'
import { SettingsSection } from '../components/settings-section'

const STAGES = ['analyze_vl', 'copy_llm', 'image_gen', 'image_qa'] as const

const STAGE_LABELS: Record<string, string> = {
  analyze_vl: 'Analyze (VL)',
  copy_llm: 'Copy / prompt',
  image_gen: 'Image generation',
  image_qa: 'Image QA',
}

export function CreativeBindingsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const typeId = 'ecommerce_suite'
  const query = useQuery({
    queryKey: ['creative-admin-bindings', typeId],
    queryFn: async () => {
      const res = requireServerSuccess(await adminListBindings(typeId))
      return res.data
    },
  })
  const [drafts, setDrafts] = useState<Record<string, CreativeBinding>>({})

  useEffect(() => {
    if (!query.data) return
    const next: Record<string, CreativeBinding> = {}
    for (const stage of STAGES) {
      const found = query.data.find((item) => item.stage === stage)
      next[stage] = found || {
        type_id: typeId,
        stage,
        primary_model: '',
        fallback_model: '',
        temperature: 0.7,
        max_tokens: 2048,
        force_no_thinking: true,
      }
    }
    setDrafts(next)
  }, [query.data])

  const save = useMutation({
    mutationFn: async (stage: string) => {
      const binding = drafts[stage]
      if (!binding) throw new Error('missing')
      return requireServerSuccess(await adminUpsertBinding(typeId, binding))
    },
    onSuccess: () => {
      toast.success(t('Saved'))
      void queryClient.invalidateQueries({
        queryKey: ['creative-admin-bindings', typeId],
      })
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (query.isLoading) {
    return <LoadingState message={t('Loading...')} />
  }

  return (
    <SettingsSection title={t('Model bindings')}>
      <div className='space-y-4'>
        {STAGES.map((stage) => {
          const draft = drafts[stage]
          if (!draft) return null
          return (
            <SettingsCard
              key={stage}
              title={t(STAGE_LABELS[stage] || stage)}
              description={t('Primary / fallback model for this stage.')}
            >
              <div className='grid gap-3 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label>{t('Primary model')}</Label>
                  <Input
                    value={draft.primary_model}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [stage]: { ...draft, primary_model: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label>{t('Fallback model')}</Label>
                  <Input
                    value={draft.fallback_model}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [stage]: { ...draft, fallback_model: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label>{t('Temperature')}</Label>
                  <Input
                    type='number'
                    step='0.1'
                    value={draft.temperature}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [stage]: {
                          ...draft,
                          temperature: Number(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label>{t('Max tokens')}</Label>
                  <Input
                    type='number'
                    value={draft.max_tokens}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [stage]: {
                          ...draft,
                          max_tokens: Number(e.target.value),
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <div className='mt-3 flex items-center justify-between gap-3'>
                <Label>{t('Force disable thinking')}</Label>
                <Switch
                  checked={!!draft.force_no_thinking}
                  onCheckedChange={(checked) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [stage]: { ...draft, force_no_thinking: checked },
                    }))
                  }
                />
              </div>
              <Button
                type='button'
                className='mt-3'
                disabled={save.isPending}
                onClick={() => save.mutate(stage)}
              >
                {t('Save')}
              </Button>
            </SettingsCard>
          )
        })}
      </div>
    </SettingsSection>
  )
}
