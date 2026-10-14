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

import type { ModelUsageItem } from '../../types'
import { sortModelsWithPins } from '../sort-models'

function model(
  name: string,
  type: ModelUsageItem['model_type'] = 'chat'
): ModelUsageItem {
  return {
    id: name.length,
    model_name: name,
    model_type: type,
    status: 1,
    created_time: 0,
    manual_usage: 0,
    actual_usage_7d: 0,
    display_usage: 0,
  }
}

describe('sortModelsWithPins', () => {
  it('keeps usage order when nothing is pinned', () => {
    const models = [model('a'), model('b'), model('c')]
    expect(sortModelsWithPins(models, {}).map((m) => m.model_name)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('puts pinned models first by pin time descending', () => {
    const models = [model('a'), model('b'), model('c'), model('d')]
    const sorted = sortModelsWithPins(models, {
      b: 100,
      d: 300,
    })
    expect(sorted.map((m) => m.model_name)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('only reorders models present in the current list', () => {
    const imageModels = [model('img-a', 'image'), model('img-b', 'image')]
    const sorted = sortModelsWithPins(imageModels, {
      'chat-pinned': 999,
      'img-b': 50,
    })
    expect(sorted.map((m) => m.model_name)).toEqual(['img-b', 'img-a'])
  })
})
