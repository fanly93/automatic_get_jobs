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
