// Copyright 2026 Candide Labs
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaToken} SdaToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoute} SdaRoute */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositQuote} SdaDepositQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfer} SdaTransfer */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransferStatus} SdaTransferStatus */

/**
 * A token as returned by `forwarding_getRoutes`.
 *
 * @typedef {Object} CandideRouteToken
 * @property {string} address - The token address on the source chain (lowercase).
 * @property {string} symbol - The token symbol.
 * @property {number} decimals - The token decimals on the source chain.
 * @property {string} destinationAddress - The token address on the destination chain (lowercase).
 * @property {number} feeBps - The Candide service fee in basis points.
 */

/**
 * A route as returned by `forwarding_getRoutes`.
 *
 * @typedef {Object} CandideRoute
 * @property {number} sourceChainId - The source chain id.
 * @property {string} sourceChainName - The source chain name.
 * @property {number} destinationChainId - The destination chain id.
 * @property {string} destinationChainName - The destination chain name.
 * @property {CandideRouteToken[]} tokens - The tokens accepted on this route.
 */

/**
 * An SDA token enriched with the Candide route fields.
 *
 * @typedef {SdaToken & { destinationAddress: string, feeBps: number }} CandideSdaToken
 */

/**
 * A forward (one processed deposit) as returned by the `forwarding_getForwards*` methods. Fields without a value are
 * omitted by the API.
 *
 * @typedef {Object} CandideForward
 * @property {string} forwardId - The opaque forward id (UUID).
 * @property {'pending' | 'delivered' | 'failed' | 'unknown'} status - The Candide status.
 * @property {'across' | 'layerzero' | 'cctp' | 'same_chain'} [route] - The bridge used.
 * @property {string} recipient - The recipient on the destination chain.
 * @property {number} sourceChainId - The source chain id.
 * @property {string} sourceTxHash - The source transaction hash.
 * @property {Array<{ address: string, amount: string }> | null} [sourceAddresses] - Depositors that funded this forward
 *   (`address` may be the literal `"redacted"` for dust entries).
 * @property {number} [destinationChainId] - The destination chain id.
 * @property {string} [destinationTxHash] - The delivery transaction hash on the destination chain.
 * @property {string} [proxyAddress] - The forwarding address that received the deposit.
 * @property {number} [sourceBlockTimestamp] - Unix timestamp of the source block.
 * @property {'refunded' | 'expired' | 'reverted'} [failureReason] - Why the forward failed.
 * @property {string} [refundTxHash] - The refund transaction hash (Across only).
 * @property {string} [providerSubStatus] - Raw upstream provider status, for debugging.
 * @property {number} [depositId] - Across deposit id.
 * @property {string} [guid] - LayerZero message GUID.
 */

/**
 * An SDA transfer enriched with the Candide forward fields.
 *
 * @typedef {SdaTransfer & {
 *   providerStatus: CandideForward['status'],
 *   route?: CandideForward['route'],
 *   recipient: string,
 *   sourceChainId: number,
 *   sourceTxHash: string,
 *   sourceAddresses?: CandideForward['sourceAddresses'],
 *   destinationChainId?: number,
 *   destinationTxHash?: string,
 *   proxyAddress?: string,
 *   sourceBlockTimestamp?: number,
 *   failureReason?: CandideForward['failureReason'],
 *   refundTxHash?: string
 * }} CandideTransfer
 */

/**
 * Maps a route token into an SDA token. The token identifier used in SDA calls is the source-chain contract address.
 *
 * @param {CandideRouteToken} token - The route token.
 * @param {number} chainId - The source chain id.
 * @returns {CandideSdaToken} The SDA token.
 */
export function toSdaToken (token, chainId) {
  return {
    token: token.address,
    chain: chainId,
    symbol: token.symbol,
    decimals: token.decimals,
    address: token.address,
    destinationAddress: token.destinationAddress,
    feeBps: token.feeBps
  }
}

/**
 * Maps a Candide route into an SDA route. `outputAsset` is left unset because every input token is delivered as its
 * own equivalent on the destination chain.
 *
 * @param {CandideRoute} route - The Candide route.
 * @returns {SdaRoute} The SDA route.
 */
export function toSdaRoute (route) {
  return {
    sourceChains: [route.sourceChainId],
    inputTokens: route.tokens.map((token) => toSdaToken(token, route.sourceChainId)),
    destinationChain: route.destinationChainId,
    reusable: true
  }
}

