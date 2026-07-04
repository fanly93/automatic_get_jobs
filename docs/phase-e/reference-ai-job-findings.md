# Phase E Reference Project Findings

Date: 2026-06-30

Scope: compare `reference_projects/ai-job` with the current `ai-job-dev` Phase E Tampermonkey script, focused on the BOSS jobs page reload/rebuild issue.

## Executive Summary

The original `reference_projects/ai-job` project does not appear to contain a robust solution for modern BOSS SPA rebuilds. It uses a much simpler mounting strategy, globally loads the WebSocket hook on all matched BOSS pages, and automatically imports/registers the user when silent login returns `code === 2000`.

The useful lessons from the reference project are narrower:

- Keep the main userscript at normal Tampermonkey timing; do not move the whole UI script to `document-start`.
- Keep `@connect docdownload.zhipin.com` for resume download flows.
- Keep local mirror fallback and `loginFailStatus` style failure gating.
- Keep duplicate-login protection, but improve it with a shared in-flight promise or a stronger sentinel.
- Keep WebSocket/chat machinery, but load it only where chat is needed.

The things not worth copying:

- Global `import './webSocket/hookMain'` on all BOSS pages.
- Automatic resume import/registration during silent login.
- `window.onload = ...` assignment.
- Mounting the root into BOSS-managed job-list containers such as `.job-recommend-result`.
- Short mount polling with failure paths that do not resolve.

## Current Browser Evidence

Recent BOSS jobs-page verification of the current Phase E script showed:

- The latest script loads and the assistant root appears.
- `WS Hook Start` / `ChatWebsocket` logs no longer appear on the jobs page after the current project moved the hook behind `/web/geek/chat`.
- `开始自动注册` no longer appears after the current project removed auto-import from silent login.
- The jobs page still periodically cycles through BOSS loading states.
- Each cycle re-runs user config loading and silent login, then logs `未找到已导入用户，请手动导入简历后再使用在线功能`.

This suggests the remaining issue is not inherited WebSocket hook alone. The next likely area is first-screen automatic remote login/config loading on the jobs page.

## Mounting Strategy

### Reference Project

Reference files:

- `reference_projects/ai-job/ai-job-hunting-ui/src/main.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/platform/platform.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/components/ViewRouter.vue`

Behavior:

- Creates Vue app, Pinia, ElementPlus, and platform once.
- Creates `div#ai-job` with class `page-job-content`.
- Assigns `window.onload = ...`.
- On load, mounts Vue and asynchronously calls `platform.getMountEle()` to insert the root.
- `ViewRouter.vue` calls `platform.getRenderComponent()` once and does not listen for SPA route changes.
- `BossPlatform.getMountEle()` polls every 300ms, around a short window, for host containers:
  - chat: `.chat-conversation`
  - job-recommend: `.recommend-search-inner`
  - jobs: `.job-recommend-result`
  - job detail: `.page-job-inner`
  - overseas: `.mod-header`

Reference project limitations:

- No singleton guard.
- No MutationObserver recovery.
- No route-change awareness.
- `window.onload = ...` can miss late Tampermonkey execution or overwrite existing handlers.
- Jobs page inserts into a BOSS-managed list container, which is fragile.
- Some failure paths return a detached element or do not resolve cleanly.

### Current Project

Current files:

- `ai-job-dev/ai-job-hunting-ui/src/main.ts`
- `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`
- `ai-job-dev/ai-job-hunting-ui/src/style.css`

Current improvements over reference:

- Uses `window.__AI_JOB_SINGLETON__`.
- Uses `document.readyState` plus `addEventListener('load', ..., { once: true })`.
- Adds `MutationObserver` and a 1-second recovery timer.
- Uses `ai-job-content` instead of the host-looking `page-job-content`.
- For `/web/geek/jobs`, waits for jobs-page readiness, then mounts as `body` + `floating`.
- Extends mount polling to 100 attempts and resolves to `body/documentElement` on fallback.

Potential remaining gap:

