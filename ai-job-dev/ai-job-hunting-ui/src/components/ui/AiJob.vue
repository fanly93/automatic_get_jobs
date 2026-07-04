<template>
    <!-- 服务器配置面板 -->
    <el-card class="server-config-card" shadow="hover">
        <div class="server-config-container">
            <div class="server-status">
                <el-badge :value="serverStore.isOnline ? '在线' : '离线'" :type="serverStore.isOnline ? 'success' : 'danger'">
                    <el-text size="large" strong>服务器状态</el-text>
                </el-badge>
            </div>
            <div class="server-input">
                <el-input v-model="tempServerUrl" placeholder="请输入服务器地址" class="custom-server-input">
                    <template #prepend>服务器地址</template>
                    <template #append>
                        <el-button-group class="btn-group">
                            <el-button @click="handleUpdateServer" class="test-btn">连接测试</el-button>
                            <el-tooltip content="重置为默认地址" placement="top">
                                <el-button @click="handleResetServer" class="reset-btn">
                                    <el-icon><RefreshRight /></el-icon>
                                </el-button>
                            </el-tooltip>
                        </el-button-group>
                    </template>
                </el-input>
            </div>
            <div class="server-mode-tip">
                <el-tag :type="serverStore.isOnline ? 'success' : 'warning'" effect="dark">
                    {{ serverStore.isOnline ? '在线模式：功能全开' : '本地模式：AI功能受限' }}
                </el-tag>
            </div>
        </div>
    </el-card>

    <br>

    <el-text size="large" class="mx-1" type="primary">投递成功：{{
            pushResultCounter.successCount
        }}&nbsp;&nbsp;&nbsp;
    </el-text>
    <el-text size="large" class="mx-1" type="danger"> 投递失败：{{
            pushResultCounter.failCount
        }}&nbsp;&nbsp;&nbsp;
    </el-text>
    <el-text size="large" class="mx-1"> 单次投递限制数量：</el-text>
    <el-input-number v-model="selfDefPushCountLimit" :min="-1" :max="100"
                     @change="selfDefPushCountLimitChange"/>
    <span v-if="!isProdEnv()">
        &nbsp;&nbsp;&nbsp;MOCK投递&nbsp; <el-switch v-model="mockPush"/>
    </span>
    <br>
    <br>

    <el-tooltip effect="dark" raw-content content="
    在Boss中更新了附件简历后请重新导入<p/>
    - 仅用于AI坐席定制化回复
    " placement="bottom">
        <el-button :icon="Upload as any" type="primary" @click="handlerImport"
                   :disabled="!serverStore.isOnline"
                   :loading="importResumeLoading"><p
            style="font-size: 15px">导入简历</p>
        </el-button>
    </el-tooltip>

    <el-tooltip effect="dark" raw-content content="
    先通过Boss的筛选功能圈选你的意向岗位<p/><span style='color:red;'>在【偏好设置-投递设置】中选择</span><br/>您的投递偏好，用于精准投递岗位
    " placement="bottom">
        <el-button :icon="Promotion as any" :type="pushBtnType" @click="handlerPush"><p style="font-size: 15px">
            {{ pushBtnText }}</p>
        </el-button>
    </el-tooltip>

    <el-tooltip effect="dark" raw-content content="
    AI坐席：<span style='color:red;'>支持试用，点击开关开启试用</span><br/>
    - 自动响应hr的消息,根据您的简历信息进行定制化回答。<br/>
    - 高意向职位邮件通知，快速筛选出最合适的职位。<br/>
    - 快捷发送简历，交换 wx、联系方式。<br/>
    - hr拒绝挽留，不放过每一个机会。<br/>
    " placement="bottom">
        <el-button :icon="Service as any" color="#626aef" :disabled="!serverStore.isOnline">
            <p style="font-size: 15px">
                <span>AI坐席 </span>
                <el-switch active-text="开" inactive-text="关" inline-prompt
                           style="--el-switch-on-color: #13ce66; --el-switch-off-color: #ff4949"
                           v-model="userStore.user.aiSeatStatus"
                           :disabled="!serverStore.isOnline"
                           @change="handlerAISeatStatusChange"/>
            </p>
        </el-button>
    </el-tooltip>
    <el-link type="primary" href="https://www.bilibili.com/video/BV1y6PjesEvi"  target="_blank" style="margin-left: 10px;margin-top: 10px;">点击查看AI坐席效果演示</el-link>

    <!-- 固定位置的停止投递按钮 -->
    <div v-show="pushStatus === PushStatus.PUSHING" class="fixed-stop-button">
        <!-- 实时投递运行记录显示 -->
        <div class="push-records-container">
            <div class="push-records-header">
                <span>实时投递记录</span>
            </div>
            <div class="push-records-content">
                <div v-for="(record, index) in latestPushRecords" :key="index" class="push-record-item">
                    <span class="record-time">{{ record.timestamp }}</span>
                    <span class="record-message" :class="getRecordLevelClass(record.level)">
                        {{ record.message }}
                    </span>
                </div>
                <div v-if="latestPushRecords.length === 0" class="no-records">
                    暂无投递记录
                </div>
            </div>
        </div>

        <el-button type="warning" size="large" @click="handlerFixedStopPush">
            <el-icon><CircleCloseFilled /></el-icon>
            停止投递
        </el-button>
    </div>

