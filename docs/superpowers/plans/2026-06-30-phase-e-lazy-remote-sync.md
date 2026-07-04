# Phase E Lazy Remote Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the BOSS jobs page first screen from repeatedly doing user login/config sync while preserving online capabilities behind explicit user actions.

**Architecture:** Split server connectivity from user sync. Keep the floating jobs-page assistant and chat-only WebSocket hook, add a small user-sync state store with a 30-minute backend-user-missing cooldown, and make strong online actions call one shared `ensureUserReady()` gate before they perform backend work.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest source regression tests, Tampermonkey GM storage, Element Plus notifications, Vite userscript build.

---

## File Map

- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`
  - Add source-level regression tests that fail on the current first-screen login/sync behavior.
- Create `ai-job-dev/ai-job-hunting-ui/src/stores/userSync.ts`
  - Own user-sync status, cooldown persistence, action names, and `NeedsImportError`.
- Modify `ai-job-dev/ai-job-hunting-ui/src/utils/tools.ts`
  - Make `silentlyLogin()` expose a typed backend-user-missing failure and always clear `loginIng`.
- Modify `ai-job-dev/ai-job-hunting-ui/src/stores/remote.ts`
  - Add `ensureUserReady(action)` and make `userRemoteLoad()` a compatibility wrapper around explicit sync.
- Modify `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`
  - Remove `userRemoteLoad()` from `PlatformFactory.getInstance()` so platform creation is side-effect-light.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue`
  - Remove first-screen silent login, remove connection-test auto sync/reload, and gate import/start-push/AI-seat actions.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/Preference.vue`
  - Gate the server save path in `submitForm()`.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiConfig.vue`
  - Gate save, temp save, prompt save, and test calls.
- Modify `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts` only if current component tests need an added Pinia/store mock for the new store import.
- Modify `ai-job-dev/ai-job-hunting.user.js`
  - Generated userscript artifact copied from Vite build output after tests pass.

---

### Task 1: Lock First-Screen Side Effects With Failing Tests

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts`

- [ ] **Step 1: Add failing regression tests**

Append these tests inside the existing `describe('payment UI cleanup', () => { ... })` block:

```ts
  it('does not load remote user config during platform detection', () => {
    const platform = readSource('../../../platform/platform.ts')

    expect(platform).not.toContain('import {userRemoteLoad}')
    expect(platform).not.toContain('userRemoteLoad()')
    expect(platform).toContain('userStore.platformType = platformInstance.getPlatformType()')
  })

  it('does not run silent login from the assistant first screen', () => {
    const aiJob = readSource('../AiJob.vue')

    expect(aiJob).not.toContain('silentlyLogin')
    expect(aiJob).not.toContain('页面静默登录')
    expect(aiJob).not.toContain('silentlyLogin("").catch')
  })

  it('does not sync user config or reload the page after server connection testing', () => {
    const aiJob = readSource('../AiJob.vue')

    expect(aiJob).not.toContain('userRemoteLoad')
    expect(aiJob).not.toContain('window.location.reload()')
    expect(aiJob).not.toContain('正在同步配置')
    expect(aiJob).toContain('await serverStore.checkConnection()')
  })

  it('routes strong online actions through the shared user sync gate', () => {
    const aiJob = readSource('../AiJob.vue')
    const preference = readSource('../Preference.vue')
    const aiConfig = readSource('../AiConfig.vue')

    expect(aiJob).toContain("ensureUserReady('import-resume')")
    expect(aiJob).toContain("ensureUserReady('start-push')")
    expect(aiJob).toContain("ensureUserReady('toggle-ai-seat')")
    expect(preference).toContain("ensureUserReady('save-preference')")
    expect(aiConfig).toContain("ensureUserReady('save-ai-config')")
    expect(aiConfig).toContain("ensureUserReady('test-ai-config')")
  })
```

- [ ] **Step 2: Run tests and confirm the intended failure**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: FAIL. The failing assertions should mention the current `userRemoteLoad()` call in `platform.ts`, current `silentlyLogin` usage in `AiJob.vue`, and missing `ensureUserReady(...)` calls.

- [ ] **Step 3: Commit the failing tests**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PaymentCleanup.test.ts
git commit -m "test: lock phase e lazy remote sync behavior"
```

