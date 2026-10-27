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
import { describe, expect, it } from 'vitest'

import { ModelUsageChatFailureCard } from '../model-usage-chat-failure-card'

async function renderCard(detail?: string) {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: {
        translation: {
          'Show error details': 'Show error details',
          'Hide error details': 'Hide error details',
        },
      },
    },
  })
  return render(
    <I18nextProvider i18n={i18n}>
      <ModelUsageChatFailureCard
        title="This request didn't go through. Please try again later."
        detail={detail}
      />
    </I18nextProvider>
  )
}

describe('ModelUsageChatFailureCard', () => {
  it('keeps the expand control inside the bubble to the right of the title', async () => {
    await renderCard('upstream refused the model')

    const expand = screen.getByRole('button', { name: 'Show error details' })
    const title = screen.getByText(
      "This request didn't go through. Please try again later."
    )
    expect(
      expand.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy()
    expect(expand.closest('.rounded-2xl')).toContainElement(title)
    expect(
      screen.queryByText('upstream refused the model')
    ).not.toBeInTheDocument()
  })

  it('shows pink title row and plain detail row after expand', async () => {
    const user = userEvent.setup()
    await renderCard('upstream refused the model')

    await user.click(screen.getByRole('button', { name: 'Show error details' }))

    const title = screen.getByText(
      "This request didn't go through. Please try again later."
    )
    const detail = screen.getByText('upstream refused the model')
    expect(title).toBeVisible()
    expect(detail).toBeVisible()

    const titleRow = title.parentElement
    expect(titleRow?.className).toContain('bg-destructive/10')
    expect(detail.parentElement?.className).toContain('bg-transparent')
    expect(detail.parentElement?.className).toContain('text-destructive')
    expect(
      screen.getByRole('button', { name: 'Hide error details' })
    ).toBeInTheDocument()
  })

  it('hides the expand control when there is no distinct detail', async () => {
    await renderCard()
    expect(
      screen.queryByRole('button', { name: 'Show error details' })
    ).not.toBeInTheDocument()
  })
})
