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

async function renderList(messages: ModelUsageMessage[]) {
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
          'Video Preview': 'Video Preview',
          'Generated image': 'Generated image',
          'Your work is being generated...': 'Your work is being generated...',
          'Waiting to generate...': 'Waiting to generate...',
          'Waiting to load...': 'Waiting to load...',
          'Copy to clipboard': 'Copy to clipboard',
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
        busy={false}
        onDelete={vi.fn()}
        onRegenerate={vi.fn()}
        
      />
    </I18nextProvider>
  )
}

describe('ModelUsageMessageList copy actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hides Copy on video generation results even when leftover content exists', async () => {
    await renderList([
      baseMessage({
        content: 'Your work is being generated...',
        mediaType: 'video',
        videos: [{ url: '/api/model-usage/media/video.mp4' }],
        prompt: 'a cat running',
      }),
    ])

    expect(screen.getByTestId('auth-video')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('keeps Copy on visible chat text bubbles', async () => {
    await renderList([
      baseMessage({
        content: 'Hello from the model',
        mediaType: 'text',
      }),
    ])

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('keeps Copy on the user prompt in a video turn', async () => {
    await renderList([
      baseMessage({
        id: 'u1',
        role: 'user',
        content: 'a cat running',
        mediaType: 'video',
        prompt: 'a cat running',
      }),
    ])

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('shows a media frame while image generation is pending', async () => {
    await renderList([
      baseMessage({
        content: 'Your work is being generated...',
        status: 'pending',
        mediaType: 'image',
        prompt: 'cat',
      }),
    ])

    expect(screen.getByText('Waiting to generate...')).toBeInTheDocument()
    expect(
      screen.queryByText('Your work is being generated...')
    ).not.toBeInTheDocument()
  })
})