- The singleton keeps the original platform instance. SPA route changes may not rebuild platform/component state.
- `attachRootApp()` returns early when `document.body.contains(rootApp)`, so it may not migrate if the route changes while the root remains in body.
- Observer plus timer can reattach the root after BOSS deletes it, but does not itself explain why BOSS keeps rebuilding.

## Login And Remote Config Loading

### Reference Project

Reference files:

- `reference_projects/ai-job/ai-job-hunting-ui/src/main.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/platform/platform.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/stores/remote.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/utils/tools.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/components/ui/AiJob.vue`

First load automatically triggers:

- `serverStore.checkConnection()` from `main.ts`.
- `PlatformFactory.getInstance(location.href)`, which calls `userRemoteLoad()`.
- `userRemoteLoad()`, which calls `silentlyLogin()`.
- `AiJob.vue` setup, which calls another `silentlyLogin()` when `!loginStore.login && !loginStore.loginFailStatus`.

When `/api/user/silently/login` returns `code === 2000`, the reference project:

- Logs `开始自动注册`.
- Calls `handlerImport({ value: false })`.
- Then calls `loginStore.loginSuccess()`.

Important caveat:

- `handlerImport()` can return early on missing BOSS user id, missing attachment resume, or import failure.
- The outer `silentlyLogin()` can still call `loginSuccess()` even when import did not actually complete.
- This is unsafe and should not be copied.

Reference project duplicate/failure handling:

- `loginIng` waits up to `500ms * 6`.
- Already logged-in state skips another login.
- `loginFailStatus` gates some later calls.
- `userRemoteLoad()` falls back to current-server mirror, then global latest mirror, then calls `loginFail()`.

Limitations:

- `userRemoteLoad()` does not return/cache a Promise.
- `loginIng` is time-bound and not a true shared in-flight guard.
- `loginFailStatus` is in-memory and resets on page reload.
- Multiple first-load paths still exist.

### Current Project

Current files:

- `ai-job-dev/ai-job-hunting-ui/src/main.ts`
- `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`
- `ai-job-dev/ai-job-hunting-ui/src/stores/remote.ts`
- `ai-job-dev/ai-job-hunting-ui/src/utils/tools.ts`
- `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue`

Current improvements:

- Silent login waits longer for BOSS identity.
- Token can fall back to cookie `bst`.
- Requires a BOSS user id.
- `code === 2000` no longer auto-imports resumes. It rejects with a manual-import message.

Remaining inherited risk:

- First-load automatic remote paths still remain:
  - `main.ts` calls `serverStore.checkConnection()`.
  - `PlatformFactory.getInstance()` calls `userRemoteLoad()`.
  - `AiJob.vue` setup calls `silentlyLogin()` again.
- After disabling auto-import, these first-load paths now repeatedly fail for not-yet-imported users.
- Browser evidence shows those failures recurring during jobs-page rebuild cycles.

Likely useful transplant:

- Keep local mirror fallback and failure gating.
- Replace multiple automatic first-load login/config calls with a single shared/explicit flow.
- Add a stronger "backend user missing / needs manual import" sentinel so the jobs page does not keep retrying the same known-failing login path.

## WebSocket Hook And ChatWebsocket

### Reference Project

Reference files:

- `reference_projects/ai-job/ai-job-hunting-ui/src/main.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/webSocket/hookMain.ts`
- `reference_projects/ai-job/ai-job-hunting-ui/src/webSocket/protobuf.ts`

Behavior:

- `main.ts` has top-level `import './webSocket/hookMain'`.
- The userscript matches `https://www.zhipin.com/web/geek/*` and `https://www.zhipin.com/overseas/*`.
- Therefore the hook runs on all matched BOSS pages, not only chat pages.

Side effects:

- Captures original `window.WebSocket`.
- Defines `WebSocketProxy extends originalWebSocket`.
- Replaces `Tools.window.WebSocket`.
- Patches prototype `send` as a fallback.
- Installs send/receive interceptors.
- Fetches BOSS `socket.js` in source form, modifies it, and executes it with `new Function`.
- Uses `ChatWebsocketImage` as a fallback for image/read/send flows.

