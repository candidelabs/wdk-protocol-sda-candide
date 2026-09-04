// Live integration test against the Candide Forwarding Address API.
//
// Enabled only when the environment provides:
//   CANDIDE_FORWARDING_API_URL        the API URL from the dashboard (carries the team API key)
//   CANDIDE_FORWARDING_POLICY_SECRET  the forwarding policy secret (needed for activation)
//   TEST_RECIPIENT                    the recipient address used for the test forwarding address
//   TEST_CUSTODIAL_WITHDRAWER         optional, defaults to TEST_RECIPIENT
//
// Run with: npm run test:integration   (loads .env automatically when present)
import { beforeAll, describe, expect, jest, test } from '@jest/globals'

import { NoSuchElementError, UnsupportedOperationError } from '@tetherto/wdk-wallet/protocols'

import CandideForwardingProtocol, { PINNED_DEPLOY_PARAMS } from '../../index.js'
import CandideRpcClient from '../../src/rpc-client.js'

const { CANDIDE_FORWARDING_API_URL: apiUrl, CANDIDE_FORWARDING_POLICY_SECRET: policySecret, TEST_RECIPIENT: recipient } = process.env
const custodialWithdrawer = process.env.TEST_CUSTODIAL_WITHDRAWER || recipient
const enabled = Boolean(apiUrl && policySecret && recipient)

// Fixed salt so repeated runs refresh the same address instead of creating a new one every time.
const TEST_SALT = '0x' + 'ca'.repeat(31) + '01'

jest.setTimeout(60_000)

const maybe = enabled ? describe : describe.skip

if (!enabled) {
  console.warn('Skipping live integration tests: set CANDIDE_FORWARDING_API_URL, CANDIDE_FORWARDING_POLICY_SECRET and TEST_RECIPIENT.')
}

