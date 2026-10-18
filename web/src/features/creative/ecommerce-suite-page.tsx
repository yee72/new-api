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
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { History, ImageIcon, Sparkles, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PublicLayout } from '@/components/layout'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ModelUsageAuthImage } from '@/features/model-usage/components/model-usage-auth-media'
import { fetchModelUsageModels } from '@/features/model-usage/api'
import {
  getUserGroups,
  getUserModels,
} from '@/features/playground/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  confirmCreativeTask,
  createCreativeTask,
  getCreativeTask,
  listCreativeTypes,
  uploadCreativeReference,
} from './api'
import { CreativePrimaryTabs, type CreativePrimaryTab } from './components/primary-tabs'
import { CreativeResultPanel } from './components/result-panel'
import { createCreativeProcessEvent, type CreativeProcessEvent } from './lib/process-log'
import { runCreativeAnalyze, runCreativeGenerationLoop } from './lib/run-generation'
import {
  buildRestoredProcessEvents,
  clearCreativeProcessEvents,
  getActiveCreativeTaskId,
  hasPendingGenerationAssets,
  loadCreativeProcessEvents,
  saveCreativeProcessEvents,
  setActiveCreativeTaskId,
  stepFromTaskStatus,
} from './lib/session-state'
import {
  PLATFORM_LABELS,
  type CreativeAsset,
  type CreativeProductProfile,
  type CreativeTask,
  type CreativeTypeCard,
  type CreativeTypePackage,
} from './types'

const creativeSuiteRoute = getRouteApi('/creative/ecommerce-suite')

type Step = 'input' | 'analyze' | 'confirm' | 'generate' | 'review'

const STEPS: { id: Step; labelKey: string }[] = [
  { id: 'input', labelKey: 'Input' },
  { id: 'analyze', labelKey: 'Analyzing' },
  { id: 'confirm', labelKey: 'Confirm plan' },
  { id: 'generate', labelKey: 'Generating' },
  { id: 'review', labelKey: 'Done' },
]

function stepIndex(step: Step): number {
  return STEPS.findIndex((item) => item.id === step)
}

