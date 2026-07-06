# Phase E Diagnostics Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-CDP `诊断` tab to the Tampermonkey panel so real BOSS page state can be exported by the userscript itself.

**Architecture:** Add a focused diagnostics module with a GM-storage event ring buffer and a pure snapshot builder. Add a Vue diagnostics tab that refreshes/copies the snapshot and wire mount/recovery events from `main.ts`. Keep real BOSS verification out of Playwright/CDP entirely.

**Tech Stack:** Vue 3, TypeScript, Pinia, Element Plus, Tampermonkey GM storage, Vitest, jsdom, vite-plugin-monkey.

---

## Working Directory

All implementation happens in the isolated worktree:

```bash
cd /Users/tanglin/VibeCoding/GetJobs/AI-Job/.worktrees/phase-e-diagnostics-panel
```

Do not use Playwright, Chrome Plugin, CDP, or DevTools against the live BOSS page while executing this plan.

## File Structure

- Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/events.ts`
  - Owns diagnostics-only GM storage.
  - Provides bounded event recording, reading, and clearing.
- Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/snapshot.ts`
  - Builds a structured diagnostic snapshot from safe page summaries and caller-supplied store/log state.
  - Does not read cookies, Authorization, API keys, resume text, chat body, or full body text.
- Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/events.test.ts`
  - Verifies event storage, bounding, and clearing.
- Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/snapshot.test.ts`
  - Verifies page/assistant/jobs summaries and secret avoidance.
- Create `ai-job-dev/ai-job-hunting-ui/src/components/ui/Diagnostics.vue`
  - Renders snapshot summary, actions, fallback JSON text area, recent logs, and diagnostics events.
- Create `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Diagnostics.test.ts`
  - Verifies refresh, clipboard copy, fallback text, and clear behavior.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/Panel.vue`
  - Adds the `诊断` tab.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts`
  - Asserts the tab is present.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PanelAiConfigNavigation.test.ts`
  - Adds a mock for the new diagnostics component so existing navigation tests stay isolated.
- Modify `ai-job-dev/ai-job-hunting-ui/src/main.ts`
  - Records mount and reattach events at existing mount boundaries only.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`
  - Adds source-level regression checks for the mount event instrumentation and no document-level BOSS control.
- Modify `ai-job-dev/ai-job-hunting.user.js`
  - Build artifact generated from `ai-job-hunting-ui/dist/*.user.js`.

## Task 1: Diagnostics Event Store

**Files:**
- Create: `ai-job-dev/ai-job-hunting-ui/src/diagnostics/events.ts`
- Create: `ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/events.test.ts`

- [ ] **Step 1: Write the failing event store tests**

Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/events.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/diagnostics/__tests__/events.test.ts
```

Expected: FAIL because `src/diagnostics/events.ts` does not exist.

- [ ] **Step 3: Implement the event store**

Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/events.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/diagnostics/__tests__/events.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add ai-job-dev/ai-job-hunting-ui/src/diagnostics/events.ts \
        ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/events.test.ts
git commit -m "feat: add diagnostics event store"
```

## Task 2: Diagnostic Snapshot Builder

**Files:**
- Create: `ai-job-dev/ai-job-hunting-ui/src/diagnostics/snapshot.ts`
- Create: `ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/snapshot.test.ts`

- [ ] **Step 1: Write the failing snapshot tests**

Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/snapshot.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDiagnosticSnapshot } from '../snapshot'