maybe('CandideForwardingProtocol (live)', () => {
  let protocol, rpc, route, token, sourceChainId, destinationChainId, created

  beforeAll(() => {
    protocol = new CandideForwardingProtocol(undefined, { apiUrl, policySecret, custodialWithdrawer })
    rpc = new CandideRpcClient({ url: apiUrl })
  })

  test('the server deployment matches the SDK pins', async () => {
    const params = await protocol.getDeployParams()

    expect(params.factory.toLowerCase()).toBe(PINNED_DEPLOY_PARAMS.factory.toLowerCase())
    expect(params.singleton.toLowerCase()).toBe(PINNED_DEPLOY_PARAMS.singleton.toLowerCase())
    expect(params.allowedRelayer).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  test('lists routes from Ethereum', async () => {
    const routes = await protocol.getSupportedRoutes({ sourceChain: 'ethereum' })

    expect(routes.length).toBeGreaterThan(0)
    route = routes.find((r) => r.inputTokens.length > 0)
    expect(route).toBeDefined()
    sourceChainId = route.sourceChains[0]
    destinationChainId = route.destinationChain
    token = route.inputTokens[0]
    expect(token).toMatchObject({ chain: sourceChainId, decimals: expect.any(Number) })
  })

  test('reports a minimum when filtering by token', async () => {
    const [filtered] = await protocol.getSupportedRoutes({ sourceChain: sourceChainId, destinationChain: destinationChainId, sourceToken: token.token })

    expect(filtered.inputTokens).toHaveLength(1)
    if (filtered.limits !== undefined) expect(typeof filtered.limits.min).toBe('bigint')
  })

  test('quotes a deposit', async () => {
    const [filtered] = await protocol.getSupportedRoutes({ sourceChain: sourceChainId, destinationChain: destinationChainId, sourceToken: token.token })
    const floor = 100n * 10n ** BigInt(token.decimals)
    const inputAmount = filtered.limits?.min !== undefined && filtered.limits.min > floor ? filtered.limits.min * 2n : floor

    const quote = await protocol.quoteDeposit({ sourceChain: sourceChainId, inputToken: token.token, destinationChain: destinationChainId, inputAmount })

    expect(quote.inputAmount).toBe(inputAmount)
    expect(quote.outputAmount).toBeGreaterThan(0n)
    expect(quote.fees).toHaveLength(2)
    expect(typeof quote.bridge).toBe('string')
  })

  test('derives the same address as the server', async () => {
    const options = { sourceChains: [sourceChainId], destinationChain: destinationChainId, destinationAddress: recipient, salt: TEST_SALT }

    const derived = await protocol.deriveDepositAddress(options)
    const { address } = await rpc.call('forwarding_getAddress', { recipient, custodialWithdrawer, destinationChainId, salt: TEST_SALT })

    expect(derived).toBe(address.toLowerCase())
  })

  test('creates (activates) and verifies a deposit address', async () => {
    const [result] = await protocol.createDepositAddress({ sourceChains: [sourceChainId], destinationChain: destinationChainId, destinationAddress: recipient, salt: TEST_SALT })

    expect(result.address).toMatch(/^0x[0-9a-f]{40}$/)
    expect(result.id).toBe(result.address)
    expect(result.sourceChains).toEqual([...new Set([sourceChainId, destinationChainId])])
    expect(result.destinationAddress).toBe(recipient)
    expect(result.expiry).toBeGreaterThan(Math.floor(Date.now() / 1000))
    expect(result.supportedInputTokens.length).toBeGreaterThan(0)
    created = result
  })

  test('quotes for the activated address, reflecting the policy sponsorship', async () => {
    const [filtered] = await protocol.getSupportedRoutes({ sourceChain: sourceChainId, destinationChain: destinationChainId, sourceToken: token.token })
    const floor = 100n * 10n ** BigInt(token.decimals)
    const inputAmount = filtered.limits?.min !== undefined && filtered.limits.min > floor ? filtered.limits.min * 2n : floor

    const quote = await protocol.quoteDeposit({ sourceChain: sourceChainId, inputToken: token.token, destinationChain: destinationChainId, inputAmount, depositAddress: created.address })

    console.log(`quote for ${created.address}: sponsored=${quote.sponsored}, output=${quote.outputAmount}, fees=${quote.fees.map((f) => f.amount).join('+')}`)
    expect(typeof quote.sponsored).toBe('boolean')
    expect(quote.fees.every((fee) => fee.included === !quote.sponsored)).toBe(true)
    if (quote.sponsored) expect(quote.outputAmount).toBe(inputAmount)
  })

  test('looks the address up by id', async () => {
    const found = await protocol.getDepositAddress(created.id)

    expect(found.address).toBe(created.address)
    expect(found.destinationAddress.toLowerCase()).toBe(recipient.toLowerCase())
    expect(found.destinationChain).toBe(destinationChainId)
    expect(found.sourceChains).toEqual(expect.arrayContaining([sourceChainId]))
  })

  test('renews the activation', async () => {
    const renewed = await protocol.renewDepositAddress(created.id)

    expect(renewed.address).toBe(created.address)
    expect(renewed.expiry).toBeGreaterThanOrEqual(created.expiry)
  })

  test('recovers by address', async () => {
    await expect(protocol.recoverDepositAddress({ address: created.address })).resolves.toMatchObject({ status: 'reindexed', address: created.address })
  })

  test('lists transfers', async () => {
    await expect(protocol.getTransfers(created.address, { limit: 5 })).resolves.toEqual(expect.any(Array))
    await expect(protocol.getTransfersByRecipient(destinationChainId, recipient, { limit: 5 })).resolves.toEqual(expect.any(Array))
  })

  test('getTransfer throws for an unknown id', async () => {
    await expect(protocol.getTransfer('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(NoSuchElementError)
  })

  test('disable is unsupported', async () => {
    await expect(protocol.disableDepositAddress(created.id)).rejects.toBeInstanceOf(UnsupportedOperationError)
  })
})
