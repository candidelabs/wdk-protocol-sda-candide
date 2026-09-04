import { describe, expect, test } from '@jest/globals'

import { isSponsoredEstimate, toSdaQuote, toSdaRoute, toSdaToken, toSdaTransfer, toSdaTransferStatus } from '../src/mappers.js'

const USDT = { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', decimals: 6, destinationAddress: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', feeBps: 20 }

describe('toSdaRoute', () => {
  test('maps a Candide route into an SDA route without an output asset', () => {
    const route = toSdaRoute({ sourceChainId: 1, sourceChainName: 'Ethereum', destinationChainId: 42161, destinationChainName: 'Arbitrum One', tokens: [USDT] })

    expect(route).toEqual({
      sourceChains: [1],
      inputTokens: [{ token: USDT.address, chain: 1, symbol: 'USDT', decimals: 6, address: USDT.address, destinationAddress: USDT.destinationAddress, feeBps: 20 }],
      destinationChain: 42161,
      reusable: true
    })
    expect(route.outputAsset).toBeUndefined()
  })

  test('toSdaToken uses the lowercase source address as the token identifier', () => {
    expect(toSdaToken(USDT, 1).token).toBe(USDT.address)
    const checksummed = toSdaToken({ ...USDT, address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', destinationAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' }, 1)
    expect(checksummed.token).toBe(USDT.address)
    expect(checksummed.address).toBe(USDT.address)
    expect(checksummed.destinationAddress).toBe(USDT.destinationAddress)
  })
})

describe('toSdaQuote', () => {
  test('maps an estimate, marking both fees as included', () => {
    const quote = toSdaQuote({ sourceChainId: 1, inputToken: USDT.address, inputAmount: 1000000n }, {
      destinationChainId: 42161, outputToken: '0xout', outputTokenSymbol: 'USDT0', bridge: 'oft', outputAmount: '994005', relayerBotFee: '5000', bridgeProtocolFee: '995'
    })

    expect(quote).toMatchObject({
      inputChain: 1,
      inputToken: USDT.address,
      inputAmount: 1000000n,
      destinationChain: 42161,
      outputAsset: '0xout',
      outputAmount: 994005n,
      bridge: 'oft',
      outputAssetSymbol: 'USDT0'
    })
    expect(quote.fees).toEqual([
      { type: 'protocol', amount: 5000n, token: USDT.address, chain: 1, included: true, description: 'Candide relayer fee' },
      { type: 'network', amount: 995n, token: USDT.address, chain: 1, included: true, description: 'Bridge protocol fee (oft)' }
    ])
    expect(quote.sponsored).toBe(false)
  })

  test('marks fees as not included when the estimate is sponsored', () => {
    const sponsoredEstimate = { destinationChainId: 42161, outputToken: '0xout', outputTokenSymbol: 'USDT0', bridge: 'oft', outputAmount: '1000000', relayerBotFee: '5000', bridgeProtocolFee: '995' }

    const quote = toSdaQuote({ sourceChainId: 1, inputToken: USDT.address, inputAmount: 1000000n }, sponsoredEstimate)

    expect(quote.sponsored).toBe(true)
    expect(quote.outputAmount).toBe(1000000n)
    expect(quote.fees.map((fee) => fee.included)).toEqual([false, false])
    expect(quote.fees[0].description).toContain('sponsoring policy')
  })

  test('prefers an explicit sponsored flag from the API', () => {
    const base = { destinationChainId: 42161, outputToken: '0xout', outputTokenSymbol: 'USDT0', bridge: 'oft', outputAmount: '1000000', relayerBotFee: '5000', bridgeProtocolFee: '995' }

    expect(isSponsoredEstimate(1000000n, { ...base, sponsored: false })).toBe(false)
    expect(isSponsoredEstimate(1000000n, { ...base, outputAmount: '994005', sponsored: true })).toBe(true)
  })

  test('scales amounts by decimals before comparing', () => {
    const estimate = { destinationChainId: 42161, outputToken: '0xout', outputTokenSymbol: 'USDT0', bridge: 'oft', outputAmount: '1000000', relayerBotFee: '10', bridgeProtocolFee: '0' }

    expect(isSponsoredEstimate(10n ** 18n, estimate, { inputDecimals: 18, outputDecimals: 6 })).toBe(true)
    expect(isSponsoredEstimate(10n ** 18n, { ...estimate, outputAmount: '999999' }, { inputDecimals: 18, outputDecimals: 6 })).toBe(false)
    expect(isSponsoredEstimate(10n ** 18n, estimate)).toBe(false)
  })

  test('treats a fee-free same-chain estimate as not sponsored', () => {
    const free = { destinationChainId: 42161, outputToken: '0xout', outputTokenSymbol: 'USDC', bridge: 'same_chain', outputAmount: '1000000', relayerBotFee: '0', bridgeProtocolFee: '0' }

    expect(isSponsoredEstimate(1000000n, free)).toBe(false)
  })
})

describe('toSdaTransferStatus', () => {
  test.each([
    [{ status: 'delivered' }, 'completed'],
    [{ status: 'pending' }, 'processing'],
    [{ status: 'unknown' }, 'processing'],
    [{ status: 'failed', failureReason: 'refunded' }, 'refunded'],
    [{ status: 'failed', failureReason: 'expired' }, 'expired'],
    [{ status: 'failed', failureReason: 'reverted' }, 'failed'],
    [{ status: 'failed' }, 'failed']
  ])('maps %o to %s', (forward, expected) => {
    expect(toSdaTransferStatus(forward)).toBe(expected)
  })
})

describe('toSdaTransfer', () => {
  test('keeps the forward id, status and the documented pass-through fields', () => {
    const forward = {
      forwardId: 'abc', route: 'across', status: 'delivered', recipient: '0xr', sourceChainId: 1, sourceTxHash: '0xtx',
      sourceAddresses: [{ address: '0xa', amount: '1' }], destinationChainId: 10, destinationTxHash: '0xdtx',
      proxyAddress: '0xp', sourceBlockTimestamp: 123, depositId: 42, providerSubStatus: 'filled'
    }

    const transfer = toSdaTransfer(forward)

    expect(transfer).toEqual({
      id: 'abc', status: 'completed', providerStatus: 'delivered', route: 'across', recipient: '0xr', sourceChainId: 1, sourceTxHash: '0xtx',
      sourceAddresses: [{ address: '0xa', amount: '1' }], destinationChainId: 10, destinationTxHash: '0xdtx', proxyAddress: '0xp', sourceBlockTimestamp: 123
    })
  })

  test('omits fields the API did not return', () => {
    const transfer = toSdaTransfer({ forwardId: 'x', status: 'pending', recipient: '0xr', sourceChainId: 1, sourceTxHash: '0xtx' })
    expect(Object.keys(transfer).sort()).toEqual(['id', 'providerStatus', 'recipient', 'sourceChainId', 'sourceTxHash', 'status'])
  })
})
