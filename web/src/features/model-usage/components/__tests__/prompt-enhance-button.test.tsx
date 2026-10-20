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
          Attachment: 'Attachment',
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
  it('places a circular bold AI label above the circular send button', async () => {
    await renderWorkspace()

    const enhance = screen.getByRole('button', {
      name: 'AI help write prompt',
    })
    const send = screen.getByTitle('Send')
    const upload = screen.getByRole('button', {
      name: 'Upload image or file attachment',
    })

    expect(enhance.className).toContain('rounded-full')
    expect(enhance.className).toContain('text-blue-600')
    expect(enhance).toHaveTextContent('AI')
    expect(enhance.querySelector('span')?.className).toContain('font-bold')
    expect(send.className).toContain('rounded-full')

    // 附件在输入区左侧；AI 与发送同列且 AI 在上
    expect(upload).toHaveTextContent('Attachment')
    const column = send.closest('.flex-col')
    expect(column).toContainElement(enhance)
    expect(
      enhance.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})
