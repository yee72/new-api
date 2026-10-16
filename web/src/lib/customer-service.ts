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

/** 从 /api/status 解析客服二维码；未开启或无图时返回 null。 */
export function resolveCustomerServiceQr(status: {
  customer_service_enabled?: unknown
  customer_service_qrcode?: unknown
} | null): string | null {
  if (!status || status.customer_service_enabled !== true) return null
  const qrcode =
    typeof status.customer_service_qrcode === 'string'
      ? status.customer_service_qrcode.trim()
      : ''
  return qrcode || null
}
