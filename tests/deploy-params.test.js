import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import DeployParamsResolver, { PINNED_DEPLOY_PARAMS } from '../src/deploy-params.js'
import { CandideForwardingError, CandideForwardingErrorReason } from '../src/errors.js'

const RELAYER = '0x3333333333333333333333333333333333333333'

function serverParams (overrides = {}) {
  return { ...PINNED_DEPLOY_PARAMS, allowedRelayer: RELAYER, ...overrides }
}

describe('DeployParamsResolver', () => {
  let rpc

  beforeEach(() => {
    jest.useRealTimers()
    rpc = { call: jest.fn() }
  })

  test('fetches the relayer and returns it with the pinned values', async () => {
    rpc.call.mockResolvedValue(serverParams())
    const resolver = new DeployParamsResolver({ rpc })

    const params = await resolver.resolve()

    expect(rpc.call).toHaveBeenCalledWith('forwarding_getDeployParams', {})
    expect(params).toEqual({ ...PINNED_DEPLOY_PARAMS, allowedRelayer: RELAYER })
  })

  test('accepts pinned values in a different letter case', async () => {
    rpc.call.mockResolvedValue(serverParams({ factory: PINNED_DEPLOY_PARAMS.factory.toLowerCase() }))

    await expect(new DeployParamsResolver({ rpc }).resolve()).resolves.toMatchObject({ factory: PINNED_DEPLOY_PARAMS.factory })
  })

  test('passes through a server version when present', async () => {
    rpc.call.mockResolvedValue(serverParams({ version: 'v2' }))

    await expect(new DeployParamsResolver({ rpc }).resolve()).resolves.toMatchObject({ version: 'v2' })
  })

  test.each(['factory', 'singleton', 'proxyCreationCode'])('throws DEPLOYMENT_CHANGED when the server %s differs', async (field) => {
    rpc.call.mockResolvedValue(serverParams({ [field]: '0xdeadbeef' }))

    const error = await new DeployParamsResolver({ rpc }).resolve().catch((e) => e)

    expect(error).toBeInstanceOf(CandideForwardingError)
    expect(error.reason).toBe(CandideForwardingErrorReason.DEPLOYMENT_CHANGED)
    expect(error.message).toContain(field)
  })

  test('does not check a field the caller overrode', async () => {
    rpc.call.mockResolvedValue(serverParams({ factory: '0xnew' }))
    const resolver = new DeployParamsResolver({ rpc, overrides: { factory: '0xnew' } })

    await expect(resolver.resolve()).resolves.toMatchObject({ factory: '0xnew', allowedRelayer: RELAYER })
  })

  test('skips the API entirely when the relayer is pinned by the caller', async () => {
    const resolver = new DeployParamsResolver({ rpc, overrides: { allowedRelayer: RELAYER } })

    await expect(resolver.resolve()).resolves.toEqual({ ...PINNED_DEPLOY_PARAMS, allowedRelayer: RELAYER })
    expect(rpc.call).not.toHaveBeenCalled()
  })

  test('caches within the ttl and refetches after it', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    rpc.call.mockResolvedValue(serverParams())
    const resolver = new DeployParamsResolver({ rpc, ttlMs: 1000 })

    await resolver.resolve()
    await resolver.resolve()
    expect(rpc.call).toHaveBeenCalledTimes(1)

    jest.setSystemTime(1_001_500)
    await resolver.resolve()
    expect(rpc.call).toHaveBeenCalledTimes(2)
  })

  test('invalidate forces a refetch', async () => {
    rpc.call.mockResolvedValue(serverParams())
    const resolver = new DeployParamsResolver({ rpc })

    await resolver.resolve()
    resolver.invalidate()
    await resolver.resolve()

    expect(rpc.call).toHaveBeenCalledTimes(2)
  })
})
