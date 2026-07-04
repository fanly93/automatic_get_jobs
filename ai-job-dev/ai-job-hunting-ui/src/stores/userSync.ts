import {computed, ref} from 'vue'
import {defineStore} from 'pinia'
import {ServerStore} from './server'
import {TampermonkeyApi, Tools} from '../platform/utils'

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