describe('diagnostic snapshot', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.pushState({}, '', '/web/geek/jobs')
    document.title = 'BOSS jobs'
  })

  it('summarizes assistant mount state without exposing secrets', () => {
    document.body.innerHTML = `
      <main class="page-jobs-main">
        <section class="job-list-container">
          <div class="job-card-wrapper">Job A</div>
        </section>
      </main>
    `
    const parent = document.querySelector('.page-jobs-main')!
    const root = document.createElement('div')
    root.id = 'ai-job'
    root.className = 'ai-job-content ai-job-floating'
    parent.appendChild(root)
    document.cookie = 'secret_cookie=value'
    localStorage.setItem('Authorization', 'Bearer secret-token')

    const snapshot = buildDiagnosticSnapshot({
      server: { baseUrl: 'http://127.0.0.1:9100', status: 'offline', lastError: '网络连接失败' },
      userSync: {
        status: 'server-online',
        message: '服务器在线',
        currentAction: '',
        lastCheckedAt: 123,
        bossUserIdPresent: true,
      },
      logs: [{ level: 'info', message: 'server checked', timestamp: '10:00:00' }],
      events: [{ type: 'main:attach-success', message: 'attached', timestamp: '2026-07-06T10:00:00.000Z' }],
    })

    expect(snapshot.assistant).toEqual({
      mounted: true,
      parentTag: 'MAIN',
      parentId: '',
      parentClass: 'page-jobs-main',
      bodyDirectChild: false,
      floatingClass: true,
    })
    expect(snapshot.bossJobsPage.isJobsUrl).toBe(true)
    expect(snapshot.bossJobsPage.containers['.page-jobs-main']).toBe(true)
    expect(snapshot.bossJobsPage.containers['.job-list-container']).toBe(true)
    expect(snapshot.bossJobsPage.jobCardCount).toBe(1)
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('secret_cookie')
    expect(serialized).not.toContain('Bearer secret-token')
  })

  it('uses safe defaults when assistant and body are absent', () => {
    document.body.innerHTML = ''

    const snapshot = buildDiagnosticSnapshot()

    expect(snapshot.assistant.mounted).toBe(false)
    expect(snapshot.assistant.parentTag).toBe('')
    expect(snapshot.page.bodyChildCount).toBe(0)
    expect(snapshot.userSync.bossUserIdPresent).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/diagnostics/__tests__/snapshot.test.ts
```

Expected: FAIL because `src/diagnostics/snapshot.ts` does not exist.

- [ ] **Step 3: Implement the snapshot builder**

Create `ai-job-dev/ai-job-hunting-ui/src/diagnostics/snapshot.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/diagnostics/__tests__/snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add ai-job-dev/ai-job-hunting-ui/src/diagnostics/snapshot.ts \
        ai-job-dev/ai-job-hunting-ui/src/diagnostics/__tests__/snapshot.test.ts
git commit -m "feat: build safe diagnostics snapshot"
```

## Task 3: Diagnostics Vue Panel

**Files:**
- Create: `ai-job-dev/ai-job-hunting-ui/src/components/ui/Diagnostics.vue`
- Create: `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Diagnostics.test.ts`

- [ ] **Step 1: Write the failing component tests**

Create `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Diagnostics.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Diagnostics from '../Diagnostics.vue'

const diagnosticEvents: Array<{ type: string; message: string; timestamp: string }> = [
  { type: 'main:attach-success', message: 'attached', timestamp: '2026-07-06T10:00:00.000Z' },
]
const clearDiagnosticEvents = vi.fn(() => {
  diagnosticEvents.length = 0
})
const recordDiagnosticEvent = vi.fn()

vi.mock('../../../diagnostics/events', () => ({
  getDiagnosticEvents: () => diagnosticEvents,
  clearDiagnosticEvents: () => clearDiagnosticEvents(),
  recordDiagnosticEvent: (...args: unknown[]) => recordDiagnosticEvent(...args),
}))

vi.mock('../../../logging/record', () => ({
  LogRecorder: class {
    getLogCount() {
      return 1
    }
    getLogs() {
      return [{ level: 'info', message: 'server checked', timestamp: '10:00:00' }]
    }
  },
}))

vi.mock('../../../platform/utils', () => ({
  TampermonkeyApi: {
    GmGetValue: (_key: string, defaultValue: unknown) => defaultValue,
    GmSetValue: vi.fn(),
  },
  Tools: {
    window: {
      _PAGE: { uid: 123 },
    },
  },
}))

describe('Diagnostics panel', () => {
  const global = {
    stubs: {
      'el-button': { template: '<button v-bind="$attrs" @click="$emit(`click`)"><slot /></button>' },
      'el-descriptions': { template: '<section><slot /></section>' },
      'el-descriptions-item': { template: '<div><slot /></div>' },
      'el-input': { props: ['modelValue'], template: '<textarea v-bind="$attrs" :value="modelValue" />' },
      'el-table': { props: ['data'], template: '<div><slot /><div v-for="(row, index) in data" :key="index">{{ row.type || row.message }}</div></div>' },
      'el-table-column': true,
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = '<div class="page-jobs-main"><div id="ai-job" class="ai-job-floating"></div></div>'
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    })
    clearDiagnosticEvents.mockClear()
    recordDiagnosticEvent.mockClear()
  })

  it('renders a refreshable diagnostic snapshot', async () => {
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    expect(wrapper.text()).toContain('诊断快照')
    expect(wrapper.text()).toContain('main:attach-success')

    await wrapper.get('[data-testid="refresh-diagnostics"]').trigger('click')
    await flushPromises()

    expect(recordDiagnosticEvent).toHaveBeenCalledWith('diagnostics:snapshot', '诊断快照已刷新')
  })

  it('copies diagnostic JSON to the clipboard', async () => {
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    await wrapper.get('[data-testid="copy-diagnostics"]').trigger('click')
    await flushPromises()

    const writeText = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>
    expect(writeText).toHaveBeenCalledOnce()
    const copied = JSON.parse(writeText.mock.calls[0][0])
    expect(copied.assistant.mounted).toBe(true)
    expect(recordDiagnosticEvent).toHaveBeenCalledWith('diagnostics:copy', '诊断 JSON 已复制')
  })

  it('shows fallback JSON when clipboard write fails', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('blocked')
        }),
      },
    })
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    await wrapper.get('[data-testid="copy-diagnostics"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="diagnostics-fallback-json"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="diagnostics-fallback-json"]').element.textContent).toContain('"assistant"')
  })

  it('clears diagnostics events without clearing normal logs', async () => {
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    await wrapper.get('[data-testid="clear-diagnostics-events"]').trigger('click')
    await flushPromises()

    expect(clearDiagnosticEvents).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('server checked')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/components/ui/__tests__/Diagnostics.test.ts
```

Expected: FAIL because `Diagnostics.vue` does not exist.

- [ ] **Step 3: Implement the Diagnostics component**

Create `ai-job-dev/ai-job-hunting-ui/src/components/ui/Diagnostics.vue`:

```vue
<template>
    <section class="diagnostics-panel">
        <div class="diagnostics-actions">
            <el-button data-testid="refresh-diagnostics" type="primary" @click="refreshSnapshot">刷新快照</el-button>
            <el-button data-testid="copy-diagnostics" type="success" @click="copySnapshot">复制诊断 JSON</el-button>
            <el-button data-testid="clear-diagnostics-events" type="warning" @click="clearEvents">清空诊断事件</el-button>
        </div>

        <el-descriptions title="诊断快照" :column="2" border>
            <el-descriptions-item label="URL">{{ snapshot.page.href }}</el-descriptions-item>
            <el-descriptions-item label="标题">{{ snapshot.page.title }}</el-descriptions-item>
            <el-descriptions-item label="脚本挂载">{{ snapshot.assistant.mounted ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="挂载父节点">{{ snapshot.assistant.parentTag }} {{ snapshot.assistant.parentClass }}</el-descriptions-item>
            <el-descriptions-item label="body 直挂">{{ snapshot.assistant.bodyDirectChild ? '是' : '否' }}</el-descriptions-item>
            <el-descriptions-item label="职位卡片数">{{ snapshot.bossJobsPage.jobCardCount }}</el-descriptions-item>
            <el-descriptions-item label="服务器状态">{{ snapshot.server.status }}</el-descriptions-item>
            <el-descriptions-item label="用户同步">{{ snapshot.userSync.status }}</el-descriptions-item>
        </el-descriptions>

        <el-input
            v-if="fallbackJson"
            data-testid="diagnostics-fallback-json"
            v-model="fallbackJson"
            class="diagnostics-json"
            type="textarea"
            :rows="10"
            readonly
        />

        <div class="diagnostics-columns">
            <div>
                <h3>最近运行日志</h3>
                <el-table :data="snapshot.logs" size="small" height="240">
                    <el-table-column prop="timestamp" label="时间" width="100" />
                    <el-table-column prop="level" label="级别" width="90" />
                    <el-table-column prop="message" label="内容" />
                </el-table>
            </div>
            <div>
                <h3>诊断事件</h3>
                <el-table :data="snapshot.events" size="small" height="240">
                    <el-table-column prop="timestamp" label="时间" width="190" />
                    <el-table-column prop="type" label="类型" width="170" />
                    <el-table-column prop="message" label="内容" />
                </el-table>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ServerStore } from '../../stores/server'
import { UserSyncStore } from '../../stores/userSync'
import { LogRecorder } from '../../logging/record'
import { buildDiagnosticSnapshot, type DiagnosticSnapshot } from '../../diagnostics/snapshot'
import { clearDiagnosticEvents, getDiagnosticEvents, recordDiagnosticEvent } from '../../diagnostics/events'

const serverStore = ServerStore()
const userSyncStore = UserSyncStore()
const logRecorder = new LogRecorder()
const fallbackJson = ref('')

function readRecentLogs() {
    const allLogs = logRecorder.getLogs(1, logRecorder.getLogCount())
    return allLogs.slice(-50)
}

function createSnapshot(): DiagnosticSnapshot {
    return buildDiagnosticSnapshot({
        server: {
            baseUrl: serverStore.baseUrl,
            status: serverStore.status,
            lastError: serverStore.lastError,
        },
        userSync: {
            status: userSyncStore.status,
            message: userSyncStore.message,
            currentAction: userSyncStore.currentAction,
            lastCheckedAt: userSyncStore.lastCheckedAt,
            bossUserIdPresent: !!userSyncStore.getBossUserId(),
        },
        logs: readRecentLogs(),
        events: getDiagnosticEvents(),
    })
}

const snapshot = ref(createSnapshot())

function refreshSnapshot() {
    recordDiagnosticEvent('diagnostics:snapshot', '诊断快照已刷新')
    snapshot.value = createSnapshot()
}

async function copySnapshot() {
    const json = JSON.stringify(snapshot.value, null, 2)
    fallbackJson.value = ''
    try {
        await navigator.clipboard.writeText(json)
        recordDiagnosticEvent('diagnostics:copy', '诊断 JSON 已复制')
    } catch (error) {
        fallbackJson.value = json
        recordDiagnosticEvent('diagnostics:copy', '剪贴板不可用，已显示备用 JSON', {
            error: error instanceof Error ? error.message : String(error),
        })
    }
    snapshot.value = createSnapshot()
}

function clearEvents() {
    recordDiagnosticEvent('diagnostics:clear-events', '诊断事件已清空')
    clearDiagnosticEvents()
    snapshot.value = createSnapshot()
}
</script>

<style scoped>
.diagnostics-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.diagnostics-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.diagnostics-json {
    margin-top: 8px;
}

.diagnostics-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
}

@media (max-width: 900px) {
    .diagnostics-columns {
        grid-template-columns: 1fr;
    }
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/components/ui/__tests__/Diagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add ai-job-dev/ai-job-hunting-ui/src/components/ui/Diagnostics.vue \
        ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Diagnostics.test.ts
git commit -m "feat: add diagnostics panel"
```

## Task 4: Register Diagnostics Tab

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/Panel.vue`
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts`
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PanelAiConfigNavigation.test.ts`

- [ ] **Step 1: Write the failing Panel test**

Add this test to `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts`:

```ts
  it('registers the diagnostics menu entry', () => {
    const wrapper = mount(Panel, {
      global: {
        stubs: {
          'el-menu': { template: '<nav><slot /></nav>' },
          'el-menu-item': { template: '<button><slot /></button>' },
        },
      },
    })

    expect(wrapper.text()).toContain('诊断')
  })
```

Also add this mock near the other component mocks in `Panel.test.ts`:

```ts
vi.mock('../Diagnostics.vue', () => ({ default: { template: '<div />' } }))
```

Add this mock near the other component mocks in `PanelAiConfigNavigation.test.ts`:

```ts
vi.mock('../Diagnostics.vue', () => ({ default: { template: '<div>Diagnostics stub</div>' } }))
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/components/ui/__tests__/Panel.test.ts src/components/ui/__tests__/PanelAiConfigNavigation.test.ts
```

Expected: FAIL because `Panel.vue` does not yet render `诊断`.

- [ ] **Step 3: Register the component in Panel.vue**

Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/Panel.vue`.

Add the import:

```ts
import Diagnostics from "./Diagnostics.vue";
```

Add the menu item after AI Config and before Use Document:

```ts
componentMap.set('5', {component: Diagnostics, name: '诊断'});
```

The registration block should become:

```ts
componentMap.set('1', {component: AiJob, name: 'AI 助手'});
componentMap.set('2', {component: Preference, name: '偏好设置'});
componentMap.set('3', {component: RunRecord, name: '运行记录'});
componentMap.set('4', {component: AiConfig, name: 'AI 配置'});
componentMap.set('5', {component: Diagnostics, name: '诊断'});
componentMap.set('6', {component: ReadMe, name: '使用文档'});
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/components/ui/__tests__/Panel.test.ts src/components/ui/__tests__/PanelAiConfigNavigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add ai-job-dev/ai-job-hunting-ui/src/components/ui/Panel.vue \
        ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts \
        ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PanelAiConfigNavigation.test.ts
git commit -m "feat: register diagnostics tab"
```

## Task 5: Mount Event Instrumentation

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/main.ts`
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`

- [ ] **Step 1: Write the failing source regression test**

Add this test to `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`:

```ts
  it('records diagnostics events at assistant mount boundaries without controlling BOSS', () => {
    const main = readSource('../../../main.ts')

    expect(main).toContain("import {recordDiagnosticEvent} from './diagnostics/events'")
    expect(main).toContain("recordDiagnosticEvent('main:mount-app'")
    expect(main).toContain("recordDiagnosticEvent('main:attach-start'")
    expect(main).toContain("recordDiagnosticEvent('main:attach-success'")
    expect(main).toContain("recordDiagnosticEvent('main:attach-error'")
    expect(main).toContain("recordDiagnosticEvent('main:reattach-request'")
    expect(main).not.toContain('document.addEventListener')
    expect(main).not.toContain('location.href =')
    expect(main).not.toContain('window.location.reload()')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: FAIL because `main.ts` does not import or call `recordDiagnosticEvent`.

- [ ] **Step 3: Add mount diagnostics to main.ts**

Modify `ai-job-dev/ai-job-hunting-ui/src/main.ts`.

Add the import:

```ts
import {recordDiagnosticEvent} from './diagnostics/events'
```

Inside `attachRootApp`, record start/success/error only after passing the early-return guard:

```ts
    async function attachRootApp() {
        const currentBody = document.body
        if (!currentBody || rootAttachInProgress || currentBody.contains(rootApp)) {
            return;
        }
        rootAttachInProgress = true
        recordDiagnosticEvent('main:attach-start', '开始挂载 AI 助手', {
            href: location.href,
            bodyChildCount: currentBody.children.length,
        })
        try {
            const elP = await platform.getMountEle()
            let containerEle = elP.el
            let p = elP.p
            rootApp.classList.toggle('ai-job-floating', p === "floating")
            if (p === "floating") {
                containerEle.appendChild(rootApp)
            } else if (p === "before") {
                containerEle.parentElement?.insertBefore(rootApp, containerEle)
            } else if (p === "end") {
                containerEle.appendChild(rootApp)
            } else {
                containerEle.insertBefore(
                    rootApp,
                    containerEle.firstElementChild
                );
            }
            recordDiagnosticEvent('main:attach-success', 'AI 助手挂载成功', {
                mode: p || 'prepend',
                parentTag: rootApp.parentElement?.tagName || '',
                parentClass: rootApp.parentElement?.className?.toString() || '',
                bodyDirectChild: rootApp.parentElement === document.body,
            })
        } catch (error) {
            recordDiagnosticEvent('main:attach-error', 'AI 助手挂载失败', {
                error: error instanceof Error ? error.message : String(error),
            })
            throw error
        } finally {
            rootAttachInProgress = false
        }
    }
```

Inside both recovery paths before `attachRootApp()`:

```ts
                recordDiagnosticEvent('main:reattach-request', '检测到 AI 助手被移除，准备重新挂载', {
                    source: 'mutation-observer',
                })
                attachRootApp()
```

and:

```ts
                    recordDiagnosticEvent('main:reattach-request', '检测到 AI 助手被移除，准备重新挂载', {
                        source: 'timer',
                    })
                    attachRootApp()
```

Inside `mountApp`, when `app.mount(rootApp)` is first called:

```ts
            recordDiagnosticEvent('main:mount-app', 'Vue 应用已挂载到 AI 助手根节点')
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm exec vitest run src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add ai-job-dev/ai-job-hunting-ui/src/main.ts \
        ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts
git commit -m "feat: record assistant mount diagnostics"
```

## Task 6: Full Verification And Userscript Artifact

**Files:**
- Modify: `ai-job-dev/ai-job-hunting.user.js`

- [ ] **Step 1: Run the complete frontend test suite**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm test
```

Expected: all test files pass. The expected count after this plan is 7 test files with all tests passing.

- [ ] **Step 2: Build the userscript**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
pnpm build
```

Expected: `vue-tsc --noEmit && vite build` completes successfully.

- [ ] **Step 3: Sync the built userscript artifact**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
BUILT_USER_SCRIPT="$(ls dist/*.user.js | head -1)"
cp "$BUILT_USER_SCRIPT" ../ai-job-hunting.user.js
```

Expected: `ai-job-dev/ai-job-hunting.user.js` is updated.

- [ ] **Step 4: Verify the userscript contains diagnostics UI text**

Run:

```bash
rg -n "诊断|刷新快照|复制诊断 JSON|清空诊断事件" ../ai-job-hunting.user.js
```

Expected: matches for all four UI strings.

- [ ] **Step 5: Verify no real BOSS automation is required**

Run:

```bash
cd /Users/tanglin/VibeCoding/GetJobs/AI-Job/.worktrees/phase-e-diagnostics-panel
rg -n "playwright|Chrome Plugin|CDP|DevTools" ai-job-dev/ai-job-hunting-ui/src ai-job-dev/ai-job-hunting.user.js || true
```

Expected: no new runtime references that automate or attach to BOSS. Documentation references are acceptable outside runtime files.

- [ ] **Step 6: Check git status**

Run:

```bash
git status --short
```

Expected: only intended source, test, and userscript artifact files are modified.

- [ ] **Step 7: Commit Task 6**

```bash
git add ai-job-dev/ai-job-hunting.user.js
git commit -m "build: sync diagnostics userscript"
```

## Task 7: Final Review

**Files:**
- No new files unless verification reveals a missing documentation update.

- [ ] **Step 1: Show final commit stack**

Run:

```bash
git log --oneline --max-count=8
```

Expected: commits include the diagnostics event store, snapshot builder, panel, tab registration, mount diagnostics, and userscript sync.

- [ ] **Step 2: Run final status check**

Run:

```bash
git status --short
```

Expected: clean worktree.

- [ ] **Step 3: Summarize verification evidence**

Report:

```text
pnpm test: passed
pnpm build: passed
userscript contains diagnostics strings: passed
no Playwright/CDP runtime dependency: passed
```

## Self-Review

- Spec coverage:
  - `诊断` tab: Task 4.
  - Refresh/copy/clear actions: Task 3.
  - Diagnostics-only events: Task 1 and Task 3.
  - Safe structured snapshot: Task 2.
  - Mount/recovery events: Task 5.
  - Build artifact: Task 6.
  - No CDP/Playwright real-page verification: Task 6.
- Placeholder scan: no placeholder steps are intentionally left in this plan.
- Type consistency:
  - `DiagnosticEvent` is defined in Task 1 and imported in Task 2.
  - `DiagnosticSnapshot` and `DiagnosticSnapshotInput` are defined in Task 2 and imported in Task 3.
  - Event function names are consistent across Tasks 1, 3, and 5.
