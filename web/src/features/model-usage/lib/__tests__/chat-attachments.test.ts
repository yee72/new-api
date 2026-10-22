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
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'

import {
  buildChatUserContent,
  contentPartFromAttachmentData,
  ensureDataUrlMime,
  resolveAttachmentImageDataUrls,
  usableImageAttachments,
} from '../chat-attachments'
import type { ModelUsageAttachment } from '../../types'

vi.mock('../media-download', () => ({
  fetchModelUsageMediaBlobCached: vi.fn(),
}))

import { fetchModelUsageMediaBlobCached } from '../media-download'

const fetchBlob = vi.mocked(fetchModelUsageMediaBlobCached)

afterEach(() => {
  fetchBlob.mockReset()
})

function attachment(
  overrides: Partial<ModelUsageAttachment> &
    Pick<ModelUsageAttachment, 'kind' | 'name'>
): ModelUsageAttachment {
  return {
    id: 'att-1',
    mime: 'application/octet-stream',
    size: 10,
    url: 'https://example.com/file',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }
}

describe('chat attachment content parts', () => {
  it('maps images to image_url and non-extractable documents to file', () => {
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
        { kind: 'pdf', name: 'a.pdf' },
        'data:application/pdf;base64,bb'
      )
    ).toEqual({
      type: 'file',
      file: {
        filename: 'a.pdf',
        file_data: 'data:application/pdf;base64,bb',
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

  it('builds chat content with extracted sheet text and no file part', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['item', 'count'],
        ['pen', 4],
      ]),
      'Main'
    )
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    fetchBlob.mockResolvedValue(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    )

    const content = await buildChatUserContent(
      '识别文件中的内容',
      [
        attachment({
          kind: 'sheet',
          name: 'notes.xlsx',
          mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ]
    )

    expect(typeof content).toBe('string')
    expect(content).toContain('识别文件中的内容')
    expect(content).toContain('## file: notes.xlsx')
    expect(content).toContain('item,count')
    expect(content).toContain('pen,4')
  })

  it('keeps images as multimodal parts alongside extracted text', async () => {
    fetchBlob
      .mockResolvedValueOnce(new Blob(['hello'], { type: 'text/plain' }))
      .mockResolvedValueOnce(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))

    const content = await buildChatUserContent('看图并读附件', [
      attachment({ kind: 'doc', name: 'note.txt', mime: 'text/plain' }),
      attachment({ kind: 'image', name: 'a.png', mime: 'image/png' }),
    ])

    expect(Array.isArray(content)).toBe(true)
    if (!Array.isArray(content)) return
    expect(content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('[Attachment: note.txt]'),
    })
    expect(content[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: expect.stringContaining('data:image/png') },
    })
  })

  it('resolves only non-expired image attachments to data URLs', async () => {
    fetchBlob.mockResolvedValue(
      new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' })
    )
    const expired = Math.floor(Date.now() / 1000) - 10
    expect(
      usableImageAttachments([
        attachment({ kind: 'image', name: 'ok.png', mime: 'image/png' }),
        attachment({
          kind: 'image',
          name: 'old.png',
          mime: 'image/png',
          expires_at: expired,
        }),
        attachment({ kind: 'pdf', name: 'a.pdf', mime: 'application/pdf' }),
      ])
    ).toHaveLength(1)

    const urls = await resolveAttachmentImageDataUrls([
      attachment({ kind: 'image', name: 'ok.png', mime: 'image/png' }),
      attachment({ kind: 'pdf', name: 'a.pdf', mime: 'application/pdf' }),
    ])
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('data:image/png')
  })
})