Expected: commit succeeds with only the test file staged. If there are unrelated dirty files, leave them unstaged.

---

### Task 2: Add User Sync State And Cooldown Store

**Files:**
- Create: `ai-job-dev/ai-job-hunting-ui/src/stores/userSync.ts`

- [ ] **Step 1: Create the store**

Create `ai-job-dev/ai-job-hunting-ui/src/stores/userSync.ts` with this content:

```ts
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ServerStore } from './server'
import { TampermonkeyApi, Tools } from '../platform/utils'

export type UserSyncStatus =
    | 'unknown'
    | 'server-online'
    | 'offline'
    | 'checking-user'
    | 'needs-import'
    | 'synced'
    | 'sync-failed'

export type UserSyncAction =
    | 'import-resume'
    | 'start-push'
    | 'toggle-ai-seat'
    | 'save-preference'
    | 'save-ai-config'
    | 'test-ai-config'

export const NEEDS_IMPORT_COOLDOWN_MS = 30 * 60 * 1000

export class NeedsImportError extends Error {
    readonly code = 'NEEDS_IMPORT'

    constructor(readonly bossUserId: string) {
        super('请先导入简历后再使用在线功能')
        this.name = 'NeedsImportError'
    }
}

type NeedsImportCooldown = {
    bossUserId: string
    recordedAt: number
}

export const UserSyncStore = defineStore('user-sync', () => {
    const status = ref<UserSyncStatus>('unknown')
    const message = ref('')
    const lastCheckedAt = ref(0)
    const currentAction = ref<UserSyncAction | ''>('')

    const isBusy = computed(() => status.value === 'checking-user')
    const needsImport = computed(() => status.value === 'needs-import')
    const isReady = computed(() => status.value === 'synced')

    function getBossUserId() {
        return Tools.window?._PAGE?.uid || ''
    }

    function getNeedsImportCooldownKey(bossUserId = getBossUserId()) {
        const serverStore = ServerStore()
        const uidPart = bossUserId || 'unknown'
        return serverStore.getMirrorKey(`needs_import_${uidPart}`)
    }

    function readNeedsImportCooldown(bossUserId = getBossUserId()): NeedsImportCooldown | null {
        if (!bossUserId) {
            return null
        }
        return TampermonkeyApi.GmGetValue(getNeedsImportCooldownKey(bossUserId), null)
    }

    function hasActiveNeedsImportCooldown(bossUserId = getBossUserId()) {
        const cooldown = readNeedsImportCooldown(bossUserId)
        if (!cooldown) {
            return false
        }
        return Date.now() - cooldown.recordedAt < NEEDS_IMPORT_COOLDOWN_MS
    }

    function markChecking(action: UserSyncAction) {
        currentAction.value = action
        status.value = 'checking-user'
        message.value = '正在同步用户状态'
        lastCheckedAt.value = Date.now()
    }

    function markServerOnline() {
        if (status.value === 'unknown' || status.value === 'offline') {
            status.value = 'server-online'
        }
        message.value = '服务器在线'
    }

    function markOffline(reason = '服务器离线') {
        status.value = 'offline'
        message.value = reason
        currentAction.value = ''
        lastCheckedAt.value = Date.now()
    }

    function markNeedsImport(bossUserId = getBossUserId()) {
        status.value = 'needs-import'
        message.value = '请先导入简历后再使用在线功能'
        currentAction.value = ''
        lastCheckedAt.value = Date.now()
        if (bossUserId) {
            TampermonkeyApi.GmSetValue(getNeedsImportCooldownKey(bossUserId), {
                bossUserId,
                recordedAt: Date.now()
            } satisfies NeedsImportCooldown)
        }
    }

    function clearNeedsImport(bossUserId = getBossUserId()) {
        if (bossUserId) {
            TampermonkeyApi.GmSetValue(getNeedsImportCooldownKey(bossUserId), null)
        }
        if (status.value === 'needs-import') {
            status.value = 'server-online'
        }
        message.value = '用户状态待同步'
    }

    function markSynced() {
        status.value = 'synced'
        message.value = '用户配置已同步'
        currentAction.value = ''
        lastCheckedAt.value = Date.now()
    }

    function markSyncFailed(reason = '用户配置同步失败') {
        status.value = 'sync-failed'
        message.value = reason
        currentAction.value = ''
        lastCheckedAt.value = Date.now()
    }

    return {
        status,
        message,
        lastCheckedAt,
        currentAction,
        isBusy,
        needsImport,
        isReady,
        getBossUserId,
        getNeedsImportCooldownKey,
        readNeedsImportCooldown,
        hasActiveNeedsImportCooldown,
        markChecking,
        markServerOnline,
        markOffline,
        markNeedsImport,
        clearNeedsImport,
        markSynced,
        markSyncFailed
    }
})
```

