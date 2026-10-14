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
  contentPartFromAttachmentData,
  ensureDataUrlMime,
} from '../chat-attachments'

describe('chat attachment content parts', () => {
  it('maps images to image_url and documents to file', () => {
    expect(
      contentPartFromAttachmentData(
        { kind: 'image', name: 'a.png' },
        'data:image/png;base64,aa'
      )
    ).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,aa' },
    })
    expect(
      contentPartFromAttachmentData(
        { kind: 'sheet', name: 'notes.xlsx' },
        'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,bb'
      )
    ).toEqual({
      type: 'file',
      file: {
        filename: 'notes.xlsx',
        file_data:
          'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,bb',
      },
    })
  })

  it('rewrites octet-stream data URLs to declared mime', () => {
    expect(
      ensureDataUrlMime(
        'data:application/octet-stream;base64,abc',
        'application/pdf'
      )
    ).toBe('data:application/pdf;base64,abc')
  })
})