</template>

<script setup lang="ts">
import axiosOriginal, {AxiosInstance} from "axios";
import {CircleCloseFilled, Promotion, Service, Upload, RefreshRight} from '../icons';
import {inject, ref, onUnmounted} from "vue";
import {PushStatus} from "../../enums";
import {AbsPlatform} from "../../platform/platform";
import {Tools} from "../../platform/utils";
import {ElMessage, fetchWithGM_request, isProdEnv, loginInterceptor} from "../../utils/tools";
import logger from '../../logging'
import {pushResultCount, UserStore} from "../../stores";
import {ServerStore} from "../../stores/server";
import {ElNotification} from "element-plus";
import {LogRecorder} from "../../logging/record";
import {ensureUserReady} from "../../stores/remote";
import {UserSyncStore} from "../../stores/userSync";

const platform = inject('$platform') as AbsPlatform;
const axios = inject('$axios') as AxiosInstance
const serverStore = ServerStore();
const userSyncStore = UserSyncStore();
const tempServerUrl = ref(serverStore.baseUrl);

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

const handleResetServer = async () => {
    if (typeof serverStore.resetBaseUrl === 'function') {
        serverStore.resetBaseUrl();
        tempServerUrl.value = serverStore.baseUrl;
        ElMessage.success('已重置为默认服务器地址');
        await handleUpdateServer();
    } else {
        // 容错处理
        const DEFAULT_URL = 'http://127.0.0.1:9100';
        serverStore.setBaseUrl(DEFAULT_URL);
        tempServerUrl.value = DEFAULT_URL;
        ElMessage.success('已重置为默认服务器地址');
        await handleUpdateServer();
    }
};

const pushStatus = ref(PushStatus.NOT_START)
const pushBtnType = ref<'primary' | 'warning'>('primary')
const pushBtnText = ref<string>('开始投递')
const importResumeLoading = ref<boolean>(false);

// 创建日志记录器实例
const logRecorder = new LogRecorder();
const latestPushRecords = ref<{ level: string; message: string; timestamp: string }[]>([]);
let recordsUpdateTimer: ReturnType<typeof setInterval> | null = null;

let pushResultCounter = pushResultCount();

const userStore = UserStore();
// --------------------------------------------------函数定义-------------------------------------------------------------

// 获取最新的投递记录
const updateLatestPushRecords = () => {
    const allLogs = logRecorder.getLogs(1, logRecorder.getLogCount());
    // 筛选投递相关的日志（包含"投递"、"push"等关键词）
    const pushLogs = allLogs.filter(log =>
        log.message.toLowerCase().includes('投递') ||
        log.message.toLowerCase().includes('下一页') ||
        log.message.toLowerCase().includes('工作')
    );
    // 获取最新的5条记录，最新数据在下方
    latestPushRecords.value = pushLogs.slice(-10);
};

// 获取记录级别的样式类
const getRecordLevelClass = (level: string): string => {
    switch (level.toLowerCase()) {
        case 'error':
            return 'record-error';
        case 'warn':
            return 'record-warn';
        case 'info':
            return 'record-info';
        case 'debug':
            return 'record-debug';
        case 'trace':
            return 'record-trace';
        default:
            return 'record-info';
    }
};

// 开始定时更新记录
const startRecordsUpdate = () => {
    if (recordsUpdateTimer) {
        clearInterval(recordsUpdateTimer);
    }
    updateLatestPushRecords();
    // 每200ms更新一次
    recordsUpdateTimer = setInterval(updateLatestPushRecords, 500);
};