- [ ] **Step 2: Run type checking through the build**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm run build
```

Expected: FAIL is acceptable here because later tasks still reference old code paths; this step is checking that the new file itself has no TypeScript syntax errors. If the failure points inside `src/stores/userSync.ts`, fix that file before continuing.

- [ ] **Step 3: Commit the store**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/stores/userSync.ts
git commit -m "feat: add user sync state store"
```

Expected: commit succeeds.

---

### Task 3: Make Silent Login Return A Typed Needs-Import Failure

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/utils/tools.ts`

- [ ] **Step 1: Update imports and needs-import handling**

In `ai-job-dev/ai-job-hunting-ui/src/utils/tools.ts`, add this import:

```ts
import { NeedsImportError } from "../stores/userSync"
```

Then update the `silentlyLogin` function so the backend-user-missing branch throws the typed error and `loginIng` is always cleared. The final function body must preserve the existing identity wait behavior and must contain this logic:

```ts
export const silentlyLogin = async (bossUserId: string) => {
    let loginIng = localStorage.getItem("loginIng");
    if (loginIng && loginIng === "true") {
        return Promise.reject("正在登录中")
    }
    localStorage.setItem("loginIng", "true")

    try {
        let token = Tools.getCookieValue("bst")
        bossUserId = bossUserId || Tools.window?._PAGE?.uid
        const maxIdentityWaitCount = 20
        let identityWaitCount = 0
        while ((!token || !bossUserId) && identityWaitCount < maxIdentityWaitCount) {
            await new Promise(resolve => setTimeout(resolve, 500))
            token = Tools.getCookieValue("bst")
            bossUserId = bossUserId || Tools.window?._PAGE?.uid
            identityWaitCount++
        }

        if (!token) {
            return Promise.reject("未获取到Boss token 请刷新页面重试")
        }
        if (!bossUserId) {
            return Promise.reject("未获取到Boss userId 请刷新页面重试")
        }

        const res = await axios.post("/api/user/silently/login?uniqueId=" + bossUserId, {})
        if (res.data.code == 200) {
            localStorage.setItem('Authorization', res.data.data)
            LoginStore().loginSuccess()
            return
        }
        if (res.data.code == 2000) {
            LoginStore().loginFail()
            throw new NeedsImportError(bossUserId)
        }
        LoginStore().loginFail()
        return Promise.reject(res.data.msg)
    } finally {
        localStorage.setItem("loginIng", "false")
    }
}
```

- [ ] **Step 2: Run the focused regression test**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: still FAIL because platform and component call sites are not fixed yet. The existing test `does not auto-import resumes when silent login cannot find a backend user` must pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/utils/tools.ts
git commit -m "fix: expose needs-import silent login failure"
```

Expected: commit succeeds.

---

### Task 4: Implement Explicit User Sync Gate

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/stores/remote.ts`

- [ ] **Step 1: Replace `remote.ts` with explicit sync orchestration**

Replace the contents of `ai-job-dev/ai-job-hunting-ui/src/stores/remote.ts` with:

```ts
import {LoginStore, UserStore} from "./index";
import {PreferenceConfig} from "./types";
import {ServerStore} from "./server";
import {TampermonkeyApi} from "../platform/utils";
import logging from "../logging";
import {ElMessage, silentlyLogin} from "../utils/tools"
import axios from "../axios";
import {LogRecorder} from "../logging/record";
import {NeedsImportError, UserSyncAction, UserSyncStore} from "./userSync";

