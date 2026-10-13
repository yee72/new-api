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
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { PublicLayout } from '@/components/layout'
import { PageTransition } from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { fetchModelUsageModels } from './api'
import { ModelUsageSidebar } from './components/model-usage-sidebar'
import { ModelUsageWorkspace } from './components/model-usage-workspace'
import { useModelSessions } from './hooks/use-model-sessions'
import { parseModelUsageVendorIds } from './lib/vendor-ids'
import type { ModelUsageTab } from './types'

export function ModelUsagePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = useSearch({ from: '/model-usage/' })
  const user = useAuthStore((state) => state.auth.user)
  const {
    getSession,
    ensureSession,
    setImageConfig,
    setVideoConfig,
    send,
    deleteTurn,
    regenerate,
    isModelSending,
    lastModelName,
    setLastModelName,
  } = useModelSessions()

  const [tab, setTab] = useState<ModelUsageTab>(
    (search.type as ModelUsageTab) || 'all'
  )
  const [selectedVendorIds, setSelectedVendorIds] = useState<number[]>(() =>
    parseModelUsageVendorIds(search.vendors)
  )
  const [searchInput, setSearchInput] = useState(search.q || '')
  const [activeQuery, setActiveQuery] = useState<{
    mode: 'search' | 'filter'
    q: string
    vendorIds: number[]
  }>(() =>
    search.q
      ? { mode: 'search', q: search.q, vendorIds: [] }
      : {
          mode: 'filter',
          q: '',
          vendorIds: parseModelUsageVendorIds(search.vendors),
        }
  )
  const [selectedModelName, setSelectedModelName] = useState(
    () => search.model || lastModelName || ''
  )
  const [loginOpen, setLoginOpen] = useState(false)

  const selectModel = (modelName: string) => {
    setSelectedModelName(modelName)
    if (modelName) setLastModelName(modelName)
  }

  const listQuery = useQuery({
    queryKey: [
      'model-usage',
      tab,
      activeQuery.mode,
      activeQuery.q,
      activeQuery.vendorIds.join(','),
    ],
    queryFn: () =>
      fetchModelUsageModels({
        type: tab,
        q: activeQuery.mode === 'search' ? activeQuery.q : undefined,
        vendorIds:
          activeQuery.mode === 'filter' ? activeQuery.vendorIds : undefined,
      }),
  })

  const models = listQuery.data?.models ?? []
  const vendors = listQuery.data?.vendors ?? []
  const selectedModel = useMemo(
    () => models.find((item) => item.model_name === selectedModelName),
    [models, selectedModelName]
  )
  const activeSession = getSession(selectedModel)

  useEffect(() => {
    if (models.length === 0) {
      if (selectedModelName) setSelectedModelName('')
      return
    }
    if (
      selectedModelName &&
      models.some((item) => item.model_name === selectedModelName)
    ) {
      if (lastModelName !== selectedModelName) {
        setLastModelName(selectedModelName)
      }
      return
    }
    // 优先恢复上次对话模型，否则落到列表第一项
    const preferred =
      (lastModelName &&
        models.find((item) => item.model_name === lastModelName)
          ?.model_name) ||
      models[0].model_name
    selectModel(preferred)
  }, [models, selectedModelName, lastModelName, setLastModelName])

  useEffect(() => {
    if (selectedModel) {
      ensureSession(selectedModel)
    }
  }, [selectedModel, ensureSession])

  useEffect(() => {
    void navigate({
      to: '/model-usage',
      search: {
        type: tab === 'all' ? undefined : tab,
        q:
          activeQuery.mode === 'search' && activeQuery.q
            ? activeQuery.q
            : undefined,
        vendors:
          activeQuery.mode === 'filter' && activeQuery.vendorIds.length > 0
            ? activeQuery.vendorIds.join(',')
            : undefined,
        model: selectedModelName || undefined,
      },
      replace: true,
    })
  }, [tab, activeQuery, selectedModelName, navigate])

  const goLogin = () => {
    const redirect = window.location.href
    void navigate({ to: '/sign-in', search: { redirect } })
  }

  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='flex h-dvh flex-col pt-14'>
        <div className='flex min-h-0 flex-1 flex-col md:flex-row'>
          <ModelUsageSidebar
            tab={tab}
            onTabChange={setTab}
            vendors={vendors}
            selectedVendorIds={selectedVendorIds}
            onToggleVendor={(vendorId) => {
              setSearchInput('')
              setSelectedVendorIds((current) => {
                const next = current.includes(vendorId)
                  ? current.filter((id) => id !== vendorId)
                  : [...current, vendorId]
                setActiveQuery({ mode: 'filter', q: '', vendorIds: next })
                return next
              })
            }}
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onSearchSubmit={() => {
              const q = searchInput.trim()
              setSelectedVendorIds([])
              setActiveQuery({ mode: 'search', q, vendorIds: [] })
            }}
            models={models}
            selectedModelName={selectedModel?.model_name}
            onSelectModel={selectModel}
            isModelSending={isModelSending}
            isLoading={listQuery.isLoading}
          />
          <ModelUsageWorkspace
            model={selectedModel}
            session={activeSession}
            isAuthenticated={Boolean(user)}
            onRequireLogin={() => setLoginOpen(true)}
            onSend={async (text) => {
              if (!selectedModel) return
              await send(selectedModel, text)
            }}
            onDeleteTurn={(turnId) => {
              if (!selectedModel) return
              deleteTurn(selectedModel, turnId)
            }}
            onRegenerate={async (message) => {
              if (!selectedModel) return
              await regenerate(selectedModel, message)
            }}
            onImageConfigChange={(config) => {
              if (!selectedModel) return
              setImageConfig(selectedModel, config)
            }}
            onVideoConfigChange={(config) => {
              if (!selectedModel) return
              setVideoConfig(selectedModel, config)
            }}
          />
        </div>

        <Dialog
          open={loginOpen}
          onOpenChange={setLoginOpen}
          title={t('Sign in required')}
          description={t(
            'Please sign in before sending requests on the model usage page.'
          )}
          footer={
            <>
              <Button variant='outline' onClick={() => setLoginOpen(false)}>
                {t('Cancel')}
              </Button>
              <Button onClick={goLogin}>{t('Sign in')}</Button>
            </>
          }
        >
          {null}
        </Dialog>
      </PageTransition>
    </PublicLayout>
  )
}
