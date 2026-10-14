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
import * as XLSX from 'xlsx'

import type { ModelUsageAttachment } from '../types'

/** 合并抽取文本的硬上限（字符数） */
export const EXTRACT_TEXT_MAX_CHARS = 50_000
/** xlsx 最多读取的 sheet 数 */
export const EXTRACT_SHEET_MAX_COUNT = 5
/** 每个 sheet 最多行数 */
export const EXTRACT_SHEET_MAX_ROWS = 2_000

export const ATTACHMENT_EXTRACT_FAILED = 'ATTACHMENT_EXTRACT_FAILED'

export type AttachmentTextExtractResult = {
  text: string
  truncated: boolean
}

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'csv'])
const SHEET_EXTS = new Set(['xls', 'xlsx'])

export function attachmentFileExt(
  attachment: Pick<ModelUsageAttachment, 'name'>
): string {
  const idx = attachment.name.lastIndexOf('.')
  if (idx < 0) return ''
  return attachment.name.slice(idx + 1).toLowerCase()
}

/** 表格与纯文本附件在发送前抽取为文本，不再以 file base64 上传游。 */
export function isTextExtractableAttachment(
  attachment: Pick<ModelUsageAttachment, 'kind' | 'name'>
): boolean {
  const ext = attachmentFileExt(attachment)
  if (TEXT_EXTS.has(ext) || SHEET_EXTS.has(ext)) return true
  if (attachment.kind === 'sheet') {
    return ext === '' || SHEET_EXTS.has(ext) || ext === 'csv'
  }
  if (attachment.kind === 'doc') {
    return TEXT_EXTS.has(ext)
  }
  return false
}

export function truncateExtractedText(
  text: string,
  maxChars = EXTRACT_TEXT_MAX_CHARS
): AttachmentTextExtractResult {
  if (text.length <= maxChars) {
    return { text, truncated: false }
  }
  const notice = '\n\n[Attachment text truncated due to length limit]'
  const budget = Math.max(0, maxChars - notice.length)
  return {
    text: text.slice(0, budget) + notice,
    truncated: true,
  }
}

function stripBom(raw: string): string {
  if (raw.charCodeAt(0) === 0xfeff) return raw.slice(1)
  return raw
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function rowsToCsv(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const raw = cellToString(cell)
          if (/[",\n\r]/.test(raw)) {
            return `"${raw.replace(/"/g, '""')}"`
          }
          return raw
        })
        .join(',')
    )
    .join('\n')
}

async function extractPlainText(blob: Blob): Promise<string> {
  return stripBom(await blob.text())
}

function looksLikeSpreadsheetBytes(bytes: Uint8Array, ext: string): boolean {
  if (bytes.length < 4) return false
  // xlsx / 其它 OOXML：ZIP 头 PK
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true
  // 旧版 xls：OLE CFBF 头
  if (
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return true
  }
  // 无扩展名时仅接受明确二进制头，避免把乱码当表格
  if (!ext) return false
  return false
}

async function extractSpreadsheetText(
  attachment: Pick<ModelUsageAttachment, 'name'>,
  blob: Blob
): Promise<AttachmentTextExtractResult> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const ext = attachmentFileExt(attachment)
  if (!looksLikeSpreadsheetBytes(bytes, ext)) {
    throw new Error(ATTACHMENT_EXTRACT_FAILED)
  }
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  } catch {
    throw new Error(ATTACHMENT_EXTRACT_FAILED)
  }
  if (!workbook.SheetNames.length) {
    throw new Error(ATTACHMENT_EXTRACT_FAILED)
  }

  const parts: string[] = [`## file: ${attachment.name}`]
  let truncated = false
  const sheetNames = workbook.SheetNames.slice(0, EXTRACT_SHEET_MAX_COUNT)
  if (workbook.SheetNames.length > EXTRACT_SHEET_MAX_COUNT) {
    truncated = true
  }

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date)[]>(
      sheet,
      {
        header: 1,
        defval: '',
        blankrows: false,
      }
    )
    const limitedRows = rows.slice(0, EXTRACT_SHEET_MAX_ROWS)
    if (rows.length > EXTRACT_SHEET_MAX_ROWS) {
      truncated = true
    }
    parts.push(`### sheet: ${sheetName}`)
    parts.push(rowsToCsv(limitedRows as unknown[][]))
  }

  const joined = parts.join('\n\n')
  const capped = truncateExtractedText(joined)
  return {
    text: capped.text,
    truncated: truncated || capped.truncated,
  }
}

export async function extractAttachmentText(
  attachment: Pick<ModelUsageAttachment, 'kind' | 'name'>,
  blob: Blob
): Promise<AttachmentTextExtractResult> {
  const ext = attachmentFileExt(attachment)
  try {
    if (TEXT_EXTS.has(ext)) {
      const body = await extractPlainText(blob)
      const labeled = `[Attachment: ${attachment.name}]\n${body}`
      return truncateExtractedText(labeled)
    }
    if (SHEET_EXTS.has(ext) || attachment.kind === 'sheet') {
      return await extractSpreadsheetText(attachment, blob)
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === ATTACHMENT_EXTRACT_FAILED
    ) {
      throw error
    }
    throw new Error(ATTACHMENT_EXTRACT_FAILED)
  }
  throw new Error(ATTACHMENT_EXTRACT_FAILED)
}
