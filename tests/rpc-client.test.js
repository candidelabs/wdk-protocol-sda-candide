import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { ProviderErrorReason } from '@tetherto/wdk-wallet'
import { NoSuchElementError, ProviderError, SdaError, SdaErrorReason, ValueError } from '@tetherto/wdk-wallet/protocols'

import CandideRpcClient, { RpcErrorCode, toWdkError } from '../src/rpc-client.js'

const URL = 'https://api.example/rpc'

function mockResponse (payload, { ok = true, status = 200 } = {}) {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: jest.fn().mockResolvedValue(payload) }
}

describe('CandideRpcClient', () => {
  let client

  beforeEach(() => {
    jest.clearAllMocks()
    client = new CandideRpcClient({ url: URL, apiKey: 'secret' })
  })

  test('requires a url', () => {
    expect(() => new CandideRpcClient({})).toThrow(ValueError)
  })

  test('posts a JSON-RPC 2.0 envelope with params wrapped in an array', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ jsonrpc: '2.0', id: 1, result: { ok: 1 } }))

    const result = await client.call('forwarding_getRoutes', { sourceChainId: 1 })

    expect(result).toEqual({ ok: 1 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = global.fetch.mock.calls[0]
    expect(url).toBe(URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ jsonrpc: '2.0', id: 1, method: 'forwarding_getRoutes', params: [{ sourceChainId: 1 }] })
  })

  test('increments the request id', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ jsonrpc: '2.0', id: 1, result: null }))

    await client.call('a')
    await client.call('b')

    expect(JSON.parse(global.fetch.mock.calls[0][1].body).id).toBe(1)
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).id).toBe(2)
  })

  test('attaches the bearer token for authenticated calls', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ jsonrpc: '2.0', id: 1, result: {} }))

    await client.call('account_activateForwardingAddress', {}, { auth: true })

    expect(global.fetch.mock.calls[0][1].headers.authorization).toBe('Bearer secret')
  })

  test('throws ValueError for authenticated calls without an api key', async () => {
    global.fetch = jest.fn()
    const anonymous = new CandideRpcClient({ url: URL })

    expect(anonymous.hasApiKey).toBe(false)
    await expect(anonymous.call('account_activateForwardingAddress', {}, { auth: true })).rejects.toThrow(ValueError)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('maps transport failures to ProviderError NETWORK_ERROR', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(client.call('forwarding_getRoutes')).rejects.toMatchObject({
      name: 'ProviderError',
      reason: ProviderErrorReason.NETWORK_ERROR
    })
  })

  test('maps non-2xx responses to ProviderError NETWORK_ERROR', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({}, { ok: false, status: 502 }))

    await expect(client.call('forwarding_getRoutes')).rejects.toMatchObject({
      name: 'ProviderError',
      reason: ProviderErrorReason.NETWORK_ERROR,
      message: expect.stringContaining('502')
    })
  })

  test('maps invalid JSON to ProviderError NETWORK_ERROR', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: jest.fn().mockRejectedValue(new SyntaxError('bad')) })

    await expect(client.call('forwarding_getRoutes')).rejects.toMatchObject({ reason: ProviderErrorReason.NETWORK_ERROR })
  })

  test('maps JSON-RPC errors and keeps the original code in cause', async () => {
    global.fetch = jest.fn().mockResolvedValue(mockResponse({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'route not found' } }))

    await expect(client.call('forwarding_getMinimumAmount')).rejects.toMatchObject({
      name: 'SdaError',
      reason: SdaErrorReason.ROUTE_NOT_SUPPORTED,
      message: 'forwarding_getMinimumAmount: route not found (-32001)',
      cause: { code: -32001, message: 'route not found' }
    })
  })
})

describe('toWdkError', () => {
  test.each([
    [RpcErrorCode.INVALID_PARAMS, ValueError, undefined],
    [RpcErrorCode.AMOUNT_TOO_SMALL, ValueError, undefined],
    [RpcErrorCode.AMOUNT_TOO_LARGE, ValueError, undefined],
    [RpcErrorCode.ROUTE_NOT_FOUND, SdaError, SdaErrorReason.ROUTE_NOT_SUPPORTED],
    [RpcErrorCode.ADDRESS_NOT_FOUND, NoSuchElementError, undefined],
    [RpcErrorCode.UNAUTHORIZED, ProviderError, ProviderErrorReason.UNAUTHORIZED],
    [RpcErrorCode.ACCOUNT_DISABLED, ProviderError, ProviderErrorReason.FORBIDDEN],
    [RpcErrorCode.ADDRESS_LIMIT_EXCEEDED, ProviderError, ProviderErrorReason.FORBIDDEN],
    [RpcErrorCode.QUOTE_UNAVAILABLE, ProviderError, ProviderErrorReason.INTERNAL_SERVER_ERROR],
    [RpcErrorCode.INTERNAL_ERROR, ProviderError, ProviderErrorReason.INTERNAL_SERVER_ERROR],
    [RpcErrorCode.METHOD_NOT_FOUND, ProviderError, ProviderErrorReason.INTERNAL_SERVER_ERROR],
    [12345, ProviderError, ProviderErrorReason.INTERNAL_SERVER_ERROR]
  ])('maps code %i', (code, ErrorClass, reason) => {
    const error = toWdkError('m', { code, message: 'x' })
    expect(error).toBeInstanceOf(ErrorClass)
    if (reason !== undefined) expect(error.reason).toBe(reason)
    expect(error.cause).toEqual({ code, message: 'x' })
  })

  test('tolerates a malformed error object', () => {
    const error = toWdkError('m', undefined)
    expect(error).toBeInstanceOf(ProviderError)
  })
})