const logRecorder = new LogRecorder();
let syncInFlight: Promise<boolean> | null = null;

function normalizeUserPreference() {
    const userStore = UserStore()
    if (!userStore.user.preference) {
        userStore.user.preference = {} as PreferenceConfig
    }
    userStore.user.preference.pi = userStore.user.preference.pi || 3
    userStore.user.preference.npi = userStore.user.preference.npi || 6
}

function loadUserMirror() {
    const userStore = UserStore()
    const serverStore = ServerStore()
    const mirrorKey = serverStore.getMirrorKey('user_config')
    let mirrorData = TampermonkeyApi.GmGetValue(mirrorKey, null)

    if (!mirrorData) {
        const globalMirrorKey = serverStore.getGlobalMirrorKey('user_config')
        mirrorData = TampermonkeyApi.GmGetValue(globalMirrorKey, null)
        if (mirrorData) {
            logRecorder.info("已从全局最新镜像回退加载配置")
        }
    }

    if (mirrorData) {
        userStore.user = mirrorData
        normalizeUserPreference()
        logRecorder.info("已加载本地镜像配置 (离线模式)")
        return true
    }
    return false
}

function saveUserMirror() {
    const userStore = UserStore()
    const serverStore = ServerStore()
    const mirrorKey = serverStore.getMirrorKey('user_config')
    const globalMirrorKey = serverStore.getGlobalMirrorKey('user_config')
    TampermonkeyApi.GmSetValue(mirrorKey, userStore.user)
    TampermonkeyApi.GmSetValue(globalMirrorKey, userStore.user)
}

async function performUserSync(action: UserSyncAction) {
    const userStore = UserStore()
    const loginStore = LoginStore()
    const serverStore = ServerStore()
    const userSyncStore = UserSyncStore()
    const bossUserId = userSyncStore.getBossUserId()

    if (!serverStore.isOnline) {
        userSyncStore.markOffline(serverStore.lastError || "服务器离线")
        loadUserMirror()
        ElMessage.warning("服务器离线，当前操作仅能使用本地镜像")
        return false
    }

    if (action !== 'import-resume' && bossUserId && userSyncStore.hasActiveNeedsImportCooldown(bossUserId)) {
        userSyncStore.markNeedsImport(bossUserId)
        ElMessage.warning("请先导入简历后再使用在线功能")
        return false
    }

    userSyncStore.markChecking(action)
    try {
        await silentlyLogin("")
        logging.debug("调用接口加载用户偏好配置")
        const resp = await axios.post("/api/user/userinfo", {})
        userStore.user = resp?.data?.data
        if (!userStore?.user) {
            throw new Error("用户偏好配置为空")
        }
        normalizeUserPreference()
        saveUserMirror()
        loginStore.loginSuccess()
        userSyncStore.markSynced()
        logRecorder.info("从服务器加载配置成功")
        return true
    } catch (error: any) {
        if (error instanceof NeedsImportError) {
            userSyncStore.markNeedsImport(error.bossUserId)
            loginStore.loginFail()
            ElMessage.warning("请先导入简历后再使用在线功能")
            return false
        }

        logRecorder.warn("从服务器加载配置失败，尝试读取本地镜像", error?.message || error)
        if (loadUserMirror()) {
            userSyncStore.markSyncFailed("已使用本地镜像")
            return true
        }
        loginStore.loginFail()
        userSyncStore.markSyncFailed(error?.message || "加载配置失败")
        logRecorder.error("加载配置失败：无服务器数据且无本地镜像")
        return false
    }
}

export function ensureUserReady(action: UserSyncAction) {
    if (!syncInFlight) {
        syncInFlight = performUserSync(action).finally(() => {
            syncInFlight = null
        })
    }
    return syncInFlight
}

