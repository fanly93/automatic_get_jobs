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

  it('keeps menu clicks from bubbling into the host page', async () => {
    const host = document.createElement('div')
    const hostClick = vi.fn()
    host.addEventListener('click', hostClick)
    document.body.appendChild(host)

    const wrapper = mount(Panel, {
      attachTo: host,
      global: {
        stubs: {
          'el-menu': { template: '<nav><slot /></nav>' },
          'el-menu-item': { template: '<button><slot /></button>' },
        },
      },
    })

    await wrapper.find('button').trigger('click')

    expect(hostClick).not.toHaveBeenCalled()

    wrapper.unmount()
    host.remove()
  })

  it('keeps pointer events from bubbling into the host page', async () => {
    const host = document.createElement('div')
    const hostPointerDown = vi.fn()
    host.addEventListener('pointerdown', hostPointerDown)
    document.body.appendChild(host)

    const wrapper = mount(Panel, {
      attachTo: host,
      global: {
        stubs: {
          'el-menu': { template: '<nav><slot /></nav>' },
          'el-menu-item': { template: '<button><slot /></button>' },
        },
      },
    })

    await wrapper.find('button').trigger('pointerdown')

    expect(hostPointerDown).not.toHaveBeenCalled()

    wrapper.unmount()
    host.remove()
  })
})