// 停止定时更新记录
const stopRecordsUpdate = () => {
    if (recordsUpdateTimer) {
        clearInterval(recordsUpdateTimer);
        recordsUpdateTimer = null;
    }
};

// 滚动到页面顶部
const scrollToTop = () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// --------------------------------------------------函数定义-------------------------------------------------------------


// --------------------------------------------------事件处理-------------------------------------------------------------
const handlerImport = async () => {

    if (!loginInterceptor()) {
        return;
    }
    const token = Tools.window?._PAGE?.token;
    let bossUserId = Tools.window?._PAGE?.uid
    if (!bossUserId) {
        ElMessage({
            message: "未获取到Boss userId 请刷新页面重试",
            type: 'error',
            duration: 3000
        })
        return;
    }

    importResumeLoading.value = true;
    // 获取简历id
    let resumeInfoResp = await axiosOriginal.get("https://www.zhipin.com/wapi/zpgeek/resume/sidebar.json", {headers: {"Zp_token": token}} as {})
    let zpData = resumeInfoResp.data.zpData;
    if (!zpData.attachmentList || zpData.attachmentList.length == 0) {
        importResumeLoading.value = false;
        ElMessage({
            message: "请先在BOSS个人中心上传附件简历；作为ai坐席定制化回复的基础",
            type: 'error',
            duration: 3000
        })
        return;
    }
    let resumeId = zpData.attachmentList[0].resumeId

    // 获取简历文件
    let resumeFileResp: any = await fetchWithGM_request("https://docdownload.zhipin.com/wflow/zpgeek/download/download4geek?resumeId=" + resumeId,
        {headers: {"Zp_token": token}, responseType: 'arraybuffer'} as {})
    let fileBlob = new Blob([resumeFileResp.response], {type: 'application/pdf'});

    // 导入简历
    let formData = new FormData();
    formData.append("file", fileBlob)
    formData.append("resumeId", resumeId)
    formData.append("uniqueId", bossUserId)
    let importResp = await axios.post("/api/user/import/resume", formData, {headers: {'Content-Type': "multipart/form-data"}})
    if (importResp.data.code != 200) {
        ElMessage({
            message: "导入简历失败" + importResp.data.data.msg,
            type: 'error',
            duration: 3000
        })
        importResumeLoading.value = false;
        return;
    }
    let loginResp = await axios.post("/api/user/silently/login?uniqueId=" + bossUserId)
    localStorage.setItem('Authorization', loginResp.data.data);
    userSyncStore.clearNeedsImport(bossUserId);
    await ensureUserReady('import-resume');
    if(!importResp.data.data.email){
        ElMessage({
            message: "导入简历成功；但未识别到邮箱，请在偏好设置中完善[通知邮箱]",
            type: 'warning',
            duration: 3000
        })
        importResumeLoading.value = false;
        return;
    }
    ElMessage({
        message: "导入简历成功",
        type: 'success',
        duration: 3000
    });
    importResumeLoading.value = false;
}
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

// 固定按钮停止投递处理
const handlerFixedStopPush = () => {
    pausePush();
    scrollToTop();
}

/**
 * 单次投递次数限制
 */
const selfDefPushCountLimit = ref<number>(platform.selfDefPushCountLimit);
const selfDefPushCountLimitChange = (val: number) => {
    platform.selfDefPushCountLimit = val;
}

// 非生产环境支持mock投递
const mockPush = ref<boolean>(false)

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

    // 开始更新投递记录
    startRecordsUpdate();

    let pushResultPromise = platform.startPush();

    //   投递结果处理
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
            // 停止更新投递记录
            stopRecordsUpdate();
        }, 200)
    })
}
const pausePush = () => {
    platform.pausePush()
    pushStatus.value = PushStatus.PAUSE;
    pushBtnType.value = 'primary'
    pushBtnText.value = '开始投递'
    // 停止更新投递记录
    stopRecordsUpdate();
}

const firstAiSeatStatus = ref(userStore.user.aiSeatStatus)
setTimeout(() => {
    firstAiSeatStatus.value = userStore.user.aiSeatStatus
    logger.info("firstAiSeatStatus", firstAiSeatStatus.value)
}, 1500)

