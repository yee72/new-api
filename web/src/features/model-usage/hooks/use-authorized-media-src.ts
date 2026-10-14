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

import { useAuthStore } from '@/stores/auth-store'

import {
  fetchModelUsageMediaBlobCached,
  isModelUsageMediaURL,
  modelUsageMediaCacheKey,
} from '../lib/media-download'

export { isModelUsageMediaURL }

/** 同页内存缓存：30 分钟内视为新鲜；离开组件后仍保留 2 小时 */
const MEDIA_STALE_TIME_MS = 30 * 60 * 1000
const MEDIA_GC_TIME_MS = 2 * 60 * 60 * 1000

export function useAuthorizedMediaSrc(url: string | undefined): {
  src: string | undefined
  loading: boolean
  failed: boolean
} {
  const userId = useAuthStore((state) => state.auth.user?.id ?? null)
  const needsAuth = Boolean(url && isModelUsageMediaURL(url))
  const cacheKey = url ? modelUsageMediaCacheKey(url) : ''
  const query = useQuery({
    queryKey: ['model-usage-media', userId ?? 0, cacheKey],
    enabled: needsAuth && Boolean(url) && Boolean(cacheKey),
    queryFn: async ({ signal }) => {
      if (!url) return null
      const blob = await fetchModelUsageMediaBlobCached(url, {
        userId,
        signal,
      })
      const type = blob.type || ''
      if (
        type.startsWith('image/') ||
        type.startsWith('video/') ||
        type === 'application/octet-stream'
      ) {
        return blob
      }
      return null
    },
    staleTime: MEDIA_STALE_TIME_MS,
    gcTime: MEDIA_GC_TIME_MS,
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
