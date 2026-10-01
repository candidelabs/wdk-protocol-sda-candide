import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { ProviderErrorReason } from '@tetherto/wdk-wallet'
import { InvalidTokenError, NoSuchElementError, SdaError, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet/protocols'

import CandideForwardingProtocol, { CandideForwardingError, CandideForwardingErrorReason, PINNED_DEPLOY_PARAMS, ZERO_SALT, computeProxyAddress } from '../index.js'

const API_URL = 'https://api.example/forwarder/v3/team-key'
const POLICY_SECRET = 'policy-secret'
const RECIPIENT = '0x1111111111111111111111111111111111111111'
const WITHDRAWER = '0x2222222222222222222222222222222222222222'
const RELAYER = '0x3333333333333333333333333333333333333333'
const USDT_ETH = '0xdac17f958d2ee523a2206206994597c13d831ec7'
const USDT0_ARB = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'
const USDC_ETH = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

const DEPLOY_PARAMS = { ...PINNED_DEPLOY_PARAMS, allowedRelayer: RELAYER }

const ROUTES_FROM_1 = {
  routes: [
    {
      sourceChainId: 1,
      sourceChainName: 'Ethereum',
      destinationChainId: 42161,
      destinationChainName: 'Arbitrum One',
      tokens: [
        { address: USDT_ETH, symbol: 'USDT', decimals: 6, destinationAddress: USDT0_ARB, feeBps: 20 },
        { address: USDC_ETH, symbol: 'USDC', decimals: 6, destinationAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', feeBps: 20 }
      ]
    },
    {
      sourceChainId: 1,
      sourceChainName: 'Ethereum',
      destinationChainId: 10,
      destinationChainName: 'Optimism',
      tokens: [{ address: USDT_ETH, symbol: 'USDT', decimals: 6, destinationAddress: '0x01bff41798a0bcf287b996046ca68b395dbc1071', feeBps: 20 }]
    }
  ]
}

const ROUTES_FROM_42161 = {
  routes: [{
    sourceChainId: 42161,
    sourceChainName: 'Arbitrum One',
    destinationChainId: 42161,
    destinationChainName: 'Arbitrum One',
    tokens: [{ address: USDT0_ARB, symbol: 'USDT0', decimals: 6, destinationAddress: USDT0_ARB, feeBps: 0 }]
  }]
}

function derive (overrides = {}) {
  return computeProxyAddress({ ...DEPLOY_PARAMS, recipient: RECIPIENT, recoveryWithdrawer: WITHDRAWER, destinationChainId: 42161, salt: ZERO_SALT, ...overrides })
}

/**
 * Installs a global fetch mock that dispatches on the JSON-RPC method. Handlers receive the params object and
 * return either a result or `{ error }`.
 */
function mockApi (handlers) {
  const calls = []
  global.fetch = jest.fn(async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ method: body.method, params: body.params[0], headers: init.headers })
    const handler = handlers[body.method]
    if (!handler) throw new Error(`Unexpected RPC method ${body.method}`)
    const outcome = typeof handler === 'function' ? await handler(body.params[0]) : handler
    const payload = outcome && outcome.error ? { jsonrpc: '2.0', id: body.id, error: outcome.error } : { jsonrpc: '2.0', id: body.id, result: outcome }
    return { ok: true, status: 200, statusText: 'OK', json: async () => payload }
  })
  return calls
}

function baseHandlers (overrides = {}) {
  return {
    forwarding_getDeployParams: DEPLOY_PARAMS,
    forwarding_getRoutes: ({ sourceChainId }) => (sourceChainId === 1 ? ROUTES_FROM_1 : ROUTES_FROM_42161),
    ...overrides
  }
}

