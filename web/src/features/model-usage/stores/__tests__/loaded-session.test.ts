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
import { beforeEach, describe, expect, it } from 'vitest'

import type { ModelUsageMessage } from '../../types'
import {
  createEmptySession,
  markUnresumedMessages,
  useModelUsageSessionsStore,
} from '../sessions-store'

const userMessage: ModelUsageMessage = {
  id: 'u1',
  turnId: 't1',
  role: 'user',
  content: '画一只猪',
  status: 'done',
  mediaType: 'text',
}

const pendingAssistant: ModelUsageMessage = {
  id: 'a1',
  turnId: 't1',
  role: 'assistant',
  content: 'Generating...',
  status: 'pending',
  mediaType: 'text',
}

function resetSessions() {
  useModelUsageSessionsStore.persist.clearStorage()
  useModelUsageSessionsStore.setState({
    ownerUserId: 1,
    sessions: {},
    lastModelName: '',
    revisions: {},
  })
}

describe('acceptLoadedSession', () => {
  beforeEach(() => {
    resetSessions()
  })

  it('keeps the submitted turn when a server snapshot arrives while waiting for upstream', () => {
    useModelUsageSessionsStore
      .getState()
      .patchSession('gpt-test', (session) => ({
        ...session,
        sending: true,
        messages: [userMessage, pendingAssistant],
      }))
    const captured =
      useModelUsageSessionsStore.getState().revisions['gpt-test'] ?? 0

    const accepted = useModelUsageSessionsStore
      .getState()
      .acceptLoadedSession(
        'gpt-test',
        { ...createEmptySession(), messages: [], sending: false },
        captured
      )

    const session = useModelUsageSessionsStore.getState().sessions['gpt-test']
    expect(accepted).toBe(false)
    expect(session?.sending).toBe(true)
    expect(session?.messages.map((message) => message.id)).toEqual(['u1', 'a1'])
  })

  it('ignores a server snapshot captured before the in-flight turn is saved', () => {
    const captured =
      useModelUsageSessionsStore.getState().revisions['gpt-test'] ?? 0
    useModelUsageSessionsStore
      .getState()
      .patchSession('gpt-test', (session) => ({
        ...session,
        sending: true,
        messages: [userMessage, pendingAssistant],
      }))
    useModelUsageSessionsStore.getState().hydrateSession('gpt-test', {
      ...createEmptySession(),
      sending: false,
      messages: [
        userMessage,
        { ...pendingAssistant, status: 'done', content: 'done' },
      ],
    })

    const accepted = useModelUsageSessionsStore
      .getState()
      .acceptLoadedSession(
        'gpt-test',
        { ...createEmptySession(), messages: [], sending: false },
        captured
      )

    const session = useModelUsageSessionsStore.getState().sessions['gpt-test']
    expect(accepted).toBe(false)
    expect(session?.messages.map((message) => message.content)).toEqual([
      '画一只猪',
      'done',
    ])
  })

  it('applies the server history when the model is idle', () => {
    const captured =
      useModelUsageSessionsStore.getState().revisions['gpt-test'] ?? 0

    const accepted = useModelUsageSessionsStore.getState().acceptLoadedSession(
      'gpt-test',
      {
        ...createEmptySession(),
        sending: false,
        messages: [userMessage],
      },
      captured
    )

    expect(accepted).toBe(true)
    expect(
      useModelUsageSessionsStore.getState().sessions['gpt-test']?.messages
    ).toEqual([userMessage])
  })
})

describe('markUnresumedMessages', () => {
  it('keeps the user turn and stops a chat request that cannot resume', () => {
    const settled = markUnresumedMessages(
      [userMessage, pendingAssistant],
      'Generation failed'
    )

    expect(settled[0]).toEqual(userMessage)
    expect(settled[1]).toMatchObject({
      id: 'a1',
      status: 'error',
      content: 'Generation failed',
    })
  })

  it('keeps persisted chat failure detail so the expand control can return', () => {
    const failedAssistant: ModelUsageMessage = {
      ...pendingAssistant,
      status: 'error',
      content: 'Chat request failed',
      errorDetail: 'upstream refused the model',
    }
    const settled = markUnresumedMessages(
      [userMessage, failedAssistant],
      'Generation failed'
    )

    expect(settled[1]).toMatchObject({
      status: 'error',
      content: 'Chat request failed',
      errorDetail: 'upstream refused the model',
    })
  })

  it('keeps polling a video that already has a task id', () => {
    const videoPending: ModelUsageMessage = {
      ...pendingAssistant,
      id: 'v1',
      mediaType: 'video',
      videos: [{ task_id: 'task-1' }],
    }
    const videoWithoutTask: ModelUsageMessage = {
      ...pendingAssistant,
      id: 'v2',
      mediaType: 'video',
    }

    const settled = markUnresumedMessages(
      [videoPending, videoWithoutTask],
      'Generation failed'
    )

    expect(settled[0]).toMatchObject({ id: 'v1', status: 'pending' })
    expect(settled[1]).toMatchObject({
      id: 'v2',
      status: 'error',
      content: 'Generation failed',
    })
  })
})
