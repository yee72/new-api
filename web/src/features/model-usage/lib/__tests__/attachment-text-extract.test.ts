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
import * as XLSX from 'xlsx'

import {
  ATTACHMENT_EXTRACT_FAILED,
  EXTRACT_TEXT_MAX_CHARS,
  extractAttachmentText,
  isTextExtractableAttachment,
  truncateExtractedText,
} from '../attachment-text-extract'

describe('attachment text extract', () => {
  it('marks csv/txt/xlsx as extractable and leaves pdf alone', () => {
    expect(
      isTextExtractableAttachment({ kind: 'sheet', name: 'a.xlsx' })
    ).toBe(true)
    expect(isTextExtractableAttachment({ kind: 'doc', name: 'a.txt' })).toBe(
      true
    )
    expect(isTextExtractableAttachment({ kind: 'sheet', name: 'a.csv' })).toBe(
      true
    )
    expect(isTextExtractableAttachment({ kind: 'pdf', name: 'a.pdf' })).toBe(
      false
    )
    expect(isTextExtractableAttachment({ kind: 'image', name: 'a.png' })).toBe(
      false
    )
  })

  it('extracts csv and txt with attachment label', async () => {
    const csv = await extractAttachmentText(
      { kind: 'sheet', name: 'notes.csv' },
      new Blob(['name,age\nAda,1'], { type: 'text/csv' })
    )
    expect(csv.truncated).toBe(false)
    expect(csv.text).toContain('[Attachment: notes.csv]')
    expect(csv.text).toContain('name,age')

    const txt = await extractAttachmentText(
      { kind: 'doc', name: 'readme.txt' },
      new Blob(['hello world'], { type: 'text/plain' })
    )
    expect(txt.text).toContain('[Attachment: readme.txt]')
    expect(txt.text).toContain('hello world')
  })

  it('extracts xlsx sheets as labeled csv blocks', async () => {
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['sku', 'qty'],
      ['A1', 2],
      ['B2', 3],
    ])
    XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const result = await extractAttachmentText(
      { kind: 'sheet', name: 'stock.xlsx' },
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    )
    expect(result.text).toContain('## file: stock.xlsx')
    expect(result.text).toContain('### sheet: Inventory')
    expect(result.text).toContain('sku,qty')
    expect(result.text).toContain('A1,2')
  })

  it('truncates oversized extracted text', () => {
    const long = 'x'.repeat(EXTRACT_TEXT_MAX_CHARS + 100)
    const result = truncateExtractedText(long)
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(EXTRACT_TEXT_MAX_CHARS)
    expect(result.text).toContain(
      '[Attachment text truncated due to length limit]'
    )
  })

  it('fails closed on corrupt spreadsheet bytes', async () => {
    await expect(
      extractAttachmentText(
        { kind: 'sheet', name: 'bad.xlsx' },
        new Blob(['not-an-xlsx'], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      )
    ).rejects.toThrow(ATTACHMENT_EXTRACT_FAILED)
  })
})
