import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Diagnostics from '../Diagnostics.vue'

const diagnosticEvents: Array<{ type: string; message: string; timestamp: string }> = [
  { type: 'main:attach-success', message: 'attached', timestamp: '2026-07-06T10:00:00.000Z' },
]
const clearDiagnosticEvents = vi.fn(() => {
  diagnosticEvents.length = 0
})
const recordDiagnosticEvent = vi.fn()

vi.mock('../../../diagnostics/events', () => ({
  getDiagnosticEvents: () => diagnosticEvents,
  clearDiagnosticEvents: () => clearDiagnosticEvents(),
  recordDiagnosticEvent: (...args: unknown[]) => recordDiagnosticEvent(...args),
}))

vi.mock('../../../logging/record', () => ({
  LogRecorder: class {
    getLogCount() {
      return 1
    }
    getLogs() {
      return [{ level: 'info', message: 'server checked', timestamp: '10:00:00' }]
    }
  },
}))

vi.mock('../../../platform/utils', () => ({
  TampermonkeyApi: {
    GmGetValue: (_key: string, defaultValue: unknown) => defaultValue,
    GmSetValue: vi.fn(),
  },
  Tools: {
    window: {
      _PAGE: { uid: 123 },
    },
  },
}))

describe('Diagnostics panel', () => {
  const global = {
    stubs: {
      'el-button': { template: '<button v-bind="$attrs"><slot /></button>' },
      'el-descriptions': { props: ['title'], template: '<section><h2>{{ title }}</h2><slot /></section>' },
      'el-descriptions-item': { template: '<div><slot /></div>' },
      'el-input': { props: ['modelValue'], template: '<textarea v-bind="$attrs" :value="modelValue">{{ modelValue }}</textarea>' },
      'el-table': { props: ['data'], template: '<div><slot /><div v-for="(row, index) in data" :key="index">{{ row.type || row.message }}</div></div>' },
      'el-table-column': true,
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = '<div class="page-jobs-main"><div id="ai-job" class="ai-job-floating"></div></div>'
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined),
      },
    })
    clearDiagnosticEvents.mockClear()
    recordDiagnosticEvent.mockClear()
  })

  it('renders a refreshable diagnostic snapshot', async () => {
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    expect(wrapper.text()).toContain('诊断快照')
    expect(wrapper.text()).toContain('main:attach-success')

    await wrapper.get('[data-testid="refresh-diagnostics"]').trigger('click')
    await flushPromises()

    expect(recordDiagnosticEvent).toHaveBeenCalledWith('diagnostics:snapshot', '诊断快照已刷新')
  })

  it('copies diagnostic JSON to the clipboard', async () => {
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    await wrapper.get('[data-testid="copy-diagnostics"]').trigger('click')
    await flushPromises()

    const writeText = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>
    expect(writeText).toHaveBeenCalledOnce()
    const copied = JSON.parse(writeText.mock.calls[0][0])
    expect(copied.assistant.mounted).toBe(true)
    expect(recordDiagnosticEvent).toHaveBeenCalledWith('diagnostics:copy', '诊断 JSON 已复制')
  })

  it('shows fallback JSON when clipboard write fails', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('blocked')
        }),
      },
    })
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    await wrapper.get('[data-testid="copy-diagnostics"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="diagnostics-fallback-json"]').exists()).toBe(true)
    const fallback = wrapper.get('[data-testid="diagnostics-fallback-json"]').element as HTMLTextAreaElement
    expect(fallback.value || fallback.textContent).toContain('"assistant"')
  })

  it('clears diagnostics events without clearing normal logs', async () => {
    const wrapper = mount(Diagnostics, { global })
    await flushPromises()

    await wrapper.get('[data-testid="clear-diagnostics-events"]').trigger('click')
    await flushPromises()

    expect(clearDiagnosticEvents).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('server checked')
  })
})
