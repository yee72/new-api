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
    id: 'm1',
    turnId: 't1',
    role: 'user',
    content: 'draw a cat',
    status: 'done',
    mediaType: 'text',
    prompt: 'draw a cat',
    ...overrides,
  }
}

async function renderList(
  messages: ModelUsageMessage[],
  onEditUserMessage: (
    message: ModelUsageMessage,
    text: string
  ) => Promise<void>,
  busy = false
) {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          Edit: 'Edit',
          Cancel: 'Cancel',
          Submit: 'Submit',
          Copy: 'Copy',
          Delete: 'Delete',
          Regenerate: 'Regenerate',
          'Copied!': 'Copied!',
        },
      },
    },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <ModelUsageMessageList
        messages={messages}
        emptyHint='empty'
        busy={busy}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        onEditUserMessage={onEditUserMessage}
      />
    </I18nextProvider>
  )
}

describe('ModelUsageMessageList edit sent text', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits edited user text while the original turn stays visible', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn().mockResolvedValue(undefined)
    await renderList(
      [
        message({ id: 'u1', content: 'draw a cat' }),
        message({
          id: 'a1',
          role: 'assistant',
          content: 'Here is a cat',
        }),
      ],
      onEdit
    )

    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByRole('textbox', { name: 'Edit' })
    expect(editor).toHaveValue('draw a cat')

    await user.clear(editor)
    await user.type(editor, 'draw a dog')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', content: 'draw a cat' }),
      'draw a dog'
    )
    expect(screen.getByText('draw a cat')).toBeInTheDocument()
    expect(screen.getByText('Here is a cat')).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Edit' })
    ).not.toBeInTheDocument()
  })

  it('keeps the original text when the edit is cancelled', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn().mockResolvedValue(undefined)
    await renderList([message({ id: 'u1' })], onEdit)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByRole('textbox', { name: 'Edit' })
    await user.type(editor, ' extra')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.getByText('draw a cat')).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Edit' })
    ).not.toBeInTheDocument()
  })

  it('does not submit a blank edit', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn().mockResolvedValue(undefined)
    await renderList([message({ id: 'u1' })], onEdit)

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.clear(screen.getByRole('textbox', { name: 'Edit' }))

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('disables edit while a request is in progress', async () => {
    const onEdit = vi.fn().mockResolvedValue(undefined)
    await renderList([message({ id: 'u1' })], onEdit, true)

    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
  })
})