const handlerAISeatStatusChange = async (val: boolean) => {
    if (firstAiSeatStatus.value == null) {
        return;
    }

    if (!loginInterceptor()) {
        return;
    }
    if (!await ensureUserReady('toggle-ai-seat')) {
        userStore.user.aiSeatStatus = firstAiSeatStatus.value
        return;
    }

    return axios.post("/api/user/save/preference", {
        aiSeatStatus: val ? 1 : 0
    }).then(resp => {
        if (val && resp.data.message && resp.data.message !== "成功") {
            ElNotification({
                message: resp.data.message,
                type: 'success',
                duration: 2000
            });
        }
    }).catch(_ => {
        userStore.user.aiSeatStatus = firstAiSeatStatus.value
    })
}
const handlerAISeatSwitchClick = async () => {
    if (firstAiSeatStatus.value == null) {
        ElMessage({
            message: "请先点击前面的AI坐席购买",
            grouping: true,
            type: 'info',
            duration: 3000
        })
    }
}


// --------------------------------------------------事件处理-------------------------------------------------------------

// --------------------------------------------------流程处理-------------------------------------------------------------

// 组件卸载时清理定时器
onUnmounted(() => {
    stopRecordsUpdate();
});

// --------------------------------------------------流程处理-------------------------------------------------------------
</script>

<style scoped>
.server-config-card {
    margin-bottom: 20px;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(10px);
    border-radius: 12px;
}

.server-config-container {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
}

.server-status {
    min-width: 120px;
}

.server-input {
    flex: 1;
    min-width: 450px;
}

:deep(.custom-server-input .el-input-group__prepend) {
    width: 100px;
    text-align: center;
    padding: 0 10px;
}

:deep(.custom-server-input .el-input-group__append) {
    padding: 0;
    width: 140px;
}

:deep(.custom-server-input .el-input-group__append .btn-group) {
    display: flex;
    height: 100%;
    width: 100%;
}

:deep(.custom-server-input .el-input-group__append .el-button) {
    border: none;
    margin: 0;
    height: 100%;
    flex: 1;
    border-radius: 0;
    display: flex;
    justify-content: center;
    align-items: center;
}

:deep(.custom-server-input .el-input-group__append .test-btn) {
    padding: 0 10px;
    border-right: 1px solid #dcdfe6;
    flex: 2;
}

:deep(.custom-server-input .el-input-group__append .reset-btn) {
    padding: 0;
    border-radius: 0 4px 4px 0;
    flex: 1;
    min-width: 40px;
}

.server-mode-tip {
    margin-left: auto;
}

.my-header {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 16px;
}

/* 固定位置的停止投递按钮样式 */
.fixed-stop-button {
    position: fixed;
    right: 80px;
    bottom: 80px;
    z-index: 9999;
    background: rgba(255, 255, 255, 0.95);
    padding: 8px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.3);
}

.fixed-stop-button:hover {
    background: rgba(255, 255, 255, 1);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}

/* 投递记录容器样式 */
.push-records-container {
    margin-bottom: 12px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    overflow: hidden;
    max-width: 400px;
}

.push-records-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 500;
    text-align: center;
}

.push-records-content {
    max-height: 200px;
    overflow-y: auto;
    padding: 8px;
}

.push-record-item {
    display: flex;
    flex-direction: column;
    margin-bottom: 8px;
    padding: 6px 8px;
    background: rgba(248, 250, 252, 0.8);
    border-radius: 4px;
    border-left: 3px solid #e2e8f0;
    font-size: 12px;
    line-height: 1.4;
}

.push-record-item:last-child {
    margin-bottom: 0;
}

.record-time {
    color: #64748b;
    font-size: 11px;
    margin-bottom: 2px;
}

.record-message {
    color: #334155;
    word-break: break-word;
}

.record-error {
    color: #dc2626;
    border-left-color: #dc2626;
}

.record-warn {
    color: #d97706;
    border-left-color: #d97706;
}

.record-info {
    color: #2563eb;
    border-left-color: #2563eb;
}

.record-debug {
    color: #059669;
    border-left-color: #059669;
}

.record-trace {
    color: #7c3aed;
    border-left-color: #7c3aed;
}

.no-records {
    text-align: center;
    color: #94a3b8;
    font-size: 12px;
    padding: 20px 0;
}

/* 滚动条样式 */
.push-records-content::-webkit-scrollbar {
    width: 4px;
}

.push-records-content::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 2px;
}

.push-records-content::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 2px;
}

.push-records-content::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3);
}
</style>
