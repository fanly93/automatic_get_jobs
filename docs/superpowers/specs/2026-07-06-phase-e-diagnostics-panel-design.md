# Phase E Diagnostics Panel Design

Date: 2026-07-06

## Purpose

Add a no-CDP diagnostics workflow for the Tampermonkey userscript so real BOSS page verification can continue without Playwright, Chrome Plugin, DevTools, or CDP access.

This follows the Phase E automation finding documented in `docs/phase-e/boss-automation-detection-and-verification.md`: BOSS can blank the page when active browser instrumentation attaches to or drives the site. Diagnostics must therefore be gathered by the userscript itself and copied out by the user.

## Goals

- Add a first-class `诊断` tab to the existing userscript panel.
- Let the user refresh a structured diagnostic snapshot manually.
- Let the user copy the diagnostic snapshot as JSON.
- Let the user clear diagnostics-only events without clearing normal run logs.
- Record lightweight mount/recovery events from the userscript so later snapshots explain how the panel attached to the page.
- Keep all behavior local to the browser. Do not add backend APIs or remote upload.

## Non-Goals

- Do not use Playwright, CDP, Chrome Plugin, DevTools, or automated DOM inspection on the real BOSS page.
- Do not perform BOSS actions such as import resume, start delivery, AI-seat toggles, upload, save, or send.
- Do not collect secrets such as cookies, Authorization, API keys, resume content, or chat content.
- Do not add a backend diagnostics endpoint in this phase.
- Do not change the existing BOSS mount strategy unless diagnostics reveal a separate bug later.

## User Experience

The main panel gets a new `诊断` menu item beside the existing tabs.

The diagnostics page shows:

- Current page URL and title.
- Script mount status.
- Current mount parent tag/class and whether `#ai-job` is a direct `document.body` child.
- Presence of known BOSS jobs-page containers.
- Page body summary such as body child count and whether BOSS loading text is visible.
- Server status from the existing `ServerStore`.
- User sync status from the existing `UserSyncStore`.
- Recent normal logs from `LogRecorder`.
- Recent diagnostics events.

Actions:

- `刷新快照`: rebuilds the snapshot in memory.
- `复制诊断 JSON`: writes the current snapshot to `navigator.clipboard`.
- `清空诊断事件`: clears diagnostics events only.

If clipboard write fails, the page should show a copyable text area containing the same JSON. This keeps the workflow usable under browser clipboard permission restrictions.

## Architecture

Create a small diagnostics module under `src/diagnostics/`.

`src/diagnostics/events.ts` owns a diagnostics event ring buffer stored in Tampermonkey GM storage. It records bounded events such as:

- `main:mount-app`
- `main:attach-start`
- `main:attach-success`
- `main:attach-skip`
- `main:attach-error`
- `diagnostics:snapshot`
- `diagnostics:copy`
- `diagnostics:clear-events`

Events contain:

```ts
export type DiagnosticEvent = {
    type: string
    message: string
    timestamp: string
    details?: Record<string, unknown>
}
```

`src/diagnostics/snapshot.ts` builds the structured snapshot. It only reads the current document, stores, and existing logger data.

```ts
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
    logs: Array<{ level: string; message: string; timestamp: string }>
    events: DiagnosticEvent[]
}
```

`src/components/ui/Diagnostics.vue` renders the page and calls the module functions.

`src/main.ts` records mount/recovery events at the existing mount boundaries. It must not add document-level event handlers or extra BOSS DOM writes beyond the current mount logic.

## Privacy And Safety

The snapshot must not include:

- `document.cookie`
- `localStorage.Authorization`
- AI API key
- resume text
- BOSS chat message body
- full page body text

The page body is summarized only by child count and a loading-text boolean.

The BOSS user id is represented as a boolean `bossUserIdPresent`, not the id value.

## Error Handling

- Snapshot generation should not throw into the UI. If a field cannot be read, use safe defaults and record a diagnostics event.
- Clipboard failure should not lose the snapshot. Show a fallback text area.
- GM storage read/write failures should be caught and surfaced as diagnostics events when possible.

## Testing

Use Vitest and jsdom only.

Tests should cover:

- Snapshot builder reports mount parent and avoids secret fields.
- Snapshot builder reports jobs-page containers and job-card count.
- Diagnostics event recorder stores bounded events and clears them.
- Panel includes the `诊断` tab in production mode.
- Diagnostics component can refresh, copy, and clear diagnostics events.

No real BOSS page browser automation is required or allowed for this phase.

## Build And Artifact

After implementation:

1. Run UI tests with `pnpm test`.
2. Run the userscript build with `pnpm build`.
3. Copy or sync the built userscript to `ai-job-dev/ai-job-hunting.user.js` using the existing project build output flow.
4. Verify `ai-job-dev/ai-job-hunting.user.js` contains the `诊断` tab text.

## Acceptance Criteria

- `诊断` appears in the userscript panel menu.
- Clicking `刷新快照` updates the displayed snapshot.
- Clicking `复制诊断 JSON` copies valid JSON when clipboard is available.
- If clipboard is unavailable, the JSON appears in a fallback text area.
- Clicking `清空诊断事件` removes diagnostics events and leaves normal run logs intact.
- Mount/recovery events are recorded during userscript startup and reattachment.
- No new backend endpoint is added.
- No CDP/Playwright/Chrome Plugin use is required for verification.
- Frontend tests and build pass.
