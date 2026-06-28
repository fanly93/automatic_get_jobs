import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../platform/utils', () => ({
  TampermonkeyApi: {
    GmGetValue: (_key: string, defaultValue: string) => defaultValue,
    GmSetValue: vi.fn(),
  },
}))

describe('AiConfig server defaults', () => {
  it('defaults to the local self-hosted backend', async () => {
    const serverModule = await import('../../../stores/server')
    const legacyServer = ['43', '138', '246', '37'].join('.')

    expect(serverModule.DEFAULT_SERVER_URL).toBe('http://127.0.0.1:9100')
    expect(serverModule.DEFAULT_SERVER_URL).not.toContain(legacyServer)
  })
})
