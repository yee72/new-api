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
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ModelUsageMessage } from '../../types'
import { ModelUsageMessageList } from '../model-usage-message-list'

vi.mock('../model-usage-auth-media', () => ({
  ModelUsageAuthImage: () => null,
  ModelUsageAuthVideo: () => null,
}))

vi.mock('../model-usage-media-preview', () => ({
  ModelUsageMediaPreview: () => null,
}))

function message(overrides: Partial<ModelUsageMessage>): ModelUsageMessage {
  return {
    id: 'u1',
    turnId: 't1',
    role: 'user',
    content: 'draw a cat',
    status: 'done',
    mediaType: 'text',
    prompt: 'draw a cat',
    ...overrides,
  }
}

async function renderList(onDelete: (turnId: string) => void) {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          Delete: 'Delete',
          Cancel: 'Cancel',
          'Delete this turn?': 'Delete this turn?',
          'This will delete the question and its reply. This action cannot be undone.':
            'This will delete the question and its reply. This action cannot be undone.',
          Copy: 'Copy',
          Regenerate: 'Regenerate',
          Edit: 'Edit',
        },
      },
    },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <ModelUsageMessageList
        messages={[
          message({ id: 'u1' }),
          message({
            id: 'a1',
            role: 'assistant',
            content: 'Here is a cat',
          }),
        ]}
        emptyHint='empty'
        busy={false}
        onDelete={onDelete}
        onRegenerate={vi.fn()}
      />
    </I18nextProvider>
  )
}

describe('ModelUsageMessageList delete confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks for confirmation before deleting a turn', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    await renderList(onDelete)

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])

    expect(
      await screen.findByRole('heading', { name: 'Delete this turn?' })
    ).toBeVisible()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('t1')
  })

  it('does not delete when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    await renderList(onDelete)

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('heading', { name: 'Delete this turn?' })
    ).not.toBeInTheDocument()
  })
})
