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
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useAuthorizedMediaSrc } from '../hooks/use-authorized-media-src'
import { ModelUsageMediaPlaceholder } from './model-usage-media-placeholder'

type ModelUsageAuthImageProps = {
  url: string
  alt: string
  className?: string
  onClick?: () => void
  /** 附件缩略图等填满父级，不用大尺寸作品框架 */
  compact?: boolean
  /** 按作品固有尺寸收缩，气泡贴合内容（对话区单图） */
  fitContent?: boolean
}

export function ModelUsageAuthImage(props: ModelUsageAuthImageProps) {
  const { t } = useTranslation()
  const { src, loading, failed } = useAuthorizedMediaSrc(props.url)
  const [mediaReady, setMediaReady] = useState(false)

  useEffect(() => {
    setMediaReady(false)
  }, [src])

  if (failed) {
    let failedSize = 'aspect-video min-h-36 w-full'
    if (props.compact) failedSize = 'size-full'
    else if (props.fitContent) failedSize = 'min-h-24 min-w-24'
    return (
      <div
        className={cn(
          'bg-muted text-muted-foreground flex items-center justify-center rounded-xl px-2 text-center text-xs',
          failedSize,
          props.className
        )}
      >
        {t('Failed to load image')}
      </div>
    )
  }

  if (props.compact) {
    if (loading || !src) {
      return (
        <div
          className={cn(
            'bg-muted/60 flex size-full items-center justify-center',
            props.className
          )}
        >
          <Loader2 className='text-muted-foreground size-4 animate-spin' />
        </div>
      )
    }
    return (
      <img
        src={src}
        alt={props.alt}
        className={props.className}
        loading='lazy'
        onClick={props.onClick}
      />
    )
  }

  const showPlaceholder = loading || !src || !mediaReady
  const fitContent = Boolean(props.fitContent)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl',
        fitContent ? 'inline-block max-w-full' : 'w-full',
        showPlaceholder &&
          (fitContent ? 'min-h-24 min-w-24' : 'aspect-video min-h-24')
      )}
    >
      {showPlaceholder && (
        <ModelUsageMediaPlaceholder
          label={t('Waiting to load...')}
          className={cn(
            'min-h-0',
            src ? 'absolute inset-0 z-10' : 'h-full w-full'
          )}
        />
      )}
      {src ? (
        <img
          src={src}
          alt={props.alt}
          className={cn(
            // 对话列表等比例缩略展示；点开预览仍看原图
            fitContent
              ? 'block h-auto max-h-72 w-auto max-w-full'
              : 'max-h-64 w-full bg-black/20 object-contain',
            props.className,
            !mediaReady && 'invisible absolute inset-0'
          )}
          loading='lazy'
          onLoad={() => setMediaReady(true)}
          onClick={props.onClick}
        />
      ) : null}
    </div>
  )
}

type ModelUsageAuthVideoProps = {
  url: string
  className?: string
  controls?: boolean
  muted?: boolean
  /** 按作品固有尺寸收缩，气泡贴合内容（对话区单视频） */
  fitContent?: boolean
}

export function ModelUsageAuthVideo(props: ModelUsageAuthVideoProps) {
  const { t } = useTranslation()
  const { src, loading, failed } = useAuthorizedMediaSrc(props.url)
  const [mediaReady, setMediaReady] = useState(false)

  useEffect(() => {
    setMediaReady(false)
  }, [src])

  const fitContent = Boolean(props.fitContent)

  if (failed) {
    return (
      <div
        className={cn(
          'bg-muted text-muted-foreground flex items-center justify-center rounded-xl px-3 text-center text-xs',
          fitContent
            ? 'min-h-24 min-w-40'
            : 'aspect-video min-h-24 w-full',
          props.className
        )}
      >
        {t('Failed to load video')}
      </div>
    )
  }

  const showPlaceholder = loading || !src || !mediaReady

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl',
        fitContent ? 'inline-block max-w-full' : 'w-full',
        showPlaceholder &&
          (fitContent ? 'aspect-video min-h-24 w-56' : 'aspect-video min-h-24')
      )}
    >
      {showPlaceholder && (
        <ModelUsageMediaPlaceholder
          label={t('Waiting to load...')}
          className={cn(
            'min-h-0',
            src ? 'absolute inset-0 z-10' : 'h-full w-full'
          )}
        />
      )}
      {src ? (
        <video
          src={src}
          controls={props.controls ?? true}
          muted={props.muted}
          className={cn(
            fitContent
              ? 'block h-auto max-h-72 w-auto max-w-full'
              : 'max-h-64 w-full bg-black/20 object-contain',
            props.className,
            !mediaReady && 'invisible absolute inset-0'
          )}
          playsInline
          preload='metadata'
          onLoadedData={() => setMediaReady(true)}
        />
      ) : null}
    </div>
  )
}
