import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, unknown>()

vi.mock('../../platform/utils', () => ({
  TampermonkeyApi: {
    GmGetValue: vi.fn((key: string, defaultValue: unknown) => {
      return storage.has(key) ? storage.get(key) : defaultValue
    }),
    GmSetValue: vi.fn((key: string, value: unknown) => {
      storage.set(key, value)
    }),
  },
}))

import {
  clearDiagnosticEvents,
  DIAGNOSTIC_EVENTS_STORAGE_KEY,
  getDiagnosticEvents,
  MAX_DIAGNOSTIC_EVENTS,
  recordDiagnosticEvent,
} from '../events'

describe('diagnostic events', () => {
  beforeEach(() => {
    storage.clear()
    vi.setSystemTime(new Date('2026-07-06T10:00:00.000Z'))
  })

  it('records diagnostics events in GM storage', () => {
    recordDiagnosticEvent('main:mount-app', 'mounted', { parentClass: 'page-jobs-main' })

    expect(storage.get(DIAGNOSTIC_EVENTS_STORAGE_KEY)).toEqual([
      {
        type: 'main:mount-app',
        message: 'mounted',
        timestamp: '2026-07-06T10:00:00.000Z',
        details: { parentClass: 'page-jobs-main' },
      },
    ])
  })

  it('returns the newest bounded events', () => {
    for (let index = 0; index < MAX_DIAGNOSTIC_EVENTS + 5; index += 1) {
      recordDiagnosticEvent('diagnostics:snapshot', `snapshot-${index}`)
    }

    const events = getDiagnosticEvents()

    expect(events).toHaveLength(MAX_DIAGNOSTIC_EVENTS)
    expect(events[0].message).toBe('snapshot-5')
    expect(events.at(-1)?.message).toBe(`snapshot-${MAX_DIAGNOSTIC_EVENTS + 4}`)
  })

  it('clears diagnostics events without touching unrelated storage keys', () => {
    storage.set('logs_data', [{ level: 'info', message: 'keep me', timestamp: '10:00:00' }])
    recordDiagnosticEvent('main:attach-success', 'attached')

    clearDiagnosticEvents()

    expect(getDiagnosticEvents()).toEqual([])
    expect(storage.get('logs_data')).toEqual([{ level: 'info', message: 'keep me', timestamp: '10:00:00' }])
  })
})
