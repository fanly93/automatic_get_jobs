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

  it('does not open the product purchase dialog from 5001 responses', () => {
    const axiosSource = readSource('../../../axios.ts')

    expect(axiosSource).not.toContain('PRODUCT_NOT_AUTHORIZED')
    expect(axiosSource).not.toContain('setShowProduct')
  })
})
