import { afterEach } from 'vitest'

const PLANTED = ['userAgent', 'maxTouchPoints'] as const

/**
 * Pretends to be a device. jsdom keeps userAgent on Navigator.prototype and
 * has never heard of maxTouchPoints, so neither can be spied on; they are
 * planted on the instance and taken away again after each test.
 */
export function pretendAgent(agent: string, touchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: agent, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true })
}

export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
export const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
export const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131'
export const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131'
export const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131'

afterEach(() => {
  for (const name of PLANTED) delete (navigator as unknown as Record<string, unknown>)[name]
})
