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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { fetchImageCaptcha } from '../api'
import type { ImageCaptchaType } from '../types'

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

type SlideChallenge = {
  image: string
  piece: string
  pieceY: number
  trackWidth: number
}

const SLIDE_PIECE_SIZE = 40

export function ImageCaptcha(props: ImageCaptchaProps) {
  const { t } = useTranslation()
  const [captchaType, setCaptchaType] = useState<ImageCaptchaType>('math')
  const [image, setImage] = useState('')
  const [slide, setSlide] = useState<SlideChallenge | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const onChangeRef = useRef(props.onChange)
  const dragStartXRef = useRef(0)
  const dragOriginOffsetRef = useRef(0)
  onChangeRef.current = props.onChange

  const reload = useCallback(async () => {
    setLoading(true)
    setOffsetX(0)
    setDragging(false)
    setSlide(null)
    try {
      const res = await fetchImageCaptcha()
      const data = res?.data
      if (res?.success && data?.captcha_id && data?.captcha_image) {
        const nextType: ImageCaptchaType =
          data.captcha_type === 'slide' ? 'slide' : 'math'
        setCaptchaType(nextType)
        setImage(data.captcha_image)
        if (
          nextType === 'slide' &&
          data.captcha_piece &&
          data.captcha_track_width
        ) {
          setSlide({
            image: data.captcha_image,
            piece: data.captcha_piece,
            pieceY: data.captcha_piece_y ?? 0,
            trackWidth: data.captcha_track_width,
          })
        }
        onChangeRef.current({
          captchaId: data.captcha_id,
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

  const maxOffset = Math.max(
    0,
    (slide?.trackWidth ?? 0) - SLIDE_PIECE_SIZE
  )

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (props.disabled || loading || !slide) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    dragStartXRef.current = event.clientX
    dragOriginOffsetRef.current = offsetX
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const next = Math.min(
      maxOffset,
      Math.max(
        0,
        dragOriginOffsetRef.current + (event.clientX - dragStartXRef.current)
      )
    )
    setOffsetX(next)
  }

  const finishSlide = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
    const next = Math.min(
      maxOffset,
      Math.max(
        0,
        dragOriginOffsetRef.current + (event.clientX - dragStartXRef.current)
      )
    )
    setOffsetX(next)
    onChangeRef.current({
      ...props.value,
      captchaCode: String(Math.round(next)),
    })
  }

  return (
    <div className={cn('space-y-2', props.className)}>
      <div className='flex items-center justify-between gap-2'>
        <Label htmlFor='image-captcha'>
          {captchaType === 'slide'
            ? t('Slide captcha')
            : t('Math captcha')}
        </Label>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='h-7 gap-1 px-2 text-xs'
          onClick={() => void reload()}
          disabled={props.disabled || loading}
          aria-label={t('Refresh captcha')}
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          {t('Refresh')}
        </Button>
      </div>

      {captchaType === 'slide' && slide ? (
        <div className='space-y-2 overflow-x-auto'>
          <div
            className='bg-muted relative overflow-hidden rounded-md border select-none'
            style={{ width: slide.trackWidth }}
          >
            {loading ? (
              <div className='flex h-[140px] items-center justify-center'>
                <Loader2 className='text-muted-foreground size-4 animate-spin' />
              </div>
            ) : (
              <>
                <img
                  src={slide.image}
                  alt={t('Slide captcha')}
                  className='block h-auto w-full'
                  draggable={false}
                />
                <img
                  src={slide.piece}
                  alt=''
                  aria-hidden
                  className='pointer-events-none absolute top-0 left-0 size-10'
                  style={{
                    transform: `translate(${offsetX}px, ${slide.pieceY}px)`,
                  }}
                  draggable={false}
                />
              </>
            )}
          </div>
          <div
            role='slider'
            aria-label={t('Slide to complete the puzzle')}
            aria-valuemin={0}
            aria-valuemax={maxOffset}
            aria-valuenow={Math.round(offsetX)}
            tabIndex={props.disabled || loading ? -1 : 0}
            className={cn(
              'bg-muted relative h-10 touch-none rounded-md border',
              (props.disabled || loading) && 'opacity-60'
            )}
            style={{ width: slide.trackWidth }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishSlide}
            onPointerCancel={finishSlide}
          >
            <div
              className='bg-primary/15 absolute inset-y-0 left-0 rounded-md'
              style={{ width: offsetX + SLIDE_PIECE_SIZE / 2 }}
            />
            <div
              className={cn(
                'bg-background absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md border shadow-sm',
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              )}
              style={{ left: offsetX }}
            >
              <span className='text-muted-foreground text-xs'>||</span>
            </div>
            {!props.value.captchaCode && (
              <span className='text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center text-xs'>
                {t('Slide to complete the puzzle')}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className='flex items-center gap-2'>
          <Input
            id='image-captcha'
            value={props.value.captchaCode}
            onChange={(event) =>
              onChangeRef.current({
                ...props.value,
                captchaCode: event.target.value.replace(/[^\d-]/g, ''),
              })
            }
            placeholder={t('Enter the calculation result')}
            autoComplete='off'
            inputMode='numeric'
            disabled={props.disabled || loading}
            className='flex-1 tracking-wide'
            maxLength={4}
          />
          <button
            type='button'
            className='bg-muted relative h-10 w-[160px] shrink-0 overflow-hidden rounded-md border'
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
                alt={t('Math captcha')}
                className='size-full object-cover'
              />
            ) : (
              <RefreshCw className='text-muted-foreground mx-auto size-4' />
            )}
          </button>
        </div>
      )}
    </div>
  )
}