/**
 * The result of `forwarding_estimateOutput`.
 *
 * @typedef {Object} CandideEstimate
 * @property {number} destinationChainId - The destination chain id.
 * @property {string} outputToken - The delivered token address on the destination chain.
 * @property {string} outputTokenSymbol - The delivered token symbol.
 * @property {string} bridge - The bridge selected for this deposit.
 * @property {string} outputAmount - The delivered amount, in the output token's base unit.
 * @property {string} relayerBotFee - The Candide relayer fee, in the input token's base unit.
 * @property {string} bridgeProtocolFee - The bridge protocol fee, in the input token's base unit.
 * @property {boolean} [sponsored] - Whether the fees are paid by the sponsoring policy, when the API reports it.
 */

/**
 * An SDA quote enriched with the Candide estimate fields.
 *
 * @typedef {SdaDepositQuote & { bridge: string, outputAssetSymbol: string, sponsored: boolean }} CandideDepositQuote
 */

/**
 * Whether the fees of an estimate are paid by a sponsoring policy rather than deducted from the deposit. Uses the
 * API's `sponsored` flag when present; otherwise a sponsored estimate is recognised by delivering the full input while
 * still reporting fees.
 *
 * @param {bigint} inputAmount - The deposited amount, in the input token's base unit.
 * @param {CandideEstimate} estimate - The estimate returned by the API.
 * @returns {boolean} True if the fees are sponsored.
 */
export function isSponsoredEstimate (inputAmount, estimate) {
  if (typeof estimate.sponsored === 'boolean') return estimate.sponsored
  const outputAmount = BigInt(estimate.outputAmount)
  const fees = BigInt(estimate.relayerBotFee) + BigInt(estimate.bridgeProtocolFee)
  return fees > 0n && outputAmount === inputAmount
}

/**
 * Maps an estimate into an SDA quote.
 *
 * @param {{ sourceChainId: number, inputToken: string, inputAmount: bigint }} input - The normalized quote input.
 * @param {CandideEstimate} estimate - The estimate returned by the API.
 * @returns {CandideDepositQuote} The SDA quote.
 */
export function toSdaQuote (input, estimate) {
  const sponsored = isSponsoredEstimate(input.inputAmount, estimate)
  return {
    inputChain: input.sourceChainId,
    inputToken: input.inputToken,
    inputAmount: input.inputAmount,
    destinationChain: estimate.destinationChainId,
    outputAsset: estimate.outputToken,
    outputAmount: BigInt(estimate.outputAmount),
    fees: [
      {
        type: 'protocol',
        amount: BigInt(estimate.relayerBotFee),
        token: input.inputToken,
        chain: input.sourceChainId,
        included: !sponsored,
        description: sponsored ? 'Candide relayer fee (paid by the sponsoring policy)' : 'Candide relayer fee'
      },
      {
        type: 'network',
        amount: BigInt(estimate.bridgeProtocolFee),
        token: input.inputToken,
        chain: input.sourceChainId,
        included: !sponsored,
        description: sponsored ? `Bridge protocol fee (${estimate.bridge}, paid by the sponsoring policy)` : `Bridge protocol fee (${estimate.bridge})`
      }
    ],
    bridge: estimate.bridge,
    outputAssetSymbol: estimate.outputTokenSymbol,
    sponsored
  }
}

/**
 * Maps a Candide forward status into an SDA transfer status. Candide only records a forward once a deposit has been
 * detected, so its `pending` corresponds to the SDA `processing` state.
 *
 * @param {CandideForward} forward - The forward.
 * @returns {SdaTransferStatus} The SDA status.
 */
export function toSdaTransferStatus (forward) {
  switch (forward.status) {
    case 'delivered':
      return 'completed'
    case 'failed':
      if (forward.failureReason === 'refunded') return 'refunded'
      if (forward.failureReason === 'expired') return 'expired'
      return 'failed'
    default:
      return 'processing'
  }
}

const FORWARD_PASSTHROUGH_FIELDS = [
  'route', 'recipient', 'sourceChainId', 'sourceTxHash', 'sourceAddresses', 'destinationChainId',
  'destinationTxHash', 'proxyAddress', 'sourceBlockTimestamp', 'failureReason', 'refundTxHash'
]

/**
 * Maps a Candide forward into an SDA transfer.
 *
 * @param {CandideForward} forward - The forward.
 * @returns {CandideTransfer} The SDA transfer.
 */
export function toSdaTransfer (forward) {
  const transfer = { id: forward.forwardId, status: toSdaTransferStatus(forward), providerStatus: forward.status }
  for (const field of FORWARD_PASSTHROUGH_FIELDS) {
    if (forward[field] !== undefined) transfer[field] = forward[field]
  }
  return transfer
}
