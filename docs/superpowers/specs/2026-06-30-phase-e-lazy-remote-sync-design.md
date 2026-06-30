# Phase E Lazy Remote Sync Design

Date: 2026-06-30

## Purpose

Phase E currently still causes repeated BOSS jobs-page rebuilds during browser verification. The latest script has already removed two major sources of side effects from the jobs page:

- WebSocket hook now loads only on `/web/geek/chat`.
- Silent login no longer auto-imports resumes when the backend user is missing.

However, the jobs page still periodically re-runs remote user config loading and silent login. When the backend user has not been initialized, the script repeatedly logs `未找到已导入用户，请手动导入简历后再使用在线功能`.

This phase will separate "server is reachable" from "current BOSS user is initialized" and make remote user sync lazy. The page should become quiet on first load while preserving online actions when the user intentionally triggers them.

## Confirmed Scope

This phase will do:

- Keep the current jobs-page `body + floating` mount.
- Keep the chat-only dynamic WebSocket hook.
- Keep the first-screen lightweight server connection check.
- Stop jobs-page first load from automatically running silent login or remote user config loading.
- Add a user sync state machine.
- Add a short-lived Tampermonkey cooldown for backend-user-missing state.
- Trigger real user sync only from strong online actions.
- Block `开始投递` when the user state is `needs-import`.
- Verify stability for 60 seconds on BOSS jobs page.
- Verify import-precondition behavior without real import or real delivery.

This phase will not do:

- It will not solve the large floating panel UX problem.
- It will not add draggable/collapsible panel behavior.
- It will not execute real resume import.
- It will not execute real job delivery.
- It will not restore reference-project auto-import behavior.
- It will not move the main userscript to `document-start`.

## Current Problems

### Multiple Automatic Remote Entrypoints

Current first load can trigger remote work from multiple places:

- `main.ts` calls `serverStore.checkConnection()`.
- `PlatformFactory.getInstance(location.href)` calls `userRemoteLoad()`.
- `AiJob.vue` setup calls `silentlyLogin("")`.

These automatic calls happen while BOSS is still initializing and can repeat when the BOSS SPA rebuilds the page.

### User Missing Is Treated As An Error Loop

The current `silentlyLogin()` correctly stopped auto-importing resumes for `code === 2000`, but the first-screen automatic callers still hit that same path repeatedly. This produces repeated failure logs and continued remote attempts until the in-memory `loginFailStatus` stops some later calls.

### Server State And User State Are Blended

The UI currently communicates mostly "online/offline", but the important distinction is:

- Server reachable: backend can respond.
- User initialized: this BOSS user has been imported/synced in backend.

The UI needs to represent both states separately.

## Design

### State Model

Introduce a user sync state that is independent from server connectivity.

Recommended user sync states:

```text
unknown
server-online
offline
checking-user
needs-import
synced
sync-failed
```

Meaning:

- `unknown`: no user sync attempt has run in this page lifecycle.
- `server-online`: backend is reachable, but current BOSS user has not been checked.
- `offline`: backend is unreachable.
- `checking-user`: a user sync attempt is in progress.
- `needs-import`: backend returned `code === 2000` for the current BOSS user.
- `synced`: silent login succeeded and remote user config was loaded.
- `sync-failed`: a non-user-missing sync failure occurred.

Server status stays in `ServerStore` and continues to represent only connectivity.

### First Screen Behavior

On BOSS jobs page load:

```text
mount UI
check server connectivity only
show local/default config
do not call silentlyLogin
do not call userRemoteLoad
do not call resume import
```

If server is online, the UI can show:

```text
服务器状态: 在线
用户状态: 未同步
```

If a valid user-missing cooldown exists, show:

```text
服务器状态: 在线
用户状态: 待导入简历
```

### Strong Online Actions

Only strong online actions should trigger real user sync:

- `导入简历`
- `开始投递`
- `AI坐席` switch
- Save preference settings
- Save/test AI config

Passive actions should not trigger user sync:

- Opening the panel
- Switching to `AI 助手`
- Switching to `运行记录`
- Switching to `使用文档`
- Viewing local/default settings

### `ensureUserReady()`

Create a single explicit gate for online actions.

Desired behavior:

```text
ensureUserReady(action)
  if server offline:
    show offline message
    block action

  if needs-import cooldown active:
    show import-required message
    block action unless action is import-resume

  if in-flight sync exists:
    await same Promise

  run silentlyLogin
  if code === 2000:
    set needs-import cooldown
    block action unless action is import-resume

  load remote user config
  set synced
  allow action
```

`导入简历` is special:

- It is allowed when state is `needs-import`.
- It is the action that can clear the `needs-import` cooldown after successful import.

### Cooldown

When silent login returns backend-user-missing (`code === 2000`):

- Save a Tampermonkey value that includes:
  - BOSS uid
  - server base URL
  - timestamp
  - state `needs-import`
