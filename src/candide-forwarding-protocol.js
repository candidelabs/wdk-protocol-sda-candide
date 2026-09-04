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

import { NoSuchElementError, SdaProtocol, UnsupportedOperationError, ValueError } from '@tetherto/wdk-wallet/protocols'

import { toChainId } from './chains.js'
import { ZERO_SALT, computeProxyAddress, isAddress, isBytes32 } from './create2.js'
import DeployParamsResolver from './deploy-params.js'
import { CandideForwardingError, CandideForwardingErrorReason } from './errors.js'
import { toSdaQuote, toSdaRoute, toSdaToken, toSdaTransfer } from './mappers.js'
import CandideRpcClient from './rpc-client.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

/** @typedef {import('@tetherto/wdk-wallet/protocols').Blockchain} Blockchain */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoutesOptions} SdaRoutesOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoute} SdaRoute */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositOptions} SdaDepositOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaCreateDepositAddressOptions} SdaCreateDepositAddressOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositAddress} SdaDepositAddress */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfersOptions} SdaTransfersOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRecoveryOptions} SdaRecoveryOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRecoveryResult} SdaRecoveryResult */

/** @typedef {import('./deploy-params.js').CandideDeployParams} CandideDeployParams */
/** @typedef {import('./mappers.js').CandideRoute} CandideRoute */
/** @typedef {import('./mappers.js').CandideSdaToken} CandideSdaToken */
/** @typedef {import('./mappers.js').CandideDepositQuote} CandideDepositQuote */
/** @typedef {import('./mappers.js').CandideForward} CandideForward */
/** @typedef {import('./mappers.js').CandideTransfer} CandideTransfer */

/**
 * @typedef {Object} CandideForwardingProtocolConfig
 * @property {string} apiUrl - The Forwarding Address API URL exactly as shown in the Candide dashboard. It carries the
 *   team API key; the SDK never parses it.
 * @property {string} [policySecret] - The secret of the forwarding policy (dashboard, shown once at generation). Sent as
 *   the bearer token; addresses activated with it are sponsored under that policy. Required only for
 *   `createDepositAddress`, `renewDepositAddress` and `recoverDepositAddress`; every other method is public. Keep it
 *   server-side.
 * @property {string} [custodialWithdrawer] - The company-controlled wallet allowed to withdraw stuck funds after a
 *   timelock, used for every address unless overridden per call. Strongly recommended: without it, funds sent from an
 *   exchange or any wallet the recipient does not control on the source chain cannot be recovered. Defaults to the
 *   recipient.
 * @property {boolean} [verifyAddresses] - Whether `createDepositAddress` derives the address client-side and compares
 *   it with the address returned by the API. Defaults to `true`.
 * @property {Partial<CandideDeployParams>} [deployParams] - Overrides for the pinned derivation inputs. Only needed
 *   after a Candide redeployment that this SDK release does not know about. Pinning `allowedRelayer` too makes
 *   derivation fully offline.
 * @property {number} [deployParamsTtlMs] - How long the relayer fetched from the API is cached, in milliseconds.
 *   Defaults to 10 minutes.
 * @property {number} [routesCacheTtlMs] - How long `forwarding_getRoutes` results are cached per source chain, in
 *   milliseconds. Defaults to 10 minutes.
 */

/**
 * Candide-specific options for creating or deriving a deposit address.
 *
 * @typedef {SdaCreateDepositAddressOptions & {
 *   custodialWithdrawer?: string,
 *   salt?: string
 * }} CandideCreateDepositAddressOptions
 */

/**
 * Candide-specific quote options.
 *
 * @typedef {SdaDepositOptions & {
 *   depositAddress?: string
 * }} CandideDepositOptions
 */

/**
 * A deposit address descriptor enriched with the Candide derivation inputs.
 *
 * @typedef {SdaDepositAddress & {
 *   supportedInputTokens: CandideSdaToken[],
 *   custodialWithdrawer: string,
 *   salt: string
 * }} CandideDepositAddress
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000
const FORWARDS_PAGE_SIZE = 100

/**
 * Candide's Forwarding Address as a WDK Smart Deposit Address protocol.
 *
 * One deterministic CREATE2 address per (recipient, custodial withdrawer, destination chain, salt) accepts deposits
 * on every supported EVM source chain, including the destination chain itself, and forwards each token as its own
 * equivalent to the recipient. Addresses are reusable; monitoring is time-limited and refreshed with
 * {@link CandideForwardingProtocol#renewDepositAddress}.
 */