export function userRemoteLoad() {
    logRecorder.info("加载用户偏好配置")
    return ensureUserReady('save-preference')
}
```

- [ ] **Step 2: Run tests**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: still FAIL on remaining call sites in `platform.ts`, `AiJob.vue`, `Preference.vue`, and `AiConfig.vue`.

- [ ] **Step 3: Commit**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/stores/remote.ts
git commit -m "feat: add explicit user sync gate"
```

Expected: commit succeeds.

---

### Task 5: Remove Platform And First-Screen Auto Sync

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue`

- [ ] **Step 1: Remove platform creation sync**

In `ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts`, delete this import:

```ts
import {userRemoteLoad} from "../stores/remote";
```

Then remove this statement from `PlatformFactory.getInstance(url: string)`:

```ts
userRemoteLoad()
```

The platform selection block must still assign the platform type and return the instance:

```ts
pushResultCounter = pushResultCount();
userStore = UserStore();
userStore.platformType = platformInstance.getPlatformType();
return platformInstance;
```

- [ ] **Step 2: Remove AiJob first-screen silent login and connection reload**

In `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue`, change the tools import from:

```ts
import {ElMessage, fetchWithGM_request, isProdEnv, loginInterceptor, silentlyLogin} from "../../utils/tools";
```

to:

```ts
import {ElMessage, fetchWithGM_request, isProdEnv, loginInterceptor} from "../../utils/tools";
```

Remove this import:

```ts
import {userRemoteLoad} from "../../stores/remote";
```

Replace `handleUpdateServer` with:

```ts
const handleUpdateServer = async () => {
    serverStore.setBaseUrl(tempServerUrl.value);
    await serverStore.checkConnection();
    if (serverStore.isOnline) {
        ElNotification({
            title: '连接成功',
            message: '服务器连接正常，在线功能将在使用时同步用户状态',
            type: 'success',
            duration: 3000
        });
    } else {
        ElNotification({
            title: '连接失败',
            message: serverStore.lastError || '无法访问服务器',
            type: 'error',
            duration: 3000
        });
    }
};
```

Delete the first-screen silent login block:

```ts
if (!loginStore.login && !loginStore.loginFailStatus) {
    logger.info("页面静默登录")
    silentlyLogin("").catch(_ => {
    })
}
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: the first three new tests PASS. The strong-action gate test still FAILS until action call sites are wired.

- [ ] **Step 4: Commit**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/platform/platform.ts ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue
git commit -m "fix: remove first screen remote sync"
```

Expected: commit succeeds.

---

### Task 6: Gate AiJob Strong Actions

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue`

- [ ] **Step 1: Import sync gate and store**

Add:

```ts
import {ensureUserReady} from "../../stores/remote";
import {UserSyncStore} from "../../stores/userSync";
```

After `const serverStore = ServerStore();`, add:

```ts
const userSyncStore = UserSyncStore();
```

- [ ] **Step 2: Gate resume import and clear needs-import on success**

Do not call `ensureUserReady('import-resume')` before the import request. A backend-user-missing state is exactly the condition the import action must repair.

After successful silent login following `/api/user/import/resume`, add:

```ts
    userSyncStore.clearNeedsImport(bossUserId);
    await ensureUserReady('import-resume');
```

The success tail of `handlerImport` must include:

```ts
    localStorage.setItem('Authorization', loginResp.data.data);
    userSyncStore.clearNeedsImport(bossUserId);
    await ensureUserReady('import-resume');
```

- [ ] **Step 3: Gate start push**

Change `startPush` from a synchronous function to:

```ts
const startPush = async () => {
    if (!loginInterceptor()) {
        return;
    }
    if (!await ensureUserReady('start-push')) {
        ElMessage.warning("请先导入简历后再开始投递");
        return;
    }

    platform.pushMock = mockPush.value

    pushStatus.value = PushStatus.PUSHING
    pushBtnType.value = 'warning'
    pushBtnText.value = '停止投递'

    startRecordsUpdate();

    let pushResultPromise = platform.startPush();

    pushResultPromise.then(() => {
        ElMessage({
            message: "批量投递完成",
            type: 'success',
            duration: 3000
        })
        setTimeout(() => {
            pushStatus.value = PushStatus.PAUSE;
            pushBtnType.value = 'primary'
            pushBtnText.value = '开始投递'
            stopRecordsUpdate();
        }, 200)
    })
}
```