- Default cooldown: 30 minutes.
- During cooldown, first screen must not retry silent login automatically.
- During cooldown, strong online actions except `导入简历` should be blocked with a clear prompt.
- Successful import clears the cooldown.

The cooldown key should be scoped by server URL and BOSS uid so that switching backend or account does not reuse a stale state.

### UI Behavior

The AI Assistant tab should show two separate statuses:

```text
服务器状态: 在线 / 离线 / 检测中
用户状态: 未同步 / 待导入简历 / 已同步 / 同步失败
```

Button behavior:

- `导入简历`: enabled when server is online.
- `开始投递`: disabled or guarded when user state is not `synced`.
- `AI坐席` switch: disabled or guarded when user state is not `synced`.

For this phase, blocking via click guard is sufficient. Full visual redesign of the panel is out of scope.

### `开始投递` Precondition

If the user clicks `开始投递` while state is `needs-import`:

- Do not start delivery.
- Do not auto-import resume.
- Do not open BOSS communication.
- Show a message such as:

```text
请先导入简历后再开始投递
```

### Error Handling

Expected failures:

- Server offline: keep local UI usable, show offline mode.
- Backend user missing: enter `needs-import`.
- Remote config request fails: fall back to local mirror if available; otherwise set `sync-failed`.
- BOSS identity not ready during user-triggered sync: wait briefly, then show a retryable error.

All repeated failures should be deduplicated enough that a BOSS SPA rebuild does not spam identical logs every few seconds.

## Files Expected To Change

Likely files:

- `ai-job-dev/ai-job-hunting-ui/src/stores/remote.ts`
  - Add explicit user sync flow, shared in-flight Promise, and cooldown handling.

- `ai-job-dev/ai-job-hunting-ui/src/utils/tools.ts`
  - Make silent login return structured outcomes or errors that callers can distinguish.

- `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`
  - Remove automatic `userRemoteLoad()` from `PlatformFactory.getInstance()`.

- `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue`
  - Remove setup-time automatic `silentlyLogin("")`.
  - Add guarded online actions.
  - Show user sync status.

- `ai-job-dev/ai-job-hunting-ui/src/components/ui/Preference.vue`
  - Ensure save actions call the user-ready gate.

- `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiConfig.vue`
  - Ensure save/test online actions call the user-ready gate.

- `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`
  - Add source-level regression checks for no first-screen jobs-page user sync.

Potential additional test files may be created if focused component tests are clearer.

## Testing Strategy

### Automated Tests

Tests should verify:

- `PlatformFactory.getInstance()` no longer calls `userRemoteLoad()` on construction.
- `AiJob.vue` no longer calls `silentlyLogin("")` in setup.
- `silentlyLogin()` no longer auto-imports resumes.
- `userRemoteLoad()` or the new sync gate deduplicates in-flight sync.
- `code === 2000` records `needs-import` instead of retrying repeatedly.
- `开始投递` is blocked when state is `needs-import`.

### Build Verification

Run:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home pnpm vitest run
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home pnpm build
```

Then copy:

```bash
cp dist/ai-job-hunting.user.js ../ai-job-hunting.user.js
```

### Browser Verification

After importing the generated userscript into Tampermonkey:

1. Open `https://www.zhipin.com/web/geek/jobs`.
2. Refresh the page.
3. Observe for 60 seconds.
4. Expected:
   - Page does not enter repeated loading loop.
   - `#ai-job` remains visible.
   - Job cards remain visible.
   - No `WS Hook Start` logs on jobs page.
   - No repeated `静默登录失败` logs on first screen.
   - No `开始自动注册` logs.
5. Click `开始投递` while user state is `needs-import`.
6. Expected:
   - Delivery does not start.
   - No BOSS communication action is triggered.
   - User sees prompt to import resume first.

Real import and real delivery are not part of this phase's verification.

## Success Criteria

This phase is complete when:

- Jobs page first screen performs only server connectivity probing.
- User sync is triggered only by strong online actions.
- Backend-user-missing state is cached for 30 minutes by server URL and BOSS uid.
- `开始投递` is blocked when the user needs import.
- Automated tests pass.
- Build passes.
- Browser verification passes for 60 seconds without repeated login/config failures.

## Risks

- Some users may expect remote preferences to appear immediately on page open. This phase intentionally prioritizes stability; preferences may show local/default state until a strong online action syncs.
- If the BOSS uid is unavailable on first screen, cooldown lookup may be delayed until a user-triggered sync.
- If UI status labels are too subtle, users may not understand why `开始投递` is blocked. The prompt must be direct.

## Out Of Scope Follow-Up

After this phase, a separate Panel UX phase should address:

- collapsed default state,
- draggable panel,
- saved panel position,
- minimizing page content obstruction,
- mobile behavior.
