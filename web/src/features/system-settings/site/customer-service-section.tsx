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
import { zodResolver } from '@hookform/resolvers/zod'
import { type ChangeEvent, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const MAX_QR_BYTES = 512 * 1024

const customerServiceSchema = z.object({
  CustomerServiceEnabled: z.boolean(),
  CustomerServiceQRCodeImage: z.string(),
})

type CustomerServiceFormValues = z.infer<typeof customerServiceSchema>

type CustomerServiceSectionProps = {
  defaultValues: CustomerServiceFormValues
}

function isUsableQrImage(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:image/')) return true
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function CustomerServiceSection({
  defaultValues,
}: CustomerServiceSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<CustomerServiceFormValues>({
    resolver: zodResolver(customerServiceSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const qrImage = form.watch('CustomerServiceQRCodeImage')
  const previewSrc = qrImage.trim()
  const showPreview = isUsableQrImage(previewSrc)

  const onSubmit = async (values: CustomerServiceFormValues) => {
    const normalizedImage = values.CustomerServiceQRCodeImage.trim()
    if (values.CustomerServiceEnabled && !isUsableQrImage(normalizedImage)) {
      toast.error(
        t('Upload a QR code image or enter a valid image URL before enabling')
      )
      return
    }

    const nextValues: CustomerServiceFormValues = {
      CustomerServiceEnabled: values.CustomerServiceEnabled,
      CustomerServiceQRCodeImage: normalizedImage,
    }

    const updates = Object.entries(nextValues).filter(
      ([key, value]) =>
        value !== defaultValues[key as keyof CustomerServiceFormValues]
    )

    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value })
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error(t('Please select an image file'))
      event.target.value = ''
      return
    }

    if (file.size > MAX_QR_BYTES) {
      toast.error(t('QR code image must be 512 KB or smaller'))
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      form.setValue('CustomerServiceQRCodeImage', result, {
        shouldDirty: true,
        shouldTouch: true,
      })
    })
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <SettingsSection title={t('Customer Service')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save customer service settings'
          />

          <div className='space-y-6'>
            <FormField
              control={form.control}
              name='CustomerServiceEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Show customer service button')}</FormLabel>
                    <FormDescription>
                      {t(
                        'When enabled, a floating button appears on the right edge. Visitors can open the QR code to contact support.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </SettingsSwitchItem>
              )}
            />

            <FormField
              control={form.control}
              name='CustomerServiceQRCodeImage'
              render={({ field }) => (
                <div className='space-y-3'>
                  <FormLabel>{t('QR code image')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Upload a WeChat or other contact QR code, or paste an image URL. Recommended under 512 KB.'
                    )}
                  </FormDescription>

                  <div className='flex flex-wrap items-start gap-4'>
                    <div className='bg-muted flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border'>
                      {showPreview ? (
                        <img
                          src={previewSrc}
                          alt={t('Customer service QR code preview')}
                          className='h-full w-full object-contain p-2'
                        />
                      ) : (
                        <span className='text-muted-foreground px-3 text-center text-xs'>
                          {t('No preview')}
                        </span>
                      )}
                    </div>

                    <div className='min-w-0 flex-1 space-y-3'>
                      <div className='flex flex-wrap gap-2'>
                        <input
                          ref={fileInputRef}
                          type='file'
                          accept='image/png,image/jpeg,image/webp,image/gif'
                          className='hidden'
                          onChange={handleFileChange}
                        />
                        <Button
                          type='button'
                          variant='outline'
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {t('Upload')}
                        </Button>
                        {previewSrc ? (
                          <Button
                            type='button'
                            variant='outline'
                            onClick={() =>
                              form.setValue('CustomerServiceQRCodeImage', '', {
                                shouldDirty: true,
                                shouldTouch: true,
                              })
                            }
                          >
                            {t('Clear')}
                          </Button>
                        ) : null}
                      </div>

                      <FormControl>
                        <Input
                          placeholder={t('https://example.com/qr-code.png')}
                          autoComplete='off'
                          value={field.value ?? ''}
                          onChange={(event) =>
                            field.onChange(event.target.value)
                          }
                          name={field.name}
                          onBlur={field.onBlur}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
