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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useAuthorizedMediaSrc } from '../hooks/use-authorized-media-src'

type ModelUsageAuthImageProps = {
  url: string
  alt: string
  className?: string
  onClick?: () => void
}

export function ModelUsageAuthImage(props: ModelUsageAuthImageProps) {
  const { t } = useTranslation()
  const { src, loading, failed } = useAuthorizedMediaSrc(props.url)

  if (failed) {
    return (
      <div
        className={cn(
          'bg-muted text-muted-foreground flex min-h-24 items-center justify-center rounded-xl px-3 text-center text-xs',
          props.className
        )}
      >
        {t('Failed to load image')}
      </div>
    )
  }
  if (loading || !src) {
    return (
      <div
        className={cn(
          'bg-muted/60 flex min-h-24 items-center justify-center rounded-xl',
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

type ModelUsageAuthVideoProps = {
  url: string
  className?: string
  controls?: boolean
  muted?: boolean
}

export function ModelUsageAuthVideo(props: ModelUsageAuthVideoProps) {
  const { t } = useTranslation()
  const { src, loading, failed } = useAuthorizedMediaSrc(props.url)

  if (failed) {
    return (
      <div
        className={cn(
          'bg-muted text-muted-foreground flex min-h-24 items-center justify-center rounded-xl px-3 text-center text-xs',
          props.className
        )}
      >
        {t('Failed to load video')}
      </div>
    )
  }
  if (loading || !src) {
    return (
      <div
        className={cn(
          'bg-muted/60 flex min-h-24 items-center justify-center rounded-xl',
          props.className
        )}
      >
        <Loader2 className='text-muted-foreground size-4 animate-spin' />
      </div>
    )
  }
  return (
    <video
      src={src}
      controls={props.controls ?? true}
      muted={props.muted}
      className={props.className}
      playsInline
      preload='metadata'
    />
  )
}