Update `handlerPush` so the `NOT_START` and `PAUSE` cases call `void startPush()`:

```ts
const handlerPush = () => {
    switch (pushStatus.value) {
        case PushStatus.NOT_START:
            void startPush();
            break;
        case PushStatus.PUSHING:
            pausePush();
            break;
        case PushStatus.PAUSE:
            void startPush()
            break;
    }
}
```

- [ ] **Step 4: Gate AI seat toggle and revert blocked switches**

Inside `handlerAISeatStatusChange`, after `loginInterceptor()`, add:

```ts
    if (!await ensureUserReady('toggle-ai-seat')) {
        userStore.user.aiSeatStatus = firstAiSeatStatus.value
        return;
    }
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: FAIL only on missing `Preference.vue` and `AiConfig.vue` gate assertions.

- [ ] **Step 6: Commit**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/components/ui/AiJob.vue
git commit -m "feat: gate assistant online actions"
```

Expected: commit succeeds.

---

### Task 7: Gate Preference And AI Config Server Actions

**Files:**
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/Preference.vue`
- Modify: `ai-job-dev/ai-job-hunting-ui/src/components/ui/AiConfig.vue`

- [ ] **Step 1: Gate preference save**

In `Preference.vue`, add:

```ts
import {ensureUserReady} from "../../stores/remote";
```

Inside `submitForm`, after form validation succeeds and before the local mirror write, add:

```ts
    const canSync = await ensureUserReady('save-preference')
```

Then wrap the existing server POST so it only runs when `canSync` is true. The local mirror write stays before the server call:

```ts
    if (!canSync) {
        ElNotification({
            title: '保存至本地',
            message: '请先导入简历后再同步到服务器；当前配置已保存在本地镜像。',
            type: 'warning',
            duration: 4000
        });
        return;
    }

    await axios.post("/api/user/save/preference", {
        ...userStore.user,
        aiSeatStatus: userStore.user.aiSeatStatus ? 1 : 0
    })