export default class CandideForwardingProtocol extends SdaProtocol {
  /**
   * Creates a new Candide forwarding protocol without binding it to a wallet account.
   *
   * @overload
   * @param {undefined} [account] - The wallet account to use to interact with the protocol.
   * @param {CandideForwardingProtocolConfig} config - The protocol configuration.
   */

  /**
   * Creates a new read-only Candide forwarding protocol.
   *
   * @overload
   * @param {IWalletAccountReadOnly} account - The wallet account to use to interact with the protocol.
   * @param {CandideForwardingProtocolConfig} config - The protocol configuration.
   */

  /**
   * Creates a new Candide forwarding protocol.
   *
   * @overload
   * @param {IWalletAccount} account - The wallet account to use to interact with the protocol.
   * @param {CandideForwardingProtocolConfig} config - The protocol configuration.
   */
  constructor (account, config = {}) {
    super(account)

    if (config.custodialWithdrawer !== undefined && !isAddress(config.custodialWithdrawer)) {
      throw new ValueError(`Invalid custodialWithdrawer address: ${config.custodialWithdrawer}`)
    }

    /**
     * The protocol configuration.
     *
     * @protected
     * @type {CandideForwardingProtocolConfig}
     */
    this._config = config

    /** @private */
    this._rpc = new CandideRpcClient({ url: config.apiUrl, policySecret: config.policySecret })
    /** @private */
    this._deployParams = new DeployParamsResolver({
      rpc: this._rpc,
      overrides: config.deployParams ?? {},
      ttlMs: config.deployParamsTtlMs ?? DEFAULT_TTL_MS
    })
    /** @private */
    this._verifyAddresses = config.verifyAddresses ?? true
    /** @private */
    this._routesCacheTtlMs = config.routesCacheTtlMs ?? DEFAULT_TTL_MS
    /** @private @type {Map<number, { fetchedAt: number, routes: CandideRoute[] }>} */
    this._routesCache = new Map()
  }

  // ── Candide-specific ──────────────────────────────────────────────────────

  /**
   * Returns the derivation inputs currently in use (pinned factory, beacon and creation code, plus the relayer
   * reported by the API).
   *
   * @returns {Promise<CandideDeployParams>} The deploy params.
   * @throws {CandideForwardingError} If the API reports a deployment different from the one pinned in this SDK.
   */
  async getDeployParams () {
    return await this._deployParams.resolve()
  }

  // ── Required core ─────────────────────────────────────────────────────────

  /**
   * Lists the routes available from a source chain. Candide discovers routes per source chain, so `sourceChain` is
   * required. When `sourceToken` is given, per-route minimum deposit limits are included.
   *
   * @param {SdaRoutesOptions} [options] - Route filters.
   * @returns {Promise<SdaRoute[]>} The supported routes, one per (source chain, destination chain) pair.
   * @throws {ValueError} If `sourceChain` is not set.
   * @throws {ProviderError} If the API call fails.
   */
  async getSupportedRoutes (options = {}) {
    if (options.sourceChain === undefined) {
      throw new ValueError('Candide discovers routes per source chain: the \'sourceChain\' option is required.')
    }
    const sourceChainId = toChainId(options.sourceChain)
    const destinationChainId = options.destinationChain === undefined ? undefined : toChainId(options.destinationChain)
    const sourceToken = options.sourceToken?.toLowerCase()

    let routes = (await this._routes(sourceChainId)).map(toSdaRoute)

    if (destinationChainId !== undefined) {
      routes = routes.filter((route) => route.destinationChain === destinationChainId)
    }
    if (sourceToken !== undefined) {
      routes = routes
        .map((route) => ({ ...route, inputTokens: route.inputTokens.filter((token) => token.token === sourceToken) }))
        .filter((route) => route.inputTokens.length > 0)

      await Promise.all(routes.map(async (route) => {
        const min = await this._minimumAmount(sourceChainId, route.destinationChain, sourceToken)
        if (min !== undefined) route.limits = { min }
      }))
    }

    return routes
  }