Risk:

- This may have worked against older BOSS page versions, but it is too broad for current pages.
- Running chat/socket machinery on non-chat pages can conflict with modern BOSS SPA initialization.

### Current Project

Current files:

- `ai-job-dev/ai-job-hunting-ui/src/main.ts`
- `ai-job-dev/ai-job-hunting-ui/src/webSocket/hookMain.ts`
- `ai-job-dev/ai-job-hunting-ui/vite.config.ts`

Current behavior:

- `hookMain` is no longer statically imported.
- It dynamically imports only when URL contains `/web/geek/chat`.
- Browser evidence confirms `WS Hook Start` no longer appears on the jobs page.

Useful reference experience:

- Keep `ChatWebsocketImage` fallback for chat/image flows.
- Keep BOSS native socket-script based send ability, but restrict it to chat context.
- Keep legacy protobuf dependency ordering and dcodeIO bridging where needed.

Do not copy:

- Global WebSocket override on all BOSS pages.

## Userscript Metadata And Built Artifacts

Reference files:

- `reference_projects/ai-job/ai-job-hunting.user.js`
- `reference_projects/ai-job/ai-job-hunting.bundle.user.js`
- `reference_projects/ai-job/ai-job-hunting-ui/vite.config.ts`
- `reference_projects/ai-job/AntiAnti-Hook.js`

Findings:

- Main reference userscripts do not specify `@run-at`.
- Match patterns:
  - `https://www.zhipin.com/web/geek/*`
  - `https://www.zhipin.com/overseas/*`
- `@connect docdownload.zhipin.com` is present.
- `unsafeWindow`, `GM_*`, and `GM_xmlhttpRequest` grants are used.
- `AntiAnti-Hook.js` is a separate script with `@run-at document-start`.

Important artifact inconsistency:

- Reference source contains `setChatWebsocket()` fetching `socket.js?v=20250313`.
- Some reference built artifacts do not match the source exactly and include different chat adapter logic.
- Reference artifact versions also differ from source config.

Implication:

- Do not assume the reference source and shipped artifacts are identical.
- The reference metadata does not contain a special main-script timing trick that explains stable jobs-page behavior.
- If anti-hook behavior is needed, keep it as a separate `document-start` script instead of moving the whole UI script earlier.

## Recommendations For Current Project

1. Keep the current jobs-page `body + floating` mount.

2. Keep the current dynamic chat-only WebSocket hook.

3. Do not restore reference auto-import behavior.

4. Add route-aware platform/component refresh.

   The current singleton prevents duplicate app creation, but it does not rebuild platform state on BOSS SPA route changes. A future fix should detect route changes and update platform/component/mount policy without recreating the whole app.

5. Reduce first-screen remote side effects on jobs pages.

   Best next design:

   - Initial jobs-page mount should show UI using local config/mirrors only.
   - It should not automatically call silent login or remote config load if the backend user is known missing.
   - Online actions such as Import Resume, Start Push, AI Seat, and Connection Test should explicitly trigger the needed login/config sync.
   - `userRemoteLoad()` should return/cache a Promise and avoid duplicate in-flight calls.
   - Add a persistent or session-level sentinel for `code === 2000` so repeated page rebuilds do not keep retrying the same known-failing path.

6. Preserve local mirror fallback.

   This is one of the few reference behaviors that remains useful after disabling auto-import.

## Final Conclusion

The original `reference_projects/ai-job` does not provide a direct fix for the current BOSS jobs-page rebuild loop. It actually contains several patterns that are risky on modern BOSS pages: global WebSocket hook, automatic resume import, and fragile `window.onload` mounting.

The best transferable lessons are defensive boundaries:

- keep UI mounting late and isolated,
- keep chat hook limited to chat,
- keep local config fallback,
- gate repeated login failures,
- and add route-aware state refresh.

The current project has already moved in the right direction for mounting and WebSocket scope. The next likely productive fix is to remove or gate automatic first-load remote login/config loading on jobs pages, replacing it with a lazy, user-action-triggered sync path plus stronger duplicate/failure guards.
