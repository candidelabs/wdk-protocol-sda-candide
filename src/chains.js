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

import { ValueError } from '@tetherto/wdk-wallet/protocols'

/** @typedef {import('@tetherto/wdk-wallet/protocols').Blockchain} Blockchain */

/**
 * Chain-name aliases accepted wherever a {@link Blockchain} is expected. Mirrors the names the Candide API returns in
 * `forwarding_getRoutes`. Numeric chain ids are always accepted; these aliases are a convenience only, the API is the
 * source of truth for which chains are actually supported.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const CHAIN_IDS = Object.freeze({
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  unichain: 130,
  polygon: 137,
  monad: 143,
  zksync: 324,
  worldchain: 480,
  hyperliquid: 988,
  hyperevm: 999,
  conflux: 1030,
  lisk: 1135,
  soneium: 1868,
  tempo: 4217,
  cod3x: 4326,
  base: 8453,
  plasma: 9745,
  mode: 34443,
  arbitrum: 42161,
  celo: 42220,
  avalanche: 43114,
  ink: 57073,
  linea: 59144,
  blast: 81457,
  scroll: 534352,
  zora: 7777777
})

/**
 * Normalizes a blockchain identifier to a numeric chain id.
 *
 * @param {Blockchain} chain - A numeric chain id, a numeric string, or a chain name from {@link CHAIN_IDS}.
 * @returns {number} The chain id.
 * @throws {ValueError} If the identifier is not a positive integer or a known chain name.
 */
export function toChainId (chain) {
  if (typeof chain === 'number') {
    if (Number.isInteger(chain) && chain > 0) return chain
    throw new ValueError(`Invalid chain id: ${chain}`)
  }
  if (typeof chain === 'string') {
    if (/^\d+$/.test(chain)) return toChainId(Number(chain))
    const id = CHAIN_IDS[chain.toLowerCase()]
    if (id !== undefined) return id
  }
  throw new ValueError(`Unknown chain: ${String(chain)}`)
}
