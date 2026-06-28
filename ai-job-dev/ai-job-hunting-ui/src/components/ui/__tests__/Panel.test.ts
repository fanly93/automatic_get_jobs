import { describe, expect, it, vi } from 'vitest'
import { config, mount } from '@vue/test-utils'

config.global.renderStubDefaultSlot = true

vi.mock('../../../utils/tools', () => ({
  isProdEnv: () => true,
}))

vi.mock('../AiJob.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../Preference.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../RunRecord.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../UseDocument.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../InvitationExchange.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../AiConfig.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../../test/Test.vue', () => ({ default: { template: '<div />' } }))

import Panel from '../Panel.vue'

describe('Panel', () => {
  it('does not register the invitation exchange menu entry', () => {
    const wrapper = mount(Panel, {
      global: {
        stubs: {
          'el-menu': { template: '<nav><slot /></nav>' },
          'el-menu-item': { template: '<button><slot /></button>' },
        },
      },
    })

    expect(wrapper.text()).not.toContain('邀请兑换')
  })
})
