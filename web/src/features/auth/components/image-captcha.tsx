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
import { Loader2, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { fetchImageCaptcha } from '../api'

export type ImageCaptchaValue = {
  captchaId: string
  captchaCode: string
}

type ImageCaptchaProps = {
  value: ImageCaptchaValue
  onChange: (value: ImageCaptchaValue) => void
  className?: string
  disabled?: boolean
  reloadKey?: number
}

export function ImageCaptcha(props: ImageCaptchaProps) {
  const { t } = useTranslation()
  const [image, setImage] = useState('')
  const [loading, setLoading] = useState(false)
  const onChangeRef = useRef(props.onChange)
  onChangeRef.current = props.onChange

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchImageCaptcha()
      if (res?.success && res.data?.captcha_id && res.data?.captcha_image) {
        setImage(res.data.captcha_image)
        onChangeRef.current({
          captchaId: res.data.captcha_id,
          captchaCode: '',
        })
        return
      }
      handleServerError(createServerError(res, t('Failed to load captcha')))
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to load captcha'))
      )
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload, props.reloadKey])

  return (
    <div className={cn('space-y-2', props.className)}>
      <Label htmlFor='image-captcha'>{t('Captcha')}</Label>
      <div className='flex items-center gap-2'>
        <Input
          id='image-captcha'
          value={props.value.captchaCode}
          onChange={(event) =>
            onChangeRef.current({
              ...props.value,
              captchaCode: event.target.value.trim().toUpperCase(),
            })
          }
          placeholder={t('Enter captcha')}
          autoComplete='off'
          disabled={props.disabled || loading}
          className='flex-1 uppercase tracking-widest'
          maxLength={8}
        />
        <button
          type='button'
          className='bg-muted relative h-10 w-[140px] shrink-0 overflow-hidden rounded-md border'
          onClick={() => void reload()}
          disabled={props.disabled || loading}
          aria-label={t('Refresh captcha')}
          title={t('Refresh captcha')}
        >
          {loading ? (
            <Loader2 className='text-muted-foreground mx-auto size-4 animate-spin' />
          ) : image ? (
            <img
              src={image}
              alt={t('Captcha')}
              className='size-full object-cover'
            />
          ) : (
            <RefreshCw className='text-muted-foreground mx-auto size-4' />
          )}
        </button>
        <Button
          type='button'
          variant='outline'
          size='icon'
          onClick={() => void reload()}
          disabled={props.disabled || loading}
          aria-label={t('Refresh captcha')}
        >
          <RefreshCw className='size-4' />
        </Button>
      </div>
    </div>
  )
}
