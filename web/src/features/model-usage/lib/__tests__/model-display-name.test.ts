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

import { formatModelUsageDisplayName } from '../model-display-name'

describe('formatModelUsageDisplayName', () => {
  it('keeps the full pricing model name without stripping prefixes', () => {
    expect(
      formatModelUsageDisplayName({ model_name: 'claude-fable-5-1' })
    ).toBe('claude-fable-5-1')
    expect(formatModelUsageDisplayName({ model_name: 'gpt-4o-mini' })).toBe(
      'gpt-4o-mini'
    )
    expect(formatModelUsageDisplayName({ model_name: 'gpt-4' })).toBe('gpt-4')
  })

  it('prefers a non-empty display name over the pricing name', () => {
    expect(
      formatModelUsageDisplayName({
        model_name: 'gpt-4',
        display_name: 'gpt-4（修改名称）',
      })
    ).toBe('gpt-4（修改名称）')
  })

  it('falls back when display name is blank', () => {
    expect(
      formatModelUsageDisplayName({ model_name: 'gpt-4', display_name: '  ' })
    ).toBe('gpt-4')
  })
})