describe('CandideForwardingProtocol', () => {
  const account = { getAddress: jest.fn().mockResolvedValue(RECIPIENT) }
  let protocol

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
    protocol = new CandideForwardingProtocol(account, { apiUrl: API_URL, policySecret: POLICY_SECRET, recoveryWithdrawer: WITHDRAWER })
  })

  describe('constructor', () => {
    test('requires the api url', () => {
      expect(() => new CandideForwardingProtocol(undefined, {})).toThrow(ValueError)
      expect(() => new CandideForwardingProtocol(undefined, { apiUrl: '' })).toThrow(ValueError)
    })

    test('uses the api url verbatim', async () => {
      mockApi(baseHandlers())

      await new CandideForwardingProtocol(undefined, { apiUrl: API_URL }).getSupportedRoutes({ sourceChain: 1 })

      expect(global.fetch.mock.calls[0][0]).toBe(API_URL)
    })

    test('validates the configured recovery withdrawer', () => {
      expect(() => new CandideForwardingProtocol(undefined, { apiUrl: API_URL, recoveryWithdrawer: 'nope' })).toThrow(ValueError)
    })
  })

  describe('getSupportedRoutes', () => {
    test('requires a source chain', async () => {
      mockApi(baseHandlers())
      await expect(protocol.getSupportedRoutes()).rejects.toThrow(ValueError)
      await expect(protocol.getSupportedRoutes({ destinationChain: 42161 })).rejects.toThrow(ValueError)
    })

    test('maps routes per (source, destination) pair', async () => {
      const calls = mockApi(baseHandlers())

      const routes = await protocol.getSupportedRoutes({ sourceChain: 'ethereum' })

      expect(calls).toEqual([expect.objectContaining({ method: 'forwarding_getRoutes', params: { sourceChainId: 1 } })])
      expect(routes).toHaveLength(2)
      expect(routes[0]).toEqual({
        sourceChains: [1],
        inputTokens: [
          expect.objectContaining({ token: USDT_ETH, chain: 1, symbol: 'USDT', decimals: 6, address: USDT_ETH, destinationAddress: USDT0_ARB, feeBps: 20 }),
          expect.objectContaining({ token: USDC_ETH, symbol: 'USDC' })
        ],
        destinationChain: 42161,
        reusable: true
      })
      expect(routes[0].outputAsset).toBeUndefined()
      expect(routes[0].limits).toBeUndefined()
    })

    test('filters by destination chain and source token, adding the minimum limit', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getMinimumAmount: { bridges: { across: { minAmount: '500000' }, oft: { minAmount: '1000000' } } }
      }))

      const routes = await protocol.getSupportedRoutes({ sourceChain: 1, destinationChain: 'arbitrum', sourceToken: USDT_ETH.toUpperCase().replace('0X', '0x') })

      expect(routes).toHaveLength(1)
      expect(routes[0].inputTokens.map((t) => t.symbol)).toEqual(['USDT'])
      expect(routes[0].limits).toEqual({ min: 500000n })
      expect(calls[1]).toEqual(expect.objectContaining({ method: 'forwarding_getMinimumAmount', params: { sourceChainId: 1, destinationChainId: 42161, token: USDT_ETH } }))
    })

    test('matches a checksummed token address returned by the API', async () => {
      const checksummed = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      mockApi(baseHandlers({
        forwarding_getRoutes: { routes: [{ sourceChainId: 1, sourceChainName: 'Ethereum', destinationChainId: 42161, destinationChainName: 'Arbitrum One', tokens: [{ address: checksummed, symbol: 'USDT', decimals: 6, destinationAddress: USDT0_ARB, feeBps: 20 }] }] },
        forwarding_getMinimumAmount: { bridges: {} }
      }))

      const routes = await protocol.getSupportedRoutes({ sourceChain: 1, sourceToken: checksummed })

      expect(routes).toHaveLength(1)
      expect(routes[0].inputTokens[0].token).toBe(USDT_ETH)
    })

    test('omits limits when no bridge reports a minimum', async () => {
      mockApi(baseHandlers({ forwarding_getMinimumAmount: { bridges: {} } }))

      const routes = await protocol.getSupportedRoutes({ sourceChain: 1, sourceToken: USDT_ETH })

      expect(routes.every((route) => route.limits === undefined)).toBe(true)
    })

    test('returns an empty list when the token is not on any route', async () => {
      mockApi(baseHandlers())

      await expect(protocol.getSupportedRoutes({ sourceChain: 1, sourceToken: '0x0000000000000000000000000000000000000001' })).resolves.toEqual([])
    })

    test('caches routes per source chain within the ttl', async () => {
      jest.useFakeTimers({ now: 5_000_000 })
      const calls = mockApi(baseHandlers())

      await protocol.getSupportedRoutes({ sourceChain: 1 })
      await protocol.getSupportedRoutes({ sourceChain: 1 })
      await protocol.getSupportedRoutes({ sourceChain: 42161 })
      expect(calls.filter((c) => c.method === 'forwarding_getRoutes')).toHaveLength(2)

      jest.setSystemTime(5_000_000 + 11 * 60 * 1000)
      await protocol.getSupportedRoutes({ sourceChain: 1 })
      expect(calls.filter((c) => c.method === 'forwarding_getRoutes')).toHaveLength(3)
    })

    test('surfaces API errors as WDK errors', async () => {
      mockApi({ forwarding_getRoutes: { error: { code: -32603, message: 'internal error' } } })

      await expect(protocol.getSupportedRoutes({ sourceChain: 1 })).rejects.toMatchObject({ name: 'ProviderError', reason: ProviderErrorReason.INTERNAL_SERVER_ERROR })
    })
  })

  describe('quoteDeposit', () => {
    const ESTIMATE = { destinationChainId: 42161, outputToken: USDT0_ARB, outputTokenSymbol: 'USDT0', bridge: 'oft', outputAmount: '99700000', relayerBotFee: '200000', bridgeProtocolFee: '100000' }

    test('quotes a deposit through forwarding_estimateOutput', async () => {
      const calls = mockApi(baseHandlers({ forwarding_estimateOutput: ESTIMATE }))

      const quote = await protocol.quoteDeposit({ sourceChain: 1, inputToken: USDT_ETH, destinationChain: 42161, inputAmount: 100_000_000n })

      expect(calls[0]).toEqual(expect.objectContaining({ method: 'forwarding_estimateOutput', params: { sourceChainId: 1, destinationChainId: 42161, token: USDT_ETH, amount: '100000000' } }))
      expect(quote).toMatchObject({ inputChain: 1, inputToken: USDT_ETH, inputAmount: 100_000_000n, destinationChain: 42161, outputAsset: USDT0_ARB, outputAmount: 99_700_000n, bridge: 'oft', outputAssetSymbol: 'USDT0', sponsored: false })
      expect(quote.fees.map((fee) => fee.amount)).toEqual([200_000n, 100_000n])
    })

    test('passes the deposit address as proxyAddress and reports sponsorship', async () => {
      const proxy = '0xC39BCC9CD602F756A0D2AE6124A0B50006834A5D'
      const calls = mockApi(baseHandlers({ forwarding_estimateOutput: { ...ESTIMATE, outputAmount: '100000000' } }))

      const quote = await protocol.quoteDeposit({ sourceChain: 1, inputToken: USDT_ETH, destinationChain: 42161, inputAmount: 100_000_000n, depositAddress: proxy })

      expect(calls[0].params).toEqual({ sourceChainId: 1, destinationChainId: 42161, token: USDT_ETH, amount: '100000000', proxyAddress: proxy.toLowerCase() })
      expect(quote.sponsored).toBe(true)
      expect(quote.outputAmount).toBe(100_000_000n)
      expect(quote.fees.every((fee) => fee.included === false)).toBe(true)
    })

    test('detects sponsorship across different token decimals', async () => {
      const bsc = { address: '0x55d398326f99059ff775485246999027b3197955', symbol: 'BUSDT', decimals: 18, destinationAddress: USDT0_ARB, feeBps: 20 }
      const calls = mockApi(baseHandlers({
        forwarding_getRoutes: ({ sourceChainId }) => (sourceChainId === 56
          ? { routes: [{ sourceChainId: 56, destinationChainId: 42161, tokens: [bsc] }] }
          : sourceChainId === 1 ? ROUTES_FROM_1 : ROUTES_FROM_42161),
        // 1 BUSDT (18 decimals) in, full 1 USDT0 (6 decimals) out, fees still reported: sponsored.
        forwarding_estimateOutput: { destinationChainId: 42161, outputToken: USDT0_ARB, outputTokenSymbol: 'USDT0', bridge: 'oft', outputAmount: '1000000', relayerBotFee: '2000000000000000', bridgeProtocolFee: '1000000000000000' }
      }))

      const quote = await protocol.quoteDeposit({ sourceChain: 56, inputToken: bsc.address, destinationChain: 42161, inputAmount: 10n ** 18n, depositAddress: RECIPIENT })

      expect(quote.sponsored).toBe(true)
      expect(calls.filter((c) => c.method === 'forwarding_getRoutes').map((c) => c.params.sourceChainId).sort()).toEqual([42161, 56])
    })

    test('does not report sponsorship for an unsponsored cross-decimal estimate', async () => {
      const bsc = { address: '0x55d398326f99059ff775485246999027b3197955', symbol: 'BUSDT', decimals: 18, destinationAddress: USDT0_ARB, feeBps: 20 }
      mockApi(baseHandlers({
        forwarding_getRoutes: ({ sourceChainId }) => (sourceChainId === 56 ? { routes: [{ sourceChainId: 56, destinationChainId: 42161, tokens: [bsc] }] } : ROUTES_FROM_42161),
        forwarding_estimateOutput: { destinationChainId: 42161, outputToken: USDT0_ARB, outputTokenSymbol: 'USDT0', bridge: 'oft', outputAmount: '997000', relayerBotFee: '2000000000000000', bridgeProtocolFee: '1000000000000000' }
      }))

      const quote = await protocol.quoteDeposit({ sourceChain: 56, inputToken: bsc.address, destinationChain: 42161, inputAmount: 10n ** 18n })

      expect(quote.sponsored).toBe(false)
    })

    test('rejects an invalid deposit address', async () => {
      mockApi(baseHandlers({ forwarding_estimateOutput: ESTIMATE }))

      await expect(protocol.quoteDeposit({ sourceChain: 1, inputToken: USDT_ETH, destinationChain: 42161, inputAmount: 1n, depositAddress: 'nope' })).rejects.toThrow(ValueError)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('accepts a number amount and serializes it as a string', async () => {
      const calls = mockApi(baseHandlers({ forwarding_estimateOutput: ESTIMATE }))

      await protocol.quoteDeposit({ sourceChain: 1, inputToken: USDT_ETH, destinationChain: 42161, inputAmount: 1000000 })

      expect(calls[0].params.amount).toBe('1000000')
    })

    test.each([
      ['non-positive amount', { inputAmount: 0n }],
      ['fractional amount', { inputAmount: 1.5 }],
      ['unknown chain', { sourceChain: 'solana' }]
    ])('rejects a %s', async (_, bad) => {
      mockApi(baseHandlers({ forwarding_estimateOutput: ESTIMATE }))

      await expect(protocol.quoteDeposit({ sourceChain: 1, inputToken: USDT_ETH, destinationChain: 42161, inputAmount: 1n, ...bad })).rejects.toThrow(ValueError)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('rejects a malformed token address with InvalidTokenError', async () => {
      mockApi(baseHandlers({ forwarding_estimateOutput: ESTIMATE }))

      await expect(protocol.quoteDeposit({ sourceChain: 1, inputToken: 'USDT', destinationChain: 42161, inputAmount: 1n })).rejects.toBeInstanceOf(InvalidTokenError)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('maps an unsupported route and a too-small amount', async () => {
      mockApi(baseHandlers({ forwarding_estimateOutput: { error: { code: -32001, message: 'route not found' } } }))
      await expect(protocol.quoteDeposit({ sourceChain: 1, inputToken: USDT_ETH, destinationChain: 137, inputAmount: 1n })).rejects.toBeInstanceOf(SdaError)

      mockApi(baseHandlers({ forwarding_estimateOutput: { error: { code: -32003, message: 'amount too small' } } }))
      await expect(protocol.quoteDeposit({ sourceChain: 1, inputToken: USDT_ETH, destinationChain: 42161, inputAmount: 1n })).rejects.toMatchObject({ name: 'ValueError', cause: { code: -32003 } })
    })
  })

  describe('createDepositAddress', () => {
    const address = derive()

    test('activates, verifies and describes the address', async () => {
      const calls = mockApi(baseHandlers({
        account_activateForwardingAddress: { address: address.toUpperCase().replace('0X', '0x'), active: true, expiresAt: 1_800_000_000 }
      }))

      const result = await protocol.createDepositAddress({ sourceChains: ['ethereum', 42161, '1'], destinationChain: 'arbitrum' })

      const activate = calls.find((c) => c.method === 'account_activateForwardingAddress')
      expect(activate.headers.authorization).toBe(`Bearer ${POLICY_SECRET}`)
      expect(activate.params).toEqual({ recipient: RECIPIENT, custodialWithdrawer: WITHDRAWER, destinationChainId: 42161, sourceChainIds: [1, 42161], salt: ZERO_SALT })

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        address,
        id: address,
        sourceChains: [1, 42161],
        supportedInputTokens: [
          expect.objectContaining({ chain: 1, symbol: 'USDT' }),
          expect.objectContaining({ chain: 1, symbol: 'USDC' }),
          expect.objectContaining({ chain: 42161, symbol: 'USDT0' })
        ],
        destinationChain: 42161,
        destinationAddress: RECIPIENT,
        reusable: true,
        expiry: 1_800_000_000,
        recoveryWithdrawer: WITHDRAWER,
        salt: ZERO_SALT
      })
    })

    test('always includes the destination chain in the activation and the descriptor', async () => {
      const calls = mockApi(baseHandlers({ account_activateForwardingAddress: { address, active: true, expiresAt: 1 } }))

      const [result] = await protocol.createDepositAddress({ sourceChains: [1], destinationChain: 42161 })

      expect(calls.find((c) => c.method === 'account_activateForwardingAddress').params.sourceChainIds).toEqual([1, 42161])
      expect(result.sourceChains).toEqual([1, 42161])
      expect(result.supportedInputTokens.map((t) => t.chain)).toEqual([1, 1, 42161])
    })

    test('uses an explicit destination address, per-call withdrawer and salt', async () => {
      const salt = '0x' + '11'.repeat(32)
      const other = '0x4444444444444444444444444444444444444444'
      const expected = derive({ recipient: other, recoveryWithdrawer: other, salt })
      const calls = mockApi(baseHandlers({ account_activateForwardingAddress: { address: expected, active: true, expiresAt: 1 } }))

      const [result] = await protocol.createDepositAddress({ sourceChains: [1], destinationChain: 42161, destinationAddress: other, recoveryWithdrawer: other, salt })

      expect(calls.find((c) => c.method === 'account_activateForwardingAddress').params).toMatchObject({ recipient: other, custodialWithdrawer: other, salt })
      expect(result).toMatchObject({ address: expected, destinationAddress: other, recoveryWithdrawer: other, salt })
      expect(account.getAddress).not.toHaveBeenCalled()
    })

    test('defaults the withdrawer to the recipient when none is configured', async () => {
      const unconfigured = new CandideForwardingProtocol(account, { apiUrl: API_URL, policySecret: POLICY_SECRET })
      const expected = derive({ recoveryWithdrawer: RECIPIENT })
      const calls = mockApi(baseHandlers({ account_activateForwardingAddress: { address: expected, active: true, expiresAt: 1 } }))

      await unconfigured.createDepositAddress({ sourceChains: [1], destinationChain: 42161 })

      expect(calls.find((c) => c.method === 'account_activateForwardingAddress').params.custodialWithdrawer).toBe(RECIPIENT)
    })

    test('throws ADDRESS_MISMATCH when the API returns a different address', async () => {
      mockApi(baseHandlers({ account_activateForwardingAddress: { address: '0x9999999999999999999999999999999999999999', active: true, expiresAt: 1 } }))

      const error = await protocol.createDepositAddress({ sourceChains: [1], destinationChain: 42161 }).catch((e) => e)

      expect(error).toBeInstanceOf(CandideForwardingError)
      expect(error.reason).toBe(CandideForwardingErrorReason.ADDRESS_MISMATCH)
    })

    test('throws DEPLOYMENT_CHANGED before activating when the server deployment differs', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getDeployParams: { ...DEPLOY_PARAMS, factory: '0x0000000000000000000000000000000000000abc' },
        account_activateForwardingAddress: { address, active: true, expiresAt: 1 }
      }))

      await expect(protocol.createDepositAddress({ sourceChains: [1], destinationChain: 42161 })).rejects.toMatchObject({ reason: CandideForwardingErrorReason.DEPLOYMENT_CHANGED })
      expect(calls.some((c) => c.method === 'account_activateForwardingAddress')).toBe(false)
    })

    test('skips derivation when verification is disabled', async () => {
      const unverified = new CandideForwardingProtocol(account, { apiUrl: API_URL, policySecret: POLICY_SECRET, verifyAddresses: false })
      const calls = mockApi(baseHandlers({ account_activateForwardingAddress: { address: '0x9999999999999999999999999999999999999999', active: true, expiresAt: 1 } }))

      const [result] = await unverified.createDepositAddress({ sourceChains: [1], destinationChain: 42161 })

      expect(result.address).toBe('0x9999999999999999999999999999999999999999')
      expect(calls.some((c) => c.method === 'forwarding_getDeployParams')).toBe(false)
    })

    test('requires a destination address when no account is bound', async () => {
      const anonymous = new CandideForwardingProtocol(undefined, { apiUrl: API_URL, policySecret: POLICY_SECRET })
      mockApi(baseHandlers())

      await expect(anonymous.createDepositAddress({ sourceChains: [1], destinationChain: 42161 })).rejects.toThrow(ValueError)
    })

    test('requires the policy secret', async () => {
      const readOnly = new CandideForwardingProtocol(account, { apiUrl: API_URL })
      mockApi(baseHandlers())

      await expect(readOnly.createDepositAddress({ sourceChains: [1], destinationChain: 42161 })).rejects.toThrow(/policy secret/)
    })

    test.each([
      ['missing source chains', { sourceChains: [] }],
      ['bad salt', { salt: '0x01' }],
      ['bad withdrawer', { recoveryWithdrawer: '0x1' }],
      ['bad destination address', { destinationAddress: 'me' }]
    ])('rejects %s', async (_, bad) => {
      mockApi(baseHandlers())

      await expect(protocol.createDepositAddress({ sourceChains: [1], destinationChain: 42161, ...bad })).rejects.toThrow(ValueError)
    })

    test('maps the address cap error to a forbidden provider error', async () => {
      mockApi(baseHandlers({ account_activateForwardingAddress: { error: { code: -32013, message: 'cap' } } }))

      await expect(protocol.createDepositAddress({ sourceChains: [1], destinationChain: 42161 })).rejects.toMatchObject({ name: 'ProviderError', reason: ProviderErrorReason.FORBIDDEN })
    })
  })

  describe('deriveDepositAddress', () => {
    test('derives without any account_* call', async () => {
      const calls = mockApi(baseHandlers())

      const address = await protocol.deriveDepositAddress({ sourceChains: [1], destinationChain: 42161 })

      expect(address).toBe(derive())
      expect(calls.map((c) => c.method)).toEqual(['forwarding_getDeployParams'])
    })

    test('is fully offline when the relayer is pinned', async () => {
      const offline = new CandideForwardingProtocol(account, { apiUrl: API_URL, recoveryWithdrawer: WITHDRAWER, deployParams: { allowedRelayer: RELAYER } })
      mockApi({})

      await expect(offline.deriveDepositAddress({ sourceChains: [1], destinationChain: 42161 })).resolves.toBe(derive())
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('getDeployParams exposes the resolved inputs', async () => {
      mockApi(baseHandlers())

      await expect(protocol.getDeployParams()).resolves.toEqual(DEPLOY_PARAMS)
    })
  })

  describe('getDepositAddress', () => {
    const address = derive()
    const STORED = { ...PINNED_DEPLOY_PARAMS, recipient: RECIPIENT, custodialWithdrawer: WITHDRAWER, destinationChainId: 42161, salt: ZERO_SALT, allowedRelayer: RELAYER }

    test('rebuilds the descriptor from the stored params and activation', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: STORED,
        forwarding_getActivation: { address, sourceChains: [{ sourceChainId: 1, status: 'active', expiresAt: 200 }, { sourceChainId: 42161, status: 'active', expiresAt: 100 }] }
      }))

      const result = await protocol.getDepositAddress(address.toUpperCase().replace('0X', '0x'))

      expect(calls.map((c) => c.method).sort()).toEqual(['forwarding_getActivation', 'forwarding_getDeployParamsByAddress', 'forwarding_getRoutes', 'forwarding_getRoutes'])
      expect(result).toMatchObject({ address, id: address, sourceChains: [1, 42161], destinationChain: 42161, destinationAddress: RECIPIENT, reusable: true, expiry: 100, recoveryWithdrawer: WITHDRAWER, salt: ZERO_SALT })
      expect(result.supportedInputTokens).toHaveLength(3)
    })

    test('includes expired chains in sourceChains and reports the lapsed expiry', async () => {
      mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: STORED,
        forwarding_getActivation: { address, sourceChains: [{ sourceChainId: 1, status: 'active', expiresAt: 900 }, { sourceChainId: 42161, status: 'expired', expiredAt: 50 }] }
      }))

      await expect(protocol.getDepositAddress(address)).resolves.toMatchObject({ sourceChains: [1, 42161], expiry: 50 })
    })

    test('throws NoSuchElementError for an unknown address', async () => {
      mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: { error: { code: -32005, message: 'address not found' } },
        forwarding_getActivation: { address, sourceChains: [] }
      }))

      await expect(protocol.getDepositAddress(address)).rejects.toBeInstanceOf(NoSuchElementError)
    })

    test('rejects a malformed id', async () => {
      mockApi(baseHandlers())
      await expect(protocol.getDepositAddress('cfa1:abc')).rejects.toThrow(ValueError)
    })
  })

  describe('renewDepositAddress', () => {
    const address = derive()
    const STORED = { ...PINNED_DEPLOY_PARAMS, recipient: RECIPIENT, custodialWithdrawer: WITHDRAWER, destinationChainId: 42161, salt: ZERO_SALT, allowedRelayer: RELAYER }

    test('re-activates with the stored params on the recorded source chains', async () => {
      let activations = 0
      const calls = mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: STORED,
        forwarding_getActivation: () => ({ address, sourceChains: [{ sourceChainId: 1, status: 'active', expiresAt: activations ? 900 : 100 }] }),
        account_activateForwardingAddress: () => { activations++; return { address, active: true, expiresAt: 900 } }
      }))

      const result = await protocol.renewDepositAddress(address)

      const activate = calls.find((c) => c.method === 'account_activateForwardingAddress')
      expect(activate.params).toEqual({ recipient: RECIPIENT, custodialWithdrawer: WITHDRAWER, destinationChainId: 42161, sourceChainIds: [1], salt: ZERO_SALT })
      expect(result).toMatchObject({ address, expiry: 900 })
    })

    test('renews every recorded chain, including expired ones', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: STORED,
        forwarding_getActivation: { address, sourceChains: [{ sourceChainId: 1, status: 'active', expiresAt: 900 }, { sourceChainId: 42161, status: 'expired', expiredAt: 50 }] },
        account_activateForwardingAddress: { address, active: true, expiresAt: 900 }
      }))

      await protocol.renewDepositAddress(address)

      expect(calls.find((c) => c.method === 'account_activateForwardingAddress').params.sourceChainIds).toEqual([1, 42161])
    })

    test('throws NoSuchElementError when there is no activation history', async () => {
      mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: STORED,
        forwarding_getActivation: { address, sourceChains: [] }
      }))

      await expect(protocol.renewDepositAddress(address)).rejects.toBeInstanceOf(NoSuchElementError)
    })

    test('refuses to renew when the stored inputs do not derive the address', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: { ...STORED, recipient: '0x4444444444444444444444444444444444444444' },
        forwarding_getActivation: { address, sourceChains: [{ sourceChainId: 1, status: 'active', expiresAt: 100 }] },
        account_activateForwardingAddress: { address, active: true, expiresAt: 900 }
      }))

      await expect(protocol.renewDepositAddress(address)).rejects.toMatchObject({ reason: CandideForwardingErrorReason.ADDRESS_MISMATCH })
      expect(calls.some((c) => c.method === 'account_activateForwardingAddress')).toBe(false)
    })

    test('throws when the API re-derives a different address', async () => {
      mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: STORED,
        forwarding_getActivation: { address, sourceChains: [{ sourceChainId: 1, status: 'active', expiresAt: 100 }] },
        account_activateForwardingAddress: { address: '0x9999999999999999999999999999999999999999', active: true, expiresAt: 900 }
      }))

      await expect(protocol.renewDepositAddress(address)).rejects.toMatchObject({ reason: CandideForwardingErrorReason.ADDRESS_MISMATCH })
    })
  })

  describe('transfers', () => {
    const address = derive()
    const forward = (n, extra = {}) => ({ forwardId: `f${n}`, route: 'across', status: 'delivered', recipient: RECIPIENT, sourceChainId: 1, sourceTxHash: `0xtx${n}`, proxyAddress: address, destinationChainId: 42161, ...extra })

    test('getTransfersByRecipient walks every page and maps forwards', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getForwardsByRecipient: ({ cursor }) => (cursor
          ? { forwards: [forward(3)], nextCursor: null }
          : { forwards: [forward(1), forward(2, { status: 'pending' })], nextCursor: 'c1' })
      }))

      const transfers = await protocol.getTransfersByRecipient('arbitrum', RECIPIENT)

      expect(calls.map((c) => c.params)).toEqual([
        { recipient: RECIPIENT, destinationChainId: 42161, pageSize: 100 },
        { recipient: RECIPIENT, destinationChainId: 42161, pageSize: 100, cursor: 'c1' }
      ])
      expect(transfers.map((t) => [t.id, t.status])).toEqual([['f1', 'completed'], ['f2', 'processing'], ['f3', 'completed']])
    })

    test('applies status, skip and limit and stops paging once satisfied', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getForwardsByRecipient: ({ cursor }) => (cursor
          ? { forwards: [forward(4)], nextCursor: null }
          : { forwards: [forward(1, { status: 'pending' }), forward(2), forward(3)], nextCursor: 'c1' })
      }))

      const transfers = await protocol.getTransfersByRecipient(42161, RECIPIENT, { status: 'completed', skip: 1, limit: 1 })

      expect(transfers.map((t) => t.id)).toEqual(['f3'])
      expect(calls).toHaveLength(1)
    })

    test('getTransfers resolves the recipient from the address and filters by proxy', async () => {
      const calls = mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: { recipient: RECIPIENT, custodialWithdrawer: WITHDRAWER, destinationChainId: 42161, salt: ZERO_SALT },
        forwarding_getForwardsByRecipient: { forwards: [forward(1), forward(2, { proxyAddress: '0x9999999999999999999999999999999999999999' }), forward(3, { proxyAddress: undefined })], nextCursor: null }
      }))

      const transfers = await protocol.getTransfers(address)

      expect(calls[0]).toEqual(expect.objectContaining({ method: 'forwarding_getDeployParamsByAddress', params: { address } }))
      expect(transfers.map((t) => t.id)).toEqual(['f1'])
    })

    test('getTransfers throws NoSuchElementError for an unknown address', async () => {
      mockApi(baseHandlers({ forwarding_getDeployParamsByAddress: { error: { code: -32005, message: 'address not found' } } }))

      await expect(protocol.getTransfers(address)).rejects.toBeInstanceOf(NoSuchElementError)
    })

    test('getTransfer maps a forward and throws when unknown', async () => {
      mockApi(baseHandlers({ forwarding_getForwardById: ({ forwardId }) => ({ forward: forwardId === 'known' ? forward(1, { forwardId: 'known', status: 'failed', failureReason: 'refunded' }) : null }) }))

      await expect(protocol.getTransfer('known')).resolves.toMatchObject({ id: 'known', status: 'refunded', providerStatus: 'failed', failureReason: 'refunded' })
      await expect(protocol.getTransfer('unknown')).rejects.toBeInstanceOf(NoSuchElementError)
      await expect(protocol.getTransfer('')).rejects.toThrow(ValueError)
    })

    test('limit 0 returns an empty list without paging', async () => {
      const calls = mockApi(baseHandlers({ forwarding_getForwardsByRecipient: { forwards: [forward(1)], nextCursor: null } }))

      await expect(protocol.getTransfersByRecipient(42161, RECIPIENT, { limit: 0 })).resolves.toEqual([])
      expect(calls).toHaveLength(0)
    })

    test('rejects invalid pagination options', async () => {
      mockApi(baseHandlers())
      await expect(protocol.getTransfersByRecipient(42161, RECIPIENT, { skip: -1 })).rejects.toThrow(ValueError)
      await expect(protocol.getTransfersByRecipient(42161, RECIPIENT, { limit: 1.5 })).rejects.toThrow(ValueError)
      await expect(protocol.getTransfersByRecipient(42161, 'bob')).rejects.toThrow(ValueError)
    })
  })

  describe('recoverDepositAddress', () => {
    const address = derive()
    const STORED = { ...PINNED_DEPLOY_PARAMS, recipient: RECIPIENT, custodialWithdrawer: WITHDRAWER, destinationChainId: 42161, salt: ZERO_SALT, allowedRelayer: RELAYER }

    test('re-activates by id or by address', async () => {
      mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: STORED,
        forwarding_getActivation: { address, sourceChains: [{ sourceChainId: 1, status: 'expired', expiredAt: 1 }] },
        account_activateForwardingAddress: { address, active: true, expiresAt: 900 }
      }))

      await expect(protocol.recoverDepositAddress({ id: address })).resolves.toMatchObject({ status: 'reindexed', address, id: address })
      await expect(protocol.recoverDepositAddress({ address })).resolves.toMatchObject({ status: 'reindexed' })
    })

    test('reports failure for an unknown address and rethrows other errors', async () => {
      mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: { error: { code: -32005, message: 'address not found' } },
        forwarding_getActivation: { address, sourceChains: [] }
      }))
      await expect(protocol.recoverDepositAddress({ address })).resolves.toMatchObject({ status: 'failed', address })

      mockApi(baseHandlers({
        forwarding_getDeployParamsByAddress: { error: { code: -32603, message: 'internal error' } },
        forwarding_getActivation: { address, sourceChains: [] }
      }))
      await expect(protocol.recoverDepositAddress({ address })).rejects.toMatchObject({ name: 'ProviderError' })
    })

    test('requires an id or address', async () => {
      await expect(protocol.recoverDepositAddress({})).rejects.toThrow(ValueError)
    })
  })

  test('disableDepositAddress is unsupported', async () => {
    await expect(protocol.disableDepositAddress(derive())).rejects.toBeInstanceOf(UnsupportedOperationError)
  })
})