```

- [ ] **Step 2: Gate AI config save/test actions**

In `AiConfig.vue`, add:

```ts
import {ensureUserReady} from "../../stores/remote";
```

In `handleSave`, after `if (valid) {`, add:

```ts
            const canSync = await ensureUserReady('save-ai-config')
```

Then keep the local mirror update first and skip the server POST when `canSync` is false:

```ts
            updateAiConfigMirror(form.value)
            if (!canSync) {
                ElNotification({
                    title: '保存至本地',
                    message: '请先导入简历后再同步到服务器；AI配置已保存在本地镜像',
                    type: 'warning'
                })
                return
            }
```

Apply the same pattern to `handleTempSave`.

In `handleSavePrompt`, insert before the server POST:

```ts
    const canSync = await ensureUserReady('save-ai-config')
    if (!canSync) {
        ElNotification({
            title: '保存至本地',
            message: '请先导入简历后再同步到服务器；提示词已保存在本地镜像',
            type: 'warning'
        })
        return
    }
```

In `handleTest`, after validation succeeds and before `isTestLoading.value = true`, add:

```ts
        if (!await ensureUserReady('test-ai-config')) {
            ElNotification({
                title: '无法测试',
                message: '请先导入简历后再测试AI配置',
                type: 'warning'
            })
            return;
        }
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/PaymentCleanup.test.ts
```

Expected: PASS for the full `PaymentCleanup.test.ts` file.

- [ ] **Step 4: Run component tests likely affected by new imports**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test -- src/components/ui/__tests__/Panel.test.ts src/components/ui/__tests__/PanelAiConfigNavigation.test.ts src/components/ui/__tests__/AiConfig.test.ts
```

Expected: PASS. If a test fails because Pinia is not installed or `ensureUserReady` is unmocked, update only that test file to provide the same mocks used by neighboring tests, then rerun the same command until PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add ai-job-dev/ai-job-hunting-ui/src/components/ui/Preference.vue ai-job-dev/ai-job-hunting-ui/src/components/ui/AiConfig.vue ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/Panel.test.ts ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/PanelAiConfigNavigation.test.ts ai-job-dev/ai-job-hunting-ui/src/components/ui/__tests__/AiConfig.test.ts
git commit -m "feat: gate config sync actions"
```

Expected: commit succeeds. If no test files changed, omit them from `git add`.

---

### Task 8: Full Build, Userscript Copy, And Browser Verification

**Files:**
- Modify: `ai-job-dev/ai-job-hunting.user.js`

- [ ] **Step 1: Run full frontend verification**

Run:

```bash
cd ai-job-dev/ai-job-hunting-ui
npm test
npm run build
```

Expected: both commands PASS.

- [ ] **Step 2: Copy the generated userscript artifact**

Run:

```bash
cp ai-job-dev/ai-job-hunting-ui/dist/ai-job-hunting.user.js ai-job-dev/ai-job-hunting.user.js
git diff -- ai-job-dev/ai-job-hunting.user.js | head -n 80
```

Expected: the diff shows generated userscript changes and no unrelated manual edits.

- [ ] **Step 3: Commit the generated artifact**

Run:

```bash
git add ai-job-dev/ai-job-hunting.user.js
git commit -m "build: update phase e userscript"
```

Expected: commit succeeds.

- [ ] **Step 4: Browser smoke verification on BOSS jobs page**

Use `chrome:control-chrome`. First read its `SKILL.md`, then connect to the current Chrome session. On the BOSS jobs page, reload after the updated Tampermonkey script is installed manually.

Collect these facts for 60 seconds without clicking `导入简历`, `开始投递`, `AI坐席`, save, upload, send, or BOSS communication buttons:

```js
({
  url: location.href,
  aiJobVisible: !!document.querySelector('#ai-job'),
  jobCards: document.querySelectorAll('.job-card-wrapper, .job-list-box li').length,
  hasLoadingText: document.body.innerText.includes('加载中，请稍候'),
  consoleSample: performance.now()
})
```

Expected:
- The assistant remains visible.
- Job cards remain visible after the page settles.
- Console logs do not repeat `页面静默登录`.
- Console logs do not repeat `加载用户偏好配置`.
- Console logs do not repeat `未找到已导入用户`.
- No WebSocket hook log appears on `/web/geek/job`.
- No page reload loop occurs.

- [ ] **Step 5: Manual safe-action verification**

Use only safe clicks:
- Click `连接测试`.
- Open the panel tabs such as `偏好设置`, `AI 配置`, `运行记录`, and return to `AI 助手`.

Expected:
- `连接测试` reports server connectivity and does not refresh the page.
- Opening passive tabs does not trigger user sync.
- No real import, delivery, AI-seat toggle, save, upload, debug send, or BOSS communication happens.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
git log --oneline -n 8
```

Expected: only unrelated pre-existing dirty files remain. The log includes the Phase E commits from Tasks 1-8.

---

## Self-Review Checklist

- Spec coverage:
  - Jobs-page `body + floating` mount remains unchanged.
  - Chat-only WebSocket hook remains unchanged.
  - First-screen server connectivity check stays lightweight.
  - Jobs-page first load no longer calls `silentlyLogin()` or `userRemoteLoad()`.
  - User sync state is independent from server connectivity.
  - Backend-user-missing has a 30-minute Tampermonkey cooldown scoped by server URL and BOSS uid.
  - Strong online actions call `ensureUserReady(...)`.
  - Passive actions do not sync user config.
  - `开始投递` is blocked with an import-first message when the backend user is missing.
  - Verification avoids real import/delivery/toggle/save/upload/send actions.
- Placeholder scan:
  - No step uses unspecified file paths or undefined function names.
  - Every code change step names the exact symbol and file.
- Type consistency:
  - `NeedsImportError` is exported from `stores/userSync.ts` and imported by `utils/tools.ts` and `stores/remote.ts`.
  - `ensureUserReady(action: UserSyncAction)` is exported from `stores/remote.ts`.
  - Action strings match the source regression tests exactly.
