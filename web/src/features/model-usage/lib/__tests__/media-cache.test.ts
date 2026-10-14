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
import { describe, expect, it } from 'vitest'

import {
  modelUsageMediaCacheKey,
  modelUsageMediaUrlExpiresAt,
} from '../media-cache'

describe('modelUsageMediaCacheKey', () => {
  it('strips access/expires query so the same object hits one cache entry', () => {
    expect(
      modelUsageMediaCacheKey(
        '/api/model-usage/media/model-usage/1/flux/a1/0.png?access=abc&expires=999'
      )
    ).toBe('/api/model-usage/media/model-usage/1/flux/a1/0.png')
    expect(
      modelUsageMediaCacheKey(
        'https://example.com/api/model-usage/media/model-usage/1/x.png?access=tok'
      )
    ).toBe('/api/model-usage/media/model-usage/1/x.png')
  })
})

describe('modelUsageMediaUrlExpiresAt', () => {
  it('reads expires seconds from the query string', () => {
    expect(
      modelUsageMediaUrlExpiresAt(
        '/api/model-usage/media/a.png?expires=1700000000&access=x'
      )
    ).toBe(1700000000)
    expect(modelUsageMediaUrlExpiresAt('/api/model-usage/media/a.png')).toBe(0)
  })
})
