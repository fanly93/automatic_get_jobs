import type { DiagnosticEvent } from './events'

export type DiagnosticLogEntry = {
    level: string
    message: string
    timestamp: string
}

export type DiagnosticSnapshot = {
    generatedAt: string
    page: {
        href: string
        title: string
        readyState: DocumentReadyState
        bodyChildCount: number
        bodyTextIncludesLoading: boolean
    }
    assistant: {
        mounted: boolean
        parentTag: string
        parentId: string
        parentClass: string
        bodyDirectChild: boolean
        floatingClass: boolean
    }
    bossJobsPage: {
        isJobsUrl: boolean
        containers: Record<string, boolean>
        jobCardCount: number
    }
    server: {
        baseUrl: string
        status: string
        lastError: string
    }
    userSync: {
        status: string
        message: string
        currentAction: string
        lastCheckedAt: number
        bossUserIdPresent: boolean
    }
    logs: DiagnosticLogEntry[]
    events: DiagnosticEvent[]
}

export type DiagnosticSnapshotInput = {
    server?: Partial<DiagnosticSnapshot['server']>
    userSync?: Partial<DiagnosticSnapshot['userSync']>
    logs?: DiagnosticLogEntry[]
    events?: DiagnosticEvent[]
}

const jobsContainerSelectors = [
    '.page-jobs-main',
    '.job-list-container',
    '.job-recommend-result',
    '.job-list-box',
    '.job-card-wrap',
    '.job-card-wrapper',
]

const jobCardSelectors = [
    '.job-card-wrapper',
    '.job-card-box',
    '.job-list-box li',
    '.job-card',
]

function getAssistantSnapshot() {
    const root = document.querySelector('#ai-job')
    const parent = root?.parentElement
    return {
        mounted: !!root,
        parentTag: parent?.tagName || '',
        parentId: parent?.id || '',
        parentClass: parent?.className?.toString() || '',
        bodyDirectChild: !!root && root.parentElement === document.body,
        floatingClass: !!root?.classList.contains('ai-job-floating'),
    }
}

function getBossJobsSnapshot() {
    const containers = Object.fromEntries(
        jobsContainerSelectors.map(selector => [selector, !!document.querySelector(selector)])
    )
    const jobCardCount = new Set(
        jobCardSelectors.flatMap(selector => Array.from(document.querySelectorAll(selector)))
    ).size
    return {
        isJobsUrl: location.href.includes('/web/geek/jobs'),
        containers,
        jobCardCount,
    }
}

export function buildDiagnosticSnapshot(input: DiagnosticSnapshotInput = {}): DiagnosticSnapshot {
    const body = document.body
    return {
        generatedAt: new Date().toISOString(),
        page: {
            href: location.href,
            title: document.title,
            readyState: document.readyState,
            bodyChildCount: body?.children.length || 0,
            bodyTextIncludesLoading: !!body?.innerText?.includes('加载中，请稍候'),
        },
        assistant: getAssistantSnapshot(),
        bossJobsPage: getBossJobsSnapshot(),
        server: {
            baseUrl: input.server?.baseUrl || '',
            status: input.server?.status || 'unknown',
            lastError: input.server?.lastError || '',
        },
        userSync: {
            status: input.userSync?.status || 'unknown',
            message: input.userSync?.message || '',
            currentAction: input.userSync?.currentAction || '',
            lastCheckedAt: input.userSync?.lastCheckedAt || 0,
            bossUserIdPresent: !!input.userSync?.bossUserIdPresent,
        },
        logs: input.logs || [],
        events: input.events || [],
    }
}
