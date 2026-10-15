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
import { render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

import { createEmptySession } from '../../stores/sessions-store'
import type { ModelUsageItem } from '../../types'
import { ModelUsageWorkspace } from '../model-usage-workspace'

vi.mock('@/features/playground/api', () => ({
  sendChatCompletion: vi.fn(),
}))

vi.mock('../../api', () => ({
  uploadModelUsageAttachment: vi.fn(),
}))

const model: ModelUsageItem = {
  id: 1,
  model_name: 'demo',
  model_type: 'chat',
  status: 1,
  created_time: 0,
  manual_usage: 0,
  actual_usage_7d: 0,
  display_usage: 0,
}

async function renderWorkspace() {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          'AI help write prompt': 'AI help write prompt',
          Send: 'Send',
          'Upload image or file attachment': 'Upload image or file attachment',
          'Enter your question or generation prompt': 'Enter prompt',
          'Ask anything about this model': 'Ask anything',
        },
      },
    },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <ModelUsageWorkspace
        model={model}
        session={createEmptySession(model)}
        isAuthenticated
        promptEnhance={{ enabled: true, model: 'enhance', max_tokens: 128 }}
        onRequireLogin={vi.fn()}
        onSend={vi.fn()}
        onDeleteTurn={vi.fn()}
        onRegenerate={vi.fn()}
        onEditUserMessage={vi.fn()}
        onImageConfigChange={vi.fn()}
        onVideoConfigChange={vi.fn()}
      />
    </I18nextProvider>
  )
}

describe('prompt enhance button', () => {
  it('keeps a square white button with a single yellow four-point star', async () => {
    await renderWorkspace()

    const button = screen.getByRole('button', { name: 'AI help write prompt' })
    expect(button.className).toContain('size-9')
    expect(button.className).toContain('rounded-md')
    expect(button.className).toContain('bg-white')

    const stars = button.querySelectorAll('svg')
    expect(stars).toHaveLength(1)
    expect(stars[0]?.getAttribute('class')).toContain('fill-yellow-400')
  })
})
