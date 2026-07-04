import {createApp} from 'vue';
import './style.css';
import 'element-plus/dist/index.css'
import PlatformFactory, {Platform} from "./platform/platform";
import App from './App.vue';
import logger, {Logger, LogLevel} from "./logging";
import {createPinia} from 'pinia'
import axios from "./axios";
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {isProdEnv} from "./utils/tools";

import {ServerStore} from "./stores/server";

type AiJobSingleton = {
    rootApp: HTMLDivElement
    attachRootApp: () => Promise<void>
    mountApp: () => void
}

declare global {
    interface Window {
        __AI_JOB_SINGLETON__?: AiJobSingleton
    }
}

const existingSingleton = window.__AI_JOB_SINGLETON__

function shouldEnableBossWebSocketHook(url: string): boolean {
    return url.includes('/web/geek/chat')
}

if (existingSingleton) {
    existingSingleton.attachRootApp()
} else {
    if (shouldEnableBossWebSocketHook(location.href)) {
        import('./webSocket/hookMain').catch(error => {
            logger.error("加载 BOSS WebSocket hook 失败", error)
        })
    }

    const app = createApp(App);
    if (!isProdEnv()) {
        Logger.setGlobalLogLevel(LogLevel.Debug)
    }
    const pinia = createPinia()
    app.use(pinia)

    // 初始化服务器检查
    const serverStore = ServerStore(pinia)
    serverStore.checkConnection()

    // 使用本地化语言包(主要是运行记录中时间筛选组件显示中文)
    app.use(ElementPlus, {
        locale: zhCn,
    })

    // 创建平台
    const platform: Platform = PlatformFactory.getInstance(location.href);
    app.provide('$platform', platform)
    app.provide('$axios', axios)

    // 挂载
    const rootApp = document.createElement('div');
    rootApp.id = "ai-job"
    rootApp.classList.add('ai-job-content');

    let appMounted = false
    let rootAttachInProgress = false
    let recoveryTimer: number | undefined
    const hostEventTypes = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']

    function stopHostPageEvent(event: Event) {
        const target = event.target as Node | null
        if (target && rootApp.contains(target)) {
            event.stopPropagation()
            event.stopImmediatePropagation()
        }
    }

    hostEventTypes.forEach(eventType => {
        rootApp.addEventListener(eventType, stopHostPageEvent)
    })

    async function attachRootApp() {
        const currentBody = document.body
        if (!currentBody || rootAttachInProgress || currentBody.contains(rootApp)) {
            return;
        }
        rootAttachInProgress = true
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
        } finally {
            rootAttachInProgress = false
        }
    }

    function startRootRecoveryObserver() {
        new MutationObserver(() => {
            const currentBody = document.body
            if (appMounted && currentBody && !currentBody.contains(rootApp)) {
                attachRootApp()
            }
        }).observe(document.documentElement, {
            childList: true,
            subtree: true,
        })

        if (recoveryTimer === undefined) {
            recoveryTimer = window.setInterval(() => {
                const currentBody = document.body
                if (appMounted && currentBody && !currentBody.contains(rootApp)) {
                    attachRootApp()
                }
            }, 1000)
        }
    }

    function mountApp() {
        if (!appMounted) {
            app.mount(rootApp)
            appMounted = true
            startRootRecoveryObserver()
        }
        attachRootApp()
    }

    window.__AI_JOB_SINGLETON__ = {
        rootApp,
        attachRootApp,
        mountApp,
    }

    if (document.readyState === 'loading') {
        window.addEventListener('load', mountApp, {once: true})
    } else {
        mountApp()
    }
}