export function EcommerceSuitePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = creativeSuiteRoute.useSearch()
  const [primaryTab, setPrimaryTab] = useState<CreativePrimaryTab>(
    search.tab || 'detail'
  )
  const [typeCard, setTypeCard] = useState<CreativeTypeCard | null>(null)
  const [step, setStep] = useState<Step>('input')
  const [platform, setPlatform] = useState('pdd')
  const [style, setStyle] = useState('日系简约')
  const [styleCustom, setStyleCustom] = useState('')
  const [extraText, setExtraText] = useState('')
  const [task, setTask] = useState<CreativeTask | null>(null)
  const [assets, setAssets] = useState<CreativeAsset[]>([])
  const [profile, setProfile] = useState<CreativeProductProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [processEvents, setProcessEvents] = useState<CreativeProcessEvent[]>(
    []
  )
  const [group, setGroup] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [imageCount, setImageCount] = useState(2)
  // 进入分析中后输入与规划全部锁定
  const locked = step !== 'input'
  const restoredTaskIdRef = useRef<number | null>(null)
  const resumeStartedRef = useRef(false)
  const styleHydratedRef = useRef(false)

  const appendProcessEvent = (event: CreativeProcessEvent) => {
    setProcessEvents((prev) => [...prev, event])
  }

  const syncSuiteSearch = (next: {
    tab?: CreativePrimaryTab
    taskId?: number | null
  }) => {
    void navigate({
      to: '/creative/ecommerce-suite',
      search: (prev) => {
        const tab = next.tab ?? prev.tab ?? primaryTab
        const rawTaskId =
          next.taskId === undefined ? prev.taskId : next.taskId
        const taskId =
          typeof rawTaskId === 'number' && rawTaskId > 0
            ? rawTaskId
            : undefined
        return { tab, ...(taskId ? { taskId } : {}) }
      },
      replace: true,
    })
  }

  const bindTaskToSession = (taskId: number) => {
    setActiveCreativeTaskId(taskId)
    syncSuiteSearch({ taskId })
  }

  useEffect(() => {
    void listCreativeTypes().then((res) => {
      const card = res.data?.find((item) => item.type_id === 'ecommerce_suite')
      if (card) {
        setTypeCard(card)
        // 仅在尚未从任务恢复时写入默认风格，避免覆盖恢复值
        if (!styleHydratedRef.current && card.package.styles?.[0]) {
          setStyle(card.package.styles[0])
        }
      }
    })
  }, [])

  // 过程日志按 taskId 写入 sessionStorage，离开页面后可回看
  useEffect(() => {
    if (!task?.id || processEvents.length === 0) return
    saveCreativeProcessEvents(task.id, processEvents)
  }, [task?.id, processEvents])

  const groupsQuery = useQuery({
    queryKey: ['creative-groups'],
    queryFn: async () => requireServerSuccess(await getUserGroups()),
  })
  const groups = groupsQuery.data ?? []

  useEffect(() => {
    const first = groupsQuery.data?.[0]?.value
    if (!group && first) {
      setGroup(first)
    }
  }, [group, groupsQuery.data])

  const imageCatalogQuery = useQuery({
    queryKey: ['creative-image-catalog'],
    queryFn: async () => fetchModelUsageModels({ type: 'image' }),
  })
  const imageNameSet = useMemo(() => {
    const set = new Set<string>()
    for (const item of imageCatalogQuery.data?.models ?? []) {
      set.add(item.model_name)
    }
    return set
  }, [imageCatalogQuery.data])

  const modelsQuery = useQuery({
    queryKey: ['creative-image-models', group],
    queryFn: async () => requireServerSuccess(await getUserModels(group)),
    enabled: Boolean(group),
  })
  const models = useMemo(() => {
    const all = modelsQuery.data ?? []
    if (imageNameSet.size === 0) return all
    const filtered = all.filter((item) => imageNameSet.has(item.value))
    return filtered.length > 0 ? filtered : all
  }, [modelsQuery.data, imageNameSet])

  useEffect(() => {
    if (!imageModel && models.length > 0) {
      setImageModel(models[0].value)
    } else if (
      imageModel &&
      models.length > 0 &&
      !models.some((item) => item.value === imageModel)
    ) {
      setImageModel(models[0].value)
    }
  }, [imageModel, models])

  const pkg: CreativeTypePackage | undefined = typeCard?.package

  const refreshTask = async (taskId: number) => {
    const res = requireServerSuccess(await getCreativeTask(taskId))
    const data = res.data
    setTask(data.task)
    setAssets(data.assets || [])
    if (data.task.product_profile) {
      try {
        setProfile(
          JSON.parse(data.task.product_profile) as CreativeProductProfile
        )
      } catch {
        /* ignore */
      }
    }
    return data
  }

  const applyRestoredTask = (data: {
    task: CreativeTask
    assets: CreativeAsset[]
  }) => {
    const nextTask = data.task
    const nextAssets = data.assets || []
    styleHydratedRef.current = true
    setTask(nextTask)
    setAssets(nextAssets)
    setPlatform(nextTask.platform || 'pdd')
    setStyle(nextTask.style || '日系简约')
    setStyleCustom(nextTask.style_custom || '')
    setExtraText(nextTask.extra_text || '')
    if (nextTask.image_count && nextTask.image_count > 0) {
      setImageCount(nextTask.image_count)
    }
    if (nextTask.image_kind === 'hero' || nextTask.image_kind === 'detail') {
      setPrimaryTab(nextTask.image_kind)
    }
    if (nextTask.product_profile) {
      try {
        setProfile(
          JSON.parse(nextTask.product_profile) as CreativeProductProfile
        )
      } catch {
        setProfile(null)
      }
    } else {
      setProfile(null)
    }
    setStep(stepFromTaskStatus(nextTask.status))
    const cached = loadCreativeProcessEvents(nextTask.id)
    setProcessEvents(
      cached.length > 0
        ? cached
        : buildRestoredProcessEvents(nextTask, nextAssets)
    )
    setActiveCreativeTaskId(nextTask.id)
  }

  // 回页时按 URL taskId 或会话中的活跃任务恢复
  useEffect(() => {
    const targetId = search.taskId || getActiveCreativeTaskId()
    if (!targetId) return
    if (restoredTaskIdRef.current === targetId) return
    restoredTaskIdRef.current = targetId
    let cancelled = false
    void (async () => {
      setBusy(true)
      try {
        const res = requireServerSuccess(await getCreativeTask(targetId))
        if (cancelled) return
        applyRestoredTask(res.data)
        if (search.taskId !== targetId) {
          syncSuiteSearch({
            tab:
              res.data.task.image_kind === 'hero' ||
              res.data.task.image_kind === 'detail'
                ? res.data.task.image_kind
                : primaryTab,
            taskId: targetId,
          })
        }
      } catch {
        if (cancelled) return
        restoredTaskIdRef.current = null
        setActiveCreativeTaskId(null)
        clearCreativeProcessEvents(targetId)
        syncSuiteSearch({ taskId: null })
        toast.error(t('Failed to restore task'))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // 仅在进入页或 URL taskId 变化时恢复
  }, [search.taskId])

  // 恢复后若仍有未完成槽位（含中断残留的 generating）则继续生图
  useEffect(() => {
    if (resumeStartedRef.current) return
    if (busy) return
    if (!task?.id) return
    // review 也可能残留未完成槽位（误判 done 后）
    if (step !== 'generate' && step !== 'review') return
    if (!imageModel || !group) return
    if (!hasPendingGenerationAssets(assets)) return
    resumeStartedRef.current = true
    const taskId = task.id
    const count = task.image_count || imageCount
    void (async () => {
      setBusy(true)
      setStep('generate')
      try {
        await runCreativeGenerationLoop(taskId, {
          onLog: appendProcessEvent,
          onAssetSettled: async () => {
            await refreshTask(taskId)
          },
          imageModel,
          group,
          imageCount: count,
        })
        await refreshTask(taskId)
        setStep('review')
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('Generation failed')
        appendProcessEvent(
          createCreativeProcessEvent({
            stage: 'done',
            type: 'detail',
            messageKey: 'Generation failed: {{message}}',
            status: 'error',
            params: { message },
          })
        )
        toast.error(message)
      } finally {
        setBusy(false)
      }
    })()
  }, [assets, busy, group, imageCount, imageModel, step, t, task])

  const clearAndStartNew = () => {
    const previousId = task?.id
    if (previousId) {
      clearCreativeProcessEvents(previousId)
    }
    setActiveCreativeTaskId(null)
    restoredTaskIdRef.current = null
    resumeStartedRef.current = false
    styleHydratedRef.current = false
    setTask(null)
    setAssets([])
    setProfile(null)
    setStep('input')
    setProcessEvents([])
    setExtraText('')
    setStyleCustom('')
    setImageCount(2)
    syncSuiteSearch({ taskId: null })
  }

  const references = assets.filter((item) => item.kind === 'reference')

  const onCreateAndUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const fileList = [...files]
    const maxRefs = pkg?.max_references || 6
    const alreadyCount = assets.filter((item) => item.kind === 'reference').length
    const remaining = Math.max(0, maxRefs - alreadyCount)
    if (remaining <= 0) {
      toast.error(t('Maximum reference images reached'))
      return
    }
    const batch = fileList.slice(0, remaining)
    setBusy(true)
    setUploadingCount(batch.length)
    try {
      let current = task
      if (!current) {
        const created = requireServerSuccess(
          await createCreativeTask({
            type_id: 'ecommerce_suite',
            platform,
            style,
            style_custom: styleCustom,
            extra_text: extraText,
            image_kind: primaryTab,
            image_count: imageCount,
          })
        )
        current = created.data
        setTask(current)
        restoredTaskIdRef.current = current.id
        bindTaskToSession(current.id)
      }
      for (const file of batch) {
        await requireServerSuccess(
          await uploadCreativeReference(current.id, file)
        )
      }
      await refreshTask(current.id)
      toast.success(t('Reference images uploaded'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Upload failed'))
    } finally {
      setUploadingCount(0)
      setBusy(false)
    }
  }

  const onAnalyzeAndGenerate = async () => {
    if (!task) {
      toast.error(t('Please upload reference images first'))
      return
    }
    if (!imageModel) {
      toast.error(t('Please select an image model'))
      return
    }
    if (locked) return
    setBusy(true)
    setProcessEvents([])
    setStep('analyze')
    try {
      const result = requireServerSuccess(
        await runCreativeAnalyze(task.id, {
          group,
          platform,
          style,
          styleCustom,
          extraText,
          imageKind: primaryTab,
          imageCount,
          imageModel,
          onLog: appendProcessEvent,
        })
      )
      setTask(result.data.task)
      setProfile(result.data.profile)
      setStep('confirm')
      appendProcessEvent(
        createCreativeProcessEvent({
          stage: 'plan',
          type: 'stage',
          messageKey: 'Confirm plan',
          status: 'running',
        })
      )
      appendProcessEvent(
        createCreativeProcessEvent({
          stage: 'plan',
          type: 'detail',
          messageKey: 'Confirming generation plan ({{count}} images)...',
          status: 'running',
          params: { count: imageCount },
        })
      )
      const confirmed = await confirmCreativeTask(task.id, {
        image_kind: primaryTab,
        image_count: imageCount,
      })
      if (!confirmed.success || !confirmed.data) {
        appendProcessEvent(
          createCreativeProcessEvent({
            stage: 'plan',
            type: 'detail',
            messageKey: 'Insufficient balance. Please top up.',
            status: 'error',
          })
        )
        toast.error(confirmed.message || t('Insufficient balance. Please top up.'))
        return
      }
      appendProcessEvent(
        createCreativeProcessEvent({
          stage: 'plan',
          type: 'detail',
          messageKey: 'Plan confirmed, starting image generation',
          status: 'done',
        })
      )
      setTask(confirmed.data.task)
      setAssets(confirmed.data.assets)
      setStep('generate')
      await runCreativeGenerationLoop(task.id, {
        onLog: appendProcessEvent,
        onAssetSettled: async () => {
          await refreshTask(task.id)
        },
        imageModel,
        group,
        imageCount,
      })
      await refreshTask(task.id)
      setStep('review')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Generation failed')
      appendProcessEvent(
        createCreativeProcessEvent({
          stage: 'done',
          type: 'detail',
          messageKey: 'Generation failed: {{message}}',
          status: 'error',
          params: { message },
        })
      )
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const activeStep = stepIndex(step)
  const maxReferences = pkg?.max_references || 6
  const isUploading = uploadingCount > 0
  const canUploadMore = !locked && !busy && references.length < maxReferences
  // 生图进行中保持底部按钮可见并置灰，避免步骤切换后按钮消失
  const showGenerateButton =
    step === 'input' || (busy && (step === 'analyze' || step === 'generate'))
  const stepLabel = t(STEPS[activeStep]?.labelKey || 'Input')

  return (
    <PublicLayout>
      <div className='mx-auto flex w-full max-w-7xl flex-col gap-5'>
        <div className='relative flex flex-col items-center gap-3 text-center'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='absolute top-0 right-0'
            onClick={() => void navigate({ to: '/creative/history' })}
          >
            <History className='size-4' />
            {t('History')}
          </Button>
          <h1 className='text-2xl font-semibold tracking-tight'>
            {t('All-category product images')}
          </h1>
          <p className='text-muted-foreground max-w-2xl text-sm'>
            {t(
              'Upload product photos, let AI analyze features, and generate main and detail image sets.'
            )}
          </p>
          <CreativePrimaryTabs
            value={primaryTab}
            onChange={(tab) => {
              if (locked) return
              setPrimaryTab(tab)
              syncSuiteSearch({ tab })
            }}
          />
        </div>

        {/* 步骤条 */}
        <ol className='flex flex-wrap items-center justify-center gap-2 text-xs'>
          {STEPS.map((item, index) => {
            const active = index === activeStep
            const done = index < activeStep
            return (
              <li key={item.id} className='flex items-center gap-2'>
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border text-[11px] font-medium',
                    active &&
                      'bg-primary text-primary-foreground border-primary',
                    done && 'border-primary/50 text-primary',
                    !active && !done && 'text-muted-foreground'
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    active
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground'
                  )}
                >
                  {t(item.labelKey)}
                </span>
                {index < STEPS.length - 1 && (
                  <span className='bg-border mx-1 hidden h-px w-8 sm:block' />
                )}
              </li>
            )
          })}
        </ol>

        <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]'>
          {/* 左侧录入 */}
          <div className='bg-card space-y-4 rounded-2xl border p-4'>
            <div className='space-y-3'>
              <div className='flex items-start justify-between gap-3'>
                <div className='flex items-start gap-2'>
                  <span className='bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                    <ImageIcon className='size-4' />
                  </span>
                  <div>
                    <p className='text-sm font-semibold'>{t('Product images')}</p>
                    <p className='text-muted-foreground text-xs'>
                      {t('Upload multi-angle product photos or detail shots')}
                    </p>
                  </div>
                </div>
                <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
                  {isUploading
                    ? `${references.length + uploadingCount}/${maxReferences}`
                    : `${references.length}/${maxReferences}`}
                </span>
              </div>

              {references.length === 0 && !isUploading ? (
                <label className='border-muted-foreground/30 hover:bg-muted/40 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center'>
                  <Upload className='text-muted-foreground size-6' />
                  <span className='text-sm font-medium'>
                    {t('Upload multi-angle product photos')}
                  </span>
                  <span className='text-muted-foreground text-xs'>
                    {t('White-background shots work best')}
                  </span>
                  <Input
                    type='file'
                    accept='image/png,image/jpeg,image/webp'
                    multiple
                    className='hidden'
                    disabled={locked || busy}
                    onChange={(e) => {
                      void onCreateAndUpload(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
              ) : (
                <div className='flex flex-wrap gap-2'>
                  {/* 已上传缩略图保留；本批新图全部完成前只显示转圈占位 */}
                  {references.map((item) =>
                    item.url ? (
                      <div
                        key={item.id}
                        className='size-20 overflow-hidden rounded-lg border'
                      >
                        <ModelUsageAuthImage
                          url={item.url}
                          alt=''
                          compact
                          className='size-full object-cover'
                        />
                      </div>
                    ) : null
                  )}
                  {isUploading &&
                    Array.from({ length: uploadingCount }, (_, index) => (
                      <div
                        key={`uploading-${index}`}
                        className='bg-muted/40 flex size-20 items-center justify-center rounded-lg border border-dashed'
                        aria-label={t('Uploading...')}
                      >
                        <Spinner className='text-muted-foreground size-5' />
                      </div>
                    ))}
                  {canUploadMore && !isUploading && (
                    <label className='border-muted-foreground/30 hover:bg-muted/40 flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center'>
                      <Upload className='text-muted-foreground size-4' />
                      <span className='text-muted-foreground px-1 text-[10px] leading-tight'>
                        {t('Continue uploading')}
                      </span>
                      <Input
                        type='file'
                        accept='image/png,image/jpeg,image/webp'
                        multiple
                        className='hidden'
                        disabled={locked || busy}
                        onChange={(e) => {
                          void onCreateAndUpload(e.target.files)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className='space-y-2'>
              <Label>{t('Target platform')}</Label>
              <Select
                value={platform}
                disabled={locked}
                onValueChange={(value) => {
                  if (value) setPlatform(value)
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue>
                    {PLATFORM_LABELS[platform] || platform}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(pkg?.platforms || []).map((item) => (
                    <SelectItem key={item.platform} value={item.platform}>
                      {PLATFORM_LABELS[item.platform] || item.platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>{t('Quantity')}</Label>
              <Select
                value={String(imageCount)}
                disabled={locked}
                onValueChange={(value) => {
                  if (value) setImageCount(Number(value))
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue>
                    {t('{{count}} images', { count: imageCount })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {t('{{count}} images', { count })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-2'>
              <Label>{t('Style')}</Label>
              <Select
                value={style}
                disabled={locked}
                onValueChange={(value) => {
                  if (value) setStyle(value)
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(pkg?.styles || []).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {style === '其他风格要求' && (
                <Input
                  value={styleCustom}
                  maxLength={200}
                  disabled={locked}
                  placeholder={t('Describe your style (required)')}
                  onChange={(e) => setStyleCustom(e.target.value)}
                />
              )}
            </div>

            <div className='space-y-2'>
              <Label>
                {primaryTab === 'hero'
                  ? t('Main image requirements')
                  : t('Detail image requirements')}
              </Label>
              <Textarea
                rows={5}
                value={extraText}
                disabled={locked}
                onChange={(e) => setExtraText(e.target.value)}
                placeholder={t('Selling points, materials, banned words...')}
              />
            </div>

            <div className='space-y-2'>
              <Label>{t('Model & group')}</Label>
              <ModelGroupSelector
                selectedModel={imageModel}
                models={models}
                onModelChange={setImageModel}
                selectedGroup={group}
                groups={groups}
                onGroupChange={setGroup}
                disabled={
                  locked ||
                  busy ||
                  groupsQuery.isLoading ||
                  modelsQuery.isLoading
                }
              />
            </div>

            {locked && profile && (
              <div className='space-y-2 rounded-xl border p-3'>
                <p className='text-sm font-medium'>{t('Product profile')}</p>
                <p className='text-muted-foreground text-xs'>
                  {t('Inputs are locked after generation starts.')}
                </p>
                <p className='text-sm'>{profile.appearance}</p>
                <p className='text-muted-foreground text-xs'>
                  {[profile.category_l1, profile.category_l2]
                    .filter(Boolean)
                    .join(' / ')}
                </p>
              </div>
            )}

            {showGenerateButton && (
              <Button
                type='button'
                className='w-full'
                disabled={
                  locked ||
                  busy ||
                  isUploading ||
                  references.length === 0 ||
                  !imageModel
                }
                onClick={() => void onAnalyzeAndGenerate()}
              >
                {busy ? (
                  <Spinner className='size-4' />
                ) : (
                  <Sparkles className='size-4' />
                )}
                {t('AI generate images')}
              </Button>
            )}

            {task && !busy && (
              <Button
                type='button'
                variant='outline'
                className='w-full'
                onClick={clearAndStartNew}
              >
                {t('Clear and start new')}
              </Button>
            )}
          </div>

          {/* 右侧结果：过程时间线 + 出图预览 */}
          <CreativeResultPanel
            assets={assets}
            busy={busy}
            processEvents={processEvents}
            stepLabel={stepLabel}
          />
        </div>
      </div>
    </PublicLayout>
  )
}
