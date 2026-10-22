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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelUsageMessage } from '../../types'
import { ModelUsageMessageList } from '../model-usage-message-list'

vi.mock('../model-usage-auth-media', () => ({
  ModelUsageAuthImage: (props: { alt: string }) => (
    <img alt={props.alt} data-testid='auth-image' />
  ),
  ModelUsageAuthVideo: () => <video data-testid='auth-video' />,
}))

vi.mock('../model-usage-media-preview', () => ({
  ModelUsageMediaPreview: () => null,
}))

const actionLabels = ['Copy', 'Download', 'Regenerate', 'Delete'] as const

function baseMessage(overrides: Partial<ModelUsageMessage>): ModelUsageMessage {
  return {
    id: 'a1',
    turnId: 't1',
    role: 'assistant',
    content: '',
    status: 'done',
    mediaType: 'text',
    ...overrides,
  }
}

async function renderActions() {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          Copy: 'Copy',
          Download: 'Download',
          Regenerate: 'Regenerate',
          Delete: 'Delete',
          'Copied!': 'Copied!',
          'Image Preview': 'Image Preview',
          'Generated image': 'Generated image',
        },
      },
    },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <ModelUsageMessageList
        messages={[
          baseMessage({
            id: 'text-1',
            content: 'Hello from the model',
            prompt: 'draw a cat',
          }),
          baseMessage({
            id: 'image-1',
            turnId: 't2',
            content: '',
            mediaType: 'image',
            images: ['/api/model-usage/media/cat.png'],
            prompt: 'draw a cat',
          }),
        ]}
        emptyHint='empty'
        busy={false}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        
      />
    </I18nextProvider>
  )
}

describe('ModelUsageMessageList action buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the generation prompt above image works', async () => {
    await renderActions()
    // 助手出图气泡：prompt 展示在图片上方（用户气泡不重复此布局）
    expect(screen.getByText('draw a cat')).toBeInTheDocument()
  })

  it.each(actionLabels)(
    'shows the %s label only while the icon button is hovered',
    async (label) => {
      const user = userEvent.setup()
      await renderActions()

      expect(screen.queryByText(label)).not.toBeInTheDocument()
      const button = screen.getAllByRole('button', { name: label })[0]
      expect(button.querySelector('svg')).toBeInTheDocument()
      expect(button).not.toHaveTextContent(label)

      await user.hover(button)
      expect(await screen.findByText(label)).toBeVisible()

      await user.unhover(button)
      await waitFor(() =>
        expect(screen.queryByText(label)).not.toBeInTheDocument()
      )
    }
  )
})
