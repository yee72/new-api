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

import { isModelUsageMediaURL } from '../media-download'

describe('isModelUsageMediaURL', () => {
  it('detects relative and absolute model-usage media paths', () => {
    expect(
      isModelUsageMediaURL(
        '/api/model-usage/media/model-usage/1/flux/a1/0.png?access=abc'
      )
    ).toBe(true)
    expect(
      isModelUsageMediaURL(
        'https://example.com/api/model-usage/media/model-usage/1/x.png'
      )
    ).toBe(true)
    expect(isModelUsageMediaURL('https://cdn.example.com/out.png')).toBe(false)
    expect(isModelUsageMediaURL('data:image/png;base64,aa')).toBe(false)
  })
})
