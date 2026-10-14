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
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** modelName → 置顶时间戳（毫秒）；越晚置顶越靠前 */
export type ModelUsagePins = Record<string, number>

type ModelUsagePinsState = {
  ownerUserId: number | null
  /** 按用户隔离：key 为 userId 字符串，未登录用 guest */
  pinsByUser: Record<string, ModelUsagePins>
  setOwnerUserId: (userId: number | null) => void
  togglePin: (modelName: string) => void
  isPinned: (modelName: string) => boolean
  getPinnedAt: (modelName: string) => number | undefined
  getPins: () => ModelUsagePins
}

function userKey(userId: number | null): string {
  return userId == null ? 'guest' : String(userId)
}

export const useModelUsagePinsStore = create<ModelUsagePinsState>()(
  persist(
    (set, get) => ({
      ownerUserId: null,
      pinsByUser: {},
      setOwnerUserId: (userId) => {
        if (get().ownerUserId === userId) return
        set({ ownerUserId: userId })
      },
      getPins: () => {
        const { ownerUserId, pinsByUser } = get()
        return pinsByUser[userKey(ownerUserId)] ?? {}
      },
      isPinned: (modelName) => {
        return Boolean(get().getPins()[modelName])
      },
      getPinnedAt: (modelName) => {
        return get().getPins()[modelName]
      },
      togglePin: (modelName) => {
        const name = modelName.trim()
        if (!name) return
        set((state) => {
          const key = userKey(state.ownerUserId)
          const existing = state.pinsByUser[key]
          const current: ModelUsagePins = existing ? { ...existing } : {}
          if (current[name]) {
            delete current[name]
          } else {
            current[name] = Date.now()
          }
          return {
            pinsByUser: {
              ...state.pinsByUser,
              [key]: current,
            },
          }
        })
      },
    }),
    {
      name: 'model-usage-pins',
      partialize: (state) => ({
        ownerUserId: state.ownerUserId,
        pinsByUser: state.pinsByUser,
      }),
    }
  )
)
