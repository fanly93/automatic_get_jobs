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
