import { describe, expect, test } from '@jest/globals'

import { ValueError } from '@tetherto/wdk-wallet/protocols'

import { CHAIN_IDS, toChainId } from '../src/chains.js'

describe('toChainId', () => {
  test('accepts numeric ids, numeric strings and names', () => {
    expect(toChainId(42161)).toBe(42161)
    expect(toChainId('42161')).toBe(42161)
    expect(toChainId('arbitrum')).toBe(42161)
    expect(toChainId('Ethereum')).toBe(1)
    expect(toChainId(999999)).toBe(999999)
  })

  test('rejects unknown or invalid identifiers', () => {
    expect(() => toChainId('solana')).toThrow(ValueError)
    expect(() => toChainId(0)).toThrow(ValueError)
    expect(() => toChainId(-1)).toThrow(ValueError)
    expect(() => toChainId(1.5)).toThrow(ValueError)
    expect(() => toChainId(undefined)).toThrow(ValueError)
  })

  test('exposes a frozen alias table', () => {
    expect(Object.isFrozen(CHAIN_IDS)).toBe(true)
    expect(CHAIN_IDS.base).toBe(8453)
  })
})
