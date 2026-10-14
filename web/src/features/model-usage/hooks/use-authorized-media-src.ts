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
import { useEffect, useState } from 'react'

import { api } from '@/lib/api'

/** 模型使用媒体短链：<img>/<video> 无法带 Bearer，需经 api 拉取再转 blob。 */
export function isModelUsageMediaURL(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/api/model-usage/media/')) return true
  try {
    const parsed = new URL(trimmed, window.location.origin)
    return parsed.pathname.startsWith('/api/model-usage/media/')
  } catch {
    return false
  }
}

function mediaRequestPath(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}

export function useAuthorizedMediaSrc(url: string | undefined): {
  src: string | undefined
  loading: boolean
  failed: boolean
} {
  const needsAuth = Boolean(url && isModelUsageMediaURL(url))
  const query = useQuery({
    queryKey: ['model-usage-media', url],
    enabled: needsAuth && Boolean(url),
    queryFn: async ({ signal }) => {
      const response = await api.get<Blob>(mediaRequestPath(url!), {
        responseType: 'blob',
        signal,
        disableDuplicate: true,
        skipErrorHandler: true,
        skipBusinessError: true,
      })
      const type = response.data.type || ''
      if (
        type.startsWith('image/') ||
        type.startsWith('video/') ||
        type === 'application/octet-stream'
      ) {
        return response.data
      }
      return null
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })

  const [blobSrc, setBlobSrc] = useState<string | undefined>()
  useEffect(() => {
    if (!query.data) {
      setBlobSrc(undefined)
      return
    }
    const objectUrl = URL.createObjectURL(query.data)
    setBlobSrc(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [query.data])

  if (!url) {
    return { src: undefined, loading: false, failed: false }
  }
  if (!needsAuth) {
    return { src: url, loading: false, failed: false }
  }
  return {
    src: blobSrc,
    loading: query.isLoading || (Boolean(query.data) && !blobSrc),
    failed: query.isError || query.data === null,
  }
}