  /**
   * Creates and activates a forwarding address. One address covers every requested source chain; the destination
   * chain is always monitored too, so same-chain deposits are forwarded as well.
   *
   * @param {CandideCreateDepositAddressOptions} options - The address creation options.
   * @returns {Promise<CandideDepositAddress[]>} A one-element array with the created address descriptor.
   * @throws {ValueError} If the options are not valid, or `destinationAddress` is omitted and no account is bound,
   *   or no API key was configured.
   * @throws {CandideForwardingError} If verification is enabled and the API returned an address different from the
   *   one derived client-side, or the Candide deployment changed.
   * @throws {ProviderError} If the API call fails.
   */
  async createDepositAddress (options) {
    const input = await this._normalizeCreateOptions(options)

    let derived
    if (this._verifyAddresses) derived = await this._derive(input)

    const activation = await this._rpc.call('account_activateForwardingAddress', {
      recipient: input.recipient,
      custodialWithdrawer: input.custodialWithdrawer,
      destinationChainId: input.destinationChainId,
      sourceChainIds: input.sourceChainIds,
      salt: input.salt
    }, { auth: true })

    const address = String(activation.address).toLowerCase()

    if (derived !== undefined && derived !== address) {
      throw new CandideForwardingError(
        `The Candide API returned address ${address} but the client-side derivation gives ${derived}. ` +
        'The API has activated its address; do not fund either address until the discrepancy is resolved.',
        { reason: CandideForwardingErrorReason.ADDRESS_MISMATCH }
      )
    }

    return [{
      address,
      id: address,
      sourceChains: input.sourceChainIds,
      supportedInputTokens: await this._inputTokensFor(input.sourceChainIds, input.destinationChainId),
      destinationChain: input.destinationChainId,
      destinationAddress: input.recipient,
      reusable: true,
      expiry: activation.expiresAt,
      custodialWithdrawer: input.custodialWithdrawer,
      salt: input.salt
    }]
  }

  // ── Optional operations ───────────────────────────────────────────────────

  /**
   * Fetches a non-binding estimate of what a deposit would deliver, after the Candide relayer fee and the bridge fee.
   * Pass `depositAddress` to quote for a specific forwarding address: when the policy that activated it sponsors
   * fees, the estimate delivers the full input and the quote's fees are marked as not included.
   *
   * @param {CandideDepositOptions} options - The quote options. `outputAsset` is ignored: each token is delivered as
   *   its own equivalent on the destination chain.
   * @returns {Promise<CandideDepositQuote>} The quote.
   * @throws {ValueError} If the options are not valid, or the amount is below the bridge minimum or above its maximum.
   * @throws {SdaError} If the route is not supported.
   * @throws {ProviderError} If the API call fails or no quote is currently available.
   */
  async quoteDeposit (options) {
    const sourceChainId = toChainId(options.sourceChain)
    const destinationChainId = toChainId(options.destinationChain)
    if (!isAddress(options.inputToken)) throw new ValueError(`Invalid inputToken address: ${options.inputToken}`)
    const inputAmount = toAmount(options.inputAmount)

    const params = { sourceChainId, destinationChainId, token: options.inputToken, amount: inputAmount.toString() }
    if (options.depositAddress !== undefined) {
      if (!isAddress(options.depositAddress)) throw new ValueError(`Invalid depositAddress: ${options.depositAddress}`)
      params.proxyAddress = options.depositAddress.toLowerCase()
    }

    const estimate = await this._rpc.call('forwarding_estimateOutput', params)

    const [inputDecimals, outputDecimals] = await Promise.all([
      this._tokenDecimals(sourceChainId, options.inputToken),
      this._tokenDecimals(destinationChainId, estimate.outputToken)
    ])

    return toSdaQuote({ sourceChainId, inputToken: options.inputToken, inputAmount, inputDecimals, outputDecimals }, estimate)
  }

