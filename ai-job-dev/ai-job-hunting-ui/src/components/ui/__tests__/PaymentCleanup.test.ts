import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

function readSource(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('payment UI cleanup', () => {
  it('does not render QR-code payment flows from the UI source', () => {
    const aiJob = readSource('../AiJob.vue')
    const product = readSource('../Product.vue')
    const qrCodeField = ['qr', 'Code', 'Base64'].join('')

    expect(aiJob).not.toContain(qrCodeField)
    expect(product).not.toContain(qrCodeField)
  })

  it('does not mount the product purchase dialog globally', () => {
    const app = readSource('../../../App.vue')

    expect(app).not.toContain('Product')
  })

  it('does not expose product purchase entries from the assistant panel', () => {
    const aiJob = readSource('../AiJob.vue')
    const preference = readSource('../Preference.vue')

    expect(aiJob).not.toContain('产品列表')
    expect(aiJob).not.toContain('/api/product/user/product/list')
    expect(preference).not.toContain('未在【产品列表】中购买')
  })

  it('does not open the product purchase dialog from 5001 responses', () => {
    const axiosSource = readSource('../../../axios.ts')

    expect(axiosSource).not.toContain('PRODUCT_NOT_AUTHORIZED')
    expect(axiosSource).not.toContain('setShowProduct')
  })

  it('bundles protobufjs into the userscript instead of relying on a CDN global', () => {
    const viteConfig = readSource('../../../../vite.config.ts')

    expect(viteConfig).not.toContain('protobufjs: cdn')
  })

  it('marks the userscript as a local build newer than the upstream install', () => {
    const viteConfig = readSource('../../../../vite.config.ts')

    expect(viteConfig).toContain("version: '0.0.27-local'")
  })

  it('loads legacy dcodeIO ProtoBuf for the injected BOSS socket script', () => {
    const viteConfig = readSource('../../../../vite.config.ts')
    const hookMain = readSource('../../../webSocket/hookMain.ts')

    expect(viteConfig).toContain('bytebuffer@5.0.1/dist/bytebuffer.min.js')
    expect(viteConfig).toContain('protobufjs@5.0.3/dist/protobuf.min.js')
    expect(viteConfig.indexOf('bytebuffer@5.0.1')).toBeLessThan(viteConfig.indexOf('protobufjs@5.0.3'))
    expect(hookMain).toContain('(window as any).dcodeIO')
    expect(hookMain).toContain('(globalThis as any).dcodeIO')
    expect(hookMain).toContain('(self as any).dcodeIO')
    expect(hookMain).toContain('declare const dcodeIO')
    expect(hookMain).toContain("typeof dcodeIO !== 'undefined'")
    expect(hookMain).toContain('Tools.window.dcodeIO = legacyDcodeIO')
  })

  it('injects the BOSS socket query helper used during ChatWebsocket init', () => {
    const hookMain = readSource('../../../webSocket/hookMain.ts')

    expect(hookMain).toContain('function getQueryString(name)')
    expect(hookMain).toContain('new URLSearchParams(Tools.window.location.search)')
    expect(hookMain).toContain("const dcodeIO = Tools.window.dcodeIO;\\nfunction getQueryString")
  })

  it('mounts the assistant even when Tampermonkey runs after window load', () => {
    const main = readSource('../../../main.ts')

    expect(main).toContain('function mountApp()')
    expect(main).toContain("document.readyState === 'loading'")
    expect(main).toContain("window.addEventListener('load', mountApp, {once: true})")
    expect(main).toContain('mountApp()')
  })

  it('reattaches the assistant panel when the BOSS SPA removes its mount node', () => {
    const main = readSource('../../../main.ts')

    expect(main).toContain('let appMounted = false')
    expect(main).toContain('async function attachRootApp()')
    expect(main).toContain('const currentBody = document.body')
    expect(main).toContain('currentBody.contains(rootApp)')
    expect(main).not.toContain('document.body.contains(rootApp)')
    expect(main).toContain('new MutationObserver')
    expect(main).toContain('document.documentElement')
    expect(main).toContain('window.setInterval')
    expect(main).toContain('attachRootApp()')
  })

  it('guards the assistant against duplicate userscript injection on BOSS SPA redraws', () => {
    const main = readSource('../../../main.ts')

    expect(main).toContain('__AI_JOB_SINGLETON__')
    expect(main).toContain('existingSingleton')
    expect(main).toContain('existingSingleton.attachRootApp()')
  })

  it('does not mark the assistant root as a native BOSS job content node', () => {
    const main = readSource('../../../main.ts')

    expect(main).not.toContain("rootApp.classList.add('page-job-content')")
    expect(main).toContain("rootApp.classList.add('ai-job-content')")
  })

  it('waits for the BOSS SPA containers before giving up mounting', () => {
    const platform = readSource('../../../platform/platform.ts')

    expect(platform).toContain('const maxMountAttempts = 100')
    expect(platform).toContain('resolve({')
    expect(platform).toContain('el: document.body')
  })

  it('mounts the jobs page assistant under a BOSS container instead of body', () => {
    const main = readSource('../../../main.ts')
    const platform = readSource('../../../platform/platform.ts')
    const style = readSource('../../../style.css')

    expect(platform).toContain('getJobsPageMountContainer')
    expect(platform).toContain('element = this.getJobsPageMountContainer()')
    expect(platform).not.toContain('element = document.body')
    expect(platform).toContain('p = "floating"')
    expect(platform).toContain('isJobsPageReady')
    expect(platform).toContain('body.innerText.includes("加载中，请稍候")')
    expect(main).toContain("rootApp.classList.toggle('ai-job-floating', p === \"floating\")")
    expect(main).toContain('containerEle.appendChild(rootApp)')
    expect(main).not.toContain('currentBody.appendChild(rootApp)')
    expect(style).toContain('.ai-job-floating')
  })

  it('stops assistant events before they bubble into BOSS page handlers', () => {
    const main = readSource('../../../main.ts')

    expect(main).toContain('function stopHostPageEvent')
    expect(main).toContain('rootApp.contains(target)')
    expect(main).toContain('event.stopImmediatePropagation()')
    expect(main).toContain('rootApp.addEventListener(eventType, stopHostPageEvent)')
    expect(main).not.toContain('document.addEventListener(eventType, stopHostPageEvent, true)')
  })

  it('waits for BOSS page identity before silent login', () => {
    const tools = readSource('../../../utils/tools.ts')

    expect(tools).toContain('const maxIdentityWaitCount = 20')
    expect(tools).toContain('Tools.getCookieValue("bst")')
    expect(tools).toContain('Tools.window?._PAGE?.uid')
  })

  it('does not auto-import resumes when silent login cannot find a backend user', () => {
    const tools = readSource('../../../utils/tools.ts')

    expect(tools).not.toContain('开始自动注册')
    expect(tools).not.toContain('await handlerImport({value: false})')
  })

  it('does not load the BOSS WebSocket hook on jobs pages', () => {
    const main = readSource('../../../main.ts')

    expect(main).not.toContain("import './webSocket/hookMain'")
    expect(main).toContain('shouldEnableBossWebSocketHook')
    expect(main).toContain('/web/geek/chat')
    expect(main).toContain("import('./webSocket/hookMain')")
  })

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

  it('makes resume import observable and always resets loading state', () => {
    const aiJob = readSource('../AiJob.vue')
    const tools = readSource('../../../utils/tools.ts')

    expect(aiJob).toContain("import {recordDiagnosticEvent} from '../../diagnostics/events'")
    expect(aiJob).toContain("recordDiagnosticEvent('import-resume:start'")
    expect(aiJob).toContain("recordDiagnosticEvent('import-resume:sidebar-success'")
    expect(aiJob).toContain("recordDiagnosticEvent('import-resume:download-success'")
    expect(aiJob).toContain("recordDiagnosticEvent('import-resume:backend-success'")
    expect(aiJob).toContain("recordDiagnosticEvent('import-resume:error'")
    expect(aiJob).toContain('finally {')
    expect(aiJob).toContain('importResumeLoading.value = false')
    expect(aiJob).toContain('timeout: 10000')
    expect(aiJob).toContain('timeout: 30000')
    expect(tools).toContain('timeout: options.timeout || 15000')
  })
})
