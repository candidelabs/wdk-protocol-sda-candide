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

import { CandideForwardingError, CandideForwardingErrorReason } from './errors.js'

/** @typedef {import('./rpc-client.js').default} CandideRpcClient */

/**
 * The inputs shared by every forwarding address derivation.
 *
 * @typedef {Object} CandideDeployParams
 * @property {string} factory - The `ForwardingAddressFactory` address.
 * @property {string} singleton - The delegate target baked into every proxy. In production this is the
 *   `ForwardingAddressBeacon`, so implementation upgrades do not change derived addresses.
 * @property {string} proxyCreationCode - The `ForwardingAddressProxy` creation bytecode.
 * @property {string} allowedRelayer - The relayer address allowed to trigger forwarding. Operational, not
 *   security-critical: the relayer can only forward funds to the recipient.
 * @property {string} [version] - A deployment version identifier, when the API provides one.
 */

/**
 * The deployment this SDK release was built against. Identical on every supported chain (deployed through the
 * Arachnid CREATE2 deployer). A change to any of these values changes every newly derived address and therefore
 * requires an SDK release; implementation upgrades behind the beacon do not.
 *
 * @type {Readonly<Omit<CandideDeployParams, 'allowedRelayer' | 'version'>>}
 */
export const PINNED_DEPLOY_PARAMS = Object.freeze({
  factory: '0x8e1C8d8C2e538ACc52202aD50a98a3FB0427156A',
  singleton: '0x9fd12e8972F23b7842cF2e137746F1f8103BA2e7',
  proxyCreationCode: '0x608060405234610116576101cd803803806100198161011a565b928339810190604081830312610116578051906001600160a01b03821690818303610116576020810151906001600160401b03821161011657019083601f8301121561011657815161007261006d82610153565b61011a565b9281845260208401956020838301011161011657815f926020809301885e840101528015610107575f80546001600160a01b03191691909117905551806100c2575b604051605e908161016f8239f35b5f9283925af43d15610102573d6100db61006d82610153565b9081525f60203d92013e5b156100f3575f80806100b4565b630337323560e31b5f5260045ffd5b6100e6565b634314d62560e01b5f5260045ffd5b5f80fd5b6040519190601f01601f191682016001600160401b0381118382101761013f57604052565b634e487b7160e01b5f52604160045260245ffd5b6001600160401b03811161013f57601f01601f19166020019056fe608060405236156026575f808054368280378136915af43d5f803e156022573d5ff35b3d5ffd5b00fea264697066735822122055a0ffde716d1fde3147aae594f53ca0de181ab81897f0bf2223bc211146b57164736f6c634300081c0033'
})

const PINNED_FIELDS = ['factory', 'singleton', 'proxyCreationCode']

/**
 * Resolves the deploy params used for client-side derivation: the pinned factory/beacon/creation code plus the
 * relayer reported by the API, verified against each other.
 */
export default class DeployParamsResolver {
  /**
   * Creates a new resolver.
   *
   * @param {Object} options - The resolver options.
   * @param {CandideRpcClient} options.rpc - The RPC client.
   * @param {Partial<CandideDeployParams>} [options.overrides] - Caller-supplied values that replace the pins. A field
   *   that is overridden is not checked against the API. Overriding `allowedRelayer` disables the API call entirely.
   * @param {number} [options.ttlMs] - How long a fetched relayer is cached, in milliseconds. Defaults to 10 minutes.
   * @param {Omit<CandideDeployParams, 'allowedRelayer' | 'version'>} [options.pinned] - The pinned values; defaults
   *   to {@link PINNED_DEPLOY_PARAMS}.
   */
  constructor ({ rpc, overrides = {}, ttlMs = 10 * 60 * 1000, pinned = PINNED_DEPLOY_PARAMS }) {
    /** @private */
    this._rpc = rpc
    /** @private */
    this._overrides = overrides
    /** @private */
    this._ttlMs = ttlMs
    /** @private */
    this._pinned = pinned
    /** @private @type {{ fetchedAt: number, params: CandideDeployParams } | undefined} */
    this._cache = undefined
  }

  /**
   * Returns the deploy params, fetching the relayer from the API when needed.
   *
   * @returns {Promise<CandideDeployParams>} The resolved deploy params.
   * @throws {CandideForwardingError} If the API reports a factory, beacon or creation code different from the pins.
   */
  async resolve () {
    const base = { ...this._pinned, ...this._overrides }
    if (base.allowedRelayer) return base

    const now = Date.now()
    if (this._cache && now - this._cache.fetchedAt < this._ttlMs) return this._cache.params

    const server = await this._rpc.call('forwarding_getDeployParams', {})

    for (const field of PINNED_FIELDS) {
      if (this._overrides[field] !== undefined) continue
      if (typeof server[field] !== 'string' || server[field].toLowerCase() !== base[field].toLowerCase()) {
        throw new CandideForwardingError(
          `The Candide deployment changed: the API reports ${field} '${server[field]}' but this SDK pins '${base[field]}'. ` +
          'Upgrade the SDK, or pass the verified value in \'deployParams\'.',
          { reason: CandideForwardingErrorReason.DEPLOYMENT_CHANGED }
        )
      }
    }

    const params = { ...base, allowedRelayer: server.allowedRelayer }
    if (server.version !== undefined) params.version = server.version

    this._cache = { fetchedAt: now, params }
    return params
  }

  /**
   * Drops the cached relayer so the next {@link DeployParamsResolver#resolve} call hits the API again.
   */
  invalidate () {
    this._cache = undefined
  }
}