  /**
   * Derives a forwarding address client-side, without activating it. Uses the factory, beacon and proxy creation code
   * pinned in this SDK and the relayer reported by the API (cached), so the only network call is the periodic relayer
   * refresh; pass `deployParams.allowedRelayer` in the configuration to make it fully offline.
   *
   * @param {CandideCreateDepositAddressOptions} options - The same options passed to `createDepositAddress`.
   * @returns {Promise<string>} The lowercase forwarding address.
   * @throws {ValueError} If the options are not valid, or `destinationAddress` is omitted and no account is bound.
   * @throws {CandideForwardingError} If the Candide deployment changed.
   */
  async deriveDepositAddress (options) {
    return await this._derive(await this._normalizeCreateOptions(options))
  }

  /**
   * Looks up an existing forwarding address by its identifier (the address itself). `sourceChains` lists every chain
   * the address has been activated on and `expiry` the soonest per-chain expiry, so a past `expiry` means at least
   * one chain needs renewing.
   *
   * @param {string} id - The forwarding address.
   * @returns {Promise<CandideDepositAddress>} The address descriptor.
   * @throws {ValueError} If the id is not an address.
   * @throws {NoSuchElementError} If the address has never been activated.
   * @throws {ProviderError} If the API call fails.
   */
  async getDepositAddress (id) {
    const address = normalizeId(id)
    const [stored, activation] = await Promise.all([
      this._rpc.call('forwarding_getDeployParamsByAddress', { address }),
      this._rpc.call('forwarding_getActivation', { address })
    ])
    return await this._describe(address, stored, activation)
  }

  /**
   * Refreshes the activation of a forwarding address on the source chains it was activated for.
   *
   * @param {string} id - The forwarding address.
   * @returns {Promise<CandideDepositAddress>} The refreshed address descriptor.
   * @throws {ValueError} If the id is not an address, or no policy secret was configured.
   * @throws {NoSuchElementError} If the address has never been activated.
   * @throws {CandideForwardingError} If the API re-derived a different address, or verification is enabled and the
   *   client-side derivation disagrees.
   * @throws {ProviderError} If the API call fails.
   */
  async renewDepositAddress (id) {
    const address = normalizeId(id)
    const [stored, activation] = await Promise.all([
      this._rpc.call('forwarding_getDeployParamsByAddress', { address }),
      this._rpc.call('forwarding_getActivation', { address })
    ])
    const sourceChainIds = sourceChainsOf(activation)
    if (sourceChainIds.length === 0) throw new NoSuchElementError(`No activation history for address ${address}`)

    if (this._verifyAddresses && stored.allowedRelayer !== undefined) {
      const derived = computeProxyAddress({ ...stored, allowedRelayer: stored.allowedRelayer })
      if (derived !== address) {
        throw new CandideForwardingError(
          `The stored derivation inputs for ${address} give ${derived} client-side. Refusing to renew.`,
          { reason: CandideForwardingErrorReason.ADDRESS_MISMATCH }
        )
      }
    }

    const renewed = await this._rpc.call('account_activateForwardingAddress', {
      recipient: stored.recipient,
      custodialWithdrawer: stored.custodialWithdrawer,
      destinationChainId: stored.destinationChainId,
      sourceChainIds,
      salt: stored.salt ?? ZERO_SALT
    }, { auth: true })

    if (String(renewed.address).toLowerCase() !== address) {
      throw new CandideForwardingError(
        `Renewal of ${address} activated ${renewed.address} instead.`,
        { reason: CandideForwardingErrorReason.ADDRESS_MISMATCH }
      )
    }

    const refreshed = await this._rpc.call('forwarding_getActivation', { address })
    return await this._describe(address, stored, refreshed)
  }

