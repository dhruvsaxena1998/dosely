import { afterEach, describe, expect, it } from 'vitest'
import { gateEnforced, readSurface } from '@/lib/install'
import { IPAD, IPHONE, MAC, PIXEL, pretendAgent } from '@/test/agent'

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('reading the surface', () => {
  it('recognises an iPhone', () => {
    pretendAgent(IPHONE)
    expect(readSurface()).toBe('ios')
  })

  it('recognises an iPad, which calls itself a Mac', () => {
    pretendAgent(IPAD, 5)
    expect(readSurface()).toBe('ios')
  })

  it('does not mistake a desktop Mac for an iPad', () => {
    pretendAgent(MAC, 0)
    expect(readSurface()).toBe('desktop')
  })

  it('recognises Android', () => {
    pretendAgent(PIXEL)
    expect(readSurface()).toBe('android')
  })
})

describe('enforcing the gate', () => {
  it('stays out of the way of the dev server', () => {
    expect(import.meta.env.PROD).toBe(false)
    expect(gateEnforced()).toBe(false)
  })

  it('can be switched on to be checked against the dev server', () => {
    window.history.replaceState({}, '', '/?gate')
    expect(gateEnforced()).toBe(true)
  })
})
