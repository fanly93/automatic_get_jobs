import { describe, expect, it, vi } from 'vitest'
import { config, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'

config.global.renderStubDefaultSlot = true

vi.mock('../../../axios', () => ({
  default: {
    get: vi.fn(async (url: string) => {
      if (url.includes('/api/user/ai/config/all/provider')) {
        return {
          data: {
            code: 200,
            data: [{ code: 1, desc: 'Deepseek', defaultBaseUrl: 'https://api.deepseek.com' }],
          },
        }
      }

      return {
        data: {
          code: 200,
          data: {
            status: 0,
            provider: 1,
            modelName: 'deepseek-chat',
            apiKey: '',
            baseUrl: 'https://api.deepseek.com',
            timeout: 60,
            completionsPath: '',
            testPassed: 0,
            userPrompt: '',
          },
        },
      }
    }),
    post: vi.fn(),
  },
}))

vi.mock('../../../platform/utils', () => ({
  TampermonkeyApi: {
    GmGetValue: (_key: string, defaultValue: unknown) => defaultValue,
    GmSetValue: vi.fn(),
  },
  Tools: {
    window: {
      _PAGE: { uid: 1 },
    },
  },
}))

vi.mock('../../../utils/tools', () => ({
  isProdEnv: () => true,
  ElMessage: vi.fn(),
}))

vi.mock('../AiJob.vue', () => ({ default: { template: '<div>AI assistant stub</div>' } }))
vi.mock('../Preference.vue', () => ({ default: { template: '<div>Preference stub</div>' } }))
vi.mock('../RunRecord.vue', () => ({ default: { template: '<div>Run record stub</div>' } }))
vi.mock('../UseDocument.vue', () => ({ default: { template: '<div>Use document stub</div>' } }))
vi.mock('../Diagnostics.vue', () => ({ default: { template: '<div>Diagnostics stub</div>' } }))
vi.mock('../../test/Test.vue', () => ({ default: { template: '<div>Debug test stub</div>' } }))

import Panel from '../Panel.vue'

describe('Panel AI config navigation', () => {
  it('keeps AI config selected and renders the AI config panel', async () => {
    const wrapper = mount(Panel, {
      attachTo: document.body,
      global: {
        plugins: [createPinia(), ElementPlus],
      },
    })

    const aiConfigItem = wrapper.findAll('.el-menu-item').find((item) => item.text() === 'AI 配置')
    expect(aiConfigItem).toBeTruthy()

    await aiConfigItem!.trigger('click')
    await flushPromises()

    expect(wrapper.find('.el-menu-item.is-active').text()).toBe('AI 配置')
    expect(wrapper.text()).toContain('模型微调')
    expect(wrapper.text()).toContain('自有API')

    wrapper.unmount()
  })
})
