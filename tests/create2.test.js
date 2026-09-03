import { describe, expect, test } from '@jest/globals'

import { ValueError } from '@tetherto/wdk-wallet/protocols'

import { ZERO_SALT, bytesToHex, computeProxyAddress, hexToBytes, isAddress, isBytes32 } from '../src/create2.js'
import { PINNED_DEPLOY_PARAMS } from '../src/deploy-params.js'

// Generated with forwarding_address_bot/address.py:compute_proxy_address against the pinned factory/singleton/
// creation code, so a passing suite means the JS derivation is byte-for-byte compatible with the Python bot.
const VECTORS = [
  {
    recipient: '0x1111111111111111111111111111111111111111',
    custodialWithdrawer: '0x2222222222222222222222222222222222222222',
    destinationChainId: 42161,
    salt: ZERO_SALT,
    allowedRelayer: '0x3333333333333333333333333333333333333333',
    expected: '0xea040b7d4f1c21117a2e7a1ce1d0f2a7c53c895a'
  },
  {
    recipient: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
    custodialWithdrawer: '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
    destinationChainId: 1,
    salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
    allowedRelayer: '0x3333333333333333333333333333333333333333',
    expected: '0x4c6bfed75e0f4f2caa88b1a32b49ca500dc44805'
  },
  {
    recipient: '0x000000000000000000000000000000000000dEaD',
    custodialWithdrawer: '0x0000000000000000000000000000000000000001',
    destinationChainId: 4217,
    salt: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    allowedRelayer: '0x9999999999999999999999999999999999999999',
    expected: '0xc7ef31b543c529b76579e5384665b77edf618823'
  },
  {
    recipient: '0x5555555555555555555555555555555555555555',
    custodialWithdrawer: '0x6666666666666666666666666666666666666666',
    destinationChainId: 8453,
    salt: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    allowedRelayer: '0x7777777777777777777777777777777777777777',
    expected: '0x9d4aaae256091cfeb177cfd7705c9cdfeab88952'
  }
]

describe('computeProxyAddress', () => {
  test.each(VECTORS)('matches the Python bot for $expected', ({ expected, ...params }) => {
    expect(computeProxyAddress({ ...PINNED_DEPLOY_PARAMS, ...params })).toBe(expected)
  })

  test('defaults the salt to the zero salt', () => {
    const { expected, salt, ...params } = VECTORS[0]
    expect(computeProxyAddress({ ...PINNED_DEPLOY_PARAMS, ...params })).toBe(expected)
  })

  test('is case-insensitive on address inputs', () => {
    const { expected, ...params } = VECTORS[1]
    const lower = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' ? v.toLowerCase() : v]))
    expect(computeProxyAddress({ ...PINNED_DEPLOY_PARAMS, ...lower })).toBe(expected)
  })

  test.each([
    ['recipient', { recipient: '0x1234' }],
    ['custodialWithdrawer', { custodialWithdrawer: 'not-an-address' }],
    ['allowedRelayer', { allowedRelayer: undefined }],
    ['salt', { salt: '0x00' }],
    ['destinationChainId', { destinationChainId: 0 }],
    ['destinationChainId', { destinationChainId: '1' }]
  ])('rejects an invalid %s', (_, bad) => {
    const { expected, ...params } = VECTORS[0]
    expect(() => computeProxyAddress({ ...PINNED_DEPLOY_PARAMS, ...params, ...bad })).toThrow(ValueError)
  })
})

describe('hex helpers', () => {
  test('round-trips bytes', () => {
    expect(bytesToHex(hexToBytes('0x00ff10'))).toBe('0x00ff10')
    expect(hexToBytes('0x')).toEqual(new Uint8Array(0))
  })

  test('rejects odd-length or non-hex input', () => {
    expect(() => hexToBytes('0xabc')).toThrow(ValueError)
    expect(() => hexToBytes('abcd')).toThrow(ValueError)
    expect(() => hexToBytes('0xzz')).toThrow(ValueError)
  })

  test('validates addresses and bytes32', () => {
    expect(isAddress('0x1111111111111111111111111111111111111111')).toBe(true)
    expect(isAddress('0x111')).toBe(false)
    expect(isBytes32(ZERO_SALT)).toBe(true)
    expect(isBytes32('0x00')).toBe(false)
  })
})