  /**
   * Lists the deposits forwarded from a forwarding address.
   *
   * @param {string} address - The forwarding address.
   * @param {SdaTransfersOptions} [options] - Pagination and filtering. `sourceChain` is not needed: one address covers
   *   every source chain.
   * @returns {Promise<CandideTransfer[]>} The transfers, newest first.
   * @throws {ValueError} If the address is not valid.
   * @throws {NoSuchElementError} If the address has never been activated.
   * @throws {ProviderError} If the API call fails.
   */
  async getTransfers (address, options = {}) {
    const proxyAddress = normalizeId(address)
    const stored = await this._rpc.call('forwarding_getDeployParamsByAddress', { address: proxyAddress })

    return await this._collectForwards(stored.recipient, stored.destinationChainId, options, (forward) => {
      return typeof forward.proxyAddress === 'string' && forward.proxyAddress.toLowerCase() === proxyAddress
    })
  }

  /**
   * Lists every deposit forwarded to a recipient on a destination chain, across all of its forwarding addresses.
   *
   * @param {Blockchain} destinationChain - The destination chain.
   * @param {string} recipient - The recipient address.
   * @param {SdaTransfersOptions} [options] - Pagination and filtering.
   * @returns {Promise<CandideTransfer[]>} The transfers, newest first.
   * @throws {ValueError} If the arguments are not valid.
   * @throws {ProviderError} If the API call fails.
   */
  async getTransfersByRecipient (destinationChain, recipient, options = {}) {
    const destinationChainId = toChainId(destinationChain)
    if (!isAddress(recipient)) throw new ValueError(`Invalid recipient address: ${recipient}`)

    return await this._collectForwards(recipient, destinationChainId, options)
  }

  /**
   * Retrieves a single forward by its identifier.
   *
   * @param {string} id - The forward id returned in `CandideTransfer.id`.
   * @returns {Promise<CandideTransfer>} The transfer.
   * @throws {ValueError} If the id is not valid.
   * @throws {NoSuchElementError} If no forward exists with that id.
   * @throws {ProviderError} If the API call fails.
   */
  async getTransfer (id) {
    if (typeof id !== 'string' || id.length === 0) throw new ValueError(`Invalid transfer id: ${String(id)}`)

    const { forward } = await this._rpc.call('forwarding_getForwardById', { forwardId: id })
    if (!forward) throw new NoSuchElementError(`No transfer with id ${id}`)

    return toSdaTransfer(forward)
  }

  /**
   * Recovers a forwarding address whose activation lapsed by re-activating it: any balance waiting at the address is
   * picked up by the next monitoring sweep. On-chain self-service recovery (deploying the proxy and withdrawing) is
   * available at https://forwarding-address.candidelabs.com/.
   *
   * @param {SdaRecoveryOptions} options - The address to recover, by id or by address (equivalent for this protocol).
   * @returns {Promise<SdaRecoveryResult>} The recovery outcome.
   * @throws {ValueError} If the options are not valid, or no API key was configured.
   */
  async recoverDepositAddress (options) {
    const id = 'id' in options ? options.id : options?.address
    if (id === undefined) throw new ValueError('Either \'id\' or \'address\' is required to recover a deposit address.')

    try {
      const renewed = await this.renewDepositAddress(id)
      return {
        status: 'reindexed',
        address: renewed.address,
        id: renewed.id,
        message: 'Activation refreshed; any balance waiting at the address is forwarded on the next monitoring sweep.'
      }
    } catch (error) {
      if (error instanceof NoSuchElementError) return { status: 'failed', address: normalizeId(id), message: error.message }
      throw error
    }
  }

