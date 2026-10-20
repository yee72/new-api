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
  buildModelUsageVendorFilterOptions,
  isDomesticModelUsageVendor,
  MAJOR_VENDOR_DIRECT_VALUE,
  resolveModelUsageVendorFilterValue,
} from '../vendor-display'

describe('vendor-display', () => {
  it('treats negative pricing vendors and overseas names as foreign', () => {
    expect(isDomesticModelUsageVendor({ id: -1012, name: 'OpenAI' })).toBe(
      false
    )
    expect(isDomesticModelUsageVendor({ id: 3, name: 'Anthropic' })).toBe(
      false
    )
    expect(isDomesticModelUsageVendor({ id: 8, name: 'Google' })).toBe(false)
  })

  it('recognizes domestic vendors by name keywords', () => {
    expect(isDomesticModelUsageVendor({ id: 1, name: '阿里巴巴' })).toBe(true)
    expect(isDomesticModelUsageVendor({ id: 2, name: '字节跳动' })).toBe(true)
    expect(isDomesticModelUsageVendor({ id: 4, name: 'DeepSeek' })).toBe(true)
    expect(isDomesticModelUsageVendor({ id: 5, name: 'MiniMax' })).toBe(true)
    expect(isDomesticModelUsageVendor({ id: 6, name: 'vidu' })).toBe(true)
  })

  it('merges foreign vendors into major vendor direct option', () => {
    const options = buildModelUsageVendorFilterOptions(
      [
        { id: -1012, name: 'OpenAI' },
        { id: 3, name: 'Anthropic' },
        { id: 1, name: '阿里巴巴' },
        { id: 2, name: '字节跳动' },
      ],
      'Major vendor direct'
    )
    expect(options[0]).toMatchObject({
      value: MAJOR_VENDOR_DIRECT_VALUE,
      label: 'Major vendor direct',
      vendorIds: [-1012, 3],
      isMajorDirect: true,
    })
    expect(options.map((item) => item.label)).toEqual(
      expect.arrayContaining([
        'Major vendor direct',
        '阿里巴巴',
        '字节跳动',
      ])
    )
    expect(options).toHaveLength(3)
  })

  it('resolves selected filter value from vendor ids', () => {
    const options = buildModelUsageVendorFilterOptions(
      [
        { id: -1012, name: 'OpenAI' },
        { id: 1, name: '阿里巴巴' },
      ],
      'Major vendor direct'
    )
    expect(resolveModelUsageVendorFilterValue([], options)).toBe('all')
    expect(resolveModelUsageVendorFilterValue([-1012], options)).toBe(
      MAJOR_VENDOR_DIRECT_VALUE
    )
    expect(resolveModelUsageVendorFilterValue([1], options)).toBe('vendor:1')
  })
})
