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

import { resolveCustomerServiceQr } from '@/lib/customer-service'

describe('resolveCustomerServiceQr', () => {
  it('returns null when disabled or missing image', () => {
    expect(resolveCustomerServiceQr(null)).toBeNull()
    expect(
      resolveCustomerServiceQr({
        customer_service_enabled: false,
        customer_service_qrcode: 'https://example.com/qr.png',
      })
    ).toBeNull()
    expect(
      resolveCustomerServiceQr({
        customer_service_enabled: true,
        customer_service_qrcode: '  ',
      })
    ).toBeNull()
  })

  it('returns trimmed image when enabled', () => {
    expect(
      resolveCustomerServiceQr({
        customer_service_enabled: true,
        customer_service_qrcode: ' https://example.com/qr.png ',
      })
    ).toBe('https://example.com/qr.png')
  })
})