  /**
   * Not supported: Candide activations expire on their own and there is no explicit disable.
   *
   * @param {string} id - The forwarding address.
   * @returns {Promise<void>} Never resolves.
   * @throws {UnsupportedOperationError} Always.
   */
  async disableDepositAddress (id) {
    throw new UnsupportedOperationError('disableDepositAddress(id)')
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * @private
   * @param {number} sourceChainId
   * @returns {Promise<CandideRoute[]>}
   */
  async _routes (sourceChainId) {
    const now = Date.now()
    const cached = this._routesCache.get(sourceChainId)
    if (cached && now - cached.fetchedAt < this._routesCacheTtlMs) return cached.routes

    const { routes } = await this._rpc.call('forwarding_getRoutes', { sourceChainId })
    this._routesCache.set(sourceChainId, { fetchedAt: now, routes })
    return routes
  }

  /**
   * @private
   * @param {number} sourceChainId
   * @param {number} destinationChainId
   * @param {string} token
   * @returns {Promise<bigint | undefined>} The smallest minimum across bridges, or undefined if none is reported.
   */
  async _minimumAmount (sourceChainId, destinationChainId, token) {
    const { bridges } = await this._rpc.call('forwarding_getMinimumAmount', { sourceChainId, destinationChainId, token })
    const minimums = Object.values(bridges ?? {})
      .map((bridge) => bridge?.minAmount)
      .filter((min) => min !== undefined && min !== null)
      .map((min) => BigInt(min))
    if (minimums.length === 0) return undefined
    return minimums.reduce((a, b) => (a < b ? a : b))
  }

  /**
   * Looks a token's decimals up in the cached routes of the chain it lives on.
   *
   * @private
   * @param {number} chainId
   * @param {string} tokenAddress
   * @returns {Promise<number | undefined>} The decimals, or undefined if the token is not on any route from that chain.
   */
  async _tokenDecimals (chainId, tokenAddress) {
    const wanted = String(tokenAddress).toLowerCase()
    let routes
    try {
      routes = await this._routes(chainId)
    } catch {
      return undefined
    }
    for (const route of routes) {
      const token = route.tokens.find((candidate) => String(candidate.address).toLowerCase() === wanted)
      if (token) return token.decimals
    }
    return undefined
  }

  /**
   * @private
   * @param {number[]} sourceChainIds
   * @param {number} destinationChainId
   * @returns {Promise<CandideSdaToken[]>}
   */
  async _inputTokensFor (sourceChainIds, destinationChainId) {
    const perChain = await Promise.all(sourceChainIds.map(async (sourceChainId) => {
      const routes = await this._routes(sourceChainId)
      return routes
        .filter((route) => route.destinationChainId === destinationChainId)
        .flatMap((route) => route.tokens.map((token) => toSdaToken(token, sourceChainId)))
    }))
    return perChain.flat()
  }

  /**
   * @private
   * @param {CandideCreateDepositAddressOptions} options
   * @returns {Promise<{ recipient: string, custodialWithdrawer: string, destinationChainId: number, sourceChainIds: number[], salt: string }>}
   */
  async _normalizeCreateOptions (options) {
    if (!options || typeof options !== 'object') throw new ValueError('The deposit address options are required.')
    if (!Array.isArray(options.sourceChains) || options.sourceChains.length === 0) {
      throw new ValueError('At least one source chain is required.')
    }

    const destinationChainId = toChainId(options.destinationChain)
    // The destination chain is always monitored too (same-chain forwarding), so it is part of the address's coverage.
    const sourceChainIds = [...new Set([...options.sourceChains.map(toChainId), destinationChainId])]

    const recipient = await this._destinationAddress(options)
    const custodialWithdrawer = options.custodialWithdrawer ?? this._config.custodialWithdrawer ?? recipient
    if (!isAddress(custodialWithdrawer)) throw new ValueError(`Invalid custodialWithdrawer address: ${custodialWithdrawer}`)

    const salt = options.salt ?? ZERO_SALT
    if (!isBytes32(salt)) throw new ValueError(`Invalid salt, expected a 32-byte hex value: ${salt}`)

    return { recipient, custodialWithdrawer, destinationChainId, sourceChainIds, salt }
  }

  /**
   * @private
   * @param {{ destinationAddress?: string }} options
   * @returns {Promise<string>}
   */
  async _destinationAddress (options) {
    if (options.destinationAddress !== undefined) {
      if (!isAddress(options.destinationAddress)) throw new ValueError(`Invalid destinationAddress: ${options.destinationAddress}`)
      return options.destinationAddress
    }
    if (!this._account) {
      throw new ValueError('\'destinationAddress\' is required when no wallet account is bound to the protocol.')
    }
    const address = await this._account.getAddress()
    if (!isAddress(address)) throw new ValueError(`The bound account address is not an EVM address: ${address}`)
    return address
  }

  /**
   * @private
   * @param {{ recipient: string, custodialWithdrawer: string, destinationChainId: number, salt: string }} input
   * @returns {Promise<string>}
   */
  async _derive (input) {
    const deployParams = await this._deployParams.resolve()
    return computeProxyAddress({ ...deployParams, ...input })
  }

  /**
   * @private
   * @param {string} address
   * @param {{ recipient: string, custodialWithdrawer: string, destinationChainId: number, salt?: string }} stored
   * @param {{ sourceChains: Array<{ sourceChainId: number, status: string, expiresAt?: number, expiredAt?: number }> }} activation
   * @returns {Promise<CandideDepositAddress>}
   */
  async _describe (address, stored, activation) {
    const sourceChains = sourceChainsOf(activation)
    if (sourceChains.length === 0) throw new NoSuchElementError(`No activation history for address ${address}`)

    const timestamps = activation.sourceChains
      .map((chain) => chain.expiresAt ?? chain.expiredAt)
      .filter((timestamp) => typeof timestamp === 'number')

    return {
      address,
      id: address,
      sourceChains,
      supportedInputTokens: await this._inputTokensFor(sourceChains, stored.destinationChainId),
      destinationChain: stored.destinationChainId,
      destinationAddress: stored.recipient,
      reusable: true,
      expiry: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      custodialWithdrawer: stored.custodialWithdrawer,
      salt: stored.salt ?? ZERO_SALT
    }
  }

  /**
   * Walks the cursor-paginated forwards of a recipient and applies the SDA filtering options.
   *
   * @private
   * @param {string} recipient
   * @param {number} destinationChainId
   * @param {SdaTransfersOptions} options
   * @param {(forward: CandideForward) => boolean} [predicate]
   * @returns {Promise<CandideTransfer[]>}
   */
  async _collectForwards (recipient, destinationChainId, options, predicate = () => true) {
    const skip = options.skip ?? 0
    const limit = options.limit ?? Infinity
    if (!Number.isInteger(skip) || skip < 0) throw new ValueError(`Invalid skip: ${options.skip}`)
    if (limit !== Infinity && (!Number.isInteger(limit) || limit < 0)) throw new ValueError(`Invalid limit: ${options.limit}`)

    const transfers = []
    if (limit === 0) return transfers
    let seen = 0
    let cursor

    do {
      const params = { recipient, destinationChainId, pageSize: FORWARDS_PAGE_SIZE }
      if (cursor) params.cursor = cursor
      const page = await this._rpc.call('forwarding_getForwardsByRecipient', params)

      for (const forward of page.forwards ?? []) {
        if (!predicate(forward)) continue
        const transfer = toSdaTransfer(forward)
        if (options.status !== undefined && transfer.status !== options.status) continue
        if (seen++ < skip) continue
        transfers.push(transfer)
        if (transfers.length >= limit) return transfers
      }

      cursor = page.nextCursor
    } while (cursor)

    return transfers
  }
}

/**
 * @param {string} id
 * @returns {string} The lowercase address.
 * @throws {ValueError} If the id is not an address.
 */
function normalizeId (id) {
  if (!isAddress(id)) throw new ValueError(`Invalid deposit address id, expected an EVM address: ${String(id)}`)
  return id.toLowerCase()
}

/**
 * @param {{ sourceChains?: Array<{ sourceChainId: number, status: string }> }} activation
 * @returns {number[]} Every source chain the address has activation history on, active or expired. Monitoring is
 *   tracked per source chain, so renewal must cover all of them; `expiry` tells whether any has lapsed.
 */
function sourceChainsOf (activation) {
  return [...new Set((activation?.sourceChains ?? []).map((chain) => chain.sourceChainId))]
}

/**
 * @param {number | bigint} value
 * @returns {bigint}
 * @throws {ValueError} If the value is not a positive integer amount.
 */
function toAmount (value) {
  let amount
  if (typeof value === 'bigint') amount = value
  else if (typeof value === 'number' && Number.isSafeInteger(value)) amount = BigInt(value)
  else if (typeof value === 'string' && /^\d+$/.test(value)) amount = BigInt(value)
  else throw new ValueError(`Invalid inputAmount, expected an integer in the token's base unit: ${String(value)}`)
  if (amount <= 0n) throw new ValueError('inputAmount must be greater than zero.')
  return amount
}
