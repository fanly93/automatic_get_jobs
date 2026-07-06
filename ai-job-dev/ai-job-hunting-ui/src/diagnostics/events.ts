import { TampermonkeyApi } from '../platform/utils'

export type DiagnosticEvent = {
    type: string
    message: string
    timestamp: string
    details?: Record<string, unknown>
}

export const DIAGNOSTIC_EVENTS_STORAGE_KEY = 'diagnostic_events'
export const MAX_DIAGNOSTIC_EVENTS = 100

function readStoredEvents(): DiagnosticEvent[] {
    const stored = TampermonkeyApi.GmGetValue(DIAGNOSTIC_EVENTS_STORAGE_KEY, [])
    return Array.isArray(stored) ? stored : []
}

function writeStoredEvents(events: DiagnosticEvent[]) {
    TampermonkeyApi.GmSetValue(DIAGNOSTIC_EVENTS_STORAGE_KEY, events.slice(-MAX_DIAGNOSTIC_EVENTS))
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
    return readStoredEvents().slice(-MAX_DIAGNOSTIC_EVENTS)
}

export function recordDiagnosticEvent(type: string, message: string, details?: Record<string, unknown>) {
    const event: DiagnosticEvent = {
        type,
        message,
        timestamp: new Date().toISOString(),
    }
    if (details !== undefined) {
        event.details = details
    }
    writeStoredEvents([...readStoredEvents(), event])
}

export function clearDiagnosticEvents() {
    writeStoredEvents([])
}
