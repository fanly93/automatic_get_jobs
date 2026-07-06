import { beforeEach, describe, expect, it } from 'vitest'
import { buildDiagnosticSnapshot } from '../snapshot'

describe('diagnostic snapshot', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.history.pushState({}, '', '/web/geek/jobs')
    document.title = 'BOSS jobs'
  })

  it('summarizes assistant mount state without exposing secrets', () => {
    document.body.innerHTML = `
      <main class="page-jobs-main">
        <section class="job-list-container">
          <div class="job-card-wrapper">Job A</div>
        </section>
      </main>
    `
    const parent = document.querySelector('.page-jobs-main')!
    const root = document.createElement('div')
    root.id = 'ai-job'
    root.className = 'ai-job-content ai-job-floating'
    parent.appendChild(root)
    document.cookie = 'secret_cookie=value'
    localStorage.setItem('Authorization', 'Bearer secret-token')

    const snapshot = buildDiagnosticSnapshot({
      server: { baseUrl: 'http://127.0.0.1:9100', status: 'offline', lastError: '网络连接失败' },
      userSync: {
        status: 'server-online',
        message: '服务器在线',
        currentAction: '',
        lastCheckedAt: 123,
        bossUserIdPresent: true,
      },
      logs: [{ level: 'info', message: 'server checked', timestamp: '10:00:00' }],
      events: [{ type: 'main:attach-success', message: 'attached', timestamp: '2026-07-06T10:00:00.000Z' }],
    })

    expect(snapshot.assistant).toEqual({
      mounted: true,
      parentTag: 'MAIN',
      parentId: '',
      parentClass: 'page-jobs-main',
      bodyDirectChild: false,
      floatingClass: true,
    })
    expect(snapshot.bossJobsPage.isJobsUrl).toBe(true)
    expect(snapshot.bossJobsPage.containers['.page-jobs-main']).toBe(true)
    expect(snapshot.bossJobsPage.containers['.job-list-container']).toBe(true)
    expect(snapshot.bossJobsPage.jobCardCount).toBe(1)
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('secret_cookie')
    expect(serialized).not.toContain('Bearer secret-token')
  })

  it('uses safe defaults when assistant and body are absent', () => {
    document.body.innerHTML = ''

    const snapshot = buildDiagnosticSnapshot()

    expect(snapshot.assistant.mounted).toBe(false)
    expect(snapshot.assistant.parentTag).toBe('')
    expect(snapshot.page.bodyChildCount).toBe(0)
    expect(snapshot.userSync.bossUserIdPresent).toBe(false)
  })
})
